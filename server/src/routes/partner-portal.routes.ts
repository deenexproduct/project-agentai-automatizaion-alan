import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { MarcaBuscada, normalizarNombre } from '../models/marca-buscada.model';
import { Partner } from '../models/partner.model';
import { Deal } from '../models/deal.model';
import { PipelineConfig } from '../models/pipeline-config.model';

/**
 * Portal del partner: se monta SIN authMiddleware y NO se aplica auth a sí
 * mismo. El token de la URL es la credencial y define TODO el alcance.
 *
 * Este router no debe llamar nunca a `router.use(authMiddleware)`: es
 * exactamente el error que tiene `ops.routes.ts` (la ruta declarada como
 * "public, no auth required" está debajo del auth de la línea 28 y devuelve
 * 401 en producción, así que esa feature nunca funcionó).
 */
const router = Router();

/** Resuelve el partner del token, o null. Un token revocado se trata igual que uno inexistente. */
async function partnerDelToken(token: string) {
    if (!token) return null;
    return Partner.findOne({ accessToken: token, accessTokenActivo: true });
}

/** Sólo estos campos de la mano salen al portal. `partnerId` no se expone. */
const manoPublica = (m: any) => ({
    partnerNombre: m.partnerNombre,
    comentario: m.comentario,
    levantadaEn: m.levantadaEn,
    estado: m.estado,
});

router.get('/:token', async (req: Request, res: Response) => {
    try {
        const partner = await partnerDelToken(req.params.token);
        // Mismo 404 para inexistente y revocado: no confirmamos que un token
        // haya sido válido alguna vez.
        if (!partner) return res.status(404).json({ error: 'No encontrado' });

        const marcas = await MarcaBuscada.find({
            // Las ascendidas siguen visibles para quien puso la mano: es la
            // única forma de que el partner sepa qué pasó con la marca que
            // trajo. Las archivadas no vuelven nunca.
            $and: [{
                $or: [
                    { estado: { $in: ['buscando', 'con_manos'] } },
                    { estado: 'ascendida', 'manos.partnerId': partner._id },
                    // Y las empresas del pipeline que le marcamos explícitamente:
                    // es el caso de "compartir un deal" desde el CRM.
                    { estado: 'ascendida', partners: partner._id },
                ],
            }],
            $or: [
                // Las de quien cargó al partner, salvo que estén dirigidas a
                // otros. Sin `partners` (o con la lista vacía) son para todos;
                // las cargadas antes de existir el campo ni siquiera lo tienen.
                {
                    userId: partner.userId,
                    $or: [
                        { partners: { $exists: false } },
                        { partners: { $size: 0 } },
                        { partners: partner._id },
                    ],
                },
                // Y las que le dirigieron explícitamente, sin importar quién las
                // cargó: a los partners los dio de alta cada uno el que lo trajo,
                // así que sin esta rama asignarle una marca a Juani no le mostraba
                // nada — lo peor de los dos mundos.
                { partners: partner._id },
            ],
        }).sort({ createdAt: -1 }).lean();

        await Partner.updateOne({ _id: partner._id }, { $set: { ultimoAccesoEn: new Date() } });

        // Para las que ya ascendieron, la etapa real del pipeline: es lo que
        // le dice al partner si la marca que trajo avanzó o está frenada.
        const idsEmpresa = marcas.filter(m => m.companyId).map(m => m.companyId);
        const [deals, config] = await Promise.all([
            idsEmpresa.length ? Deal.find({ company: { $in: idsEmpresa } }, { company: 1, status: 1 }).lean() : [],
            PipelineConfig.getOrCreate(String(partner.userId)),
        ]);
        const etapaDeEmpresa = new Map<string, string>(
            deals.map((d: any) => [String(d.company), String(d.status)] as [string, string]));
        const etiquetaDeEtapa = new Map<string, string>(
            (config?.stages || []).map((e: any) => [String(e.key), String(e.label)] as [string, string]));

        const situacionDe = (m: any) => {
            if (m.estado !== 'ascendida') {
                return { tipo: 'buscando', etiqueta: 'Buscando llegada' };
            }
            const etapa = etapaDeEmpresa.get(String(m.companyId));
            return {
                tipo: 'en_pipeline',
                // Sin deal (o con una etapa que ya no está en la configuración)
                // igual decimos algo: el partner tiene que ver que avanzó.
                etiqueta: (etapa && etiquetaDeEtapa.get(etapa)) || 'En el pipeline',
            };
        };

        res.json({
            partner: { nombre: partner.name },
            marcas: marcas.map((m: any) => ({
                _id: m._id,
                nombre: m.nombre,
                porQue: m.porQue,
                categoria: m.categoria,
                situacion: situacionDe(m),
                manos: (m.manos || []).filter((x: any) => x.estado !== 'descartada').map(manoPublica),
            })),
        });
    } catch (err: any) {
        console.error('portal get error:', err.message);
        res.status(500).json({ error: 'No se pudo cargar el tablero' });
    }
});

