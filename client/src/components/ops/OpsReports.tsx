import { useState, useEffect } from 'react';
import {
    Loader2, FileText, TrendingUp, CheckCircle2, Target, Calendar, ChevronRight,
    ArrowLeft, BarChart3, Clock, Building2, Star, Zap, Award, X, Plus, Trash2, AlertTriangle
} from 'lucide-react';
import { getOpsReports, getOpsReport, generateWeeklyReport, deleteOpsReport } from '../../services/ops.service';

// ── Types ─────────────────────────────────────────────────────

interface ReportSummary {
    _id: string;
    weekLabel: string;
    weekStart: string;
    weekEnd: string;
    generatedAt: string;
    generatedBy?: { name: string; profilePhotoUrl?: string };
    totalTasksCompleted: number;
    totalTasksCreated: number;
    completionRate: number;
    goalsCompletedThisWeek: number;
    avgGoalProgress: number;
    mostProductiveDay: string;
    mostProductiveDayCount: number;
    overallScore: number;
    highlights: string[];
}

interface FullReport extends ReportSummary {
    completedTasks: any[];
    pendingTasks: any[];
    goalsSnapshot: any[];
    dailyProductivity: { day: string; dayLabel: string; tasksCompleted: number; tasksCreated: number }[];
    dealsByStatus: Record<string, number>;
    dealsMovedForward: number;
    totalTasksAtStart: number;
}

// ── Score Color Helpers ───────────────────────────────────────

