import { useState, useEffect } from 'react';
import { Edit2, Trash2, Calendar, MapPin, DollarSign, Ticket, Users, ExternalLink, Plus, Target, CheckCircle2, Trophy, X } from 'lucide-react';
import { EventFairData, getEventFairs, deleteEventFair, updateEventFair } from '../../services/crm.service';
import EventFairFormDrawer from './EventFairFormDrawer';
import PremiumHeader from './PremiumHeader';
import OwnerAvatar from '../common/OwnerAvatar';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    upcoming: { label: 'Próximo', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200/60' },
    attending: { label: 'Asistiendo', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200/60' },
    completed: { label: 'Completado', color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200/60' },
    cancelled: { label: 'Cancelado', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200/60' },
};

const TICKET_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    none: { label: 'Sin Entrada', color: 'text-slate-500', bg: 'bg-slate-50', border: 'border-slate-200/60' },
    pending: { label: 'Pendiente', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200/60' },
    purchased: { label: 'Compradas', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200/60' },
};

type FilterTab = 'all' | 'upcoming' | 'completed';

export default function EventFairList() {
    const [events, setEvents] = useState<EventFairData[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<FilterTab>('all');

    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [editingEvent, setEditingEvent] = useState<EventFairData | null>(null);

    // Objective completion
    const [completingEventId, setCompletingEventId] = useState<string | null>(null);
    const [completionLeads, setCompletionLeads] = useState<number>(0);
    const [savingCompletion, setSavingCompletion] = useState(false);

    const loadEvents = async () => {
        try {
            setLoading(true);
            const res = await getEventFairs();
            setEvents(res.events);
        } catch (error) {
            console.error('Error loading event fairs', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadEvents(); }, []);

    const openCreateDrawer = () => { setEditingEvent(null); setIsDrawerOpen(true); };
    const openEditDrawer = (ev: EventFairData) => { setEditingEvent(ev); setIsDrawerOpen(true); };

    const openCompletionModal = (ev: EventFairData) => {
        setCompletingEventId(ev._id);
        setCompletionLeads(ev.leadsAchieved || 0);
    };

    const handleCompleteObjective = async () => {
        if (!completingEventId) return;
        const ev = events.find(e => e._id === completingEventId);
        if (!ev) return;
        const objective = ev.leadObjective || 0;
        setSavingCompletion(true);
        try {
            await updateEventFair(completingEventId, {
                leadsAchieved: completionLeads,
                leadObjectiveMet: completionLeads >= objective && objective > 0,
            });
            setCompletingEventId(null);
            loadEvents();
        } catch (error) {
            console.error('Error completing objective:', error);
            alert('Error al guardar el objetivo');
        } finally {
            setSavingCompletion(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro de que deseas eliminar este evento?')) return;
        try {
            await deleteEventFair(id);
            loadEvents();
        } catch (error) {
            console.error('Error deleting event fair', error);
            alert('Error al eliminar');
        }
    };

    const filteredEvents = events.filter(ev => {
        const matchesSearch = ev.name.toLowerCase().includes(search.toLowerCase()) ||
            (ev.location || '').toLowerCase().includes(search.toLowerCase());
        if (filter === 'upcoming') return matchesSearch && (ev.status === 'upcoming' || ev.status === 'attending');
        if (filter === 'completed') return matchesSearch && (ev.status === 'completed' || ev.status === 'cancelled');
        return matchesSearch;
    });

    // KPIs
    const totalInvestment = events.reduce((sum, ev) => sum + (ev.investment || 0), 0);
    const upcomingCount = events.filter(ev => ev.status === 'upcoming' || ev.status === 'attending').length;
    const totalLeads = events.reduce((sum, ev) => sum + (ev.expectedLeadsCount || ev.expectedLeads?.length || 0), 0);
    const mainCurrency = events.find(e => e.investment > 0)?.currency || 'ARS';
    const completedCount = events.filter(e => e.status === 'completed' || e.status === 'cancelled').length;
    const hasData = events.length > 0;

    // Lead objective KPIs
    const eventsWithObjective = events.filter(e => (e.leadObjective || 0) > 0);
    const objectivesMet = eventsWithObjective.filter(e => e.leadObjectiveMet).length;
    const objectivesTotal = eventsWithObjective.length;
    const upcomingEvents = events.filter(e => e.status === 'upcoming' || e.status === 'attending');
    const projectedLeads = upcomingEvents.reduce((sum, e) => sum + (e.leadObjective || 0), 0);
    const totalLeadsAchieved = events.reduce((sum, e) => sum + (e.leadObjectiveMet ? (e.leadsAchieved || 0) : 0), 0);

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const filterTabs: { key: FilterTab; label: string; count: number }[] = [
        { key: 'all', label: 'Todos', count: events.length },
        { key: 'upcoming', label: 'Próximos', count: upcomingCount },
        { key: 'completed', label: 'Finalizados', count: completedCount },
    ];

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] min-h-[500px] relative mt-4 pb-20 md:pb-0">
            {/* Premium Header */}
            <div className="shrink-0 z-10 bg-white/40 backdrop-blur-2xl rounded-[24px] overflow-hidden mb-4 border border-white/60 shadow-[0_8px_32px_rgba(30,27,75,0.05)]">
                <PremiumHeader
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder="Buscar evento por nombre o ubicación..."
                    onAdd={openCreateDrawer}
                    addLabel="Nuevo Evento"
                    containerClassName="px-5 py-2.5 !border-none !shadow-none bg-transparent"
                />
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-6 gap-3 mb-4 shrink-0">
                <div className="bg-white/70 backdrop-blur-xl rounded-[18px] border border-slate-200/50 px-4 py-3.5 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-7 h-7 rounded-[8px] bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-sm">
                            <DollarSign size={14} className="text-white" />
                        </div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Inversión</span>
                    </div>
                    <p className="text-[19px] font-black text-slate-800 tracking-tight">
                        {hasData && totalInvestment > 0
                            ? `${mainCurrency} ${totalInvestment.toLocaleString()}`
                            : <span className="text-slate-300">—</span>
                        }
                    </p>
                    <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                        {hasData ? `${events.length} evento${events.length !== 1 ? 's' : ''}` : 'Sin eventos'}
                    </p>
                </div>
                <div className="bg-white/70 backdrop-blur-xl rounded-[18px] border border-slate-200/50 px-4 py-3.5 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-7 h-7 rounded-[8px] bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-sm">
                            <Calendar size={14} className="text-white" />
                        </div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Próximos</span>
                    </div>
                    <p className="text-[19px] font-black text-slate-800 tracking-tight">
                        {upcomingCount > 0 ? upcomingCount : <span className="text-slate-300">—</span>}
                    </p>
                    <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                        {upcomingCount > 0 ? 'Por asistir' : 'Sin próximos'}
                    </p>
                </div>
                <div className="bg-white/70 backdrop-blur-xl rounded-[18px] border border-slate-200/50 px-4 py-3.5 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-7 h-7 rounded-[8px] bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center shadow-sm">
                            <Users size={14} className="text-white" />
                        </div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Leads</span>
                    </div>
                    <p className="text-[19px] font-black text-slate-800 tracking-tight">
                        {totalLeads > 0 ? totalLeads : <span className="text-slate-300">—</span>}
                    </p>
                    <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                        {totalLeads > 0 ? 'Vinculados' : 'Sin leads'}
                    </p>
                </div>
                <div className="bg-white/70 backdrop-blur-xl rounded-[18px] border border-slate-200/50 px-4 py-3.5 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-7 h-7 rounded-[8px] bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-sm">
                            <CheckCircle2 size={14} className="text-white" />
                        </div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Obj. Cumplidos</span>
                    </div>
                    <p className="text-[19px] font-black text-slate-800 tracking-tight">
                        {objectivesTotal > 0 ? (
                            <><span className="text-emerald-600">{objectivesMet}</span><span className="text-slate-300 text-[15px]">/{objectivesTotal}</span></>
                        ) : <span className="text-slate-300">—</span>}
                    </p>
                    <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                        {objectivesTotal > 0 ? `${Math.round((objectivesMet / objectivesTotal) * 100)}% cumplimiento` : 'Sin objetivos'}
                    </p>
                </div>
                <div className="bg-white/70 backdrop-blur-xl rounded-[18px] border border-slate-200/50 px-4 py-3.5 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-7 h-7 rounded-[8px] bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center shadow-sm">
                            <Trophy size={14} className="text-white" />
                        </div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Conseguidos</span>
                    </div>
                    <p className="text-[19px] font-black text-slate-800 tracking-tight">
                        {totalLeadsAchieved > 0 ? <span className="text-teal-600">{totalLeadsAchieved}</span> : <span className="text-slate-300">—</span>}
                    </p>
                    <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                        {totalLeadsAchieved > 0 ? `De ${objectivesMet} obj. cumplidos` : 'Sin resultados'}
                    </p>
                </div>
                <div className="bg-white/70 backdrop-blur-xl rounded-[18px] border border-slate-200/50 px-4 py-3.5 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-7 h-7 rounded-[8px] bg-gradient-to-br from-rose-400 to-rose-600 flex items-center justify-center shadow-sm">
                            <Target size={14} className="text-white" />
                        </div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Proyección</span>
                    </div>
                    <p className="text-[19px] font-black text-slate-800 tracking-tight">
                        {projectedLeads > 0 ? projectedLeads : <span className="text-slate-300">—</span>}
                    </p>
                    <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                        {projectedLeads > 0 ? `Leads de ${upcomingEvents.filter(e => (e.leadObjective || 0) > 0).length} eventos` : 'Sin proyección'}
                    </p>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-2 mb-4 shrink-0">
                {filterTabs.map(tab => (
                    <button key={tab.key} onClick={() => setFilter(tab.key)}
                        className={`px-4 py-2 rounded-[12px] text-[13px] font-bold transition-all border ${filter === tab.key
                            ? 'bg-orange-50 text-orange-700 border-orange-200/60 shadow-sm'
                            : 'bg-white/60 text-slate-500 border-slate-200/50 hover:bg-slate-50'
                            }`}>
                        {tab.label} <span className={`text-[11px] ml-1 ${filter === tab.key ? 'text-orange-500' : 'opacity-50'}`}>({tab.count})</span>
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center bg-white/30 backdrop-blur-xl rounded-[24px] border border-slate-100 shadow-sm">
                    <div className="relative">
                        <div className="absolute inset-0 bg-orange-500/20 rounded-full blur-xl animate-pulse" />
                        <div className="animate-spin w-10 h-10 border-4 border-orange-200 border-t-orange-600 rounded-full relative z-10" />
                    </div>
                </div>
            ) : filteredEvents.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-20 bg-white/40 backdrop-blur-xl rounded-[24px] border border-slate-100 shadow-sm">
                    <div className="w-20 h-20 bg-orange-50 rounded-[20px] flex items-center justify-center mb-4 border border-orange-100 shadow-sm">
                        <Calendar size={32} className="text-orange-500" />
                    </div>
                    <h3 className="text-[17px] font-bold text-slate-700">{events.length === 0 ? 'Aún no hay Eventos' : 'Sin resultados'}</h3>
                    <p className="text-[15px] font-medium text-slate-500 mt-1 text-center max-w-sm">
                        {events.length === 0
                            ? 'Registrá eventos, ferias y conferencias para controlar tu inversión y detectar leads.'
                            : 'No se encontraron eventos con los filtros seleccionados.'}
                    </p>
                    {events.length === 0 && (
                        <button onClick={openCreateDrawer}
                            className="mt-5 flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-[12px] text-[14px] font-bold hover:shadow-[0_8px_24px_rgba(245,158,11,0.35)] hover:-translate-y-0.5 transition-all shadow-[0_4px_16px_rgba(245,158,11,0.25)]">
                            <Plus size={18} /> Crear primer evento
                        </button>
                    )}
                </div>
            ) : (
                <div className="bg-white/70 backdrop-blur-2xl rounded-[24px] border border-slate-200/50 shadow-[0_8px_32px_rgba(30,27,75,0.02)] overflow-hidden flex-1 flex flex-col relative pb-4">
                    <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1 relative rounded-[24px]">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                            <thead className="sticky top-0 z-10 bg-white/90 backdrop-blur-xl shadow-sm border-b border-slate-200/60">
                                <tr>
                                    <th className="px-6 py-4 text-[12px] font-bold text-slate-400 uppercase tracking-widest">Evento</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-slate-400 uppercase tracking-widest">Fecha</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-slate-400 uppercase tracking-widest">Estado</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-slate-400 uppercase tracking-widest">Entradas</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-slate-400 uppercase tracking-widest">Inversión</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-slate-400 uppercase tracking-widest">Objetivo Leads</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-slate-400 uppercase tracking-widest w-[120px] text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100/60">
                                {filteredEvents.map(ev => {
                                    const statusCfg = STATUS_CONFIG[ev.status] || STATUS_CONFIG.upcoming;
                                    const ticketCfg = TICKET_CONFIG[ev.ticketStatus] || TICKET_CONFIG.none;
                                    return (
                                        <tr key={ev._id} className="hover:bg-orange-50/30 transition-colors duration-200">
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-11 h-11 rounded-[12px] bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center border border-orange-200/50 shadow-sm shrink-0">
                                                        <Calendar size={18} className="text-orange-600" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-extrabold text-[15px] text-slate-800 tracking-tight truncate max-w-[220px]">{ev.name}</div>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            {ev.location && (
                                                                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                                                                    <MapPin size={11} /> {ev.location}
                                                                </span>
                                                            )}
                                                            {ev.website && (
                                                                <a href={ev.website} target="_blank" rel="noreferrer"
                                                                    className="text-[11px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5 transition-colors">
                                                                    <ExternalLink size={10} /> Web
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {ev.assignedTo && (
                                                        <OwnerAvatar name={ev.assignedTo.name} profilePhotoUrl={ev.assignedTo.profilePhotoUrl} size="xs" />
                                                    )}
                                                </div>
                                            </td>

                                            <td className="px-6 py-5">
                                                <div className="text-[13px] font-bold text-slate-700">
                                                    {formatDate(ev.startDate)}
                                                </div>
                                                {ev.endDate && ev.endDate !== ev.startDate && (
                                                    <div className="text-[11px] text-slate-400 mt-0.5">
                                                        → {formatDate(ev.endDate)}
                                                    </div>
                                                )}
                                            </td>

                                            <td className="px-6 py-5">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] text-[11px] font-bold ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border} border w-fit`}>
                                                    {statusCfg.label}
                                                </span>
                                            </td>

                                            <td className="px-6 py-5">
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[8px] text-[11px] font-bold ${ticketCfg.bg} ${ticketCfg.color} ${ticketCfg.border} border w-fit`}>
                                                    <Ticket size={11} />
                                                    {ticketCfg.label}{ev.ticketStatus === 'purchased' && ev.ticketCount > 0 ? ` ×${ev.ticketCount}` : ''}
                                                </span>
                                            </td>

                                            <td className="px-6 py-5">
                                                {ev.investment > 0 ? (
                                                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-emerald-50/80 border border-emerald-200/60 shadow-sm">
                                                        <DollarSign size={13} className="text-emerald-500" />
                                                        <span className="font-black text-emerald-700 text-[13px]">
                                                            {ev.currency} {ev.investment.toLocaleString()}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-[12px] font-medium text-slate-400 bg-slate-50 px-3 py-1.5 rounded-[10px] border border-slate-100">—</span>
                                                )}
                                            </td>

                                            <td className="px-6 py-5">
                                                {(ev.leadObjective || 0) > 0 ? (() => {
                                                    const achieved = ev.leadsAchieved || 0;
                                                    const objective = ev.leadObjective || 0;
                                                    const hasResult = achieved > 0;
                                                    const met = achieved >= objective;
                                                    const diff = achieved - objective;
                                                    return (
                                                        <div className="space-y-1.5">
                                                            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] text-[11px] font-bold border w-fit ${hasResult && met ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60'
                                                                : hasResult && !met ? 'bg-red-50 text-red-600 border-red-200/60'
                                                                    : 'bg-amber-50 text-amber-700 border-amber-200/60'
                                                                }`}>
                                                                {hasResult && met ? <CheckCircle2 size={12} /> : <Target size={12} />}
                                                                {hasResult ? `${achieved}/${objective}` : `${objective} leads`}
                                                            </div>
                                                            {hasResult && met && (
                                                                <p className="text-[10px] text-emerald-500 font-bold">
                                                                    {diff > 0 ? `+${diff} por encima` : 'Cumplido'}
                                                                </p>
                                                            )}
                                                            {hasResult && !met && (
                                                                <p className="text-[10px] text-red-500 font-bold">
                                                                    Faltaron {Math.abs(diff)}
                                                                </p>
                                                            )}
                                                            {!hasResult && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); openCompletionModal(ev); }}
                                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-[8px] text-[11px] font-bold hover:shadow-[0_4px_12px_rgba(245,158,11,0.35)] hover:-translate-y-0.5 transition-all shadow-sm"
                                                                >
                                                                    <Trophy size={12} />
                                                                    Cumplí con el objetivo
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })() : (
                                                    <span className="text-[12px] text-slate-400 bg-slate-50 px-3 py-1.5 rounded-[8px] border border-slate-100">—</span>
                                                )}
                                            </td>

                                            <td className="px-6 py-5 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button onClick={() => openEditDrawer(ev)}
                                                        className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-orange-600 bg-white hover:bg-orange-50 rounded-[10px] border border-slate-200 hover:border-orange-200 transition-all shadow-sm">
                                                        <Edit2 size={15} />
                                                    </button>
                                                    <button onClick={() => handleDelete(ev._id)}
                                                        className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-red-500 bg-white hover:bg-red-50 rounded-[10px] border border-slate-200 hover:border-red-200 transition-all shadow-sm">
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <EventFairFormDrawer
                open={isDrawerOpen}
                event={editingEvent}
                onClose={() => setIsDrawerOpen(false)}
                onSaved={loadEvents}
            />

            {/* Objective Completion Modal */}
            {completingEventId && (() => {
                const ev = events.find(e => e._id === completingEventId);
                if (!ev) return null;
                const objective = ev.leadObjective || 0;
                const met = completionLeads >= objective && objective > 0;
                const diff = completionLeads - objective;
                return (
                    <div
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                        style={{ background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)', animation: 'fadeIn 0.2s ease-out' }}
                        onClick={() => setCompletingEventId(null)}
                    >
                        <div
                            className="bg-white rounded-[24px] p-6 max-w-md w-full shadow-[0_20px_60px_rgba(0,0,0,0.12)] border border-slate-100"
                            onClick={e => e.stopPropagation()}
                            style={{ animation: 'scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-[14px] bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
                                        <Trophy size={22} className="text-white" />
                                    </div>
                                    <div>
                                        <h3 className="text-[18px] font-bold text-slate-800 tracking-tight">Registrar resultado</h3>
                                        <p className="text-[12px] text-slate-400 font-medium">{ev.name}</p>
                                    </div>
                                </div>
                                <button onClick={() => setCompletingEventId(null)}
                                    className="w-8 h-8 rounded-[10px] flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600">
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Objective reference */}
                            <div className="flex items-center gap-2 px-4 py-3 bg-amber-50/80 rounded-[12px] border border-amber-200/60 mb-4">
                                <Target size={16} className="text-amber-600" />
                                <span className="text-[13px] font-bold text-amber-700">Objetivo proyectado:</span>
                                <span className="text-[15px] font-black text-amber-800">{objective} leads</span>
                            </div>

                            {/* Input */}
                            <div className="space-y-2 mb-4">
                                <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                    <CheckCircle2 size={15} className="text-emerald-500" />
                                    ¿Cuántos leads conseguiste?
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    autoFocus
                                    value={completionLeads || ''}
                                    onChange={(e) => setCompletionLeads(Number(e.target.value) || 0)}
                                    placeholder="Ej. 12"
                                    className="w-full px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-orange-500/10 focus:border-orange-300 transition-all text-[16px] font-bold text-slate-700 placeholder:text-slate-400 shadow-inner"
                                />
                            </div>

                            {/* Live comparison */}
                            {completionLeads > 0 && (
                                <div className={`flex items-center gap-3 px-4 py-3 rounded-[12px] border mb-5 transition-all ${met ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50/60 border-red-200'}`}>
                                    {met ? <CheckCircle2 size={20} className="text-emerald-500" /> : <Target size={20} className="text-red-400" />}
                                    <div className="flex-1">
                                        <p className={`text-[13px] font-bold ${met ? 'text-emerald-700' : 'text-red-600'}`}>
                                            {met
                                                ? (diff > 0 ? `¡Superaste el objetivo por +${diff} leads!` : '¡Cumpliste el objetivo de leads!')
                                                : `Faltan ${Math.abs(diff)} leads para el objetivo`
                                            }
                                        </p>
                                        <p className="text-[11px] text-slate-400 mt-0.5">
                                            {completionLeads} conseguidos de {objective} proyectados
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setCompletingEventId(null)}
                                    className="flex-1 py-3 px-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-[14px] hover:bg-slate-50 transition-colors shadow-sm text-[14px]"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleCompleteObjective}
                                    disabled={savingCompletion || completionLeads <= 0}
                                    className="flex-1 py-3 px-4 bg-gradient-to-r from-orange-500 to-amber-600 text-white font-bold rounded-[14px] hover:shadow-[0_8px_24px_rgba(245,158,11,0.4)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none shadow-[0_4px_16px_rgba(245,158,11,0.3)] flex items-center justify-center gap-2 text-[14px]"
                                >
                                    {savingCompletion ? 'Guardando...' : <><Trophy size={16} /> Confirmar</>}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(245, 158, 11, 0.2); border-radius: 10px; }
                .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: rgba(245, 158, 11, 0.4); }
            `}</style>
        </div>
    );
}
