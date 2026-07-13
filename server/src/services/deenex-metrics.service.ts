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
    format as formatDate,
    differenceInDays,
    isAfter
} from 'date-fns';

// ── Reglas CANÓNICAS (alineadas con deenex-data / el admin de Palta, auditadas 2026-07) ─────────────────
// venta real = paymentStatus PAGADO (sin gate de estadoDeOrden); GMV = VENTA BRUTA (incluye lo pagado con
// puntos, misma cascada que ordenes.js/filtros.js BRUTO_FIELD); cliente registrado = typeUser!=guest Y
// delete!='true' (campo String); delivery = cualquier type que empiece con "delivery" (propio + terceros/rappi).
// Antes esto usaba: SIN filtro de pago (contaba pendientes/cancelados), GMV=totalFacturado cash, delivery solo
// ["delivery","delivery_propio"] (perdía delivery_rappi ~74%), registrado por heurística de email @guest.com.
const PAGADO = { $regex: /^pagado$/i };
const NO_BORRADO = { delete: { $ne: 'true' } };
const _num = (f: string) => ({ $convert: { input: f, to: 'double', onError: 0, onNull: 0 } });
const BRUTO_FIELD: any = { $let: { vars: {
    tobd: _num('$account.totalOriginalBeforeDiscounts'),
    torig: _num('$account.totalOriginal'),
    tf: _num('$totalFacturado'),
    ptu: _num('$account.pointsToUse'),
    ot: _num('$account.orderTotal'),
    tot: _num('$total'),
}, in: { $switch: { branches: [
    { case: { $gt: ['$$tobd', 0] }, then: '$$tobd' },
    { case: { $gt: ['$$torig', 0] }, then: '$$torig' },
    { case: { $gt: ['$$tf', 0] }, then: { $add: ['$$tf', '$$ptu'] } },
    { case: { $gt: ['$$ot', 0] }, then: '$$ot' },
], default: '$$tot' } } } };
const IS_DELIVERY: any = { $regexMatch: { input: { $ifNull: ['$type', ''] }, regex: /^delivery/ } };

export interface MetricsResult {
    periodLabel: string;
    isCurrent?: boolean;
    daysElapsed?: number;
    metrics: {
        tasaRegistro: number;
        localesActivosCount: number;
        localesActivos50Orders: number;
        localesActivosTotal: number;
        pedidosPorLocal: number;
        pedidosTotales: number;
        gmv: number;
        aov: number;
        cantMesa: number;
        cantLlevar: number;
        cantDelivery: number;
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
        // Completadas 2026-07-13 (antes marcaban "⚠ Agregar" en el front):
        frecuenciaCompra: number;   // pedidos ÷ compradores activos del período (venta real)
        pUsuariosPuntos: number;    // % de la base registrada con historial de puntos
        pChurn: number;             // % de compradores registrados inactivos +90 días (abandono)
    }
}

export class DeenexMetricsService {
    static async getProductMetrics(options: { 
        brandIds?: string[], 
        baseDate?: Date, 
        periodType: 'weekly' | 'monthly' | 'quarterly' | 'four-monthly',
        periodsCount?: number 
    }): Promise<MetricsResult[]> {
        const { brandIds = [], baseDate = new Date(), periodType, periodsCount = 3 } = options;
        
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

            const metrics = await this.calculateMetricsForPeriod(start, end, prevStart, prevEnd, brandIds);
            
            // Check if baseDate falls within this period
            const isCurrent = (start <= baseDate && baseDate <= endOfDay(end)) || (i === 0 && start <= baseDate);
            const daysElapsed = isCurrent ? Math.max(1, differenceInDays(baseDate, start) + 1) : undefined;

            results.push({
                periodLabel: label,
                isCurrent,
                daysElapsed,
                metrics
            });
        }

        // Reverse to exhibit chronological order (oldest -> newest)
        results.reverse();

