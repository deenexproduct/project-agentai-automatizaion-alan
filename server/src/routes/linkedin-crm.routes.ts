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

router.post('/check-accepted', async (_req: Request, res: Response) => {
    try {
        const result = await linkedinService.checkAcceptedConnections();
        res.json(result);
    } catch (err: any) {
        console.error('CRM check-accepted error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /check-accepted/status — Last check timestamp ────────

router.get('/check-accepted/status', async (_req: Request, res: Response) => {
    try {
        const lastCheck = linkedinService.getLastAcceptedCheck();
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

export default router;
