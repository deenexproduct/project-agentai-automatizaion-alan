import { Router, Request, Response } from 'express';
import { PipelineConfig } from '../models/pipeline-config.model';
import { Company } from '../models/company.model';
import { CrmContact } from '../models/crm-contact.model';
import { Deal } from '../models/deal.model';
import { Task } from '../models/task.model';
import { Activity } from '../models/activity.model';
import { LinkedInContact } from '../models/linkedin-contact.model';
import { linkedinService } from '../services/linkedin.service';

const router = Router();

// ════════════════════════════════════════════════════════════════
//  PIPELINE CONFIG
// ════════════════════════════════════════════════════════════════

// ── GET /pipeline/config — Get pipeline config ───────────────
router.get('/pipeline/config', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const config = await PipelineConfig.getOrCreate(userId);
        res.json(config);
    } catch (err: any) {
        console.error('CRM pipeline config error:', err.message);
        res.status(500).json({ error: 'Failed to fetch pipeline config' });
    }
});

// ── PUT /pipeline/config — Update pipeline stages ────────────
router.put('/pipeline/config', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const { stages, name } = req.body;

        if (!stages || !Array.isArray(stages) || stages.length === 0) {
            return res.status(400).json({ error: 'At least one stage is required' });
        }

        // Validate unique keys
        const keys = stages.map((s: any) => s.key);
        if (new Set(keys).size !== keys.length) {
            return res.status(400).json({ error: 'Stage keys must be unique' });
        }

        const config = await PipelineConfig.getOrCreate(userId);
        config.stages = stages;
        if (name) config.name = name;
        await config.save();

        res.json(config);
    } catch (err: any) {
        console.error('CRM pipeline update error:', err.message);
        res.status(500).json({ error: 'Failed to update pipeline config' });
    }
});

// ── POST /pipeline/config/seed — Reset to default stages ─────
router.post('/pipeline/config/seed', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        await PipelineConfig.deleteOne({ userId });
        const config = await PipelineConfig.getOrCreate(userId);
        res.json(config);
    } catch (err: any) {
        console.error('CRM pipeline seed error:', err.message);
        res.status(500).json({ error: 'Failed to seed pipeline config' });
    }
});

// ════════════════════════════════════════════════════════════════
//  COMPANIES
// ════════════════════════════════════════════════════════════════

// ── GET /companies — List with search + pagination ───────────
router.get('/companies', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const { search, sector, assignedTo, page = '1', limit = '20' } = req.query;

        const pageNum = Math.max(1, parseInt(page as string) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));

        const query: any = {};
        if (sector) query.sector = sector;
        if (assignedTo) query.assignedTo = assignedTo;
        if (search) {
            const s = search as string;
            query.name = { $regex: s, $options: 'i' };
        }

        const [companies, total] = await Promise.all([
            Company.find(query)
                .sort({ createdAt: -1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .populate('assignedTo', 'name email profilePhotoUrl')
                .populate('partner', 'name')
                .lean(),
            Company.countDocuments(query),
        ]);

        // Attach counts for each company
        const companyIds = companies.map(c => c._id);
        const [contactCounts, dealCounts] = await Promise.all([
            CrmContact.aggregate([
                { $match: { $or: [{ company: { $in: companyIds } }, { companies: { $in: companyIds } }] } },
                {
                    $project: {
                        matchedCompanies: {
                            $setUnion: [
                                { $cond: [{ $in: ['$company', companyIds] }, ['$company'], []] },
                                { $filter: { input: { $ifNull: ['$companies', []] }, cond: { $in: ['$$this', companyIds] } } }
                            ]
                        }
                    }
                },
                { $unwind: '$matchedCompanies' },
                { $group: { _id: '$matchedCompanies', count: { $sum: 1 } } },
            ]),
            Deal.aggregate([
                { $match: { company: { $in: companyIds } } },
                { $group: { _id: '$company', count: { $sum: 1 } } },
            ]),
        ]);

        const contactMap: Record<string, number> = {};
        for (const c of contactCounts) contactMap[c._id.toString()] = c.count;
        const dealMap: Record<string, number> = {};
        for (const d of dealCounts) dealMap[d._id.toString()] = d.count;

        const enriched = companies.map(c => ({
            ...c,
            contactsCount: contactMap[c._id.toString()] || 0,
            dealsCount: dealMap[c._id.toString()] || 0,
        }));

        res.json({ companies: enriched, total, page: pageNum, pages: Math.ceil(total / limitNum) });
    } catch (err: any) {
        console.error('CRM companies list error:', err.message);
        res.status(500).json({ error: 'Failed to fetch companies' });
    }
});

