import { 
    getDeenexClienteModel, 
    getDeenexOrderModel, 
    getDeenexLocalModel 
} from '../models/deenex-models';
import mongoose from 'mongoose';
import { 
    startOfMonth, 
    endOfMonth, 
    subMonths, 
    startOfDay, 
    endOfDay, 
    subDays,
    getYear,
    getMonth,
    format as formatDate 
} from 'date-fns';

export interface MetricsResult {
    periodLabel: string;
    metrics: {
        tasaRegistro: number;
        localesActivos50Orders: number;
        localesActivosTotal: number;
        ahorroDirecto: number;
        pPedidosMesa: number;
        pPedidosLlevar: number;
        pPedidosDelivery: number;
        incrementoBase: number;
        registrosNuevos: number;
        baseTotalRegistrada: number;
        pBaseActiva: number;
        pUsuariosActivados: number;
        pBaseSaludable: number;
        pRecompra: number;
    }
}

export class DeenexMetricsService {
    static async getProductMetrics(options: { 
        brandId?: string, 
        baseDate?: Date, 
        periodType: 'weekly' | 'monthly' | 'quarterly' | 'four-monthly',
        periodsCount?: number 
    }): Promise<MetricsResult[]> {
        const { brandId, baseDate = new Date(), periodType, periodsCount = 3 } = options;
        
        // Define periods
        const results: MetricsResult[] = [];
        
        for (let i = 0; i < periodsCount; i++) {
            let start: Date, end: Date, prevStart: Date, prevEnd: Date, label: string;

            if (periodType === 'weekly') {
                // 15 days periods
                const periodEnd = subDays(baseDate, i * 15);
                start = startOfDay(subDays(periodEnd, 14));
                end = i === 0 ? baseDate : endOfDay(periodEnd);
                prevStart = startOfDay(subDays(start, 15));
                prevEnd = endOfDay(subDays(start, 1));
                label = `${formatDate(start, 'dd/MM')} - ${formatDate(end, 'dd/MM/yy')}`;
            } else if (periodType === 'quarterly') {
                // 3 months periods
                const periodMonth = subMonths(baseDate, i * 3);
                start = startOfMonth(subMonths(periodMonth, 2));
                end = i === 0 ? baseDate : endOfMonth(periodMonth);
                prevStart = startOfMonth(subMonths(start, 3));
                prevEnd = endOfMonth(subMonths(start, 1));
                label = `T${Math.floor(getMonth(start) / 3) + 1} ${getYear(start)}`;
            } else if (periodType === 'four-monthly') {
                // 4 months periods
                const periodMonth = subMonths(baseDate, i * 4);
                start = startOfMonth(subMonths(periodMonth, 3));
                end = i === 0 ? baseDate : endOfMonth(periodMonth);
                prevStart = startOfMonth(subMonths(start, 4));
                prevEnd = endOfMonth(subMonths(start, 1));
                label = `Cuatrimestre ${Math.floor(getMonth(start) / 4) + 1} ${getYear(start)}`;
            } else {
                // monthly
                const date = subMonths(baseDate, i);
                start = startOfMonth(date);
                end = i === 0 && baseDate < endOfMonth(date) ? baseDate : endOfMonth(date);
                prevStart = startOfMonth(subMonths(start, 1));
                prevEnd = endOfMonth(subMonths(start, 1));
                label = date.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
            }

            const metrics = await this.calculateMetricsForPeriod(start, end, prevStart, prevEnd, brandId);
            results.push({
                periodLabel: label,
                metrics
            });
        }

        return results;
    }

