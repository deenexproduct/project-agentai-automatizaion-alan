/**
 * Deenex Monitoring Routes — READ-ONLY (GET only)
 * ⚠️  Absolutely NO write operations allowed. This is a production database.
 */
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getDeenexConnection } from '../deenex-db';
import {
    getDeenexBrandModel,
    getDeenexLocalModel,
    getDeenexClienteModel,
    getDeenexOrderModel,
    getDeenexMenuModel,
    getDeenexPointsModel,
    getDeenexCouponModel,
    getDeenexStoryModel,
    getDeenexNotificationModel,
    getDeenexCampaniaModel,
} from '../models/deenex-models';

const router = Router();

// ── Middleware: check Deenex DB is connected ─────────────────
function requireDeenexDB(req: Request, res: Response, next: Function) {
    if (!getDeenexConnection()) {
        return res.status(503).json({ error: 'Deenex monitoring database not available' });
    }
    next();
}

router.use(authMiddleware, requireDeenexDB);

// ── Helper: build date/brand/local filters ───────────────────
function buildFilters(query: any) {
    const filters: any = {};
    if (query.brandId) filters.idMarca = query.brandId;
    if (query.localId) filters.idLocal = query.localId;
    if (query.dateFrom || query.dateTo) {
        filters.createdAt = {};
        if (query.dateFrom) filters.createdAt.$gte = new Date(query.dateFrom);
        if (query.dateTo) filters.createdAt.$lte = new Date(query.dateTo);
    }
    return filters;
}

