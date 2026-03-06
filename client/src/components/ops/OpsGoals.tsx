import { useState, useEffect, useMemo } from 'react';
import {
    Target, Plus, TrendingUp, CheckCircle, Clock, Loader2, MoreHorizontal,
    Pencil, Trash2, BarChart3, Building2, X, History, ChevronRight, RotateCcw,
    Search, Link2, Unlink, FileText, AlertTriangle, ArrowUpDown, ListChecks, Copy, Archive, CalendarRange, List
} from 'lucide-react';
import {
    getOpsGoals, createOpsGoal, updateOpsGoal, updateOpsGoalProgress,
    completeOpsGoal, reopenOpsGoal, deleteOpsGoal, getOpsGoal, getOpsCompanies,
    getOpsTasks, linkTaskToGoal, duplicateOpsGoal, archiveOpsGoal, manageOpsGoalMilestones
} from '../../services/ops.service';
import OwnerAvatar from '../common/OwnerAvatar';
import PremiumHeader from '../crm/PremiumHeader';
import { getTeamUsers } from '../../services/crm.service';
import SearchableSelect from '../common/SearchableSelect';

// ── Types ─────────────────────────────────────────────────────

interface GoalData {
    _id: string;
    title: string;
    description?: string;
    target: number;
    current: number;
    unit: string;
    category: string;
    customCategory?: string;
    status: 'active' | 'completed' | 'cancelled' | 'archived';
    deadline?: string;
    company?: { _id: string; name: string; logo?: string };
    assignedTo?: { _id: string; name: string; profilePhotoUrl?: string };
    history: HistoryEntry[];
    completedAt?: string;
    progress?: number;
    isOverdue?: boolean;
    taskCount: number;
    completedTaskCount: number;
    milestones?: { _id: string; title: string; completed: boolean; completedAt?: string }[];
    createdAt: string;
}

interface HistoryEntry {
    _id: string;
    date: string;
    previousValue: number;
    newValue: number;
    note?: string;
    completedBy?: { _id: string; name: string; profilePhotoUrl?: string };
}

interface GoalStats {
    totalGoals: number;
    completedGoals: number;
    avgProgress: number;
    weeklyProgress: number;
    totalLinkedTasks: number;
    completedLinkedTasks: number;
}

// ── Constants ─────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
    despliegue: { label: 'Despliegue', color: '#3b82f6', emoji: '🚀' },
    tecnico: { label: 'Técnico', color: '#8b5cf6', emoji: '⚙️' },
    capacitacion: { label: 'Capacitación', color: '#f59e0b', emoji: '📚' },
    revenue: { label: 'Revenue', color: '#22c55e', emoji: '💰' },
    operativo: { label: 'Operativo', color: '#0ea5e9', emoji: '🎯' },
    custom: { label: 'Otro', color: '#64748b', emoji: '📌' },
};

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

