import { Router, Request, Response } from 'express';
import { MarcaBuscada, normalizarNombre } from '../models/marca-buscada.model';
// El listado hace populate de `partners`: importar el modelo acá lo deja
// registrado siempre, sin depender de que alguien más lo haya importado antes.
import '../models/partner.model';
import { sendValidationError } from '../utils/mongoose-errors';
import { ascenderMarca } from '../services/ascenso-marca.service';

const router = Router();

// Sólo estos campos se pueden escribir desde el cliente. Sin whitelist, un
// PATCH podría pisar `manos`, `companyId` o `userId`.
const CAMPOS_EDITABLES = ['nombre', 'porQue', 'categoria', 'estado', 'partners'] as const;

router.get('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const marcas = await MarcaBuscada.find({ userId })
            .populate('partners', 'name')
            .populate('propuestaPor', 'name')
            .sort({ createdAt: -1 }).lean();
        res.json({ marcas });
    } catch (err: any) {
        console.error('marcas-buscadas list error:', err.message);
        res.status(500).json({ error: 'No se pudieron traer las marcas' });
    }
});

router.post('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : '';

        if (nombre) {
            const yaExiste = await MarcaBuscada.findOne({
                userId, nombreNormalizado: normalizarNombre(nombre),
            }).lean();
            if (yaExiste) {
                return res.status(409).json({
                    error: `Ya tenés cargada la marca "${(yaExiste as any).nombre}"`,
                    existingId: String((yaExiste as any)._id),
                });
            }
        }

        const datos: Record<string, any> = { userId };
        for (const campo of CAMPOS_EDITABLES) {
            if (req.body?.[campo] !== undefined) datos[campo] = req.body[campo];
        }

        const marca = await MarcaBuscada.create(datos);
        res.status(201).json(marca);
    } catch (err: any) {
        if (sendValidationError(res, err)) return;
        console.error('marcas-buscadas create error:', err.message);
        res.status(500).json({ error: 'No se pudo crear la marca' });
    }
});

router.patch('/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const marca = await MarcaBuscada.findOne({ _id: req.params.id, userId });
        if (!marca) return res.status(404).json({ error: 'Marca no encontrada' });

        for (const campo of CAMPOS_EDITABLES) {
            if (req.body?.[campo] !== undefined) (marca as any)[campo] = req.body[campo];
        }
        await marca.save();
        res.json(marca);
    } catch (err: any) {
        if (sendValidationError(res, err)) return;
        console.error('marcas-buscadas update error:', err.message);
        res.status(500).json({ error: 'No se pudo actualizar la marca' });
    }
});

router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const r = await MarcaBuscada.deleteOne({ _id: req.params.id, userId });
        if (!r.deletedCount) return res.status(404).json({ error: 'Marca no encontrada' });
        res.json({ ok: true });
    } catch (err: any) {
        if (sendValidationError(res, err)) return;
        console.error('marcas-buscadas delete error:', err.message);
        res.status(500).json({ error: 'No se pudo borrar la marca' });
    }
});

router.post('/:id/manos/:manoId/aceptar', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const r = await ascenderMarca(req.params.id, req.params.manoId, userId);

        if (r.duplicada) {
            return res.status(409).json({
                error: `"${r.duplicada.name}" ya existe en tu CRM`,
                existingId: r.duplicada._id,
            });
        }
        res.json(r);
    } catch (err: any) {
        if (err.http) return res.status(err.http).json({ error: err.message });
        if (sendValidationError(res, err)) return;
        console.error('ascenso error:', err.message);
        res.status(500).json({ error: 'No se pudo ascender la marca' });
    }
});

router.post('/:id/manos/:manoId/descartar', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const marca = await MarcaBuscada.findOne({ _id: req.params.id, userId });
        if (!marca) return res.status(404).json({ error: 'Marca no encontrada' });

        // Marca ya ascendida: descartar acá dejaría una empresa en el CRM sin
        // ninguna mano aceptada que la respalde.
        if (marca.estado === 'ascendida') {
            return res.status(409).json({ error: 'Esta marca ya fue ascendida a empresa, no se puede descartar ninguna de sus manos' });
        }

        const mano = marca.manos.find((m: any) => String(m._id) === String(req.params.manoId));
        if (!mano) return res.status(404).json({ error: 'Mano no encontrada' });

        if (mano.estado !== 'ofrecida') {
            return res.status(409).json({ error: 'Esa mano ya fue resuelta' });
        }

        // Cambia el estado, NO se borra el registro ni su fecha.
        mano.estado = 'descartada';
        if (!marca.manos.some((m) => m.estado === 'ofrecida') && marca.estado === 'con_manos') {
            marca.estado = 'buscando';
        }
        await marca.save();

        res.json({ ok: true });
    } catch (err: any) {
        if (sendValidationError(res, err)) return;
        console.error('descartar mano error:', err.message);
        res.status(500).json({ error: 'No se pudo descartar' });
    }
});

export default router;