// ── POST /companies — Create company ─────────────────────────
router.post('/companies', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const company = await Company.create({ ...req.body, assignedTo: req.body.assignedTo || userId, userId });

        // ── Auto-create Deal in 'Lead Potencial' ──
        try {
            const validKeys = await PipelineConfig.getStageKeys(userId.toString());
            const firstStage = validKeys[0] || 'lead';
            const dealValue = (company.localesCount && company.costPerLocation)
                ? Math.round((company.localesCount * company.costPerLocation) * 100) / 100
                : 0;

            await Deal.create({
                title: company.name,
                status: firstStage,
                company: company._id,
                value: dealValue,
                currency: 'USD',
                assignedTo: company.assignedTo || userId,
                userId,
            });
            console.log(`✅ Auto-created Deal for company "${company.name}" in stage "${firstStage}"`);
        } catch (dealErr: any) {
            console.error(`⚠️ Auto-create Deal failed for company ${company._id}:`, dealErr.message);
            // Don't fail the company creation if auto-deal fails
        }

        res.status(201).json(company);
    } catch (err: any) {
        console.error('CRM create company error:', err.message);
        res.status(500).json({ error: 'Failed to create company' });
    }
});

// ── GET /companies/:id — Detail with contacts + deals + tasks
router.get('/companies/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const company = await Company.findOne({ _id: req.params.id })
            .populate('assignedTo', 'name email profilePhotoUrl')
            .populate('partner', 'name')
            .lean();

        if (!company) return res.status(404).json({ error: 'Company not found' });

        const [contacts, deals, tasks, activities] = await Promise.all([
            CrmContact.find({ $or: [{ company: req.params.id }, { companies: req.params.id }] }).sort({ isResponsible: -1, fullName: 1 }).lean(),
            Deal.find({ company: req.params.id })
                .populate('primaryContact', 'fullName position profilePhotoUrl')
                .populate('assignedTo', 'name email profilePhotoUrl')
                .sort({ createdAt: -1 }).lean(),
            Task.find({ company: req.params.id, status: { $in: ['pending', 'in_progress'] } })
                .sort({ dueDate: 1 }).lean(),
            Activity.find({ company: req.params.id })
                .populate('contact', 'fullName')
                .sort({ createdAt: -1 }).limit(20).lean(),
        ]);

        // Enrich deals with daysInStatus and pendingTasks
        const dealIds = deals.map(d => d._id);
        const dealTaskCounts = await Task.aggregate([
            { $match: { deal: { $in: dealIds }, status: { $in: ['pending', 'in_progress'] } } },
            { $group: { _id: '$deal', count: { $sum: 1 } } },
        ]);
        const dealTaskMap: Record<string, number> = {};
        for (const t of dealTaskCounts) dealTaskMap[t._id.toString()] = t.count;

        const enrichedDeals = deals.map(deal => ({
            ...deal,
            pendingTasks: dealTaskMap[deal._id.toString()] || 0,
            daysInStatus: (deal as any).statusHistory?.length > 0
                ? Math.floor((Date.now() - new Date((deal as any).statusHistory[(deal as any).statusHistory.length - 1].changedAt).getTime()) / (1000 * 60 * 60 * 24))
                : Math.floor((Date.now() - new Date(deal.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
        }));

        res.json({ ...company, contacts, deals: enrichedDeals, tasks, activities });
    } catch (err: any) {
        console.error('CRM company detail error:', err.message);
        res.status(500).json({ error: 'Failed to fetch company' });
    }
});

// ── PATCH /companies/:id — Update company ────────────────────
router.patch('/companies/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const company = await Company.findOneAndUpdate(
            { _id: req.params.id },
            { $set: req.body },
            { new: true, runValidators: true }
        ).lean();

        if (!company) return res.status(404).json({ error: 'Company not found' });
        res.json(company);
    } catch (err: any) {
        console.error('CRM update company error:', err.message);
        res.status(500).json({ error: 'Failed to update company' });
    }
});

// ── DELETE /companies/:id — Delete company ───────────────────
router.delete('/companies/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();

        // Check for active deals
        const activeDeals = await Deal.countDocuments({
            company: req.params.id,
            status: { $nin: ['ganado', 'perdido'] },
        });
        if (activeDeals > 0) {
            return res.status(400).json({ error: `Cannot delete: company has ${activeDeals} active deal(s)` });
        }

        const result = await Company.deleteOne({ _id: req.params.id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Company not found' });

        res.json({ success: true });
    } catch (err: any) {
        console.error('CRM delete company error:', err.message);
        res.status(500).json({ error: 'Failed to delete company' });
    }
});

// ════════════════════════════════════════════════════════════════
//  CONTACTS
// ════════════════════════════════════════════════════════════════

