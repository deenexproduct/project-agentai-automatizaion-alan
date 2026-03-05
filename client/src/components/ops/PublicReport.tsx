import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE } from '../../config';
import { useParams } from 'react-router-dom';

// ── Types ─────────────────────────────────────────────────────
interface PublicReportData {
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
    executiveSummary?: string;
    completedTasks: any[];
    pendingTasks: any[];
    goalsSnapshot: any[];
    dailyProductivity: { day: string; dayLabel: string; tasksCompleted: number; tasksCreated: number }[];
    dealsByStatus: Record<string, number>;
    dealsMovedForward: number;
    nextWeekGoals?: { goalId: string; title: string; category: string; deadline: string; progress: number; totalTasks: number; completedTasks: number; company?: { name: string } }[];
    weekComparison?: { tasksCompletedDelta: number; tasksCreatedDelta: number; completionRateDelta: number; scoreDelta: number; previousWeekScore: number };
}

// ── Helpers ───────────────────────────────────────────────────
function getScoreConfig(score: number) {
    if (score >= 75) return { color: '#22c55e', bg: 'rgba(34,197,94,0.08)', label: 'Excelente', emoji: '🔥' };
    if (score >= 50) return { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', label: 'Bueno', emoji: '⚡' };
    if (score >= 25) return { color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', label: 'Moderado', emoji: '📊' };
    return { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', label: 'Bajo', emoji: '📈' };
}

const CATEGORY_EMOJIS: Record<string, string> = {
    despliegue: '🚀', tecnico: '⚙️', capacitacion: '📚',
    revenue: '💰', operativo: '🎯', custom: '📌',
};

// ══════════════════════════════════════════════════════════════
// PUBLIC REPORT PAGE
// ══════════════════════════════════════════════════════════════

export default function PublicReport() {
    const { token } = useParams<{ token: string }>();
    const [report, setReport] = useState<PublicReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!token) { setError(true); setLoading(false); return; }
        axios.get(`${API_BASE}/api/ops/reports/public/${token}`)
            .then(res => setReport(res.data))
            .catch(() => setError(true))
            .finally(() => setLoading(false));
    }, [token]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-fuchsia-50/20 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
                    <p className="text-slate-500 font-medium">Cargando informe...</p>
                </div>
            </div>
        );
    }

    if (error || !report) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-fuchsia-50/20 flex items-center justify-center">
                <div className="text-center max-w-md mx-auto p-8">
                    <div className="w-24 h-24 mx-auto mb-6 bg-white rounded-full flex items-center justify-center shadow-lg border border-slate-100">
                        <span className="text-4xl">📊</span>
                    </div>
                    <h1 className="text-2xl font-black text-slate-800 mb-2">Informe no encontrado</h1>
                    <p className="text-slate-500">Este enlace puede haber expirado o el informe fue eliminado.</p>
                </div>
            </div>
        );
    }

    const scoreCfg = getScoreConfig(report.overallScore);
    const maxDaily = Math.max(...(report.dailyProductivity || []).map(d => d.tasksCompleted), 1);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-violet-50/30 to-fuchsia-50/20">
            {/* ── Premium Header ── */}
            <div style={{ background: 'linear-gradient(135deg, #4c1d95, #7c3aed, #a855f7)' }} className="py-8 px-6">
                <div className="max-w-3xl mx-auto">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-white/60 text-sm font-medium">VoiceCommand</span>
                        <span className="w-1 h-1 rounded-full bg-white/40" />
                        <span className="text-white/60 text-sm">Informe Operativo</span>
                    </div>
                    <h1 className="text-3xl font-black text-white tracking-tight">{report.weekLabel}</h1>
                    <p className="text-white/60 text-sm mt-1">
                        Generado el {new Date(report.generatedAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        {report.generatedBy && <> por <span className="text-white/80 font-medium">{report.generatedBy.name}</span></>}
                    </p>

                    {/* Score Badge */}
                    <div className="mt-5 inline-flex items-center gap-4 px-6 py-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20">
                        <div className="text-center">
                            <div className="text-4xl font-black text-white">{report.overallScore}</div>
                            <div className="text-[10px] text-white/60 font-bold uppercase">Score</div>
                        </div>
                        <div className="w-px h-10 bg-white/20" />
                        <div>
                            <span className="text-2xl">{scoreCfg.emoji}</span>
                            <div className="text-sm text-white/80 font-bold">{scoreCfg.label}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Content ── */}
            <div className="max-w-3xl mx-auto px-6 py-8 space-y-5">

                {/* ── Executive Summary ── */}
                {report.executiveSummary && (
                    <Section>
                        <SectionTitle icon="📋" title="Resumen Ejecutivo" />
                        <p className="text-[15px] text-slate-600 leading-relaxed">{report.executiveSummary}</p>
                    </Section>
                )}

                {/* ── Key Metrics ── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { icon: '✅', label: 'Tareas Completadas', value: report.totalTasksCompleted, color: '#22c55e' },
                        { icon: '📝', label: 'Tareas Creadas', value: report.totalTasksCreated, color: '#3b82f6' },
                        { icon: '📈', label: 'Tasa de Completado', value: `${report.completionRate}%`, color: '#f59e0b' },
                        { icon: '⚡', label: 'Día Más Productivo', value: report.mostProductiveDay || '—', color: '#8b5cf6', sub: report.mostProductiveDayCount > 0 ? `${report.mostProductiveDayCount} tareas` : '' },
                    ].map(card => (
                        <div key={card.label} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                            <div className="text-xl mb-1">{card.icon}</div>
                            <div className="text-xl font-bold text-slate-800">{card.value}</div>
                            <div className="text-[11px] text-slate-500 font-medium">{card.label}</div>
                            {card.sub && <div className="text-[10px] text-slate-400 mt-0.5">{card.sub}</div>}
                        </div>
                    ))}
                </div>

                {/* ── Week Comparison ── */}
                {report.weekComparison && (
                    <Section>
                        <SectionTitle icon="📊" title="Comparación vs. Semana Anterior" />
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[
                                { label: 'Tareas Completadas', delta: report.weekComparison.tasksCompletedDelta },
                                { label: 'Tareas Creadas', delta: report.weekComparison.tasksCreatedDelta },
                                { label: 'Tasa Completado', delta: report.weekComparison.completionRateDelta, suffix: '%' },
                                { label: 'Score', delta: report.weekComparison.scoreDelta },
                            ].map(item => (
                                <div key={item.label} className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-center">
                                    <div className={`text-lg font-bold ${item.delta > 0 ? 'text-green-600' : item.delta < 0 ? 'text-red-500' : 'text-slate-400'}`}>
                                        {item.delta > 0 ? '↑' : item.delta < 0 ? '↓' : '='} {item.delta > 0 ? '+' : ''}{item.delta}{item.suffix || ''}
                                    </div>
                                    <div className="text-[10px] text-slate-500 font-medium mt-0.5">{item.label}</div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-3 text-[11px] text-slate-400 text-center">
                            Score semana anterior: <span className="font-bold">{report.weekComparison.previousWeekScore}/100</span>
                        </div>
                    </Section>
                )}

                {/* ── Daily Productivity ── */}
                {report.dailyProductivity && report.dailyProductivity.length > 0 && (
                    <Section>
                        <SectionTitle icon="📊" title="Productividad Diaria" />
                        <div className="flex items-end gap-3 h-40">
                            {report.dailyProductivity.map(day => {
                                const height = maxDaily > 0 ? (day.tasksCompleted / maxDaily) * 100 : 0;
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
                                    </div>
                                );
                            })}
                        </div>
                    </Section>
                )}

                {/* ── Completed Goals (celebration) ── */}
                {report.goalsSnapshot && report.goalsSnapshot.filter((g: any) => g.status === 'completed').length > 0 && (
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-5 border border-green-100">
                        <SectionTitle icon="🎉" title="Metas Cumplidas Esta Semana" />
                        <div className="space-y-2">
                            {report.goalsSnapshot.filter((g: any) => g.status === 'completed').map((goal: any) => (
                                <div key={goal.goalId} className="flex items-center gap-3 p-3 rounded-xl bg-white/80 border border-green-100">
                                    <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-lg">✅</div>
                                    <div className="flex-1">
                                        <span className="text-[13px] font-bold text-slate-700">{CATEGORY_EMOJIS[goal.category] || '📌'} {goal.title}</span>
                                        {goal.company && <span className="text-[10px] text-blue-500 ml-2">{goal.company.name}</span>}
                                    </div>
                                    <span className="text-[12px] font-bold text-green-600 bg-green-50 px-2.5 py-1 rounded-lg border border-green-100">100%</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Goals Snapshot ── */}
                {report.goalsSnapshot && report.goalsSnapshot.length > 0 && (
                    <Section>
                        <SectionTitle icon="🎯" title="Progreso de Metas" />
                        <div className="space-y-3">
                            {report.goalsSnapshot.map((goal: any) => {
                                const emoji = CATEGORY_EMOJIS[goal.category] || '📌';
                                const totalTasks = goal.totalTasks || 0;
                                const completedTasks = goal.completedTasks || 0;
                                const tasksThisWeek = goal.tasksCompletedThisWeek || 0;
                                const progressPct = totalTasks > 0 ? Math.min(Math.round((completedTasks / totalTasks) * 100), 100) : 0;
                                const isComplete = goal.status === 'completed';
                                return (
                                    <div key={goal.goalId} className="p-3 rounded-xl bg-slate-50/50 border border-slate-100">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm">{emoji}</span>
                                                <span className={`text-[13px] font-bold text-slate-700 ${isComplete ? 'line-through' : ''}`}>{goal.title}</span>
                                                {goal.company && <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-100">{goal.company.name}</span>}
                                            </div>
                                            {isComplete ? (
                                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-100">✅ Cumplida</span>
                                            ) : tasksThisWeek > 0 ? (
                                                <span className="text-[12px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">+{tasksThisWeek} esta semana</span>
                                            ) : (
                                                <span className="text-[12px] text-slate-400">Sin avance</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="flex-1 h-2.5 rounded-full bg-slate-200 overflow-hidden">
                                                <div className="h-full rounded-full" style={{ width: `${progressPct}%`, background: isComplete ? '#22c55e' : '#8b5cf6' }} />
                                            </div>
                                            <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">{completedTasks}/{totalTasks} ({progressPct}%)</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </Section>
                )}

                {/* ── Next Week Goals ── */}
                {report.nextWeekGoals && report.nextWeekGoals.length > 0 && (
                    <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-2xl p-5 border border-blue-100">
                        <SectionTitle icon="📅" title={`Foco Para la Próxima Semana (${report.nextWeekGoals.length})`} />
                        <div className="space-y-2.5">
                            {report.nextWeekGoals.map(goal => {
                                const daysUntil = Math.ceil((new Date(goal.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                                return (
                                    <div key={goal.goalId} className="p-3 rounded-xl bg-white/80 border border-blue-100/50">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[13px] font-bold text-slate-700">{CATEGORY_EMOJIS[goal.category] || '📌'} {goal.title}</span>
                                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${daysUntil <= 0 ? 'bg-red-50 text-red-600 border border-red-100' :
                                                    daysUntil <= 3 ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                                        'bg-blue-50 text-blue-600 border border-blue-100'
                                                }`}>
                                                {daysUntil <= 0 ? '⏰ Vencida' : daysUntil === 1 ? '⏰ Mañana' : `📅 ${daysUntil} días`}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden">
                                                <div className="h-full rounded-full" style={{ width: `${goal.progress}%`, background: '#3b82f6' }} />
                                            </div>
                                            <span className="text-[11px] font-semibold text-slate-500">{goal.completedTasks}/{goal.totalTasks} ({goal.progress}%)</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ── Highlights ── */}
                {report.highlights && report.highlights.length > 0 && (
                    <Section>
                        <SectionTitle icon="⭐" title="Destacados" />
                        <div className="space-y-2">
                            {report.highlights.map((h, i) => (
                                <div key={i} className="flex items-start gap-2 text-[14px] text-slate-600">
                                    <span className="text-violet-400 mt-0.5">•</span>
                                    <span>{h}</span>
                                </div>
                            ))}
                        </div>
                    </Section>
                )}

                {/* ── Completed Tasks ── */}
                {report.completedTasks && report.completedTasks.length > 0 && (
                    <Section>
                        <SectionTitle icon="✅" title={`Tareas Completadas (${report.completedTasks.length})`} />
                        <div className="space-y-2">
                            {report.completedTasks.map((task: any) => (
                                <div key={task.taskId} className="flex items-center gap-3 p-2.5 rounded-xl bg-green-50/30 border border-green-100/50">
                                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-medium text-slate-700 truncate">{task.title}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            {task.company && <span className="text-[10px] text-blue-500">{task.company.name}</span>}
                                            {task.completedAt && <span className="text-[10px] text-slate-400">{new Date(task.completedAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}</span>}
                                        </div>
                                    </div>
                                    {task.assignedTo && <span className="text-[11px] text-slate-400">{task.assignedTo.name}</span>}
                                </div>
                            ))}
                        </div>
                    </Section>
                )}

                {/* ── Pending Tasks ── */}
                {report.pendingTasks && report.pendingTasks.length > 0 && (
                    <Section>
                        <SectionTitle icon="⏳" title={`Tareas Pendientes (${report.pendingTasks.length})`} />
                        <div className="space-y-2">
                            {report.pendingTasks.map((task: any) => {
                                const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
                                return (
                                    <div key={task.taskId} className={`flex items-center gap-3 p-2.5 rounded-xl border ${isOverdue ? 'bg-red-50/50 border-red-200' : 'bg-amber-50/30 border-amber-100/50'}`}>
                                        <div className={`w-5 h-5 rounded-full border-2 shrink-0 ${isOverdue ? 'border-red-400' : 'border-amber-400'}`} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[13px] font-medium text-slate-700 truncate">{task.title}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                {task.company && <span className="text-[10px] text-blue-500">{task.company.name}</span>}
                                                {isOverdue && <span className="text-[10px] font-bold text-red-500">⚠️ Vencida</span>}
                                            </div>
                                        </div>
                                        {task.assignedTo && <span className="text-[11px] text-slate-400">{task.assignedTo.name}</span>}
                                    </div>
                                );
                            })}
                        </div>
                    </Section>
                )}

                {/* ── Productivity by Member ── */}
                {report.completedTasks && report.completedTasks.length > 0 && (() => {
                    const memberMap: Record<string, { name: string; count: number }> = {};
                    report.completedTasks.forEach((t: any) => {
                        const name = t.assignedTo?.name || 'Sin asignar';
                        if (!memberMap[name]) memberMap[name] = { name, count: 0 };
                        memberMap[name].count++;
                    });
                    const sorted = Object.values(memberMap).sort((a, b) => b.count - a.count);
                    if (sorted.length <= 1) return null;
                    const maxCount = sorted[0]?.count || 1;
                    return (
                        <Section>
                            <SectionTitle icon="🏅" title="Productividad por Miembro" />
                            <div className="space-y-2">
                                {sorted.map((member, idx) => (
                                    <div key={member.name} className="flex items-center gap-3">
                                        <span className="text-[14px] w-6 text-center font-bold">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}</span>
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[13px] font-medium text-slate-700">{member.name}</span>
                                                <span className="text-[12px] font-bold text-slate-600">{member.count} tareas</span>
                                            </div>
                                            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                                <div className="h-full rounded-full" style={{
                                                    width: `${(member.count / maxCount) * 100}%`,
                                                    background: idx === 0 ? 'linear-gradient(90deg, #f59e0b, #f97316)' : '#3b82f6'
                                                }} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Section>
                    );
                })()}

                {/* ── Footer ── */}
                <div className="text-center py-8 border-t border-slate-100">
                    <p className="text-[11px] text-slate-400">
                        Generado automáticamente por <span className="font-bold text-violet-500">VoiceCommand</span> — Plataforma de Operaciones
                    </p>
                    <p className="text-[10px] text-slate-300 mt-1">
                        {new Date(report.generatedAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </p>
                </div>
            </div>

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
                body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; margin: 0; }
            `}</style>
        </div>
    );
}

// ── Reusable Components ───────────────────────────────────────

function Section({ children }: { children: React.ReactNode }) {
    return (
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            {children}
        </div>
    );
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
    return (
        <h3 className="text-[13px] font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <span>{icon}</span> {title}
        </h3>
    );
}
