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


/**
 * Qué marcas puede ver Y tocar este partner. Una sola definición para el
 * listado y para las acciones: cuando estaban separadas, el partner veía en su
 * portal deals sobre los que después recibía 404 al ofrecerse.
 */
function alcanceDelPartner(partner: any) {
    return {
        $or: [
            // Las de quien lo cargó, salvo que estén dirigidas a otros.
            {
                userId: partner.userId,
                $or: [
                    { partners: { $exists: false } },
                    { partners: { $size: 0 } },
                    { partners: partner._id },
                ],
            },
            // Y las que le dirigimos explícitamente, sin importar quién las
            // cargó: a los partners los dio de alta cada uno el que lo trajo.
            { partners: partner._id },
        ],
    };
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
            $and: [
                alcanceDelPartner(partner),
                {
                    // Las ascendidas siguen visibles para quien puso la mano o
                    // para quien se las compartimos. Las archivadas no vuelven.
                    $or: [
                        { estado: { $in: ['buscando', 'con_manos'] } },
                        { estado: 'ascendida', 'manos.partnerId': partner._id },
                        { estado: 'ascendida', partners: partner._id },
                    ],
                },
            ],
        }).sort({ createdAt: -1 }).lean();

        await Partner.updateOne({ _id: partner._id }, { $set: { ultimoAccesoEn: new Date() } });

        // Para las que ya ascendieron, la etapa real del pipeline: es lo que
        // le dice al partner si la marca que trajo avanzó o está frenada.
        const idsEmpresa = marcas.filter(m => m.companyId).map(m => m.companyId);
        const [deals, config] = await Promise.all([
            idsEmpresa.length ? Deal.find({ company: { $in: idsEmpresa } }, { company: 1, status: 1, statusHistory: 1, updatedAt: 1 }).lean() : [],
            PipelineConfig.getOrCreate(String(partner.userId)),
        ]);
        // Cuánto hace que el deal no se mueve: es lo que le dice al partner si
        // hace falta que empuje. La etapa sola no significa nada para él.
        const diasSinMoverse = (d: any): number => {
            const ultimo = (d.statusHistory || [])[d.statusHistory?.length - 1];
            const desde = ultimo?.changedAt || d.updatedAt;
            return desde ? Math.round((Date.now() - new Date(desde).getTime()) / 864e5) : 0;
        };
        const quietoDeEmpresa = new Map<string, number>(
            deals.map((d: any) => [String(d.company), diasSinMoverse(d)] as [string, number]));

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
                diasQuieto: quietoDeEmpresa.get(String(m.companyId)),
            };
        };

        /**
         * Hace cuánto que no pasa nada con esta marca. Un solo eje para las dos
         * clases: el deal frenado usa los días sin cambiar de etapa, y la que
         * todavía buscamos usa su antigüedad — nunca tuvimos una puerta.
         */
        const diasSinNovedad = (m: any, situacion: any): number => {
            if (situacion.tipo === 'en_pipeline') return situacion.diasQuieto ?? 0;
            const desde = m.createdAt;
            return desde ? Math.round((Date.now() - new Date(desde).getTime()) / 864e5) : 0;
        };

        const salida = marcas.map((m: any) => {
            const situacion = situacionDe(m);
            const noLlego = (m.sinLlegada || []).some((x: any) => String(x) === String(partner._id));
            const yaSeOfrecio = (m.manos || []).some((x: any) =>
                String(x.partnerId) === String(partner._id) && x.estado !== 'descartada');
            return {
                _id: m._id,
                nombre: m.nombre,
                porQue: m.porQue,
                categoria: m.categoria,
                situacion,
                noLlego,
                // Separadas a propósito: el cliente no tiene que deducir cuál
                // mano es la suya comparando nombres — dos partners homónimos
                // se pisarían, y el nombre es dato editable.
                miMano: (m.manos || [])
                    .filter((x: any) => String(x.partnerId) === String(partner._id) && x.estado !== 'descartada')
                    .map(manoPublica)[0] ?? null,
                manos: (m.manos || [])
                    .filter((x: any) => String(x.partnerId) !== String(partner._id) && x.estado !== 'descartada')
                    .map(manoPublica),
                _respondida: noLlego || yaSeOfrecio,
                _quieto: diasSinNovedad(m, situacion),
            };
        });

        // Primero lo que no respondió, y dentro de eso lo más frenado: es donde
        // una presentación suya cambia el resultado. Lo que ya contestó baja al
        // fondo — con diez marcas en pantalla, el orden ES la recomendación.
        salida.sort((a, b) =>
            Number(a._respondida) - Number(b._respondida) || b._quieto - a._quieto);

        res.json({
            partner: { nombre: partner.name },
            marcas: salida.map(({ _respondida, _quieto, ...m }) => m),
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
            $and: [
                alcanceDelPartner(partner),
                {
                    $or: [
                        { estado: { $in: ['buscando', 'con_manos'] } },
                        { estado: 'ascendida', partners: partner._id },
                    ],
                },
            ],
        });
        if (!marca) return res.status(404).json({ error: 'No encontrado' });

        const comentario = typeof req.body?.comentario === 'string' ? req.body.comentario.trim() : '';
        const yaLevantada = marca.manos.find(
            (m) => String(m.partnerId) === String(partner._id) && m.estado !== 'descartada'
        );

        // Ofrecerse y "no llego" son excluyentes: si ahora llega, deja de estar
        // en la lista de los que no.
        marca.sinLlegada = (marca.sinLlegada || []).filter(
            (x: any) => String(x) !== String(partner._id)
        ) as any;

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

/**
 * POST /:token/marcas/:id/no-llego — el partner dice que no tiene llegada.
 *
 * Es información, no ausencia de ella: separa al que miró y no puede del que
 * nunca entró. Y se puede volver atrás — ofrecerse después lo saca de la lista.
 */
router.post('/:token/marcas/:id/no-llego', async (req: Request, res: Response) => {
    try {
        const partner = await partnerDelToken(req.params.token);
        if (!partner) return res.status(404).json({ error: 'No encontrado' });
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'No encontrado' });

        const r = await MarcaBuscada.updateOne(
            { _id: req.params.id, ...alcanceDelPartner(partner) },
            { $addToSet: { sinLlegada: partner._id } },
        );
        if (!r.matchedCount) return res.status(404).json({ error: 'No encontrado' });

        res.json({ ok: true });
    } catch (err: any) {
        console.error('portal no-llego error:', err.message);
        res.status(500).json({ error: 'No se pudo registrar' });
    }
});

export default router;
