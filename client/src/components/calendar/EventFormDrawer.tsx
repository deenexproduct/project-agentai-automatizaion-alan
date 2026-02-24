import { useState, useEffect, useRef } from 'react';
import { X, Save, Clock, Calendar as CalendarIcon, MapPin, Video, Users, CheckSquare, Trash2, AlertTriangle, Search } from 'lucide-react';
import { EventData, createEvent, updateEvent, deleteEvent, getContacts, getCompanies, getDealsPipeline, getCompany, ContactData, CompanyData, DealData, getTeamUsers, TeamUser } from '../../services/crm.service';
import AutocompleteInput from '../common/AutocompleteInput';
import { useAuth } from '../../contexts/AuthContext';
import { formatToLocalDateInput } from '../../utils/date';

interface EventFormDrawerProps {
    open: boolean;
    event?: EventData;
    initialDate?: Date | null;
    onClose: () => void;
    onSaved: () => void;
}

export default function EventFormDrawer({ open, event, initialDate, onClose, onSaved }: EventFormDrawerProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [date, setDate] = useState(formatToLocalDateInput(new Date()));
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('10:00');
    const [type, setType] = useState<'meet' | 'physical'>('meet');
    const [location, setLocation] = useState('');
    const [attendeesInput, setAttendeesInput] = useState('');

    const { user } = useAuth();
    const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
    const [selectedUser, setSelectedUser] = useState<string>('');

    const [contactSearch, setContactSearch] = useState('');
    const [selectedContacts, setSelectedContacts] = useState<ContactData[]>([]);
    const [contacts, setContacts] = useState<ContactData[]>([]);

    const [companySearch, setCompanySearch] = useState('');
    const [selectedCompany, setSelectedCompany] = useState<CompanyData | null>(null);
    const [companies, setCompanies] = useState<CompanyData[]>([]);

    const [dealSearch, setDealSearch] = useState('');
    const [selectedDeal, setSelectedDeal] = useState<DealData | null>(null);
    const [deals, setDeals] = useState<DealData[]>([]);

    const [sendInvite, setSendInvite] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const drawerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open) {
            if (event) {
                setTitle(event.title || '');
                setDescription(event.description || '');
                setDate(formatToLocalDateInput(event.date));
                setStartTime(event.startTime || '09:00');
                setEndTime(event.endTime || '10:00');
                setType(event.type || 'meet');
                setLocation(event.location || '');
                setAttendeesInput(event.attendees?.join(', ') || '');
                setSelectedContacts((event.linkedTo?.contacts as any) || (event.linkedTo?.contact ? [event.linkedTo.contact] : []));
                const company = event.linkedTo?.company as any;
                const deal = event.linkedTo?.deal as any;
                setSelectedCompany(company || null);
                setSelectedDeal(deal || null);
                setCompanySearch(company?.name || '');
                setDealSearch(deal?.title || '');
                setContactSearch(''); // Contacts are multiple, search stays empty
                setSelectedUser((event.assignedTo as any)?._id || event.userId?._id || user?._id || '');
            } else {
                setTitle('');
                setDescription('');
                setDate(formatToLocalDateInput(initialDate || new Date()));
                setStartTime('09:00');
                setEndTime('10:00');
                setType('meet');
                setLocation('');
                setAttendeesInput('');
                setSelectedContacts([]);
                setSelectedCompany(null);
                setSelectedDeal(null);
                setCompanySearch('');
                setDealSearch('');
                setContactSearch('');
                setSelectedUser(user?._id || '');
            }
            setSendInvite(true);
            setShowDeleteConfirm(false);
        }
    }, [open, event, initialDate, user?._id]);

    useEffect(() => {
        if (!open) return;
        // We don't fetch contacts globally anymore, it will be handled by the company filter effect
        getCompanies({ limit: 50 }).then(data => setCompanies(data.companies)).catch(console.error);
        getDealsPipeline().then(data => {
            const allDeals = data.stages.flatMap(s => s.deals);
            setDeals(allDeals);
        }).catch(console.error);
        getTeamUsers().then(setTeamUsers).catch(console.error);
    }, [open]);

    // Autocomplete Contacts
    useEffect(() => {
        if (!open) return;
        const fetchConts = async () => {
            try {
                // If a company is selected, filter contacts by that company
                const companyId = selectedCompany?._id;
                const res = await getContacts({ search: contactSearch, limit: companyId ? 100 : 10, company: companyId });
                setContacts(res.contacts);
            } catch { /* ignore */ }
        };
        const timeoutId = setTimeout(fetchConts, 300);
        return () => clearTimeout(timeoutId);
    }, [contactSearch, open, selectedCompany]);

    useEffect(() => {
        const emails = selectedContacts.map(c => c.email).filter(e => e) as string[];
        if (emails.length > 0 && !attendeesInput) {
            setAttendeesInput(emails.join(', '));
        }
    }, [selectedContacts]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSaving(true);
            const eventData: Partial<EventData> & { sendInvite: boolean } = {
                title,
                description,
                assignedTo: selectedUser as any,
                date,
                startTime,
                endTime,
                type,
                location: type === 'physical' ? location : '',
                attendees: attendeesInput.split(',').map(e => e.trim()).filter(e => e),
                linkedTo: {
                    contacts: selectedContacts.map(c => c._id as any),
                    company: selectedCompany ? (selectedCompany._id as any) : null,
                    deal: selectedDeal ? (selectedDeal._id as any) : null,
                } as any,
                sendInvite
            };

            if (event?._id) {
                await updateEvent(event._id, eventData);
            } else {
                await createEvent(eventData);
            }

            onSaved();
            onClose();
        } catch (error) {
            console.error('Error saving event:', error);
            alert('Error al guardar el evento. Revisa la consola para más detalles.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!event?._id) return;
        try {
            setSaving(true);
            await deleteEvent(event._id);
            onSaved();
            onClose();
        } catch (error) {
            console.error('Error deleting event:', error);
            alert('Error al eliminar el evento.');
        } finally {
            setSaving(false);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
            onClose();
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100] flex justify-end bg-slate-900/40 backdrop-blur-sm" onClick={handleBackdropClick} style={{ animation: 'fadeIn 0.2s ease-out' }}>
            <div
                ref={drawerRef}
                className="w-full max-w-[500px] bg-slate-50 h-full shadow-[-20px_0_60px_rgba(0,0,0,0.1)] flex flex-col relative"
                style={{ animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
            >
                <div className="px-6 py-5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0 relative z-10 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-[12px] bg-violet-100 text-violet-600 flex items-center justify-center shadow-inner relative overflow-hidden">
                            <CalendarIcon size={20} className="relative z-10" />
                        </div>
                        <div>
                            <h2 className="text-[18px] font-bold text-slate-800 tracking-tight">{event ? 'Editar Evento' : 'Nuevo Evento'}</h2>
                            <p className="text-[13px] font-medium text-slate-500">{event ? 'Modifica los detalles del evento' : 'Programa una reunión o videollamada'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form id="event-form" onSubmit={handleSave} className="flex-1 overflow-y-auto w-full custom-scrollbar">
                    <div className="p-6 space-y-6">
                        <div className="bg-white p-5 rounded-[20px] shadow-sm border border-slate-100 space-y-4">
                            <div>
                                <label className="block text-[12px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Título del Evento *</label>
                                <input
                                    type="text"
                                    required
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    placeholder="Ej: Reunión de descubrimiento"
                                    className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-[12px] text-[14px] text-slate-800 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all font-medium"
                                />
                            </div>
                            <div>
                                <label className="block text-[12px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Descripción (Opcional)</label>
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    rows={3}
                                    placeholder="Temas a tratar en la reunión..."
                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-[16px] text-[14px] text-slate-800 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all resize-none"
                                />
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-[20px] shadow-sm border border-slate-100">
                            <h3 className="text-[14px] font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <Clock size={16} className="text-violet-500" /> Fecha y Hora
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="block text-[12px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Fecha *</label>
                                    <input
                                        type="date"
                                        required
                                        value={date}
                                        onChange={e => setDate(e.target.value)}
                                        className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-[12px] text-[14px] text-slate-800 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[12px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Hora Inicio *</label>
                                    <input
                                        type="time"
                                        required
                                        value={startTime}
                                        onChange={e => setStartTime(e.target.value)}
                                        className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-[12px] text-[14px] text-slate-800 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[12px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Hora Fin *</label>
                                    <input
                                        type="time"
                                        required
                                        value={endTime}
                                        onChange={e => setEndTime(e.target.value)}
                                        className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-[12px] text-[14px] text-slate-800 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-[20px] shadow-sm border border-slate-100">
                            <h3 className="text-[14px] font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <MapPin size={16} className="text-violet-500" /> Modalidad
                            </h3>
                            <div className="flex gap-4 mb-4">
                                <div
                                    className={`flex-1 h-20 rounded-[16px] border-2 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${type === 'meet' ? 'border-violet-500 bg-violet-50/50 text-violet-700 shadow-[0_4px_12px_rgba(139,92,246,0.1)]' : 'border-slate-100 hover:border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                    onClick={() => setType('meet')}
                                >
                                    <Video size={24} className={type === 'meet' ? 'text-violet-500' : 'opacity-50'} />
                                    <span className="text-[13px] font-bold">Google Meet</span>
                                </div>
                                <div
                                    className={`flex-1 h-20 rounded-[16px] border-2 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all ${type === 'physical' ? 'border-amber-500 bg-amber-50/50 text-amber-700 shadow-[0_4px_12px_rgba(245,158,11,0.1)]' : 'border-slate-100 hover:border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                    onClick={() => setType('physical')}
                                >
                                    <MapPin size={24} className={type === 'physical' ? 'text-amber-500' : 'opacity-50'} />
                                    <span className="text-[13px] font-bold">Presencial</span>
                                </div>
                            </div>

                            {type === 'physical' && (
                                <div className="mt-4" style={{ animation: 'fadeIn 0.2s ease-out' }}>
                                    <label className="block text-[12px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Dirección o Lugar *</label>
                                    <input
                                        type="text"
                                        required={type === 'physical'}
                                        value={location}
                                        onChange={e => setLocation(e.target.value)}
                                        placeholder="Av. del Libertador 1234, CABA"
                                        className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-[12px] text-[14px] text-slate-800 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all font-medium"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="bg-white p-5 rounded-[20px] shadow-sm border border-slate-100">
                            <h3 className="text-[14px] font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <Users size={16} className="text-violet-500" /> Responsable Principal
                            </h3>
                            <select
                                value={selectedUser}
                                onChange={e => setSelectedUser(e.target.value)}
                                className="w-full h-11 px-4 bg-slate-50 border border-slate-200 rounded-[12px] text-[14px] text-slate-800 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all font-medium"
                                required
                            >
                                <option value="" disabled>Seleccionar un responsable</option>
                                {teamUsers.map(u => (
                                    <option key={u._id} value={u._id}>{u.name || u.email}</option>
                                ))}
                            </select>
                        </div>

                        <div className="bg-white p-5 rounded-[20px] shadow-sm border border-slate-100">
                            <h3 className="text-[14px] font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <Users size={16} className="text-violet-500" /> Participantes e Invitaciones
                            </h3>
                            <div>
                                <label className="block text-[12px] font-bold text-slate-700 mb-1.5 uppercase tracking-wide">Emails de invitados (separados por comas)</label>
                                <textarea
                                    value={attendeesInput}
                                    onChange={e => setAttendeesInput(e.target.value)}
                                    rows={2}
                                    placeholder="cliente@empresa.com, socio@correo.com"
                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-[16px] text-[14px] text-slate-800 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all resize-none mb-3"
                                />

                                <label className="flex items-center gap-3 p-3 bg-violet-50/50 border border-violet-100 rounded-[12px] cursor-pointer hover:bg-violet-50 transition-colors">
                                    <div className={`w-5 h-5 rounded-[6px] border-2 flex items-center justify-center transition-all ${sendInvite ? 'bg-violet-600 border-violet-600 text-white' : 'border-slate-300 bg-white'}`}>
                                        {sendInvite && <CheckSquare size={12} strokeWidth={3} />}
                                    </div>
                                    <span className="text-[13px] font-bold text-slate-700 select-none">Enviar/Actualizar invitación por correo</span>
                                </label>
                            </div>
                        </div>

                        <div className="bg-white p-5 rounded-[20px] shadow-sm border border-slate-100">
                            <h3 className="text-[14px] font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <Search size={16} className="text-violet-500" /> Vincular a CRM
                            </h3>
                            <div className="space-y-4">
                                <div className="space-y-3 relative z-50">
                                    <AutocompleteInput
                                        label="Contactos Vinculados"
                                        icon={<Users size={14} className="text-slate-400" />}
                                        placeholder="Buscar contactos..."
                                        options={contacts.filter(c => !selectedContacts.some(sc => sc._id === c._id)).map(c => ({ _id: c._id!, title: c.fullName, subtitle: c.company?.name, data: c }))}
                                        value={contactSearch}
                                        onChangeSearch={setContactSearch}
                                        onSelect={async (item) => {
                                            setContactSearch('');
                                            const cont = item.data as ContactData;
                                            setSelectedContacts(prev => [...prev, cont]);

                                            // Auto-select company from contact if one isn't selected
                                            if (!selectedCompany && cont.company) {
                                                try {
                                                    setSelectedCompany(cont.company as any);
                                                    setCompanySearch(cont.company.name || '');
                                                } catch (error) {
                                                    console.error("Error auto-selecting company from contact", error);
                                                }
                                            }
                                        }}
                                    />
                                    {selectedContacts.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {selectedContacts.map(contact => (
                                                <div key={contact._id} className="flex items-center gap-1.5 bg-violet-50 text-violet-700 px-2.5 py-1.5 rounded-[8px] border border-violet-100 text-[12px] font-bold group shadow-sm transition-all hover:bg-violet-100 hover:border-violet-200">
                                                    {contact.fullName}
                                                    <button type="button" onClick={() => setSelectedContacts(prev => prev.filter(c => c._id !== contact._id))} className="text-violet-400 hover:text-red-500 opacity-50 group-hover:opacity-100 transition-colors ml-1 w-4 h-4 flex items-center justify-center rounded-full hover:bg-white bg-transparent">
                                                        <X size={10} strokeWidth={3} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <AutocompleteInput
                                    label="Empresa Vinculada"
                                    icon={<Search size={14} className="text-slate-400" />}
                                    placeholder="Buscar empresa..."
                                    options={companies.map(c => ({ _id: c._id!, title: c.name, data: c }))}
                                    value={companySearch}
                                    onChangeSearch={setCompanySearch}
                                    onSelect={async (item) => {
                                        setCompanySearch(item.title);
                                        const comp = item.data as CompanyData;
                                        setSelectedCompany(comp);

                                        try {
                                            const companyDetails = await getCompany(comp._id!);

                                            // Auto-select contact if only 1 exists and none are selected
                                            if (companyDetails.contacts && companyDetails.contacts.length === 1 && selectedContacts.length === 0) {
                                                const singleContact = companyDetails.contacts[0];
                                                setSelectedContacts([singleContact as any]);
                                            }

                                            // Auto-select deal if only 1 exists and none are selected
                                            if (companyDetails.deals && companyDetails.deals.length === 1 && !selectedDeal) {
                                                const singleDeal = companyDetails.deals[0];
                                                setSelectedDeal(singleDeal as any);
                                                setDealSearch(singleDeal.title);
                                            }
                                        } catch (error) {
                                            console.error('Error fetching company details for auto-selection', error);
                                        }
                                    }}
                                />
                                <AutocompleteInput
                                    label="Deal Vinculado"
                                    icon={<Search size={14} className="text-slate-400" />}
                                    placeholder="Buscar deal..."
                                    options={deals.map(d => ({ _id: d._id!, title: d.title, subtitle: d.company?.name, data: d }))}
                                    value={dealSearch}
                                    onChangeSearch={setDealSearch}
                                    onSelect={async (item) => {
                                        setDealSearch(item.title);
                                        const deal = item.data as DealData;
                                        setSelectedDeal(deal);

                                        // Auto-select company from deal
                                        if (!selectedCompany && deal.company) {
                                            setSelectedCompany(deal.company as any);
                                            setCompanySearch(deal.company.name || '');

                                            // Fetch company details to see if there's only 1 contact
                                            if (selectedContacts.length === 0) {
                                                try {
                                                    const companyDetails = await getCompany(deal.company._id!);
                                                    if (companyDetails.contacts && companyDetails.contacts.length === 1) {
                                                        const singleContact = companyDetails.contacts[0];
                                                        setSelectedContacts([singleContact as any]);
                                                    }
                                                } catch (error) {
                                                    console.error("Error auto-selecting contact from deal's company", error);
                                                }
                                            }
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                </form>

                <div className="px-6 py-4 border-t border-slate-200 bg-white flex justify-between gap-3 shrink-0">
                    <div>
                        {event && event._id && (
                            <button
                                type="button"
                                onClick={() => setShowDeleteConfirm(true)}
                                className="px-3 py-2 bg-white border border-red-100 text-red-500 rounded-[10px] hover:bg-red-50 hover:border-red-200 transition-all shadow-sm flex items-center justify-center"
                                title="Eliminar Evento"
                            >
                                <Trash2 size={16} />
                            </button>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold rounded-[12px] hover:bg-slate-50 transition-colors text-[14px]"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            form="event-form"
                            disabled={saving || !title || !date || !startTime || !endTime || (type === 'physical' && !location)}
                            className="px-6 py-2.5 bg-violet-600 text-white font-bold rounded-[12px] hover:bg-violet-700 hover:-translate-y-0.5 transition-all shadow-sm shadow-violet-500/30 flex items-center gap-2 text-[14px] disabled:opacity-50 disabled:pointer-events-none"
                        >
                            {saving ? (
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Save size={16} />
                            )}
                            {event ? 'Guardar Cambios' : 'Agendar'}
                        </button>
                    </div>
                </div>

                {showDeleteConfirm && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" style={{ animation: 'fadeIn 0.2s ease-out' }}>
                        <div className="bg-white rounded-[24px] p-6 max-w-sm w-full shadow-[0_20px_60px_rgba(0,0,0,0.1)] border border-slate-100" onClick={e => e.stopPropagation()}>
                            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-[16px] flex items-center justify-center mb-5 border border-red-100 shadow-inner">
                                <AlertTriangle size={28} />
                            </div>
                            <h3 className="text-[20px] font-bold text-slate-800 mb-2 tracking-tight">¿Estás seguro?</h3>
                            <p className="text-slate-500 text-[14px] mb-6 leading-relaxed">
                                Se eliminará el evento <strong>{event?.title}</strong> y se borrará también de tu calendario de Google y del CRM.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className="flex-1 py-3 px-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-[14px] hover:bg-slate-50 transition-colors text-[14px]"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleDelete}
                                    className="flex-1 py-3 px-4 bg-red-500 text-white font-bold rounded-[14px] hover:bg-red-600 transition-colors shadow-sm shadow-red-500/30 text-[14px]"
                                >
                                    Sí, eliminar
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
            `}</style>
        </div>
    );
}
