import { useState, useEffect, useRef } from 'react';
import { X, Save, Clock, Building2, User, Briefcase, Tag, Flag } from 'lucide-react';
import { TaskData, createTask, updateTask, getCompanies, getContacts, getDealsPipeline, getCompany, CompanyData, ContactData, DealData } from '../../services/crm.service';
import AutocompleteInput from '../common/AutocompleteInput';

interface Props {
    task?: TaskData | null;
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
}

export default function TaskFormDrawer({ task, open, onClose, onSaved }: Props) {
    const [formData, setFormData] = useState<Partial<TaskData>>({
        title: '',
        type: 'follow_up',
        priority: 'medium',
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

    const [saving, setSaving] = useState(false);

    const drawerRef = useRef<HTMLDivElement>(null);

    // Initial data
    useEffect(() => {
        if (open && task) {
            setFormData({
                title: task.title || '',
                type: task.type || 'follow_up',
                priority: task.priority || 'medium',
                status: task.status || 'pending',
                dueDate: task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : '', // 'YYYY-MM-DDTHH:mm'
                company: task.company,
                contact: task.contact,
                deal: task.deal,
            });
            setCompanySearch(task.company?.name || '');
            setContactSearch(task.contact?.fullName || '');
            setDealSearch(task.deal?.title || '');
        } else if (open && !task) {
            setFormData({
                title: '',
                type: 'follow_up',
                priority: 'medium',
                status: 'pending',
                dueDate: '',
                company: undefined,
                contact: undefined,
                deal: undefined,
            });
            setCompanySearch('');
            setContactSearch('');
            setDealSearch('');
        }
    }, [open, task]);

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
                const res = await getContacts({ search: contactSearch, limit: 10 });
                setContacts(res.contacts);
            } catch { /* ignore */ }
        };
        const timeoutId = setTimeout(fetchConts, 300);
        return () => clearTimeout(timeoutId);
    }, [contactSearch, open, formData.contact]);

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
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, onClose]);

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
            onClose();
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

    const handleSelectContact = (cont: ContactData) => {
        setFormData(prev => ({ ...prev, contact: { _id: cont._id, fullName: cont.fullName } as any }));
        setContactSearch(cont.fullName);
    };

    const handleSelectDeal = (deal: DealData) => {
        setFormData(prev => ({ ...prev, deal: { _id: deal._id, title: deal.title } as any }));
        setDealSearch(deal.title);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = {
                ...formData,
                company: formData.company?._id as any,
                contact: formData.contact?._id as any,
                deal: formData.deal?._id as any,
            };
            if (!payload.dueDate) delete payload.dueDate;

            if (task?._id) {
                await updateTask(task._id, payload);
            } else {
                await createTask(payload);
            }
            onSaved();
            onClose();
        } catch (error) {
            console.error('Error saving task:', error);
            alert('Error al guardar la tarea');
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
                            {task ? `Editar ${formData.title || 'Tarea'}` : 'Nueva Tarea'}
                        </h2>
                        <p className="text-[13px] font-medium text-slate-500 mt-1 ml-10">
                            {task ? 'Modifica los datos de la tarea.' : 'Programa una nueva tarea.'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-[10px] flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700 bg-white border border-slate-200 shadow-sm"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 flex-1 flex flex-col gap-6">

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
                            subtitle: d.value != null ? `$${d.value}` : undefined,
                            data: d
                        }))}
                        onSelect={(opt) => handleSelectDeal(opt.data)}
                        colorTheme="amber"
                    />

                    <div className="mt-auto pt-4 border-t border-slate-200/50 flex gap-3 bg-white/50 backdrop-blur-md sticky bottom-0 -mx-6 px-6 pb-4">
                        <button
                            type="button"
                            onClick={onClose}
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

            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
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