// ── GET /contacts — List with filters ────────────────────────
router.get('/contacts', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const { company, role, channel, assignedTo, search, page = '1', limit = '20' } = req.query;

        const pageNum = Math.max(1, parseInt(page as string) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));

        const query: any = {};
        if (company) {
            query.$or = [{ company: company }, { companies: company }];
        }
        if (role) query.role = role;
        if (channel) query.channel = channel;
        if (assignedTo) query.assignedTo = assignedTo;
        if (search) {
            const s = search as string;
            query.$or = [
                { fullName: { $regex: s, $options: 'i' } },
                { email: { $regex: s, $options: 'i' } },
                { position: { $regex: s, $options: 'i' } },
            ];
        }

        const [contacts, total] = await Promise.all([
            CrmContact.find(query)
                .populate('company', 'name logo')
                .populate('companies', 'name logo sector')
                .populate('assignedTo', 'name email profilePhotoUrl')
                .populate('partner', 'name')
                .sort({ createdAt: -1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
            CrmContact.countDocuments(query),
        ]);

        res.json({ contacts, total, page: pageNum, pages: Math.ceil(total / limitNum) });
    } catch (err: any) {
        console.error('CRM contacts list error:', err.message);
        res.status(500).json({ error: 'Failed to fetch contacts' });
    }
});

// ── POST /contacts — Create contact ──────────────────────────
router.post('/contacts', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const contact = await CrmContact.create({ ...req.body, assignedTo: req.body.assignedTo || userId, userId });

        // Auto-prospect if LinkedIn URL is provided
        if (contact.linkedInProfileUrl) {
            // Immediate sync: check if LinkedInContact already exists
            try {
                const normalizedUrl = contact.linkedInProfileUrl
                    .replace(/\/+$/, '').split('?')[0].split('#')[0].toLowerCase();
                const existingLinkedIn = await LinkedInContact.findOne({
                    profileUrl: { $in: [normalizedUrl, normalizedUrl + '/'] }
                }).lean();
                if (existingLinkedIn) {
                    const immediateUpdate: Record<string, any> = {};
                    if (existingLinkedIn.profilePhotoUrl) immediateUpdate.profilePhotoUrl = existingLinkedIn.profilePhotoUrl;
                    if (existingLinkedIn.currentPosition) immediateUpdate.position = existingLinkedIn.currentPosition;
                    immediateUpdate.linkedInContactId = existingLinkedIn._id;
                    if (Object.keys(immediateUpdate).length > 0) {
                        await CrmContact.updateOne({ _id: contact._id }, { $set: immediateUpdate });
                        console.log(`🔗 Immediate sync: New CRM contact ${contact._id} synced with existing LinkedIn data`);
                    }
                }
            } catch (syncErr: any) {
                console.error(`Immediate LinkedIn sync failed:`, syncErr.message);
            }

            // Then trigger prospecting for fresh data
            const tenant = linkedinService.getTenant(userId.toString());
            tenant.enqueueUrl(contact.linkedInProfileUrl).catch(err => {
                console.error(`Auto-prospecting failed for new contact ${contact._id}:`, err);
            });
        }

        // ── Auto-link contact to company's Deal(s) ──
        const companyId = contact.company;
        if (companyId) {
            try {
                const companyDeals = await Deal.find({ company: companyId });
                for (const deal of companyDeals) {
                    const alreadyLinked = deal.contacts.some(c => c.toString() === contact._id.toString());
                    if (!alreadyLinked) {
                        deal.contacts.push(contact._id);
                        if (!deal.primaryContact) {
                            deal.primaryContact = contact._id;
                        }
                        await deal.save();
                        console.log(`🔗 Auto-linked contact "${contact.fullName}" to Deal "${deal.title}"`);
                    }
                }
            } catch (linkErr: any) {
                console.error(`⚠️ Auto-link contact to deal failed:`, linkErr.message);
            }
        }

        const populatedContact = await CrmContact.findById(contact._id)
            .populate('company', 'name logo sector website')
            .populate('companies', 'name logo sector website localesCount costPerLocation')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .populate('linkedInContactId')
            .populate('partner', 'name')
            .lean();

        res.status(201).json(populatedContact);
    } catch (err: any) {
        console.error('CRM create contact error:', err.message);
        res.status(500).json({ error: 'Failed to create contact' });
    }
});

