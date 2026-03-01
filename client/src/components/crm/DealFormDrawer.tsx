import { useState, useEffect, useRef } from 'react';
import { X, Save, DollarSign, Calendar, Building2, User, Briefcase, MessageCircle, Mail, History, FileText, ListTodo, CheckSquare, Plus, ChevronRight, Check, UserPlus, XCircle, Phone, Linkedin, Users, Send, Loader2, Clock, AlertTriangle } from 'lucide-react';
import { DealData, getDeal, createDeal, updateDeal, getCompanies, getContacts, CompanyData, ContactData, getTasks, TaskData, updateCompany, updateTask, getDealActivities, createActivity, ActivityData, getTeamUsers, TeamUser } from '../../services/crm.service';
import { formatToArgentineDateTime, formatToArgentineDate } from '../../utils/date';
import OwnerAvatar from '../common/OwnerAvatar';
import { useAuth } from '../../contexts/AuthContext';
import ContactFormDrawer from './ContactFormDrawer';
import TaskFormDrawer from './TaskFormDrawer';
import ActivityTimeline from './ActivityTimeline';

interface StageData {
    key: string;
    label: string;
}

interface Props {
    deal?: DealData | null;
    open: boolean;
    stages: StageData[];
    onClose: () => void;
    onSaved: () => void; // Trigger reload of pipeline
}

