import { useState, useEffect, useMemo } from 'react';
import {
    BarChart3, TrendingUp, AlertTriangle, CheckCircle, Clock, DollarSign,
    Loader2, Target, Zap, MapPin, Trophy, CheckSquare, AlertCircle, Layers,
    ArrowUp, ArrowDown, Minus, Activity, Building2, CalendarClock,
    Flame, Star, ChevronRight
} from 'lucide-react';
import { getOpsStats, getOpsPipelineConfig } from '../../services/ops.service';

// ── Types ─────────────────────────────────────────────────────

interface StageInfo { key: string; label: string; emoji: string; color: string; order: number; isFinal?: boolean; estimatedDuration?: number; }

interface OpsStats {
    pipeline: { totalDeals: number; activeDeals: number; completedDeals: number; byStatus: Record<string, number>; avgDaysPerStage: Record<string, number>; avgDaysSinceStart: number; };
    revenue: { totalValue: number; valueByCurrency: Record<string, number>; avgValuePerProject: number; revenueProjection: number; revenuePerLocale: number; };
    tasks: { pending: number; overdue: number; completedThisWeek: number; completionRate: number; byType: Record<string, number>; byPriority: Record<string, number>; };
    goals: { active: number; completed: number; overdue: number; avgProgress: number; byCategory: Record<string, number>; };
    locales: { inProgress: number; completed: number; };
    weeklyScore: number | null;
    weekComparison: {
        tasksCompletedDelta?: number; completionRateDelta?: number; scoreDelta?: number; goalsCompletedDelta?: number; previousWeekScore?: number;
        currentScore?: number; weekLabel?: string; dailyProductivity?: { day: string; dayLabel: string; tasksCompleted: number; tasksCreated: number }[];
        mostProductiveDay?: string; mostProductiveDayCount?: number; dealsMovedForward?: number;
    } | null;
    upcomingDeadlines: { _id: string; title: string; type: string; priority: string; dueDate: string; company: string | null }[];
    recentCompleted: { _id: string; title: string; type: string; completedAt: string; company: string | null }[];
    topCompanies: { name: string; logo?: string; sector?: string; deals: number; value: number; locales: number; stage: string }[];
}

// ══════════════════════════════════════════════════════════════
// DESIGN TOKENS (matching DeenexMonitoring)
// ══════════════════════════════════════════════════════════════
const PALETTE = {
    indigo: '#6366f1',
    violet: '#8b5cf6',
    sky: '#0ea5e9',
    emerald: '#22c55e',
    amber: '#f59e0b',
    rose: '#ec4899',
    red: '#ef4444',
    teal: '#14b8a6',
    slate: '#94a3b8',
    orange: '#f97316',
};

const rgba = (hex: string, a: number) => {
    const h = hex.replace('#', '');
    return `rgba(${parseInt(h.substring(0, 2), 16)},${parseInt(h.substring(2, 4), 16)},${parseInt(h.substring(4, 6), 16)},${a})`;
};

const TASK_TYPE_INFO: Record<string, { label: string; emoji: string; color: string }> = {
    call: { label: 'Llamadas', emoji: '📞', color: PALETTE.sky },
    whatsapp: { label: 'WhatsApp', emoji: '💬', color: PALETTE.emerald },
    email: { label: 'Emails', emoji: '✉️', color: PALETTE.amber },
    meeting: { label: 'Reuniones', emoji: '🤝', color: PALETTE.violet },
    follow_up: { label: 'Seguimientos', emoji: '🔄', color: PALETTE.teal },
    proposal: { label: 'Propuestas', emoji: '📋', color: PALETTE.rose },
    research: { label: 'Investigación', emoji: '🔍', color: '#14b8a6' },
    linkedin_message: { label: 'LinkedIn', emoji: '🔗', color: '#0a66c2' },
    other: { label: 'Otras', emoji: '📌', color: PALETTE.slate },
};

const PRIORITY_INFO: Record<string, { label: string; color: string; icon: string }> = {
    urgent: { label: 'Urgente', color: PALETTE.red, icon: '🔴' },
    high: { label: 'Alta', color: PALETTE.amber, icon: '🟠' },
    medium: { label: 'Media', color: PALETTE.sky, icon: '🔵' },
    low: { label: 'Baja', color: PALETTE.slate, icon: '⚪' },
};