    private static async calculateMetricsForPeriod(
        start: Date, 
        end: Date, 
        prevStart: Date,
        prevEnd: Date,
        brandId?: string
    ) {
        const Cliente = getDeenexClienteModel();
        const Order = getDeenexOrderModel();
        const Local = getDeenexLocalModel();

        const filters: any = {};
        if (brandId) {
            const brandObj = mongoose.Types.ObjectId.isValid(brandId) 
                ? new mongoose.Types.ObjectId(brandId) 
                : null;
            
            filters.$or = [
                { idMarca: brandId },
                { idMarca: brandObj }
            ].filter(o => o.idMarca !== null);
        }

        const orderFilters = { ...filters, created: { $gte: start, $lte: end } };
        const clientFilters = { ...filters }; 

        const [
            regCount,
            guestCount,
            orders,
            totalLocals,
            newRegisters,
            baseTotalBefore,
            activeUsersInPeriod,
            newRegistersWhoOrdered,
            recompraUsers
        ] = await Promise.all([
            // 1. % registros sobre usuarios totales (IN THIS PERIOD)
            Cliente.collection.countDocuments({ ...clientFilters, created: { $gte: start, $lte: end }, typeUser: { $ne: "guest" }, email: { $not: /@guest\.com$/i } }),
            Cliente.collection.countDocuments({ ...clientFilters, created: { $gte: start, $lte: end }, $or: [{ typeUser: "guest" }, { email: { $regex: /@guest\.com$/i } }] }),

            // Orders summary
            Order.aggregate([
                { $match: orderFilters },
                {
                    $group: {
                        _id: null,
                        totalOrders: { $sum: 1 },
                        totalBillingDelivery: { 
                            $sum: { $cond: [{ $in: ["$type", ["delivery", "delivery_propio"]] }, "$totalFacturado", 0] } 
                        },
                        countMesa: { $sum: { $cond: [{ $eq: ["$type", "mesa"] }, 1, 0] } },
                        countLlevar: { $sum: { $cond: [{ $eq: ["$type", "takeaway"] }, 1, 0] } }, 
                        countDelivery: { $sum: { $cond: [{ $in: ["$type", ["delivery", "delivery_propio"]] }, 1, 0] } },
                        activeUserIds: { $addToSet: "$idCliente" }
                    }
                }
            ]),

            // 2. Locales activos
            Local.collection.countDocuments({ ...filters, statusLocal: true }),

            // Growth
            Cliente.collection.countDocuments({ ...filters, created: { $gte: start, $lte: end }, typeUser: { $ne: "guest" } }),
            Cliente.collection.countDocuments({ ...filters, created: { $lte: end }, typeUser: { $ne: "guest" } }),

            // % base activa
            Order.collection.distinct('idCliente', orderFilters),

            // % usuarios activados
            (async () => {
                const newClientIds = await Cliente.collection.distinct('_id', { ...filters, created: { $gte: start, $lte: end }, typeUser: { $ne: "guest" } });
                if (newClientIds.length === 0) return 0;
                const buyers = await Order.collection.distinct('idCliente', { ...orderFilters, idCliente: { $in: newClientIds.map(id => id.toString()) } });
                return buyers.length;
            })(),

            // % recompra
            (async () => {
                const oldClientIds = await Cliente.collection.distinct('_id', { ...filters, created: { $lt: start }, typeUser: { $ne: "guest" } });
                if (oldClientIds.length === 0) return 0;
                const buyers = await Order.collection.distinct('idCliente', { ...orderFilters, idCliente: { $in: oldClientIds.map(id => id.toString()) } });
                return buyers.length;
            })()
        ]);

        const orderSummary = orders[0] || { totalOrders: 0, totalBillingDelivery: 0, countMesa: 0, countLlevar: 0, countDelivery: 0, activeUserIds: [] };
        
        // Locales with > 50 orders
        const localesWith50 = await Order.aggregate([
            { $match: orderFilters },
            { $group: { _id: "$idLocal", count: { $sum: 1 } } },
            { $match: { count: { $gt: 50 } } }
        ]);

        const totalRegistered = baseTotalBefore; // This is the cumulative total at the end of the period
        const totalUsers = regCount + guestCount;
        
        // Final calculations
        const pRegistros = totalUsers > 0 ? (regCount / totalUsers) * 100 : 0;
        const localesActivos50 = totalLocals > 0 ? (localesWith50.length / totalLocals) * 100 : 0;
        const ahorro = orderSummary.totalBillingDelivery * 0.15;
        const pMesa = orderSummary.totalOrders > 0 ? (orderSummary.countMesa / orderSummary.totalOrders) * 100 : 0;
        const pLlevar = orderSummary.totalOrders > 0 ? (orderSummary.countLlevar / orderSummary.totalOrders) * 100 : 0;
        const pDelivery = orderSummary.totalOrders > 0 ? (orderSummary.countDelivery / orderSummary.totalOrders) * 100 : 0;
        
        const baseAtStart = totalRegistered - newRegisters;
        const aumentoBase = baseAtStart > 0 ? (newRegisters / baseAtStart) * 100 : 0;
        const pBaseActiva = totalRegistered > 0 ? (activeUsersInPeriod.length / totalRegistered) * 100 : 0;
        
        const pActivados = newRegisters > 0 ? (newRegistersWhoOrdered / newRegisters) * 100 : 0;
        const pRecompra = totalRegistered > 0 ? (recompraUsers / totalRegistered) * 100 : 0;

        // Calculate Healthy Base (users who ordered in current period AND previous period)
        const currentPeriodUsers = await Order.collection.distinct('idCliente', { ...filters, created: { $gte: start, $lte: end } });
        const prevPeriodUsers = await Order.collection.distinct('idCliente', { ...filters, created: { $gte: prevStart, $lte: prevEnd } });
        const commonUsers = currentPeriodUsers.filter(id => prevPeriodUsers.includes(id));

        const pSaludable = totalRegistered > 0 ? (commonUsers.length / totalRegistered) * 100 : 0;

        return {
            tasaRegistro: Number(pRegistros.toFixed(2)),
            localesActivos50Orders: Number(localesActivos50.toFixed(2)),
            localesActivosTotal: totalLocals,
            ahorroDirecto: Math.round(ahorro),
            pPedidosMesa: Number(pMesa.toFixed(2)),
            pPedidosLlevar: Number(pLlevar.toFixed(2)),
            pPedidosDelivery: Number(pDelivery.toFixed(2)),
            incrementoBase: Number(aumentoBase.toFixed(2)),
            registrosNuevos: newRegisters,
            baseTotalRegistrada: totalRegistered, 
            pBaseActiva: Number(pBaseActiva.toFixed(2)),
            pUsuariosActivados: Number(pActivados.toFixed(2)),
            pBaseSaludable: Number(pSaludable.toFixed(2)),
            pRecompra: Number(pRecompra.toFixed(2))
        };
    }
}