// ── GET /contacts/:id — Detail with activities + tasks ───────
router.get('/contacts/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const contact = await CrmContact.findOne({ _id: req.params.id })
            .populate('company', 'name logo sector website')
            .populate('companies', 'name logo sector website localesCount costPerLocation')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .populate('linkedInContactId')
            .populate('partner', 'name')
            .lean();

        if (!contact) return res.status(404).json({ error: 'Contact not found' });

        const [tasks, activities, deals] = await Promise.all([
            Task.find({ contact: req.params.id })
                .sort({ status: 1, dueDate: 1 }).lean(),
            Activity.find({ contact: req.params.id })
                .sort({ createdAt: -1 }).limit(30).lean(),
            Deal.find({ primaryContact: req.params.id })
                .populate('company', 'name logo themeColor sector localesCount')
                .populate('assignedTo', 'name email profilePhotoUrl')
                .sort({ createdAt: -1 }).lean(),
        ]);

        // Enrich deals with daysInStatus and pendingTasks
        const dealIds = deals.map(d => d._id);
        const taskCounts = await Task.aggregate([
            { $match: { deal: { $in: dealIds }, status: { $in: ['pending', 'in_progress'] } } },
            { $group: { _id: '$deal', count: { $sum: 1 } } },
        ]);
        const taskMap: Record<string, number> = {};
        for (const t of taskCounts) taskMap[t._id.toString()] = t.count;

        const enrichedDeals = deals.map(deal => ({
            ...deal,
            pendingTasks: taskMap[deal._id.toString()] || 0,
            daysInStatus: (deal as any).statusHistory?.length > 0
                ? Math.floor((Date.now() - new Date((deal as any).statusHistory[(deal as any).statusHistory.length - 1].changedAt).getTime()) / (1000 * 60 * 60 * 24))
                : Math.floor((Date.now() - new Date(deal.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
        }));

        res.json({ ...contact, tasks, activities, deals: enrichedDeals });
    } catch (err: any) {
        console.error('CRM contact detail error:', err.message);
        res.status(500).json({ error: 'Failed to fetch contact' });
    }
});

// ── PATCH /contacts/:id — Update contact ─────────────────────
router.patch('/contacts/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();

        // Fetch original to detect if the LinkedIn URL actually changed
        const originalContact = await CrmContact.findOne({ _id: req.params.id }).lean();
        if (!originalContact) return res.status(404).json({ error: 'Contact not found' });

        const isLinkedInUrlNewOrChanged = req.body.linkedInProfileUrl &&
            req.body.linkedInProfileUrl !== originalContact.linkedInProfileUrl;

        const contact = await CrmContact.findOneAndUpdate(
            { _id: req.params.id },
            { $set: req.body },
            { new: true, runValidators: true }
        ).lean();

        if (!contact) return res.status(404).json({ error: 'Contact not found' });

        // Auto-prospect if LinkedIn URL was just added/updated
        if (isLinkedInUrlNewOrChanged) {
            // First: Check if there's already a LinkedInContact with this URL
            // and immediately sync photo/position (avoids waiting for prospecting)
            try {
                const normalizedUrl = req.body.linkedInProfileUrl
                    .replace(/\/+$/, '').split('?')[0].split('#')[0].toLowerCase();
                const existingLinkedIn = await LinkedInContact.findOne({
                    profileUrl: { $in: [normalizedUrl, normalizedUrl + '/'] }
                }).lean();
                if (existingLinkedIn) {
                    const immediateUpdate: Record<string, any> = {};
                    // Only sync if they were empty in the original contact
                    if (existingLinkedIn.profilePhotoUrl && !originalContact.profilePhotoUrl) {
                        immediateUpdate.profilePhotoUrl = existingLinkedIn.profilePhotoUrl;
                    }
                    if (existingLinkedIn.currentPosition && !originalContact.position) {
                        immediateUpdate.position = existingLinkedIn.currentPosition;
                    }
                    immediateUpdate.linkedInContactId = existingLinkedIn._id;
                    if (Object.keys(immediateUpdate).length > 0) {
                        await CrmContact.updateOne({ _id: req.params.id }, { $set: immediateUpdate });
                        console.log(`🔗 Immediate sync: Updated CRM contact ${req.params.id} with LinkedIn data (photo, position)`);
                    }
                }
            } catch (syncErr: any) {
                console.error(`Immediate LinkedIn sync failed:`, syncErr.message);
            }

            // Then: trigger prospecting for fresh data
            const tenant = linkedinService.getTenant(userId);
            tenant.enqueueUrl(req.body.linkedInProfileUrl).catch(err => {
                console.error(`Auto-prospecting failed for updated contact ${contact._id}:`, err);
            });
        }

        res.json(contact);
    } catch (err: any) {
        console.error('CRM update contact error:', err.message);
        res.status(500).json({ error: 'Failed to update contact' });
    }
});

// ── POST /contacts/:id/link-linkedin — Link with LinkedIn ────
router.post('/contacts/:id/link-linkedin', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const { linkedInContactId } = req.body;

        if (!linkedInContactId) {
            return res.status(400).json({ error: 'linkedInContactId is required' });
        }

        // Find the LinkedIn contact
        const linkedInContact = await LinkedInContact.findById(linkedInContactId).lean();
        if (!linkedInContact) {
            return res.status(404).json({ error: 'LinkedIn contact not found' });
        }

        // Update CRM contact with LinkedIn data
        const updateData: any = {
            linkedInContactId,
        };
        // Import relevant enriched data if available
        if (linkedInContact.profilePhotoUrl) updateData.profilePhotoUrl = linkedInContact.profilePhotoUrl;
        if (linkedInContact.currentPosition && !req.body.position) updateData.position = linkedInContact.currentPosition;

        const contact = await CrmContact.findOneAndUpdate(
            { _id: req.params.id },
            { $set: updateData },
            { new: true }
        )
            .populate('linkedInContactId')
            .lean();

        if (!contact) return res.status(404).json({ error: 'CRM Contact not found' });

        res.json({ success: true, contact, linkedInData: linkedInContact });
    } catch (err: any) {
        console.error('CRM link LinkedIn error:', err.message);
        res.status(500).json({ error: 'Failed to link LinkedIn contact' });
    }
});

