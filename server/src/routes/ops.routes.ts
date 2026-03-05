import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authMiddleware } from '../middleware/auth.middleware';
import { OpsPipelineConfig } from '../models/ops-pipeline-config.model';
import { Deal } from '../models/deal.model';
import { Task } from '../models/task.model';
import { Activity } from '../models/activity.model';
import { CrmContact } from '../models/crm-contact.model';
import { Company } from '../models/company.model';
import { Goal } from '../models/goal.model';
import { WeeklyReport } from '../models/weeklyReport.model';

const router = Router();

// ── Middleware: Require 'operaciones' platform ────────────────

const requireOpsPlatform = (req: Request, res: Response, next: Function) => {
    const user = req.user as any;
    if (!user?.platforms?.includes('operaciones')) {
        return res.status(403).json({ error: 'No tienes acceso a la plataforma de operaciones.' });
    }
    next();
};

// Apply auth + platform check to all routes
router.use(authMiddleware, requireOpsPlatform);

// ── One-time migration: backfill existing 'ganado' deals ─────
router.post('/migrate-ganado', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const result = await Deal.updateMany(
            { status: 'ganado', opsStatus: { $in: [null, undefined] } },
            {
                $set: {
                    opsStatus: 'anticipo',
                    opsAssignedTo: userId,
                    opsStartDate: new Date(),
                }
            }
        );
        console.log(`[OPS-MIGRATE] Backfilled ${result.modifiedCount} ganado deals into ops pipeline`);
        return res.json({ migrated: result.modifiedCount });
    } catch (error) {
        console.error(`[OPS-MIGRATE] Error: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Migration failed' });
    }
});

// ══════════════════════════════════════════════════════════════
// PIPELINE CONFIG
// ══════════════════════════════════════════════════════════════

/**
 * @route   GET /api/ops/pipeline/config
 * @desc    Get the ops pipeline config (or create default)
 */
router.get('/pipeline/config', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const config = await OpsPipelineConfig.getOrCreate(userId);
        return res.json(config);
    } catch (error) {
        console.error(`[OPS] Error getting pipeline config: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route   PUT /api/ops/pipeline/config
 * @desc    Update the ops pipeline stages
 */
router.put('/pipeline/config', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const { stages } = req.body;

        if (!Array.isArray(stages) || stages.length === 0) {
            return res.status(400).json({ error: 'Se requiere al menos una etapa.' });
        }

        const config = await OpsPipelineConfig.getOrCreate(userId);
        config.stages = stages;
        await config.save();

        return res.json(config);
    } catch (error) {
        console.error(`[OPS] Error updating pipeline config: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════════════════════════
// OPS DEALS (deals in operations pipeline)
// ══════════════════════════════════════════════════════════════

/**
 * @route   GET /api/ops/deals
 * @desc    Get all deals that are in operations pipeline (opsStatus is set)
 */
router.get('/deals', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const { status } = req.query;

        const filter: any = { opsStatus: { $ne: null } };
        if (status) filter.opsStatus = status;

        const deals = await Deal.find(filter)
            .populate('company', 'name logo sector')
            .populate('primaryContact', 'fullName position profilePhotoUrl')
            .populate('opsAssignedTo', 'name email profilePhotoUrl')
            .populate('assignedTo', 'name email')
            .sort({ opsStartDate: -1 })
            .lean()
            .exec();

        return res.json(deals);
    } catch (error) {
        console.error(`[OPS] Error getting ops deals: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route   GET /api/ops/deals/grouped
 * @desc    Get ops deals grouped by opsStatus for Kanban view
 */
router.get('/deals/grouped', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;

        const deals = await Deal.find({ opsStatus: { $ne: null } })
            .populate('company', 'name logo sector')
            .populate('primaryContact', 'fullName position profilePhotoUrl')
            .populate('opsAssignedTo', 'name email profilePhotoUrl')
            .populate('assignedTo', 'name email')
            .sort({ opsStartDate: -1 })
            .lean()
            .exec();

        const grouped: Record<string, any[]> = {};
        for (const deal of deals) {
            const status = (deal as any).opsStatus;
            if (!grouped[status]) grouped[status] = [];
            grouped[status].push(deal);
        }

        return res.json(grouped);
    } catch (error) {
        console.error(`[OPS] Error getting grouped ops deals: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route   PUT /api/ops/deals/:dealId/activate
 * @desc    Move a "ganado" deal into the operations pipeline
 */
router.put('/deals/:dealId/activate', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const { dealId } = req.params;
        const { opsAssignedTo } = req.body;

        const deal = await Deal.findOne({ _id: dealId });
        if (!deal) {
            return res.status(404).json({ error: 'Deal no encontrado.' });
        }

        if (deal.status !== 'ganado') {
            return res.status(400).json({ error: 'Solo se pueden activar deals con estado "Ganado".' });
        }

        // Get the first stage key
        const stageKeys = await OpsPipelineConfig.getStageKeys(userId);
        if (stageKeys.length === 0) {
            return res.status(400).json({ error: 'No hay etapas configuradas en el pipeline de operaciones.' });
        }

        deal.opsStatus = stageKeys[0]; // First stage
        deal.opsAssignedTo = opsAssignedTo || (req as any).user._id;
        deal.opsStartDate = new Date();
        await deal.save();

        const populated = await Deal.findById(deal._id)
            .populate('company', 'name logo sector')
            .populate('primaryContact', 'fullName position profilePhotoUrl')
            .populate('opsAssignedTo', 'name email profilePhotoUrl')
            .lean();

        return res.json(populated);
    } catch (error) {
        console.error(`[OPS] Error activating deal: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route   PUT /api/ops/deals/:dealId/status
 * @desc    Update the ops status of a deal (move in Kanban)
 */
router.put('/deals/:dealId/status', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const { dealId } = req.params;
        const { opsStatus } = req.body;

        if (!opsStatus) {
            return res.status(400).json({ error: 'Se requiere el nuevo estado.' });
        }

        // Validate stage key
        const stageKeys = await OpsPipelineConfig.getStageKeys(userId);
        if (!stageKeys.includes(opsStatus)) {
            return res.status(400).json({ error: `Estado "${opsStatus}" no es válido.` });
        }

        const deal = await Deal.findOneAndUpdate(
            { _id: dealId, opsStatus: { $ne: null } },
            { opsStatus },
            { new: true }
        )
            .populate('company', 'name logo sector')
            .populate('primaryContact', 'fullName position profilePhotoUrl')
            .populate('opsAssignedTo', 'name email profilePhotoUrl')
            .lean();

        if (!deal) {
            return res.status(404).json({ error: 'Deal no encontrado en el pipeline de operaciones.' });
        }

        return res.json(deal);
    } catch (error) {
        console.error(`[OPS] Error updating ops status: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════════════════════════
// OPS STATS
// ══════════════════════════════════════════════════════════════

/**
 * @route   GET /api/ops/stats
 * @desc    Get operations dashboard statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;

        const [opsDeals, opsTasks, overdueTasks] = await Promise.all([
            Deal.find({ opsStatus: { $ne: null } }).lean(),
            Task.find({ userId, status: { $in: ['pending', 'in_progress'] } }).lean(),
            Task.findOverdue(userId),
        ]);

        // Group deals by ops status
        const byStatus: Record<string, number> = {};
        let totalValue = 0;
        for (const deal of opsDeals) {
            const status = (deal as any).opsStatus;
            byStatus[status] = (byStatus[status] || 0) + 1;
            totalValue += (deal as any).value || 0;
        }

        return res.json({
            totalDeals: opsDeals.length,
            totalValue,
            byStatus,
            pendingTasks: opsTasks.length,
            overdueTasks: overdueTasks.length,
        });
    } catch (error) {
        console.error(`[OPS] Error getting stats: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════════════════════════
// OPS COMPANIES (only companies with active ops deals)
// ══════════════════════════════════════════════════════════════

/**
 * @route   GET /api/ops/companies
 * @desc    Get companies that have deals in the ops pipeline
 */
router.get('/companies', async (req: Request, res: Response) => {
    try {
        // Find all deals with opsStatus set
        const opsDeals = await Deal.find({ opsStatus: { $ne: null } })
            .select('company opsStatus value title')
            .lean();

        // Extract unique company IDs
        const companyIds = [...new Set(opsDeals.map(d => d.company?.toString()).filter(Boolean))];

        if (companyIds.length === 0) {
            return res.json([]);
        }

        const companies = await Company.find({ _id: { $in: companyIds } })
            .populate('assignedTo', 'name email profilePhotoUrl')
            .sort({ name: 1 })
            .lean();

        // Enrich with ops deal info
        const enriched = companies.map(c => {
            const companyDeals = opsDeals.filter(d => d.company?.toString() === (c as any)._id.toString());
            return {
                ...c,
                opsDealsCount: companyDeals.length,
                opsStatuses: [...new Set(companyDeals.map(d => (d as any).opsStatus))],
                opsTotalValue: companyDeals.reduce((sum, d) => sum + ((d as any).value || 0), 0),
            };
        });

        return res.json(enriched);
    } catch (error) {
        console.error(`[OPS] Error getting ops companies: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════════════════════════
// OPS CONTACTS (only contacts from companies with ops deals)
// ══════════════════════════════════════════════════════════════

/**
 * @route   GET /api/ops/contacts
 * @desc    Get contacts whose company has deals in the ops pipeline
 */
router.get('/contacts', async (req: Request, res: Response) => {
    try {
        // Find all deals with opsStatus set
        const opsDeals = await Deal.find({ opsStatus: { $ne: null } })
            .select('company')
            .lean();

        const companyIds = [...new Set(opsDeals.map(d => d.company?.toString()).filter(Boolean))];

        if (companyIds.length === 0) {
            return res.json([]);
        }

        // Find contacts linked to those companies (via company or companies array)
        const contacts = await CrmContact.find({
            $or: [
                { company: { $in: companyIds } },
                { companies: { $in: companyIds } },
            ]
        })
            .populate('company', 'name logo sector')
            .populate('companies', 'name logo sector')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .sort({ fullName: 1 })
            .lean();

        return res.json(contacts);
    } catch (error) {
        console.error(`[OPS] Error getting ops contacts: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════════════════════════
// OPS TASKS (same system as commercial, platform = 'operaciones')
// ══════════════════════════════════════════════════════════════

/**
 * @route   GET /api/ops/tasks
 * @desc    Task center with filters — ops platform only
 */
router.get('/tasks', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const { assignedTo, priority, status, type, company, deal, contact, overdue, page = '1', limit = '50' } = req.query;

        const pageNum = Math.max(1, parseInt(page as string) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 50));

        const query: any = { platform: 'operaciones' };
        if (assignedTo) query.assignedTo = assignedTo;
        if (priority) query.priority = priority;
        if (status) {
            const statusStr = status as string;
            query.status = statusStr.includes(',') ? { $in: statusStr.split(',') } : statusStr;
        }
        if (type) query.type = type;
        if (company) query.company = company;
        if (contact) query.contact = contact;
        if (overdue === 'true') {
            query.dueDate = { $lt: new Date() };
            query.status = { $in: ['pending', 'in_progress'] };
        }

        const [tasks, total] = await Promise.all([
            Task.find(query)
                .populate('contact', 'fullName profilePhotoUrl phone email')
                .populate('deal', 'title')
                .populate('company', 'name logo localesCount')
                .populate('assignedTo', 'name email profilePhotoUrl')
                .sort({ dueDate: 1, priority: -1 })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .lean(),
            Task.countDocuments(query),
        ]);

        res.json({ tasks, total, page: pageNum, pages: Math.ceil(total / limitNum) });
    } catch (err: any) {
        console.error('[OPS] tasks list error:', err.message);
        res.status(500).json({ error: 'Failed to fetch ops tasks' });
    }
});

/**
 * @route   GET /api/ops/tasks/:id
 * @desc    Get a single ops task
 */
router.get('/tasks/:id', async (req: Request, res: Response) => {
    try {
        const taskId = req.params.id;
        if (!mongoose.isValidObjectId(taskId)) {
            return res.status(400).json({ error: 'El ID proporcionado no tiene un formato válido.' });
        }

        const task = await Task.findOne({ _id: taskId, platform: 'operaciones' })
            .populate('contact', 'fullName profilePhotoUrl email phone')
            .populate('deal', 'title')
            .populate('company', 'name logo sector localesCount franchiseCount ownedCount')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .lean();

        if (!task) {
            return res.status(404).json({ error: 'Tarea no encontrada.' });
        }

        res.json(task);
    } catch (err: any) {
        console.error('[OPS] get task error:', err.message);
        res.status(500).json({ error: 'Failed to fetch ops task' });
    }
});

/**
 * @route   POST /api/ops/tasks
 * @desc    Create ops task (platform = 'operaciones')
 */
router.post('/tasks', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;

        const safeBody = { ...req.body };
        if (safeBody.company === null || safeBody.company === '') delete safeBody.company;
        if (safeBody.contact === null || safeBody.contact === '') delete safeBody.contact;
        if (safeBody.deal === null || safeBody.deal === '') delete safeBody.deal;

        const task = await Task.create({
            ...safeBody,
            platform: 'operaciones',
            assignedTo: safeBody.assignedTo || userId,
            userId,
        });

        const populated = await Task.findById(task._id)
            .populate('contact', 'fullName profilePhotoUrl phone email')
            .populate('deal', 'title')
            .populate('company', 'name logo localesCount')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .lean();

        res.status(201).json(populated);
    } catch (err: any) {
        console.error('[OPS] create task error:', err.message, err.errors || err);
        res.status(500).json({ error: 'Failed to create ops task', details: err.message });
    }
});

/**
 * @route   PATCH /api/ops/tasks/:id
 * @desc    Update ops task
 */
router.patch('/tasks/:id', async (req: Request, res: Response) => {
    try {
        const safeBody = { ...req.body };
        if (safeBody.company === null || safeBody.company === '') delete safeBody.company;
        if (safeBody.contact === null || safeBody.contact === '') delete safeBody.contact;
        if (safeBody.deal === null || safeBody.deal === '') delete safeBody.deal;

        const task = await Task.findOneAndUpdate(
            { _id: req.params.id, platform: 'operaciones' },
            { $set: safeBody },
            { new: true, runValidators: true }
        )
            .populate('contact', 'fullName profilePhotoUrl phone email')
            .populate('deal', 'title')
            .populate('company', 'name logo localesCount')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .lean();

        if (!task) return res.status(404).json({ error: 'Task not found' });
        res.json(task);
    } catch (err: any) {
        console.error('[OPS] update task error:', err.message, err.errors || err);
        res.status(500).json({ error: 'Failed to update ops task', details: err.message });
    }
});

/**
 * @route   PATCH /api/ops/tasks/:id/complete
 * @desc    Complete ops task + auto Activity
 */
router.patch('/tasks/:id/complete', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;

        const task = await Task.findOne({ _id: req.params.id, platform: 'operaciones' });
        if (!task) return res.status(404).json({ error: 'Task not found' });

        task.status = 'completed';
        task.completedAt = new Date();
        await task.save();

        const populatedTask = await Task.findById(task._id)
            .populate('contact', 'fullName profilePhotoUrl phone email')
            .populate('deal', 'title')
            .populate('company', 'name logo localesCount')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .lean();

        // Intelligent mapping: task.type → activity.type
        const TASK_TO_ACTIVITY: Record<string, string> = {
            call: 'call',
            whatsapp: 'whatsapp',
            email: 'email',
            linkedin_message: 'linkedin_message',
            meeting: 'meeting',
        };

        const activityType = TASK_TO_ACTIVITY[task.type] || 'task_completed';

        const contactName = (populatedTask?.contact as any)?.fullName || '';
        const companyName = (populatedTask?.company as any)?.name || '';
        const contextParts = [contactName, companyName].filter(Boolean);
        const contextSuffix = contextParts.length ? ` — ${contextParts.join(' / ')}` : '';

        const DESCRIPTION_PREFIXES: Record<string, string> = {
            call: '📞 Llamada realizada',
            whatsapp: '💬 Mensaje de WhatsApp enviado',
            email: '✉️ Email enviado',
            linkedin_message: '🔗 Mensaje de LinkedIn enviado',
            meeting: '🤝 Reunión realizada',
            follow_up: '🔄 Seguimiento realizado',
            proposal: '📋 Propuesta enviada',
            research: '🔍 Investigación completada',
        };

        const prefix = DESCRIPTION_PREFIXES[task.type] || '✅ Tarea completada';
        const description = `${prefix}: ${task.title}${contextSuffix}`;

        await Activity.create({
            type: activityType,
            description,
            contact: task.contact || undefined,
            deal: task.deal || undefined,
            company: task.company || undefined,
            task: task._id,
            completedAt: new Date(),
            createdBy: userId,
            userId,
        });

        // Bug #4: Auto-complete goal if all linked tasks are now completed
        let goalCompleted = false;
        if ((task as any).goal) {
            const goalId = (task as any).goal;
            const pendingTasksForGoal = await Task.countDocuments({
                goal: goalId,
                status: { $ne: 'completed' },
            });
            if (pendingTasksForGoal === 0) {
                const goal = await Goal.findById(goalId);
                if (goal && goal.status === 'active') {
                    goal.status = 'completed';
                    goal.completedAt = new Date();
                    await goal.save();
                    goalCompleted = true;
                }
            }
        }

        res.json({ success: true, task: populatedTask, goalCompleted });
    } catch (err: any) {
        console.error('[OPS] complete task error:', err.message);
        res.status(500).json({ error: 'Failed to complete ops task' });
    }
});

/**
 * @route   PATCH /api/ops/tasks/:id/link-goal
 * @desc    Link or unlink a task to/from a goal
 */
router.patch('/tasks/:id/link-goal', async (req: Request, res: Response) => {
    try {
        const { goalId } = req.body;
        const task = await Task.findOne({ _id: req.params.id, platform: 'operaciones' });
        if (!task) return res.status(404).json({ error: 'Task not found' });

        (task as any).goal = goalId || null;
        await task.save();

        const populated = await Task.findById(task._id)
            .populate('company', 'name')
            .populate('contact', 'fullName phone email')
            .populate('goal', 'title category')
            .populate('assignedTo', 'name profilePhotoUrl')
            .lean();

        res.json({ success: true, task: populated });
    } catch (err: any) {
        console.error('[OPS] link-goal error:', err.message);
        res.status(500).json({ error: 'Failed to link task to goal' });
    }
});

/**
 * @route   DELETE /api/ops/tasks/:id
 * @desc    Delete ops task
 */
router.delete('/tasks/:id', async (req: Request, res: Response) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, platform: 'operaciones' }).lean();
        if (!task) return res.status(404).json({ error: 'Task not found' });

        await Task.deleteOne({ _id: req.params.id });
        res.json({ success: true });
    } catch (err: any) {
        console.error('[OPS] delete task error:', err.message);
        res.status(500).json({ error: 'Failed to delete ops task' });
    }
});

// ══════════════════════════════════════════════════════════════
// GOALS / METAS
// ══════════════════════════════════════════════════════════════

/**
 * @route   GET /api/ops/goals
 * @desc    Get all goals with optional filters
 */
router.get('/goals', async (req: Request, res: Response) => {
    try {
        const { status, company, category } = req.query;
        const filter: any = {};
        if (status) filter.status = status;
        if (company) filter.company = company;
        if (category) filter.category = category;

        const goals = await Goal.find(filter)
            .populate('company', 'name logo')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .sort({ createdAt: -1 })
            .lean();

        // Enrich each goal with task counts
        const goalIds = goals.map((g: any) => g._id);
        const taskAgg = await Task.aggregate([
            { $match: { goal: { $in: goalIds } } },
            {
                $group: {
                    _id: '$goal',
                    totalTasks: { $sum: 1 },
                    completedTasks: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                }
            },
        ]);
        const taskCountMap: Record<string, { totalTasks: number; completedTasks: number }> = {};
        for (const t of taskAgg) {
            taskCountMap[t._id.toString()] = { totalTasks: t.totalTasks, completedTasks: t.completedTasks };
        }
        const enrichedGoals = goals.map((g: any) => {
            const tc = taskCountMap[g._id.toString()] || { totalTasks: 0, completedTasks: 0 };
            return { ...g, taskCount: tc.totalTasks, completedTaskCount: tc.completedTasks };
        });

        // Compute weekly progress based on tasks completed this week per goal
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // Get tasks completed this week per goal
        const weeklyTaskAgg = await Task.aggregate([
            { $match: { goal: { $in: goalIds }, status: 'completed', completedAt: { $gte: weekAgo } } },
            { $group: { _id: '$goal', completedThisWeek: { $sum: 1 } } },
        ]);
        const weeklyTaskMap: Record<string, number> = {};
        for (const t of weeklyTaskAgg) {
            weeklyTaskMap[t._id.toString()] = t.completedThisWeek;
        }

        const totalGoals = enrichedGoals.length;
        const completedGoals = enrichedGoals.filter((g: any) => g.status === 'completed').length;
        const activeGoals = enrichedGoals.filter((g: any) => g.status === 'active');
        const avgProgress = activeGoals.length > 0
            ? Math.round(activeGoals.reduce((acc: number, g: any) => {
                const total = g.taskCount || 0;
                const completed = g.completedTaskCount || 0;
                const progress = total > 0 ? Math.min((completed / total) * 100, 100) : 0;
                return acc + progress;
            }, 0) / activeGoals.length)
            : 0;

        // Weekly progress: average of (tasksCompletedThisWeek / totalTasks) for active goals with tasks
        let weeklyProgressSum = 0;
        let goalsWithTasks = 0;
        for (const g of activeGoals as any[]) {
            const total = g.taskCount || 0;
            if (total > 0) {
                const completedThisWeek = weeklyTaskMap[g._id.toString()] || 0;
                weeklyProgressSum += (completedThisWeek / total) * 100;
                goalsWithTasks++;
            }
        }
        const weeklyAvg = goalsWithTasks > 0 ? Math.round(weeklyProgressSum / goalsWithTasks) : 0;

        // Feature #9: aggregate task counts across all goals
        let totalLinkedTasks = 0;
        let completedLinkedTasks = 0;
        for (const g of enrichedGoals) {
            totalLinkedTasks += (g as any).taskCount || 0;
            completedLinkedTasks += (g as any).completedTaskCount || 0;
        }

        return res.json({
            goals: enrichedGoals,
            stats: {
                totalGoals,
                completedGoals,
                avgProgress,
                weeklyProgress: weeklyAvg,
                totalLinkedTasks,
                completedLinkedTasks,
            },
        });
    } catch (error) {
        console.error(`[OPS] Error getting goals: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route   GET /api/ops/goals/:id
 * @desc    Get a single goal with tasks linked to it
 */
router.get('/goals/:id', async (req: Request, res: Response) => {
    try {
        const goalId = req.params.id;
        if (!mongoose.isValidObjectId(goalId)) {
            return res.status(400).json({ error: 'ID inválido.' });
        }

        const goal = await Goal.findById(goalId)
            .populate('company', 'name logo sector localesCount')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .populate('history.completedBy', 'name email profilePhotoUrl')
            .lean();

        if (!goal) return res.status(404).json({ error: 'Meta no encontrada.' });

        // Get tasks linked to this goal
        const tasks = await Task.find({ goal: goalId })
            .populate('contact', 'fullName profilePhotoUrl')
            .populate('company', 'name logo')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .sort({ dueDate: 1 })
            .lean();

        return res.json({ goal, tasks });
    } catch (error) {
        console.error(`[OPS] Error getting goal: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @route   POST /api/ops/goals
 * @desc    Create a new goal
 */
router.post('/goals', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const safeBody = { ...req.body };
        if (safeBody.company === '' || safeBody.company === null) delete safeBody.company;

        const goal = await Goal.create({
            ...safeBody,
            userId,
            assignedTo: safeBody.assignedTo || userId,
        });

        const populated = await Goal.findById(goal._id)
            .populate('company', 'name logo')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .lean();

        return res.status(201).json(populated);
    } catch (error) {
        console.error(`[OPS] Error creating goal: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Error al crear la meta', details: (error as Error).message });
    }
});

/**
 * @route   PATCH /api/ops/goals/:id
 * @desc    Update a goal (title, target, deadline, etc.)
 */
router.patch('/goals/:id', async (req: Request, res: Response) => {
    try {
        const safeBody = { ...req.body };
        if (safeBody.company === '' || safeBody.company === null) delete safeBody.company;

        const goal = await Goal.findByIdAndUpdate(
            req.params.id,
            { $set: safeBody },
            { new: true, runValidators: true }
        )
            .populate('company', 'name logo')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .lean();

        if (!goal) return res.status(404).json({ error: 'Meta no encontrada.' });
        return res.json(goal);
    } catch (error) {
        console.error(`[OPS] Error updating goal: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Error al actualizar la meta' });
    }
});

/**
 * @route   PATCH /api/ops/goals/:id/progress
 * @desc    Update current value and push to history
 */
router.patch('/goals/:id/progress', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const { current, note } = req.body;

        const goal = await Goal.findById(req.params.id);
        if (!goal) return res.status(404).json({ error: 'Meta no encontrada.' });

        const previousValue = goal.current;
        goal.current = current;

        // Push history entry
        goal.history.push({
            date: new Date(),
            previousValue,
            newValue: current,
            note: note || undefined,
            completedBy: userId,
        });

        // Auto-complete if target reached
        if (current >= goal.target && goal.status === 'active') {
            goal.status = 'completed';
            goal.completedAt = new Date();
        }

        await goal.save();

        const populated = await Goal.findById(goal._id)
            .populate('company', 'name logo')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .lean();

        return res.json(populated);
    } catch (error) {
        console.error(`[OPS] Error updating goal progress: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Error al actualizar el progreso' });
    }
});

/**
 * @route   PATCH /api/ops/goals/:id/complete
 * @desc    Mark goal as completed manually
 */
router.patch('/goals/:id/complete', async (req: Request, res: Response) => {
    try {
        const goal = await Goal.findByIdAndUpdate(
            req.params.id,
            { $set: { status: 'completed', completedAt: new Date() } },
            { new: true }
        )
            .populate('company', 'name logo')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .lean();

        if (!goal) return res.status(404).json({ error: 'Meta no encontrada.' });
        return res.json(goal);
    } catch (error) {
        console.error(`[OPS] Error completing goal: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Error al completar la meta' });
    }
});

/**
 * @route   PATCH /api/ops/goals/:id/reopen
 * @desc    Reopen a completed goal
 */
router.patch('/goals/:id/reopen', async (req: Request, res: Response) => {
    try {
        const goal = await Goal.findByIdAndUpdate(
            req.params.id,
            { $set: { status: 'active', completedAt: null } },
            { new: true }
        )
            .populate('company', 'name logo')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .lean();

        if (!goal) return res.status(404).json({ error: 'Meta no encontrada.' });
        return res.json(goal);
    } catch (error) {
        console.error(`[OPS] Error reopening goal: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Error al reabrir la meta' });
    }
});

/**
 * @route   PATCH /api/ops/goals/:id/milestones
 * @desc    Manage milestones (sub-goals): add, toggle, remove
 */
router.patch('/goals/:id/milestones', async (req: Request, res: Response) => {
    try {
        const { action, title, milestoneId } = req.body;
        const goal = await Goal.findById(req.params.id);
        if (!goal) return res.status(404).json({ error: 'Meta no encontrada.' });

        switch (action) {
            case 'add':
                if (!title?.trim()) return res.status(400).json({ error: 'Título requerido.' });
                goal.milestones.push({ title: title.trim(), completed: false } as any);
                break;
            case 'toggle':
                const ms = (goal.milestones as any).id(milestoneId);
                if (!ms) return res.status(404).json({ error: 'Sub-meta no encontrada.' });
                ms.completed = !ms.completed;
                ms.completedAt = ms.completed ? new Date() : undefined;
                break;
            case 'remove':
                (goal.milestones as any).pull(milestoneId);
                break;
            default:
                return res.status(400).json({ error: 'Acción inválida.' });
        }

        await goal.save();
        const populated = await Goal.findById(goal._id)
            .populate('company', 'name logo')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .lean();
        return res.json(populated);
    } catch (error) {
        console.error(`[OPS] Error managing milestones: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Error al gestionar sub-metas' });
    }
});

/**
 * @route   POST /api/ops/goals/:id/duplicate
 * @desc    Duplicate a goal
 */
router.post('/goals/:id/duplicate', async (req: Request, res: Response) => {
    try {
        const original = await Goal.findById(req.params.id).lean();
        if (!original) return res.status(404).json({ error: 'Meta no encontrada.' });

        const newGoal = await Goal.create({
            title: `${original.title} (copia)`,
            description: original.description,
            target: original.target,
            current: 0,
            unit: original.unit,
            category: original.category,
            customCategory: original.customCategory,
            status: 'active',
            deadline: original.deadline,
            company: original.company,
            assignedTo: original.assignedTo,
            userId: original.userId,
            history: [],
        });

        const populated = await Goal.findById(newGoal._id)
            .populate('company', 'name logo')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .lean();

        return res.json(populated);
    } catch (error) {
        console.error(`[OPS] Error duplicating goal: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Error al duplicar la meta' });
    }
});

/**
 * @route   PATCH /api/ops/goals/:id/archive
 * @desc    Archive a goal (soft delete)
 */
router.patch('/goals/:id/archive', async (req: Request, res: Response) => {
    try {
        const goal = await Goal.findByIdAndUpdate(
            req.params.id,
            { $set: { status: 'archived' } },
            { new: true }
        )
            .populate('company', 'name logo')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .lean();

        if (!goal) return res.status(404).json({ error: 'Meta no encontrada.' });
        return res.json(goal);
    } catch (error) {
        console.error(`[OPS] Error archiving goal: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Error al archivar la meta' });
    }
});

/**
 * @route   DELETE /api/ops/goals/:id
 * @desc    Delete a goal permanently
 */
router.delete('/goals/:id', async (req: Request, res: Response) => {
    try {
        const goal = await Goal.findByIdAndDelete(req.params.id);
        if (!goal) return res.status(404).json({ error: 'Meta no encontrada.' });

        // Unlink all tasks that referenced this goal
        await Task.updateMany({ goal: req.params.id }, { $unset: { goal: 1 } });

        return res.json({ success: true });
    } catch (error) {
        console.error(`[OPS] Error deleting goal: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Error al eliminar la meta' });
    }
});



// ══════════════════════════════════════════════════════════════
// ACTIVITY FEED
// ══════════════════════════════════════════════════════════════

router.get('/activities', async (req: Request, res: Response) => {
    try {
        const { type, page = '1', limit = '50' } = req.query;
        const pageNum = Math.max(1, parseInt(page as string) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 50));

        const unifiedFeed: any[] = [];

        // 1. Ops Tasks (platform = operaciones)
        const taskFilter: any = { platform: 'operaciones' };
        const opsTasks = await Task.find(taskFilter)
            .populate('contact', 'fullName profilePhotoUrl')
            .populate('company', 'name logo')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .populate('goal', 'title')
            .sort({ createdAt: -1 })
            .limit(limitNum * 2)
            .lean();

        opsTasks.forEach((t: any) => {
            unifiedFeed.push({
                _id: `task_${t._id}`,
                type: t.status === 'completed' ? 'task_completed' : 'task_created',
                description: `Tarea: ${t.title} (${t.status === 'completed' ? 'completada' : t.status === 'in_progress' ? 'en progreso' : 'pendiente'})`,
                createdAt: t.completedAt || t.createdAt,
                contact: t.contact,
                company: t.company,
                createdBy: t.assignedTo,
                goal: t.goal,
                source: 'task',
            });
        });

        // 2. Ops Deals (deals with opsStatus)
        const opsDeals = await Deal.find({ opsStatus: { $exists: true, $ne: null } })
            .populate('company', 'name logo')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .sort({ updatedAt: -1 })
            .limit(limitNum)
            .lean();

        opsDeals.forEach((d: any) => {
            unifiedFeed.push({
                _id: `deal_${d._id}`,
                type: 'deal_status_change',
                description: `Pipeline: ${d.title} → ${d.opsStatus}`,
                createdAt: d.opsStartDate || d.updatedAt,
                company: d.company,
                createdBy: d.assignedTo || d.opsAssignedTo,
                source: 'deal',
            });
        });

        // 3. Goal progress history
        const goals = await Goal.find({})
            .populate('company', 'name logo')
            .populate('assignedTo', 'name email profilePhotoUrl')
            .populate('history.completedBy', 'name email profilePhotoUrl')
            .sort({ updatedAt: -1 })
            .lean();

        goals.forEach((g: any) => {
            // Goal creation
            unifiedFeed.push({
                _id: `goal_created_${g._id}`,
                type: 'goal_created',
                description: `Meta creada: ${g.title} (objetivo: ${g.target} ${g.unit})`,
                createdAt: g.createdAt,
                company: g.company,
                createdBy: g.assignedTo,
                source: 'goal',
            });
            // Goal completion
            if (g.status === 'completed' && g.completedAt) {
                unifiedFeed.push({
                    _id: `goal_completed_${g._id}`,
                    type: 'goal_completed',
                    description: `Meta cumplida: ${g.title} ✅`,
                    createdAt: g.completedAt,
                    company: g.company,
                    createdBy: g.assignedTo,
                    source: 'goal',
                });
            }
            // Progress updates
            (g.history || []).forEach((h: any, idx: number) => {
                unifiedFeed.push({
                    _id: `goal_progress_${g._id}_${idx}`,
                    type: 'goal_progress',
                    description: `Progreso: ${g.title} — ${h.previousValue} → ${h.newValue} ${g.unit}${h.note ? ` (${h.note})` : ''}`,
                    createdAt: h.date,
                    company: g.company,
                    createdBy: h.completedBy || g.assignedTo,
                    source: 'goal',
                });
            });
        });

        // 4. Activities linked to ops companies/deals
        const opsDealIds = opsDeals.map((d: any) => d._id);
        if (opsDealIds.length > 0) {
            const opsActivities = await Activity.find({ deal: { $in: opsDealIds } })
                .populate('contact', 'fullName profilePhotoUrl')
                .populate('company', 'name logo')
                .populate('createdBy', 'name profilePhotoUrl')
                .sort({ createdAt: -1 })
                .limit(limitNum)
                .lean();

            opsActivities.forEach((a: any) => {
                unifiedFeed.push({
                    _id: `activity_${a._id}`,
                    type: a.type,
                    description: a.description,
                    createdAt: a.createdAt,
                    contact: a.contact,
                    company: a.company,
                    createdBy: a.createdBy,
                    source: 'activity',
                });
            });
        }

        // Filter by type if specified
        let filtered = unifiedFeed;
        if (type && type !== 'all') {
            filtered = unifiedFeed.filter(item => item.type === type);
        }

        // Sort by date descending
        filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        // Paginate
        const total = filtered.length;
        const paginated = filtered.slice((pageNum - 1) * limitNum, pageNum * limitNum);

        return res.json({
            activities: paginated,
            total,
            page: pageNum,
            pages: Math.ceil(total / limitNum),
        });
    } catch (error) {
        console.error(`[OPS] Error getting activities: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════════════════════════
// WEEKLY REPORTS
// ══════════════════════════════════════════════════════════════

const DAY_LABELS: Record<number, { key: string; label: string }> = {
    0: { key: 'dom', label: 'Domingo' },
    1: { key: 'lun', label: 'Lunes' },
    2: { key: 'mar', label: 'Martes' },
    3: { key: 'mie', label: 'Miércoles' },
    4: { key: 'jue', label: 'Jueves' },
    5: { key: 'vie', label: 'Viernes' },
    6: { key: 'sab', label: 'Sábado' },
};

/**
 * POST /api/ops/reports/weekly — Generate a new weekly report
 */
router.post('/reports/weekly', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;

        // Determine week range (Mon-Sun)
        const now = new Date();
        const dayOfWeek = now.getDay();
        const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - diffToMonday);
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const weekLabel = `Semana del ${weekStart.getDate()} al ${weekEnd.getDate()} de ${weekEnd.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}`;

        // ── 1. TASKS ──────────────────────────────────
        const allOpsTasks = await Task.find({ platform: 'operaciones' })
            .populate('company', 'name')
            .populate('contact', 'fullName')
            .populate('assignedTo', 'name')
            .lean();

        const tasksCreatedThisWeek = allOpsTasks.filter((t: any) => new Date(t.createdAt) >= weekStart && new Date(t.createdAt) <= weekEnd);
        const tasksCompletedThisWeek = allOpsTasks.filter((t: any) => t.status === 'completed' && t.completedAt && new Date(t.completedAt) >= weekStart && new Date(t.completedAt) <= weekEnd);
        const pendingTasks = allOpsTasks.filter((t: any) => t.status !== 'completed');

        const mapTask = (t: any) => ({
            taskId: t._id,
            title: t.title,
            status: t.status,
            type: t.type,
            completedAt: t.completedAt,
            company: t.company ? { _id: t.company._id, name: t.company.name } : undefined,
            contact: t.contact ? { _id: t.contact._id, fullName: t.contact.fullName } : undefined,
            assignedTo: t.assignedTo ? { _id: t.assignedTo._id, name: t.assignedTo.name } : undefined,
        });

        const totalActive = allOpsTasks.filter((t: any) => new Date(t.createdAt) < weekEnd).length;
        const completionRate = totalActive > 0 ? Math.round((tasksCompletedThisWeek.length / totalActive) * 100) : 0;

        // ── 2. DAILY PRODUCTIVITY ─────────────────────
        const dailyProductivity: any[] = [];
        for (let d = 0; d < 7; d++) {
            const dayDate = new Date(weekStart);
            dayDate.setDate(weekStart.getDate() + d);
            const dayNum = dayDate.getDay();
            const dayInfo = DAY_LABELS[dayNum];

            const completed = tasksCompletedThisWeek.filter((t: any) => {
                const cd = new Date(t.completedAt);
                return cd.toDateString() === dayDate.toDateString();
            }).length;

            const created = tasksCreatedThisWeek.filter((t: any) => {
                const cd = new Date(t.createdAt);
                return cd.toDateString() === dayDate.toDateString();
            }).length;

            dailyProductivity.push({
                day: dayInfo.key,
                dayLabel: dayInfo.label,
                tasksCompleted: completed,
                tasksCreated: created,
            });
        }

        const mostProductive = dailyProductivity.reduce((best, d) => d.tasksCompleted > best.tasksCompleted ? d : best, dailyProductivity[0]);

        // ── 3. GOALS ──────────────────────────────────
        const goals = await Goal.find({})
            .populate('company', 'name')
            .lean();

        // Get task counts per goal
        const goalIds = goals.map((g: any) => g._id);
        const taskAgg = await Task.aggregate([
            { $match: { goal: { $in: goalIds } } },
            {
                $group: {
                    _id: '$goal',
                    totalTasks: { $sum: 1 },
                    completedTasks: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
                    tasksCompletedThisWeek: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ['$status', 'completed'] },
                                        { $gte: ['$completedAt', weekStart] },
                                        { $lte: ['$completedAt', weekEnd] },
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    },
                }
            },
        ]);
        const taskCountMap: Record<string, { totalTasks: number; completedTasks: number; tasksCompletedThisWeek: number }> = {};
        for (const t of taskAgg) {
            taskCountMap[t._id.toString()] = { totalTasks: t.totalTasks, completedTasks: t.completedTasks, tasksCompletedThisWeek: t.tasksCompletedThisWeek };
        }

        const goalsSnapshot = goals.map((g: any) => {
            const weekEntries = (g.history || []).filter((h: any) => {
                const hd = new Date(h.date);
                return hd >= weekStart && hd <= weekEnd;
            });
            const weekDelta = weekEntries.reduce((sum: number, h: any) => sum + (h.newValue - h.previousValue), 0);
            const currentAtStart = g.current - weekDelta;
            const weekProgress = g.target > 0 ? Math.round((weekDelta / g.target) * 100) : 0;

            const tc = taskCountMap[g._id.toString()] || { totalTasks: 0, completedTasks: 0, tasksCompletedThisWeek: 0 };

            return {
                goalId: g._id,
                title: g.title,
                category: g.category,
                target: g.target,
                currentAtStart: Math.max(0, currentAtStart),
                currentAtEnd: g.current,
                weekDelta,
                weekProgress,
                totalTasks: tc.totalTasks,
                completedTasks: tc.completedTasks,
                tasksCompletedThisWeek: tc.tasksCompletedThisWeek,
                status: g.status,
                company: g.company ? { _id: g.company._id, name: g.company.name } : undefined,
            };
        });

        const goalsCompletedThisWeek = goals.filter((g: any) => g.status === 'completed' && g.completedAt && new Date(g.completedAt) >= weekStart && new Date(g.completedAt) <= weekEnd).length;
        const activeGoals = goals.filter((g: any) => g.status === 'active');
        const avgGoalProgress = activeGoals.length > 0
            ? Math.round(activeGoals.reduce((acc: number, g: any) => acc + (g.target > 0 ? Math.min((g.current / g.target) * 100, 100) : 0), 0) / activeGoals.length)
            : 0;

        // ── 4. PIPELINE ───────────────────────────────
        const opsDeals = await Deal.find({ opsStatus: { $exists: true, $ne: null } }).lean();
        const dealsByStatus: Record<string, number> = {};
        opsDeals.forEach((d: any) => {
            const status = d.opsStatus || 'sin_estado';
            dealsByStatus[status] = (dealsByStatus[status] || 0) + 1;
        });
        const dealsMovedForward = opsDeals.filter((d: any) => d.updatedAt && new Date(d.updatedAt) >= weekStart && new Date(d.updatedAt) <= weekEnd).length;

        // ── 5. HIGHLIGHTS & SCORE ─────────────────────
        const highlights: string[] = [];
        if (tasksCompletedThisWeek.length > 0) highlights.push(`Se completaron ${tasksCompletedThisWeek.length} tareas esta semana.`);
        if (tasksCreatedThisWeek.length > 0) highlights.push(`Se crearon ${tasksCreatedThisWeek.length} nuevas tareas.`);
        if (goalsCompletedThisWeek > 0) highlights.push(`${goalsCompletedThisWeek} meta(s) cumplida(s) esta semana. 🎉`);
        if (mostProductive.tasksCompleted > 0) highlights.push(`El día más productivo fue ${mostProductive.dayLabel} con ${mostProductive.tasksCompleted} tareas completadas.`);
        if (pendingTasks.length > 0) highlights.push(`Quedan ${pendingTasks.length} tareas pendientes.`);
        const goalsWithProgress = goalsSnapshot.filter(g => g.weekDelta > 0);
        if (goalsWithProgress.length > 0) highlights.push(`${goalsWithProgress.length} meta(s) avanzaron esta semana.`);

        // Score: weighted average
        const taskScore = Math.min(completionRate * 1.2, 100);
        const goalScore = avgGoalProgress;
        const productivityScore = Math.min(tasksCompletedThisWeek.length * 10, 100);
        const overallScore = Math.round(taskScore * 0.4 + goalScore * 0.3 + productivityScore * 0.3);

        // ── 6. SAVE ───────────────────────────────────
        const report = await WeeklyReport.create({
            weekStart,
            weekEnd,
            weekLabel,
            generatedBy: userId,
            totalTasksAtStart: totalActive - tasksCreatedThisWeek.length,
            totalTasksCreated: tasksCreatedThisWeek.length,
            totalTasksCompleted: tasksCompletedThisWeek.length,
            completionRate,
            completedTasks: tasksCompletedThisWeek.map(mapTask),
            pendingTasks: pendingTasks.slice(0, 20).map(mapTask),
            goalsSnapshot,
            goalsCompletedThisWeek,
            avgGoalProgress,
            dailyProductivity,
            mostProductiveDay: mostProductive.dayLabel,
            mostProductiveDayCount: mostProductive.tasksCompleted,
            dealsMovedForward,
            dealsByStatus,
            highlights,
            overallScore,
            userId,
        });

        // Log activity for report creation
        await Activity.create({
            type: 'other',
            description: `Se generó el informe semanal: ${weekLabel} (Score: ${overallScore})`,
            createdBy: userId,
            userId,
        });

        return res.status(201).json(report);
    } catch (error) {
        console.error(`[OPS] Error generating weekly report: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Error al generar el informe semanal' });
    }
});

/**
 * GET /api/ops/reports — List all weekly reports
 */
router.get('/reports', async (req: Request, res: Response) => {
    try {
        const reports = await WeeklyReport.find({})
            .populate('generatedBy', 'name profilePhotoUrl')
            .sort({ weekStart: -1 })
            .select('-completedTasks -pendingTasks -goalsSnapshot -dailyProductivity')
            .lean();

        return res.json({ reports });
    } catch (error) {
        console.error(`[OPS] Error listing reports: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * GET /api/ops/reports/:id — Get a single report
 */
router.get('/reports/:id', async (req: Request, res: Response) => {
    try {
        const report = await WeeklyReport.findById(req.params.id)
            .populate('generatedBy', 'name profilePhotoUrl')
            .lean();

        if (!report) return res.status(404).json({ error: 'Reporte no encontrado' });
        return res.json(report);
    } catch (error) {
        console.error(`[OPS] Error getting report: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * DELETE /api/ops/reports/:id — Delete a report
 */
router.delete('/reports/:id', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const report = await WeeklyReport.findById(req.params.id).lean();
        if (!report) return res.status(404).json({ error: 'Reporte no encontrado' });

        await WeeklyReport.findByIdAndDelete(req.params.id);

        // Log activity
        await Activity.create({
            type: 'other',
            description: `Se eliminó el informe semanal: ${report.weekLabel}`,
            createdBy: userId,
            userId,
        });

        return res.json({ success: true });
    } catch (error) {
        console.error(`[OPS] Error deleting report: ${(error as Error).message}`);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