// ══════════════════════════════════════════════════════════════
// GET /overview — 6 KPIs principales
// ══════════════════════════════════════════════════════════════
router.get('/overview', async (req: Request, res: Response) => {
    try {
        const Local = getDeenexLocalModel();
        const Cliente = getDeenexClienteModel();
        const Order = getDeenexOrderModel();

        const filters = buildFilters(req.query);
        const orderFilters = { ...filters };
        const clientFilters: any = {};
        if (filters.idMarca) clientFilters.idMarca = filters.idMarca;

        const [
            // 1. Locales activos con al menos una venta
            localesConVentas,
            // 2. Total pedidos (cantidad)
            totalOrders,
            // 3. Facturación total
            billingAgg,
            // 4. Usuarios registrados (NO son guest)
            registeredUsers,
            // 5. Usuarios invitados (guestRegister o email @guest.com)
            guestUsers,
        ] = await Promise.all([
            // KPI 1: idLocal in pagos is a STRING, so we get distinct strings
            // then match against locales._id (ObjectId) by converting
            (async () => {
                const distinctLocalStrings = await Order.distinct('idLocal', orderFilters);
                if (distinctLocalStrings.length === 0) return 0;
                // Convert string IDs to ObjectIds for matching with locales._id
                const mongoose = await import('mongoose');
                const objectIds = distinctLocalStrings
                    .filter((id: string) => id && mongoose.Types.ObjectId.isValid(id))
                    .map((id: string) => new mongoose.Types.ObjectId(id));
                if (objectIds.length === 0) return 0;
                const localFilter: any = {
                    _id: { $in: objectIds },
                    statusLocal: true,
                };
                if (filters.idMarca) localFilter.idMarca = filters.idMarca;
                return Local.countDocuments(localFilter);
            })(),

            // KPI 2: Count total orders
            Order.countDocuments(orderFilters),

            // KPI 3: Sum totalFacturado
            Order.aggregate([
                { $match: orderFilters },
                { $group: { _id: null, total: { $sum: '$totalFacturado' } } },
            ]),

            // KPI 4: Registered users — NOT guests
            // Guests have guestRegister=true or email ending in @guest.com
            Cliente.countDocuments({
                ...clientFilters,
                guestRegister: { $ne: true },
                email: { $not: /@guest\.com$/i },
            }),

            // KPI 5: Guest users
            Cliente.countDocuments({
                ...clientFilters,
                $or: [
                    { guestRegister: true },
                    { email: { $regex: /@guest\.com$/i } },
                ],
            }),
        ]);

        const totalBilling = billingAgg[0]?.total || 0;

        // KPI 6: Tasa de invitados a registrados
        const guestToRegisteredRate = registeredUsers > 0
            ? Math.round((guestUsers / registeredUsers) * 1000) / 10
            : 0;

        return res.json({
            localesActivosConVentas: localesConVentas,
            totalPedidos: totalOrders,
            facturacionTotal: Math.round(totalBilling),
            usuariosRegistrados: registeredUsers,
            usuariosInvitados: guestUsers,
            tasaInvitadosARegistrados: guestToRegisteredRate,
        });
    } catch (error: any) {
        console.error('[DEENEX-MONITOR] Overview error:', error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════════════════════════
// GET /brands — Lista de marcas con conteos
// ══════════════════════════════════════════════════════════════
router.get('/brands', async (req: Request, res: Response) => {
    try {
        const Brand = getDeenexBrandModel();
        const Local = getDeenexLocalModel();
        const Cliente = getDeenexClienteModel();
        const Order = getDeenexOrderModel();

        const brands = await Brand.find().select('domain appName businessType rewardPointsSystem headerLogo colors createdAt').lean();

        const enriched = await Promise.all(brands.map(async (brand: any) => {
            const [locals, clients, orders] = await Promise.all([
                Local.countDocuments({ idMarca: brand._id }),
                Cliente.countDocuments({ idMarca: brand._id }),
                Order.countDocuments({ idMarca: brand._id }),
            ]);
            return { ...brand, localsCount: locals, clientsCount: clients, ordersCount: orders };
        }));

        return res.json(enriched);
    } catch (error: any) {
        console.error('[DEENEX-MONITOR] Brands error:', error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════════════════════════
// GET /clients/stats — Estadísticas de clientes
// ══════════════════════════════════════════════════════════════
router.get('/clients/stats', async (req: Request, res: Response) => {
    try {
        const Cliente = getDeenexClienteModel();
        const filters: any = {};
        if (req.query.brandId) filters.idMarca = req.query.brandId;

        const [
            total,
            registrationMethods,
            genderDist,
            purchaseBehavior,
            healthAnalysis,
            clvData,
        ] = await Promise.all([
            Cliente.countDocuments(filters),

            // Registration methods
            Cliente.aggregate([
                { $match: filters },
                { $group: { _id: '$medioRegistro.medio', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]),

            // Gender distribution
            Cliente.aggregate([
                { $match: filters },
                { $group: { _id: '$sexo', count: { $sum: 1 } } },
            ]),

            // Purchase behavior
            Cliente.aggregate([
                { $match: { ...filters, totalCompras: { $gt: 0 } } },
                {
                    $group: {
                        _id: null,
                        totalBuyers: { $sum: 1 },
                        avgPurchases: { $avg: '$totalCompras' },
                        avgSpent: { $avg: '$totalDineroGastado' },
                        totalSpent: { $sum: '$totalDineroGastado' },
                    },
                },
            ]),

            // Health analysis (active / at risk / dormant)
            (async () => {
                const now = new Date();
                const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                const d60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

                const [active, atRisk, dormant] = await Promise.all([
                    Cliente.countDocuments({ ...filters, ultimaCompra: { $gte: d30 } }),
                    Cliente.countDocuments({ ...filters, ultimaCompra: { $gte: d60, $lt: d30 } }),
                    Cliente.countDocuments({ ...filters, ultimaCompra: { $lt: d60 } }),
                ]);
                return { active, atRisk, dormant };
            })(),

            // CLV data
            Cliente.aggregate([
                { $match: { ...filters, totalDineroGastado: { $gt: 0 } } },
                {
                    $group: {
                        _id: null,
                        avgCLV: { $avg: '$totalDineroGastado' },
                        maxCLV: { $max: '$totalDineroGastado' },
                        totalRevenue: { $sum: '$totalDineroGastado' },
                    },
                },
            ]),
        ]);

        const purchase = purchaseBehavior[0] || { totalBuyers: 0, avgPurchases: 0, avgSpent: 0, totalSpent: 0 };
        const clv = clvData[0] || { avgCLV: 0, maxCLV: 0, totalRevenue: 0 };

        return res.json({
            total,
            registrationMethods: registrationMethods.map((r: any) => ({ method: r._id || 'desconocido', count: r.count })),
            genderDistribution: genderDist.map((g: any) => ({ gender: g._id || 'no_especificado', count: g.count })),
            purchaseBehavior: {
                totalBuyers: purchase.totalBuyers,
                avgPurchases: Math.round(purchase.avgPurchases * 10) / 10,
                avgSpent: Math.round(purchase.avgSpent),
                conversionRate: total > 0 ? Math.round((purchase.totalBuyers / total) * 1000) / 10 : 0,
            },
            health: healthAnalysis,
            clv: {
                average: Math.round(clv.avgCLV),
                max: Math.round(clv.maxCLV),
                totalRevenue: Math.round(clv.totalRevenue),
            },
        });
    } catch (error: any) {
        console.error('[DEENEX-MONITOR] Client stats error:', error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════════════════════════
// GET /orders/stats — Estadísticas de pedidos
// ══════════════════════════════════════════════════════════════
router.get('/orders/stats', async (req: Request, res: Response) => {
    try {
        const Order = getDeenexOrderModel();
        const filters = buildFilters(req.query);

        const [
            total,
            byType,
            byPayment,
            billingData,
            ratingData,
            monthlyTrend,
        ] = await Promise.all([
            Order.countDocuments(filters),

            // Orders by type
            Order.aggregate([
                { $match: filters },
                { $group: { _id: '$type', count: { $sum: 1 }, revenue: { $sum: '$totalFacturado' } } },
                { $sort: { count: -1 } },
            ]),

            // Payment methods
            Order.aggregate([
                { $match: filters },
                { $unwind: { path: '$metodoDePago', preserveNullAndEmptyArrays: true } },
                { $group: { _id: '$metodoDePago', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]),

            // Billing totals
            Order.aggregate([
                { $match: filters },
                {
                    $group: {
                        _id: null,
                        totalBilling: { $sum: '$totalFacturado' },
                        avgTicket: { $avg: '$totalFacturado' },
                        maxTicket: { $max: '$totalFacturado' },
                    },
                },
            ]),

            // Ratings
            Order.aggregate([
                { $match: { ...filters, valoracion: { $exists: true, $ne: null, $gt: 0 } } },
                {
                    $group: {
                        _id: null,
                        avgRating: { $avg: '$valoracion' },
                        totalRated: { $sum: 1 },
                    },
                },
            ]),

            // Monthly trend (last 6 months)
            Order.aggregate([
                {
                    $match: {
                        ...filters,
                        createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) },
                    },
                },
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' },
                        },
                        orders: { $sum: 1 },
                        revenue: { $sum: '$totalFacturado' },
                    },
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } },
            ]),
        ]);

        const billing = billingData[0] || { totalBilling: 0, avgTicket: 0, maxTicket: 0 };
        const rating = ratingData[0] || { avgRating: 0, totalRated: 0 };

        return res.json({
            total,
            byType: byType.map((t: any) => ({ type: t._id || 'unknown', count: t.count, revenue: Math.round(t.revenue) })),
            paymentMethods: byPayment.map((p: any) => ({ method: p._id || 'unknown', count: p.count })),
            billing: {
                total: Math.round(billing.totalBilling),
                avgTicket: Math.round(billing.avgTicket),
                maxTicket: Math.round(billing.maxTicket),
            },
            rating: {
                average: Math.round(rating.avgRating * 10) / 10,
                totalRated: rating.totalRated,
            },
            monthlyTrend: monthlyTrend.map((m: any) => ({
                month: `${m._id.year}-${String(m._id.month).padStart(2, '0')}`,
                orders: m.orders,
                revenue: Math.round(m.revenue),
            })),
        });
    } catch (error: any) {
        console.error('[DEENEX-MONITOR] Order stats error:', error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════════════════════════
// GET /points/stats — Ecosistema de puntos
// ══════════════════════════════════════════════════════════════
router.get('/points/stats', async (req: Request, res: Response) => {
    try {
        const Points = getDeenexPointsModel();
        const filters: any = {};
        if (req.query.brandId) filters.idMarca = req.query.brandId;

        const [byReason, statusDist] = await Promise.all([
            Points.aggregate([
                { $match: filters },
                {
                    $group: {
                        _id: '$reason',
                        count: { $sum: 1 },
                        totalAmount: { $sum: '$totalAmount' },
                    },
                },
                { $sort: { totalAmount: -1 } },
            ]),

            Points.aggregate([
                { $match: filters },
                { $group: { _id: '$status', count: { $sum: 1 } } },
            ]),
        ]);

        const generated = byReason.find((r: any) => r._id === 'cashback') || { count: 0, totalAmount: 0 };
        const used = byReason.find((r: any) => r._id === 'purchase') || { count: 0, totalAmount: 0 };
        const expired = byReason.find((r: any) => r._id === 'expiration') || { count: 0, totalAmount: 0 };
        const rewards = byReason.find((r: any) => r._id === 'reward') || { count: 0, totalAmount: 0 };

        const redemptionRate = generated.totalAmount > 0
            ? Math.round((used.totalAmount / generated.totalAmount) * 1000) / 10
            : 0;

        return res.json({
            generated: { count: generated.count, amount: Math.round(generated.totalAmount) },
            used: { count: used.count, amount: Math.round(used.totalAmount) },
            expired: { count: expired.count, amount: Math.round(expired.totalAmount) },
            rewards: { count: rewards.count, amount: Math.round(rewards.totalAmount) },
            redemptionRate,
            byReason: byReason.map((r: any) => ({
                reason: r._id || 'unknown',
                count: r.count,
                amount: Math.round(r.totalAmount),
            })),
            statusDistribution: statusDist.map((s: any) => ({ status: s._id, count: s.count })),
        });
    } catch (error: any) {
        console.error('[DEENEX-MONITOR] Points stats error:', error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════════════════════════
// GET /products/top — Top products and categories
// ══════════════════════════════════════════════════════════════
router.get('/products/top', async (req: Request, res: Response) => {
    try {
        const Menu = getDeenexMenuModel();
        const filters: any = {};
        if (req.query.brandId) filters.idMarca = req.query.brandId;

        const [totalProducts, activeProducts, byCategory] = await Promise.all([
            Menu.countDocuments(filters),
            Menu.countDocuments({ ...filters, active: true }),

            Menu.aggregate([
                { $match: { ...filters, active: true } },
                { $group: { _id: '$category', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 15 },
            ]),
        ]);

        return res.json({
            totalProducts,
            activeProducts,
            inactiveProducts: totalProducts - activeProducts,
            byCategory: byCategory.map((c: any) => ({ category: c._id || 'Sin categoría', count: c.count })),
        });
    } catch (error: any) {
        console.error('[DEENEX-MONITOR] Products error:', error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════════════════════════
// GET /engagement/stats — Stories, Notifications, WhatsApp
// ══════════════════════════════════════════════════════════════
router.get('/engagement/stats', async (req: Request, res: Response) => {
    try {
        const Story = getDeenexStoryModel();
        const Notification = getDeenexNotificationModel();
        const Campania = getDeenexCampaniaModel();
        const Coupon = getDeenexCouponModel();
        const filters: any = {};
        if (req.query.brandId) filters.idMarca = req.query.brandId;

        const [
            totalStories,
            activeStories,
            totalNotifications,
            totalCampaigns,
            couponStats,
            storyViewsAgg,
        ] = await Promise.all([
            Story.countDocuments(filters),
            Story.countDocuments({ ...filters, active: true }),
            Notification.countDocuments(filters),
            Campania.countDocuments(filters),
            Coupon.aggregate([
                { $match: filters },
                { $group: { _id: '$status', count: { $sum: 1 } } },
            ]),
            // Total story views from statistics array
            Story.aggregate([
                { $match: filters },
                { $project: { viewCount: { $cond: { if: { $isArray: '$statistics' }, then: { $size: '$statistics' }, else: 0 } } } },
                { $group: { _id: null, totalViews: { $sum: '$viewCount' } } },
            ]),
        ]);

        const storyViews = storyViewsAgg[0]?.totalViews || 0;

        return res.json({
            stories: { total: totalStories, active: activeStories, totalViews: storyViews },
            notifications: { total: totalNotifications },
            whatsappCampaigns: { total: totalCampaigns },
            coupons: {
                byStatus: couponStats.map((c: any) => ({ status: c._id || 'unknown', count: c.count })),
                total: couponStats.reduce((acc: number, c: any) => acc + c.count, 0),
            },
        });
    } catch (error: any) {
        console.error('[DEENEX-MONITOR] Engagement stats error:', error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════════════════════════
// GET /locations/leaderboard — Ranking de locales
// ══════════════════════════════════════════════════════════════
router.get('/locations/leaderboard', async (req: Request, res: Response) => {
    try {
        const Local = getDeenexLocalModel();
        const Order = getDeenexOrderModel();
        const Points = getDeenexPointsModel();
        const filters: any = {};
        if (req.query.brandId) filters.idMarca = req.query.brandId;

        const locals = await Local.find(filters.idMarca ? { idMarca: filters.idMarca } : {})
            .select('nameLocal addressLocal statusLocal storeId idMarca')
            .lean();

        const orderFilters: any = {};
        if (req.query.dateFrom || req.query.dateTo) {
            orderFilters.createdAt = {};
            if (req.query.dateFrom) orderFilters.createdAt.$gte = new Date(req.query.dateFrom as string);
            if (req.query.dateTo) orderFilters.createdAt.$lte = new Date(req.query.dateTo as string);
        }

        const [ordersByLocal, pointsByLocal] = await Promise.all([
            Order.aggregate([
                { $match: orderFilters },
                {
                    $group: {
                        _id: '$idLocal',
                        totalOrders: { $sum: 1 },
                        totalRevenue: { $sum: '$totalFacturado' },
                        avgTicket: { $avg: '$totalFacturado' },
                        byType: {
                            $push: '$type',
                        },
                    },
                },
            ]),
            Points.aggregate([
                { $match: {} },
                {
                    $group: {
                        _id: '$localId',
                        generated: {
                            $sum: { $cond: [{ $eq: ['$reason', 'cashback'] }, '$totalAmount', 0] },
                        },
                        used: {
                            $sum: { $cond: [{ $eq: ['$reason', 'purchase'] }, '$totalAmount', 0] },
                        },
                    },
                },
            ]),
        ]);

        const ordersMap = new Map(ordersByLocal.map((o: any) => [String(o._id), o]));
        const pointsMap = new Map(pointsByLocal.map((p: any) => [String(p._id), p]));

        const leaderboard = locals.map((local: any) => {
            const orders = ordersMap.get(String(local._id)) || { totalOrders: 0, totalRevenue: 0, avgTicket: 0, byType: [] };
            const pts = pointsMap.get(String(local._id)) || { generated: 0, used: 0 };

            const typeCount = (orders.byType as string[]).reduce((acc: Record<string, number>, t: string) => {
                acc[t] = (acc[t] || 0) + 1;
                return acc;
            }, {});

            return {
                _id: local._id,
                name: local.nameLocal,
                address: local.addressLocal,
                active: local.statusLocal,
                totalOrders: orders.totalOrders,
                totalRevenue: Math.round(orders.totalRevenue),
                avgTicket: Math.round(orders.avgTicket || 0),
                ordersByType: typeCount,
                points: {
                    generated: Math.round(pts.generated),
                    used: Math.round(pts.used),
                },
            };
        });

        // Sort by revenue descending
        leaderboard.sort((a: any, b: any) => b.totalRevenue - a.totalRevenue);

        return res.json(leaderboard);
    } catch (error: any) {
        console.error('[DEENEX-MONITOR] Leaderboard error:', error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
