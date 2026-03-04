import { useState, useEffect, useRef } from 'react';
import { X, Save, Calendar, MapPin, Globe, FileText, DollarSign, Ticket, Users, Plus, Trash2, AlertTriangle, Search, Activity } from 'lucide-react';
import { EventFairData, InvestmentItem, createEventFair, updateEventFair, getTeamUsers, TeamUser, ContactData, getContacts } from '../../services/crm.service';
import OwnerAvatar from '../common/OwnerAvatar';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
    event?: EventFairData | null;
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
}

const STATUS_OPTIONS = [
    { value: 'upcoming', label: 'Próximo' },
    { value: 'attending', label: 'Asistiendo' },
    { value: 'completed', label: 'Completado' },
    { value: 'cancelled', label: 'Cancelado' },
];

const TICKET_OPTIONS = [
    { value: 'none', label: 'Sin Entrada' },
    { value: 'pending', label: 'Pendiente' },
    { value: 'purchased', label: 'Compradas' },
];

const CURRENCY_OPTIONS = ['ARS', 'USD', 'EUR', 'BRL'];

export default function EventFairFormDrawer({ event, open, onClose, onSaved }: Props) {
    const { user } = useAuth();
    const [formData, setFormData] = useState<Partial<EventFairData>>({
        name: '', location: '', website: '',
        startDate: '', endDate: '', status: 'upcoming',
        ticketStatus: 'none', ticketCount: 0,
        investment: 0, currency: 'ARS',
        investmentBreakdown: [], expectedLeads: [], notes: ''
    });

    const [saving, setSaving] = useState(false);
    const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
    const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const drawerRef = useRef<HTMLDivElement>(null);

    // Leads search
    const [leadSearch, setLeadSearch] = useState('');
    const [leadResults, setLeadResults] = useState<ContactData[]>([]);
    const [loadingLeads, setLoadingLeads] = useState(false);
    const [selectedLeads, setSelectedLeads] = useState<{ _id: string; fullName: string }[]>([]);

    // Investment breakdown
    const [breakdown, setBreakdown] = useState<InvestmentItem[]>([]);

    useEffect(() => {
        if (open && event) {
            setFormData({
                name: event.name || '', location: event.location || '',
                website: event.website || '',
                startDate: event.startDate ? event.startDate.slice(0, 10) : '',
                endDate: event.endDate ? event.endDate.slice(0, 10) : '',
                status: event.status || 'upcoming',
                ticketStatus: event.ticketStatus || 'none',
                ticketCount: event.ticketCount || 0,
                investment: event.investment || 0,
                currency: event.currency || 'ARS',
                investmentBreakdown: event.investmentBreakdown || [],
                expectedLeads: event.expectedLeads || [],
                notes: event.notes || '',
                assignedTo: (event as any).assignedTo,
            });
            setBreakdown(event.investmentBreakdown || []);
            setSelectedLeads([]);
        } else if (open && !event) {
            setFormData({
                name: '', location: '', website: '',
                startDate: '', endDate: '', status: 'upcoming',
                ticketStatus: 'none', ticketCount: 0,
                investment: 0, currency: 'ARS',
                investmentBreakdown: [], expectedLeads: [], notes: '',
                assignedTo: (user?._id || (user as any)?.id) as any,
            });
            setBreakdown([]);
            setSelectedLeads([]);
        }
        setIsDirty(false);
    }, [open, event, user?._id, (user as any)?.id]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleAttemptClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, isDirty]);

    useEffect(() => {
        if (!open) return;
        getTeamUsers().then(setTeamUsers).catch(console.error);
    }, [open]);

    // Search contacts for leads
    useEffect(() => {
        if (!leadSearch || leadSearch.length < 2) { setLeadResults([]); return; }
        const timer = setTimeout(async () => {
            setLoadingLeads(true);
            try {
                const res = await getContacts({ search: leadSearch, limit: 8 });
                setLeadResults(res.contacts);
            } catch { setLeadResults([]); }
            setLoadingLeads(false);
        }, 300);
        return () => clearTimeout(timer);
    }, [leadSearch]);

    // Recalculate total investment from breakdown
    useEffect(() => {
        const total = breakdown.reduce((sum, item) => sum + (item.amount || 0), 0);
        if (breakdown.length > 0) {
            setFormData(prev => ({ ...prev, investment: total, investmentBreakdown: breakdown }));
        }
    }, [breakdown]);

    const handleAttemptClose = () => {
        if (isDirty) setShowUnsavedConfirm(true);
        else onClose();
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) handleAttemptClose();
    };

    const addBreakdownItem = () => {
        setBreakdown([...breakdown, { concept: '', amount: 0 }]);
        setIsDirty(true);
    };

    const removeBreakdownItem = (index: number) => {
        setBreakdown(breakdown.filter((_, i) => i !== index));
        setIsDirty(true);
    };

    const updateBreakdownItem = (index: number, field: keyof InvestmentItem, value: string | number) => {
        const updated = [...breakdown];
        (updated[index] as any)[field] = value;
        setBreakdown(updated);
        setIsDirty(true);
    };

    const toggleLead = (contact: ContactData) => {
        const leads = formData.expectedLeads || [];
        if (leads.includes(contact._id)) {
            setFormData({ ...formData, expectedLeads: leads.filter(id => id !== contact._id) });
            setSelectedLeads(selectedLeads.filter(l => l._id !== contact._id));
        } else {
            setFormData({ ...formData, expectedLeads: [...leads, contact._id] });
            setSelectedLeads([...selectedLeads, { _id: contact._id, fullName: contact.fullName }]);
        }
        setIsDirty(true);
    };

    const removeLead = (id: string) => {
        setFormData({ ...formData, expectedLeads: (formData.expectedLeads || []).filter(lid => lid !== id) });
        setSelectedLeads(selectedLeads.filter(l => l._id !== id));
        setIsDirty(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = {
                ...formData,
                assignedTo: (formData as any).assignedTo ? (formData as any).assignedTo._id || (formData as any).assignedTo : null,
                investmentBreakdown: breakdown,
            };
            if (event?._id) {
                await updateEventFair(event._id, payload);
            } else {
                await createEventFair(payload);
            }
            onSaved();
            onClose();
        } catch (error) {
            console.error('Error saving event fair:', error);
            alert('Error al guardar evento');
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex justify-end"
            style={{ background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)', animation: 'fadeIn 0.3s ease-out' }}
            onClick={handleBackdropClick}
        >
            <div
                ref={drawerRef}
                className="h-full overflow-y-auto w-[520px] max-w-[100vw] bg-white/95 backdrop-blur-2xl border-l border-white/60 flex flex-col shadow-[-20px_0_40px_rgba(30,27,75,0.1)] relative"
                style={{ animation: 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
            >
                <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-orange-500/50 via-amber-500/50 to-transparent" />

                {/* Header */}
                <div className="flex flex-col p-6 border-b border-slate-200/50 bg-white/50 backdrop-blur-md sticky top-0 z-20 shrink-0">
                    <div className="flex items-center justify-between">
                        <h2 className="text-[20px] font-bold text-slate-800 tracking-tight flex items-center gap-2">
                            <div className="w-9 h-9 rounded-[12px] bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-sm">
                                <Calendar size={18} className="text-white" />
                            </div>
                            {event?._id ? `Editar ${formData.name || 'Evento'}` : 'Nuevo Evento'}
                        </h2>
                        <button type="button" onClick={handleAttemptClose}
                            className="w-9 h-9 rounded-[10px] flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700 bg-white border border-slate-200 shadow-sm">
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Form */}
                <form id="event-fair-form" onSubmit={handleSubmit} onChange={() => setIsDirty(true)} className="p-6 flex-1 flex flex-col gap-5 custom-scrollbar drawer-form">

                    {/* Name */}
                    <div className="space-y-2">
                        <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                            <Calendar size={15} className="text-orange-500" />
                            Nombre del Evento *
                        </label>
                        <input required type="text" value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            placeholder="Ej. ExpoFood Buenos Aires 2026"
                            className="w-full px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-orange-500/10 focus:border-orange-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner" />
                    </div>

                    {/* Location + Website */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                <MapPin size={15} className="text-rose-500" />
                                Ubicación
                            </label>
                            <input type="text" value={formData.location || ''}
                                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                placeholder="Buenos Aires, La Rural"
                                className="w-full px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-rose-500/10 focus:border-rose-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                <Globe size={15} className="text-blue-500" />
                                Website
                            </label>
                            <input type="url" value={formData.website || ''}
                                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                                placeholder="https://..."
                                className="w-full px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner" />
                        </div>
                    </div>

                    {/* Dates */}
                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200/50">
                        <div className="space-y-2">
                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                <Calendar size={15} className="text-emerald-500" />
                                Fecha Inicio *
                            </label>
                            <input required type="date" value={formData.startDate ? (formData.startDate as string).slice(0, 10) : ''}
                                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                className="w-full px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-300 transition-all text-[14px] font-medium text-slate-700 shadow-inner" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                <Calendar size={15} className="text-emerald-500" />
                                Fecha Fin
                            </label>
                            <input type="date" value={formData.endDate ? (formData.endDate as string).slice(0, 10) : ''}
                                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                                className="w-full px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-300 transition-all text-[14px] font-medium text-slate-700 shadow-inner" />
                        </div>
                    </div>

                    {/* Status + Tickets */}
                    <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200/50">
                        <div className="space-y-2">
                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                <Activity size={15} className="text-violet-500" />
                                Estado
                            </label>
                            <select value={formData.status}
                                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                                className="w-full px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-300 transition-all text-[14px] font-bold text-slate-700 shadow-inner appearance-none cursor-pointer">
                                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                <Ticket size={15} className="text-violet-500" />
                                Entradas
                            </label>
                            <div className="flex gap-2">
                                <select value={formData.ticketStatus}
                                    onChange={(e) => setFormData({ ...formData, ticketStatus: e.target.value as any })}
                                    className={`${formData.ticketStatus !== 'none' ? 'flex-1' : 'w-full'} px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-300 transition-all text-[14px] font-bold text-slate-700 shadow-inner appearance-none cursor-pointer`}>
                                    {TICKET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                                {formData.ticketStatus !== 'none' && (
                                    <input type="number" min="0" value={formData.ticketCount || ''}
                                        onChange={(e) => setFormData({ ...formData, ticketCount: Number(e.target.value) || 0 })}
                                        placeholder="Cant."
                                        className="w-[80px] px-3 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-300 transition-all text-[14px] font-bold text-slate-700 placeholder:text-slate-400 shadow-inner text-center" />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Investment Breakdown */}
                    <div className="space-y-3 pt-2 border-t border-slate-200/50">
                        <div className="flex items-center justify-between">
                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                <DollarSign size={15} className="text-emerald-500" />
                                Inversión
                            </label>
                            <div className="flex items-center gap-2">
                                <select value={formData.currency}
                                    onChange={(e) => { setFormData({ ...formData, currency: e.target.value }); setIsDirty(true); }}
                                    className="px-3 py-1.5 bg-white/60 border border-slate-200 rounded-lg text-[12px] font-bold text-slate-600 appearance-none cursor-pointer">
                                    {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <button type="button" onClick={addBreakdownItem}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-[12px] font-bold hover:bg-emerald-100 transition-colors border border-emerald-200/60">
                                    <Plus size={14} /> Detallar
                                </button>
                            </div>
                        </div>

                        {breakdown.length === 0 && (
                            <input type="number" min="0" value={formData.investment || ''}
                                onChange={(e) => { setFormData({ ...formData, investment: Number(e.target.value) || 0 }); setIsDirty(true); }}
                                placeholder="Monto total de inversión"
                                className="w-full px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-300 transition-all text-[14px] font-bold text-slate-700 placeholder:text-slate-400 shadow-inner" />
                        )}

                        {breakdown.map((item, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <input type="text" value={item.concept}
                                    onChange={(e) => updateBreakdownItem(i, 'concept', e.target.value)}
                                    placeholder="Concepto (stand, entrada, viáticos...)"
                                    className="flex-1 px-3 py-2.5 bg-white/60 border border-slate-200 rounded-[10px] text-[13px] font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-300 transition-all" />
                                <input type="number" min="0" value={item.amount || ''}
                                    onChange={(e) => updateBreakdownItem(i, 'amount', Number(e.target.value) || 0)}
                                    placeholder="Monto"
                                    className="w-[120px] px-3 py-2.5 bg-white/60 border border-slate-200 rounded-[10px] text-[13px] font-bold text-slate-700 placeholder:text-slate-400 text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-300 transition-all" />
                                <button type="button" onClick={() => removeBreakdownItem(i)}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}

                        {breakdown.length > 0 && (
                            <div className="flex justify-between items-center px-3 py-2.5 bg-emerald-50/80 rounded-[10px] border border-emerald-200/60">
                                <span className="text-[13px] font-bold text-emerald-700">Total Inversión</span>
                                <span className="text-[15px] font-extrabold text-emerald-700">
                                    {formData.currency} {(formData.investment || 0).toLocaleString()}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Expected Leads */}
                    <div className="space-y-3 pt-2 border-t border-slate-200/50">
                        <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                            <Users size={15} className="text-blue-500" />
                            Leads Esperados
                        </label>

                        {selectedLeads.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {selectedLeads.map(lead => (
                                    <span key={lead._id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-[12px] font-bold border border-blue-200/60">
                                        {lead.fullName}
                                        <button type="button" onClick={() => removeLead(lead._id)} className="hover:text-red-500 transition-colors">
                                            <X size={12} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}

                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="text" value={leadSearch}
                                onChange={(e) => setLeadSearch(e.target.value)}
                                placeholder="Buscar contactos por nombre..."
                                className="w-full pl-10 pr-4 py-3 bg-white/60 border border-slate-200 rounded-[12px] text-[13px] font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-300 transition-all" />
                        </div>

                        {leadResults.length > 0 && (
                            <div className="border border-slate-200 rounded-[12px] overflow-hidden max-h-[180px] overflow-y-auto">
                                {leadResults.map(c => {
                                    const isSelected = (formData.expectedLeads || []).includes(c._id);
                                    return (
                                        <button key={c._id} type="button" onClick={() => toggleLead(c)}
                                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0 ${isSelected ? 'bg-blue-50/50' : ''}`}>
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                                                {c.fullName?.charAt(0) || '?'}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[13px] font-bold text-slate-700 truncate">{c.fullName}</p>
                                                <p className="text-[11px] text-slate-500 truncate">{c.company?.name || c.position || 'Sin empresa'}</p>
                                            </div>
                                            {isSelected && <span className="text-blue-500 text-[11px] font-bold">✓</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Empty results feedback */}
                        {!loadingLeads && leadSearch.length >= 2 && leadResults.length === 0 && (
                            <p className="text-[12px] text-slate-400 text-center py-3 bg-slate-50/60 rounded-[10px] border border-slate-100">
                                No se encontraron contactos para "{leadSearch}"
                            </p>
                        )}
                        {loadingLeads && <p className="text-[12px] text-slate-400 text-center py-2">Buscando...</p>}
                    </div>

                    {/* Responsable */}
                    <div className="space-y-2 pt-2 border-t border-slate-200/50">
                        <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                            <Users size={15} className="text-fuchsia-500" />
                            Responsable
                        </label>
                        <div className="relative w-full">
                            <select
                                value={(formData as any).assignedTo?._id || (formData as any).assignedTo || ''}
                                onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value as any })}
                                className="w-full pl-12 pr-10 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-fuchsia-500/10 focus:border-fuchsia-300 transition-all text-[14px] font-bold text-slate-700 shadow-inner appearance-none cursor-pointer">
                                <option value="">Sin asignar</option>
                                {teamUsers.map(u => <option key={u._id} value={u._id}>{u.name || u.email}</option>)}
                            </select>
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                <OwnerAvatar
                                    name={teamUsers.find(u => u._id === ((formData as any).assignedTo?._id || (formData as any).assignedTo))?.name || ''}
                                    profilePhotoUrl={teamUsers.find(u => u._id === ((formData as any).assignedTo?._id || (formData as any).assignedTo))?.profilePhotoUrl}
                                    size="sm"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-2 pt-2 border-t border-slate-200/50 flex-1 flex flex-col">
                        <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                            <FileText size={15} className="text-slate-500" />
                            Notas / Objetivos
                        </label>
                        <textarea value={formData.notes || ''}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            placeholder="Stand asignado, personas a buscar, objetivos del evento, presupuesto adicional..."
                            className="w-full flex-1 min-h-[100px] px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-slate-500/10 focus:border-slate-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner custom-scrollbar resize-none" />
                    </div>

                    {/* Actions */}
                    <div className="mt-auto pt-4 border-t border-slate-200/80 flex gap-3 bg-white/80 backdrop-blur-md sticky bottom-0 -mx-6 px-6 pb-4">
                        <button type="button" onClick={handleAttemptClose}
                            className="flex-1 px-4 py-2.5 bg-white border border-slate-200/80 text-slate-600 rounded-[10px] text-[13px] font-bold hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
                            Cancelar
                        </button>
                        <button type="submit" disabled={saving || !formData.name}
                            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-[10px] text-[13px] font-bold hover:shadow-[0_8px_24px_rgba(245,158,11,0.4)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(245,158,11,0.3)]">
                            {saving ? 'Guardando...' : <><Save size={16} /> {event?._id ? 'Guardar Cambios' : 'Crear Evento'}</>}
                        </button>
                    </div>
                </form>
            </div>

            {showUnsavedConfirm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" style={{ animation: 'fadeIn 0.2s ease-out' }}>
                    <div className="bg-white rounded-[24px] p-6 max-w-sm w-full shadow-[0_20px_60px_rgba(0,0,0,0.1)] border border-slate-100" onClick={e => e.stopPropagation()}>
                        <div className="w-14 h-14 bg-amber-50 text-amber-500 rounded-[16px] flex items-center justify-center mb-5 border border-amber-100 shadow-inner">
                            <AlertTriangle size={28} />
                        </div>
                        <h3 className="text-[20px] font-bold text-slate-800 mb-2 tracking-tight">¿Salir sin guardar?</h3>
                        <p className="text-slate-500 text-[14px] mb-6 leading-relaxed">
                            Tenés cambios sin guardar. ¿Querés guardarlos antes de salir?
                        </p>
                        <div className="flex gap-3">
                            <button type="button"
                                onClick={() => { setShowUnsavedConfirm(false); setIsDirty(false); onClose(); }}
                                className="flex-1 py-3 px-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-[14px] hover:bg-slate-50 transition-colors shadow-sm text-[14px]">
                                No, salir
                            </button>
                            <button type="button"
                                onClick={() => { setShowUnsavedConfirm(false); const form = document.getElementById('event-fair-form') as HTMLFormElement; if (form) form.requestSubmit(); }}
                                className="flex-1 py-3 px-4 bg-gradient-to-r from-orange-500 to-amber-600 text-white font-bold rounded-[14px] hover:shadow-md transition-all shadow-sm text-[14px]">
                                Sí, guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
                .drawer-form .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .drawer-form .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .drawer-form .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(245, 158, 11, 0.2); border-radius: 10px; }
                .drawer-form .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: rgba(245, 158, 11, 0.4); }
            `}</style>
        </div>
    );
}