// ── DELETE /contacts/:id — Delete contact ────────────────────
router.delete('/contacts/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();

        // Check for active deals
        const activeDeals = await Deal.countDocuments({
            $or: [{ primaryContact: req.params.id }, { contacts: req.params.id }],
            status: { $nin: ['ganado', 'perdido'] },
        });
        if (activeDeals > 0) {
            return res.status(400).json({ error: `No se puede eliminar: el contacto está en ${activeDeals} negocio(s) activo(s)` });
        }

        const result = await CrmContact.deleteOne({ _id: req.params.id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Contact not found' });

        res.json({ success: true });
    } catch (err: any) {
        console.error('CRM delete contact error:', err.message);
        res.status(500).json({ error: 'Failed to delete contact' });
    }
});

// ════════════════════════════════════════════════════════════════
//  DEALS
// ════════════════════════════════════════════════════════════════

// ── GET /deals — Pipeline view (grouped by status) ───────────
router.get('/deals', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const { company, assignedTo } = req.query;

        const query: any = {};
        if (company) query.company = company;
        if (assignedTo) query.assignedTo = assignedTo;

        const deals = await Deal.find(query)
            .populate('company', 'name logo sector localesCount costPerLocation')
            .populate('primaryContact', 'fullName position profilePhotoUrl')
            .populate('contacts', 'fullName position profilePhotoUrl email phone')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .sort({ createdAt: -1 })
            .lean();

        // Get pipeline config to order columns
        const config = await PipelineConfig.getOrCreate(userId);
        const activeStages = config.stages
            .filter(s => s.isActive)
            .sort((a, b) => a.order - b.order);

        // Group deals by status
        const pipeline: Record<string, any> = {};
        for (const stage of activeStages) {
            pipeline[stage.key] = {
                key: stage.key,
                label: stage.label,
                color: stage.color,
                isFinal: stage.isFinal,
                order: stage.order,
                deals: [] as any[],
            };
        }

        // Attach task counts per deal
        const dealIds = deals.map(d => d._id);
        const taskCounts = await Task.aggregate([
            { $match: { deal: { $in: dealIds }, status: { $in: ['pending', 'in_progress'] } } },
            { $group: { _id: '$deal', count: { $sum: 1 } } },
        ]);
        const taskMap: Record<string, number> = {};
        for (const t of taskCounts) taskMap[t._id.toString()] = t.count;

        for (const deal of deals) {
            const status = deal.status;
            const enrichedDeal = {
                ...deal,
                pendingTasks: taskMap[deal._id.toString()] || 0,
                daysInStatus: deal.statusHistory && deal.statusHistory.length > 0
                    ? Math.floor((Date.now() - new Date(deal.statusHistory[deal.statusHistory.length - 1].changedAt).getTime()) / (1000 * 60 * 60 * 24))
                    : Math.floor((Date.now() - new Date(deal.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
            };
            if (pipeline[status]) {
                pipeline[status].deals.push(enrichedDeal);
            }
            // Deals with inactive/removed statuses are silently skipped in the Kanban
        }

        res.json({ stages: Object.values(pipeline) });
    } catch (err: any) {
        console.error('CRM deals pipeline error:', err.message);
        res.status(500).json({ error: 'Failed to fetch deals' });
    }
});

import mongoose from 'mongoose';

// ── GET /deals/:id — Get a single deal ───────────────────────
router.get('/deals/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const dealId = req.params.id;

        // 1. Validación estricta de parámetros de entrada (Seguridad y Robustez)
        if (!mongoose.isValidObjectId(dealId)) {
            console.warn(`[WARN] Intento de acceso a Deal con ID inválido: ${dealId} por el usuario: ${userId}`);
            return res.status(400).json({ error: 'El ID proporcionado no tiene un formato válido.' });
        }

        console.log(`[INFO] Fetching Deal ID: ${dealId} para el usuario: ${userId}`);

        // 2. Consulta a BD optimizada usando lean() y proyecciones específicas
        const deal = await Deal.findOne({ _id: dealId })
            .populate('company', 'name logo sector localesCount')
            .populate('primaryContact', 'fullName position profilePhotoUrl email phone')
            .populate('contacts', 'fullName position profilePhotoUrl email phone')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .lean();

        // 3. Manejo de caso borde: Recurso inexistente o sin permisos
        if (!deal) {
            console.warn(`[WARN] Deal no encontrado o acceso denegado. Deal ID: ${dealId}, Usuario: ${userId}`);
            return res.status(404).json({ error: 'Oportunidad de negocio no encontrada.' });
        }

        // 4. Respuesta exitosa
        console.log(`[SUCCESS] Deal ID: ${dealId} recuperado exitosamente.`);
        res.json(deal);
    } catch (err: any) {
        // 5. Manejo centralizado de excepciones y observabilidad
        console.error(`[ERROR] Fallo crítico al obtener el Deal ID: ${req.params.id}. Detalles:`, err.message);
        res.status(500).json({ error: 'Error interno del servidor al procesar la solicitud del Deal.' });
    }
});