const GOAL_CATEGORY_INFO: Record<string, { label: string; emoji: string; color: string }> = {
    revenue: { label: 'Revenue', emoji: '💰', color: PALETTE.amber },
    growth: { label: 'Crecimiento', emoji: '📈', color: PALETTE.emerald },
    efficiency: { label: 'Eficiencia', emoji: '⚡', color: PALETTE.indigo },
    satisfaction: { label: 'Satisfacción', emoji: '⭐', color: PALETTE.rose },
    custom: { label: 'Custom', emoji: '🎯', color: PALETTE.slate },
    deployment: { label: 'Despliegue', emoji: '🚀', color: PALETTE.teal },
    operational: { label: 'Operacional', emoji: '⚙️', color: PALETTE.violet },
    despliegue: { label: 'Despliegue', emoji: '🚀', color: PALETTE.sky },
    tecnico: { label: 'Técnico', emoji: '⚙️', color: PALETTE.violet },
    capacitacion: { label: 'Capacitación', emoji: '📚', color: PALETTE.amber },
    operativo: { label: 'Operativo', emoji: '🎯', color: PALETTE.sky },
};

const COLORS = [PALETTE.indigo, PALETTE.sky, PALETTE.emerald, PALETTE.amber, PALETTE.rose, PALETTE.teal, PALETTE.violet, PALETTE.red];

// ══════════════════════════════════════════════════════════════
// DESIGN COMPONENTS (matching DeenexMonitoring)
// ══════════════════════════════════════════════════════════════

const Card = ({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => (
    <div className={`rounded-3xl p-7 ${className}`}
        onClick={onClick}
        style={{
            background: 'rgba(255,255,255,0.72)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.7)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 24px rgba(99,102,241,0.04)',
        }}>
        {children}
    </div>
);

const SectionDivider = ({ title, icon: Icon, color }: { title: string; icon: React.ElementType; color: string }) => (
    <div className="flex items-center gap-3 pt-4 pb-2">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: rgba(color, 0.1) }}>
            <Icon size={20} color={color} />
        </div>
        <h3 className="text-lg font-extrabold text-gray-800 tracking-tight">{title}</h3>
    </div>
);

const HeroKPI = ({ icon: Icon, label, value, color, subtitle }: {
    icon: React.ElementType; label: string; value: string | number;
    color: string; subtitle?: string;
}) => (
    <Card className="flex flex-col items-center justify-center text-center py-8 hover:scale-[1.02] transition-transform duration-300">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: rgba(color, 0.1) }}>
            <Icon size={24} color={color} />
        </div>
        <div className="text-3xl lg:text-4xl font-black text-gray-900 tracking-tight leading-none">{String(value)}</div>
        <div className="text-sm text-gray-500 font-semibold mt-2">{label}</div>
        {subtitle && <div className="text-xs font-medium mt-1" style={{ color }}>{subtitle}</div>}
    </Card>
);

