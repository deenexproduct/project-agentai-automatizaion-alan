import { useState, useEffect, useMemo } from 'react';
import {
    Users,
    TrendingUp,
    TrendingDown,
    Target,
    MessageCircle,
    Sparkles,
    AlertCircle,
    CheckCircle2,
    Clock,
    Rocket,
    Search,
    Zap,
    Bell,
    ChevronRight,
    BarChart3,
    Calendar,
    RefreshCw,
    ArrowRight
} from 'lucide-react';

// ── Types (from stats.service.ts) ─────────────────────────────

type PipelineStatus = 
    | 'visitando' 
    | 'conectando' 
    | 'interactuando' 
    | 'enriqueciendo' 
    | 'esperando_aceptacion' 
    | 'aceptado' 
    | 'mensaje_enviado';

interface DailyActivity {
    date: string;
    contactsAdded: number;
    statusChanges: number;
    enrichmentsCompleted: number;
}

interface DashboardData {
    totalContacts: number;
    contactsChange: number;
    pipelineCounts: Record<PipelineStatus, number>;
    conversionRate: number;
    conversionChange: number;
    pendingEnrichments: number;
    enrichmentChange: number;
    scheduledMessages: number;
    messagesChange: number;
    activityTimeline: DailyActivity[];
    alerts: AlertItem[];
}

interface AlertItem {
    id: string;
    type: 'warning' | 'success' | 'info' | 'error';
    message: string;
    timestamp: Date;
}

// ── Mock Data ──────────────────────────────────────────────────

const mockDashboardData: DashboardData = {
    totalContacts: 1247,
    contactsChange: 12.5,
    pipelineCounts: {
        visitando: 145,
        conectando: 89,
        interactuando: 67,
        enriqueciendo: 234,
        esperando_aceptacion: 312,
        aceptado: 278,
        mensaje_enviado: 122
    },
    conversionRate: 84.2,
    conversionChange: 5.3,
    pendingEnrichments: 45,
    enrichmentChange: -8.2,
    scheduledMessages: 18,
    messagesChange: 4,
    activityTimeline: [
        { date: '2026-02-10', contactsAdded: 12, statusChanges: 8, enrichmentsCompleted: 5 },
        { date: '2026-02-11', contactsAdded: 18, statusChanges: 14, enrichmentsCompleted: 7 },
        { date: '2026-02-12', contactsAdded: 8, statusChanges: 6, enrichmentsCompleted: 3 },
        { date: '2026-02-13', contactsAdded: 24, statusChanges: 19, enrichmentsCompleted: 11 },
        { date: '2026-02-14', contactsAdded: 15, statusChanges: 12, enrichmentsCompleted: 8 },
        { date: '2026-02-15', contactsAdded: 31, statusChanges: 22, enrichmentsCompleted: 14 },
        { date: '2026-02-16', contactsAdded: 22, statusChanges: 16, enrichmentsCompleted: 9 },
    ],
    alerts: [
        { id: '1', type: 'warning', message: '23 contactos llevan más de 3 días en "Enriqueciendo"', timestamp: new Date() },
        { id: '2', type: 'info', message: 'Tasa de conversión aumentó un 5.3% esta semana', timestamp: new Date(Date.now() - 3600000) },
        { id: '3', type: 'success', message: '12 mensajes de WhatsApp fueron enviados exitosamente', timestamp: new Date(Date.now() - 7200000) },
    ]
};

// ── Helper Components ─────────────────────────────────────────

interface StatCardProps {
    title: string;
    value: string | number;
    change: number;
    icon: React.ReactNode;
    color: 'purple' | 'blue' | 'green' | 'orange' | 'pink' | 'cyan';
    subtitle?: string;
}

