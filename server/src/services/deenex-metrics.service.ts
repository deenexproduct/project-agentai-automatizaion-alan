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
} from 'date-fns';
import { fetchPanelOps, marcaScope, PanelOpsWindow } from './deenex-data.client';

// ── FUENTE ÚNICA DE VERDAD ────────────────────────────────────────────────────────────────────────────
// Estas métricas ya NO se calculan acá: se consumen del microservicio `deenex-data` (GET /stats/:scope/
// panel-ops), el MISMO que alimenta las estadísticas de los admins de cada marca. Antes este servicio
// reimplementaba las reglas (GMV/pedidos/delivery/registros/churn/…) sobre la DB de prod → riesgo de drift
// vs. lo que ve el comercio. Ahora Ops es un passthrough: arma las ventanas de cada período y pide las
// métricas canónicas. Ver [[deenex_data]] / panelOps.js para las definiciones.

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
        frecuenciaCompra: number;   // pedidos ÷ compradores activos del período (venta real)
        pUsuariosPuntos: number;    // % de la base registrada con saldo de puntos
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
        const scope = marcaScope(brandIds);

        // 1) Ventanas de cada período (presentación) — el microservicio calcula en la TZ del negocio (ART).
        const windows: Array<{ label: string; isCurrent: boolean; daysElapsed?: number; w: PanelOpsWindow }> = [];

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

            const isCurrent = (start <= baseDate && baseDate <= endOfDay(end)) || (i === 0 && start <= baseDate);
            const daysElapsed = isCurrent ? Math.max(1, differenceInDays(baseDate, start) + 1) : undefined;

            windows.push({ label, isCurrent, daysElapsed, w: { start, end, prevStart, prevEnd } });
        }

        // 2) Métricas de cada período desde deenex-data (fuente única), en paralelo.
        const results: MetricsResult[] = await Promise.all(
            windows.map(async ({ label, isCurrent, daysElapsed, w }) => ({
                periodLabel: label,
                isCurrent,
                daysElapsed,
                metrics: (await fetchPanelOps(scope, w)) as MetricsResult['metrics'],
            }))
        );

        // Orden cronológico (viejo -> nuevo)
        results.reverse();

        return results;
    }
}
