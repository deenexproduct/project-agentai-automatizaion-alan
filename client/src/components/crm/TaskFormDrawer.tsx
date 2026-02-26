import { useState, useEffect, useRef } from 'react';
import { X, Save, Clock, Building2, User, Briefcase, Tag, Flag, AlertTriangle, Trash2 } from 'lucide-react';
import { TaskData, createTask, updateTask, deleteTask, getTask, getContacts, getCompanies, getDealsPipeline, getCompany, ContactData, CompanyData, DealData, getTeamUsers, TeamUser, completeTask } from '../../services/crm.service';
import { formatToLocalDateTimeInput, getDefaultTaskDueDate } from '../../utils/date';
import AutocompleteInput from '../common/AutocompleteInput';
import OwnerAvatar from '../common/OwnerAvatar';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
    task?: TaskData | null;
    open: boolean;
    initialDate?: Date;
    onClose: () => void;
    onSaved: () => void;
}

export default function TaskFormDrawer({ task, open, initialDate, onClose, onSaved }: Props) {
    const { user } = useAuth();
    const [formData, setFormData] = useState<Partial<TaskData>>({
        title: '',
        type: 'follow_up',
        priority: 'high',
        status: 'pending',
        dueDate: '',
        company: undefined,
        contact: undefined,
        deal: undefined,
    });

    const [companies, setCompanies] = useState<CompanyData[]>([]);
    const [contacts, setContacts] = useState<ContactData[]>([]);
    const [deals, setDeals] = useState<DealData[]>([]);

    const [companySearch, setCompanySearch] = useState('');
    const [contactSearch, setContactSearch] = useState('');
    const [dealSearch, setDealSearch] = useState('');
    const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);

    const [saving, setSaving] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    const drawerRef = useRef<HTMLDivElement>(null);

    // Initial data
    useEffect(() => {
        if (open && task) {
            if (task._id && !task.title && !task.dueDate) {
                // Fetch full task data when only _id is provided (e.g., deep linking)
                getTask(task._id).then(fullTask => {
                    setFormData({
                        title: fullTask.title || '',
                        type: fullTask.type || 'follow_up',
                        priority: fullTask.priority || 'medium',
                        status: fullTask.status || 'pending',
                        dueDate: fullTask.dueDate ? formatToLocalDateTimeInput(fullTask.dueDate) : '', // 'YYYY-MM-DDTHH:mm'
                        company: fullTask.company,
                        contact: fullTask.contact,
                        deal: fullTask.deal,
                        assignedTo: (fullTask as any).assignedTo,
                    });
                    setCompanySearch(fullTask.company?.name || '');
                    setContactSearch(fullTask.contact?.fullName || '');
                    setDealSearch(fullTask.deal?.title || '');
                }).catch(err => {
                    console.error("Failed to fetch task details", err);
                });
            } else {
                setFormData({
                    title: task.title || '',
                    type: task.type || 'follow_up',
                    priority: task.priority || 'medium',
                    status: task.status || 'pending',
                    dueDate: task.dueDate ? formatToLocalDateTimeInput(task.dueDate) : '', // 'YYYY-MM-DDTHH:mm'
                    company: task.company,
                    contact: task.contact,
                    deal: task.deal,
                    assignedTo: (task as any).assignedTo,
                });
                setCompanySearch(task.company?.name || '');
                setContactSearch(task.contact?.fullName || '');
                setDealSearch(task.deal?.title || '');
            }
        } else if (open && !task) {
            let defaultDueDate = '';
            if (initialDate && (initialDate.getHours() !== 0 || initialDate.getMinutes() !== 0)) {
                defaultDueDate = formatToLocalDateTimeInput(initialDate);
            } else {
                defaultDueDate = getDefaultTaskDueDate(initialDate);
            }

            setFormData({
                title: '',
                type: 'follow_up',
                priority: 'high',
                status: 'pending',
                dueDate: defaultDueDate,
                company: undefined,
                contact: undefined,
                deal: undefined,
                assignedTo: (user?._id || (user as any)?.id) as any,
            });
            setCompanySearch('');
            setContactSearch('');
            setDealSearch('');
        }
        setShowDeleteConfirm(false);
        setIsDirty(false);
    }, [open, task, user?._id, (user as any)?.id]);

    // Autocomplete Companies
    useEffect(() => {
        if (!open) return;
        if (formData.company && formData.company.name === companySearch) return;
        const fetchComps = async () => {
            try {
                const res = await getCompanies({ search: companySearch, limit: 10 });
                setCompanies(res.companies);
            } catch { /* ignore */ }
        };
        const timeoutId = setTimeout(fetchComps, 300);
        return () => clearTimeout(timeoutId);
    }, [companySearch, open, formData.company]);

    // Autocomplete Contacts
    useEffect(() => {
        if (!open) return;
        if (formData.contact && formData.contact.fullName === contactSearch) return;
        const fetchConts = async () => {
            try {
                // If a company is selected, filter contacts by that company
                const companyId = formData.company?._id;
                const res = await getContacts({ search: contactSearch, limit: companyId ? 100 : 10, company: companyId });
                setContacts(res.contacts);
            } catch { /* ignore */ }
        };
        const timeoutId = setTimeout(fetchConts, 300);
        return () => clearTimeout(timeoutId);
    }, [contactSearch, open, formData.contact, formData.company]);

    // Autocomplete Deals
    useEffect(() => {
        if (!open) return;
        if (formData.deal && formData.deal.title === dealSearch) return;
        const fetchDeals = async () => {
            try {
                // We'll extract all deals from the pipeline matching the search
                const res = await getDealsPipeline();
                const allDeals = res.stages.flatMap(s => s.deals);
                const filtered = dealSearch
                    ? allDeals.filter(d => d.title.toLowerCase().includes(dealSearch.toLowerCase()))
                    : allDeals.slice(0, 10);
                setDeals(filtered);
            } catch { /* ignore */ }
        };
        const timeoutId = setTimeout(fetchDeals, 300);
        return () => clearTimeout(timeoutId);
    }, [dealSearch, open, formData.deal]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleAttemptClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, isDirty]);

    const handleAttemptClose = () => {
        if (isDirty) {
            setShowUnsavedConfirm(true);
        } else {
            onClose();
        }
    };

    // Load team users
    useEffect(() => {
        if (!open) return;
        getTeamUsers().then(setTeamUsers).catch(console.error);
    }, [open]);

    const handleDeleteTask = async () => {
        if (!task?._id) return;
        try {
            await deleteTask(task._id);
            onSaved();
            onClose();
        } catch (error) {
            console.error('Error al eliminar tarea:', error);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
            handleAttemptClose();
        }
    };

    const handleSelectCompany = async (comp: CompanyData) => {
        setFormData(prev => ({ ...prev, company: { _id: comp._id, name: comp.name } as any }));
        setCompanySearch(comp.name);

        try {
            const companyDetails = await getCompany(comp._id);

            // Auto-select contact if only 1 exists
            if (companyDetails.contacts && companyDetails.contacts.length === 1) {
                const singleContact = companyDetails.contacts[0];
                setFormData(prev => ({ ...prev, contact: { _id: singleContact._id, fullName: singleContact.fullName } as any }));
                setContactSearch(singleContact.fullName);
            }

            // Auto-select deal if only 1 exists
            if (companyDetails.deals && companyDetails.deals.length === 1) {
                const singleDeal = companyDetails.deals[0];
                setFormData(prev => ({ ...prev, deal: { _id: singleDeal._id, title: singleDeal.title } as any }));
                setDealSearch(singleDeal.title);
            }
        } catch (error) {
            console.error('Error fetching company details for auto-selection', error);
        }
    };

    const handleSelectContact = async (cont: ContactData) => {
        setFormData(prev => ({ ...prev, contact: { _id: cont._id, fullName: cont.fullName } as any }));
        setContactSearch(cont.fullName);

        // Auto-select company from contact if one isn't selected
        if (!formData.company && cont.company) {
            try {
                // Fetch the full company details or just use the nested object if it has id and name
                setFormData(prev => ({ ...prev, company: cont.company as any }));
                setCompanySearch(cont.company.name || '');
            } catch (error) {
                console.error("Error auto-selecting company from contact", error);
            }
        }
    };

    const handleSelectDeal = async (deal: DealData) => {
        setFormData(prev => ({ ...prev, deal: { _id: deal._id, title: deal.title } as any }));
        setDealSearch(deal.title);

        // Auto-select company from deal
        if (!formData.company && deal.company) {
            setFormData(prev => ({ ...prev, company: deal.company as any }));
            setCompanySearch(deal.company.name || '');

            // Fetch company details to see if there's only 1 contact
            if (!formData.contact || !formData.contact._id) {
                try {
                    const companyDetails = await getCompany(deal.company._id!);
                    if (companyDetails.contacts && companyDetails.contacts.length === 1) {
                        const singleContact = companyDetails.contacts[0];
                        setFormData(prev => ({ ...prev, contact: { _id: singleContact._id, fullName: singleContact.fullName } as any }));
                        setContactSearch(singleContact.fullName);
                    }
                } catch (error) {
                    console.error("Error auto-selecting contact from deal's company", error);
                }
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            // Build a clean payload with ONLY the fields the backend schema accepts.
            // This prevents sending virtual fields (isOverdue), metadata (_id, createdAt, __v),
            // or populated objects that would cause Mongoose CastErrors.
            const assignedToRaw = (formData as any).assignedTo;
            const assignedToId = assignedToRaw
                ? (typeof assignedToRaw === 'string' ? assignedToRaw : assignedToRaw._id || null)
                : null;

            const payload: Record<string, any> = {
                title: formData.title,
                type: formData.type,
                priority: formData.priority,
                status: formData.status,
                company: formData.company?._id || null,
                contact: formData.contact?._id || null,
                deal: formData.deal?._id || null,
                assignedTo: assignedToId,
            };

            // Only send dueDate if it has a value; convert datetime-local to ISO
            if (formData.dueDate) {
                payload.dueDate = new Date(formData.dueDate as string).toISOString();
            }

            if (task?._id) {
                // If status changed to completed, use the completeTask endpoint for Activity creation
                if (formData.status === 'completed' && task.status !== 'completed') {
                    await completeTask(task._id);
                    // Also update other changed fields (excluding status, already handled)
                    const { status, ...otherFields } = payload;
                    await updateTask(task._id, otherFields);
                } else {
                    await updateTask(task._id, payload);
                }
            } else {
                await createTask(payload);
            }
            onSaved();
            onClose();
        } catch (error: any) {
            console.error('Error saving task:', error?.response?.data || error?.message || error);
            alert(`Error al guardar la tarea: ${error?.response?.data?.error || error?.message || 'Error desconocido'}`);
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <div
            onClick={handleBackdropClick}
            className="fixed inset-0 z-[100] flex justify-end"
            style={{
                background: 'rgba(15, 23, 42, 0.4)', // Darker, moodier slate backdrop
                backdropFilter: 'blur(8px)',
                animation: 'fadeIn 0.3s ease-out',
            }}
        >
            <div
                ref={drawerRef}
                className="h-full overflow-y-auto w-[460px] max-w-[100vw] bg-white/90 backdrop-blur-2xl border-l border-white/60 flex flex-col shadow-[-20px_0_40px_rgba(30,27,75,0.1)] relative"
                style={{
                    animation: 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
            >
                {/* Decorative Edge Highlight */}
                <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-violet-500/50 via-emerald-500/50 to-transparent" />

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-200/50 bg-white/50 backdrop-blur-md sticky top-0 z-20">
                    <div>
                        <h2 className="text-[20px] font-bold text-slate-800 tracking-tight flex items-center gap-2">
                            <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-sm">
                                <Flag size={16} className="text-white" />
                            </div>
                            {task ? 'Editar Tarea' : 'Nueva Tarea'}
                        </h2>
                        <p className="text-[13px] font-medium text-slate-500 mt-1 ml-10">
                            {task ? 'Modifica los datos de la tarea.' : 'Programa una nueva tarea.'}
                        </p>
                    </div>
                    <button
                        onClick={handleAttemptClose}
                        className="w-8 h-8 rounded-[10px] flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700 bg-white border border-slate-200 shadow-sm"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Form */}
                <form id="task-form" onSubmit={handleSubmit} onChange={() => setIsDirty(true)} className="p-6 flex-1 flex flex-col gap-6">

                    <div className="space-y-2">
                        <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                            Título de la Tarea *
                        </label>
                        <input
                            required
                            type="text"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            placeholder="Ej. Llamar para seguimiento"
                            className="w-full px-4 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-2">
                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                <Tag size={14} className="text-slate-500" />
                                Tipo
                            </label>
                            <select
                                value={formData.type}
                                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                                className="w-full px-4 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-300 transition-all text-[14px] font-medium text-slate-700 shadow-inner appearance-none cursor-pointer"
                            >
                                <option value="call">Llamada</option>
                                <option value="meeting">Reunión</option>
                                <option value="email">Email</option>
                                <option value="follow_up">Seguimiento</option>
                                <option value="proposal">Propuesta</option>
                                <option value="research">Investigación</option>
                                <option value="other">Otro</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                <Flag size={14} className={formData.priority === 'urgent' ? 'text-red-500' : 'text-slate-500'} />
                                Prioridad
                            </label>
                            <select
                                value={formData.priority}
                                onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                                className="w-full px-4 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-300 transition-all text-[14px] font-medium text-slate-700 shadow-inner appearance-none cursor-pointer"
                            >
                                <option value="low">Baja</option>
                                <option value="medium">Media</option>
                                <option value="high">Alta</option>
                                <option value="urgent">Urgente</option>
                            </select>
                        </div>
                    </div>

                    {/* Status Selector — only show when editing an existing task */}
                    {task && task._id && (
                        <div className="space-y-2">
                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                <Clock size={14} className="text-violet-500" />
                                Estado
                            </label>
                            <select
                                value={formData.status}
                                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                                className={`w-full px-4 py-3 bg-white/60 backdrop-blur-sm border rounded-[14px] focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-300 transition-all text-[14px] font-bold shadow-inner appearance-none cursor-pointer ${formData.status === 'pending' ? 'border-slate-300 text-slate-700' :
                                    formData.status === 'in_progress' ? 'border-blue-300 text-blue-700 bg-blue-50/50' :
                                        formData.status === 'completed' ? 'border-emerald-300 text-emerald-700 bg-emerald-50/50' :
                                            'border-red-300 text-red-700 bg-red-50/50'
                                    }`}
                            >
                                <option value="pending">Pendiente</option>
                                <option value="in_progress">En Progreso</option>
                                <option value="completed">Completada</option>
                                <option value="cancelled">Cancelada</option>
                            </select>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                            <Clock size={14} className="text-blue-500" />
                            Fecha y Hora de Vencimiento
                        </label>
                        <div className="relative w-full">
                            <input
                                type="datetime-local"
                                value={formData.dueDate}
                                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                                className="w-full px-4 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-300 transition-all text-[14px] font-medium text-slate-700 shadow-inner custom-date-input"
                            />
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 bg-white/80 pl-2">
                                <Clock size={16} />
                            </div>
                        </div>
                    </div>

                    {/* Company Autocomplete */}
                    <div className="pt-6 border-t border-slate-200/50">
                        <AutocompleteInput
                            label="Empresa"
                            icon={<Building2 size={14} className="text-indigo-500" />}
                            placeholder="Asociar a empresa..."
                            value={companySearch}
                            onChangeSearch={(val) => {
                                setCompanySearch(val);
                                setFormData(prev => ({ ...prev, company: undefined }));
                            }}
                            options={companies.map(c => ({ _id: c._id, title: c.name, data: c }))}
                            onSelect={(opt) => handleSelectCompany(opt.data)}
                            colorTheme="indigo"
                        />
                    </div>

                    {/* Contact Autocomplete */}
                    <AutocompleteInput
                        label="Contacto"
                        icon={<User size={14} className="text-emerald-500" />}
                        placeholder="Asociar a contacto..."
                        value={contactSearch}
                        onChangeSearch={(val) => {
                            setContactSearch(val);
                            setFormData(prev => ({ ...prev, contact: undefined }));
                        }}
                        options={contacts.map(c => ({ _id: c._id, title: c.fullName, data: c }))}
                        onSelect={(opt) => handleSelectContact(opt.data)}
                        colorTheme="emerald"
                    />

                    {/* Deal Autocomplete */}
                    <AutocompleteInput
                        label="Deal (Oportunidad)"
                        icon={<Briefcase size={14} className="text-amber-500" />}
                        placeholder="Asociar a un Deal..."
                        value={dealSearch}
                        onChangeSearch={(val) => {
                            setDealSearch(val);
                            setFormData(prev => ({ ...prev, deal: undefined }));
                        }}
                        options={deals.map(d => ({
                            _id: d._id,
                            title: d.title,
                            subtitle: d.value != null ? `$${d.value} ` : undefined,
                            data: d
                        }))}
                        onSelect={(opt) => handleSelectDeal(opt.data)}
                        colorTheme="amber"
                    />

                    {/* Responsable Selector */}
                    <div className="space-y-2 pt-6 border-t border-slate-200/50">
                        <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                            <User size={14} className="text-fuchsia-500" />
                            Responsable
                        </label>
                        <div className="relative w-full">
                            <select
                                value={(formData as any).assignedTo?._id || (formData as any).assignedTo || ''}
                                onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value as any })}
                                className="w-full pl-12 pr-10 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-fuchsia-500/10 focus:border-fuchsia-300 transition-all text-[14px] font-bold text-slate-700 shadow-inner appearance-none cursor-pointer"
                            >
                                <option value="">Sin asignar</option>
                                {teamUsers.map(u => (
                                    <option key={u._id} value={u._id}>{u.name || u.email}</option>
                                ))}
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

                    <div className="mt-auto pt-4 border-t border-slate-200/50 flex gap-3 bg-white/50 backdrop-blur-md sticky bottom-0 -mx-6 px-6 pb-4">
                        {task && task._id && (
                            <button
                                type="button"
                                onClick={() => setShowDeleteConfirm(true)}
                                className="px-3 py-2 bg-white border border-red-100 text-red-500 rounded-[10px] hover:bg-red-50 hover:border-red-200 transition-all shadow-sm"
                                title="Eliminar Tarea"
                            >
                                <Trash2 size={16} />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleAttemptClose}
                            className="flex-1 px-4 py-2 bg-white border border-slate-200/80 text-slate-600 rounded-[10px] text-[13px] font-bold hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || !formData.title}
                            className="flex-1 px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-[10px] text-[13px] font-bold hover:shadow-[0_8px_24px_rgba(139,92,246,0.4)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(139,92,246,0.3)]"
                        >
                            {saving ? 'Guardando...' : <><Save size={16} /> Guardar Tarea</>}
                        </button>
                    </div>
                </form>
            </div>

            {/* ── Delete Confirmation Modal ─────────────── */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" style={{ animation: 'fadeIn 0.2s ease-out' }}>
                    <div className="bg-white rounded-[24px] p-6 max-w-sm w-full shadow-[0_20px_60px_rgba(0,0,0,0.1)] border border-slate-100" onClick={e => e.stopPropagation()}>
                        <div className="w-14 h-14 bg-red-50 text-red-500 rounded-[16px] flex items-center justify-center mb-5 border border-red-100 shadow-inner">
                            <AlertTriangle size={28} />
                        </div>
                        <h3 className="text-[20px] font-bold text-slate-800 mb-2 tracking-tight">¿Eliminar Tarea?</h3>
                        <p className="text-slate-500 text-[14px] mb-6 leading-relaxed">
                            Estás a punto de eliminar la tarea <strong>{task?.title}</strong>. Esta acción no se puede deshacer.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="flex-1 py-3 px-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-[14px] hover:bg-slate-50 transition-colors text-[14px]"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDeleteTask}
                                className="flex-1 py-3 px-4 bg-red-500 text-white font-bold rounded-[14px] hover:bg-red-600 transition-colors shadow-sm shadow-red-500/30 text-[14px]"
                            >
                                Sí, eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                            <button
                                type="button"
                                onClick={() => { setShowUnsavedConfirm(false); setIsDirty(false); onClose(); }}
                                className="flex-1 py-3 px-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-[14px] hover:bg-slate-50 transition-colors shadow-sm text-[14px]"
                            >
                                No, salir
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowUnsavedConfirm(false);
                                    const form = document.getElementById('task-form') as HTMLFormElement;
                                    if (form) form.requestSubmit();
                                }}
                                className="flex-1 py-3 px-4 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold rounded-[14px] hover:shadow-md transition-all shadow-sm text-[14px]"
                            >
                                Sí, guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
                @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                .custom-date-input::-webkit-calendar-picker-indicator {
                    background: transparent;
                    bottom: 0;
                    color: transparent;
                    cursor: pointer;
                    height: auto;
                    left: 0;
                    position: absolute;
                    right: 0;
                    top: 0;
                    width: auto;
                }
            `}</style>
        </div>
    );
}
