import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, AlertTriangle, CheckCircle, Clock, DollarSign, Loader2 } from 'lucide-react';
import { getOpsStats, getOpsPipelineConfig } from '../../services/ops.service';

interface OpsStatsData {
    totalDeals: number;
    totalValue: number;
    byStatus: Record<string, number>;
    pendingTasks: number;
    overdueTasks: number;
}

interface StageInfo {
    key: string;
    label: string;
    emoji: string;
    color: string;
}

export default function OpsDashboard() {
    const [stats, setStats] = useState<OpsStatsData | null>(null);
    const [stages, setStages] = useState<StageInfo[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [statsData, configData] = await Promise.all([
                getOpsStats(),
                getOpsPipelineConfig(),
            ]);
            setStats(statsData);
            setStages(configData.stages || []);
        } catch (err) {
            console.error('Error loading ops stats:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 size={32} className="animate-spin" style={{ color: '#3b82f6' }} />
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
                <BarChart3 size={48} style={{ color: '#94a3b8' }} />
                <p className="text-gray-500">No hay datos de operaciones disponibles</p>
            </div>
        );
    }

    const metricCards = [
        {
            label: 'Proyectos Activos',
            value: stats.totalDeals,
            icon: TrendingUp,
            color: '#3b82f6',
            bg: 'rgba(59, 130, 246, 0.1)',
        },
        {
            label: 'Valor Total',
            value: `$${stats.totalValue.toLocaleString()}`,
            icon: DollarSign,
            color: '#22c55e',
            bg: 'rgba(34, 197, 94, 0.1)',
        },
        {
            label: 'Tareas Pendientes',
            value: stats.pendingTasks,
            icon: Clock,
            color: '#f59e0b',
            bg: 'rgba(245, 158, 11, 0.1)',
        },
        {
            label: 'Tareas Vencidas',
            value: stats.overdueTasks,
            icon: AlertTriangle,
            color: '#ef4444',
            bg: 'rgba(239, 68, 68, 0.1)',
        },
    ];

    return (
        <div className="py-4 space-y-6">
            {/* Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {metricCards.map((card) => (
                    <div
                        key={card.label}
                        className="rounded-2xl p-5 transition-all duration-200 hover:scale-[1.02]"
                        style={{
                            background: 'rgba(255, 255, 255, 0.8)',
                            backdropFilter: 'blur(20px)',
                            border: '1px solid rgba(59, 130, 246, 0.1)',
                            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
                        }}
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: card.bg }}>
                                <card.icon size={20} color={card.color} />
                            </div>
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{card.value}</div>
                        <div className="text-sm text-gray-500 mt-1">{card.label}</div>
                    </div>
                ))}
            </div>

            {/* Pipeline Distribution */}
            <div
                className="rounded-2xl p-6"
                style={{
                    background: 'rgba(255, 255, 255, 0.8)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(59, 130, 246, 0.1)',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
                }}
            >
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Distribución del Pipeline</h3>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {stages.map((stage) => {
                        const count = stats.byStatus[stage.key] || 0;
                        return (
                            <div key={stage.key} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: `${stage.color}10` }}>
                                <span className="text-2xl">{stage.emoji}</span>
                                <div>
                                    <div className="text-xl font-bold" style={{ color: stage.color }}>{count}</div>
                                    <div className="text-xs text-gray-600">{stage.label}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Simple bar visualization */}
                {stats.totalDeals > 0 && (
                    <div className="mt-6">
                        <div className="h-4 rounded-full overflow-hidden flex" style={{ background: '#f1f5f9' }}>
                            {stages.map((stage) => {
                                const count = stats.byStatus[stage.key] || 0;
                                const pct = (count / stats.totalDeals) * 100;
                                if (pct === 0) return null;
                                return (
                                    <div
                                        key={stage.key}
                                        className="h-full transition-all duration-500"
                                        style={{ width: `${pct}%`, background: stage.color }}
                                        title={`${stage.emoji} ${stage.label}: ${count}`}
                                    />
                                );
                            })}
                        </div>
                        <div className="flex justify-between mt-2">
                            {stages.map((stage) => (
                                <div key={stage.key} className="flex items-center gap-1 text-xs text-gray-500">
                                    <div className="w-2 h-2 rounded-full" style={{ background: stage.color }} />
                                    <span>{stage.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
