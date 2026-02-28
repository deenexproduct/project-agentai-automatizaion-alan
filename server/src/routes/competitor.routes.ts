import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { Competitor } from '../models/competitor.model';

const router = Router();

// GET /competitors
router.get('/', async (req: Request, res: Response) => {
    try {
        const competitors = await Competitor.aggregate([
            { $match: {} },
            {
                $lookup: {
                    from: 'crm_companies',
                    localField: '_id',
                    foreignField: 'competitors',
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

        res.json({ competitors });
    } catch (err: any) {
        console.error('Competitors list error:', err.message);
        res.status(500).json({ error: 'Failed to fetch competitors' });
    }
});

// POST /competitors
router.post('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const competitor = await Competitor.create({ ...req.body, userId });
        res.status(201).json(competitor);
    } catch (err: any) {
        console.error('Create competitor error:', err.message);
        res.status(500).json({ error: 'Failed to create competitor' });
    }
});

// PATCH /competitors/:id
router.patch('/:id', async (req: Request, res: Response) => {
    try {
        const competitor = await Competitor.findOneAndUpdate(
            { _id: req.params.id },
            { $set: req.body },
            { new: true, runValidators: true }
        ).lean();

        if (!competitor) return res.status(404).json({ error: 'Competitor not found' });
        res.json(competitor);
    } catch (err: any) {
        console.error('Update competitor error:', err.message);
        res.status(500).json({ error: 'Failed to update competitor' });
    }
});

// GET /competitors/:id/companies
router.get('/:id/companies', async (req: Request, res: Response) => {
    try {
        const companies = await mongoose.model('Company').find({ competitors: req.params.id })
            .select('name logo sector website localesCount')
            .sort({ name: 1 })
            .lean();

        res.json({ companies });
    } catch (err: any) {
        console.error('Fetch competitor companies error:', err.message);
        res.status(500).json({ error: 'Failed to fetch companies for competitor' });
    }
});

// DELETE /competitors/:id
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const result = await Competitor.deleteOne({ _id: req.params.id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Competitor not found' });
        res.json({ success: true });
    } catch (err: any) {
        console.error('Delete competitor error:', err.message);
        res.status(500).json({ error: 'Failed to delete competitor' });
    }
});

export default router;