const colorSchemes = {
    purple: {
        bg: 'from-violet-500/10 to-purple-500/10',
        border: 'border-purple-200/50',
        iconBg: 'bg-gradient-to-br from-violet-500 to-purple-600',
        text: 'text-purple-600',
        glow: 'shadow-purple-500/20'
    },
    blue: {
        bg: 'from-blue-500/10 to-indigo-500/10',
        border: 'border-blue-200/50',
        iconBg: 'bg-gradient-to-br from-blue-500 to-indigo-600',
        text: 'text-blue-600',
        glow: 'shadow-blue-500/20'
    },
    green: {
        bg: 'from-emerald-500/10 to-teal-500/10',
        border: 'border-emerald-200/50',
        iconBg: 'bg-gradient-to-br from-emerald-500 to-teal-600',
        text: 'text-emerald-600',
        glow: 'shadow-emerald-500/20'
    },
    orange: {
        bg: 'from-amber-500/10 to-orange-500/10',
        border: 'border-amber-200/50',
        iconBg: 'bg-gradient-to-br from-amber-500 to-orange-600',
        text: 'text-orange-600',
        glow: 'shadow-orange-500/20'
    },
    pink: {
        bg: 'from-pink-500/10 to-rose-500/10',
        border: 'border-pink-200/50',
        iconBg: 'bg-gradient-to-br from-pink-500 to-rose-600',
        text: 'text-pink-600',
        glow: 'shadow-pink-500/20'
    },
    cyan: {
        bg: 'from-cyan-500/10 to-sky-500/10',
        border: 'border-cyan-200/50',
        iconBg: 'bg-gradient-to-br from-cyan-500 to-sky-600',
        text: 'text-cyan-600',
        glow: 'shadow-cyan-500/20'
    }
};

