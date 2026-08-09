import { Router, Request, Response } from 'express';
import { MarcaBuscada, normalizarNombre } from '../models/marca-buscada.model';
import { sendValidationError } from '../utils/mongoose-errors';

const router = Router();

// Sólo estos campos se pueden escribir desde el cliente. Sin whitelist, un
// PATCH podría pisar `manos`, `companyId` o `userId`.
const CAMPOS_EDITABLES = ['nombre', 'porQue', 'categoria', 'estado'] as const;

router.get('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const marcas = await MarcaBuscada.find({ userId }).sort({ createdAt: -1 }).lean();
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

export default router;