function getScoreColor(score: number) {
    if (score >= 75) return { text: '#22c55e', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.2)', emoji: '🔥' };
    if (score >= 50) return { text: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', emoji: '⚡' };
    if (score >= 25) return { text: '#3b82f6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)', emoji: '📊' };
    return { text: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)', emoji: '📈' };
}

const CATEGORY_EMOJIS: Record<string, string> = {
    despliegue: '🚀', tecnico: '⚙️', capacitacion: '📚',
    revenue: '💰', operativo: '🎯', custom: '📌',
};

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

export default function OpsReports() {
    const [reports, setReports] = useState<ReportSummary[]>([]);
    const [selectedReport, setSelectedReport] = useState<FullReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    const loadReports = async () => {
        try {
            setLoading(true);
            const res = await getOpsReports();
            setReports(res.reports);
        } catch (err) {
            console.error('Error loading reports:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadReports(); }, []);

    const handleGenerate = async () => {
        if (generating) return;
        setGenerating(true);
        try {
            const report = await generateWeeklyReport();
            loadReports();
            setSelectedReport(report);
        } catch (err) {
            console.error('Error generating report:', err);
        } finally {
            setGenerating(false);
        }
    };

    const handleViewReport = async (id: string) => {
        try {
            setLoadingDetail(true);
            const report = await getOpsReport(id);
            setSelectedReport(report);
        } catch (err) {
            console.error('Error loading report:', err);
        } finally {
            setLoadingDetail(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (deleting) return;
        setDeleting(true);
        try {
            await deleteOpsReport(id);
            setDeleteConfirm(null);
            if (selectedReport?._id === id) setSelectedReport(null);
            loadReports();
        } catch (err) {
            console.error('Error deleting report:', err);
        } finally {
            setDeleting(false);
        }
    };

    // ── DETAIL VIEW ──
    if (selectedReport) {
        return (
            <ReportDetailView
                report={selectedReport}
                onBack={() => setSelectedReport(null)}
                onDelete={(id) => setDeleteConfirm(id)}
            />
        );
    }

    // ── LIST VIEW ──
    return (
        <div className="flex flex-col h-[calc(100vh-140px)] min-h-[500px] relative mt-4 pb-20 md:pb-0">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 shrink-0">
                <div>
                    <h2 className="text-xl font-black text-slate-800">Informes Semanales</h2>
                    <p className="text-sm text-slate-500 mt-0.5">Historial de reportes operativos</p>
                </div>
                <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold text-[14px] rounded-xl hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(139,92,246,0.4)] transition-all shadow-[0_4px_16px_rgba(139,92,246,0.3)] disabled:opacity-60 disabled:translate-y-0"
                >
                    {generating ? (
                        <><Loader2 size={16} className="animate-spin" /> Generando...</>
                    ) : (
                        <><Plus size={16} /> Generar Informe Semanal</>
                    )}
                </button>
            </div>

            {/* Reports List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <Loader2 size={32} className="animate-spin text-violet-500" />
                    </div>
                ) : reports.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-24 h-24 bg-gradient-to-br from-white/80 to-white/40 backdrop-blur-md rounded-full flex items-center justify-center mb-6 border border-white/60 shadow-[0_8px_32px_rgba(30,27,75,0.05)]">
                            <span className="text-4xl">📊</span>
                        </div>
                        <h3 className="text-[20px] font-black text-slate-700">Sin informes</h3>
                        <p className="text-slate-500 text-[15px] font-medium max-w-sm mt-2 mb-6">Genera tu primer informe semanal para ver el rendimiento operativo.</p>
                        <button onClick={handleGenerate} disabled={generating} className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(139,92,246,0.4)] transition-all rounded-xl text-white font-bold shadow-[0_4px_16px_rgba(139,92,246,0.3)]">
                            {generating ? 'Generando...' : 'Generar Primer Informe'}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {reports.map(report => {
                            const scoreCfg = getScoreColor(report.overallScore);
                            return (
                                <div
                                    key={report._id}
                                    onClick={() => handleViewReport(report._id)}
                                    className="group rounded-2xl p-5 cursor-pointer transition-all duration-200 hover:scale-[1.003]"
                                    style={{
                                        background: 'rgba(255,255,255,0.85)',
                                        backdropFilter: 'blur(20px)',
                                        border: '1px solid rgba(0,0,0,0.06)',
                                        boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
                                    }}
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: scoreCfg.bg }}>
                                                {scoreCfg.emoji}
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-[15px] text-slate-800 group-hover:text-violet-700 transition-colors">{report.weekLabel}</h4>
                                                <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                                                    <Calendar size={11} />
                                                    Generado el {new Date(report.generatedAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                    {report.generatedBy && <> por {report.generatedBy.name}</>}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="text-center">
                                                <div className="text-2xl font-black" style={{ color: scoreCfg.text }}>{report.overallScore}</div>
                                                <div className="text-[10px] text-slate-400 font-bold uppercase">Score</div>
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setDeleteConfirm(report._id); }}
                                                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                                                title="Eliminar informe"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                            <ChevronRight size={18} className="text-slate-300 group-hover:text-violet-400 transition-colors" />
                                        </div>
                                    </div>

                                    {/* Quick metrics */}
                                    <div className="flex items-center gap-4 text-[12px]">
                                        <span className="flex items-center gap-1 text-green-600 font-semibold">
                                            <CheckCircle2 size={12} /> {report.totalTasksCompleted} completadas
                                        </span>
                                        <span className="flex items-center gap-1 text-amber-600 font-semibold">
                                            <Target size={12} /> {report.completionRate}% tasa
                                        </span>
                                        {report.mostProductiveDay && report.mostProductiveDayCount > 0 && (
                                            <span className="flex items-center gap-1 text-violet-600 font-semibold">
                                                <Zap size={12} /> {report.mostProductiveDay}
                                            </span>
                                        )}
                                        {report.goalsCompletedThisWeek > 0 && (
                                            <span className="flex items-center gap-1 text-fuchsia-600 font-semibold">
                                                <Star size={12} /> {report.goalsCompletedThisWeek} meta(s)
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Loading detail overlay */}
            {loadingDetail && (
                <div className="fixed inset-0 z-50 bg-black/10 backdrop-blur-sm flex items-center justify-center">
                    <Loader2 size={40} className="animate-spin text-violet-500" />
                </div>
            )}

            {/* Delete Confirmation Modal (list view) */}
            {deleteConfirm && !selectedReport && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" style={{ animation: 'fadeIn 0.2s ease-out' }}>
                    <div className="bg-white rounded-[24px] p-6 max-w-sm w-full shadow-[0_20px_60px_rgba(0,0,0,0.1)] border border-slate-100" onClick={e => e.stopPropagation()}>
                        <div className="w-14 h-14 bg-red-50 text-red-500 rounded-[16px] flex items-center justify-center mb-5 border border-red-100 shadow-inner">
                            <AlertTriangle size={28} />
                        </div>
                        <h3 className="text-[20px] font-bold text-slate-800 mb-2 tracking-tight">¿Eliminar Informe?</h3>
                        <p className="text-slate-500 text-[14px] mb-6 leading-relaxed">
                            Este informe semanal será eliminado permanentemente. Esta acción no se puede deshacer.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 py-3 px-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-[14px] hover:bg-slate-50 transition-colors text-[14px]"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                disabled={deleting}
                                className="flex-1 py-3 px-4 bg-red-500 text-white font-bold rounded-[14px] hover:bg-red-600 transition-colors shadow-sm shadow-red-500/30 text-[14px] disabled:opacity-50"
                            >
                                {deleting ? 'Eliminando...' : 'Sí, eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.2); border-radius: 10px; }
                .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.4); }
            `}</style>
        </div>
    );
}


// ══════════════════════════════════════════════════════════════
// REPORT DETAIL VIEW
// ══════════════════════════════════════════════════════════════

function ReportDetailView({ report, onBack, onDelete }: { report: FullReport; onBack: () => void; onDelete: (id: string) => void }) {
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const scoreCfg = getScoreColor(report.overallScore);
    const maxDailyCompleted = Math.max(...(report.dailyProductivity || []).map(d => d.tasksCompleted), 1);

    const handleDelete = async (id: string) => {
        if (deleting) return;
        setDeleting(true);
        try {
            await onDelete(id);
            setDeleteConfirm(null);
        } catch (err) {
            console.error('Error deleting report:', err);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] min-h-[500px] mt-4 pb-20 md:pb-0">
            {/* Back + Title */}
            <div className="flex items-center gap-3 mb-4 shrink-0">
                <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white/80 border border-slate-200 flex items-center justify-center hover:bg-violet-50 hover:border-violet-200 transition-colors">
                    <ArrowLeft size={18} className="text-slate-600" />
                </button>
                <div className="flex-1">
                    <h2 className="text-xl font-black text-slate-800">{report.weekLabel}</h2>
                    <p className="text-[12px] text-slate-400">
                        Generado el {new Date(report.generatedAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>
                <button
                    onClick={() => onDelete(report._id)}
                    className="w-9 h-9 rounded-xl bg-white/80 border border-slate-200 flex items-center justify-center hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition-colors text-slate-400"
                    title="Eliminar informe"
                >
                    <Trash2 size={16} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-4">
                {/* ── Score + Key Metrics ── */}
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                    {/* Overall Score */}
                    <div className="col-span-2 lg:col-span-1 rounded-2xl p-5 flex flex-col items-center justify-center" style={{ background: scoreCfg.bg, border: `1px solid ${scoreCfg.border}` }}>
                        <div className="text-4xl font-black" style={{ color: scoreCfg.text }}>{report.overallScore}</div>
                        <div className="text-[11px] font-bold text-slate-500 uppercase mt-1 flex items-center gap-1">
                            <Award size={12} /> Score Semanal
                        </div>
                    </div>
                    {[
                        { label: 'Tareas Completadas', value: report.totalTasksCompleted, icon: CheckCircle2, color: '#22c55e' },
                        { label: 'Tareas Creadas', value: report.totalTasksCreated, icon: FileText, color: '#3b82f6' },
                        { label: 'Tasa Completado', value: `${report.completionRate}%`, icon: TrendingUp, color: '#f59e0b' },
                        { label: 'Día Top', value: report.mostProductiveDay || '—', icon: Zap, color: '#8b5cf6', sub: report.mostProductiveDayCount > 0 ? `${report.mostProductiveDayCount} tareas` : '' },
                    ].map(card => (
                        <div
                            key={card.label}
                            className="rounded-2xl p-4 transition-all"
                            style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.03)' }}
                        >
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ background: `${card.color}15` }}>
                                <card.icon size={16} color={card.color} />
                            </div>
                            <div className="text-xl font-bold text-slate-800">{card.value}</div>
                            <div className="text-[11px] text-slate-500 font-medium mt-0.5">{card.label}</div>
                            {card.sub && <div className="text-[10px] text-slate-400 mt-0.5">{card.sub}</div>}
                        </div>
                    ))}
                </div>

                {/* ── Highlights ── */}
                {report.highlights && report.highlights.length > 0 && (
                    <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(0,0,0,0.06)' }}>
                        <h3 className="text-[13px] font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <Star size={14} className="text-amber-500" /> Destacados
                        </h3>
                        <div className="space-y-2">
                            {report.highlights.map((h, i) => (
                                <div key={i} className="flex items-start gap-2 text-[14px] text-slate-600">
                                    <span className="text-violet-400 mt-0.5">•</span>
                                    <span>{h}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Daily Productivity Bar Chart ── */}
                {report.dailyProductivity && report.dailyProductivity.length > 0 && (
                    <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(0,0,0,0.06)' }}>
                        <h3 className="text-[13px] font-bold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                            <BarChart3 size={14} className="text-blue-500" /> Productividad Diaria
                        </h3>
                        <div className="flex items-end gap-3 h-40">
                            {report.dailyProductivity.map(day => {
                                const height = maxDailyCompleted > 0 ? (day.tasksCompleted / maxDailyCompleted) * 100 : 0;
                                const isMax = day.dayLabel === report.mostProductiveDay && day.tasksCompleted > 0;
                                return (
                                    <div key={day.day} className="flex-1 flex flex-col items-center gap-1">
                                        <span className="text-[12px] font-bold text-slate-700">{day.tasksCompleted}</span>
                                        <div className="w-full rounded-t-lg transition-all" style={{
                                            height: `${Math.max(height, 4)}%`,
                                            background: isMax
                                                ? 'linear-gradient(180deg, #8b5cf6, #a855f7)'
                                                : day.tasksCompleted > 0
                                                    ? 'linear-gradient(180deg, #3b82f6, #60a5fa)'
                                                    : '#e2e8f0',
                                            boxShadow: isMax ? '0 4px 12px rgba(139,92,246,0.3)' : 'none',
                                        }} />
                                        <span className={`text-[10px] font-bold ${isMax ? 'text-violet-600' : 'text-slate-400'}`}>
                                            {day.day.substring(0, 3).toUpperCase()}
                                        </span>
                                        {day.tasksCreated > 0 && (
                                            <span className="text-[9px] text-blue-400">+{day.tasksCreated}</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-400">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-400" /> Completadas</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-violet-500" /> Día más productivo</span>
                        </div>
                    </div>
                )}

                {/* ── Goals Snapshot ── */}
                {report.goalsSnapshot && report.goalsSnapshot.length > 0 && (
                    <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(0,0,0,0.06)' }}>
                        <h3 className="text-[13px] font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <Target size={14} className="text-fuchsia-500" /> Progreso de Metas
                            {report.goalsCompletedThisWeek > 0 && (
                                <span className="ml-2 text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-100">
                                    {report.goalsCompletedThisWeek} cumplida(s)
                                </span>
                            )}
                        </h3>
                        <div className="space-y-3">
                            {report.goalsSnapshot.map(goal => {
                                const emoji = CATEGORY_EMOJIS[goal.category] || '📌';
                                const totalTasks = (goal as any).totalTasks || 0;
                                const completedTasks = (goal as any).completedTasks || 0;
                                const tasksThisWeek = (goal as any).tasksCompletedThisWeek || 0;
                                const progressPct = totalTasks > 0 ? Math.min(Math.round((completedTasks / totalTasks) * 100), 100) : 0;
                                const isComplete = (goal as any).status === 'completed';
                                return (
                                    <div key={goal.goalId} className="p-3 rounded-xl bg-slate-50/50 border border-slate-100">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm">{emoji}</span>
                                                <span className={`text-[13px] font-bold text-slate-700 ${isComplete ? 'line-through' : ''}`}>{goal.title}</span>
                                                {goal.company && (
                                                    <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-100 flex items-center gap-0.5">
                                                        <Building2 size={9} /> {goal.company.name}
                                                    </span>
                                                )}
                                            </div>
                                            {isComplete ? (
                                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-100">✅ Cumplida</span>
                                            ) : tasksThisWeek > 0 ? (
                                                <span className="text-[12px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
                                                    +{tasksThisWeek} tarea{tasksThisWeek !== 1 ? 's' : ''} esta semana
                                                </span>
                                            ) : (
                                                <span className="text-[12px] text-slate-400">Sin avance</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="flex-1 h-2.5 rounded-full bg-slate-200 overflow-hidden">
                                                <div className="h-full rounded-full transition-all" style={{
                                                    width: `${progressPct}%`,
                                                    background: isComplete || progressPct >= 100 ? '#22c55e' : '#8b5cf6',
                                                }} />
                                            </div>
                                            <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                                                {completedTasks} / {totalTasks} tareas ({progressPct}%)
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── Completed Tasks ── */}
                {report.completedTasks && report.completedTasks.length > 0 && (
                    <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(0,0,0,0.06)' }}>
                        <h3 className="text-[13px] font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <CheckCircle2 size={14} className="text-green-500" /> Tareas Completadas ({report.completedTasks.length})
                        </h3>
                        <div className="space-y-2">
                            {report.completedTasks.map(task => (
                                <div key={task.taskId} className="flex items-center gap-3 p-2.5 rounded-xl bg-green-50/30 border border-green-100/50">
                                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                                        <CheckCircle2 size={12} className="text-white" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-medium text-slate-700 truncate">{task.title}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            {task.company && (
                                                <span className="text-[10px] text-blue-500">{task.company.name}</span>
                                            )}
                                            {task.completedAt && (
                                                <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                                                    <Clock size={9} />
                                                    {new Date(task.completedAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {task.assignedTo && (
                                        <span className="text-[11px] text-slate-400">{task.assignedTo.name}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Pending Tasks ── */}
                {report.pendingTasks && report.pendingTasks.length > 0 && (
                    <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(0,0,0,0.06)' }}>
                        <h3 className="text-[13px] font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <Clock size={14} className="text-amber-500" /> Tareas Pendientes ({report.pendingTasks.length})
                        </h3>
                        <div className="space-y-2">
                            {report.pendingTasks.map(task => (
                                <div key={task.taskId} className="flex items-center gap-3 p-2.5 rounded-xl bg-amber-50/30 border border-amber-100/50">
                                    <div className="w-5 h-5 rounded-full border-2 border-amber-400 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-medium text-slate-700 truncate">{task.title}</p>
                                        {task.company && (
                                            <span className="text-[10px] text-blue-500">{task.company.name}</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Pipeline Distribution ── */}
                {report.dealsByStatus && Object.keys(report.dealsByStatus).length > 0 && (
                    <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(0,0,0,0.06)' }}>
                        <h3 className="text-[13px] font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <BarChart3 size={14} className="text-sky-500" /> Pipeline Operativo
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {Object.entries(report.dealsByStatus).map(([status, count]) => (
                                <div key={status} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                                    <div className="text-lg font-bold text-slate-700">{count}</div>
                                    <div className="text-[11px] text-slate-500 capitalize">{status.replace(/_/g, ' ')}</div>
                                </div>
                            ))}
                        </div>
                        {report.dealsMovedForward > 0 && (
                            <p className="text-[12px] text-slate-500 mt-3 flex items-center gap-1">
                                <TrendingUp size={12} className="text-green-500" />
                                {report.dealsMovedForward} deal(s) movidos esta semana
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" style={{ animation: 'fadeIn 0.2s ease-out' }}>
                    <div className="bg-white rounded-[24px] p-6 max-w-sm w-full shadow-[0_20px_60px_rgba(0,0,0,0.1)] border border-slate-100" onClick={e => e.stopPropagation()}>
                        <div className="w-14 h-14 bg-red-50 text-red-500 rounded-[16px] flex items-center justify-center mb-5 border border-red-100 shadow-inner">
                            <AlertTriangle size={28} />
                        </div>
                        <h3 className="text-[20px] font-bold text-slate-800 mb-2 tracking-tight">¿Eliminar Informe?</h3>
                        <p className="text-slate-500 text-[14px] mb-6 leading-relaxed">
                            Este informe semanal será eliminado permanentemente. Esta acción no se puede deshacer.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 py-3 px-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-[14px] hover:bg-slate-50 transition-colors text-[14px]"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                disabled={deleting}
                                className="flex-1 py-3 px-4 bg-red-500 text-white font-bold rounded-[14px] hover:bg-red-600 transition-colors shadow-sm shadow-red-500/30 text-[14px] disabled:opacity-50"
                            >
                                {deleting ? 'Eliminando...' : 'Sí, eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.2); border-radius: 10px; }
                .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.4); }
            `}</style>
        </div>
    );
}
