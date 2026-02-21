import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Partner } from '../models/partner.model';

const router = Router();

// GET /partners
router.get('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        // Usar agregación para traer cant. de empresas y contactos vinculados a cada Partner
        const partners = await Partner.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(userId) } },
            {
                $lookup: {
                    from: 'companies',
                    localField: '_id',
                    foreignField: 'partner',
                    as: 'companies'
                }
            },
            {
                $lookup: {
                    from: 'crmcontacts',
                    localField: '_id',
                    foreignField: 'partner',
                    as: 'contacts'
                }
            },
            {
                $addFields: {
                    companiesCount: { $size: '$companies' },
                    contactsCount: { $size: '$contacts' }
                }
            },
            {
                $project: {
                    companies: 0,
                    contacts: 0
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
        const partner = await Partner.create({ ...req.body, userId });
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
            { _id: req.params.id, userId },
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
        const result = await Partner.deleteOne({ _id: req.params.id, userId });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Partner not found' });
        res.json({ success: true });
    } catch (err: any) {
        console.error('Delete partner error:', err.message);
        res.status(500).json({ error: 'Failed to delete partner' });
    }
});

export default router;
