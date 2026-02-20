import { Router, Request, Response } from 'express';
import { LinkedInContact, type ContactStatus } from '../models/linkedin-contact.model';
import { linkedinService } from '../services/linkedin.service';
import { enrichmentService } from '../services/enrichment.service';

const router = Router();

// ── GET /contacts — Paginated list with filters ──────────────

router.get('/contacts', async (req: Request, res: Response) => {
    try {
        const {
            status,
            search,
            page = '1',
            limit = '50',
        } = req.query;

        const pageNum = Math.max(1, parseInt(page as string) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 50));
        const skip = (pageNum - 1) * limitNum;

        // Build query
        const query: any = {};

        if (status && ['visitando', 'conectando', 'interactuando', 'enriqueciendo', 'esperando_aceptacion', 'aceptado', 'mensaje_enviado'].includes(status as string)) {
            query.status = status;
        }

        if (search && (search as string).trim().length > 0) {
            const s = (search as string).trim();
            query.$or = [
                { fullName: { $regex: s, $options: 'i' } },
                { currentCompany: { $regex: s, $options: 'i' } },
                { currentPosition: { $regex: s, $options: 'i' } },
                { headline: { $regex: s, $options: 'i' } },
            ];
        }

        // Selective projection for Kanban cards (lightweight)
        const projection = {
            fullName: 1,
            currentPosition: 1,
            currentCompany: 1,
            location: 1,
            profilePhotoUrl: 1,
            profileUrl: 1,
            status: 1,
            sentAt: 1,
            acceptedAt: 1,
            readyForMessageAt: 1,
            messageSentAt: 1,
            headline: 1,
            enrichmentStatus: 1,
            enrichedAt: 1,
        };

        const [contacts, total] = await Promise.all([
            LinkedInContact.find(query, projection)
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            LinkedInContact.countDocuments(query),
        ]);

        res.json({
            contacts,
            total,
            page: pageNum,
            pages: Math.ceil(total / limitNum),
        });
    } catch (err: any) {
        console.error('CRM contacts error:', err.message);
        res.status(500).json({ error: 'Failed to fetch contacts' });
    }
});

// ── GET /contacts/counts — Status counts for Kanban headers ──

router.get('/contacts/counts', async (_req: Request, res: Response) => {
    try {
        const [visitando, conectando, interactuando, enriqueciendo, esperando_aceptacion, aceptado, mensaje_enviado] = await Promise.all([
            LinkedInContact.countDocuments({ status: 'visitando' }),
            LinkedInContact.countDocuments({ status: 'conectando' }),
            LinkedInContact.countDocuments({ status: 'interactuando' }),
            LinkedInContact.countDocuments({ status: 'enriqueciendo' }),
            LinkedInContact.countDocuments({ status: 'esperando_aceptacion' }),
            LinkedInContact.countDocuments({ status: 'aceptado' }),
            LinkedInContact.countDocuments({ status: 'mensaje_enviado' }),
        ]);

        res.json({ visitando, conectando, interactuando, enriqueciendo, esperando_aceptacion, aceptado, mensaje_enviado });
    } catch (err: any) {
        console.error('CRM counts error:', err.message);
        res.status(500).json({ error: 'Failed to fetch counts' });
    }
});

// ── GET /contacts/:id — Full contact detail (for drawer) ─────

router.get('/contacts/:id', async (req: Request, res: Response) => {
    try {
        const contact = await LinkedInContact.findById(req.params.id).lean();
        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }
        res.json(contact);
    } catch (err: any) {
        console.error('CRM contact detail error:', err.message);
        res.status(500).json({ error: 'Failed to fetch contact' });
    }
});

// ── PATCH /contacts/:id/status — Update status (drag & drop) ─