// ── POST /deals — Create deal ────────────────────────────────
router.post('/deals', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();

        // Validate status against pipeline config
        const validKeys = await PipelineConfig.getStageKeys(userId);
        const status = req.body.status || validKeys[0] || 'lead';

        if (!validKeys.includes(status)) {
            return res.status(400).json({ error: `Invalid status "${status}". Valid: ${validKeys.join(', ')}` });
        }

        const deal = await Deal.create({ ...req.body, status, assignedTo: req.body.assignedTo || userId, userId });
        res.status(201).json(deal);
    } catch (err: any) {
        console.error('CRM create deal error:', err.message);
        res.status(500).json({ error: 'Failed to create deal' });
    }
});

// ── GET /deals/:id/activities — Aggregated timeline ──────────
router.get('/deals/:id/activities', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const dealId = req.params.id;

        // Find the deal to get its contacts
        const deal = await Deal.findOne({ _id: dealId }).lean();
        if (!deal) return res.status(404).json({ error: 'Deal not found' });

        // Build $or query: activities linked to the deal OR to any of its contacts
        const orConditions: any[] = [{ deal: dealId }];
        if (deal.primaryContact) orConditions.push({ contact: deal.primaryContact });
        if ((deal as any).contacts?.length) {
            for (const cId of (deal as any).contacts) {
                const cStr = cId.toString();
                // Avoid duplicating primaryContact
                if (cStr !== deal.primaryContact?.toString()) {
                    orConditions.push({ contact: cId });
                }
            }
        }

        const activities = await Activity.find({ $or: orConditions })
            .populate('contact', 'fullName profilePhotoUrl')
            .populate('deal', 'title')
            .populate('company', 'name logo')
            .populate('createdBy', 'name profilePhotoUrl')
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        // Deduplicate by _id (in case an activity references both deal and contact)
        const seen = new Set<string>();
        const unique = activities.filter(a => {
            const id = a._id.toString();
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });

        res.json({ activities: unique, total: unique.length });
    } catch (err: any) {
        console.error('CRM deal activities error:', err.message);
        res.status(500).json({ error: 'Failed to fetch deal activities' });
    }
});

// ── PATCH /deals/:id — Update deal (status change = drag) ────
router.patch('/deals/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();

        // Validate new status if provided
        if (req.body.status) {
            const validKeys = await PipelineConfig.getStageKeys(userId);
            if (!validKeys.includes(req.body.status)) {
                return res.status(400).json({ error: `Invalid status "${req.body.status}"` });
            }
        }

        const deal = await Deal.findOne({ _id: req.params.id });
        if (!deal) return res.status(404).json({ error: 'Deal not found' });

        const previousStatus = deal.status;

        // Apply updates
        for (const [key, value] of Object.entries(req.body)) {
            (deal as any)[key] = value;
        }

        // Track status change
        if (req.body.status && req.body.status !== previousStatus) {
            deal.statusHistory.push({
                from: previousStatus,
                to: req.body.status,
                changedAt: new Date(),
                changedBy: (req as any).user._id,
            });

            // Auto-set closedAt for final statuses
            const config = await PipelineConfig.getOrCreate(userId);
            const targetStage = config.stages.find(s => s.key === req.body.status);
            if (targetStage?.isFinal && !deal.closedAt) {
                deal.closedAt = new Date();
            }
        }

        await deal.save();

        const populated = await Deal.findById(deal._id)
            .populate('company', 'name logo sector')
            .populate('primaryContact', 'fullName position profilePhotoUrl')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .lean();

        res.json(populated);
    } catch (err: any) {
        console.error('CRM update deal error:', err.message);
        res.status(500).json({ error: 'Failed to update deal' });
    }
});

// ════════════════════════════════════════════════════════════════
//  TASKS
// ════════════════════════════════════════════════════════════════

// ── GET /tasks — Task center with filters ────────────────────
router.get('/tasks', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const { assignedTo, priority, status, type, company, deal, contact, overdue, page = '1', limit = '50' } = req.query;

        const pageNum = Math.max(1, parseInt(page as string) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 50));

        const query: any = {};
        if (assignedTo) query.assignedTo = assignedTo;
        if (priority) query.priority = priority;
        if (status) {
            const statusStr = status as string;
            query.status = statusStr.includes(',') ? { $in: statusStr.split(',') } : statusStr;
        }
        if (type) query.type = type;
        if (company) query.company = company;
        if (deal) query.deal = deal;
        if (contact) query.contact = contact;
        if (overdue === 'true') {
            query.dueDate = { $lt: new Date() };
            query.status = { $in: ['pending', 'in_progress'] };
        }

        const [tasks, total] = await Promise.all([
            Task.find(query)
                .populate('contact', 'fullName profilePhotoUrl')
                .populate('deal', 'title')
                .populate('company', 'name logo')
                .populate('assignedTo', 'name email profilePhotoUrl')
                .sort({ dueDate: 1, priority: -1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
            Task.countDocuments(query),
        ]);

        res.json({ tasks, total, page: pageNum, pages: Math.ceil(total / limitNum) });
    } catch (err: any) {
        console.error('CRM tasks list error:', err.message);
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});

