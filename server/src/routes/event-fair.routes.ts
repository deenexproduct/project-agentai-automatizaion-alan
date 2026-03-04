import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { EventFair } from '../models/event-fair.model';

const router = Router();

// GET /events — list all event fairs with aggregated data
router.get('/', async (req: Request, res: Response) => {
    try {
        const events = await EventFair.aggregate([
            { $match: {} },
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
                    assignedTo: { $arrayElemAt: ['$_assignedToArr', 0] },
                    expectedLeadsCount: { $size: { $ifNull: ['$expectedLeads', []] } }
                }
            },
            {
                $project: {
                    _assignedToArr: 0
                }
            },
            { $sort: { startDate: 1 } }
        ]);

        res.json({ events });
    } catch (err: any) {
        console.error('Event fairs list error:', err.message);
        res.status(500).json({ error: 'Failed to fetch event fairs' });
    }
});

// POST /events — create a new event fair
router.post('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const event = await EventFair.create({ ...req.body, assignedTo: req.body.assignedTo || userId, userId });
        res.status(201).json(event);
    } catch (err: any) {
        console.error('Create event fair error:', err.message);
        res.status(500).json({ error: 'Failed to create event fair' });
    }
});

// PATCH /events/:id — update an event fair
router.patch('/:id', async (req: Request, res: Response) => {
    try {
        const event = await EventFair.findOneAndUpdate(
            { _id: req.params.id },
            { $set: req.body },
            { new: true, runValidators: true }
        ).lean();

        if (!event) return res.status(404).json({ error: 'Event fair not found' });
        res.json(event);
    } catch (err: any) {
        console.error('Update event fair error:', err.message);
        res.status(500).json({ error: 'Failed to update event fair' });
    }
});

// GET /events/:id/leads — get contacts linked to this event
router.get('/:id/leads', async (req: Request, res: Response) => {
    try {
        const event = await EventFair.findById(req.params.id).lean();
        if (!event) return res.status(404).json({ error: 'Event fair not found' });

        const contacts = await mongoose.model('CrmContact').find({
            _id: { $in: event.expectedLeads || [] }
        })
            .select('fullName position email phone profilePhotoUrl')
            .populate('company', 'name logo')
            .sort({ fullName: 1 })
            .lean();

        res.json({ contacts });
    } catch (err: any) {
        console.error('Fetch event fair leads error:', err.message);
        res.status(500).json({ error: 'Failed to fetch leads for event fair' });
    }
});

// DELETE /events/:id — delete an event fair
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const result = await EventFair.deleteOne({ _id: req.params.id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Event fair not found' });
        res.json({ success: true });
    } catch (err: any) {
        console.error('Delete event fair error:', err.message);
        res.status(500).json({ error: 'Failed to delete event fair' });
    }
});

export default router;