router.patch('/contacts/:id/status', async (req: Request, res: Response) => {
    try {
        const { status } = req.body;
        const validStatuses: ContactStatus[] = ['visitando', 'conectando', 'interactuando', 'enriqueciendo', 'esperando_aceptacion', 'aceptado', 'mensaje_enviado'];

        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        // Build timestamp update based on new status
        const timestampField: Record<string, string> = {
            interactuando: 'interactedAt',
            enriqueciendo: 'enrichedAt',
            aceptado: 'acceptedAt',
            mensaje_enviado: 'messageSentAt',
        };

        const update: any = { status };
        if (timestampField[status]) {
            update[timestampField[status]] = new Date();
        }

        const contact = await LinkedInContact.findByIdAndUpdate(
            req.params.id,
            { $set: update },
            { new: true }
        );

        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        res.json({ success: true, contact });

        // ── Auto-enrichment trigger (async, non-blocking) ──
        // Enrichment is triggered when status is 'interactuando'
        try {
            enrichmentService.triggerAutoEnrichment(req.params.id, status);
        } catch (enrichErr: any) {
            console.error('Auto-enrichment trigger error:', enrichErr.message);
        }
    } catch (err: any) {
        console.error('CRM status update error:', err.message);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// ── POST /contacts/:id/notes — Add a note ────────────────────

router.post('/contacts/:id/notes', async (req: Request, res: Response) => {
    try {
        const { text } = req.body;

        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).json({ error: 'Note text is required' });
        }

        const contact = await LinkedInContact.findByIdAndUpdate(
            req.params.id,
            {
                $push: {
                    notes: {
                        text: text.trim(),
                        createdAt: new Date(),
                    },
                },
            },
            { new: true }
        );

        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        res.json({ success: true, notes: contact.notes });
    } catch (err: any) {
        console.error('CRM add note error:', err.message);
        res.status(500).json({ error: 'Failed to add note' });
    }
});

// ── POST /check-accepted — Trigger acceptance check ──────────

router.post('/check-accepted', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?._id?.toString() || 'default';
        const tenant = linkedinService.getTenant(userId);
        const result = await tenant.checkAcceptedConnections();
        res.json(result);
    } catch (err: any) {
        console.error('CRM check-accepted error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /check-accepted/status — Last check timestamp ────────

router.get('/check-accepted/status', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?._id?.toString() || 'default';
        const tenant = linkedinService.getTenant(userId);
        const lastCheck = tenant.getLastAcceptedCheck();
        res.json({ lastCheck });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /contacts/:id/enrich — Trigger enrichment manually ──

router.post('/contacts/:id/enrich', async (req: Request, res: Response) => {
    try {
        const contact = await enrichmentService.enrichContact(req.params.id);
        res.json({ success: true, contact });
    } catch (err: any) {
        console.error('CRM enrichment error:', err.message);
        const status = err.message.includes('no encontrado') ? 404 : 500;
        res.status(status).json({ error: err.message });
    }
});

// ── GET /enrichment/config — Get enrichment configuration ────

router.get('/enrichment/config', async (_req: Request, res: Response) => {
    try {
        const config = enrichmentService.getConfig();
        res.json(config);
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to read config' });
    }
});

// ── PATCH /enrichment/config — Update enrichment config ──────

router.patch('/enrichment/config', async (req: Request, res: Response) => {
    try {
        const validStatuses: ContactStatus[] = ['visitando', 'conectando', 'interactuando', 'enriqueciendo', 'esperando_aceptacion', 'aceptado', 'mensaje_enviado'];

        if (req.body.autoEnrichOnStatus && !validStatuses.includes(req.body.autoEnrichOnStatus)) {
            return res.status(400).json({ error: 'Invalid trigger status' });
        }

        const updated = enrichmentService.updateConfig(req.body);
        res.json({ success: true, config: updated });
    } catch (err: any) {
        res.status(500).json({ error: 'Failed to update config' });
    }
});

// ── POST /contacts/bulk/enrich — Bulk enrichment ─────────────

router.post('/contacts/bulk/enrich', async (req: Request, res: Response) => {
    try {
        const { ids } = req.body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids array is required' });
        }

        if (ids.length > 50) {
            return res.status(400).json({ error: 'Maximum 50 contacts per bulk operation' });
        }

        const results = await Promise.allSettled(
            ids.map(id => enrichmentService.enrichContact(id))
        );

        const succeeded = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        res.json({
            success: true,
            summary: { total: ids.length, succeeded, failed },
            results: results.map((r, i) => ({
                id: ids[i],
                status: r.status,
                ...(r.status === 'rejected' ? { error: (r as PromiseRejectedResult).reason?.message } : {})
            }))
        });
    } catch (err: any) {
        console.error('CRM bulk enrichment error:', err.message);
        res.status(500).json({ error: 'Failed to bulk enrich contacts' });
    }
});

// ── POST /contacts/bulk/status — Bulk status update ──────────

router.post('/contacts/bulk/status', async (req: Request, res: Response) => {
    try {
        const { ids, status } = req.body;
        const validStatuses: ContactStatus[] = ['visitando', 'conectando', 'interactuando', 'enriqueciendo', 'esperando_aceptacion', 'aceptado', 'mensaje_enviado'];

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids array is required' });
        }

        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const timestampField: Record<string, string> = {
            interactuando: 'interactedAt',
            enriqueciendo: 'enrichedAt',
            aceptado: 'acceptedAt',
            mensaje_enviado: 'messageSentAt',
        };

        const update: any = { status };
        if (timestampField[status]) {
            update[timestampField[status]] = new Date();
        }

        const result = await LinkedInContact.updateMany(
            { _id: { $in: ids } },
            { $set: update }
        );

        res.json({
            success: true,
            modified: result.modifiedCount
        });
    } catch (err: any) {
        console.error('CRM bulk status update error:', err.message);
        res.status(500).json({ error: 'Failed to bulk update status' });
    }
});

// ── GET /contacts/export — Export contacts to CSV ────────────

router.get('/contacts/export', async (req: Request, res: Response) => {
    try {
        const { status, search } = req.query;

        // Build query
        const query: any = {};

        if (status && ['visitando', 'conectando', 'interactuando', 'enriqueciendo', 'esperando_aceptacion', 'aceptado', 'mensaje_enviado'].includes(status as string)) {
            query.status = status;
        }

        if (search && (search as string).trim().length > 0) {
            const s = (search as string).trim();
            query.$or = [
                { fullName: { $regex: s, $options: 'i' } },
                { currentCompany: { $regex: s, $options: 'i' } },
                { currentPosition: { $regex: s, $options: 'i' } },
                { headline: { $regex: s, $options: 'i' } },
            ];
        }

        const contacts = await LinkedInContact.find(query).lean();

        // Build CSV
        const headers = [
            'ID', 'Full Name', 'First Name', 'Last Name', 'Headline',
            'Current Position', 'Current Company', 'Industry', 'Location',
            'Profile URL', 'Status', 'Sent At', 'Accepted At',
            'Enriched At', 'Message Sent At', 'Enrichment Status',
            'Created At', 'Notes Count'
        ];

        const rows = contacts.map(c => [
            c._id?.toString() || '',
            c.fullName || '',
            c.firstName || '',
            c.lastName || '',
            c.headline || '',
            c.currentPosition || '',
            c.currentCompany || '',
            c.industry || '',
            c.location || '',
            c.profileUrl || '',
            c.status || '',
            c.sentAt ? new Date(c.sentAt).toISOString() : '',
            c.acceptedAt ? new Date(c.acceptedAt).toISOString() : '',
            c.enrichedAt ? new Date(c.enrichedAt).toISOString() : '',
            c.messageSentAt ? new Date(c.messageSentAt).toISOString() : '',
            c.enrichmentStatus || '',
            c.createdAt ? new Date(c.createdAt).toISOString() : '',
            (c.notes?.length || 0).toString()
        ]);

        // Escape CSV values
        const escapeCsv = (value: string) => {
            if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        };

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(escapeCsv).join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="linkedin-contacts-${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csvContent);
    } catch (err: any) {
        console.error('CRM export error:', err.message);
        res.status(500).json({ error: 'Failed to export contacts' });
    }
});

// ── GET /contacts/stats — Contact statistics ─────────────────

router.get('/contacts/stats', async (_req: Request, res: Response) => {
    try {
        const total = await LinkedInContact.countDocuments();

        const byStatus = await LinkedInContact.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } }
        ]);

        const byEnrichmentStatus = await LinkedInContact.aggregate([
            { $group: { _id: '$enrichmentStatus', count: { $sum: 1 } } }
        ]);

        const recent = await LinkedInContact.countDocuments({
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        });

        res.json({
            total,
            byStatus: byStatus.reduce((acc, curr) => ({ ...acc, [curr._id || 'unknown']: curr.count }), {}),
            byEnrichmentStatus: byEnrichmentStatus.reduce((acc, curr) => ({ ...acc, [curr._id || 'none']: curr.count }), {}),
            recentLast7Days: recent
        });
    } catch (err: any) {
        console.error('CRM stats error:', err.message);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

export default router;