// ── GET /tasks/:id — Get a single task ───────────────────────
router.get('/tasks/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const taskId = req.params.id;

        if (!mongoose.isValidObjectId(taskId)) {
            return res.status(400).json({ error: 'El ID proporcionado no tiene un formato válido.' });
        }

        const task = await Task.findOne({ _id: taskId })
            .populate('contact', 'fullName profilePhotoUrl email phone')
            .populate('deal', 'title')
            .populate('company', 'name logo sector localesCount')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .lean();

        if (!task) {
            return res.status(404).json({ error: 'Tarea no encontrada.' });
        }

        res.json(task);
    } catch (err: any) {
        console.error('CRM get task error:', err.message);
        res.status(500).json({ error: 'Failed to fetch task' });
    }
});

// ── POST /tasks — Create task ────────────────────────────────
router.post('/tasks', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const task = await Task.create({ ...req.body, assignedTo: req.body.assignedTo || userId, userId });

        const populated = await Task.findById(task._id)
            .populate('contact', 'fullName')
            .populate('deal', 'title')
            .populate('company', 'name')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .lean();

        res.status(201).json(populated);
    } catch (err: any) {
        console.error('CRM create task error:', err.message);
        res.status(500).json({ error: 'Failed to create task' });
    }
});

// ── PATCH /tasks/:id — Update task ───────────────────────────
router.patch('/tasks/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const task = await Task.findOneAndUpdate(
            { _id: req.params.id },
            { $set: req.body },
            { new: true, runValidators: true }
        )
            .populate('contact', 'fullName')
            .populate('deal', 'title')
            .populate('company', 'name')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .lean();

        if (!task) return res.status(404).json({ error: 'Task not found' });
        res.json(task);
    } catch (err: any) {
        console.error('CRM update task error:', err.message);
        res.status(500).json({ error: 'Failed to update task' });
    }
});

// ── PATCH /tasks/:id/complete — Complete task + auto Activity ─
router.patch('/tasks/:id/complete', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const task = await Task.findOne({ _id: req.params.id });
        if (!task) return res.status(404).json({ error: 'Task not found' });

        task.status = 'completed';
        task.completedAt = new Date();
        await task.save();

        // Auto-create Activity from completed task
        await Activity.create({
            type: 'task_completed',
            description: `Tarea completada: ${task.title}`,
            contact: task.contact || undefined,
            deal: task.deal || undefined,
            company: task.company || undefined,
            task: task._id,
            completedAt: new Date(),
            createdBy: userId,
            userId,
        });

        const populated = await Task.findById(task._id)
            .populate('contact', 'fullName')
            .populate('deal', 'title')
            .populate('company', 'name')
            .lean();

        res.json({ success: true, task: populated });
    } catch (err: any) {
        console.error('CRM complete task error:', err.message);
        res.status(500).json({ error: 'Failed to complete task' });
    }
});