        return results;
    }

    private static async calculateMetricsForPeriod(
        start: Date, 
        end: Date, 
        prevStart: Date,
        prevEnd: Date,
        brandIds: string[]
    ) {
        const Cliente = getDeenexClienteModel();
        const Order = getDeenexOrderModel();
        const Local = getDeenexLocalModel();

        const filters: any = {};
        if (brandIds && brandIds.length > 0) {
            const orConditions: any[] = [];
            for (const id of brandIds) {
                if (!id) continue;
                orConditions.push({ idMarca: id });
                if (mongoose.Types.ObjectId.isValid(id)) {
                    orConditions.push({ idMarca: new mongoose.Types.ObjectId(id) });
                }
            }
            if (orConditions.length > 0) {
                filters.$or = orConditions;
            }
        }

        // VENTA REAL: solo pedidos PAGADO (antes se contaban todos los estados → pedidos/GMV inflados).
        const orderFilters = { ...filters, paymentStatus: PAGADO, created: { $gte: start, $lte: end } };
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
            // 1. % registros sobre usuarios totales (IN THIS PERIOD). Registrado = typeUser!=guest Y no borrado
            //    (canónico). Antes usaba heurística de email @guest.com; ahora gatea delete!='true'.
            Cliente.collection.countDocuments({ ...clientFilters, created: { $gte: start, $lte: end }, typeUser: { $ne: "guest" }, ...NO_BORRADO }),
            Cliente.collection.countDocuments({ ...clientFilters, created: { $gte: start, $lte: end }, typeUser: "guest", ...NO_BORRADO }),

            // Orders summary
            Order.aggregate([
                { $match: orderFilters },
                {
                    $group: {
                        _id: null,
                        totalOrders: { $sum: 1 },
                        // GMV de delivery (para el ahorro vs agregadores) — TODO delivery (propio+terceros), en BRUTO.
                        totalBillingDelivery: {
                            $sum: { $cond: [IS_DELIVERY, BRUTO_FIELD, 0] }
                        },
                        // GMV = VENTA BRUTA (no el cash de totalFacturado). Se mantiene el nombre del campo por compat.
                        totalFacturado: { $sum: BRUTO_FIELD },
                        countMesa: { $sum: { $cond: [{ $eq: ["$type", "mesa"] }, 1, 0] } },
                        countLlevar: { $sum: { $cond: [{ $eq: ["$type", "takeaway"] }, 1, 0] } },
                        // Delivery = cualquier "delivery*" (incluye delivery_rappi/terceros que antes se perdían).
                        countDelivery: { $sum: { $cond: [IS_DELIVERY, 1, 0] } },
                        activeUserIds: { $addToSet: "$idCliente" }
                    }
                }
            ]),

            // 2. Locales activos
            Local.collection.countDocuments({ ...filters, statusLocal: true }),

            // Growth (altas registradas del período / base acumulada al fin) — no borrados.
            Cliente.collection.countDocuments({ ...filters, created: { $gte: start, $lte: end }, typeUser: { $ne: "guest" }, ...NO_BORRADO }),
            Cliente.collection.countDocuments({ ...filters, created: { $lte: end }, typeUser: { $ne: "guest" }, ...NO_BORRADO }),

            // % base activa
            Order.collection.distinct('idCliente', orderFilters),

            // % usuarios activados
            (async () => {
                const newClientIds = await Cliente.collection.distinct('_id', { ...filters, created: { $gte: start, $lte: end }, typeUser: { $ne: "guest" }, ...NO_BORRADO });
                if (newClientIds.length === 0) return 0;
                const buyers = await Order.collection.distinct('idCliente', { ...orderFilters, idCliente: { $in: newClientIds.map(id => id.toString()) } });
                return buyers.length;
            })(),

            // % recompra
            (async () => {
                const oldClientIds = await Cliente.collection.distinct('_id', { ...filters, created: { $lt: start }, typeUser: { $ne: "guest" }, ...NO_BORRADO });
                if (oldClientIds.length === 0) return 0;
                const buyers = await Order.collection.distinct('idCliente', { ...orderFilters, idCliente: { $in: oldClientIds.map(id => id.toString()) } });
                return buyers.length;
            })()
        ]);

        const orderSummary = orders[0] || { totalOrders: 0, totalFacturado: 0, totalBillingDelivery: 0, countMesa: 0, countLlevar: 0, countDelivery: 0, activeUserIds: [] };
        
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
        const pedidosPorLocal = totalLocals > 0 ? (orderSummary.totalOrders / totalLocals) : 0;
        
        const gmv = orderSummary.totalFacturado;
        const aov = orderSummary.totalOrders > 0 ? gmv / orderSummary.totalOrders : 0;

        const ahorro = orderSummary.totalBillingDelivery * 0.15;
        const pMesa = orderSummary.totalOrders > 0 ? (orderSummary.countMesa / orderSummary.totalOrders) * 100 : 0;
        const pLlevar = orderSummary.totalOrders > 0 ? (orderSummary.countLlevar / orderSummary.totalOrders) * 100 : 0;
        const pDelivery = orderSummary.totalOrders > 0 ? (orderSummary.countDelivery / orderSummary.totalOrders) * 100 : 0;
        
        const baseAtStart = totalRegistered - newRegisters;
        const aumentoBase = baseAtStart > 0 ? (newRegisters / baseAtStart) * 100 : 0;
        const pBaseActiva = totalRegistered > 0 ? (activeUsersInPeriod.length / totalRegistered) * 100 : 0;
        
        const pActivados = newRegisters > 0 ? (newRegistersWhoOrdered / newRegisters) * 100 : 0;
        const pRecompra = totalRegistered > 0 ? (recompraUsers / totalRegistered) * 100 : 0;

        // Calculate Healthy Base (users who ordered — VENTA REAL — in current period AND previous period)
        const currentPeriodUsers = await Order.collection.distinct('idCliente', { ...filters, paymentStatus: PAGADO, created: { $gte: start, $lte: end } });
        const prevPeriodUsers = await Order.collection.distinct('idCliente', { ...filters, paymentStatus: PAGADO, created: { $gte: prevStart, $lte: prevEnd } });
        const commonUsers = currentPeriodUsers.filter(id => prevPeriodUsers.includes(id));

        const pSaludable = totalRegistered > 0 ? (commonUsers.length / totalRegistered) * 100 : 0;

        // ── Métricas completadas 2026-07-13 (antes "⚠ Agregar" en el front) ──────────────────────────
        // Frecuencia = pedidos (venta real) ÷ compradores activos del período (mismo criterio que
        // frecuenciaCompra de deenex-data). activeUsersInPeriod = distinct idCliente de pedidos PAGADO.
        const frecuencia = activeUsersInPeriod.length > 0 ? orderSummary.totalOrders / activeUsersInPeriod.length : 0;

        // Usuarios en Puntos = % de la base registrada (al fin del período) con saldo de puntos. El campo real
        // en usuariosregistrados es `totalPoints` (NO 'puntosHistoricos'; verificado contra prod).
        const usuariosConPuntos = await Cliente.collection.countDocuments({ ...filters, created: { $lte: end }, typeUser: { $ne: 'guest' }, ...NO_BORRADO, totalPoints: { $gt: 0 } });
        const pPuntos = totalRegistered > 0 ? (usuariosConPuntos / totalRegistered) * 100 : 0;

        // Churn = % de compradores REGISTRADOS cuya ÚLTIMA compra (venta real, hasta `end`) fue hace +90 días
        // (mismo umbral DIAS_INACTIVO=90 y criterio de deenex-data valorYRetencion). El usuario NO tiene campo
        // de última-compra (totalCompras/ultimaCompra no existen en la colección) → se deriva de `pagos`.
        const churnCutoff = subDays(end, 90);
        const registeredIds = new Set(
            (await Cliente.collection.distinct('_id', { ...filters, created: { $lte: end }, typeUser: { $ne: 'guest' }, ...NO_BORRADO }))
                .map((id: any) => String(id))
        );
        const buyerLast: any[] = await Order.aggregate([
            { $match: { ...filters, paymentStatus: PAGADO, created: { $lte: end } } },
            { $group: { _id: '$idCliente', ultimo: { $max: '$created' } } },
        ]);
        let compradoresReg = 0, compradoresInactivos = 0;
        for (const b of buyerLast) {
            if (!registeredIds.has(String(b._id))) continue;
            compradoresReg++;
            if (b.ultimo && new Date(b.ultimo) < churnCutoff) compradoresInactivos++;
        }
        const pChurn = compradoresReg > 0 ? (compradoresInactivos / compradoresReg) * 100 : 0;

        return {
            tasaRegistro: Number(pRegistros.toFixed(2)),
            localesActivosCount: localesWith50.length,
            localesActivos50Orders: Number(localesActivos50.toFixed(2)),
            localesActivosTotal: totalLocals,
            pedidosPorLocal: Number(pedidosPorLocal.toFixed(2)),
            pedidosTotales: orderSummary.totalOrders,
            gmv: gmv,
            aov: Math.round(aov),
            cantMesa: orderSummary.countMesa,
            cantLlevar: orderSummary.countLlevar,
            cantDelivery: orderSummary.countDelivery,
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
            pRecompra: Number(pRecompra.toFixed(2)),
            frecuenciaCompra: Number(frecuencia.toFixed(2)),
            pUsuariosPuntos: Number(pPuntos.toFixed(2)),
            pChurn: Number(pChurn.toFixed(2))
        };
    }
}