function StatCard({ title, value, change, icon, color, subtitle }: StatCardProps) {
    const scheme = colorSchemes[color];
    const isPositive = change >= 0;

    return (
        <div 
            className={`relative overflow-hidden rounded-2xl border ${scheme.border} bg-white/70 backdrop-blur-xl p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${scheme.glow}`}
            style={{
                background: `linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.6) 100%)`
            }}
        >
            {/* Background gradient accent */}
            <div className={`absolute -right-8 -top-8 w-32 h-32 bg-gradient-to-br ${scheme.bg} rounded-full blur-3xl opacity-60`} />
            
            <div className="relative">
                <div className="flex items-start justify-between mb-3">
                    <div className={`w-11 h-11 rounded-xl ${scheme.iconBg} flex items-center justify-center shadow-lg`}>
                        <span className="text-white">{icon}</span>
                    </div>
                    <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                        {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {Math.abs(change)}%
                    </div>
                </div>
                
                <h3 className="text-slate-500 text-sm font-medium mb-1">{title}</h3>
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-slate-800">{value}</span>
                </div>
                {subtitle && (
                    <p className={`text-xs ${scheme.text} mt-1 font-medium`}>{subtitle}</p>
                )}
            </div>
        </div>
    );
}

interface ActivityChartProps {
    data: DailyActivity[];
}

function ActivityChart({ data }: ActivityChartProps) {
    const maxValue = useMemo(() => {
        return Math.max(...data.map(d => Math.max(d.contactsAdded, d.statusChanges, d.enrichmentsCompleted)));
    }, [data]);

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-ES', { weekday: 'short' }).slice(0, 3);
    };

    return (
        <div className="rounded-2xl border border-purple-100/50 bg-white/70 backdrop-blur-xl p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-bold text-slate-800">Actividad Semanal</h3>
                    <p className="text-sm text-slate-500">Últimos 7 días de actividad</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-gradient-to-br from-violet-500 to-purple-600" />
                        <span className="text-slate-600">Contactos</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-gradient-to-br from-blue-500 to-indigo-600" />
                        <span className="text-slate-600">Cambios</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-gradient-to-br from-emerald-500 to-teal-600" />
                        <span className="text-slate-600">Enriquecimientos</span>
                    </div>
                </div>
            </div>

            <div className="flex items-end justify-between gap-2 h-48 pt-4">
                {data.map((day, idx) => {
                    const contactsHeight = maxValue > 0 ? (day.contactsAdded / maxValue) * 100 : 0;
                    const changesHeight = maxValue > 0 ? (day.statusChanges / maxValue) * 100 : 0;
                    const enrichHeight = maxValue > 0 ? (day.enrichmentsCompleted / maxValue) * 100 : 0;

                    return (
                        <div key={day.date} className="flex-1 flex flex-col items-center gap-2 group">
                            <div className="relative w-full flex items-end justify-center gap-0.5 h-full">
                                {/* Contacts bar */}
                                <div 
                                    className="w-3 bg-gradient-to-t from-violet-500 to-purple-500 rounded-t transition-all duration-500 group-hover:from-violet-400 group-hover:to-purple-400"
                                    style={{ height: `${contactsHeight}%`, minHeight: day.contactsAdded > 0 ? 4 : 0 }}
                                    title={`${day.contactsAdded} contactos agregados`}
                                />
                                {/* Changes bar */}
                                <div 
                                    className="w-3 bg-gradient-to-t from-blue-500 to-indigo-500 rounded-t transition-all duration-500 group-hover:from-blue-400 group-hover:to-indigo-400"
                                    style={{ height: `${changesHeight}%`, minHeight: day.statusChanges > 0 ? 4 : 0 }}
                                    title={`${day.statusChanges} cambios de estado`}
                                />
                                {/* Enrichments bar */}
                                <div 
                                    className="w-3 bg-gradient-to-t from-emerald-500 to-teal-500 rounded-t transition-all duration-500 group-hover:from-emerald-400 group-hover:to-teal-400"
                                    style={{ height: `${enrichHeight}%`, minHeight: day.enrichmentsCompleted > 0 ? 4 : 0 }}
                                    title={`${day.enrichmentsCompleted} enriquecimientos`}
                                />
                                
                                {/* Tooltip */}
                                <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                                    <div className="font-medium mb-1">{new Date(day.date).toLocaleDateString('es-ES')}</div>
                                    <div className="space-y-0.5 text-slate-300">
                                        <div>+{day.contactsAdded} contactos</div>
                                        <div>{day.statusChanges} cambios</div>
                                        <div>{day.enrichmentsCompleted} enriquecidos</div>
                                    </div>
                                </div>
                            </div>
                            <span className="text-xs text-slate-500 font-medium capitalize">{formatDate(day.date)}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

interface QuickActionProps {
    icon: React.ReactNode;
    label: string;
    description: string;
    color: 'purple' | 'blue' | 'green' | 'orange';
    onClick?: () => void;
}

function QuickActionCard({ icon, label, description, color, onClick }: QuickActionProps) {
    const scheme = colorSchemes[color];

    return (
        <button 
            onClick={onClick}
            className={`flex items-center gap-4 p-4 rounded-xl border ${scheme.border} bg-white/60 backdrop-blur-sm transition-all duration-200 hover:bg-white/90 hover:shadow-lg hover:scale-[1.02] group text-left w-full`}
        >
            <div className={`w-12 h-12 rounded-xl ${scheme.iconBg} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                <span className="text-white">{icon}</span>
            </div>
            <div className="flex-1">
                <h4 className="font-semibold text-slate-800 group-hover:text-slate-900">{label}</h4>
                <p className="text-sm text-slate-500">{description}</p>
            </div>
            <ChevronRight className="text-slate-400 group-hover:text-slate-600 transition-colors" size={20} />
        </button>
    );
}

interface AlertBannerProps {
    alerts: AlertItem[];
}

function AlertBanner({ alerts }: AlertBannerProps) {
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());

    const getAlertStyles = (type: AlertItem['type']) => {
        switch (type) {
            case 'warning':
                return { bg: 'bg-amber-50/80 border-amber-200 text-amber-800', icon: <AlertCircle className="text-amber-600" size={18} /> };
            case 'success':
                return { bg: 'bg-emerald-50/80 border-emerald-200 text-emerald-800', icon: <CheckCircle2 className="text-emerald-600" size={18} /> };
            case 'error':
                return { bg: 'bg-rose-50/80 border-rose-200 text-rose-800', icon: <AlertCircle className="text-rose-600" size={18} /> };
            default:
                return { bg: 'bg-blue-50/80 border-blue-200 text-blue-800', icon: <Bell className="text-blue-600" size={18} /> };
        }
    };

    const visibleAlerts = alerts.filter(a => !dismissed.has(a.id));

    if (visibleAlerts.length === 0) return null;

    return (
        <div className="space-y-2">
            {visibleAlerts.map(alert => {
                const styles = getAlertStyles(alert.type);
                return (
                    <div 
                        key={alert.id} 
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-sm ${styles.bg} animate-fadeIn`}
                    >
                        {styles.icon}
                        <p className="text-sm flex-1">{alert.message}</p>
                        <button 
                            onClick={() => setDismissed(prev => new Set([...prev, alert.id]))}
                            className="text-xs opacity-60 hover:opacity-100 transition-opacity"
                        >
                            Descartar
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

// ── Pipeline Status Card ──────────────────────────────────────

function PipelineStatusCard({ counts }: { counts: Record<PipelineStatus, number> }) {
    const stages: { key: PipelineStatus; label: string; color: string; icon: React.ReactNode }[] = [
        { key: 'visitando', label: 'Visitando', color: '#06b6d4', icon: <Target size={14} /> },
        { key: 'conectando', label: 'Conectando', color: '#eab308', icon: <Users size={14} /> },
        { key: 'interactuando', label: 'Interactuando', color: '#f97316', icon: <MessageCircle size={14} /> },
        { key: 'enriqueciendo', label: 'Enriqueciendo', color: '#a855f7', icon: <Sparkles size={14} /> },
        { key: 'esperando_aceptacion', label: 'Esperando', color: '#f59e0b', icon: <Clock size={14} /> },
        { key: 'aceptado', label: 'Aceptado', color: '#10b981', icon: <CheckCircle2 size={14} /> },
        { key: 'mensaje_enviado', label: 'Mensaje Enviado', color: '#8b5cf6', icon: <Rocket size={14} /> },
    ];

    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    return (
        <div className="rounded-2xl border border-purple-100/50 bg-white/70 backdrop-blur-xl p-6">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-800">Pipeline</h3>
                    <p className="text-sm text-slate-500">{total} contactos en total</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                    <BarChart3 className="text-white" size={20} />
                </div>
            </div>

            <div className="space-y-3">
                {stages.map((stage) => {
                    const count = counts[stage.key];
                    const percentage = total > 0 ? (count / total) * 100 : 0;
                    
                    return (
                        <div key={stage.key} className="group">
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <span style={{ color: stage.color }}>{stage.icon}</span>
                                    <span className="text-sm text-slate-600 font-medium">{stage.label}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-slate-800">{count}</span>
                                    <span className="text-xs text-slate-400">{percentage.toFixed(1)}%</span>
                                </div>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                    className="h-full rounded-full transition-all duration-500 group-hover:opacity-80"
                                    style={{ width: `${percentage}%`, backgroundColor: stage.color }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Main Dashboard Page ───────────────────────────────────────

export default function DashboardPage() {
    const [currentDate, setCurrentDate] = useState<string>('');
    const [data, setData] = useState<DashboardData>(mockDashboardData);
    const [isRefreshing, setIsRefreshing] = useState(false);

    useEffect(() => {
        const date = new Date();
        setCurrentDate(date.toLocaleDateString('es-ES', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        }));
    }, []);

    const handleRefresh = async () => {
        setIsRefreshing(true);
        // Simulate API call - will be replaced with real stats.service integration
        await new Promise(resolve => setTimeout(resolve, 1000));
        setIsRefreshing(false);
    };

    return (
        <div className="min-h-full">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
                <div>
                    <h1 
                        className="text-2xl font-bold"
                        style={{
                            background: 'linear-gradient(90deg, #7c3aed, #a855f7)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                        }}
                    >
                        Dashboard
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                        <Calendar size={14} className="text-slate-400" />
                        <span className="text-sm text-slate-500 capitalize">{currentDate}</span>
                    </div>
                </div>

                <button 
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-slate-600 bg-white/70 backdrop-blur-sm border border-purple-100 hover:bg-white/90 hover:text-purple-600 transition-all disabled:opacity-50"
                >
                    <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                    Actualizar
                </button>
            </div>

            {/* Alerts */}
            <div className="mb-6">
                <AlertBanner alerts={data.alerts} />
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatCard 
                    title="Total Contactos"
                    value={data.totalContacts.toLocaleString()}
                    change={data.contactsChange}
                    icon={<Users size={22} />}
                    color="purple"
                    subtitle="Contactos en el CRM"
                />
                <StatCard 
                    title="Tasa de Conversión"
                    value={`${data.conversionRate}%`}
                    change={data.conversionChange}
                    icon={<Target size={22} />}
                    color="green"
                    subtitle="Visitando → Mensaje enviado"
                />
                <StatCard 
                    title="Enriquecimientos"
                    value={data.pendingEnrichments}
                    change={data.enrichmentChange}
                    icon={<Sparkles size={22} />}
                    color="orange"
                    subtitle="Pendientes de enriquecer"
                />
                <StatCard 
                    title="WhatsApp Programados"
                    value={data.scheduledMessages}
                    change={data.messagesChange}
                    icon={<MessageCircle size={22} />}
                    color="blue"
                    subtitle="Mensajes en cola"
                />
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* Activity Chart - Takes 2 columns */}
                <div className="lg:col-span-2">
                    <ActivityChart data={data.activityTimeline} />
                </div>

                {/* Pipeline Status */}
                <div>
                    <PipelineStatusCard counts={data.pipelineCounts} />
                </div>
            </div>

            {/* Quick Actions */}
            <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4">Acciones Rápidas</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <QuickActionCard 
                        icon={<Search size={22} />}
                        label="Buscar Contactos"
                        description="Explorar y filtrar tu base de datos"
                        color="purple"
                    />
                    <QuickActionCard 
                        icon={<Zap size={22} />}
                        label="Enriquecer Pendientes"
                        description={`${data.pendingEnrichments} contactos esperan`}
                        color="orange"
                    />
                    <QuickActionCard 
                        icon={<MessageCircle size={22} />}
                        label="Programar WhatsApp"
                        description="Crear nuevos mensajes"
                        color="green"
                    />
                    <QuickActionCard 
                        icon={<BarChart3 size={22} />}
                        label="Ver Reportes"
                        description="Análisis detallado del pipeline"
                        color="blue"
                    />
                </div>
            </div>

            {/* Additional Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-purple-100/50 bg-gradient-to-br from-violet-50/50 to-purple-50/50 backdrop-blur-sm p-5">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
                            <Rocket className="text-white" size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500">Mensajes Enviados</p>
                            <p className="text-2xl font-bold text-slate-800">{data.pipelineCounts.mensaje_enviado}</p>
                        </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-sm">
                        <ArrowRight size={14} className="text-emerald-500" />
                        <span className="text-emerald-600 font-medium">+12% vs semana anterior</span>
                    </div>
                </div>

                <div className="rounded-2xl border border-purple-100/50 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 backdrop-blur-sm p-5">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                            <CheckCircle2 className="text-white" size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500">Conexiones Aceptadas</p>
                            <p className="text-2xl font-bold text-slate-800">{data.pipelineCounts.aceptado}</p>
                        </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-sm">
                        <ArrowRight size={14} className="text-emerald-500" />
                        <span className="text-emerald-600 font-medium">+8 nuevas hoy</span>
                    </div>
                </div>

                <div className="rounded-2xl border border-purple-100/50 bg-gradient-to-br from-amber-50/50 to-orange-50/50 backdrop-blur-sm p-5">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
                            <Clock className="text-white" size={24} />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500">Esperando Aceptación</p>
                            <p className="text-2xl font-bold text-slate-800">{data.pipelineCounts.esperando_aceptacion}</p>
                        </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 text-sm">
                        <span className="text-slate-500">Promedio de espera:</span>
                        <span className="text-amber-600 font-medium">2.3 días</span>
                    </div>
                </div>
            </div>

            {/* Global Styles */}
            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fadeIn {
                    animation: fadeIn 0.3s ease-out;
                }
            `}</style>
        </div>
    );
}