export default function OpsGoals() {
    const [goals, setGoals] = useState<GoalData[]>([]);
    const [stats, setStats] = useState<GoalStats>({ totalGoals: 0, completedGoals: 0, avgProgress: 0, weeklyProgress: 0, totalLinkedTasks: 0, completedLinkedTasks: 0 });
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed' | 'archived'>('all');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState<'newest' | 'deadline' | 'progress' | 'name'>('newest');
    const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingGoal, setEditingGoal] = useState<GoalData | null>(null);
    const [detailGoal, setDetailGoal] = useState<GoalData | null>(null);
    const [menuOpen, setMenuOpen] = useState<string | null>(null);
    const [progressModal, setProgressModal] = useState<GoalData | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const menuRef = { current: null as HTMLDivElement | null };

    // Close menu on outside click (replaces the z-40 overlay that was blocking menu clicks)
    useEffect(() => {
        if (!menuOpen) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('[data-goal-menu]')) {
                setMenuOpen(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [menuOpen]);

    const loadGoals = async () => {
        try {
            setLoading(true);
            const params: any = {};
            if (statusFilter !== 'all') params.status = statusFilter;
            const res = await getOpsGoals(params);
            setGoals(res.goals);
            setStats(res.stats);
        } catch (err) {
            console.error('Error loading goals:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadGoals(); }, [statusFilter]);

    const filteredGoals = useMemo(() => {
        let result = goals.filter(g => {
            if (categoryFilter !== 'all' && g.category !== categoryFilter) return false;
            if (!search) return true;
            const q = search.toLowerCase();
            return g.title.toLowerCase().includes(q) || g.company?.name?.toLowerCase().includes(q);
        });
        result.sort((a, b) => {
            switch (sortBy) {
                case 'deadline':
                    if (!a.deadline && !b.deadline) return 0;
                    if (!a.deadline) return 1;
                    if (!b.deadline) return -1;
                    return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
                case 'progress': {
                    const pA = a.taskCount ? (a.completedTaskCount / a.taskCount) : 0;
                    const pB = b.taskCount ? (b.completedTaskCount / b.taskCount) : 0;
                    return pB - pA;
                }
                case 'name':
                    return a.title.localeCompare(b.title);
                default:
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }
        });
        return result;
    }, [goals, categoryFilter, search, sortBy]);

    const handleCreate = () => {
        setEditingGoal(null);
        setIsFormOpen(true);
    };

    const handleEdit = (goal: GoalData) => {
        setEditingGoal(goal);
        setIsFormOpen(true);
        setMenuOpen(null);
    };

    const handleDelete = async (id: string) => {
        setDeleting(true);
        try {
            await deleteOpsGoal(id);
            loadGoals();
            setMenuOpen(null);
            setDeleteConfirm(null);
        } catch (err) {
            console.error('Error deleting goal:', err);
        } finally {
            setDeleting(false);
        }
    };

    const handleComplete = async (id: string) => {
        try {
            await completeOpsGoal(id);
            loadGoals();
            setMenuOpen(null);
        } catch (err) {
            console.error('Error completing goal:', err);
        }
    };

    const handleReopen = async (id: string) => {
        try {
            await reopenOpsGoal(id);
            loadGoals();
            setMenuOpen(null);
        } catch (err) {
            console.error('Error reopening goal:', err);
        }
    };

    const handleDuplicate = async (id: string) => {
        try {
            await duplicateOpsGoal(id);
            loadGoals();
            setMenuOpen(null);
        } catch (err) {
            console.error('Error duplicating goal:', err);
        }
    };

    const handleArchive = async (id: string) => {
        try {
            await archiveOpsGoal(id);
            loadGoals();
            setMenuOpen(null);
            setDeleteConfirm(null);
        } catch (err) {
            console.error('Error archiving goal:', err);
        }
    };

    const handleFormSaved = () => {
        setIsFormOpen(false);
        setEditingGoal(null);
        loadGoals();
    };

    const handleProgressSaved = () => {
        setProgressModal(null);
        loadGoals();
    };

    // Feature #15: deadline notification
    const [dismissedNotifications, setDismissedNotifications] = useState(false);
    const urgentGoals = useMemo(() => {
        if (dismissedNotifications) return [];
        const now = new Date();
        return goals.filter(g => {
            if (g.status !== 'active' || !g.deadline) return false;
            const dl = new Date(g.deadline);
            const diffDays = Math.ceil((dl.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return diffDays <= 0;
        }).map(g => {
            const dl = new Date(g.deadline!);
            const diffDays = Math.ceil((dl.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return { ...g, diffDays };
        });
    }, [goals, dismissedNotifications]);

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] min-h-[500px] relative mt-4 pb-20 md:pb-0">
            {/* Feature #15: Deadline Notification Banner — slim inline */}
            {urgentGoals.length > 0 && (
                <div className="mb-2 shrink-0 rounded-xl px-3 py-1.5 border border-amber-200/80 bg-gradient-to-r from-amber-50/80 to-orange-50/80 flex items-center gap-2" style={{ animation: 'fadeIn 0.3s ease-out' }}>
                    <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                    <span className="text-[11px] font-bold text-amber-700 shrink-0">
                        {urgentGoals.length} {urgentGoals.length === 1 ? 'meta vence hoy' : 'metas vencen hoy'}
                    </span>
                    <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0">
                        {urgentGoals.slice(0, 5).map(g => (
                            <button
                                key={g._id}
                                onClick={() => setDetailGoal(g)}
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-md border transition-all hover:scale-105 whitespace-nowrap ${g.diffDays < 0 ? 'bg-red-50 text-red-600 border-red-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}
                            >
                                {g.title}{g.diffDays < 0 ? ` · ${Math.abs(g.diffDays)}d` : ''}
                            </button>
                        ))}
                    </div>
                    <button onClick={() => setDismissedNotifications(true)} className="text-amber-300 hover:text-amber-500 transition-colors shrink-0 p-0.5">
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4 shrink-0">
                {[
                    { label: 'Total Metas', value: stats.totalGoals, icon: Target, color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.15)' },
                    { label: 'Tareas en Metas', value: `${stats.completedLinkedTasks}/${stats.totalLinkedTasks}`, icon: ListChecks, color: '#0ea5e9', bg: 'rgba(14,165,233,0.1)', border: 'rgba(14,165,233,0.15)' },
                    { label: 'Cumplidas', value: stats.completedGoals, icon: CheckCircle, color: '#22c55e', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.15)' },
                    { label: 'Prog. Total (Acumulado)', value: `${stats.avgProgress}%`, icon: BarChart3, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.15)' },
                    { label: 'Prog. Semanal (Velocidad)', value: `${stats.weeklyProgress}%`, icon: TrendingUp, color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', border: 'rgba(139,92,246,0.15)' },
                ].map(card => (
                    <div
                        key={card.label}
                        className="rounded-2xl p-5 transition-all duration-200 hover:scale-[1.02]"
                        style={{
                            background: 'rgba(255,255,255,0.8)',
                            backdropFilter: 'blur(20px)',
                            border: `1px solid ${card.border}`,
                            boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
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

            {/* Header */}
            <div className="shrink-0 z-10 bg-white/40 backdrop-blur-2xl rounded-[24px] overflow-hidden mb-4 border border-white/60 shadow-[0_8px_32px_rgba(30,27,75,0.05)]">
                <PremiumHeader
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder="Buscar metas..."
                    onAdd={handleCreate}
                    addLabel="Nueva Meta"
                    containerClassName="px-5 py-2.5 !border-none !shadow-none bg-transparent"
                >
                    <div className="flex bg-white/50 backdrop-blur-sm p-1 rounded-[12px] border border-white/60 shadow-inner">
                        {(['all', 'active', 'completed', 'archived'] as const).map(s => (
                            <button
                                key={s}
                                onClick={() => setStatusFilter(s)}
                                className={`px-3 py-1.5 rounded-[8px] text-[12px] font-bold transition-all duration-300 ${statusFilter === s ? 'bg-white shadow-sm text-violet-600 border border-slate-100' : 'text-slate-500 hover:text-slate-700 border border-transparent'}`}
                            >
                                {s === 'all' ? 'Todas' : s === 'active' ? 'Activas' : s === 'completed' ? 'Cumplidas' : '📦 Archivadas'}
                            </button>
                        ))}
                    </div>
                </PremiumHeader>

                {/* Category Filter Pills */}
                <div className="flex gap-1.5 px-5 py-2 border-t border-white/40 overflow-x-auto">
                    <button
                        onClick={() => setCategoryFilter('all')}
                        className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap ${categoryFilter === 'all' ? 'bg-violet-100 text-violet-700 border border-violet-200' : 'bg-white/50 text-slate-500 hover:text-slate-700 border border-transparent'}`}
                    >
                        Todas
                    </button>
                    {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                        <button
                            key={key}
                            onClick={() => setCategoryFilter(key)}
                            className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap flex items-center gap-1 ${categoryFilter === key ? 'bg-violet-100 text-violet-700 border border-violet-200' : 'bg-white/50 text-slate-500 hover:text-slate-700 border border-transparent'}`}
                        >
                            {cfg.emoji} {cfg.label}
                        </button>
                    ))}
                    <div className="ml-auto shrink-0 flex items-center gap-2">
                        <div className="flex items-center bg-white/50 rounded-lg border border-slate-100 p-0.5">
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-violet-600' : 'text-slate-400 hover:text-slate-600'}`}
                                title="Vista lista"
                            >
                                <List size={14} />
                            </button>
                            <button
                                onClick={() => setViewMode('timeline')}
                                className={`p-1.5 rounded-md transition-all ${viewMode === 'timeline' ? 'bg-white shadow-sm text-violet-600' : 'text-slate-400 hover:text-slate-600'}`}
                                title="Vista timeline"
                            >
                                <CalendarRange size={14} />
                            </button>
                        </div>
                        <ArrowUpDown size={12} className="text-slate-400" />
                        <SearchableSelect
                            value={sortBy}
                            onChange={(val: string) => setSortBy(val as any)}
                            options={[
                                { value: 'newest', label: 'Recientes' },
                                { value: 'deadline', label: 'Deadline' },
                                { value: 'progress', label: 'Progreso' },
                                { value: 'name', label: 'Nombre' }
                            ]}
                            placeholder="Ordenar por"
                            className="text-[11px] font-bold text-slate-500 bg-transparent border border-slate-200 outline-none cursor-pointer px-2 py-1 shadow-sm hover:bg-slate-50 rounded-lg h-[26px]"
                            containerClassName="w-[100px]"
                        />
                    </div>
                </div>
            </div>

            {/* Goals List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <Loader2 size={32} className="animate-spin text-blue-500" />
                    </div>
                ) : filteredGoals.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-24 h-24 bg-gradient-to-br from-white/80 to-white/40 backdrop-blur-md rounded-full flex items-center justify-center mb-6 border border-white/60 shadow-[0_8px_32px_rgba(30,27,75,0.05)]">
                            <span className="text-4xl">🎯</span>
                        </div>
                        <h3 className="text-[20px] font-black text-slate-700">Sin metas</h3>
                        <p className="text-slate-500 text-[15px] font-medium max-w-sm mt-2 mb-6">Comienza definiendo tus primeros objetivos operativos.</p>
                        <button onClick={handleCreate} className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(139,92,246,0.4)] transition-all rounded-xl text-white font-bold shadow-[0_4px_16px_rgba(139,92,246,0.3)]">
                            Crear Primera Meta
                        </button>
                    </div>
                ) : viewMode === 'list' ? (
                    <div className="space-y-3">
                        {filteredGoals.map(goal => {
                            const catCfg = CATEGORY_CONFIG[goal.category] || CATEGORY_CONFIG.custom;
                            const totalTasks = goal.taskCount || 0;
                            const completedTasks = goal.completedTaskCount || 0;
                            const progress = totalTasks > 0 ? Math.min(Math.round((completedTasks / totalTasks) * 100), 100) : 0;
                            const isComplete = goal.status === 'completed';
                            const isOverdue = !isComplete && goal.deadline && new Date(goal.deadline) < new Date();

                            // Deadline remaining calculation
                            let deadlineLabel = '';
                            let deadlineUrgency = '';
                            if (goal.deadline && !isComplete) {
                                const now = new Date();
                                const dl = new Date(goal.deadline);
                                const diffDays = Math.ceil((dl.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                                if (diffDays < 0) {
                                    deadlineLabel = `${Math.abs(diffDays)}d vencida`;
                                    deadlineUrgency = 'overdue';
                                } else if (diffDays === 0) {
                                    deadlineLabel = 'Vence hoy';
                                    deadlineUrgency = 'today';
                                } else if (diffDays === 1) {
                                    deadlineLabel = 'Vence mañana';
                                    deadlineUrgency = 'soon';
                                } else if (diffDays <= 7) {
                                    deadlineLabel = `${diffDays} días`;
                                    deadlineUrgency = 'soon';
                                } else {
                                    deadlineLabel = `${diffDays} días`;
                                    deadlineUrgency = 'normal';
                                }
                            }

                            // SVG progress ring
                            const ringSize = 44;
                            const strokeWidth = 4;
                            const radius = (ringSize - strokeWidth) / 2;
                            const circumference = 2 * Math.PI * radius;
                            const strokeDashoffset = circumference - (progress / 100) * circumference;
                            const ringColor = isComplete ? '#22c55e' : isOverdue ? '#ef4444' : catCfg.color;

                            return (
                                <div
                                    key={goal._id}
                                    className={`group rounded-2xl p-5 transition-all duration-200 hover:scale-[1.003] cursor-pointer relative ${isComplete ? 'opacity-70 hover:opacity-100' : ''} ${isOverdue ? 'animate-pulse-subtle' : ''}`}
                                    style={{
                                        background: 'rgba(255,255,255,0.85)',
                                        backdropFilter: 'blur(20px)',
                                        border: isOverdue ? '1.5px solid rgba(239,68,68,0.4)' : '1px solid rgba(0,0,0,0.06)',
                                        boxShadow: isOverdue ? '0 4px 20px rgba(239,68,68,0.1)' : '0 4px 20px rgba(0,0,0,0.04)',
                                    }}
                                    onClick={() => setDetailGoal(goal)}
                                >
                                    {/* Top Row */}
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            {/* Progress Ring */}
                                            <div className="relative shrink-0">
                                                <svg width={ringSize} height={ringSize} className="-rotate-90">
                                                    <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
                                                    <circle cx={ringSize / 2} cy={ringSize / 2} r={radius} fill="none" stroke={ringColor} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className="transition-all duration-700" />
                                                </svg>
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <span className="text-[11px] font-black" style={{ color: ringColor }}>{progress}%</span>
                                                </div>
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <h4 className={`font-bold text-[15px] text-slate-800 truncate group-hover:text-violet-700 transition-colors ${isComplete ? 'line-through' : ''}`}>
                                                    {goal.title}
                                                </h4>
                                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${catCfg.color}15`, color: catCfg.color }}>
                                                        {catCfg.label}
                                                    </span>
                                                    {goal.company && (
                                                        <span className="flex items-center gap-1 text-[11px] text-slate-500">
                                                            <Building2 size={11} />
                                                            {goal.company.name}
                                                        </span>
                                                    )}
                                                    {deadlineLabel && (
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${deadlineUrgency === 'overdue' ? 'bg-red-100 text-red-600 border border-red-200' :
                                                            deadlineUrgency === 'today' ? 'bg-amber-100 text-amber-600 border border-amber-200' :
                                                                deadlineUrgency === 'soon' ? 'bg-yellow-50 text-yellow-600 border border-yellow-100' :
                                                                    'bg-slate-50 text-slate-500 border border-slate-100'
                                                            }`}>
                                                            <Clock size={10} /> {deadlineLabel}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0 ml-3">
                                            {isComplete && (
                                                <span className="text-xs font-bold px-2 py-1 rounded-lg bg-green-50 text-green-600 border border-green-100">✅ CUMPLIDA</span>
                                            )}

                                            {goal.assignedTo && (
                                                <OwnerAvatar name={goal.assignedTo.name} profilePhotoUrl={goal.assignedTo.profilePhotoUrl} size="xs" />
                                            )}

                                            {/* Actions */}
                                            <div className="relative" data-goal-menu onClick={e => e.stopPropagation()}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === goal._id ? null : goal._id); }}
                                                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
                                                >
                                                    <MoreHorizontal size={16} />
                                                </button>
                                                {menuOpen === goal._id && (
                                                    <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-[9999] w-44" style={{ position: 'absolute' }}>
                                                        <button onClick={(e) => { e.stopPropagation(); setMenuOpen(null); setProgressModal(goal); }} className="w-full text-left px-3 py-2 text-[13px] font-medium hover:bg-slate-50 flex items-center gap-2">
                                                            <FileText size={14} className="text-blue-500" /> Agregar Observación
                                                        </button>
                                                        {goal.status === 'active' ? (
                                                            <button onClick={(e) => { e.stopPropagation(); handleComplete(goal._id); }} className="w-full text-left px-3 py-2 text-[13px] font-medium hover:bg-slate-50 flex items-center gap-2">
                                                                <CheckCircle size={14} className="text-green-500" /> Marcar Cumplida
                                                            </button>
                                                        ) : (
                                                            <button onClick={(e) => { e.stopPropagation(); handleReopen(goal._id); }} className="w-full text-left px-3 py-2 text-[13px] font-medium hover:bg-slate-50 flex items-center gap-2">
                                                                <RotateCcw size={14} className="text-amber-500" /> Reabrir
                                                            </button>
                                                        )}
                                                        <button onClick={(e) => { e.stopPropagation(); handleEdit(goal); }} className="w-full text-left px-3 py-2 text-[13px] font-medium hover:bg-slate-50 flex items-center gap-2">
                                                            <Pencil size={14} className="text-slate-500" /> Editar
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); handleDuplicate(goal._id); }} className="w-full text-left px-3 py-2 text-[13px] font-medium hover:bg-slate-50 flex items-center gap-2">
                                                            <Copy size={14} className="text-slate-500" /> Duplicar
                                                        </button>
                                                        <div className="border-t border-slate-100 my-1" />
                                                        <button onClick={(e) => { e.stopPropagation(); setMenuOpen(null); handleArchive(goal._id); }} className="w-full text-left px-3 py-2 text-[13px] font-medium hover:bg-amber-50 text-amber-600 flex items-center gap-2">
                                                            <Archive size={14} /> Archivar
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); setMenuOpen(null); setDeleteConfirm(goal._id); }} className="w-full text-left px-3 py-2 text-[13px] font-medium hover:bg-red-50 text-red-600 flex items-center gap-2">
                                                            <Trash2 size={14} /> Eliminar
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1">
                                            <div className="h-2.5 rounded-full overflow-hidden bg-slate-100">
                                                <div
                                                    className="h-full rounded-full transition-all duration-500"
                                                    style={{ width: `${progress}%`, background: isComplete ? '#22c55e' : isOverdue ? '#ef4444' : catCfg.color }}
                                                />
                                            </div>
                                        </div>
                                        <div className="text-[12px] font-semibold text-gray-600 whitespace-nowrap">
                                            {completedTasks}/{totalTasks} <span className="text-gray-400 font-normal">tareas</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    /* ── TIMELINE VIEW ── */
                    (() => {
                        const now = new Date();
                        const goalsWithDates = filteredGoals.map(g => ({
                            ...g,
                            start: new Date(g.createdAt),
                            end: g.deadline ? new Date(g.deadline) : new Date(new Date(g.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000),
                        }));

                        const minDate = new Date(Math.min(...goalsWithDates.map(g => g.start.getTime()), now.getTime()));
                        const maxDate = new Date(Math.max(...goalsWithDates.map(g => g.end.getTime()), now.getTime() + 7 * 24 * 60 * 60 * 1000));
                        minDate.setDate(minDate.getDate() - 3);
                        maxDate.setDate(maxDate.getDate() + 3);
                        const totalSpan = maxDate.getTime() - minDate.getTime();
                        const todayPct = ((now.getTime() - minDate.getTime()) / totalSpan) * 100;

                        // Generate month labels
                        const monthLabels: { label: string; left: number }[] = [];
                        const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
                        while (cursor <= maxDate) {
                            const pct = ((cursor.getTime() - minDate.getTime()) / totalSpan) * 100;
                            if (pct >= 0 && pct <= 100) {
                                monthLabels.push({ label: cursor.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }), left: pct });
                            }
                            cursor.setMonth(cursor.getMonth() + 1);
                        }

                        return (
                            <div className="space-y-1">
                                {/* Month headers */}
                                <div className="relative h-6 mb-2">
                                    {monthLabels.map((m, i) => (
                                        <span key={i} className="absolute text-[10px] font-bold text-slate-400 uppercase" style={{ left: `${m.left}%` }}>
                                            {m.label}
                                        </span>
                                    ))}
                                </div>

                                {/* Timeline rows */}
                                <div className="relative">
                                    {/* Today indicator */}
                                    <div className="absolute top-0 bottom-0 w-px bg-violet-400 z-10" style={{ left: `${todayPct}%` }}>
                                        <div className="absolute -top-5 -translate-x-1/2 text-[9px] font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full border border-violet-200 whitespace-nowrap">
                                            Hoy
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        {goalsWithDates.map(goal => {
                                            const catCfg = CATEGORY_CONFIG[goal.category] || CATEGORY_CONFIG.custom;
                                            const totalTasks = goal.taskCount || 0;
                                            const completedTasks = goal.completedTaskCount || 0;
                                            const progress = totalTasks > 0 ? Math.min(Math.round((completedTasks / totalTasks) * 100), 100) : 0;
                                            const isComplete = goal.status === 'completed';
                                            const isOverdue = !isComplete && goal.deadline && new Date(goal.deadline) < now;

                                            const leftPct = Math.max(((goal.start.getTime() - minDate.getTime()) / totalSpan) * 100, 0);
                                            const widthPct = Math.max(((goal.end.getTime() - goal.start.getTime()) / totalSpan) * 100, 3);
                                            const barColor = isComplete ? '#22c55e' : isOverdue ? '#ef4444' : catCfg.color;

                                            return (
                                                <div key={goal._id} className="flex items-center gap-3 group cursor-pointer" onClick={() => setDetailGoal(goal)}>
                                                    {/* Label */}
                                                    <div className="w-[140px] shrink-0 text-right pr-2">
                                                        <p className={`text-[12px] font-bold text-slate-700 truncate group-hover:text-violet-600 transition-colors ${isComplete ? 'line-through' : ''}`}>
                                                            {goal.title}
                                                        </p>
                                                        <p className="text-[10px] text-slate-400">{catCfg.label}</p>
                                                    </div>

                                                    {/* Bar area */}
                                                    <div className="flex-1 relative h-10 bg-slate-50/50 rounded-lg border border-slate-100/50">
                                                        {/* Background bar */}
                                                        <div
                                                            className="absolute top-1 bottom-1 rounded-md transition-all group-hover:brightness-110"
                                                            style={{
                                                                left: `${leftPct}%`,
                                                                width: `${widthPct}%`,
                                                                background: `${barColor}20`,
                                                                border: `1px solid ${barColor}30`,
                                                            }}
                                                        >
                                                            {/* Progress fill */}
                                                            <div
                                                                className="absolute inset-y-0 left-0 rounded-md transition-all"
                                                                style={{
                                                                    width: `${progress}%`,
                                                                    background: `${barColor}50`,
                                                                }}
                                                            />
                                                            {/* Text inside bar */}
                                                            <div className="absolute inset-0 flex items-center px-2 overflow-hidden">
                                                                <span className="text-[10px] font-bold whitespace-nowrap" style={{ color: barColor }}>
                                                                    {progress}% · {completedTasks}/{totalTasks}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })()
                )}
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.2); border-radius: 10px; }
                .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.4); }
                @keyframes pulse-subtle {
                    0%, 100% { box-shadow: 0 4px 20px rgba(239,68,68,0.1); }
                    50% { box-shadow: 0 4px 20px rgba(239,68,68,0.25); }
                }
                .animate-pulse-subtle { animation: pulse-subtle 2s ease-in-out infinite; }
            `}</style>

            {/* Goal Form Drawer */}
            {isFormOpen && (
                <GoalFormDrawer
                    goal={editingGoal}
                    onClose={() => { setIsFormOpen(false); setEditingGoal(null); }}
                    onSaved={handleFormSaved}
                />
            )}

            {/* Progress Update Modal */}
            {progressModal && (
                <ProgressModal
                    goal={progressModal}
                    onClose={() => setProgressModal(null)}
                    onSaved={handleProgressSaved}
                />
            )}

            {/* Detail Drawer */}
            {detailGoal && (
                <GoalDetailDrawer
                    goalId={detailGoal._id}
                    onClose={() => setDetailGoal(null)}
                    onUpdated={loadGoals}
                />
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                    <div className="bg-white rounded-[24px] p-6 max-w-sm w-full shadow-[0_20px_60px_rgba(0,0,0,0.1)] border border-slate-100" onClick={e => e.stopPropagation()}>
                        <div className="w-14 h-14 bg-red-50 text-red-500 rounded-[16px] flex items-center justify-center mb-5 border border-red-100 shadow-inner">
                            <AlertTriangle size={28} />
                        </div>
                        <h3 className="text-[20px] font-bold text-slate-800 mb-2 tracking-tight">¿Eliminar esta meta?</h3>
                        <p className="text-slate-500 text-[14px] mb-6 leading-relaxed">
                            Se eliminarán también todas las observaciones. Las tareas vinculadas serán desvinculadas automáticamente.
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
        </div>
    );
}


// ══════════════════════════════════════════════════════════════
// GOAL FORM DRAWER
// ══════════════════════════════════════════════════════════════

function GoalFormDrawer({ goal, onClose, onSaved }: { goal: GoalData | null; onClose: () => void; onSaved: () => void }) {
    const [title, setTitle] = useState(goal?.title || '');
    const [description, setDescription] = useState(goal?.description || '');
    const [target, setTarget] = useState(goal?.target?.toString() || '');
    const [unit, setUnit] = useState(goal?.unit || 'unidades');
    const [category, setCategory] = useState(goal?.category || 'operativo');
    const [deadline, setDeadline] = useState(goal?.deadline ? new Date(goal.deadline).toISOString().split('T')[0] : '');
    const [companyId, setCompanyId] = useState(goal?.company?._id?.toString() || '');
    const [assignedTo, setAssignedTo] = useState(goal?.assignedTo?._id?.toString() || '');
    const [companies, setCompanies] = useState<any[]>([]);
    const [teamUsers, setTeamUsers] = useState<any[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getOpsCompanies().then(setCompanies).catch(() => { });
        getTeamUsers().then(setTeamUsers).catch(() => { });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !target) return;
        setSaving(true);
        try {
            const data: any = {
                title: title.trim(),
                description: description.trim() || undefined,
                target: parseInt(target),
                unit,
                category,
                deadline: deadline || undefined,
                company: companyId || null,
                assignedTo: assignedTo || undefined,
            };
            if (goal?._id) {
                await updateOpsGoal(goal._id, data);
            } else {
                await createOpsGoal(data);
            }
            onSaved();
        } catch (err) {
            console.error('Error saving goal:', err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                    <h2 className="text-lg font-bold text-slate-800">{goal ? 'Editar Meta' : 'Nueva Meta'}</h2>
                    <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><X size={18} /></button>
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div>
                        <label className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Título *</label>
                        <input value={title} onChange={e => setTitle(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-[14px] focus:outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100" placeholder="Ej: Locales activados" required />
                    </div>
                    <div>
                        <label className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Descripción</label>
                        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-[14px] focus:outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 resize-none" placeholder="Detalle opcional..." />
                    </div>
                    <div>
                        <label className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Categoría</label>
                        <div className="grid grid-cols-3 gap-2">
                            {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setCategory(key)}
                                    className={`px-3 py-2 rounded-xl text-[12px] font-bold border transition-all ${category === key ? 'border-violet-300 bg-violet-50 text-violet-700 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                                >
                                    {cfg.emoji} {cfg.label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Fecha límite</label>
                        <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-[14px] focus:outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100" />
                    </div>
                    <div>
                        <label className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Empresa (opcional)</label>
                        <SearchableSelect
                            value={companyId}
                            onChange={(val: string) => setCompanyId(val)}
                            options={[
                                { value: '', label: 'Sin empresa' },
                                ...companies.map((c: any) => ({ value: c._id, label: c.name }))
                            ]}
                            placeholder="Sin empresa"
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-[14px] focus:outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 bg-white"
                        />
                    </div>
                    <div>
                        <label className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Responsable (opcional)</label>
                        <SearchableSelect
                            value={assignedTo}
                            onChange={(val: string) => setAssignedTo(val)}
                            options={[
                                { value: '', label: 'Yo (por defecto)' },
                                ...teamUsers.map((u: any) => ({ value: u._id, label: u.name }))
                            ]}
                            placeholder="Yo (por defecto)"
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-[14px] focus:outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 bg-white"
                        />
                    </div>
                </form>

                <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0">
                    <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-[14px] hover:bg-slate-50 transition-colors">Cancelar</button>
                    <button onClick={handleSubmit as any} disabled={saving || !title.trim()} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold text-[14px] hover:-translate-y-0.5 hover:shadow-lg transition-all disabled:opacity-50 disabled:translate-y-0">
                        {saving ? 'Guardando...' : goal ? 'Guardar' : 'Crear Meta'}
                    </button>
                </div>
            </div >
        </div >
    );
}


// ══════════════════════════════════════════════════════════════
// GOAL NOTE MODAL (Agregar Observación)
// ══════════════════════════════════════════════════════════════

function ProgressModal({ goal, onClose, onSaved }: { goal: GoalData; onClose: () => void; onSaved: () => void }) {
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);

    const totalTasks = goal.taskCount || 0;
    const completedTasks = goal.completedTaskCount || 0;
    const progress = totalTasks > 0 ? Math.min(Math.round((completedTasks / totalTasks) * 100), 100) : 0;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!note.trim()) return;
        setSaving(true);
        try {
            await updateOpsGoalProgress(goal._id, goal.current, note.trim());
            onSaved();
        } catch (err) {
            console.error('Error saving note:', err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800">Agregar Observación</h3>
                    <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><X size={18} /></button>
                </div>
                <p className="text-[13px] text-slate-500 mb-2">{goal.title}</p>

                {/* Current progress summary */}
                <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[12px] font-bold text-slate-500">Progreso actual</span>
                        <span className="text-[13px] font-bold text-violet-600">{completedTasks}/{totalTasks} tareas ({progress}%)</span>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden bg-slate-200">
                        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: progress >= 100 ? '#22c55e' : '#8b5cf6' }} />
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Observación *</label>
                        <textarea
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            rows={3}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-[14px] focus:outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 resize-none"
                            placeholder="Ej: Se avanzó con la capacitación del equipo de ventas..."
                            autoFocus
                        />
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-[14px] hover:bg-slate-50">Cancelar</button>
                        <button type="submit" disabled={saving || !note.trim()} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold text-[14px] hover:-translate-y-0.5 hover:shadow-lg transition-all disabled:opacity-50">
                            {saving ? 'Guardando...' : 'Guardar Nota'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}


// ══════════════════════════════════════════════════════════════
// GOAL DETAIL DRAWER
// ══════════════════════════════════════════════════════════════

function GoalDetailDrawer({ goalId, onClose, onUpdated }: { goalId: string; onClose: () => void; onUpdated: () => void }) {
    const [goal, setGoal] = useState<GoalData | null>(null);
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showTaskSearch, setShowTaskSearch] = useState(false);
    const [taskSearch, setTaskSearch] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);

    useEffect(() => {
        loadDetail();
    }, [goalId]);

    const loadDetail = async () => {
        try {
            setLoading(true);
            const res = await getOpsGoal(goalId);
            setGoal(res.goal);
            setTasks(res.tasks || []);
        } catch (err) {
            console.error('Error loading goal detail:', err);
        } finally {
            setLoading(false);
        }
    };

    // Search unlinked tasks
    useEffect(() => {
        if (!showTaskSearch) return;
        const searchTasks = async () => {
            try {
                setSearchLoading(true);
                const res = await getOpsTasks({ limit: 50, search: taskSearch || undefined });
                const allTasks = res.tasks || [];
                // Filter out already linked tasks
                const linkedIds = new Set(tasks.map((t: any) => t._id));
                const available = allTasks.filter((t: any) => !linkedIds.has(t._id) && (!t.goal || t.goal === goalId));
                setSearchResults(available.slice(0, 10));
            } catch (err) {
                console.error('Error searching tasks:', err);
            } finally {
                setSearchLoading(false);
            }
        };
        const tid = setTimeout(searchTasks, 300);
        return () => clearTimeout(tid);
    }, [taskSearch, showTaskSearch, tasks, goalId]);

    const handleLinkTask = async (taskId: string) => {
        try {
            await linkTaskToGoal(taskId, goalId);
            loadDetail();
            onUpdated();
            setTaskSearch('');
        } catch (err) {
            console.error('Error linking task:', err);
        }
    };

    const handleUnlinkTask = async (taskId: string) => {
        try {
            await linkTaskToGoal(taskId, null);
            loadDetail();
            onUpdated();
        } catch (err) {
            console.error('Error unlinking task:', err);
        }
    };

    if (!goal && loading) return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-white shadow-2xl flex items-center justify-center">
                <Loader2 size={32} className="animate-spin text-violet-500" />
            </div>
        </div>
    );

    if (!goal) return null;

    const catCfg = CATEGORY_CONFIG[goal.category] || CATEGORY_CONFIG.custom;
    const completedTasks = tasks.filter((t: any) => t.status === 'completed').length;
    const totalTasks = tasks.length;
    const progress = totalTasks > 0 ? Math.min(Math.round((completedTasks / totalTasks) * 100), 100) : 0;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: `${catCfg.color}15` }}>
                            {catCfg.emoji}
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">{goal.title}</h2>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${catCfg.color}15`, color: catCfg.color }}>{catCfg.label}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400"><X size={18} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Progress Card */}
                    <div className="rounded-2xl p-5" style={{ background: `${catCfg.color}08`, border: `1px solid ${catCfg.color}20` }}>
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-bold text-slate-700">Progreso</span>
                            <span className="text-2xl font-black" style={{ color: catCfg.color }}>{progress}%</span>
                        </div>
                        <div className="h-4 rounded-full overflow-hidden bg-white/60 mb-2">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: catCfg.color }} />
                        </div>
                        <div className="flex items-center justify-between text-[13px]">
                            <span className="font-semibold text-slate-600">{completedTasks} de {totalTasks} tareas</span>
                            {goal.deadline && (
                                <span className="text-slate-400 flex items-center gap-1">
                                    <Clock size={12} />
                                    {new Date(goal.deadline).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Feature #17: Sparkline Progress Chart */}
                    {goal.history && goal.history.length >= 2 && (() => {
                        const sortedHistory = [...goal.history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                        const values = sortedHistory.map(h => h.newValue);
                        const maxVal = Math.max(...values, goal.target || 1);
                        const w = 400;
                        const h = 60;
                        const padding = 4;
                        const points = values.map((v, i) => {
                            const x = padding + (i / (values.length - 1)) * (w - padding * 2);
                            const y = h - padding - ((v / maxVal) * (h - padding * 2));
                            return `${x},${y}`;
                        });
                        const pathD = points.join(' ');
                        const areaD = `${padding},${h - padding} ${pathD} ${w - padding},${h - padding}`;
                        return (
                            <div className="rounded-2xl p-4 bg-slate-50/50 border border-slate-100">
                                <h4 className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                    <TrendingUp size={13} /> Evolución del progreso
                                </h4>
                                <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-16" preserveAspectRatio="none">
                                    <defs>
                                        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={catCfg.color} stopOpacity="0.3" />
                                            <stop offset="100%" stopColor={catCfg.color} stopOpacity="0.02" />
                                        </linearGradient>
                                    </defs>
                                    <polygon points={areaD} fill="url(#sparkGrad)" />
                                    <polyline points={pathD} fill="none" stroke={catCfg.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                    {values.map((v, i) => {
                                        const x = padding + (i / (values.length - 1)) * (w - padding * 2);
                                        const y = h - padding - ((v / maxVal) * (h - padding * 2));
                                        return <circle key={i} cx={x} cy={y} r="3" fill="white" stroke={catCfg.color} strokeWidth="2" />;
                                    })}
                                </svg>
                                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                                    <span>{new Date(sortedHistory[0].date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}</span>
                                    <span>{new Date(sortedHistory[sortedHistory.length - 1].date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}</span>
                                </div>
                            </div>
                        );
                    })()}

                    {goal.description && (
                        <div>
                            <h4 className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">Descripción</h4>
                            <p className="text-[14px] text-slate-600 leading-relaxed">{goal.description}</p>
                        </div>
                    )}

                    {goal.company && (
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                            <Building2 size={16} className="text-slate-400" />
                            <span className="text-[14px] font-medium text-slate-700">{goal.company.name}</span>
                        </div>
                    )}

                    {/* Feature #13: Milestones / Sub-metas */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-[12px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                <ChevronRight size={13} /> Sub-metas ({goal.milestones?.filter(m => m.completed).length || 0}/{goal.milestones?.length || 0})
                            </h4>
                        </div>
                        {goal.milestones && goal.milestones.length > 0 && (
                            <div className="space-y-1.5 mb-3">
                                {goal.milestones.map(ms => (
                                    <div key={ms._id} className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all ${ms.completed ? 'bg-green-50/50 border-green-100' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    await manageOpsGoalMilestones(goalId, 'toggle', { milestoneId: ms._id });
                                                    loadDetail();
                                                    onUpdated();
                                                } catch (err) { console.error(err); }
                                            }}
                                            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${ms.completed ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 hover:border-violet-400'}`}
                                        >
                                            {ms.completed && <CheckCircle size={12} />}
                                        </button>
                                        <span className={`text-[13px] flex-1 ${ms.completed ? 'line-through text-slate-400' : 'text-slate-700 font-medium'}`}>
                                            {ms.title}
                                        </span>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    await manageOpsGoalMilestones(goalId, 'remove', { milestoneId: ms._id });
                                                    loadDetail();
                                                    onUpdated();
                                                } catch (err) { console.error(err); }
                                            }}
                                            className="w-5 h-5 rounded-md flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                                        >
                                            <X size={11} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <form
                            onSubmit={async (e) => {
                                e.preventDefault();
                                const input = (e.target as any).milestone;
                                const title = input.value.trim();
                                if (!title) return;
                                try {
                                    await manageOpsGoalMilestones(goalId, 'add', { title });
                                    input.value = '';
                                    loadDetail();
                                    onUpdated();
                                } catch (err) { console.error(err); }
                            }}
                            className="flex gap-2"
                        >
                            <input
                                name="milestone"
                                placeholder="Agregar sub-meta..."
                                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-[13px] focus:outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                            />
                            <button type="submit" className="px-3 py-2 rounded-xl bg-violet-50 text-violet-600 border border-violet-100 text-[12px] font-bold hover:bg-violet-100 transition-colors">
                                <Plus size={14} />
                            </button>
                        </form>
                    </div>

                    {/* Tasks */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h4 className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">Tareas vinculadas ({tasks.length})</h4>
                            <button
                                onClick={() => setShowTaskSearch(!showTaskSearch)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-violet-50 text-violet-600 border border-violet-100 hover:bg-violet-100 transition-colors"
                            >
                                {showTaskSearch ? <X size={12} /> : <Link2 size={12} />}
                                {showTaskSearch ? 'Cerrar' : 'Vincular tarea'}
                            </button>
                        </div>

                        {/* Task Search */}
                        {showTaskSearch && (
                            <div className="mb-3 space-y-2">
                                <div className="relative">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Buscar tareas para vincular..."
                                        value={taskSearch}
                                        onChange={(e) => setTaskSearch(e.target.value)}
                                        className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] font-medium focus:outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                                        autoFocus
                                    />
                                </div>
                                <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-slate-100 bg-slate-50/50 p-1">
                                    {searchLoading ? (
                                        <div className="flex items-center justify-center py-4">
                                            <Loader2 size={16} className="animate-spin text-violet-400" />
                                        </div>
                                    ) : searchResults.length === 0 ? (
                                        <p className="text-center text-[12px] text-slate-400 py-4">No hay tareas disponibles</p>
                                    ) : (
                                        searchResults.map((t: any) => (
                                            <button
                                                key={t._id}
                                                onClick={() => handleLinkTask(t._id)}
                                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left hover:bg-violet-50 transition-colors group"
                                            >
                                                <Link2 size={12} className="text-slate-300 group-hover:text-violet-500 transition-colors shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[12px] font-medium text-slate-700 truncate">{t.title}</p>
                                                    {t.company?.name && (
                                                        <p className="text-[10px] text-slate-400">{t.company.name}</p>
                                                    )}
                                                </div>
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.status === 'completed' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                                                    {t.status === 'completed' ? '✓' : '○'}
                                                </span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {tasks.length === 0 ? (
                            <div className="text-center py-8 text-slate-400 text-[13px]">
                                No hay tareas vinculadas a esta meta
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {tasks.map((task: any) => {
                                    const isCompleted = task.status === 'completed';
                                    return (
                                        <div key={task._id} className={`flex items-center gap-3 p-3 rounded-xl border ${isCompleted ? 'bg-green-50/50 border-green-100' : 'bg-white border-slate-100'}`}>
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isCompleted ? 'border-green-500 bg-green-500' : 'border-slate-300'}`}>
                                                {isCompleted && <CheckCircle size={12} className="text-white" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-[13px] font-medium truncate ${isCompleted ? 'line-through text-slate-400' : 'text-slate-700'}`}>{task.title}</p>
                                                {task.dueDate && (
                                                    <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                                                        <Clock size={10} />
                                                        {new Date(task.dueDate).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })}
                                                    </p>
                                                )}
                                            </div>
                                            {task.assignedTo && (
                                                <OwnerAvatar name={task.assignedTo.name} profilePhotoUrl={task.assignedTo.profilePhotoUrl} size="xs" />
                                            )}
                                            <button
                                                onClick={() => handleUnlinkTask(task._id)}
                                                className="w-6 h-6 rounded-md flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0"
                                                title="Desvincular tarea"
                                            >
                                                <Unlink size={12} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* History */}
                    <div>
                        <h4 className="text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                            <History size={13} /> Historial de progreso ({goal.history?.length || 0})
                        </h4>
                        {(!goal.history || goal.history.length === 0) ? (
                            <div className="text-center py-6 text-slate-400 text-[13px]">Sin actualizaciones aún</div>
                        ) : (
                            <div className="space-y-2">
                                {[...goal.history].reverse().map((entry, idx) => {
                                    const delta = entry.newValue - entry.previousValue;
                                    const isPositive = delta > 0;
                                    return (
                                        <div key={entry._id || idx} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50/50 border border-slate-100">
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-bold shrink-0 ${isPositive ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                                                {isPositive ? '+' : ''}{delta}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[13px] text-slate-700 font-medium">
                                                    {entry.previousValue} → {entry.newValue} {goal.unit}
                                                </p>
                                                {entry.note && <p className="text-[12px] text-slate-500 mt-0.5">{entry.note}</p>}
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[11px] text-slate-400">
                                                        {new Date(entry.date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    {entry.completedBy && (
                                                        <span className="text-[11px] text-slate-400">por {entry.completedBy.name}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
