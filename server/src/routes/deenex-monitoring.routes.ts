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

import mongoose from 'mongoose';

// ── TEMPORARY DEBUG: Sample documents to inspect field names ──
router.get('/debug/sample', async (req: Request, res: Response) => {
    try {
        const Order = getDeenexOrderModel();
        const Cliente = getDeenexClienteModel();

        const sampleOrder = await Order.findOne().lean();
        const sampleClient = await Cliente.findOne().lean();

        return res.json({
            sampleOrderFields: sampleOrder ? Object.keys(sampleOrder) : [],
            sampleOrderData: sampleOrder,
            sampleClientFields: sampleClient ? Object.keys(sampleClient) : [],
            sampleClientData: sampleClient,
        });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
});

// ── Helper: build date/brand/local filters ───────────────────
function buildFilters(query: any) {
    const filters: any = {};
    if (query.brandId && mongoose.Types.ObjectId.isValid(query.brandId)) {
        filters.idMarca = new mongoose.Types.ObjectId(query.brandId);
    } else if (query.brandId) {
        filters.idMarca = query.brandId;
    }

    if (query.localId && mongoose.Types.ObjectId.isValid(query.localId)) {
        filters.idLocal = new mongoose.Types.ObjectId(query.localId);
    } else if (query.localId) {
        filters.idLocal = query.localId;
    }

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

        // KPI 6: Tasa de registro real (registrados / total)
        const totalUsers = registeredUsers + guestUsers;
        const tasaDeRegistro = totalUsers > 0
            ? Math.round((registeredUsers / totalUsers) * 1000) / 10
            : 0;

        return res.json({
            localesActivosConVentas: localesConVentas,
            totalPedidos: totalOrders,
            facturacionTotal: Math.round(totalBilling),
            usuariosRegistrados: registeredUsers,
            usuariosInvitados: guestUsers,
            tasaDeRegistro,
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
            // idMarca se guarda como String en las colecciones, pero el schema Mongoose lo declara
            // ObjectId → los modelos castean el filtro y no matchean. Usamos .collection (driver crudo,
            // sin casteo) con String(brand._id) (+ ObjectId defensivo), igual que el metrics service.
            const marcaMatch = { $or: [{ idMarca: String(brand._id) }, { idMarca: brand._id }] };
            const [locals, clients, orders] = await Promise.all([
                Local.collection.countDocuments(marcaMatch),
                Cliente.collection.countDocuments(marcaMatch),
                Order.collection.countDocuments(marcaMatch),
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
        const Order = getDeenexOrderModel();
        const filters: any = {};
        const orderFilters: any = {};
        if (req.query.brandId) {
            const brandId = req.query.brandId as string;
            if (mongoose.Types.ObjectId.isValid(brandId)) {
                filters.idMarca = new mongoose.Types.ObjectId(brandId);
                orderFilters.idMarca = new mongoose.Types.ObjectId(brandId);
            } else {
                filters.idMarca = brandId;
                orderFilters.idMarca = brandId;
            }
        }

        const [
            total,
            registrationMethods,
            genderDist,
            healthAnalysis,
            // CLV + purchase behavior computed from pagos collection
            orderBehavior,
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

            // Health analysis (active / at risk / dormant) based on last order date
            // Computed from pagos collection since ultimaCompra may not be populated
            // Activo: ≤30 days since last order
            // En Riesgo: 31-90 days since last order
            // Dormido: >90 days since last order
            (async () => {
                const now = new Date();
                const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

                const healthAgg = await Order.aggregate([
                    {
                        $match: {
                            ...orderFilters,
                            idCliente: { $exists: true, $nin: [null, '', 0] },
                        },
                    },
                    {
                        $addFields: {
                            _orderDate: {
                                $ifNull: ['$createdAt', { $toDate: '$_id' }],
                            },
                        },
                    },
                    {
                        $group: {
                            _id: { $toString: '$idCliente' },
                            lastOrderDate: { $max: '$_orderDate' },
                        },
                    },
                    {
                        $project: {
                            status: {
                                $cond: [
                                    { $gte: ['$lastOrderDate', d30] },
                                    'active',
                                    {
                                        $cond: [
                                            { $gte: ['$lastOrderDate', d90] },
                                            'atRisk',
                                            'dormant',
                                        ],
                                    },
                                ],
                            },
                        },
                    },
                    {
                        $group: {
                            _id: '$status',
                            count: { $sum: 1 },
                        },
                    },
                ]);

                const statusMap = new Map(healthAgg.map((h: any) => [h._id, h.count]));
                return {
                    active: statusMap.get('active') || 0,
                    atRisk: statusMap.get('atRisk') || 0,
                    dormant: statusMap.get('dormant') || 0,
                };
            })(),

            // CLV + purchase data computed from pagos (orders) collection
            // because totalDineroGastado/totalCompras don't exist in usuariosregistrados
            // NOTE: idCliente is stored as STRING in pagos, so we cast to string for grouping
            Order.aggregate([
                {
                    $match: {
                        ...orderFilters,
                        idCliente: { $exists: true, $nin: [null, '', 0] }
                    }
                },
                {
                    $addFields: {
                        _revenue: { $ifNull: ['$totalFacturado', { $ifNull: ['$total', 0] }] },
                        _clientId: { $toString: '$idCliente' }
                    }
                },
                {
                    $group: {
                        _id: '$_clientId',
                        totalSpent: { $sum: '$_revenue' },
                        orderCount: { $sum: 1 },
                    },
                },
                {
                    $group: {
                        _id: null,
                        totalBuyers: { $sum: 1 },
                        avgCLV: { $avg: '$totalSpent' },
                        maxCLV: { $max: '$totalSpent' },
                        totalRevenue: { $sum: '$totalSpent' },
                        avgPurchases: { $avg: '$orderCount' },
                        avgSpent: { $avg: '$totalSpent' },
                    },
                },
            ]),
        ]);

        const ob = orderBehavior[0] || { totalBuyers: 0, avgCLV: 0, maxCLV: 0, totalRevenue: 0, avgPurchases: 0, avgSpent: 0 };

        // Friendly labels for registration methods
        const methodLabels: Record<string, string> = {
            invitado: 'Invitado (Guest)',
            email: 'Email',
            google: 'Google',
            apple: 'Apple',
            facebook: 'Facebook',
        };

        return res.json({
            total,
            registrationMethods: registrationMethods.map((r: any) => ({
                method: methodLabels[r._id] || r._id || 'desconocido',
                count: r.count,
            })),
            genderDistribution: genderDist.map((g: any) => ({ gender: g._id || 'no_especificado', count: g.count })),
            purchaseBehavior: {
                totalBuyers: ob.totalBuyers,
                avgPurchases: Math.round(ob.avgPurchases * 10) / 10,
                avgSpent: Math.round(ob.avgSpent),
                conversionRate: total > 0 ? Math.round((ob.totalBuyers / total) * 1000) / 10 : 0,
            },
            health: healthAnalysis,
            clv: {
                average: Math.round(ob.avgCLV),
                max: Math.round(ob.maxCLV),
                totalRevenue: Math.round(ob.totalRevenue),
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

            // Monthly trend — show all available months (no date restriction)
            Order.aggregate([
                {
                    $match: {
                        ...filters,
                        createdAt: { $exists: true, $ne: null },
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
        if (req.query.brandId) {
            const brandId = req.query.brandId as string;
            filters.idMarca = mongoose.Types.ObjectId.isValid(brandId) ? new mongoose.Types.ObjectId(brandId) : brandId;
        }

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
        if (req.query.brandId) {
            const brandId = req.query.brandId as string;
            filters.idMarca = mongoose.Types.ObjectId.isValid(brandId) ? new mongoose.Types.ObjectId(brandId) : brandId;
        }

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
            byCategory: byCategory.map((c: any) => {
                let catName = 'Sin categoría';
                if (c._id) {
                    if (typeof c._id === 'string') catName = c._id;
                    else if (typeof c._id === 'object' && c._id.es) catName = c._id.es;
                    else if (typeof c._id === 'object' && c._id.en) catName = c._id.en;
                    else if (typeof c._id === 'object') catName = Object.values(c._id).find((v: any) => typeof v === 'string') as string || JSON.stringify(c._id);
                }
                return { category: catName, count: c.count };
            }),
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
        if (req.query.brandId) {
            const brandId = req.query.brandId as string;
            filters.idMarca = mongoose.Types.ObjectId.isValid(brandId) ? new mongoose.Types.ObjectId(brandId) : brandId;
        }

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
// GET /locations — Locales con coordenadas + stats all-time para el mapa
// ══════════════════════════════════════════════════════════════
// Reglas CANÓNICAS (mismas que el admin de las marcas / deenex-data):
//   venta real = paymentStatus PAGADO · facturación = venta BRUTA (cascada) · delivery = type ^delivery
const PAGADO_MATCH = { $regex: /^pagado$/i };
const _numExpr = (f: string) => ({ $convert: { input: f, to: 'double', onError: 0, onNull: 0 } });
const BRUTO_EXPR = {
    $let: {
        vars: {
            tobd: _numExpr('$account.totalOriginalBeforeDiscounts'),
            torig: _numExpr('$account.totalOriginal'),
            tf: _numExpr('$totalFacturado'),
            ptu: _numExpr('$account.pointsToUse'),
            ot: _numExpr('$account.orderTotal'),
            tot: _numExpr('$total'),
        },
        in: {
            $switch: {
                branches: [
                    { case: { $gt: ['$$tobd', 0] }, then: '$$tobd' },
                    { case: { $gt: ['$$torig', 0] }, then: '$$torig' },
                    { case: { $gt: ['$$tf', 0] }, then: { $add: ['$$tf', '$$ptu'] } },
                    { case: { $gt: ['$$ot', 0] }, then: '$$ot' },
                ],
                default: '$$tot',
            },
        },
    },
};
const IS_DELIVERY_EXPR = { $regexMatch: { input: { $ifNull: ['$type', ''] }, regex: /^delivery/ } };

// ¿La rama de BRUTO_EXPR que gana para este pedido trae el envío adentro? SOLO `tf+ptu` lo arrastra
// (lo declara la fuente canónica en deenex-data/src/core/filtros.js: "AUDIT OPF1-BRUTO-RAMA3-LATENTE-01:
// esta rama (tf+ptu) SÍ arrastra costo de envío"). Restarle el envío a las otras ramas descuenta algo
// que nunca estuvo sumado: sobre las 509 entregas históricas eran 472 pedidos mal restados, $1,29M de
// menos y 10 facturaciones negativas clampeadas a 0 que después se leían como "sin monto".
const BRUTO_INCLUYE_ENVIO_EXPR = {
    $let: {
        vars: {
            tobd: _numExpr('$account.totalOriginalBeforeDiscounts'),
            torig: _numExpr('$account.totalOriginal'),
            tf: _numExpr('$totalFacturado'),
            ot: _numExpr('$account.orderTotal'),
        },
        in: {
            $switch: {
                branches: [
                    { case: { $gt: ['$$tobd', 0] }, then: false },
                    { case: { $gt: ['$$torig', 0] }, then: false },
                    { case: { $gt: ['$$tf', 0] }, then: true },
                    { case: { $gt: ['$$ot', 0] }, then: false },
                ],
                default: true, // rama `total`: es el total del pedido, envío incluido
            },
        },
    },
};

router.get('/locations', async (_req: Request, res: Response) => {
    try {
        const Brand = getDeenexBrandModel();
        const Local = getDeenexLocalModel();
        const Order = getDeenexOrderModel();

        const [brands, locals, statsByLocal] = await Promise.all([
            Brand.find().select('appName domain').lean(),
            Local.find().select('nameLocal addressLocal statusLocal idMarca geoLocation').lean(),
            // Stats all-time por local (venta real). ~1,4s sobre 28k pagos → una sola query
            // alimenta el filtro de "local activo" y las stats del popup.
            Order.collection.aggregate([
                { $match: { paymentStatus: PAGADO_MATCH } },
                {
                    $group: {
                        _id: '$idLocal',
                        pedidos: { $sum: 1 },
                        facturacion: { $sum: BRUTO_EXPR },
                        pedidosDelivery: { $sum: { $cond: [IS_DELIVERY_EXPR, 1, 0] } },
                    },
                },
            ], { allowDiskUse: true }).toArray(),
        ]);

        const brandName = new Map<string, string>(
            brands.map((b: any) => [String(b._id), b.appName || b.domain || '—'])
        );
        const statsMap = new Map<string, any>(
            statsByLocal.map((s: any) => [String(s._id), s])
        );

        const locations = locals
            .map((l: any) => {
                const geo = l.geoLocation || {};
                return { l, lat: Number(geo.latitude), lng: Number(geo.longitude) };
            })
            .filter(({ lat, lng }) => Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0)
            .map(({ l, lat, lng }) => {
                const s = statsMap.get(String(l._id)) || { pedidos: 0, facturacion: 0, pedidosDelivery: 0 };
                return {
                    id: String(l._id),
                    nombre: l.nameLocal || 'Sin nombre',
                    direccion: l.addressLocal || '',
                    idMarca: String(l.idMarca ?? ''),
                    marca: brandName.get(String(l.idMarca ?? '')) || '—',
                    statusLocal: l.statusLocal === true,
                    pedidos: s.pedidos,
                    facturacion: Math.round(s.facturacion),
                    pedidosDelivery: s.pedidosDelivery,
                    lat,
                    lng,
                };
            });

        // TODAS las marcas viajan aparte para que la leyenda pueda mostrar en gris las que
        // no tienen ningún local activo (0 locales).
        const allBrands = brands.map((b: any) => ({
            idMarca: String(b._id),
            marca: b.appName || b.domain || '—',
        }));

        return res.json({ locations, brands: allBrands });
    } catch (error: any) {
        console.error('[DEENEX-MONITOR] Locations error:', error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════════════════════════
// GET /locations/:id/stats — Estadísticas mínimas de un local (para el popup del mapa)
// Canónico: venta real (paymentStatus PAGADO), facturación = GMV bruto, delivery = type ^delivery.
// Filtra por idMarca + idLocal para usar el índice compuesto idMarca_1_idLocal_1.
// ══════════════════════════════════════════════════════════════
router.get('/locations/:id/stats', async (req: Request, res: Response) => {
    try {
        const Order = getDeenexOrderModel();
        const idLocal = req.params.id;
        const idMarca = req.query.idMarca as string | undefined;

        const PAGADO = { $regex: /^pagado$/i };
        const num = (f: string) => ({ $convert: { input: f, to: 'double', onError: 0, onNull: 0 } });
        const BRUTO = { $let: { vars: {
            tobd: num('$account.totalOriginalBeforeDiscounts'), torig: num('$account.totalOriginal'),
            tf: num('$totalFacturado'), ptu: num('$account.pointsToUse'), ot: num('$account.orderTotal'), tot: num('$total') },
            in: { $switch: { branches: [
                { case: { $gt: ['$$tobd', 0] }, then: '$$tobd' },
                { case: { $gt: ['$$torig', 0] }, then: '$$torig' },
                { case: { $gt: ['$$tf', 0] }, then: { $add: ['$$tf', '$$ptu'] } },
                { case: { $gt: ['$$ot', 0] }, then: '$$ot' },
            ], default: '$$tot' } } } };
        const IS_DELIVERY = { $regexMatch: { input: { $ifNull: ['$type', ''] }, regex: /^delivery/ } };

        const match: any = { idLocal, paymentStatus: PAGADO };
        if (idMarca) match.idMarca = idMarca;

        const [r] = await Order.collection.aggregate([
            { $match: match },
            { $group: { _id: null,
                pedidos: { $sum: 1 },
                facturacion: { $sum: BRUTO },
                pedidosDelivery: { $sum: { $cond: [IS_DELIVERY, 1, 0] } },
            } },
        ], { allowDiskUse: true }).toArray();

        return res.json({
            pedidos: r?.pedidos || 0,
            facturacion: Math.round(r?.facturacion || 0),
            pedidosDelivery: r?.pedidosDelivery || 0,
        });
    } catch (error: any) {
        console.error('[DEENEX-MONITOR] Location stats error:', error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════════════════════════
// GET /heatmap/delivery — Puntos de ENTREGA para el mapa de calor
// ══════════════════════════════════════════════════════════════
// Usa la coordenada real de entrega del pedido (coordinates.dropoff), no la del local:
// muestra dónde está la DEMANDA de delivery. Solo venta real (PAGADO) y type ^delivery.
//
// Umbral de "entrega lejana". Se usa 3 km y no los 5 km donde el costo realmente se dispara (ahí el
// envío pasa de ~8% a 22% del ticket y el tiempo se duplica) porque arriba de 5 km hay 5 entregas en
// todo el histórico: no alcanzan para dibujar un mapa. A 3 km son ~21, que ya muestran algo.
const EFF_KM_LEJANO = 3;

// Cada punto viaja con lo necesario para las TRES capas de calor del front, sin pedir más llamadas:
//   · entregas    → peso 1 (dónde se pide más seguido)
//   · facturación → peso `bruto` (dónde está la plata, que no es lo mismo)
//   · lejanas     → se filtran por `dist` (entregas lejos del local = dónde falta un local)
router.get('/heatmap/delivery', async (_req: Request, res: Response) => {
    try {
        const Order = getDeenexOrderModel();
        const Local = getDeenexLocalModel();

        const [raw, locals] = await Promise.all([
            Order.collection.aggregate([
                {
                    $match: {
                        paymentStatus: PAGADO_MATCH,
                        type: { $regex: /^delivery/ },
                        'coordinates.dropoff.lat': { $exists: true, $ne: null },
                        'coordinates.dropoff.lon': { $exists: true, $ne: null },
                    },
                },
                {
                    $project: {
                        _id: 0,
                        lat: '$coordinates.dropoff.lat',
                        lng: '$coordinates.dropoff.lon',
                        idMarca: 1,
                        idLocal: 1,
                        // Venta BRUTA canónica + si esa rama trae el envío adentro (para restarlo solo ahí).
                        bruto: BRUTO_EXPR,
                        brutoIncluyeEnvio: BRUTO_INCLUYE_ENVIO_EXPR,
                        envio: { $convert: { input: '$account.shippingCost', to: 'double', onError: 0, onNull: 0 } },
                    },
                },
            ], { allowDiskUse: true }).toArray(),
            Local.find().select('geoLocation').lean(),
        ]);

        const geoById = new Map<string, any>(locals.map((l: any) => [String(l._id), l.geoLocation]));

        const puntos = raw
            .map((p: any) => {
                const lat = Number(p.lat), lng = Number(p.lng);
                const g = geoById.get(String(p.idLocal));
                // Distancia real local→entrega. null cuando el local no tiene coords (no se puede saber).
                let dist: number | null = null;
                if (g?.latitude && g?.longitude) {
                    const d = _haversineKm(Number(g.latitude), Number(g.longitude), lat, lng);
                    if (Number.isFinite(d) && d <= 200) dist = Number(d.toFixed(2));
                }
                return {
                    lat,
                    lng,
                    idMarca: String(p.idMarca ?? ''),
                    facturacion: Math.max(
                        Math.round((Number(p.bruto) || 0) - (p.brutoIncluyeEnvio ? Number(p.envio) || 0 : 0)),
                        0,
                    ),
                    dist,
                };
            })
            .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat !== 0 && p.lng !== 0);

        // Densidad por celda de ~1 km (2 decimales) → da el tope del rango de la leyenda.
        const celdas = new Map<string, number>();
        for (const p of puntos) {
            const k = `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`;
            celdas.set(k, (celdas.get(k) || 0) + 1);
        }
        const maxCelda = celdas.size > 0 ? Math.max(...celdas.values()) : 0;

        return res.json({
            puntos,
            total: puntos.length,
            maxCelda,
            // Umbral de "entrega lejana": a partir de acá el costo del envío se dispara (verificado:
            // el peso del envío pasa de ~8% a 22% y el tiempo se duplica cruzando los 5 km).
            umbralLejano: EFF_KM_LEJANO,
            totalLejanas: puntos.filter((p) => p.dist != null && p.dist >= EFF_KM_LEJANO).length,
            // Entregas cuya distancia NO se puede calcular: su `idLocal` no existe en `locales` (locales
            // borrados sin reasignar los pedidos). No son "cercanas", son no medibles → el front las saca
            // del denominador en vez de contarlas como si estuvieran dentro del radio.
            sinDistancia: puntos.filter((p) => p.dist == null).length,
            facturacionTotal: puntos.reduce((a, p) => a + p.facturacion, 0),
        });
    } catch (error: any) {
        console.error('[DEENEX-MONITOR] Heatmap delivery error:', error.message);
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
        if (req.query.brandId) {
            const brandId = req.query.brandId as string;
            filters.idMarca = mongoose.Types.ObjectId.isValid(brandId) ? new mongoose.Types.ObjectId(brandId) : brandId;
        }

        const locals = await Local.find(filters.idMarca ? { idMarca: filters.idMarca } : {})
            .select('nameLocal addressLocal statusLocal storeId idMarca')
            .lean();

        const orderFilters: any = {};
        if (filters.idMarca) orderFilters.idMarca = filters.idMarca;
        if (req.query.dateFrom || req.query.dateTo) {
            orderFilters.createdAt = {};
            if (req.query.dateFrom) orderFilters.createdAt.$gte = new Date(req.query.dateFrom as string);
            if (req.query.dateTo) orderFilters.createdAt.$lte = new Date(req.query.dateTo as string);
        }

        const pointsFilter: any = {};
        if (filters.idMarca) pointsFilter.idMarca = filters.idMarca;

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
                { $match: pointsFilter },
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

import { DeenexMetricsService } from '../services/deenex-metrics.service';

// ══════════════════════════════════════════════════════════════
// GET /product-metrics — Métricas generales solicitadas
// ══════════════════════════════════════════════════════════════
router.get('/product-metrics', async (req: Request, res: Response) => {
    try {
        const { brandIds, brandId, baseDate, periodType, periodsCount } = req.query;

        let parsedBrandIds: string[] = [];
        if (brandIds) {
            if (Array.isArray(brandIds)) parsedBrandIds = brandIds as string[];
            else if (typeof brandIds === 'string') parsedBrandIds = brandIds.split(',');
        } else if (brandId) {
            parsedBrandIds = [brandId as string];
        }

        const metrics = await DeenexMetricsService.getProductMetrics({
            brandIds: parsedBrandIds,
            baseDate: baseDate ? new Date(baseDate as string) : new Date(),
            periodType: (periodType as any) || 'monthly',
            periodsCount: periodsCount ? parseInt(periodsCount as string) : 3
        });

        return res.json(metrics);
    } catch (error: any) {
        console.error('[DEENEX-MONITOR] Product metrics error:', error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

// ══════════════════════════════════════════════════════════════
// GET /efficiency — Eficiencia logística del delivery (panel de Ops)
// ══════════════════════════════════════════════════════════════
// Responde dos decisiones de Deenex como empresa: (1) ¿hace falta sumar operadores logísticos?
// (2) ¿abrir más locales canibaliza o abarata? Todo se calcula cruzando la coordenada de ENTREGA
// (coordinates.dropoff) con la del local → distancia real recorrida por pedido.
//
// Complementa (no duplica) la sección Delivery de deenex-data, que mide volumen, tiempos y desenlaces:
// acá lo que se agrega es la dimensión GEOGRÁFICA (distancia, densidad de locales, ranking).
//
// HONESTIDAD DE LOS DATOS (verificado contra prod 2026-07-26):
//  - `account.shippingCost` es lo que se COBRA de envío, NO la comisión del marketplace. El costo real
//    de Rappi no está en la base → los ratios miden peso del envío sobre la comida, no margen.
//  - `estadoDeOrden` distinto de ENTREGADO casi siempre es estado sin actualizar (pedidos viejos), no
//    una falla: por eso solo se cuentan como falla CANCELADO y PICKUPFAILED.
//  - El volumen es chico (~500 entregas históricas, mediana 4 por local) → se devuelve `n` en cada
//    corte para que el front pueda avisar cuándo la muestra no alcanza.
const EFF_MIN_PEDIDOS_LOCAL = 10;   // volumen mínimo para rankear un local
const EFF_VECINO_KM = 2;            // radio para considerar "local hermano cerca"
const EFF_FALLAS_REALES = ['CANCELADO', 'PICKUPFAILED'];

function _haversineKm(aLat: number, aLng: number, bLat: number, bLng: number) {
    const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
    const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
}
const _mediana = (arr: number[]) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
};

router.get('/efficiency', async (req: Request, res: Response) => {
    try {
        const Local = getDeenexLocalModel();
        const Brand = getDeenexBrandModel();
        const Order = getDeenexOrderModel();

        // Ventana opcional (?from=YYYY-MM-DD&to=YYYY-MM-DD). Sin ventana = histórico completo, que es
        // el default a propósito: con ~500 entregas totales, cortar por mes deja la muestra en nada.
        const match: any = { paymentStatus: PAGADO_MATCH, type: { $regex: /^delivery/i }, 'coordinates.dropoff.lat': { $exists: true, $ne: null } };
        if (req.query.from || req.query.to) {
            match.created = {};
            if (req.query.from) match.created.$gte = new Date(String(req.query.from));
            if (req.query.to) match.created.$lte = new Date(String(req.query.to));
        }

        const [brands, locals, pedidos] = await Promise.all([
            Brand.find().select('appName domain').lean(),
            Local.find().select('nameLocal idMarca geoLocation statusLocal').lean(),
            Order.collection.find(match, {
                projection: { idLocal: 1, idMarca: 1, idCliente: 1, type: 1, coordinates: 1, account: 1, totalFacturado: 1, estadoDeOrden: 1, created: 1, update: 1, deliveryCondiciones: 1 },
            }).toArray(),
        ]);

        const brandName = new Map<string, string>(brands.map((b: any) => [String(b._id), b.appName || b.domain || '—']));
        const localById = new Map<string, any>(locals.map((l: any) => [String(l._id), l]));

        // ── Enriquecer cada pedido con distancia, canal, costos y tiempo ──
        const rows: any[] = [];
        for (const p of pedidos) {
            const loc = localById.get(String(p.idLocal));
            const geo = loc?.geoLocation;
            if (!geo?.latitude || !geo?.longitude) continue;
            const dist = _haversineKm(Number(geo.latitude), Number(geo.longitude), Number(p.coordinates.dropoff.lat), Number(p.coordinates.dropoff.lon));
            if (!Number.isFinite(dist) || dist > 200) continue; // outlier de carga

            const tipo = String(p.type || '').toLowerCase();
            const canal = /rappi|pedidosya|pedidos_ya|mercado|uber|justo/.test(tipo) ? 'terceros' : 'propio';
            // `account.shippingCost` == `deliveryCondiciones.costoUsuario` (verificado en prod): es lo
            // que paga EL CLIENTE. Lo que realmente le pesa al comercio es `costoMarca`, la parte del
            // envío que absorbe. Cobertura de deliveryCondiciones: 99% (503/509).
            const dc = p.deliveryCondiciones || {};
            const envio = Number(p.account?.shippingCost) || 0;
            const costoTotalEnvio = Number(dc.costoTotal) || envio;
            const costoMarca = Number(dc.costoMarca) || 0;
            const costoUsuario = Number(dc.costoUsuario) || envio;
            const envioGratis = dc.envioGratis === true;
            const bruto = Number(p.account?.totalinvoiced) || Number(p.totalFacturado) || 0;
            const comida = Math.max(bruto - envio, 0);
            // Tiempo de ciclo: created→update. Se acota a [5,180] min porque `update` se toca después por
            // otros motivos (hay diferencias de meses) y arruinaría el promedio.
            let mins: number | null = null;
            if (p.created && p.update) {
                const m = (new Date(p.update).getTime() - new Date(p.created).getTime()) / 60000;
                if (m >= 5 && m <= 180) mins = m;
            }
            rows.push({ locId: String(p.idLocal), loc, canal, dist, envio, comida, mins, estado: p.estadoDeOrden, cliente: String(p.idCliente), costoTotalEnvio, costoMarca, costoUsuario, envioGratis });
        }

        const ratiosDe = (rs: any[]) => rs.filter((r) => r.envio > 0 && r.comida > 0).map((r) => r.envio / r.comida);
        const resumenDe = (rs: any[]) => ({
            n: rs.length,
            distanciaMediana: Number(_mediana(rs.map((r) => r.dist)).toFixed(2)),
            envioMediano: Math.round(_mediana(rs.map((r) => r.envio))),
            pctEnvioSobreComida: Number((100 * _mediana(ratiosDe(rs))).toFixed(1)),
            tiempoMediano: Math.round(_mediana(rs.filter((r) => r.mins != null).map((r) => r.mins))),
            nConTiempo: rs.filter((r) => r.mins != null).length,
            fallas: rs.filter((r) => EFF_FALLAS_REALES.includes(r.estado)).length,
            gmv: Math.round(rs.reduce((a, r) => a + r.comida, 0)),
            // ── Quién paga el envío (deliveryCondiciones) ──
            // Lo que absorbe el comercio vs lo que paga el cliente. Es el costo REAL para el negocio:
            // el ratio de arriba (envío/comida) mide el peso del envío, éste mide lo que se le descuenta.
            costoEnvioTotal: Math.round(rs.reduce((a, r) => a + r.costoTotalEnvio, 0)),
            costoAbsorbidoMarca: Math.round(rs.reduce((a, r) => a + r.costoMarca, 0)),
            costoPagadoUsuario: Math.round(rs.reduce((a, r) => a + r.costoUsuario, 0)),
            pctEnvioAbsorbidoMarca: (() => {
                const t = rs.reduce((a, r) => a + r.costoTotalEnvio, 0);
                return t > 0 ? Number(((100 * rs.reduce((a, r) => a + r.costoMarca, 0)) / t).toFixed(1)) : 0;
            })(),
            enviosGratis: rs.filter((r) => r.envioGratis).length,
        });

        // ── 1) Canal: terceros vs propio ──
        const canales = ['terceros', 'propio'].map((c) => ({ canal: c, ...resumenDe(rows.filter((r) => r.canal === c)) }));

        // ── 2) El acantilado: costo y tiempo por rango de distancia ──
        const RANGOS: Array<[number, number, string]> = [[0, 1, '0-1 km'], [1, 2, '1-2 km'], [2, 5, '2-5 km'], [5, Infinity, '+5 km']];
        const porDistancia = RANGOS.map(([a, b, label]) => ({ rango: label, ...resumenDe(rows.filter((r) => r.dist >= a && r.dist < b)) }));

        // ── 3) Densidad de locales: ¿los hermanos cerca canibalizan o abaratan? ──
        const porLocal = new Map<string, any[]>();
        for (const r of rows) {
            if (!porLocal.has(r.locId)) porLocal.set(r.locId, []);
            porLocal.get(r.locId)!.push(r);
        }
        const locales_ = Array.from(porLocal.entries()).map(([locId, rs]) => {
            const loc = localById.get(locId);
            const vecinos = locals.filter((o: any) => String(o._id) !== locId
                && String(o.idMarca) === String(loc.idMarca)
                && o.geoLocation?.latitude
                && _haversineKm(Number(loc.geoLocation.latitude), Number(loc.geoLocation.longitude), Number(o.geoLocation.latitude), Number(o.geoLocation.longitude)) < EFF_VECINO_KM).length;
            const base = resumenDe(rs);
            return {
                id: locId,
                nombre: loc.nameLocal || 'Sin nombre',
                marca: brandName.get(String(loc.idMarca)) || '—',
                vecinosCerca: vecinos,
                pctTerceros: Number((100 * rs.filter((r) => r.canal === 'terceros').length / rs.length).toFixed(0)),
                clientes: new Set(rs.map((r) => r.cliente)).size,
                ...base,
            };
        });

        const GRUPOS: Array<[(v: number) => boolean, string]> = [
            [(v) => v === 0, 'Aislado (0 hermanos a 2 km)'],
            [(v) => v === 1, '1 hermano cerca'],
            [(v) => v >= 2, '2 o más hermanos cerca'],
        ];
        const porDensidad = GRUPOS.map(([test, label]) => {
            const g = locales_.filter((l) => test(l.vecinosCerca));
            return {
                grupo: label,
                locales: g.length,
                pedidosMedianaPorLocal: Math.round(_mediana(g.map((l) => l.n))),
                distanciaMediana: Number(_mediana(g.map((l) => l.distanciaMediana)).toFixed(2)),
                pctEnvioSobreComida: Number(_mediana(g.map((l) => l.pctEnvioSobreComida)).toFixed(1)),
            };
        });

        // ── 4) Ranking (solo locales con volumen suficiente para no rankear ruido) ──
        const rankeables = locales_.filter((l) => l.n >= EFF_MIN_PEDIDOS_LOCAL)
            .sort((a, b) => a.pctEnvioSobreComida - b.pctEnvioSobreComida);

        return res.json({
            resumen: {
                ...resumenDe(rows),
                localesConEntregas: locales_.length,
                localesRankeables: rankeables.length,
                entregasLejanas: rows.filter((r) => r.dist >= EFF_KM_LEJANO).length,
            },
            canales,
            porDistancia,
            porDensidad,
            ranking: rankeables,
            umbrales: { minPedidosLocal: EFF_MIN_PEDIDOS_LOCAL, vecinoKm: EFF_VECINO_KM },
            // Se declaran las limitaciones para que el front las muestre en vez de que alguien lea de más.
            advertencias: {
                costoEnvioSeparado: 'El costo de envío está separado en lo que absorbe el comercio y lo que paga el cliente (deliveryCondiciones, 99% de cobertura). "Envío / comida" mide el peso del envío sobre el ticket; "absorbido por la marca" es lo que efectivamente le cuesta al negocio.',
                sinComisionMarketplace: 'La comisión que cobra Rappi NO está en el sistema (se buscó en locales, brands, pagos y liquidaciones): es un dato externo del contrato. Sin él no se puede calcular el margen final del canal de terceros.',
                fallasSubestimadas: 'Solo se cuentan como falla CANCELADO y PICKUPFAILED; el resto de los estados abiertos son pedidos sin actualizar.',
                muestraChica: 'Volumen histórico bajo: cada corte trae su `n` para poder juzgar si el número es representativo.',
            },
        });
    } catch (error: any) {
        console.error('[DEENEX-MONITOR] Efficiency error:', error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
// touch to trigger tsx watch
