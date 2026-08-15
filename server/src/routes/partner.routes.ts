import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { randomBytes } from 'crypto';
import { Partner } from '../models/partner.model';

/**
 * De dónde cuelga el link que se le pasa al partner.
 *
 * En producción NO hay default: un link a localhost es un link que no le abre a
 * nadie, y el que lo copia no tiene forma de darse cuenta hasta que el partner
 * avisa que no entra —o no avisa, y la feature muere en silencio. Preferimos
 * romper acá, con el nombre de la variable que falta.
 *
 * En desarrollo el default se queda: ahí localhost ES la respuesta correcta y
 * nadie debería tener que configurar nada para levantar el proyecto.
 *
 * Se lee en cada pedido y no al importar el módulo: como const, el valor
 * quedaba clavado al arranque y no había manera de testearlo.
 */
function baseUrlDelFront(): string {
    const configurada = process.env.FRONTEND_URL;
    if (!configurada) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error(
                'Falta la variable FRONTEND_URL: sin ella el link del partner apuntaría a localhost.',
            );
        }
        return 'http://localhost:5260';
    }
    return configurada.replace(/\/+$/, '');
}

const router = Router();

// GET /partners
router.get('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        // Usar agregación para traer cant. de empresas y contactos vinculados a cada Partner
        const partners = await Partner.aggregate([
            { $match: {} },
            {
                $lookup: {
                    from: 'crm_companies',
                    localField: '_id',
                    foreignField: 'partner',
                    as: 'companies'
                }
            },
            {
                $lookup: {
                    from: 'crm_contacts',
                    localField: '_id',
                    foreignField: 'partner',
                    as: 'contacts'
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'assignedTo',
                    foreignField: '_id',
                    pipeline: [{ $project: { name: 1, profilePhotoUrl: 1 } }],
                    as: '_assignedToArr'
                }
            },
            {
                $addFields: {
                    companiesCount: { $size: '$companies' },
                    contactsCount: { $size: '$contacts' },
                    assignedTo: { $arrayElemAt: ['$_assignedToArr', 0] },
                    tieneLink: {
                        $and: [
                            { $ne: [{ $ifNull: ['$accessToken', null] }, null] },
                            { $ne: ['$accessTokenActivo', false] },
                        ]
                    },
                    // El link viaja en el listado a propósito: quien ve esta
                    // pantalla es quien se lo pasa al partner, y esconderlo
                    // obligaría a regenerarlo para volver a copiarlo — rompiendo
                    // el link que el partner ya tiene guardado.
                    linkPortal: {
                        $cond: [
                            { $and: [
                                { $ne: [{ $ifNull: ['$accessToken', null] }, null] },
                                { $ne: ['$accessTokenActivo', false] },
                            ] },
                            { $concat: [baseUrlDelFront(), '/partners/', '$accessToken'] },
                            null,
                        ]
                    }
                }
            },
            {
                $project: {
                    companies: 0,
                    contacts: 0,
                    _assignedToArr: 0
                }
            },
            { $sort: { name: 1 } }
        ]);

        res.json({ partners });
    } catch (err: any) {
        console.error('Partners list error:', err.message);
        res.status(500).json({ error: 'Failed to fetch partners' });
    }
});

// POST /partners
router.post('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const partner = await Partner.create({ ...req.body, assignedTo: req.body.assignedTo || userId, userId });
        res.status(201).json(partner);
    } catch (err: any) {
        console.error('Create partner error:', err.message);
        res.status(500).json({ error: 'Failed to create partner' });
    }
});

// PATCH /partners/:id
router.patch('/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const partner = await Partner.findOneAndUpdate(
            { _id: req.params.id },
            { $set: req.body },
            { new: true, runValidators: true }
        ).lean();

        if (!partner) return res.status(404).json({ error: 'Partner not found' });
        res.json(partner);
    } catch (err: any) {
        console.error('Update partner error:', err.message);
        res.status(500).json({ error: 'Failed to update partner' });
    }
});

// DELETE /partners/:id
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const result = await Partner.deleteOne({ _id: req.params.id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Partner not found' });
        res.json({ success: true });
    } catch (err: any) {
        console.error('Delete partner error:', err.message);
        res.status(500).json({ error: 'Failed to delete partner' });
    }
});

// ── Link de acceso al portal ─────────────────────────────────
//
// El portal público valida contra `accessToken`, pero hasta acá nada lo
// generaba: los partners quedaban sin forma de entrar y la pantalla de Marcas
// Buscadas invitaba a "compartir el link" que no existía.

/** POST /partners/:id/access-link — genera o regenera el link del partner. */
router.post('/:id/access-link', async (req: Request, res: Response) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ error: 'El ID no tiene un formato válido' });
        }

        // Antes de tocar la base: si no sabemos armar la URL, no dejamos al
        // partner con un token activo que nadie vio ni puede revocar.
        const base = baseUrlDelFront();

        // 24 bytes en base64url: suficiente entropía para una credencial que
        // viaja por WhatsApp y no caduca.
        const accessToken = randomBytes(24).toString('base64url');

        // Regenerar pisa el token anterior a propósito: si se filtró, el link
        // viejo tiene que dejar de abrir.
        const partner = await Partner.findByIdAndUpdate(
            req.params.id,
            { $set: { accessToken, accessTokenActivo: true } },
            { new: true },
        );
        if (!partner) return res.status(404).json({ error: 'Partner no encontrado' });

        res.json({ accessToken, url: `${base}/partners/${accessToken}` });
    } catch (err: any) {
        console.error('Partner access-link error:', err.message);
        res.status(500).json({ error: err?.message || 'Failed to generate access link' });
    }
});

/** DELETE /partners/:id/access-link — revoca el link sin borrar el rastro. */
router.delete('/:id/access-link', async (req: Request, res: Response) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ error: 'El ID no tiene un formato válido' });
        }
        // Se desactiva en vez de borrarse: así queda registro de que hubo un
        // link y de cuándo se usó por última vez.
        const partner = await Partner.findByIdAndUpdate(
            req.params.id,
            { $set: { accessTokenActivo: false } },
            { new: true },
        );
        if (!partner) return res.status(404).json({ error: 'Partner no encontrado' });

        res.json({ ok: true });
    } catch (err: any) {
        console.error('Partner revoke-link error:', err.message);
        res.status(500).json({ error: 'Failed to revoke access link' });
    }
});

export default router;