router.post('/:token/marcas/:id/mano', async (req: Request, res: Response) => {
    try {
        const partner = await partnerDelToken(req.params.token);
        if (!partner) return res.status(404).json({ error: 'No encontrado' });

        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ error: 'No encontrado' });
        }

        // El userId sale del PARTNER, nunca del request: sin esto, un token
        // podría levantar la mano en la marca de cualquier otro usuario con
        // sólo conocer su ObjectId.
        const marca = await MarcaBuscada.findOne({
            _id: req.params.id,
            userId: partner.userId,
            $or: [
                { estado: { $in: ['buscando', 'con_manos'] } },
                // También sobre un deal del pipeline que le compartimos: si lo
                // ve en su portal tiene que poder ofrecerse, si no el botón
                // está de adorno.
                { estado: 'ascendida', partners: partner._id },
            ],
        });
        if (!marca) return res.status(404).json({ error: 'No encontrado' });

        const comentario = typeof req.body?.comentario === 'string' ? req.body.comentario.trim() : '';
        const yaLevantada = marca.manos.find(
            (m) => String(m.partnerId) === String(partner._id) && m.estado !== 'descartada'
        );

        if (yaLevantada) {
            yaLevantada.comentario = comentario;
        } else {
            marca.manos.push({
                partnerId: partner._id as any,
                partnerNombre: partner.name,
                comentario,
                levantadaEn: new Date(),
                estado: 'ofrecida',
            } as any);
        }

        if (marca.estado === 'buscando') marca.estado = 'con_manos';
        await marca.save();

        res.json({ ok: true });
    } catch (err: any) {
        console.error('portal mano error:', err.message);
        res.status(500).json({ error: 'No se pudo registrar' });
    }
});

/**
 * POST /:token/marcas — el partner propone una marca que él tiene.
 *
 * Si ya la teníamos cargada NO se duplica: la propuesta se convierte en una
 * mano levantada sobre la que existe. El partner no puede saber qué tenemos en
 * la lista, así que hacerlo fallar por repetida sería castigarlo por adivinar.
 */
router.post('/:token/marcas', async (req: Request, res: Response) => {
    try {
        const partner = await partnerDelToken(req.params.token);
        if (!partner) return res.status(404).json({ error: 'No encontrado' });

        const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : '';
        if (!nombre) return res.status(400).json({ error: 'Falta el nombre de la marca' });

        const comentario = typeof req.body?.porQue === 'string' ? req.body.porQue.trim() : '';
        const manoDelPartner = {
            partnerId: partner._id as any,
            partnerNombre: partner.name,
            comentario,
            levantadaEn: new Date(),
            estado: 'ofrecida' as const,
        };

        // El userId sale del PARTNER, nunca del request.
        const yaExiste = await MarcaBuscada.findOne({
            userId: partner.userId,
            nombreNormalizado: normalizarNombre(nombre),
        });

        if (yaExiste) {
            const yaLevantada = yaExiste.manos.find(
                (m) => String(m.partnerId) === String(partner._id) && m.estado !== 'descartada'
            );
            if (yaLevantada) {
                yaLevantada.comentario = comentario;
            } else {
                yaExiste.manos.push(manoDelPartner as any);
                if (yaExiste.estado === 'buscando') yaExiste.estado = 'con_manos';
            }
            await yaExiste.save();
            return res.json({ _id: yaExiste._id, yaExistia: true });
        }

        const marca = await MarcaBuscada.create({
            nombre,
            nombreNormalizado: normalizarNombre(nombre),
            porQue: comentario || undefined,
            estado: 'con_manos',
            origen: 'partner',
            propuestaPor: partner._id,
            userId: partner.userId,
            manos: [manoDelPartner],
        });

        res.status(201).json({ _id: marca._id, yaExistia: false });
    } catch (err: any) {
        console.error('portal proponer marca error:', err.message);
        res.status(500).json({ error: 'No se pudo proponer la marca' });
    }
});

export default router;
