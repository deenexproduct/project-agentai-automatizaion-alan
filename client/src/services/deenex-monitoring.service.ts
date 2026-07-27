/**
 * Deenex Monitoring Service — READ-ONLY (GET only)
 * ⚠️  Absolutely NO write operations. This queries a production database.
 */
import api from '../lib/axios';

export interface DeenexFilters {
    brandId?: string;
    localId?: string;
    dateFrom?: string;
    dateTo?: string;
}

function toParams(filters?: DeenexFilters) {
    if (!filters) return {};
    const params: Record<string, string> = {};
    if (filters.brandId) params.brandId = filters.brandId;
    if (filters.localId) params.localId = filters.localId;
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    return params;
}

// ── Overview KPIs ────────────────────────────────────────────
export const getDeenexOverview = async (filters?: DeenexFilters) => {
    const { data } = await api.get('/deenex-monitoring/overview', { params: toParams(filters) });
    return data;
};

// ── Brands list ──────────────────────────────────────────────
export const getDeenexBrands = async () => {
    const { data } = await api.get('/deenex-monitoring/brands');
    return data;
};

// ── Locations (mapa de locales) ──────────────────────────────
export interface LocationDTO {
    id: string;
    nombre: string;
    direccion: string;
    idMarca: string;
    marca: string;
    statusLocal: boolean;
    /** Pedidos all-time (venta real: paymentStatus PAGADO) */
    pedidos: number;
    /** Facturación all-time (venta BRUTA, regla canónica) */
    facturacion: number;
    /** Pedidos all-time cuyo type empieza con "delivery" */
    pedidosDelivery: number;
    lat: number;
    lng: number;
}

export interface BrandRef {
    idMarca: string;
    marca: string;
}

export interface LocationsResponse {
    locations: LocationDTO[];
    /** TODAS las marcas (para que la leyenda muestre en gris las que tienen 0 locales activos) */
    brands: BrandRef[];
}

export const getDeenexLocations = async (): Promise<LocationsResponse> => {
    const { data } = await api.get('/deenex-monitoring/locations');
    return data;
};

// ── Eficiencia logística (pestaña Eficiencia) ────────────────
/** Corte de métricas: siempre viaja con su `n` para poder juzgar si la muestra alcanza. */
export interface EffCorte {
    n: number;
    distanciaMediana: number;
    envioMediano: number;
    pctEnvioSobreComida: number;
    tiempoMediano: number;
    nConTiempo: number;
    fallas: number;
    gmv: number;
}

export interface EffLocal extends EffCorte {
    id: string;
    nombre: string;
    marca: string;
    vecinosCerca: number;
    pctTerceros: number;
    clientes: number;
}

export interface EfficiencyResponse {
    resumen: EffCorte & {
        localesConEntregas: number;
        localesRankeables: number;
        entregasLejanas: number;
    };
    canales: Array<EffCorte & { canal: 'terceros' | 'propio' }>;
    porDistancia: Array<EffCorte & { rango: string }>;
    porDensidad: Array<{
        grupo: string;
        locales: number;
        pedidosMedianaPorLocal: number;
        distanciaMediana: number;
        pctEnvioSobreComida: number;
    }>;
    ranking: EffLocal[];
    umbrales: { minPedidosLocal: number; vecinoKm: number };
    advertencias: Record<string, string>;
}

export const getDeenexEfficiency = async (): Promise<EfficiencyResponse> => {
    const { data } = await api.get('/deenex-monitoring/efficiency');
    return data;
};

// ── Mapas de calor ───────────────────────────────────────────
export interface HeatPoint {
    lat: number;
    lng: number;
    idMarca: string;
}

export interface HeatmapResponse {
    puntos: HeatPoint[];
    total: number;
    /** Máximo de entregas en una celda de ~1 km (tope del rango de la leyenda) */
    maxCelda: number;
}

/** Puntos de ENTREGA reales (coordinates.dropoff) de los pedidos delivery pagados. */
export const getDeenexDeliveryHeatmap = async (): Promise<HeatmapResponse> => {
    const { data } = await api.get('/deenex-monitoring/heatmap/delivery');
    return data;
};

// ── Client Stats ─────────────────────────────────────────────
export const getDeenexClientStats = async (filters?: DeenexFilters) => {
    const { data } = await api.get('/deenex-monitoring/clients/stats', { params: toParams(filters) });
    return data;
};

// ── Order Stats ──────────────────────────────────────────────
export const getDeenexOrderStats = async (filters?: DeenexFilters) => {
    const { data } = await api.get('/deenex-monitoring/orders/stats', { params: toParams(filters) });
    return data;
};

// ── Points Ecosystem ─────────────────────────────────────────
export const getDeenexPointsStats = async (filters?: DeenexFilters) => {
    const { data } = await api.get('/deenex-monitoring/points/stats', { params: toParams(filters) });
    return data;
};

// ── Top Products ─────────────────────────────────────────────
export const getDeenexTopProducts = async (filters?: DeenexFilters) => {
    const { data } = await api.get('/deenex-monitoring/products/top', { params: toParams(filters) });
    return data;
};

// ── Engagement Stats ─────────────────────────────────────────
export const getDeenexEngagementStats = async (filters?: DeenexFilters) => {
    const { data } = await api.get('/deenex-monitoring/engagement/stats', { params: toParams(filters) });
    return data;
};

// ── Locations Leaderboard ────────────────────────────────────
export const getDeenexLocationsLeaderboard = async (filters?: DeenexFilters) => {
    const { data } = await api.get('/deenex-monitoring/locations/leaderboard', { params: toParams(filters) });
    return data;
};

// ── Product Metrics (New Requested Section) ──────────────────
export const getDeenexProductMetrics = async (params: {
    brandIds?: string[];
    baseDate?: string;
    periodType?: 'weekly' | 'monthly' | 'quarterly' | 'four-monthly';
    periodsCount?: number;
}) => {
    // Convert array to comma-separated string for simpler query parsing if needed
    const queryParams: any = { ...params };
    if (params.brandIds && params.brandIds.length > 0) {
        queryParams.brandIds = params.brandIds.join(',');
    } else {
        delete queryParams.brandIds;
    }
    
    const { data } = await api.get('/deenex-monitoring/product-metrics', { params: queryParams });
    return data;
};
