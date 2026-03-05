import { useState, useEffect } from 'react';
import {
    Loader2, Phone, MessageCircle, Mail, Users, FileText, CheckCircle2,
    Activity, Briefcase, Building2, CheckSquare, Target, TrendingUp, ArrowRight, Search,
    Columns3, Star
} from 'lucide-react';
import { getOpsActivities } from '../../services/ops.service';
import PremiumHeader from '../crm/PremiumHeader';

// ── Types ─────────────────────────────────────────────────────

interface ActivityItem {
    _id: string;
    type: string;
    description: string;
    createdAt: string;
    contact?: { _id: string; fullName: string; profilePhotoUrl?: string };
    company?: { _id: string; name: string; logo?: string };
    createdBy?: { _id: string; name: string; profilePhotoUrl?: string };
    goal?: { _id: string; title: string };
    source: string;
}

// ── Type Filters ──────────────────────────────────────────────

const TYPE_FILTERS = [
    { key: 'all', label: 'Todos' },
    { key: 'task_created', label: 'Tareas' },
    { key: 'task_completed', label: 'Completadas' },
    { key: 'deal_status_change', label: 'Pipeline' },
    { key: 'goal_created', label: 'Metas' },
    { key: 'goal_progress', label: 'Progreso' },
    { key: 'goal_completed', label: 'Metas Cumplidas' },
    { key: 'call', label: 'Llamadas' },
    { key: 'whatsapp', label: 'WhatsApp' },
];

// ── Icon Config ───────────────────────────────────────────────

function getIconConfig(type: string) {
    switch (type) {
        case 'call': return {
            icon: <Phone size={14} className="text-white" />,
            bg: 'bg-emerald-500',
            badge: 'text-emerald-700 bg-emerald-100',
            label: 'Llamada'
        };
        case 'whatsapp': return {
            icon: <MessageCircle size={14} className="text-white" />,
            bg: 'bg-green-500',
            badge: 'text-green-700 bg-green-100',
            label: 'WhatsApp'
        };
        case 'email': return {
            icon: <Mail size={14} className="text-white" />,
            bg: 'bg-amber-500',
            badge: 'text-amber-700 bg-amber-100',
            label: 'Email'
        };
        case 'meeting': return {
            icon: <Users size={14} className="text-white" />,
            bg: 'bg-indigo-500',
            badge: 'text-indigo-700 bg-indigo-100',
            label: 'Reunión'
        };
        case 'note': return {
            icon: <FileText size={14} className="text-slate-600" />,
            bg: 'bg-slate-200',
            badge: 'text-slate-600 bg-slate-200',
            label: 'Nota'
        };
        case 'task_completed': return {
            icon: <CheckCircle2 size={14} className="text-white" />,
            bg: 'bg-violet-500',
            badge: 'text-violet-700 bg-violet-100',
            label: 'Tarea Terminada'
        };
        case 'task_created': return {
            icon: <CheckSquare size={14} className="text-white" />,
            bg: 'bg-amber-500',
            badge: 'text-amber-700 bg-amber-100',
            label: 'Nueva Tarea'
        };
        case 'deal_status_change': return {
            icon: <Columns3 size={14} className="text-white" />,
            bg: 'bg-blue-600',
            badge: 'text-blue-700 bg-blue-100',
            label: 'Pipeline'
        };
        case 'goal_created': return {
            icon: <Target size={14} className="text-white" />,
            bg: 'bg-fuchsia-500',
            badge: 'text-fuchsia-700 bg-fuchsia-100',
            label: 'Nueva Meta'
        };
        case 'goal_progress': return {
            icon: <TrendingUp size={14} className="text-white" />,
            bg: 'bg-sky-500',
            badge: 'text-sky-700 bg-sky-100',
            label: 'Progreso'
        };
        case 'goal_completed': return {
            icon: <Star size={14} className="text-white" />,
            bg: 'bg-green-600',
            badge: 'text-green-700 bg-green-100',
            label: 'Meta Cumplida'
        };
        case 'referral': return {
            icon: <ArrowRight size={14} className="text-white" />,
            bg: 'bg-orange-500',
            badge: 'text-orange-700 bg-orange-100',
            label: 'Referencia'
        };
        default: return {
            icon: <Activity size={14} className="text-slate-600" />,
            bg: 'bg-slate-300',
            badge: 'text-slate-700 bg-slate-200',
            label: 'Actividad'
        };
    }
}

