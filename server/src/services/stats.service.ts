import { LinkedInContact, ILinkedInContact, IEnrichmentData } from '../models/linkedin-contact.model';

// ── Types ─────────────────────────────────────────────────────

export type PipelineStatus = 
    | 'visitando' 
    | 'conectando' 
    | 'interactuando' 
    | 'enriqueciendo' 
    | 'esperando_aceptacion' 
    | 'aceptado' 
    | 'mensaje_enviado';

export type EnrichmentStatus = 'pending' | 'enriching' | 'completed' | 'failed';

export interface PipelineStatusCount {
    status: PipelineStatus;
    count: number;
}

export interface ConversionRate {
    from: PipelineStatus;
    to: PipelineStatus;
    rate: number; // percentage 0-100
}

export interface PipelineStats {
    totalContacts: number;
    byStatus: Record<PipelineStatus, number>;
    conversionRates: ConversionRate[];
}

export interface EnrichmentFieldStat {
    field: string;
    completedCount: number;
    completionRate: number; // percentage 0-100
}

export interface EnrichmentStats {
    totalEnriched: number;
    totalPending: number;
    totalFailed: number;
    successRate: number; // percentage 0-100
    averageConfidenceScore: number;
    fieldsByCompletion: EnrichmentFieldStat[];
}

export interface DailyActivity {
    date: string; // ISO date string YYYY-MM-DD
    contactsAdded: number;
    statusChanges: number;
    enrichmentsCompleted: number;
}

export interface ActivityTimeline {
    days: DailyActivity[];
    totals: {
        contactsAdded: number;
        statusChanges: number;
        enrichmentsCompleted: number;
    };
}

// ── Service ───────────────────────────────────────────────────

export class StatsService {

    /**
     * Get pipeline statistics including contacts by status and conversion rates
     */
    async getPipelineStats(): Promise<PipelineStats> {
        // Aggregation to count contacts by status
        const statusAggregation = await LinkedInContact.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Build status counts map with default 0 for all statuses
        const byStatus: Record<PipelineStatus, number> = {
            visitando: 0,
            conectando: 0,
            interactuando: 0,
            enriqueciendo: 0,
            esperando_aceptacion: 0,
            aceptado: 0,
            mensaje_enviado: 0
        };

        let totalContacts = 0;
        for (const item of statusAggregation) {
            const status = item._id as PipelineStatus;
            if (status && status in byStatus) {
                byStatus[status] = item.count;
                totalContacts += item.count;
            }
        }

        // Calculate conversion rates between pipeline stages
        const conversionRates = this.calculateConversionRates(byStatus, totalContacts);

        return {
            totalContacts,
            byStatus,
            conversionRates
        };
    }

    /**
     * Calculate conversion rates between pipeline stages
     */
    private calculateConversionRates(
        byStatus: Record<PipelineStatus, number>, 
        totalContacts: number
    ): ConversionRate[] {
        const rates: ConversionRate[] = [];

        // Define the pipeline flow
        const pipelineFlow: { from: PipelineStatus; to: PipelineStatus }[] = [
            { from: 'visitando', to: 'conectando' },
            { from: 'conectando', to: 'interactuando' },
            { from: 'interactuando', to: 'enriqueciendo' },
            { from: 'enriqueciendo', to: 'esperando_aceptacion' },
            { from: 'esperando_aceptacion', to: 'aceptado' },
            { from: 'aceptado', to: 'mensaje_enviado' }
        ];

        for (const { from, to } of pipelineFlow) {
            const fromCount = byStatus[from];
            const toCount = byStatus[to];
            
            // Conversion rate: percentage of contacts that reached 'to' from 'from'
            // For stages that accumulate (like funnel), we calculate differently
            let rate = 0;
            if (fromCount > 0) {
                // For visitando -> conectando, it's based on total visited
                // For other stages, we consider the flow
                rate = Math.round((toCount / Math.max(fromCount, toCount)) * 100);
            }

            rates.push({ from, to, rate });
        }

        // Overall conversion: visitando -> mensaje_enviado
        if (totalContacts > 0) {
            rates.push({
                from: 'visitando',
                to: 'mensaje_enviado',
                rate: Math.round((byStatus.mensaje_enviado / totalContacts) * 100)
            });
        }

        return rates;
    }

    /**
     * Get enrichment statistics including success rate and field completion
     */
    async getEnrichmentStats(): Promise<EnrichmentStats> {
        // Count by enrichment status
        const statusAggregation = await LinkedInContact.aggregate([
            {
                $match: {
                    enrichmentStatus: { $exists: true, $ne: null }
                }
            },
            {
                $group: {
                    _id: '$enrichmentStatus',
                    count: { $sum: 1 }
                }
            }
        ]);

        let totalEnriched = 0;
        let totalPending = 0;
        let totalFailed = 0;

        for (const item of statusAggregation) {
            const status = item._id as EnrichmentStatus;
            if (status === 'completed') totalEnriched = item.count;
            else if (status === 'pending') totalPending = item.count;
            else if (status === 'enriching') totalPending += item.count;
            else if (status === 'failed') totalFailed = item.count;
        }

        const totalAttempts = totalEnriched + totalFailed;
        const successRate = totalAttempts > 0 
            ? Math.round((totalEnriched / totalAttempts) * 100) 
            : 0;

        // Calculate average confidence score
        const confidenceAggregation = await LinkedInContact.aggregate([
            {
                $match: {
                    'enrichmentData.confidenceScore': { $exists: true, $ne: null }
                }
            },
            {
                $group: {
                    _id: null,
                    averageScore: { $avg: '$enrichmentData.confidenceScore' }
                }
            }
        ]);

        const averageConfidenceScore = confidenceAggregation.length > 0
            ? Math.round(confidenceAggregation[0].averageScore * 10) / 10
            : 0;

        // Calculate field completion stats
        const fieldsByCompletion = await this.calculateFieldCompletionStats();

        return {
            totalEnriched,
            totalPending,
            totalFailed,
            successRate,
            averageConfidenceScore,
            fieldsByCompletion
        };
    }

