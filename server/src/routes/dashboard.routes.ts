import { Router, Request, Response } from 'express';
import { Company } from '../models/company.model';
import { Deal } from '../models/deal.model';
import { Activity } from '../models/activity.model';
import { CrmContact } from '../models/crm-contact.model';
import { Task } from '../models/task.model';
import { PipelineConfig } from '../models/pipeline-config.model';

const router = Router();

router.get('/metrics', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;

        // Timeframes
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        // Fetch Pipeline Config to know final stages (for Won/Lost)
        const config = await PipelineConfig.getOrCreate(userId.toString());

        let wonStageKeys = config.stages.filter(s => s.isFinal && (s.key.toLowerCase().includes('ganado') || s.key.toLowerCase().includes('won'))).map(s => s.key);
        if (wonStageKeys.length === 0) wonStageKeys = ['ganado', 'won'];

        let lostStageKeys = config.stages.filter(s => s.isFinal && (s.key.toLowerCase().includes('perdid') || s.key.toLowerCase().includes('lost'))).map(s => s.key);
        if (lostStageKeys.length === 0) lostStageKeys = ['perdido', 'lost'];

        const nonFinalStages = config.stages.filter(s => !s.isFinal).map(s => s.key);

        const [
            // 1. Locales y Empresas
            localesResult,
            companiesThisMonth,
            companiesLastMonth,

            // 2. Monto Mensual y Pipeline
            revenueThisMonth,
            pipelineForecast,

            // 3. Trazabilidad
            activitiesThisWeek,

            // 4. Contactos
            totalContacts,
            contactsThisMonth,
            contactsByRole,

            // 5. Tareas
            overdueTasksCount,
            completedTasksThisWeek,
            totalTasksThisWeek,
            totalTasksAllTime,

            // 6. Win Rate and Funnel
            deals
        ] = await Promise.all([
            // 1a. Locales
            Company.aggregate([
                { $match: { userId } },
                { $group: { _id: null, totalLocales: { $sum: "$localesCount" } } }
            ]),
            // 1b. Empresas Activas
            Company.countDocuments({ userId, createdAt: { $lte: endOfMonth } }),
            Company.countDocuments({ userId, createdAt: { $lte: endOfLastMonth } }),

            // 2a. Monto Proyectado
            Deal.aggregate([
                {
                    $match: {
                        userId,
                        status: { $in: [...wonStageKeys, ...nonFinalStages.filter(s => s !== 'pausado')] }
                    }
                },
                { $group: { _id: "$currency", totalMensual: { $sum: "$value" } } }
            ]),
            // 2b. Pipeline Forecast
            Deal.aggregate([
                {
                    $match: {
                        userId,
                        status: { $in: nonFinalStages.length > 0 ? nonFinalStages : { $nin: [...wonStageKeys, ...lostStageKeys] } }
                    }
                },
                { $group: { _id: "$currency", pipelineAsignado: { $sum: "$value" } } }
            ]),

            // 3. Trazabilidad (Actividades esta semana)
            Activity.aggregate([
                { $match: { userId, createdAt: { $gte: weekAgo } } },
                { $group: { _id: "$type", count: { $sum: 1 } } }
            ]),

            // 4. Contactos
            CrmContact.countDocuments({ userId }),
            CrmContact.countDocuments({ userId, createdAt: { $gte: startOfMonth, $lte: endOfMonth } }),
            CrmContact.aggregate([
                { $match: { userId } },
                { $group: { _id: "$role", count: { $sum: 1 } } }
            ]),

            // 5. Tareas
            Task.countDocuments({
                userId,
                dueDate: { $lt: now },
                status: { $in: ["pending", "in_progress"] }
            }),
            Task.countDocuments({
                userId,
                completedAt: { $gte: weekAgo },
                status: "completed"
            }),
            Task.countDocuments({
                userId,
                $or: [
                    { createdAt: { $gte: weekAgo } },
                    { dueDate: { $gte: weekAgo, $lte: now } }
                ]
            }),
            Task.countDocuments({ userId }),

            // 6. Win Rate and Funnel
            Deal.find({ userId }).select('status statusHistory').lean()
        ]);

        const totalLocales = localesResult[0]?.totalLocales || 0;
        const totalCompanies = companiesThisMonth;
        const growthFromLastMonth = companiesThisMonth - companiesLastMonth;

        // --- Funnel & Conversions Logic ---
        const totalDealsAllTime = deals.length;
        let wonDeals = 0;
        let lostDeals = 0;
        let pausedDeals = 0;
        const stageCounts: Record<string, number> = {};

        deals.forEach((deal: any) => {
            if (wonStageKeys.includes(deal.status)) wonDeals++;
            if (lostStageKeys.includes(deal.status)) lostDeals++;
            if (deal.status === 'pausado') pausedDeals++; // Using default paused key

            const touchedStages = new Set<string>();
            touchedStages.add(deal.status);
            if (deal.statusHistory && deal.statusHistory.length > 0) {
                deal.statusHistory.forEach((h: any) => {
                    touchedStages.add(h.from);
                    touchedStages.add(h.to);
                });
            }

            touchedStages.forEach(stage => {
                stageCounts[stage] = (stageCounts[stage] || 0) + 1;
            });
        });

        const winRate = (wonDeals + lostDeals) > 0 ? (wonDeals / (wonDeals + lostDeals)) * 100 : 0;
        const leadToWon = totalDealsAllTime > 0 ? (wonDeals / totalDealsAllTime) * 100 : 0;
        const leadToRejected = totalDealsAllTime > 0 ? ((lostDeals + pausedDeals) / totalDealsAllTime) * 100 : 0;

        const funnel = config.stages.map(stage => {
            return {
                step: stage.order,
                key: stage.key,
                label: stage.label,
                count: stageCounts[stage.key] || 0
            };
        }).sort((a, b) => a.step - b.step);

        const completionRate = totalTasksThisWeek > 0 ? (completedTasksThisWeek / totalTasksThisWeek) * 100 : 0;

        res.json({
            companies: {
                totalLocales,
                totalCompanies,
                growthFromLastMonth
            },
            revenue: {
                wonThisMonth: revenueThisMonth.map(r => ({ currency: r._id || 'USD', amount: r.totalMensual })),
                pipelineForecast: pipelineForecast.map(r => ({ currency: r._id || 'USD', amount: r.pipelineAsignado }))
            },
            traceability: {
                activitiesThisWeek: activitiesThisWeek.map(a => ({ type: a._id, count: a.count }))
            },
            contacts: {
                total: totalContacts,
                newThisMonth: contactsThisMonth,
                byRole: contactsByRole.map(r => ({ role: r._id || 'other', count: r.count }))
            },
            tasks: {
                total: totalTasksAllTime,
                overdue: overdueTasksCount,
                completionRateThisWeek: completionRate
            },
            conversion: {
                totalDeals: totalDealsAllTime,
                winRate,
                leadToWon,
                leadToRejected,
                dealsWon: wonDeals,
                dealsLost: lostDeals,
                dealsPaused: pausedDeals,
                funnel
            }
        });

    } catch (err: any) {
        console.error('CRM Dashboard metrics error:', err.message);
        res.status(500).json({ error: 'Failed to fetch dashboard metrics' });
    }
});

export default router;
