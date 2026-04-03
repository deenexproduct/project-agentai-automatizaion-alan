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
    brandId?: string;
    baseDate?: string;
    periodType?: 'weekly' | 'monthly' | 'quarterly' | 'four-monthly';
    periodsCount?: number;
}) => {
    const { data } = await api.get('/deenex-monitoring/product-metrics', { params });
    return data;
};
