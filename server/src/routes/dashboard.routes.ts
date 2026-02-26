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
                { $match: {} },
                { $group: { _id: null, totalLocales: { $sum: "$localesCount" } } }
            ]),
            // 1b. Empresas Activas
            Company.countDocuments({ createdAt: { $lte: endOfMonth } }),
            Company.countDocuments({ createdAt: { $lte: endOfLastMonth } }),

            // 2a. Monto Proyectado
            Deal.aggregate([
                {
                    $match: {
                        status: { $in: [...wonStageKeys, ...nonFinalStages.filter(s => s !== 'pausado')] }
                    }
                },
                { $group: { _id: "$currency", totalMensual: { $sum: "$value" } } }
            ]),
            // 2b. Pipeline Forecast
            Deal.aggregate([
                {
                    $match: {
                        status: { $in: nonFinalStages.length > 0 ? nonFinalStages : { $nin: [...wonStageKeys, ...lostStageKeys] } }
                    }
                },
                { $group: { _id: "$currency", pipelineAsignado: { $sum: "$value" } } }
            ]),

            // 3. Trazabilidad (Actividades esta semana)
            Activity.aggregate([
                { $match: { createdAt: { $gte: weekAgo } } },
                { $group: { _id: "$type", count: { $sum: 1 } } }
            ]),

            // 4. Contactos
            CrmContact.countDocuments({}),
            CrmContact.countDocuments({ createdAt: { $gte: startOfMonth, $lte: endOfMonth } }),
            CrmContact.aggregate([
                { $match: {} },
                { $group: { _id: "$role", count: { $sum: 1 } } }
            ]),

            // 5. Tareas
            Task.countDocuments({
                dueDate: { $lt: now },
                status: { $in: ["pending", "in_progress"] }
            }),
            Task.countDocuments({
                completedAt: { $gte: weekAgo },
                status: "completed"
            }),
            Task.countDocuments({
                $or: [
                    { createdAt: { $gte: weekAgo } },
                    { dueDate: { $gte: weekAgo, $lte: now } }
                ]
            }),
            Task.countDocuments({}),

            // 6. Win Rate and Funnel
            Deal.find({}).select('status statusHistory').lean()
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

        // Counters for funnel progression tracking
        let reachedContactado = 0;      // Deals que llegaron a "Contactado" o más allá
        let reachedCoordinando = 0;     // Deals que llegaron a "Coordinando" o más allá
        let reachedReuniones = 0;       // Deals que llegaron a "Reuniones" o más allá
        let reachedNegociacion = 0;     // Deals que llegaron a "Negociación" o más allá

        // Find stage orders from config for threshold comparisons
        const getStageOrder = (key: string): number => {
            const stage = config.stages.find(s => s.key === key);
            return stage ? stage.order : 999;
        };
        const contactadoOrder = getStageOrder('contactado');
        const coordinandoOrder = getStageOrder('coordinando');
        const reunionesOrder = getStageOrder('reuniones');
        const negociacionOrder = getStageOrder('negociacion');

        deals.forEach((deal: any) => {
            if (wonStageKeys.includes(deal.status)) wonDeals++;
            if (lostStageKeys.includes(deal.status)) lostDeals++;
            if (deal.status === 'pausado') pausedDeals++;

            // Build set of all stages this deal has ever touched
            const touchedStages = new Set<string>();
            touchedStages.add(deal.status);
            if (deal.statusHistory && deal.statusHistory.length > 0) {
                deal.statusHistory.forEach((h: any) => {
                    touchedStages.add(h.from);
                    touchedStages.add(h.to);
                });
            }

            // Count deals per stage for funnel visualization
            touchedStages.forEach(stage => {
                stageCounts[stage] = (stageCounts[stage] || 0) + 1;
            });

            // Determine the furthest stage this deal ever reached
            const maxOrderTouched = Array.from(touchedStages).reduce((max, stageKey) => {
                const stageDef = config.stages.find(s => s.key === stageKey);
                return Math.max(max, stageDef ? stageDef.order : 0);
            }, 0);

            // Count deals that progressed to each stage threshold
            if (maxOrderTouched >= contactadoOrder) reachedContactado++;
            if (maxOrderTouched >= coordinandoOrder) reachedCoordinando++;
            if (maxOrderTouched >= reunionesOrder) reachedReuniones++;
            if (maxOrderTouched >= negociacionOrder) reachedNegociacion++;
        });

        // ── Conversion Formulas ──────────────────────────────────────
        //
        // Todas las tasas "Lead → X" usan totalDealsAllTime como base.
        // Esto mide: "de TODOS los deals que entraron al pipeline, qué % llegó a X"
        //
        // Win Rate es especial: mide eficiencia de cierre (ganados / cerrados)

        // Lead → Contactado: % de leads que progresaron más allá de "Lead"
        const leadToContactado = totalDealsAllTime > 0
            ? (reachedContactado / totalDealsAllTime) * 100 : 0;

        // Lead → Coordinando: % de leads que llegaron a agendar una coordinación
        const leadToScheduling = totalDealsAllTime > 0
            ? (reachedCoordinando / totalDealsAllTime) * 100 : 0;

        // Lead → Reunión: % de leads que llegaron a tener una reunión
        const leadToMeeting = totalDealsAllTime > 0
            ? (reachedReuniones / totalDealsAllTime) * 100 : 0;

        // Lead → Negociación: % de leads que llegaron a negociar
        const leadToNegociacion = totalDealsAllTime > 0
            ? (reachedNegociacion / totalDealsAllTime) * 100 : 0;

        // Lead → Ganado: % de leads que se cerraron como ganados
        const leadToWon = totalDealsAllTime > 0
            ? (wonDeals / totalDealsAllTime) * 100 : 0;

        // Win Rate: de los deals que se CERRARON (ganado + perdido), qué % se ganó
        const winRate = (wonDeals + lostDeals) > 0
            ? (wonDeals / (wonDeals + lostDeals)) * 100 : 0;

        // Tasa de Rechazo: % de deals perdidos + pausados sobre el total
        const leadToRejected = totalDealsAllTime > 0
            ? ((lostDeals + pausedDeals) / totalDealsAllTime) * 100 : 0;



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
                leadToContactado,
                leadToScheduling,
                leadToMeeting,
                leadToNegociacion,
                leadToWon,
                winRate,
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