    /**
     * Calculate completion statistics for enrichment fields
     */
    private async calculateFieldCompletionStats(): Promise<EnrichmentFieldStat[]> {
        // Get all enriched contacts
        const enrichedContacts = await LinkedInContact.find(
            { enrichmentStatus: 'completed' },
            { enrichmentData: 1 }
        ).lean();

        const totalEnriched = enrichedContacts.length;
        if (totalEnriched === 0) return [];

        // Define fields to track with their paths
        const fieldsToTrack = [
            { path: 'personProfile.verifiedPosition', label: 'Cargo verificado' },
            { path: 'personProfile.verifiedCompany', label: 'Empresa verificada' },
            { path: 'personProfile.summary', label: 'Resumen personal' },
            { path: 'company.name', label: 'Nombre empresa' },
            { path: 'company.description', label: 'Descripción empresa' },
            { path: 'company.website', label: 'Website empresa' },
            { path: 'company.category', label: 'Categoría empresa' },
            { path: 'company.sector', label: 'Sector empresa' },
            { path: 'keyInsights', label: 'Insights clave', isArray: true },
            { path: 'buyingSignals', label: 'Señales de compra', isArray: true },
            { path: 'personNews', label: 'Noticias persona', isArray: true },
            { path: 'companyNews', label: 'Noticias empresa', isArray: true }
        ];

        const stats: EnrichmentFieldStat[] = [];

        for (const field of fieldsToTrack) {
            let completedCount = 0;

            for (const contact of enrichedContacts) {
                const data = contact.enrichmentData;
                if (!data) continue;

                const value = this.getNestedValue(data as Record<string, unknown>, field.path);
                
                if (field.isArray) {
                    if (Array.isArray(value) && value.length > 0) {
                        completedCount++;
                    }
                } else {
                    if (value !== undefined && value !== null && value !== '') {
                        completedCount++;
                    }
                }
            }

            stats.push({
                field: field.label,
                completedCount,
                completionRate: Math.round((completedCount / totalEnriched) * 100)
            });
        }

        // Sort by completion rate descending
        return stats.sort((a, b) => b.completionRate - a.completionRate);
    }

    /**
     * Get nested value from object by path
     */
    private getNestedValue(obj: Record<string, unknown> | undefined, path: string): unknown {
        if (!obj) return undefined;
        
        const keys = path.split('.');
        let value: unknown = obj;
        
        for (const key of keys) {
            if (value === null || value === undefined) return undefined;
            value = (value as Record<string, unknown>)[key];
        }
        
        return value;
    }

    /**
     * Get activity timeline for the last 7 days
     */
    async getActivityTimeline(): Promise<ActivityTimeline> {
        const now = new Date();
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        // Generate array of last 7 days
        const days: DailyActivity[] = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);
            
            days.push({
                date: date.toISOString().split('T')[0],
                contactsAdded: 0,
                statusChanges: 0,
                enrichmentsCompleted: 0
            });
        }

        // Count contacts added per day
        const contactsAddedAgg = await LinkedInContact.aggregate([
            {
                $match: {
                    createdAt: { $gte: sevenDaysAgo }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
                    },
                    count: { $sum: 1 }
                }
            }
        ]);

        for (const item of contactsAddedAgg) {
            const day = days.find(d => d.date === item._id);
            if (day) day.contactsAdded = item.count;
        }

        // Count enrichments completed per day
        const enrichmentsAgg = await LinkedInContact.aggregate([
            {
                $match: {
                    enrichedAt: { $gte: sevenDaysAgo }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$enrichedAt' }
                    },
                    count: { $sum: 1 }
                }
            }
        ]);

        for (const item of enrichmentsAgg) {
            const day = days.find(d => d.date === item._id);
            if (day) day.enrichmentsCompleted = item.count;
        }

        // Count status changes per day (based on updatedAt when status changed)
        // We estimate this by counting documents where updatedAt !== createdAt
        // and grouping by updatedAt date
        const statusChangesAgg = await LinkedInContact.aggregate([
            {
                $match: {
                    updatedAt: { $gte: sevenDaysAgo },
                    $expr: { $ne: ['$updatedAt', '$createdAt'] }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' }
                    },
                    count: { $sum: 1 }
                }
            }
        ]);

        for (const item of statusChangesAgg) {
            const day = days.find(d => d.date === item._id);
            if (day) day.statusChanges = item.count;
        }

        // Calculate totals
        const totals = {
            contactsAdded: days.reduce((sum, d) => sum + d.contactsAdded, 0),
            statusChanges: days.reduce((sum, d) => sum + d.statusChanges, 0),
            enrichmentsCompleted: days.reduce((sum, d) => sum + d.enrichmentsCompleted, 0)
        };

        return { days, totals };
    }
}

// Export singleton instance
export const statsService = new StatsService();
