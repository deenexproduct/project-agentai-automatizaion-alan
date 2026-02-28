import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { PosSystem } from '../models/pos-system.model';

const router = Router();

// GET /pos-systems
router.get('/', async (req: Request, res: Response) => {
    try {
        const posSystems = await PosSystem.aggregate([
            { $match: {} },
            {
                $lookup: {
                    from: 'crm_companies',
                    localField: '_id',
                    foreignField: 'posSystems',
                    as: 'companies'
                }
            },
            {
                $addFields: {
                    companiesCount: { $size: '$companies' },
                    linkedLocalesCount: { $sum: '$companies.localesCount' }
                }
            },
            {
                $project: {
                    companies: 0
                }
            },
            { $sort: { name: 1 } }
        ]);

        res.json({ posSystems });
    } catch (err: any) {
        console.error('POS Systems list error:', err.message);
        res.status(500).json({ error: 'Failed to fetch POS systems' });
    }
});

// POST /pos-systems
router.post('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const posSystem = await PosSystem.create({ ...req.body, userId });
        res.status(201).json(posSystem);
    } catch (err: any) {
        console.error('Create POS system error:', err.message);
        res.status(500).json({ error: 'Failed to create POS system' });
    }
});

// PATCH /pos-systems/:id
router.patch('/:id', async (req: Request, res: Response) => {
    try {
        const posSystem = await PosSystem.findOneAndUpdate(
            { _id: req.params.id },
            { $set: req.body },
            { new: true, runValidators: true }
        ).lean();

        if (!posSystem) return res.status(404).json({ error: 'POS system not found' });
        res.json(posSystem);
    } catch (err: any) {
        console.error('Update POS system error:', err.message);
        res.status(500).json({ error: 'Failed to update POS system' });
    }
});

// GET /pos-systems/:id/companies
router.get('/:id/companies', async (req: Request, res: Response) => {
    try {
        const companies = await mongoose.model('Company').find({ posSystems: req.params.id })
            .select('name logo sector website localesCount')
            .sort({ name: 1 })
            .lean();

        res.json({ companies });
    } catch (err: any) {
        console.error('Fetch POS system companies error:', err.message);
        res.status(500).json({ error: 'Failed to fetch companies for POS system' });
    }
});

// DELETE /pos-systems/:id
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const result = await PosSystem.deleteOne({ _id: req.params.id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'POS system not found' });
        res.json({ success: true });
    } catch (err: any) {
        console.error('Delete POS system error:', err.message);
        res.status(500).json({ error: 'Failed to delete POS system' });
    }
});

export default router;