export default function DealFormDrawer({ deal, open, stages, onClose, onSaved }: Props) {
    const { user } = useAuth();
    const [formData, setFormData] = useState<Partial<DealData>>({
        value: 0,
        currency: 'USD',
        status: stages.length > 0 ? stages[0].key : 'lead',
        expectedCloseDate: '',
        company: undefined,
        primaryContact: undefined,
    });

    const [notes, setNotes] = useState('');
    const [companyLocales, setCompanyLocales] = useState<number>(0);
    const [companyFranchise, setCompanyFranchise] = useState<number>(0);
    const [companyOwned, setCompanyOwned] = useState<number>(0);
    const [companyCostPerLocation, setCompanyCostPerLocation] = useState<number>(0);
    const [initialLocales, setInitialLocales] = useState<number>(0);
    const [initialValue, setInitialValue] = useState<number>(0);
    const [companies, setCompanies] = useState<CompanyData[]>([]);
    const [contacts, setContacts] = useState<ContactData[]>([]);
    const [dealTasks, setDealTasks] = useState<TaskData[]>([]);
    const [selectedContacts, setSelectedContacts] = useState<ContactData[]>([]);
    const [companySearch, setCompanySearch] = useState('');
    const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
    const [showContactPicker, setShowContactPicker] = useState(false);
    const companyFieldRef = useRef<HTMLDivElement>(null);
    const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);

    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'info' | 'activity' | 'history' | 'tasks'>('info');
    const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    const [isContactDrawerOpen, setIsContactDrawerOpen] = useState(false);
    const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<TaskData | null>(null);

    // Activity state
    const [dealActivities, setDealActivities] = useState<ActivityData[]>([]);
    const [loadingActivities, setLoadingActivities] = useState(false);
    const [showActivityForm, setShowActivityForm] = useState(false);
    const [actType, setActType] = useState<'call' | 'whatsapp' | 'linkedin_message' | 'email' | 'meeting' | 'note'>('call');
    const [actDescription, setActDescription] = useState('');
    const [actOutcome, setActOutcome] = useState('');
    const [actContactId, setActContactId] = useState('');
    const [savingActivity, setSavingActivity] = useState(false);
    const [currentDealData, setCurrentDealData] = useState<DealData | null>(deal || null);

    const drawerRef = useRef<HTMLDivElement>(null);

    // Sync initial deal prop
    useEffect(() => {
        if (open) {
            setCurrentDealData(deal || null);
        }
    }, [deal, open]);

    // Initial data
    useEffect(() => {
        if (open && deal?._id) {
            // 1. Immediately sync whatever data we have so the UI doesn't flash empty
            setFormData({
                title: deal.title || '',
                value: deal.value || 0,
                status: deal.status || (stages.length > 0 ? stages[0].key : 'lead'),
                expectedCloseDate: deal.expectedCloseDate ? String(deal.expectedCloseDate).substring(0, 10) : '',
                company: deal.company as any,
                primaryContact: deal.primaryContact as any,
                assignedTo: (deal as any).assignedTo,
            });
            setCompanySearch(deal.company?.name || '');
            setCompanyLocales(deal.company?.localesCount || 0);
            setCompanyFranchise(deal.company?.franchiseCount || 0);
            setCompanyOwned(deal.company?.ownedCount || 0);
            setCompanyCostPerLocation((deal.company as any)?.costPerLocation || 0);
            setInitialLocales(deal.company?.localesCount || 0);
            setInitialValue(deal.value || 0);

            if (deal.contacts && deal.contacts.length > 0) {
                setSelectedContacts(deal.contacts as any);
            } else if (deal.primaryContact) {
                setSelectedContacts([deal.primaryContact as any]);
            } else {
                setSelectedContacts([]);
            }

            setNotes((deal as any).notes?.length ? (deal as any).notes[0].text : '');

            // Load tasks
            getTasks({ deal: deal._id, limit: 50 }).then(res => setDealTasks(res.tasks)).catch(() => { });

            // Load contacts for this company
            if (deal.company?._id) {
                getContacts({ company: deal.company._id, limit: 100 }).then(res => setContacts(res.contacts)).catch(() => { });
            }

            // 2. ALWAYS fetch the absolute latest full deal to guarantee traceability fields like `statusHistory.changedBy` are 100% populated
            getDeal(deal._id).then(fullDeal => {
                setCurrentDealData(fullDeal);

                // Recalculate value from company data if deal value is 0 and company has cost data
                const companyData = fullDeal.company as any;
                let recalculatedValue = fullDeal.value || 0;
                if (recalculatedValue === 0 && companyData?.localesCount && companyData?.costPerLocation) {
                    recalculatedValue = Math.round((companyData.localesCount * companyData.costPerLocation) * 100) / 100;
                }

                // True-up the form data to ensure absolute correctness
                setFormData({
                    title: fullDeal.title || '',
                    value: recalculatedValue,
                    status: fullDeal.status || (stages.length > 0 ? stages[0].key : 'lead'),
                    expectedCloseDate: fullDeal.expectedCloseDate ? String(fullDeal.expectedCloseDate).substring(0, 10) : '',
                    company: fullDeal.company as any,
                    primaryContact: fullDeal.primaryContact as any,
                    assignedTo: (fullDeal as any).assignedTo,
                });

                // Sync company-related state (fixes empty company field on deep-link)
                setCompanySearch(fullDeal.company?.name || '');
                setCompanyLocales(fullDeal.company?.localesCount || 0);
                setCompanyFranchise((fullDeal.company as any)?.franchiseCount || 0);
                setCompanyOwned((fullDeal.company as any)?.ownedCount || 0);
                setCompanyCostPerLocation(companyData?.costPerLocation || 0);
                setInitialLocales(fullDeal.company?.localesCount || 0);
                setInitialValue(recalculatedValue);

                // Load contacts for the company
                if (fullDeal.company?._id) {
                    getContacts({ company: fullDeal.company._id, limit: 100 }).then(res => setContacts(res.contacts)).catch(() => { });
                }

                if (fullDeal.contacts && fullDeal.contacts.length > 0) {
                    setSelectedContacts(fullDeal.contacts as any);
                } else if (fullDeal.primaryContact) {
                    setSelectedContacts([fullDeal.primaryContact as any]);
                } else {
                    setSelectedContacts([]);
                }
            }).catch(console.error);

        } else if (open && !deal?._id) {
            const defaultDate = new Date();
            defaultDate.setDate(defaultDate.getDate() + 30);

            setFormData({
                value: deal?.value || 0,
                status: deal?.status || (stages.length > 0 ? stages[0].key : 'lead'),
                expectedCloseDate: defaultDate.toISOString().split('T')[0],
                company: deal?.company as any || undefined,
                primaryContact: deal?.primaryContact as any || undefined,
                assignedTo: (user?._id || (user as any)?.id) as any,
            });
            setSelectedContacts([]);
            setCompanySearch('');
            setCompanyLocales(0);
            setCompanyFranchise(0);
            setCompanyOwned(0);
            setCompanyCostPerLocation(0);
            setInitialLocales(0);
            setInitialValue(0);
            setNotes('');
            setContacts([]);
            setDealTasks([]);
            setActiveTab('info');
        }
    }, [open, deal?._id, stages, user?._id, (user as any)?.id]);

    // Load activities when Actividad tab opens
    useEffect(() => {
        if (activeTab === 'activity' && deal?._id) {
            setLoadingActivities(true);
            getDealActivities(deal._id)
                .then(res => setDealActivities(res.activities))
                .catch(() => setDealActivities([]))
                .finally(() => setLoadingActivities(false));
        }
    }, [activeTab, deal?._id]);

    // Autocomplete Companies — load on open and filter as user types
    useEffect(() => {
        if (!open) return;
        const fetchComps = async () => {
            try {
                const res = await getCompanies({ search: companySearch, limit: 20 });
                setCompanies(res.companies);
            } catch { /* ignore */ }
        };
        const timeoutId = setTimeout(fetchComps, companySearch ? 300 : 0);
        return () => clearTimeout(timeoutId);
    }, [companySearch, open]);

    // Close company dropdown when clicking outside
    useEffect(() => {
        if (!showCompanyDropdown) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (companyFieldRef.current && !companyFieldRef.current.contains(e.target as Node)) {
                setShowCompanyDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showCompanyDropdown]);

    // Load team users
    useEffect(() => {
        if (!open) return;
        getTeamUsers().then(setTeamUsers).catch(console.error);
    }, [open]);

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

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
            // Disabled closing on backdrop click to prevent losing form data accidentally
        }
    };

    const handleSelectCompany = async (comp: CompanyData) => {
        const rawValue = (comp.localesCount && comp.costPerLocation) ? (comp.localesCount * comp.costPerLocation) : formData.value;
        const leadValue = Math.round((rawValue || 0) * 100) / 100;
        setFormData({
            ...formData,
            company: { _id: comp._id, name: comp.name } as any,
            primaryContact: undefined,
            value: leadValue
        });
        setCompanySearch(comp.name);
        setShowCompanyDropdown(false);
        setCompanyLocales(comp.localesCount || 0);
        setCompanyFranchise(comp.franchiseCount || 0);
        setCompanyOwned(comp.ownedCount || 0);
        setCompanyCostPerLocation((comp as any).costPerLocation || 0);
        setInitialLocales(comp.localesCount || 0);
        setInitialValue(leadValue || 0);
        setSelectedContacts([]);

        // Fetch contacts for this company
        try {
            const res = await getContacts({ company: comp._id, limit: 100 });
            setContacts(res.contacts);
            // Auto select if only one contact
            if (res.contacts.length === 1) {
                setSelectedContacts([res.contacts[0]]);
                setFormData(prev => ({ ...prev, primaryContact: { _id: res.contacts[0]._id, fullName: res.contacts[0].fullName } as any }));
            }
        } catch { /* ignore */ }
    };

    const handleLocalesChange = (val: number) => {
        setCompanyLocales(val);
        // Auto-recalculate deal value when locales change and costPerLocation is available
        if (companyCostPerLocation > 0 && val > 0) {
            const newValue = Math.round((val * companyCostPerLocation) * 100) / 100;
            setFormData(prev => ({ ...prev, value: newValue }));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.company) {
            alert("Debe seleccionar una empresa.");
            return;
        }
        setSaving(true);
        try {
            // Auto generate title
            const autoTitle = `${formData.company?.name || 'Deal'} - ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

            const payload: any = {
                ...formData,
                title: autoTitle,
                company: formData.company?._id as any,
                primaryContact: formData.primaryContact ? (formData.primaryContact as any)._id || formData.primaryContact : undefined,
                contacts: selectedContacts.map(c => c._id),
                notes: notes ? [{ type: 'note', text: notes }] : [],
                assignedTo: (formData as any).assignedTo ? (formData as any).assignedTo._id || (formData as any).assignedTo : null,
            };

            if (deal?._id) {
                await updateDeal(deal._id, payload);
            } else {
                await createDeal(payload);
            }

            // Sync locales back to company if it changed
            if (formData.company?._id && companyLocales > 0) {
                await updateCompany(formData.company._id, { localesCount: companyLocales, franchiseCount: companyFranchise, ownedCount: companyOwned } as any);
            }

            onSaved();
            onClose();
        } catch (error) {
            console.error('Error saving deal:', error);
            alert('Error al guardar la oportunidad');
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    const availableContacts = contacts.filter(c => !selectedContacts.some(sc => sc._id === c._id));

    const getDaysUntilClose = () => {
        if (!formData.expectedCloseDate) return null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const closeDate = new Date(formData.expectedCloseDate);
        closeDate.setMinutes(closeDate.getMinutes() + closeDate.getTimezoneOffset());
        closeDate.setHours(0, 0, 0, 0);

        const diffTime = closeDate.getTime() - today.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    return (
        <div
            className="fixed inset-0 z-[100] flex justify-end"
            style={{
                background: 'rgba(15, 23, 42, 0.4)',
                backdropFilter: 'blur(8px)',
                animation: 'fadeIn 0.3s ease-out',
            }}
            onClick={handleBackdropClick}
        >
            <div
                ref={drawerRef}
                className="h-full overflow-y-auto w-[460px] max-w-[100vw] bg-white/90 backdrop-blur-2xl border-l border-white/60 flex flex-col shadow-[-20px_0_40px_rgba(30,27,75,0.1)] relative"
                style={{
                    animation: 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
            >
                <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-violet-500/50 via-fuchsia-500/50 to-transparent" />

                {/* Header */}
                <div className="flex flex-col p-6 border-b border-slate-200/50 bg-white/50 backdrop-blur-md sticky top-0 z-20 shrink-0">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h2 className="text-[20px] font-bold text-slate-800 tracking-tight flex items-center gap-2">
                                <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-sm">
                                    <Briefcase size={16} className="text-white" />
                                </div>
                                {deal?._id ? `Detalles de ${formData.title || 'Oportunidad'}` : 'Nueva Oportunidad'}
                            </h2>
                        </div>
                        <button
                            onClick={handleAttemptClose}
                            className="w-8 h-8 rounded-[10px] flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700 bg-white border border-slate-200 shadow-sm"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1 p-1 bg-slate-100/80 rounded-[12px] shadow-inner">
                        <button
                            type="button"
                            onClick={() => setActiveTab('info')}
                            className={`flex-1 py-1.5 px-2 text-[12px] font-bold rounded-[8px] transition-all ${activeTab === 'info' ? 'bg-white shadow-sm text-violet-700' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Información
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('activity')}
                            disabled={!deal?._id}
                            className={`flex-1 py-1.5 px-2 text-[12px] font-bold rounded-[8px] transition-all flex items-center justify-center gap-1.5 ${activeTab === 'activity' ? 'bg-white shadow-sm text-violet-700' : 'text-slate-500 hover:text-slate-700'} disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                            <Clock size={14} /> Actividad
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('history')}
                            disabled={!deal?._id}
                            className={`flex-1 py-1.5 px-2 text-[12px] font-bold rounded-[8px] transition-all flex items-center justify-center gap-1.5 ${activeTab === 'history' ? 'bg-white shadow-sm text-violet-700' : 'text-slate-500 hover:text-slate-700'} disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                            <History size={14} /> Trazabilidad
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('tasks')}
                            disabled={!deal?._id}
                            className={`flex-1 py-1.5 text-[12px] font-bold rounded-[8px] transition-all flex justify-center items-center gap-1 ${activeTab === 'tasks' ? 'bg-white shadow-sm text-violet-700' : 'text-slate-500 hover:text-slate-700'} disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                            <ListTodo size={14} /> Tareas {dealTasks.length > 0 && <span className="bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-md text-[10px]">{dealTasks.length}</span>}
                        </button>
                    </div>
                </div>

                {/* Form Content */}
                <form id="deal-form" onSubmit={handleSubmit} onChange={() => setIsDirty(true)} className="p-6 flex-1 flex flex-col gap-6 custom-scrollbar">

                    {activeTab === 'info' && (
                        <>
                            {/* Company Autocomplete */}
                            <div className="space-y-2 relative group" ref={companyFieldRef}>
                                <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                    <Building2 size={14} className="text-blue-600" />
                                    Empresa *
                                </label>
                                <input
                                    required
                                    type="text"
                                    value={companySearch}
                                    onFocus={() => { if (!formData.company) setShowCompanyDropdown(true); }}
                                    onChange={(e) => {
                                        setCompanySearch(e.target.value);
                                        if (formData.company) {
                                            if (window.confirm("Cambiar la empresa reseteará los datos del deal. ¿Deseas continuar?")) {
                                                setFormData({ ...formData, company: undefined, primaryContact: undefined });
                                                setShowCompanyDropdown(true);
                                            } else {
                                                setCompanySearch(formData.company.name);
                                            }
                                        } else {
                                            setShowCompanyDropdown(true);
                                        }
                                    }}
                                    placeholder="Buscar o escribir nombre de empresa..."
                                    className={`w-full px-4 py-3 bg-white/60 backdrop-blur-sm border ${!formData.company ? 'border-blue-400 ring-2 ring-blue-500/20' : 'border-slate-200'} rounded-[14px] focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner`}
                                />
                                {!formData.company && !showCompanyDropdown && (
                                    <p className="text-[11px] font-bold text-blue-600 mt-1.5 ml-1 animate-pulse flex items-center gap-1">
                                        Rellena este campo primero para desbloquear el resto del formulario.
                                    </p>
                                )}
                                {showCompanyDropdown && !formData.company && companies.length > 0 && (
                                    <div className="absolute z-10 w-full mt-2 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-[16px] shadow-[0_8px_30px_rgba(0,0,0,0.12)] overflow-hidden p-1">
                                        <div className="max-h-[220px] overflow-y-auto custom-scrollbar">
                                            {companies.slice(0, 5).map(comp => (
                                                <button
                                                    key={comp._id}
                                                    type="button"
                                                    onClick={() => handleSelectCompany(comp)}
                                                    className="w-full text-left px-4 py-2.5 text-[13px] text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:font-bold rounded-[10px] transition-colors flex justify-between items-center"
                                                >
                                                    <span className="truncate">{comp.name}</span>
                                                    <span className="text-[11px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full shrink-0 ml-2">{comp.localesCount || 0} loc.</span>
                                                </button>
                                            ))}
                                        </div>
                                        {companies.length > 5 && (
                                            <div className="text-center text-[10px] font-medium text-slate-400 py-1.5 border-t border-slate-100 mt-1">
                                                Escribí para filtrar más resultados
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* The rest of the form is wrapped in a div that fades out and blocks pointer events if no company is selected */}
                            <div className={`transition-all duration-500 flex flex-col gap-6 ${!formData.company ? 'opacity-30 pointer-events-none grayscale-[50%]' : 'opacity-100'} mt-2`}>
                                {/* Contacts Section — Multi-select chips */}
                                <div className="space-y-2 pt-2 border-t border-slate-200/50">
                                    <label className="text-[13px] font-bold text-slate-700 flex items-center justify-between uppercase tracking-wide">
                                        <span className="flex items-center gap-1.5">
                                            <User size={14} className="text-fuchsia-500" />
                                            Contactos del Deal
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                            {formData.company && (
                                                <button
                                                    type="button"
                                                    onClick={() => setIsContactDrawerOpen(true)}
                                                    className="text-[11px] font-bold text-fuchsia-600 hover:text-fuchsia-700 bg-fuchsia-50 px-2 py-0.5 rounded-md"
                                                >
                                                    + Nuevo
                                                </button>
                                            )}
                                        </div>
                                    </label>

                                    {/* Selected contacts as chips */}
                                    {selectedContacts.length > 0 && (
                                        <div className="flex flex-col gap-2">
                                            {selectedContacts.map(contact => (
                                                <div key={contact._id} className="flex items-center gap-2.5 bg-white/70 border border-slate-200/60 rounded-[12px] p-2.5 shadow-sm group">
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-fuchsia-100 to-pink-100 border border-fuchsia-200/50 flex items-center justify-center shrink-0 overflow-hidden">
                                                        {contact.profilePhotoUrl ? (
                                                            <img src={contact.profilePhotoUrl} alt={contact.fullName} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span className="font-bold text-[11px] text-fuchsia-700">{contact.fullName.charAt(0).toUpperCase()}</span>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-[13px] font-bold text-slate-800 truncate">{contact.fullName}</div>
                                                        {contact.position && <div className="text-[10px] text-slate-400 font-medium truncate">{contact.position}</div>}
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        {contact.phone && (
                                                            <a
                                                                href={`https://wa.me/${contact.phone.replace(/[^0-9]/g, '')}`}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center hover:bg-emerald-100 transition-colors"
                                                                onClick={e => e.stopPropagation()}
                                                            >
                                                                <MessageCircle size={12} />
                                                            </a>
                                                        )}
                                                        {contact.email && (
                                                            <a
                                                                href={`mailto:${contact.email}`}
                                                                className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-colors"
                                                                onClick={e => e.stopPropagation()}
                                                            >
                                                                <Mail size={12} />
                                                            </a>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedContacts(prev => prev.filter(c => c._id !== contact._id))}
                                                            className="w-6 h-6 rounded-full bg-red-50 text-red-400 flex items-center justify-center hover:bg-red-100 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                                                        >
                                                            <XCircle size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Add contact button/dropdown */}
                                    {formData.company && availableContacts.length > 0 && (
                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => setShowContactPicker(!showContactPicker)}
                                                className="w-full flex items-center justify-center gap-1.5 py-2.5 border-2 border-dashed border-slate-200 rounded-[12px] text-[12px] font-bold text-slate-400 hover:border-fuchsia-300 hover:text-fuchsia-500 transition-colors"
                                            >
                                                <UserPlus size={14} /> Agregar contacto existente
                                            </button>
                                            {showContactPicker && (
                                                <div className="absolute z-20 w-full mt-1.5 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-[14px] shadow-[0_8px_30px_rgba(0,0,0,0.12)] overflow-hidden max-h-44 overflow-y-auto p-1">
                                                    {availableContacts.map(contact => (
                                                        <button
                                                            key={contact._id}
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedContacts(prev => [...prev, contact]);
                                                                setShowContactPicker(false);
                                                            }}
                                                            className="w-full text-left px-3 py-2 text-[13px] text-slate-700 hover:bg-fuchsia-50 hover:text-fuchsia-700 rounded-[10px] transition-colors flex items-center gap-2.5"
                                                        >
                                                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200/50 flex items-center justify-center shrink-0 overflow-hidden">
                                                                {contact.profilePhotoUrl ? (
                                                                    <img src={contact.profilePhotoUrl} alt="" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <span className="font-bold text-[10px] text-slate-500">{contact.fullName.charAt(0)}</span>
                                                                )}
                                                            </div>
                                                            <div>
                                                                <div className="font-bold text-[12px]">{contact.fullName}</div>
                                                                {contact.position && <div className="text-[10px] text-slate-400">{contact.position}</div>}
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Empty state */}
                                    {formData.company && selectedContacts.length === 0 && availableContacts.length === 0 && (
                                        <p className="text-[11px] text-slate-400 font-medium text-center py-2">No hay contactos para esta empresa.</p>
                                    )}
                                </div>

                                <div className="mt-2 pt-4 border-t border-slate-200/50">
                                    <div className="grid grid-cols-2 gap-5 mb-2">
                                        {/* Locales */}
                                        <div className="space-y-2">
                                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                                <Building2 size={14} className="text-slate-400" />
                                                Cant. Locales
                                            </label>
                                            <div className="relative group/input">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold group-focus-within/input:text-violet-500 transition-colors z-10 pointer-events-none">
                                                    <Building2 size={16} />
                                                </span>
                                                <input
                                                    type="number"
                                                    onWheel={(e) => (e.target as HTMLElement).blur()}
                                                    min="0"
                                                    value={companyLocales || ''}
                                                    onChange={(e) => handleLocalesChange(parseInt(e.target.value) || 0)}
                                                    placeholder="0"
                                                    className="w-full pl-10 pr-4 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-300 transition-all font-mono text-[14px] text-slate-700 shadow-inner [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                                                />
                                            </div>
                                        </div>

                                        {/* Valor */}
                                        <div className="space-y-2">
                                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                                <DollarSign size={14} className="text-emerald-500" />
                                                Valor (USD)
                                            </label>
                                            <div className="relative group/input">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold group-focus-within/input:text-emerald-500 transition-colors z-10 pointer-events-none">
                                                    <DollarSign size={16} />
                                                </span>
                                                <input
                                                    required
                                                    type="number"
                                                    onWheel={(e) => (e.target as HTMLElement).blur()}
                                                    min="0"
                                                    value={formData.value ? Math.round(formData.value * 100) / 100 : ''}
                                                    onChange={(e) => setFormData({ ...formData, value: Math.round((parseFloat(e.target.value) || 0) * 100) / 100 })}
                                                    placeholder="0"
                                                    className="w-full pl-10 pr-4 py-3 bg-emerald-50/30 backdrop-blur-sm border border-emerald-200/80 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400 transition-all font-mono text-[14px] text-slate-800 font-bold placeholder:text-slate-400 shadow-inner [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    {(companyLocales !== initialLocales || formData.value !== initialValue) && (
                                        <p className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200/50 px-2.5 py-1.5 rounded-[8px] flex items-start gap-1.5 mt-2 shadow-sm transition-all duration-300 animate-in fade-in slide-in-from-top-2">
                                            <span className="mt-0.5">⚠️</span>
                                            <span>Cualquier modificación en estos campos repercutirá y se guardará globalmente en los datos maestros de la Empresa <strong>{formData.company?.name || ''}</strong>.</span>
                                        </p>
                                    )}

                                    {/* Franquicias y Propios */}
                                    {companyLocales > 0 && (
                                        <div className="mt-3">
                                            <div className="grid grid-cols-2 gap-5">
                                                <div className="space-y-2">
                                                    <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                                        Franquicias
                                                    </label>
                                                    <input
                                                        type="number"
                                                        onWheel={(e) => (e.target as HTMLElement).blur()}
                                                        min="0"
                                                        value={companyFranchise || ''}
                                                        onChange={(e) => setCompanyFranchise(parseInt(e.target.value) || 0)}
                                                        placeholder="0"
                                                        className="w-full px-4 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-300 transition-all font-mono text-[14px] text-slate-700 shadow-inner [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                                        Propios
                                                    </label>
                                                    <input
                                                        type="number"
                                                        onWheel={(e) => (e.target as HTMLElement).blur()}
                                                        min="0"
                                                        value={companyOwned || ''}
                                                        onChange={(e) => setCompanyOwned(parseInt(e.target.value) || 0)}
                                                        placeholder="0"
                                                        className="w-full px-4 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-300 transition-all font-mono text-[14px] text-slate-700 shadow-inner [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                                                    />
                                                </div>
                                            </div>
                                            {companyFranchise + companyOwned > 0 && companyFranchise + companyOwned !== companyLocales && (
                                                <p className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200/50 px-2.5 py-1.5 rounded-[8px] flex items-center gap-1.5 mt-2 shadow-sm">
                                                    <span>⚠️</span>
                                                    <span>Franquicias ({companyFranchise}) + Propios ({companyOwned}) = {companyFranchise + companyOwned} ≠ Total locales ({companyLocales}).</span>
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-5 mt-2">
                                    {/* Fecha Cierre */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                                <Calendar size={14} className="text-blue-500" />
                                                Cierre Estimado
                                            </label>
                                            {formData.expectedCloseDate && (
                                                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${(() => {
                                                    const days = getDaysUntilClose();
                                                    if (days === null) return '';
                                                    if (days < 0) return 'bg-red-50 text-red-600';
                                                    if (days <= 7) return 'bg-amber-50 text-amber-600';
                                                    return 'bg-emerald-50 text-emerald-600';
                                                })()
                                                    }`}>
                                                    {(() => {
                                                        const days = getDaysUntilClose();
                                                        if (days === null) return '';
                                                        if (days < 0) return `hace ${Math.abs(days)} días`;
                                                        if (days === 0) return 'hoy';
                                                        return `en ${days} días`;
                                                    })()}
                                                </span>
                                            )}
                                        </div>
                                        <div className="relative w-full">
                                            <input
                                                type="date"
                                                value={formData.expectedCloseDate}
                                                onChange={(e) => setFormData({ ...formData, expectedCloseDate: e.target.value })}
                                                className="w-full px-4 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-300 transition-all text-[14px] font-medium text-slate-700 shadow-inner custom-date-input"
                                            />
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 bg-white/80 pl-2">
                                                <Calendar size={16} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Pipeline Stage */}
                                    <div className="space-y-2">
                                        <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                            Etapa Pipeline
                                        </label>
                                        <div className="relative w-full">
                                            <select
                                                value={formData.status}
                                                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                                className="w-full pl-4 pr-10 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-300 transition-all text-[14px] font-bold text-slate-700 shadow-inner appearance-none cursor-pointer"
                                            >
                                                {stages.map(s => (
                                                    <option key={s.key} value={s.key}>{s.label}</option>
                                                ))}
                                            </select>
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-violet-500">
                                                <div className="w-2.5 h-2.5 rounded-full bg-violet-500"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Responsable Selector */}
                                <div className="space-y-2 mt-4 pt-4 border-t border-slate-200/50">
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

                                {/* Notes */}
                                <div className="space-y-2 mt-2 pt-4 border-t border-slate-200/50">
                                    <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                        <FileText size={14} className="text-amber-500" />
                                        Notas de Oportunidad
                                    </label>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Añade detalle sobre negociación, requerimientos..."
                                        rows={4}
                                        className="w-full px-4 py-3 bg-amber-50/30 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner custom-scrollbar"
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {activeTab === 'history' && (
                        <div className="flex flex-col gap-5">
                            {/* Status History */}
                            <div>
                                <div className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide border-b border-slate-200/60 pb-2">
                                    <History size={14} className="text-violet-500" /> Historial de Estados
                                </div>

                                <div className="flex flex-col gap-0 relative mt-2">
                                    <div className="absolute left-[11px] top-4 bottom-4 w-px bg-slate-200/80 z-0"></div>

                                    <div className="relative z-10 flex gap-4 my-2">
                                        <div className={`w-6 h-6 rounded-full border-2 border-white flex items-center justify-center shrink-0 shadow-sm mt-0.5 ${((currentDealData as any)?.statusHistory || []).length === 0 ? 'bg-violet-100' : 'bg-slate-100'}`}>
                                            <div className={`w-2 h-2 rounded-full ${((currentDealData as any)?.statusHistory || []).length === 0 ? 'bg-violet-500' : 'bg-slate-400'}`}></div>
                                        </div>
                                        <div className="flex-1 bg-white/60 backdrop-blur-sm border border-slate-200/50 rounded-[12px] p-3 shadow-sm">
                                            <div className="flex justify-between items-start gap-2">
                                                <div>
                                                    <div className="text-[13px] font-bold text-slate-800">Oportunidad Creada</div>
                                                    <div className="text-[11px] font-medium text-slate-500 mt-1 uppercase tracking-wide">{formatToArgentineDateTime(currentDealData?.createdAt || new Date())}</div>
                                                </div>
                                                {typeof (currentDealData as any)?.userId === 'object' && (currentDealData as any)?.userId !== null && (
                                                    <div className="flex items-center bg-slate-50 px-1.5 py-1.5 rounded-[8px] border border-slate-200/50 shrink-0" title={(currentDealData as any).userId.name}>
                                                        <OwnerAvatar name={(currentDealData as any).userId.name} profilePhotoUrl={(currentDealData as any).userId.profilePhotoUrl} size="xs" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {((currentDealData as any)?.statusHistory || []).map((historyObj: any, idx: number, arr: any[]) => {
                                        const toLabel = stages.find(s => s.key === historyObj.to)?.label || historyObj.to;
                                        const isLatest = idx === arr.length - 1;

                                        // Fallback to deal creator if changedBy is missing or unpopulated
                                        const displayUser = (typeof historyObj.changedBy === 'object' && historyObj.changedBy) ||
                                            (typeof (currentDealData as any)?.userId === 'object' ? (currentDealData as any)?.userId : null);

                                        return (
                                            <div key={idx} className="relative z-10 flex gap-4 my-2">
                                                <div className={`w-6 h-6 rounded-full border-2 border-white flex items-center justify-center shrink-0 shadow-sm mt-0.5 ${isLatest ? 'bg-violet-100' : 'bg-slate-100'}`}>
                                                    <div className={`w-2 h-2 rounded-full ${isLatest ? 'bg-violet-500' : 'bg-slate-400'}`}></div>
                                                </div>
                                                <div className="flex-1 bg-white/60 backdrop-blur-sm border border-slate-200/50 rounded-[12px] p-3 shadow-sm">
                                                    <div className="flex justify-between items-start gap-2">
                                                        <div>
                                                            <div className="text-[13px] font-bold text-slate-800 flex items-center flex-wrap gap-1.5">
                                                                Cambio de etapa a <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 border border-slate-200/50">{toLabel}</span>
                                                            </div>
                                                            <div className="text-[11px] font-medium text-slate-500 mt-1 uppercase tracking-wide">{formatToArgentineDateTime(historyObj.changedAt)}</div>
                                                        </div>
                                                        {displayUser && displayUser.name && (
                                                            <div className="flex items-center bg-slate-50 px-1.5 py-1.5 rounded-[8px] border border-slate-200/50 shrink-0" title={displayUser.name}>
                                                                <OwnerAvatar name={displayUser.name} profilePhotoUrl={displayUser.profilePhotoUrl} size="xs" />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'activity' && (
                        <div className="flex flex-col gap-5 h-full">
                            {/* Activities Section */}
                            <div className="flex-1 flex flex-col">
                                <div className="flex items-center justify-between border-b border-slate-200/60 pb-2 mb-3">
                                    <div className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                        <Clock size={14} className="text-emerald-500" /> Historial de Actividades
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowActivityForm(!showActivityForm)}
                                        className="px-3 py-1.5 bg-gradient-to-r from-emerald-50 to-teal-50 hover:from-emerald-100 hover:to-teal-100 text-emerald-700 text-[11px] font-bold rounded-[10px] transition-all shadow-sm border border-emerald-200/50 flex items-center gap-1 hover:shadow-md"
                                    >
                                        <Plus size={12} /> Registrar
                                    </button>
                                </div>

                                {/* Activity Creation Form */}
                                {showActivityForm && (
                                    <div className="bg-white/80 backdrop-blur-xl border border-slate-200/60 rounded-[16px] p-4 mb-4 shadow-sm space-y-3">
                                        {/* Activity type selector */}
                                        <div className="flex gap-1.5 flex-wrap">
                                            {[
                                                { key: 'call', label: 'Llamada', icon: <Phone size={12} />, color: 'emerald' },
                                                { key: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle size={12} />, color: 'green' },
                                                { key: 'email', label: 'Email', icon: <Mail size={12} />, color: 'amber' },
                                                { key: 'meeting', label: 'Reunión', icon: <Users size={12} />, color: 'indigo' },
                                                { key: 'linkedin_message', label: 'LinkedIn', icon: <Linkedin size={12} />, color: 'blue' },
                                                { key: 'note', label: 'Nota', icon: <FileText size={12} />, color: 'slate' },
                                            ].map(t => (
                                                <button
                                                    key={t.key}
                                                    type="button"
                                                    onClick={() => setActType(t.key as any)}
                                                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-[8px] text-[10px] font-bold border transition-all ${actType === t.key
                                                        ? `bg-${t.color}-100 border-${t.color}-300 text-${t.color}-700 shadow-sm`
                                                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                                                        }`}
                                                    style={actType === t.key ? {
                                                        backgroundColor: t.color === 'emerald' ? '#d1fae5' : t.color === 'green' ? '#dcfce7' : t.color === 'amber' ? '#fef3c7' : t.color === 'indigo' ? '#e0e7ff' : t.color === 'blue' ? '#dbeafe' : '#f1f5f9',
                                                        borderColor: t.color === 'emerald' ? '#6ee7b7' : t.color === 'green' ? '#86efac' : t.color === 'amber' ? '#fcd34d' : t.color === 'indigo' ? '#a5b4fc' : t.color === 'blue' ? '#93c5fd' : '#cbd5e1',
                                                        color: t.color === 'emerald' ? '#047857' : t.color === 'green' ? '#15803d' : t.color === 'amber' ? '#b45309' : t.color === 'indigo' ? '#4338ca' : t.color === 'blue' ? '#1d4ed8' : '#475569',
                                                    } : {}}
                                                >
                                                    {t.icon} {t.label}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Contact selector */}
                                        {selectedContacts.length > 0 && (
                                            <select
                                                value={actContactId}
                                                onChange={e => setActContactId(e.target.value)}
                                                className="w-full px-3 py-2 bg-white/60 border border-slate-200 rounded-[10px] text-[12px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300"
                                            >
                                                <option value="">Seleccionar contacto...</option>
                                                {selectedContacts.map(c => (
                                                    <option key={c._id} value={c._id}>{c.fullName} {c.position ? `(${c.position})` : ''}</option>
                                                ))}
                                            </select>
                                        )}

                                        {/* Description */}
                                        <textarea
                                            value={actDescription}
                                            onChange={e => setActDescription(e.target.value)}
                                            placeholder="Describe la actividad..."
                                            rows={2}
                                            className="w-full px-3 py-2 bg-white/60 border border-slate-200 rounded-[10px] text-[13px] font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300 resize-none"
                                        />

                                        {/* Outcome */}
                                        <input
                                            value={actOutcome}
                                            onChange={e => setActOutcome(e.target.value)}
                                            placeholder="Resultado (opcional)"
                                            className="w-full px-3 py-2 bg-white/60 border border-slate-200 rounded-[10px] text-[12px] font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300"
                                        />

                                        {/* Submit */}
                                        <div className="flex justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => { setShowActivityForm(false); setActDescription(''); setActOutcome(''); setActContactId(''); }}
                                                className="px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-700 transition-colors"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                type="button"
                                                disabled={!actDescription.trim() || savingActivity}
                                                onClick={async () => {
                                                    if (!actDescription.trim()) return;
                                                    setSavingActivity(true);
                                                    try {
                                                        const payload: any = {
                                                            type: actType,
                                                            description: actDescription.trim(),
                                                            outcome: actOutcome || undefined,
                                                            deal: deal?._id,
                                                            company: formData.company?._id || undefined,
                                                        };
                                                        if (actContactId) payload.contact = actContactId;
                                                        const newAct = await createActivity(payload);
                                                        // Re-hydrate with contact info for display
                                                        if (actContactId) {
                                                            const matchedContact = selectedContacts.find(c => c._id === actContactId);
                                                            if (matchedContact) {
                                                                (newAct as any).contact = { _id: matchedContact._id, fullName: matchedContact.fullName, profilePhotoUrl: matchedContact.profilePhotoUrl };
                                                            }
                                                        }
                                                        setDealActivities(prev => [newAct, ...prev]);
                                                        setActDescription('');
                                                        setActOutcome('');
                                                        setActContactId('');
                                                        setShowActivityForm(false);
                                                    } catch (err) {
                                                        console.error('Failed to create activity:', err);
                                                    } finally {
                                                        setSavingActivity(false);
                                                    }
                                                }}
                                                className="px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[11px] font-bold rounded-[8px] hover:shadow-md transition-all disabled:opacity-50 flex items-center gap-1"
                                            >
                                                {savingActivity ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                                Guardar
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Activity Timeline */}
                                {loadingActivities ? (
                                    <div className="flex items-center justify-center py-8">
                                        <Loader2 size={20} className="animate-spin text-emerald-500" />
                                    </div>
                                ) : (
                                    <ActivityTimeline activities={dealActivities} />
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'tasks' && (
                        <div className="flex flex-col gap-4 h-full">
                            <div className="flex items-center justify-between border-b border-white/60 pb-3">
                                <div className="text-[14px] font-black text-slate-800 flex items-center gap-2 uppercase tracking-wide">
                                    <ListTodo size={16} className="text-violet-500" />
                                    Listado de Tareas
                                </div>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setEditingTask(null);
                                        setIsTaskDrawerOpen(true);
                                    }}
                                    className="px-4 py-2 bg-gradient-to-r from-violet-50 to-fuchsia-50 hover:from-violet-100 hover:to-fuchsia-100 text-violet-700 text-[12px] font-bold rounded-[12px] transition-all duration-300 shadow-sm border border-violet-200/50 flex items-center gap-1.5 hover:shadow-md hover:-translate-y-0.5"
                                >
                                    <Plus size={14} /> Crear Tarea
                                </button>
                            </div>

                            <div className="flex flex-col gap-3 relative z-10">
                                {dealTasks.length === 0 ? (
                                    <div className="text-center py-14 bg-white/40 backdrop-blur-md rounded-[20px] border border-white/60 shadow-inner">
                                        <div className="w-16 h-16 rounded-[20px] bg-gradient-to-br from-slate-100 to-white flex items-center justify-center mx-auto mb-4 shadow-sm border border-white">
                                            <CheckSquare className="text-slate-300" size={28} />
                                        </div>
                                        <h3 className="text-[15px] font-bold text-slate-700 mb-1">Cero estrés</h3>
                                        <p className="text-[13px] font-medium text-slate-500">No hay tareas pendientes asociadas a esta oportunidad.</p>
                                    </div>
                                ) : (
                                    dealTasks.map(task => (
                                        <div key={task._id} className="bg-white/80 backdrop-blur-xl border border-white shadow-[0_4px_16px_rgba(0,0,0,0.03)] rounded-[16px] p-4 flex items-center gap-4 transition-all duration-300 hover:shadow-[0_8px_24px_rgba(139,92,246,0.12)] hover:border-violet-200/60 hover:-translate-y-0.5 group cursor-pointer" onClick={() => {
                                            setEditingTask(task);
                                            setIsTaskDrawerOpen(true);
                                        }}>
                                            <div
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    try {
                                                        const newStatus = task.status === 'completed' ? 'pending' : 'completed';
                                                        await updateTask(task._id, { status: newStatus });
                                                        if (deal?._id) {
                                                            const res = await getTasks({ deal: deal._id, limit: 50 });
                                                            setDealTasks(res.tasks);
                                                        }
                                                    } catch (error) {
                                                        console.error("Failed to toggle task", error);
                                                    }
                                                }}
                                                className={`w-6 h-6 rounded-full shrink-0 border-[2px] flex items-center justify-center transition-all duration-300 shadow-sm hover:scale-110 ${task.status === 'completed' ? 'bg-emerald-500 border-emerald-500 text-white hover:bg-emerald-600 hover:border-emerald-600' : 'border-slate-300 bg-slate-50 hover:border-emerald-400 group-hover:border-violet-400'}`}
                                            >
                                                {task.status === 'completed' && <Check size={14} strokeWidth={4} />}
                                            </div>
                                            <div className="flex-1">
                                                <div className={`text-[14px] font-bold leading-tight mb-1 transition-colors ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-800 group-hover:text-violet-700'}`}>{task.title}</div>
                                                <div className="flex items-center text-[12px] font-medium text-slate-500 mt-1.5">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`mr-1.5 ${task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'completed' ? 'text-red-500' : 'text-slate-400'}`}><path d="M8 2v4"></path><path d="M16 2v4"></path><rect width="18" height="18" x="3" y="4" rx="2"></rect><path d="M3 10h18"></path></svg>
                                                    <span>{task.dueDate ? formatToArgentineDateTime(task.dueDate) : 'Sin fecha'}</span>
                                                    <span className="text-slate-300 mx-1.5">•</span>
                                                    <span>{
                                                        task.type === 'call' ? 'Llamada' :
                                                            task.type === 'meeting' ? 'Reunión' :
                                                                task.type === 'follow_up' ? 'Seguimiento' :
                                                                    task.type === 'proposal' ? 'Propuesta' :
                                                                        task.type === 'research' ? 'Investigación' : 'Otro'
                                                    }</span>
                                                    <span className="text-slate-300 mx-1.5">•</span>
                                                    <span className={`font-semibold ${task.priority === 'urgent' ? 'text-red-600' : task.priority === 'high' ? 'text-orange-600' : 'text-blue-600'}`}>
                                                        {task.priority === 'urgent' ? 'Urgente' : task.priority === 'high' ? 'Alta' : 'Media'}
                                                    </span>
                                                    {task.contact && (
                                                        <>
                                                            <span className="text-slate-300 mx-1.5">•</span>
                                                            <span className="text-slate-600 font-medium flex items-center gap-1">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                                                {task.contact.fullName}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-x-2 group-hover:translate-x-0 w-8 h-8 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                                <ChevronRight size={18} />
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    <div className="h-[80px] w-full shrink-0" aria-hidden="true" />

                    <div className="mt-auto pt-4 border-t border-slate-200/50 flex gap-3 bg-white/90 backdrop-blur-xl sticky bottom-0 -mx-6 px-6 pb-4 shadow-[0_-10px_20px_rgba(255,255,255,0.8)]">
                        <button
                            type="button"
                            onClick={handleAttemptClose}
                            className="flex-1 px-4 py-2 bg-white border border-slate-200/80 text-slate-600 rounded-[10px] text-[13px] font-bold hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
                        >
                            Cerrar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || (activeTab === 'info' && !formData.company)}
                            onClick={() => { if (activeTab !== 'info') setActiveTab('info') }}
                            className="flex-[1.5] px-4 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-[10px] text-[13px] font-bold hover:shadow-[0_8px_24px_rgba(139,92,246,0.4)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(139,92,246,0.3)]"
                        >
                            {saving ? 'Guardando...' : <><Save size={16} /> {deal?._id ? 'Guardar Cambios' : 'Crear Oportunidad'}</>}
                        </button>
                    </div>

                </form>
            </div>

            <ContactFormDrawer
                open={isContactDrawerOpen}
                contact={formData.company?._id ? { company: formData.company } as any : undefined}
                onClose={() => setIsContactDrawerOpen(false)}
                onSaved={(newContact) => {
                    setContacts([...contacts, newContact]);
                    setSelectedContacts(prev => [...prev, newContact]);
                    setIsContactDrawerOpen(false);
                }}
            />

            <TaskFormDrawer
                open={isTaskDrawerOpen}
                task={editingTask || {
                    deal: currentDealData?._id ? currentDealData : (formData.title ? { _id: 'temp', title: formData.title } as any : undefined),
                    company: formData.company,
                    contact: formData.primaryContact
                } as any}
                onClose={() => {
                    setIsTaskDrawerOpen(false);
                    setEditingTask(null);
                }}
                onSaved={() => {
                    if (deal?._id) {
                        getTasks({ deal: deal._id, limit: 50 }).then(res => setDealTasks(res.tasks)).catch(() => { });
                    }
                    setIsTaskDrawerOpen(false);
                    setEditingTask(null);
                }}
            />

            {showUnsavedConfirm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
                    <div className="bg-white rounded-[24px] p-6 max-w-sm w-full shadow-[0_20px_60px_rgba(0,0,0,0.1)] animate-[slideUp_0.3s_ease-out] border border-slate-100" onClick={e => e.stopPropagation()}>
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
                                    const form = document.getElementById('deal-form') as HTMLFormElement;
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
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(139, 92, 246, 0.2); border-radius: 10px; }
                .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: rgba(139, 92, 246, 0.4); }
            `}</style>
        </div>
    );
}
