import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Users, Briefcase, CheckSquare, Clock, ArrowUpRight, Plus, Activity, Trophy, XCircle, AlertCircle } from 'lucide-react';
import { getDashboardStats, getTasks, getActivities, DashboardStats, TaskData, ActivityData, completeTask, getDealsPipeline } from '../../services/crm.service';
import { formatToArgentineDate } from '../../utils/date';
import ActivityTimeline from './ActivityTimeline';

export default function CRMDashboard() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [tasks, setTasks] = useState<TaskData[]>([]);
    const [activities, setActivities] = useState<ActivityData[]>([]);
    const [pipelineStages, setPipelineStages] = useState<{ key: string, label: string }[]>([]);
    const [loading, setLoading] = useState(true);



    const navigate = useNavigate();

    // Editing rate state
    const [estimatedSuccessRate, setEstimatedSuccessRate] = useState(25);
    const [isEditingRate, setIsEditingRate] = useState(false);
    const [tempRate, setTempRate] = useState("25");

    const handleTimelineClick = (item: ActivityData & { source?: string, contact?: any, deal?: any, company?: any }) => {
        console.log("Timeline clicked:", item);
        if (item.source === 'deal') {
            navigate(`/linkedin/pipeline/${item._id}`);
        } else if (item.source === 'company') {
            navigate(`/linkedin/companies/${item._id}`);
        } else if (item.source === 'contact') {
            navigate(`/linkedin/contacts/${item._id}`);
        } else {
            // It's a standard activity or task
            if (item.deal) {
                navigate(`/linkedin/pipeline/${typeof item.deal === 'object' ? item.deal._id : item.deal}`);
            } else if (item.company) {
                navigate(`/linkedin/companies/${typeof item.company === 'object' ? item.company._id : item.company}`);
            } else if (item.contact) {
                navigate(`/linkedin/contacts/${typeof item.contact === 'object' ? item.contact._id : item.contact}`);
            }
        }
    };

    const loadData = async () => {
        try {
            setLoading(true);
            const [statsData, tasksData, actsData, pipelineData] = await Promise.all([
                getDashboardStats(),
                getTasks({ overdue: true, limit: 5 }), // Fetch urgent/overdue + today tasks
                getActivities({ limit: 40, unified: true }),
                getDealsPipeline()
            ]);
            setStats(statsData);
            setTasks(tasksData.tasks);
            setActivities(actsData.activities);
            setPipelineStages(pipelineData.stages.map(s => ({ key: s.key, label: s.label })));
        } catch (error) {
            console.error("Dashboard error:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // Debugging the stats object here directly to help trace the metrics issue
    useEffect(() => {
        if (stats) {
            console.log('--- RAW DASHBOARD STATS ---', stats);
        }
    }, [stats]);

    const handleCompleteTask = async (taskId: string) => {
        try {
            await completeTask(taskId);
            loadData(); // Refresh to update stats, tasks, and activities timeline
        } catch (error) {
            console.error("Failed to complete task", error);
        }
    };

    if (loading || !stats) {
        return (
            <div className="flex-1 flex items-center justify-center p-8">
                <div className="animate-spin w-12 h-12 border-4 border-transparent border-t-violet-600 rounded-full" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 md:gap-6 max-w-7xl mx-auto w-full relative min-h-[calc(100vh-140px)] mt-4 pb-20 md:pb-0">
            {/* Atmospheric Background Effects */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[32px] -z-10">
                <div className="absolute top-0 -left-20 w-[600px] h-[600px] bg-white/40 rounded-full blur-3xl opacity-50 animate-[pulse_10s_ease-in-out_infinite_reverse]" />
                <div className="absolute top-40 right-1/4 w-[500px] h-[500px] bg-violet-200/20 rounded-full blur-3xl opacity-50 animate-[pulse_12s_ease-in-out_infinite]" />
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 relative z-10 w-full">
                {/* 1. Monto Mensual Proyectado */}
                <StatCard
                    title="Mensual Proyectado"
                    value={
                        (stats.revenue?.wonThisMonth || []).length > 0
                            ? (stats.revenue?.wonThisMonth || []).map(r => `${r.currency || '$'} ${r.amount.toLocaleString()}`).join(' + ')
                            : '$0'
                    }
                    icon={Briefcase}
                    color="text-emerald-600"
                    bg="bg-emerald-100"
                    subtitle="Excl. perdidos y pausados"
                />

                {/* 1b. Monto Mensual Estimado (25% del proyectado) */}
                <StatCard
                    title="Mensual Estimado"
                    value={
                        (stats.revenue?.wonThisMonth || []).length > 0
                            ? (stats.revenue?.wonThisMonth || []).map(r => `${r.currency || '$'} ${Math.round(r.amount * (estimatedSuccessRate / 100)).toLocaleString()}`).join(' + ')
                            : '$0'
                    }
                    icon={Briefcase}
                    color="text-cyan-600"
                    bg="bg-cyan-100"
                    subtitle={
                        isEditingRate ? (
                            <form
                                onSubmit={(e) => { e.preventDefault(); setEstimatedSuccessRate(Number(tempRate) || 0); setIsEditingRate(false); }}
                                className="flex items-center gap-1.5 inline-flex relative z-20"
                            >
                                <input
                                    type="number"
                                    value={tempRate}
                                    onChange={(e) => setTempRate(e.target.value)}
                                    className="w-14 px-1.5 py-0.5 text-xs border border-cyan-300 rounded focus:outline-none focus:ring-2 focus:ring-cyan-500/50 text-slate-700 bg-white"
                                    autoFocus
                                    onBlur={() => { setEstimatedSuccessRate(Number(tempRate) || 0); setIsEditingRate(false); }}
                                    min="0"
                                    max="100"
                                    onClick={(e) => e.stopPropagation()}
                                />
                                <span className="text-slate-500 text-[11px] font-bold">% tasa proyectada</span>
                            </form>
                        ) : (
                            <span
                                onClick={(e) => { e.preventDefault(); setIsEditingRate(true); setTempRate(estimatedSuccessRate.toString()); }}
                                className="cursor-pointer hover:text-cyan-600 flex items-center gap-1 transition-colors group/edit"
                                title="Haga clic para editar el porcentaje"
                            >
                                {estimatedSuccessRate}% tasa de éxito proyectada
                                <span className="opacity-0 group-hover/edit:opacity-100 transition-opacity text-[10px]">✏️</span>
                            </span>
                        )
                    }
                />

                {/* 2. Locales */}
                <StatCard
                    title="Locales Activos"
                    value={(stats.companies?.totalLocales || 0).toString()}
                    icon={Building2}
                    color="text-indigo-600"
                    bg="bg-indigo-100"
                />

                {/* 3. Empresas */}
                <StatCard
                    title="Total Empresas"
                    value={(stats.companies?.totalCompanies || 0).toString()}
                    icon={Building2}
                    color="text-violet-600"
                    bg="bg-violet-100"
                    trend={stats.companies?.growthFromLastMonth > 0 ? `+${stats.companies.growthFromLastMonth}` : stats.companies?.growthFromLastMonth < 0 ? `${stats.companies.growthFromLastMonth}` : null}
                />

                {/* 4. Contactos */}
                <StatCard
                    title="Total de Contactos"
                    value={(stats.contacts?.total || 0).toString()}
                    icon={Users}
                    color="text-blue-600"
                    bg="bg-blue-100"
                    subtitle={`+${stats.contacts.newThisMonth} nuevos este mes`}
                />

                {/* 5. Ganados */}
                <StatCard
                    title="Deals Ganados"
                    value={(stats.conversion?.dealsWon || 0).toString()}
                    icon={Trophy}
                    color="text-emerald-600"
                    bg="bg-emerald-100"
                />

                {/* 6. Fallidos */}
                <StatCard
                    title="Deals Fallidos / Pausa"
                    value={((stats.conversion?.dealsLost || 0) + (stats.conversion?.dealsPaused || 0)).toString()}
                    icon={XCircle}
                    color="text-red-500"
                    bg="bg-red-100"
                />

                {/* 7. Tareas Totales */}
                <StatCard
                    title="Tareas Totales"
                    value={(stats.tasks?.total || 0).toString()}
                    icon={CheckSquare}
                    color="text-amber-600"
                    bg="bg-amber-100"
                />

                {/* 8. Tareas Atrasadas */}
                <StatCard
                    title="Tareas Atrasadas"
                    value={(stats.tasks?.overdue || 0).toString()}
                    icon={AlertCircle}
                    color={(stats.tasks?.overdue || 0) > 0 ? "text-red-500" : "text-emerald-500"}
                    bg={(stats.tasks?.overdue || 0) > 0 ? "bg-red-100" : "bg-emerald-100"}
                    subtitle={`${(stats.tasks?.completionRateThisWeek || 0).toFixed(0)}% completadas la sem.`}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
                {/* Left Column: Tasks & Pipeline Summary */}
                <div className="lg:col-span-2 flex flex-col gap-6">

                    {/* Análisis de Conversión del Pipeline */}
                    <div className="bg-white/80 backdrop-blur-xl border border-white/90 rounded-[28px] p-6 shadow-[0_8px_32px_rgba(30,27,75,0.05)] transition-all duration-300 hover:bg-white/95 hover:shadow-[0_12px_40px_rgba(139,92,246,0.08)]">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-[16px] font-bold text-slate-800 flex items-center gap-2 tracking-tight">
                                <div className="w-8 h-8 rounded-[10px] bg-emerald-100 text-emerald-600 flex items-center justify-center shadow-inner">
                                    <TargetIcon size={16} />
                                </div>
                                Análisis de Conversión del Pipeline
                            </h3>
                        </div>

                        {/* Tasas Generales */}
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4 mb-6 p-3 md:p-4 bg-slate-50/50 rounded-[20px] border border-slate-100">
                            <div className="flex flex-col text-center">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Lead a Reuniones</p>
                                <div className="text-2xl font-extrabold text-blue-600">{(stats.conversion?.leadToMeeting || 0).toFixed(1)}%</div>
                            </div>
                            <div className="flex flex-col text-center border-l lg:border-r border-slate-200">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1" title="Tasa de Conversión de Mensajes">Lead a Coordinando</p>
                                <div className="text-2xl font-extrabold text-indigo-500">{(stats.conversion?.leadToScheduling || 0).toFixed(1)}%</div>
                            </div>
                            <div className="flex flex-col text-center lg:border-r border-slate-200">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Win Rate</p>
                                <div className="text-2xl font-extrabold text-slate-800">{(stats.conversion?.winRate || 0).toFixed(1)}%</div>
                            </div>
                            <div className="flex flex-col text-center border-l lg:border-l-0 lg:border-r border-slate-200">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Lead a Ganado</p>
                                <div className="text-2xl font-extrabold text-emerald-600">{(stats.conversion?.leadToWon || 0).toFixed(1)}%</div>
                            </div>
                            <div className="flex flex-col text-center col-span-2 lg:col-span-1">
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Rechazo</p>
                                <div className="text-2xl font-extrabold text-red-500">{(stats.conversion?.leadToRejected || 0).toFixed(1)}%</div>
                            </div>
                        </div>

                        {/* Funnel Visual Eliminado por solicitud del usuario */}
                    </div>

                    {/* Pending Tasks */}
                    <div className="bg-white/80 backdrop-blur-xl border border-white/90 rounded-[28px] p-6 shadow-[0_8px_32px_rgba(30,27,75,0.05)] transition-all duration-300 flex-1 hover:bg-white/95 hover:shadow-[0_12px_40px_rgba(30,27,75,0.08)]">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="text-[16px] font-bold text-slate-800 flex items-center gap-2 tracking-tight">
                                <div className="w-8 h-8 rounded-[10px] bg-amber-100 text-amber-600 flex items-center justify-center shadow-inner">
                                    <CheckSquare size={16} />
                                </div>
                                Prioridad de Hoy
                            </h3>
                        </div>

                        {tasks.length === 0 ? (
                            <div className="text-center py-10 bg-white/40 rounded-[20px] border border-white/50 shadow-inner">
                                <CheckCircleIcon className="w-10 h-10 mx-auto mb-3 opacity-30 text-emerald-500" />
                                <p className="text-[14px] font-bold text-slate-500">No hay tareas pendientes para hoy.</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {tasks.map(task => (
                                    <div key={task._id} className="flex items-center justify-between p-4 rounded-[20px] border border-white/80 bg-white/70 backdrop-blur-md shadow-[0_4px_16px_rgba(30,27,75,0.03)] hover:shadow-[0_8px_24px_rgba(30,27,75,0.06)] hover:-translate-y-0.5 hover:bg-white/90 transition-all duration-300 group cursor-pointer">
                                        <div className="flex items-center gap-4 w-full">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleCompleteTask(task._id); }}
                                                className="w-7 h-7 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center text-transparent hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-500 transition-all shadow-sm flex-shrink-0"
                                            >
                                                <CheckSquare size={14} />
                                            </button>
                                            <div className="min-w-0 flex-1">
                                                <h4 className="font-bold text-slate-800 text-[14px] flex items-center gap-2 truncate">
                                                    {task.title}
                                                    {task.priority === 'urgent' && <span className="px-2 py-0.5 rounded-[6px] text-[10px] font-bold bg-red-100/80 border border-red-200 text-red-600 uppercase tracking-wide shrink-0">Urgente</span>}
                                                </h4>
                                                <p className="text-[12px] font-medium text-slate-500 flex items-center gap-2 mt-1 truncate">
                                                    {task.contact?.fullName || task.company?.name || 'Interna'}
                                                    {task.dueDate && (
                                                        <>
                                                            <span className="opacity-50">•</span>
                                                            <span className={`inline-flex items-center gap-1 ${new Date(task.dueDate) < new Date() ? 'text-red-500 bg-red-50/50 px-1.5 py-0.5 rounded-[4px]' : ''}`}>
                                                                <Clock size={12} className={new Date(task.dueDate) < new Date() ? 'text-red-500' : 'opacity-70'} />
                                                                {formatToArgentineDate(task.dueDate)}
                                                            </span>
                                                        </>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Column: Timeline */}
                <div className="bg-white/80 backdrop-blur-xl border border-white/90 rounded-[28px] p-4 md:p-6 shadow-[0_8px_32px_rgba(30,27,75,0.05)] overflow-hidden flex flex-col h-auto md:h-[650px] transition-all duration-300 hover:bg-white/95 hover:shadow-[0_12px_40px_rgba(30,27,75,0.08)]">
                    <div className="flex items-center justify-between mb-5 shrink-0">
                        <h3 className="text-[16px] font-bold text-slate-800 flex items-center gap-2 tracking-tight">
                            <div className="w-8 h-8 rounded-[10px] bg-blue-100 text-blue-600 flex items-center justify-center shadow-inner">
                                <Clock size={16} />
                            </div>
                            Actividad Reciente
                        </h3>
                    </div>
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar -mr-4 pb-4">
                        <ActivityTimeline activities={activities} onItemClick={handleTimelineClick} />
                    </div>
                </div>
            </div>

        </div>
    );
}

// ── Helpers ──────────────────────────────────────────────────────

function TargetIcon(props: any) {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>;
}

function CheckCircleIcon(props: any) {
    return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>;
}

function StatCard({ title, value, subtitle, icon: Icon, color, bg, trend }: any) {
    return (
        <div className="bg-white/80 backdrop-blur-xl border border-white/90 rounded-[24px] p-5 shadow-[0_8px_32px_rgba(30,27,75,0.05)] relative overflow-hidden group hover:bg-white/95 transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(30,27,75,0.08)]">
            <div className={`absolute -right-6 -top-6 w-32 h-32 rounded-full ${bg} opacity-40 blur-2xl group-hover:scale-150 transition-transform duration-700 ease-out`} />
            <div className="flex justify-between items-start relative z-10">
                <div>
                    <p className="text-[13px] font-bold text-slate-500 mb-1 uppercase tracking-wide">{title}</p>
                    <h3 className="text-3xl font-bold text-slate-800 tracking-tight">{value}</h3>
                    {(subtitle || trend) && (
                        <div className={`text-[12px] mt-2 font-bold ${trend ? 'text-emerald-500 bg-emerald-50/80 px-2 py-0.5 rounded-[6px] inline-block border border-emerald-100/50' : 'text-slate-500'}`}>
                            {trend && <ArrowUpRight size={12} className="inline mr-0.5" />}
                            {trend || subtitle}
                        </div>
                    )}
                </div>
                <div className={`w-12 h-12 rounded-[16px] ${bg} flex items-center justify-center shadow-inner`}>
                    <Icon size={24} className={color} />
                </div>
            </div>
        </div>
    );
}