const StatBlock = ({ label, value, icon: Icon, color, sub }: {
    label: string; value: string | number; icon?: React.ElementType; color: string; sub?: string;
}) => (
    <div className="p-5 rounded-2xl text-center" style={{ background: rgba(color, 0.04) }}>
        {Icon && <Icon size={18} color={color} className="mx-auto mb-2" />}
        <div className="text-2xl font-black text-gray-900">{String(value)}</div>
        <div className="text-xs text-gray-500 font-semibold mt-1">{label}</div>
        {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
);

const HorizBarChart = ({ items, formatValue, title }: {
    items: { label: string; value: number; color: string }[];
    formatValue?: (v: number) => string;
    title?: string;
}) => {
    const safe = (items || []).map(i => ({
        label: String(i?.label ?? 'N/A'),
        value: typeof i?.value === 'number' && !isNaN(i.value) ? i.value : 0,
        color: String(i?.color ?? PALETTE.slate),
    }));
    const max = Math.max(...safe.map(i => i.value), 1);
    if (safe.length === 0) return <div className="text-sm text-gray-400 italic py-4">Sin datos</div>;
    return (
        <div>
            {title && <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">{title}</div>}
            <div className="space-y-4">
                {safe.map((item, i) => (
                    <div key={i}>
                        <div className="flex justify-between items-baseline mb-1.5">
                            <span className="text-sm font-semibold text-gray-700">{item.label}</span>
                            <span className="text-sm font-bold text-gray-900">
                                {formatValue ? formatValue(item.value) : item.value.toLocaleString()}
                            </span>
                        </div>
                        <div className="h-3 rounded-full overflow-hidden" style={{ background: rgba(item.color, 0.08) }}>
                            <div className="h-full rounded-full transition-all duration-1000 ease-out"
                                style={{ width: `${Math.max((item.value / max) * 100, 4)}%`, background: `linear-gradient(90deg, ${item.color}, ${rgba(item.color, 0.7)})` }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ── Main Component ────────────────────────────────────────────

export default function OpsDashboard() {
    const [stats, setStats] = useState<OpsStats | null>(null);
    const [stages, setStages] = useState<StageInfo[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [s, c] = await Promise.all([getOpsStats(), getOpsPipelineConfig()]);
            setStats(s);
            setStages(c.stages || []);
        } catch (err) {
            console.error('Error loading ops stats:', err);
        } finally {
            setLoading(false);
        }
    };

    const sortedStages = useMemo(() =>
        [...stages].filter(s => s.order).sort((a, b) => a.order - b.order), [stages]);

    // ── Loading ───────────────────────────────────────────────
    if (loading) return (
        <div className="flex flex-col items-center justify-center h-[60vh] gap-5">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 12px 40px rgba(99,102,241,0.35)' }}>
                <Loader2 size={28} color="#fff" className="animate-spin" />
            </div>
            <div className="text-gray-400 text-sm font-semibold tracking-wide">Cargando métricas…</div>
        </div>
    );

    if (!stats) return (
        <div className="flex flex-col items-center justify-center h-[60vh] gap-5">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: rgba(PALETTE.red, 0.1) }}>
                <AlertTriangle size={28} color={PALETTE.red} />
            </div>
            <div className="text-gray-500 text-sm text-center">No hay datos operativos disponibles</div>
        </div>
    );

    const scoreColor = stats.weeklyScore !== null
        ? stats.weeklyScore >= 70 ? PALETTE.emerald : stats.weeklyScore >= 40 ? PALETTE.amber : PALETTE.red
        : PALETTE.slate;

    const scoreLabel = stats.weeklyScore !== null
        ? stats.weeklyScore >= 80 ? '🔥 Excelente' : stats.weeklyScore >= 60 ? '✅ Bueno' : stats.weeklyScore >= 40 ? '⚡ Moderado' : '⚠️ Bajo'
        : 'Sin datos';

    // Prepare task type bar items
    const taskTypeItems = Object.entries(stats.tasks.byType).sort(([, a], [, b]) => b - a).map(([type, count], i) => {
        const info = TASK_TYPE_INFO[type] || { label: type, emoji: '📌', color: PALETTE.slate };
        return { label: `${info.emoji} ${info.label}`, value: count, color: info.color };
    });

    // Prepare goal category bar items
    const goalCatItems = Object.entries(stats.goals.byCategory).map(([cat, count], i) => {
        const info = GOAL_CATEGORY_INFO[cat] || { label: cat, emoji: '🎯', color: PALETTE.slate };
        return { label: `${info.emoji} ${info.label}`, value: count, color: info.color };
    });

    return (
        <div className="py-6 space-y-8 max-w-[1200px] mx-auto" style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>

            {/* ════════════════════════════════════════════════════
                 HEADER
                ════════════════════════════════════════════════════ */}
            <div className="mb-2">
                <h2 className="text-2xl font-black tracking-tight"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    Estadísticas Operativas
                </h2>
                <p className="text-sm text-gray-400 mt-1 font-medium">Resumen de rendimiento · Pipeline · Metas · Tareas</p>
            </div>

            {/* ════════════════════════════════════════════════════
                 KPIs HERO — big cards
                ════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
                <HeroKPI icon={Zap} label="Proyectos Activos" value={stats.pipeline.activeDeals} color={PALETTE.indigo} />
                <HeroKPI icon={Trophy} label="Completados" value={stats.pipeline.completedDeals} color={PALETTE.emerald} />
                <HeroKPI icon={DollarSign} label="Valor Total" value={fmtMoney(stats.revenue.totalValue)} color={PALETTE.amber}
                    subtitle={`~${fmtMoney(stats.revenue.avgValuePerProject)} prom.`} />
                <HeroKPI icon={MapPin} label="Locales en Impl." value={stats.locales.inProgress.toLocaleString()} color={PALETTE.sky}
                    subtitle={stats.locales.completed > 0 ? `${stats.locales.completed} desplegados` : undefined} />
                <HeroKPI icon={Target} label="Score Semanal" value={stats.weeklyScore ?? '—'} color={scoreColor}
                    subtitle={scoreLabel} />
                <HeroKPI icon={CheckSquare} label="Tasa de Completado" value={`${stats.tasks.completionRate}%`}
                    color={stats.tasks.completionRate >= 60 ? PALETTE.emerald : PALETTE.amber}
                    subtitle={`${stats.tasks.completedThisWeek} completadas esta semana`} />
            </div>

            {/* ════════════════════════════════════════════════════
                 PERFORMANCE SCORE — detail card
                ════════════════════════════════════════════════════ */}
            <Card className="flex items-center justify-between">
                <div>
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Performance Score</div>
                    <div className="text-sm text-gray-500">
                        Tareas: {stats.tasks.completionRate}% · Metas: {stats.goals.avgProgress}%
                        {stats.weekComparison?.scoreDelta !== undefined && (
                            <span className={`ml-3 inline-flex items-center gap-1 text-xs font-bold ${stats.weekComparison.scoreDelta > 0 ? 'text-emerald-600' : stats.weekComparison.scoreDelta < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                {stats.weekComparison.scoreDelta > 0 ? <ArrowUp size={12} /> : stats.weekComparison.scoreDelta < 0 ? <ArrowDown size={12} /> : <Minus size={12} />}
                                {stats.weekComparison.scoreDelta > 0 ? '+' : ''}{stats.weekComparison.scoreDelta} vs semana pasada
                            </span>
                        )}
                    </div>
                </div>
                <div className="text-5xl font-black" style={{ color: scoreColor }}>{stats.weeklyScore ?? '—'}</div>
            </Card>

            {/* ════════════════════════════════════════════════════
                 ALERTAS RÁPIDAS
                ════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                <StatBlock label="Pendientes" value={stats.tasks.pending} icon={Clock}
                    color={stats.tasks.pending > 5 ? PALETTE.amber : PALETTE.slate} />
                <StatBlock label="Vencidas" value={stats.tasks.overdue} icon={AlertTriangle}
                    color={stats.tasks.overdue > 0 ? PALETTE.red : PALETTE.emerald} />
                <StatBlock label="Metas Vencidas" value={stats.goals.overdue} icon={AlertCircle}
                    color={stats.goals.overdue > 0 ? PALETTE.red : PALETTE.emerald} />
                <StatBlock label="Completadas (sem.)" value={stats.tasks.completedThisWeek} icon={CheckCircle}
                    color={PALETTE.indigo} />
            </div>

            {/* ════════════════════════════════════════════════════
                 PIPELINE OPERATIVO
                ════════════════════════════════════════════════════ */}
            <SectionDivider title="Pipeline Operativo" icon={Layers} color={PALETTE.indigo} />

            <Card>
                <div className="flex items-center justify-between mb-5">
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Etapas del Pipeline</div>
                    <div className="flex items-center gap-4">
                        {stats.pipeline.avgDaysSinceStart > 0 && (
                            <span className="text-xs font-semibold text-gray-400">⏱ ~{stats.pipeline.avgDaysSinceStart}d avg</span>
                        )}
                        <span className="text-xs font-semibold text-gray-400">{stats.pipeline.totalDeals} proyectos totales</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {sortedStages.map((stage, i) => {
                        const count = stats.pipeline.byStatus[stage.key] || 0;
                        const avgDays = stats.pipeline.avgDaysPerStage[stage.key];
                        const pct = stats.pipeline.totalDeals > 0 ? Math.round((count / stats.pipeline.totalDeals) * 100) : 0;
                        const isLast = i === sortedStages.length - 1;
                        return (
                            <div key={stage.key} className="relative group">
                                <div className="p-5 rounded-2xl transition-all duration-300 hover:scale-[1.02]"
                                    style={{
                                        background: count > 0 ? rgba(stage.color, 0.04) : rgba(PALETTE.slate, 0.03),
                                        border: `1px solid ${count > 0 ? rgba(stage.color, 0.12) : rgba(PALETTE.slate, 0.06)}`,
                                    }}>
                                    <div className="flex items-center gap-3 mb-3">
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base shrink-0"
                                            style={{ background: rgba(stage.color, 0.1) }}>{stage.emoji}</div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-extrabold text-gray-800 truncate">{stage.label}</div>
                                            {avgDays !== undefined && avgDays > 0 && (
                                                <div className="flex items-center gap-1 mt-0.5">
                                                    <Clock size={10} color={stage.color} />
                                                    <span className="text-xs text-gray-400 font-medium">~{avgDays}d prom.</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-end justify-between">
                                        <div>
                                            <span className="text-3xl font-black tracking-tight" style={{ color: count > 0 ? stage.color : '#cbd5e1' }}>{count}</span>
                                            <span className="text-xs font-semibold text-gray-400 ml-1.5">{count === 1 ? 'proyecto' : 'proyectos'}</span>
                                        </div>
                                        {pct > 0 && (
                                            <div className="text-xs font-black px-2.5 py-1 rounded-full"
                                                style={{ background: rgba(stage.color, 0.08), color: stage.color }}>{pct}%</div>
                                        )}
                                    </div>
                                    <div className="mt-3 h-2.5 rounded-full overflow-hidden" style={{ background: rgba(stage.color, 0.06) }}>
                                        <div className="h-full rounded-full transition-all duration-1000 ease-out"
                                            style={{ width: `${Math.max(pct, count > 0 ? 5 : 0)}%`, background: `linear-gradient(90deg, ${stage.color}, ${rgba(stage.color, 0.7)})` }} />
                                    </div>
                                </div>
                                {!isLast && (
                                    <div className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10 text-gray-300">
                                        <ChevronRight size={16} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Pipeline summary bar */}
                {stats.pipeline.totalDeals > 0 && (
                    <div className="mt-6 flex items-center gap-4">
                        <div className="h-3 flex-1 rounded-full overflow-hidden flex" style={{ background: rgba(PALETTE.slate, 0.06) }}>
                            {sortedStages.map(stage => {
                                const count = stats.pipeline.byStatus[stage.key] || 0;
                                const pct = (count / stats.pipeline.totalDeals) * 100;
                                if (pct === 0) return null;
                                return <div key={stage.key} className="h-full" style={{ width: `${pct}%`, background: stage.color }} title={`${stage.emoji} ${stage.label}: ${count}`} />;
                            })}
                        </div>
                        <div className="flex gap-3 shrink-0 flex-wrap">
                            {sortedStages.map(stage => (
                                <div key={stage.key} className="flex items-center gap-1.5 text-xs font-semibold text-gray-400">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: stage.color }} />{stage.label}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </Card>

            {/* ════════════════════════════════════════════════════
                 REVENUE INTELLIGENCE + WEEKLY COMPARISON
                ════════════════════════════════════════════════════ */}
            <SectionDivider title="Inteligencia de Revenue" icon={DollarSign} color={PALETTE.amber} />

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                <StatBlock label="Valor Total" value={fmtMoney(stats.revenue.totalValue)} icon={DollarSign} color={PALETTE.amber} />
                <StatBlock label="Prom. Proyecto" value={fmtMoney(stats.revenue.avgValuePerProject)} icon={BarChart3} color={PALETTE.indigo} />
                <StatBlock label="Rev. x Local" value={stats.revenue.revenuePerLocale > 0 ? fmtMoney(stats.revenue.revenuePerLocale) : '—'} icon={MapPin} color={PALETTE.sky} />
                {stats.revenue.revenueProjection > 0 && (
                    <StatBlock label="Proyección" value={fmtMoney(stats.revenue.revenueProjection)} icon={TrendingUp} color={PALETTE.emerald}
                        sub="Costo/local × locales activos" />
                )}
            </div>

            {Object.keys(stats.revenue.valueByCurrency).length > 1 && (
                <Card>
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Desglose por Moneda</div>
                    <HorizBarChart
                        items={Object.entries(stats.revenue.valueByCurrency).map(([cur, v], i) => ({
                            label: cur, value: v, color: COLORS[i % COLORS.length],
                        }))}
                        formatValue={v => fmtMoney(v)}
                    />
                </Card>
            )}

            {/* ════════════════════════════════════════════════════
                 COMPARACIÓN SEMANAL
                ════════════════════════════════════════════════════ */}
            <SectionDivider title="Comparación Semanal" icon={Activity} color={PALETTE.violet} />

            {stats.weekComparison ? (
                <>
                    {stats.weekComparison.weekLabel && (
                        <div className="text-sm text-gray-400 font-medium -mt-4 mb-2">{stats.weekComparison.weekLabel}</div>
                    )}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        <Card className="text-center !py-8 hover:scale-[1.02] transition-transform">
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Score</div>
                            {stats.weekComparison.currentScore !== undefined && (
                                <div className="text-4xl font-black text-gray-900 mb-1">{stats.weekComparison.currentScore}</div>
                            )}
                            <DeltaInline delta={stats.weekComparison.scoreDelta} />
                        </Card>
                        <Card className="text-center !py-8 hover:scale-[1.02] transition-transform">
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Tareas Completadas</div>
                            <DeltaInline delta={stats.weekComparison.tasksCompletedDelta} size="lg" />
                        </Card>
                        <Card className="text-center !py-8 hover:scale-[1.02] transition-transform">
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Metas Completadas</div>
                            <DeltaInline delta={stats.weekComparison.goalsCompletedDelta} size="lg" />
                        </Card>
                    </div>

                    {/* Daily Productivity */}
                    {stats.weekComparison.dailyProductivity && stats.weekComparison.dailyProductivity.length > 0 && (
                        <Card>
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-5">Productividad Diaria</div>
                            <div className="flex items-end gap-2 h-24">
                                {stats.weekComparison.dailyProductivity.map((d, i) => {
                                    const max = Math.max(...stats.weekComparison!.dailyProductivity!.map(dp => dp.tasksCompleted), 1);
                                    const h = Math.max((d.tasksCompleted / max) * 100, 4);
                                    const isBest = d.dayLabel === stats.weekComparison!.mostProductiveDay;
                                    return (
                                        <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                                            <div className="text-xs font-bold text-gray-500">{d.tasksCompleted}</div>
                                            <div className="w-full rounded-lg transition-all duration-700"
                                                style={{
                                                    height: `${h}%`,
                                                    background: isBest ? `linear-gradient(180deg, ${PALETTE.indigo}, ${PALETTE.violet})` : d.tasksCompleted > 0 ? rgba(PALETTE.indigo, 0.15) : rgba(PALETTE.slate, 0.06),
                                                    minHeight: 4,
                                                    borderRadius: '6px 6px 4px 4px',
                                                }}
                                                title={`${d.dayLabel}: ${d.tasksCompleted} completadas`} />
                                            <span className="text-xs font-bold text-gray-400 uppercase">{d.day.slice(0, 2)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            {stats.weekComparison.mostProductiveDay && (
                                <div className="text-xs text-gray-400 mt-4 font-medium">
                                    🏆 Mejor día: <span className="font-bold" style={{ color: PALETTE.violet }}>{stats.weekComparison.mostProductiveDay}</span>
                                    {stats.weekComparison.mostProductiveDayCount ? ` (${stats.weekComparison.mostProductiveDayCount} tareas)` : ''}
                                </div>
                            )}
                            {stats.weekComparison.dealsMovedForward !== undefined && stats.weekComparison.dealsMovedForward > 0 && (
                                <div className="text-sm font-bold flex items-center gap-2 mt-3" style={{ color: PALETTE.emerald }}>
                                    <TrendingUp size={14} /> {stats.weekComparison.dealsMovedForward} deal(s) avanzaron de etapa esta semana
                                </div>
                            )}
                        </Card>
                    )}
                </>
            ) : (
                <Card className="text-center !py-10">
                    <BarChart3 size={32} className="text-gray-200 mx-auto mb-3" />
                    <div className="text-sm text-gray-400 font-medium">Generar un informe semanal para ver la comparación</div>
                </Card>
            )}

            {/* ════════════════════════════════════════════════════
                 TAREAS OPERATIVAS
                ════════════════════════════════════════════════════ */}
            <SectionDivider title="Tareas Operativas" icon={CheckSquare} color={PALETTE.sky} />

            {/* Completion bar */}
            <Card>
                <div className="flex items-center justify-between mb-4">
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Tasa de Completado</div>
                    <div className="text-2xl font-black" style={{
                        color: stats.tasks.completionRate >= 80 ? PALETTE.emerald : stats.tasks.completionRate >= 50 ? PALETTE.amber : PALETTE.red
                    }}>{stats.tasks.completionRate}%</div>
                </div>
                <div className="h-3 rounded-full overflow-hidden" style={{ background: rgba(PALETTE.indigo, 0.06) }}>
                    <div className="h-full rounded-full transition-all duration-1000 ease-out"
                        style={{
                            width: `${stats.tasks.completionRate}%`,
                            background: stats.tasks.completionRate >= 80 ? `linear-gradient(90deg, ${PALETTE.emerald}, ${rgba(PALETTE.emerald, 0.7)})`
                                : stats.tasks.completionRate >= 50 ? `linear-gradient(90deg, ${PALETTE.amber}, ${rgba(PALETTE.amber, 0.7)})`
                                    : `linear-gradient(90deg, ${PALETTE.red}, ${rgba(PALETTE.red, 0.7)})`,
                        }} />
                </div>
            </Card>

            {/* Tasks breakdowns side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* By priority */}
                {Object.keys(stats.tasks.byPriority).length > 0 && (
                    <Card>
                        <HorizBarChart
                            title="Tareas por Prioridad"
                            items={['urgent', 'high', 'medium', 'low'].map(p => {
                                const count = stats.tasks.byPriority[p] || 0;
                                if (count === 0) return null;
                                const info = PRIORITY_INFO[p];
                                return { label: `${info.icon} ${info.label}`, value: count, color: info.color };
                            }).filter(Boolean) as any}
                        />
                    </Card>
                )}

                {/* By type */}
                {taskTypeItems.length > 0 && (
                    <Card>
                        <HorizBarChart title="Completadas por Tipo" items={taskTypeItems} />
                    </Card>
                )}
            </div>

            {/* ════════════════════════════════════════════════════
                 ESTADO DE METAS
                ════════════════════════════════════════════════════ */}
            <SectionDivider title="Estado de Metas" icon={Target} color={PALETTE.violet} />

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                <Card className="text-center !py-8 hover:scale-[1.02] transition-transform">
                    <Target size={24} color={PALETTE.indigo} className="mx-auto mb-3" />
                    <div className="text-3xl font-black text-gray-900">{stats.goals.active}</div>
                    <div className="text-sm font-semibold text-gray-500 mt-2">Activas</div>
                </Card>
                <Card className="text-center !py-8 hover:scale-[1.02] transition-transform">
                    <CheckCircle size={24} color={PALETTE.emerald} className="mx-auto mb-3" />
                    <div className="text-3xl font-black text-gray-900">{stats.goals.completed}</div>
                    <div className="text-sm font-semibold text-gray-500 mt-2">Completadas</div>
                </Card>
                <Card className="text-center !py-8 hover:scale-[1.02] transition-transform">
                    <AlertCircle size={24} color={stats.goals.overdue > 0 ? PALETTE.red : PALETTE.emerald} className="mx-auto mb-3" />
                    <div className="text-3xl font-black text-gray-900">{stats.goals.overdue}</div>
                    <div className="text-sm font-semibold text-gray-500 mt-2">Vencidas</div>
                </Card>
                <Card className="text-center !py-8 hover:scale-[1.02] transition-transform"
                    style={{ background: `linear-gradient(135deg, ${rgba(PALETTE.indigo, 0.04)}, ${rgba(PALETTE.violet, 0.04)})` }}>
                    <div className="text-4xl font-black" style={{ color: PALETTE.indigo }}>{stats.goals.avgProgress}%</div>
                    <div className="text-sm font-semibold text-gray-500 mt-2">Progreso Promedio</div>
                </Card>
            </div>

            {/* Progress bar for goals */}
            <Card>
                <div className="flex items-center justify-between mb-4">
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">Progreso General de Metas</div>
                    <div className="text-2xl font-black" style={{
                        color: stats.goals.avgProgress >= 60 ? PALETTE.emerald : stats.goals.avgProgress >= 30 ? PALETTE.amber : PALETTE.red
                    }}>{stats.goals.avgProgress}%</div>
                </div>
                <div className="h-3 rounded-full overflow-hidden" style={{ background: rgba(PALETTE.violet, 0.06) }}>
                    <div className="h-full rounded-full transition-all duration-1000 ease-out"
                        style={{
                            width: `${stats.goals.avgProgress}%`,
                            background: stats.goals.avgProgress >= 60 ? `linear-gradient(90deg, ${PALETTE.emerald}, ${rgba(PALETTE.emerald, 0.7)})`
                                : stats.goals.avgProgress >= 30 ? `linear-gradient(90deg, ${PALETTE.amber}, ${rgba(PALETTE.amber, 0.7)})`
                                    : `linear-gradient(90deg, ${PALETTE.red}, ${rgba(PALETTE.red, 0.7)})`,
                        }} />
                </div>
            </Card>

            {/* Goals by category */}
            {goalCatItems.length > 0 && (
                <Card>
                    <HorizBarChart title="Metas por Categoría" items={goalCatItems} />
                </Card>
            )}

            {/* ════════════════════════════════════════════════════
                 PRÓXIMOS VENCIMIENTOS + TOP EMPRESAS + ACTIVIDAD RECIENTE
                ════════════════════════════════════════════════════ */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                {/* Upcoming Deadlines */}
                <div>
                    <SectionDivider title="Próximos Vencimientos" icon={CalendarClock} color={PALETTE.red} />
                    <Card>
                        <div className="space-y-2">
                            {stats.upcomingDeadlines.length > 0 ? stats.upcomingDeadlines.map(t => {
                                const info = TASK_TYPE_INFO[t.type] || { emoji: '📌', color: PALETTE.slate };
                                const prio = PRIORITY_INFO[t.priority] || { icon: '⚪', color: PALETTE.slate };
                                const daysLeft = Math.ceil((new Date(t.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                                return (
                                    <div key={t._id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50/60 transition-colors cursor-default group">
                                        <span className="text-base">{info.emoji}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold text-gray-700 truncate group-hover:text-gray-900">{t.title}</div>
                                            {t.company && <div className="text-xs text-gray-400 font-medium">{t.company}</div>}
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-xs">{prio.icon}</span>
                                            <span className={`text-xs font-black ${daysLeft <= 1 ? 'text-red-500' : daysLeft <= 3 ? 'text-amber-500' : 'text-gray-400'}`}>
                                                {daysLeft === 0 ? 'Hoy' : daysLeft === 1 ? 'Mañana' : `${daysLeft}d`}
                                            </span>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div className="text-center py-6">
                                    <CheckCircle size={28} className="text-emerald-300 mx-auto" />
                                    <div className="text-sm text-gray-400 mt-2 font-medium">Sin vencimientos próximos 🎉</div>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>

                {/* Top Companies */}
                <div>
                    <SectionDivider title="Top Empresas" icon={Building2} color={PALETTE.sky} />
                    <Card>
                        <div className="space-y-2">
                            {stats.topCompanies.length > 0 ? stats.topCompanies.map((c, i) => (
                                <div key={i} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50/60 transition-colors cursor-default">
                                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-black text-white shrink-0"
                                        style={{ background: COLORS[i % COLORS.length] }}>{i + 1}</div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-gray-700 truncate">{c.name}</div>
                                        <div className="text-xs text-gray-400 font-medium">{c.locales} locales · {fmtMoney(c.value)}</div>
                                    </div>
                                    <div className="text-xs font-bold px-2.5 py-1 rounded-full shrink-0"
                                        style={{ background: rgba(PALETTE.slate, 0.08), color: '#64748b' }}>
                                        {c.deals} {c.deals === 1 ? 'deal' : 'deals'}
                                    </div>
                                </div>
                            )) : (
                                <div className="text-center py-6">
                                    <Building2 size={28} className="text-gray-200 mx-auto" />
                                    <div className="text-sm text-gray-400 mt-2 font-medium">Sin empresas en operaciones</div>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>

                {/* Recently Completed */}
                <div>
                    <SectionDivider title="Actividad Reciente" icon={CheckCircle} color={PALETTE.emerald} />
                    <Card>
                        <div className="space-y-2">
                            {stats.recentCompleted.length > 0 ? stats.recentCompleted.map(t => {
                                const info = TASK_TYPE_INFO[t.type] || { emoji: '📌', color: PALETTE.slate };
                                const when = fmtTimeAgo(t.completedAt);
                                return (
                                    <div key={t._id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50/60 transition-colors cursor-default">
                                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: rgba(PALETTE.emerald, 0.1) }}>
                                            <CheckCircle size={14} color={PALETTE.emerald} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-bold text-gray-700 truncate">{t.title}</div>
                                            {t.company && <div className="text-xs text-gray-400 font-medium">{t.company}</div>}
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-base">{info.emoji}</span>
                                            <span className="text-xs text-gray-400 font-semibold">{when}</span>
                                        </div>
                                    </div>
                                );
                            }) : (
                                <div className="text-center py-6">
                                    <Activity size={28} className="text-gray-200 mx-auto" />
                                    <div className="text-sm text-gray-400 mt-2 font-medium">Sin actividad reciente</div>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            </div>

            {/* Footer */}
            <div className="text-center py-6">
                <div className="inline-flex items-center gap-2 text-xs text-gray-400 font-medium">
                    <Activity size={12} />
                    Datos operativos en tiempo real
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// SMALL SUBCOMPONENTS
// ══════════════════════════════════════════════════════════════

function DeltaInline({ delta, size = 'md' }: { delta?: number; size?: 'md' | 'lg' }) {
    const d = delta ?? 0;
    const isPositive = d > 0;
    const isNeutral = d === 0;
    const textClass = size === 'lg' ? 'text-3xl' : 'text-lg';
    return (
        <div className={`flex items-center justify-center gap-1.5 ${textClass} font-black ${isNeutral ? 'text-gray-400' : isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
            {isNeutral ? <Minus size={size === 'lg' ? 20 : 14} /> : isPositive ? <ArrowUp size={size === 'lg' ? 20 : 14} /> : <ArrowDown size={size === 'lg' ? 20 : 14} />}
            {isPositive ? '+' : ''}{d}
        </div>
    );
}

// ── Helpers ───────────────────────────────────────────────────

function fmtMoney(amount: number): string {
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}k`;
    return `$${amount.toLocaleString()}`;
}

function fmtTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d`;
    return `${Math.floor(days / 7)}w`;
}
