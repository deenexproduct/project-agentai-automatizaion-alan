import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { MarcaBuscada } from '../models/marca-buscada.model';
import { Partner } from '../models/partner.model';

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
            userId: partner.userId,
            estado: { $in: ['buscando', 'con_manos'] },
        }).sort({ createdAt: -1 }).lean();

        await Partner.updateOne({ _id: partner._id }, { $set: { ultimoAccesoEn: new Date() } });

        res.json({
            partner: { nombre: partner.name },
            marcas: marcas.map((m: any) => ({
                _id: m._id,
                nombre: m.nombre,
                porQue: m.porQue,
                categoria: m.categoria,
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
            estado: { $in: ['buscando', 'con_manos'] },
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

export default router;