// ── DELETE /tasks/:id — Cancel/delete task ───────────────────
router.delete('/tasks/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const task = await Task.findOne({ _id: req.params.id }).lean();
        if (!task) return res.status(404).json({ error: 'Task not found' });

        await Task.deleteOne({ _id: req.params.id });
        res.json({ success: true });
    } catch (err: any) {
        console.error('CRM delete task error:', err.message);
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

// ════════════════════════════════════════════════════════════════
//  ACTIVITIES
// ════════════════════════════════════════════════════════════════

// ── GET /activities — Timeline ───────────────────────────────
router.get('/activities', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const { contact, deal, company, type, unified, page = '1', limit = '30' } = req.query;

        const pageNum = Math.max(1, parseInt(page as string) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 30));

        // If 'unified' is true, we aggregate across multiple collections for a richer dashboard feed
        if (unified === 'true') {
            const [activities, tasks, deals, companies] = await Promise.all([
                Activity.find({}).populate('contact', 'fullName').populate('company', 'name').populate('createdBy', 'name profilePhotoUrl').sort({ createdAt: -1 }).limit(limitNum).lean(),
                Task.find({}).populate('contact', 'fullName').populate('company', 'name').populate('assignedTo', 'name profilePhotoUrl').sort({ createdAt: -1 }).limit(limitNum).lean(),
                Deal.find({}).populate('company', 'name').populate('assignedTo', 'name profilePhotoUrl').sort({ createdAt: -1 }).limit(limitNum).lean(),
                Company.find({}).populate('assignedTo', 'name profilePhotoUrl').sort({ createdAt: -1 }).limit(limitNum).lean()
            ]);

            const unifiedFeed: any[] = [];

            activities.forEach(a => unifiedFeed.push({
                _id: a._id.toString(),
                type: a.type,
                description: a.description,
                createdAt: a.createdAt,
                contact: a.contact,
                company: a.company,
                createdBy: a.createdBy,
                source: 'activity'
            }));

            tasks.forEach(t => unifiedFeed.push({
                _id: t._id.toString(),
                type: t.status === 'completed' ? 'task_completed' : 'task_created',
                description: `Tarea: ${t.title} (${t.status})`,
                createdAt: t.createdAt,
                contact: t.contact,
                company: t.company,
                createdBy: (t as any).assignedTo,
                source: 'task'
            }));

            deals.forEach(d => unifiedFeed.push({
                _id: d._id.toString(),
                type: 'deal_created',
                description: `Nuevo Deal: ${d.title} (${d.currency} ${d.value})`,
                createdAt: d.createdAt,
                company: d.company,
                createdBy: (d as any).assignedTo,
                source: 'deal'
            }));

            companies.forEach(c => unifiedFeed.push({
                _id: c._id.toString(),
                type: 'company_created',
                description: `Nueva Empresa: ${(c as any).name}`,
                createdAt: c.createdAt,
                createdBy: (c as any).assignedTo,
                source: 'company'
            }));

            unifiedFeed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            const paginatedFeed = unifiedFeed.slice((pageNum - 1) * limitNum, pageNum * limitNum);

            return res.json({ activities: paginatedFeed, total: unifiedFeed.length, page: pageNum, pages: Math.ceil(unifiedFeed.length / limitNum) });
        }


        // Standard Activity query
        const query: any = {};
        if (contact) query.contact = contact;
        if (deal) query.deal = deal;
        if (company) query.company = company;
        if (type) query.type = type;

        const [activities, total] = await Promise.all([
            Activity.find(query)
                .populate('contact', 'fullName profilePhotoUrl')
                .populate('deal', 'title')
                .populate('company', 'name logo')
                .populate('createdBy', 'name profilePhotoUrl')
                .sort({ createdAt: -1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
            Activity.countDocuments(query),
        ]);

        res.json({ activities, total, page: pageNum, pages: Math.ceil(total / limitNum) });
    } catch (err: any) {
        console.error('CRM activities list error:', err.message);
        res.status(500).json({ error: 'Failed to fetch activities' });
    }
});

// ── POST /activities — Register activity manually ────────────
router.post('/activities', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const activity = await Activity.create({
            ...req.body,
            createdBy: userId,
            userId,
        });
        const popActivity = await Activity.findById(activity._id).populate('createdBy', 'name email profilePhotoUrl');
        res.status(201).json(popActivity);
    } catch (err: any) {
        console.error('CRM create activity error:', err.message, err.errors ? JSON.stringify(err.errors) : '');
        res.status(500).json({ error: 'Failed to create activity' });
    }
});

// ════════════════════════════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════════════════════════════

// ── GET /dashboard/stats — Aggregated CRM statistics ─────────
router.get('/dashboard/stats', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const userIdStr = userId.toString();

        // Get pipeline config
        const config = await PipelineConfig.getOrCreate(userIdStr);
        const finalStageKeys = config.stages.filter(s => s.isFinal).map(s => s.key);

        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

        const [
            totalCompanies,
            totalContacts,
            dealsByStatus,
            pipelineValue,
            tasksPendingToday,
            tasksOverdue,
            activitiesThisWeek,
        ] = await Promise.all([
            Company.countDocuments({}),
            CrmContact.countDocuments({}),
            Deal.aggregate([
                { $match: {} },
                { $group: { _id: '$status', count: { $sum: 1 }, totalValue: { $sum: '$value' } } },
            ]),
            Deal.aggregate([
                { $match: { status: { $nin: finalStageKeys } } },
                { $group: { _id: null, total: { $sum: '$value' } } },
            ]),
            Task.countDocuments({
                dueDate: { $gte: todayStart, $lte: todayEnd },
                status: { $in: ['pending', 'in_progress'] },
            }),
            Task.countDocuments({
                dueDate: { $lt: todayStart },
                status: { $in: ['pending', 'in_progress'] },
            }),
            Activity.countDocuments({ createdAt: { $gte: weekAgo } }),
        ]);

        const dealCounts: Record<string, { count: number; value: number }> = {};
        for (const d of dealsByStatus) {
            dealCounts[d._id] = { count: d.count, value: d.totalValue };
        }

        res.json({
            totalCompanies,
            totalContacts,
            totalDeals: dealsByStatus.reduce((acc, d) => acc + d.count, 0),
            pipelineValue: pipelineValue[0]?.total || 0,
            dealsByStatus: dealCounts,
            tasksPendingToday,
            tasksOverdue,
            activitiesThisWeek,
        });
    } catch (err: any) {
        console.error('CRM dashboard stats error:', err.message);
        res.status(500).json({ error: 'Failed to fetch dashboard stats' });
    }
});

export default router;