// ── Time Ago ──────────────────────────────────────────────────

function formatTimeAgo(dateInput: string | Date): string {
    const date = new Date(dateInput);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " años";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " meses";
    interval = seconds / 86400;
    if (interval >= 1) {
        if (Math.floor(interval) === 1) return "Ayer";
        return Math.floor(interval) + " días";
    }
    interval = seconds / 3600;
    if (interval >= 1) return Math.floor(interval) + " h";
    interval = seconds / 60;
    if (interval >= 1) return Math.floor(interval) + " min";
    return "Ahora";
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

export default function OpsActivity() {
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    const loadActivities = async () => {
        try {
            setLoading(true);
            const params: any = { page, limit: 50 };
            if (typeFilter !== 'all') params.type = typeFilter;
            const res = await getOpsActivities(params);
            setActivities(res.activities);
            setTotalPages(res.pages);
            setTotal(res.total);
        } catch (err) {
            console.error('Error loading ops activities:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadActivities(); }, [typeFilter, page]);

    const filteredActivities = activities.filter(a => {
        if (!search) return true;
        const q = search.toLowerCase();
        return a.description.toLowerCase().includes(q) ||
            a.contact?.fullName?.toLowerCase().includes(q) ||
            a.company?.name?.toLowerCase().includes(q);
    });

    // Group by date
    const grouped: Record<string, ActivityItem[]> = {};
    for (const a of filteredActivities) {
        const d = new Date(a.createdAt);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        let key: string;
        if (d.toDateString() === today.toDateString()) {
            key = 'Hoy';
        } else if (d.toDateString() === yesterday.toDateString()) {
            key = 'Ayer';
        } else {
            key = d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
            key = key.charAt(0).toUpperCase() + key.slice(1);
        }
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(a);
    }

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] min-h-[500px] relative mt-4 pb-20 md:pb-0">
            {/* Header */}
            <div className="shrink-0 z-10 bg-white/40 backdrop-blur-2xl rounded-[24px] overflow-hidden mb-4 border border-white/60 shadow-[0_8px_32px_rgba(30,27,75,0.05)]">
                <PremiumHeader
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder="Buscar actividad..."
                    containerClassName="px-5 py-2.5 !border-none !shadow-none bg-transparent"
                >
                    <div className="flex items-center gap-1.5 text-[12px] text-slate-500 font-medium whitespace-nowrap">
                        <Activity size={14} className="text-violet-500" />
                        {total} actividades
                    </div>
                </PremiumHeader>
            </div>

            {/* Type Filters */}
            <div className="shrink-0 mb-4 overflow-x-auto pb-1">
                <div className="flex gap-2">
                    {TYPE_FILTERS.map(f => (
                        <button
                            key={f.key}
                            onClick={() => { setTypeFilter(f.key); setPage(1); }}
                            className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition-all whitespace-nowrap border ${typeFilter === f.key
                                ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                                : 'bg-white/70 text-slate-600 border-slate-200 hover:bg-white hover:border-violet-200'
                                }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Activity Feed */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <Loader2 size={32} className="animate-spin text-violet-500" />
                    </div>
                ) : filteredActivities.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-24 h-24 bg-gradient-to-br from-white/80 to-white/40 backdrop-blur-md rounded-full flex items-center justify-center mb-6 border border-white/60 shadow-[0_8px_32px_rgba(30,27,75,0.05)]">
                            <span className="text-4xl">📋</span>
                        </div>
                        <h3 className="text-[20px] font-black text-slate-700">Sin actividad</h3>
                        <p className="text-slate-500 text-[15px] font-medium max-w-sm mt-2">No se encontró actividad operativa.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {Object.entries(grouped).map(([dateLabel, items]) => (
                            <div key={dateLabel}>
                                {/* Date Header */}
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="text-[13px] font-bold text-slate-500 uppercase tracking-wider">{dateLabel}</span>
                                    <div className="flex-1 h-px bg-slate-200" />
                                    <span className="text-[11px] text-slate-400 font-medium">{items.length} eventos</span>
                                </div>

                                {/* Timeline */}
                                <div className="relative border-l-2 border-slate-200 ml-4 space-y-4">
                                    {items.map((item, idx) => {
                                        const iconCfg = getIconConfig(item.type);
                                        const isLast = idx === items.length - 1;

                                        return (
                                            <div key={item._id} className="relative pl-6">
                                                {/* Hide line after last item */}
                                                {isLast && (
                                                    <div className="absolute top-6 left-[-2px] bottom-[-24px] w-1 bg-white" />
                                                )}

                                                {/* Icon Node */}
                                                <div className={`absolute -left-[17px] top-0.5 w-8 h-8 rounded-full flex items-center justify-center shadow-sm border-2 border-white ${iconCfg.bg}`}>
                                                    {iconCfg.icon}
                                                </div>

                                                {/* Content Card */}
                                                <div className="bg-white/80 backdrop-blur-sm border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-violet-200/50 transition-all duration-200">
                                                    <div className="flex items-start justify-between gap-4 mb-2">
                                                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${iconCfg.badge}`}>
                                                            {iconCfg.label}
                                                        </span>
                                                        <div className="flex items-center gap-2">
                                                            {item.createdBy && (
                                                                <div className="flex items-center bg-white border border-slate-200/60 p-0.5 rounded-full shadow-sm" title={item.createdBy.name}>
                                                                    <div className="w-5 h-5 rounded-full bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center border border-slate-200/50">
                                                                        {item.createdBy.profilePhotoUrl ? (
                                                                            <img src={item.createdBy.profilePhotoUrl} alt="" className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <span className="text-[9px] font-bold text-slate-500">{item.createdBy.name?.charAt(0).toUpperCase() || 'U'}</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            <time className="text-[11px] font-semibold text-slate-400">
                                                                {formatTimeAgo(item.createdAt)}
                                                            </time>
                                                        </div>
                                                    </div>

                                                    <p className="text-sm text-slate-700 font-medium leading-relaxed mb-1.5">
                                                        {item.description}
                                                    </p>

                                                    {/* Context Pills */}
                                                    <div className="flex flex-wrap gap-2 mt-2">
                                                        {item.contact && (
                                                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-full">
                                                                <div className="w-4 h-4 rounded-full bg-slate-200 overflow-hidden shrink-0">
                                                                    {item.contact.profilePhotoUrl ? (
                                                                        <img src={item.contact.profilePhotoUrl} alt="" className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <div className="w-full h-full flex items-center justify-center bg-violet-100 text-violet-600 font-bold text-[8px]">
                                                                            {item.contact.fullName.charAt(0)}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                {item.contact.fullName}
                                                            </span>
                                                        )}
                                                        {item.company && (
                                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
                                                                <Building2 size={11} />
                                                                {item.company.name}
                                                            </span>
                                                        )}
                                                        {item.goal && (
                                                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-fuchsia-600 bg-fuchsia-50 border border-fuchsia-100 px-2.5 py-1 rounded-full">
                                                                <Target size={11} />
                                                                {item.goal.title}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-center gap-3 py-6">
                                <button
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-[13px] hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    Anterior
                                </button>
                                <span className="text-[13px] text-slate-500 font-medium">
                                    Página {page} de {totalPages}
                                </span>
                                <button
                                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                    disabled={page === totalPages}
                                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-[13px] hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                    Siguiente
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.2); border-radius: 10px; }
                .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: rgba(139,92,246,0.4); }
            `}</style>
        </div>
    );
}
