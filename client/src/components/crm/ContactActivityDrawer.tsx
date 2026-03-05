import { useState, useEffect, useRef } from 'react';
import api from '../../lib/axios';
import { useAuth } from '../../contexts/AuthContext';
import {
    X, Phone, MessageCircle, Linkedin, Mail, Users, StickyNote,
    CheckCircle2, Send, Clock, Pencil, Building2,
    Loader2, PhoneOff, PhoneMissed, PhoneForwarded, CalendarClock,
    Save, User, Briefcase, Tag, AlertTriangle,
    ThumbsUp, ThumbsDown, Minus, Target, RotateCcw,
    Eye, Reply, Ban, Star, Info, Bell, MessageSquare,
    CheckCheck, CircleDot, HelpCircle, ArrowRightLeft, UserX, UserCheck, ArrowRight, ChevronRight,
    ListTodo, Plus, Calendar, Flag, Trash2, Circle, GitBranch, DollarSign, TrendingUp, CheckSquare, History,
    Camera, ImagePlus
} from 'lucide-react';
import {
    getContact, createActivity, updateContact, deleteContact, createContact,
    getCompanies, getSystemConfig, getPartners, addContactRole, addContactPosition,
    createTask, completeTask, deleteTask as deleteTaskApi, getTasks,
    getPipelineConfig, getDealsPipeline, getTeamUsers,
    ActivityData, ContactData, CompanyData, SystemConfig, PartnerData, TaskData, DealData, PipelineStage, TeamUser
} from '../../services/crm.service';
import OwnerAvatar from '../common/OwnerAvatar';
import AutocompleteInput from '../common/AutocompleteInput';
import CreatableAutocompleteInput from '../common/CreatableAutocompleteInput';
import TaskFormDrawer from './TaskFormDrawer';
import { getDefaultTaskDueDate } from '../../utils/date';
import SearchableSelect from '../common/SearchableSelect';

// ── Activity Type Config ─────────────────────────────────────────

type ActivityType = 'call' | 'whatsapp' | 'linkedin_message' | 'email' | 'meeting' | 'note' | 'referral';

interface ActivityTypeOption {
    value: ActivityType;
    label: string;
    icon: React.ElementType;
    color: string;
    bgColor: string;
}

const ACTIVITY_TYPES: ActivityTypeOption[] = [
    { value: 'call', label: 'Llamada', icon: Phone, color: '#10b981', bgColor: '#ecfdf5' },
    { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, color: '#25D366', bgColor: '#f0fdf4' },
    { value: 'linkedin_message', label: 'LinkedIn', icon: Linkedin, color: '#0a66c2', bgColor: '#eff6ff' },
    { value: 'email', label: 'Email', icon: Mail, color: '#f59e0b', bgColor: '#fffbeb' },
    { value: 'meeting', label: 'Reunión', icon: Users, color: '#8b5cf6', bgColor: '#f5f3ff' },
    { value: 'referral', label: 'Derivó', icon: ArrowRightLeft, color: '#ec4899', bgColor: '#fdf2f8' },
    { value: 'note', label: 'Nota', icon: StickyNote, color: '#64748b', bgColor: '#f8fafc' },
];

const OUTCOMES_BY_TYPE: Record<ActivityType, { value: string; label: string; icon: React.ElementType }[]> = {
    call: [
        { value: 'no_answer', label: 'No respondió', icon: PhoneMissed },
        { value: 'busy', label: 'Ocupado', icon: PhoneOff },
        { value: 'talked', label: 'Hablamos', icon: PhoneForwarded },
        { value: 'scheduled_callback', label: 'Callback agendado', icon: CalendarClock },
    ],
    whatsapp: [
        { value: 'sent', label: 'Enviado', icon: Send },
        { value: 'read', label: 'Leído', icon: CheckCheck },
        { value: 'replied', label: 'Respondió', icon: Reply },
        { value: 'no_response', label: 'Sin respuesta', icon: CircleDot },
    ],
    linkedin_message: [
        { value: 'sent', label: 'Enviado', icon: Send },
        { value: 'accepted', label: 'Aceptó conexión', icon: CheckCircle2 },
        { value: 'replied', label: 'Respondió', icon: Reply },
        { value: 'pending', label: 'Pendiente', icon: Clock },
        { value: 'ignored', label: 'Sin respuesta', icon: CircleDot },
    ],
    email: [
        { value: 'sent', label: 'Enviado', icon: Send },
        { value: 'opened', label: 'Abierto', icon: Eye },
        { value: 'replied', label: 'Respondió', icon: Reply },
        { value: 'bounced', label: 'Rebotado', icon: Ban },
        { value: 'no_response', label: 'Sin respuesta', icon: CircleDot },
    ],
    meeting: [
        { value: 'excelente', label: 'Excelente', icon: Star },
        { value: 'buena', label: 'Buena', icon: ThumbsUp },
        { value: 'regular', label: 'Regular', icon: Minus },
        { value: 'mala', label: 'Mala', icon: ThumbsDown },
        { value: 'objetivo_cumplido', label: 'Objetivo cumplido', icon: Target },
        { value: 'revisarlo', label: 'Revisarlo', icon: RotateCcw },
    ],
    note: [
        { value: 'info', label: 'Informativo', icon: Info },
        { value: 'seguimiento', label: 'Seguimiento', icon: Bell },
        { value: 'alerta', label: 'Alerta', icon: AlertTriangle },
    ],
    referral: [
        { value: 'no_era_el', label: 'No era él', icon: UserX },
        { value: 'no_sigue_proceso', label: 'No sigue el proceso', icon: Ban },
        { value: 'derivo_otro_contacto', label: 'Derivó a otro contacto', icon: ArrowRight },
        { value: 'derivo_otra_area', label: 'Derivó a otra área', icon: ArrowRightLeft },
        { value: 'contacto_correcto', label: 'Contacto correcto', icon: UserCheck },
    ],
};

// Flat lookup for timeline outcome labels
const ALL_OUTCOMES = Object.values(OUTCOMES_BY_TYPE).flat();

// ── Helpers ──────────────────────────────────────────────────────

function formatActivityTime(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const time = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

    if (isToday) return `Hoy ${time} `;
    if (isYesterday) return `Ayer ${time} `;
    return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) + ` ${time} `;
}

function getActivityIcon(type: string) {
    const found = ACTIVITY_TYPES.find(t => t.value === type);
    if (found) return found;
    return { value: 'note' as ActivityType, label: 'Tarea', icon: CheckCircle2, color: '#10b981', bgColor: '#ecfdf5' };
}

// ── Props ────────────────────────────────────────────────────────

interface Props {
    contactId: string | null;
    contactPreview?: ContactData | null;
    open: boolean;
    onClose: () => void;
    onSaved?: (contact: ContactData & { _deleted?: boolean }) => void;
}

type DrawerTab = 'datos' | 'actividad' | 'tareas' | 'trazabilidad';

const TASK_TYPES = [
    { value: 'call', label: 'Llamada', icon: Phone },
    { value: 'meeting', label: 'Reunión', icon: Users },
    { value: 'follow_up', label: 'Seguimiento', icon: RotateCcw },
    { value: 'proposal', label: 'Propuesta', icon: Mail },
    { value: 'research', label: 'Investigación', icon: Eye },
    { value: 'other', label: 'Otro', icon: StickyNote },
];

const TASK_PRIORITIES = [
    { value: 'low', label: 'Baja', color: '#64748b' },
    { value: 'medium', label: 'Media', color: '#f59e0b' },
    { value: 'high', label: 'Alta', color: '#f97316' },
    { value: 'urgent', label: 'Urgente', color: '#ef4444' },
];

// ── Component ────────────────────────────────────────────────────

export default function ContactActivityDrawer({ contactId, contactPreview, open, onClose, onSaved }: Props) {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<DrawerTab>('datos');
    const [contact, setContact] = useState<ContactData | null>(null);
    const [activities, setActivities] = useState<ActivityData[]>([]);
    const [loadingContact, setLoadingContact] = useState(false);

    // ── Activity form state ──
    const [showActivityForm, setShowActivityForm] = useState(false);
    const [selectedType, setSelectedType] = useState<ActivityType>('call');
    const [actDescription, setActDescription] = useState('');
    const [outcome, setOutcome] = useState('');
    const [savingActivity, setSavingActivity] = useState(false);

    // ── Contact form state ──
    const [formData, setFormData] = useState<Partial<ContactData>>({});
    const [companies, setCompanies] = useState<CompanyData[]>([]);
    const [selectedCompanies, setSelectedCompanies] = useState<CompanyData[]>([]);
    const [showCompanyPicker, setShowCompanyPicker] = useState(false);
    const [companySearch, setCompanySearch] = useState('');
    const [config, setConfig] = useState<SystemConfig | null>(null);
    const [partners, setPartners] = useState<PartnerData[]>([]);
    const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
    const [savingContact, setSavingContact] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [extractingPhoto, setExtractingPhoto] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Task state ──
    const [tasks, setTasks] = useState<TaskData[]>([]);
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [taskTitle, setTaskTitle] = useState('');
    const [taskType, setTaskType] = useState('follow_up');
    const [taskPriority, setTaskPriority] = useState('medium');
    const [taskDueDate, setTaskDueDate] = useState('');
    const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<TaskData | null>(null);
    const [taskAssignedTo, setTaskAssignedTo] = useState<string>('');

    // ── Deal / Trazabilidad state ──
    const [deals, setDeals] = useState<DealData[]>([]);
    const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
    const [savingTask, setSavingTask] = useState(false);

    const drawerRef = useRef<HTMLDivElement>(null);
    const descRef = useRef<HTMLTextAreaElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // ── Load contact detail + activities ──
    useEffect(() => {
        if (!open || !contactId) return;
        setLoadingContact(true);
        getContact(contactId)
            .then((data) => {
                const c = data as ContactData;
                setContact(c);
                setActivities((data as any).activities || []);
                // Load tasks via separate endpoint for reliability
                getTasks({ contact: contactId, limit: 100 })
                    .then(res => setTasks(res.tasks || []))
                    .catch(err => { console.error('Failed to load tasks:', err); setTasks([]); });
                // Load deals from contact data
                setDeals((data as any).deals || []);
                // Load pipeline stages for label/color mapping
                getPipelineConfig()
                    .then(config => setPipelineStages(config.stages || []))
                    .catch(() => { });
                // Init form data
                setFormData({
                    fullName: c.fullName || '',
                    position: c.position || '',
                    role: c.role || '',
                    channel: c.channel || 'linkedin',
                    email: c.email || '',
                    phone: c.phone || '',
                    linkedInProfileUrl: c.linkedInProfileUrl || '',
                    profilePhotoUrl: c.profilePhotoUrl || '',
                    company: undefined,
                    companies: c.companies ? (c.companies as any) : (c.company ? [c.company as any] : []),
                    assignedTo: c.assignedTo as any,
                    tags: c.tags || [],
                });

                if (c.companies && c.companies.length > 0) {
                    setSelectedCompanies(c.companies as any);
                } else if (c.company) {
                    setSelectedCompanies([c.company as any]);
                } else {
                    setSelectedCompanies([]);
                }
                setCompanySearch('');
            })
            .catch(console.error)
            .finally(() => setLoadingContact(false));
    }, [open, contactId]);

    // ── Load system config + partners ──
    useEffect(() => {
        if (!open) return;
        Promise.all([getSystemConfig(), getPartners(), getTeamUsers()])
            .then(([cfg, parts, users]) => {
                setConfig(cfg);
                setPartners(parts.partners);
                setTeamUsers(users);
            })
            .catch(console.error);
    }, [open]);

    // ── Load companies for autocomplete ──
    useEffect(() => {
        if (!open || activeTab !== 'datos') return;
        const timeoutId = setTimeout(async () => {
            try {
                const res = await getCompanies({ search: companySearch, limit: 10 });
                setCompanies(res.companies);
            } catch { /* ignore */ }
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [companySearch, open, activeTab]);

    // Reset on close
    useEffect(() => {
        if (!open) {
            setActiveTab('datos');
            setShowActivityForm(false);
            setActDescription('');
            setOutcome('');
            setShowDeleteConfirm(false);
            setShowTaskForm(false);
            setTaskTitle('');
            setTaskType('follow_up');
            setTaskPriority('medium');
            setTaskDueDate('');
            setTaskAssignedTo('');
            setSelectedCompanies([]);
            setShowCompanyPicker(false);
        }
    }, [open]);


    // Focus activity description
    useEffect(() => {
        if (showActivityForm && descRef.current) setTimeout(() => descRef.current?.focus(), 200);
    }, [showActivityForm]);

    // ESC to close
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, onClose]);

    // ── Image Upload Helpers ──
    const compressImage = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_SIZE = 200;
                    let w = img.width;
                    let h = img.height;
                    if (w > h) { h = (h / w) * MAX_SIZE; w = MAX_SIZE; }
                    else { w = (w / h) * MAX_SIZE; h = MAX_SIZE; }
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d')!;
                    ctx.drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/webp', 0.8));
                };
                img.onerror = reject;
                img.src = e.target?.result as string;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setUploadingPhoto(true);
            const compressed = await compressImage(file);
            setFormData(prev => ({ ...prev, profilePhotoUrl: compressed }));
        } catch (err) {
            console.error('Error compressing photo:', err);
        } finally {
            setUploadingPhoto(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const file = e.dataTransfer.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;

        try {
            setUploadingPhoto(true);
            const compressed = await compressImage(file);
            setFormData(prev => ({ ...prev, profilePhotoUrl: compressed }));
        } catch (err) {
            console.error('Error compressing dragged photo:', err);
        } finally {
            setUploadingPhoto(false);
        }
    };

    // Auto-extract profile photo from LinkedIn URL
    useEffect(() => {
        const linkedInUrl = formData.linkedInProfileUrl;
        if (!linkedInUrl || !linkedInUrl.includes('linkedin.com/in/') || formData.profilePhotoUrl) {
            return;
        }
        const fetchPhoto = async () => {
            try {
                setExtractingPhoto(true);
                const res = await api.get('/linkedin/scrape-profile', { params: { url: linkedInUrl } });
                if (res.data?.profilePhotoUrl) {
                    setFormData(prev => {
                        if (prev.profilePhotoUrl) return prev;
                        return { ...prev, profilePhotoUrl: res.data.profilePhotoUrl };
                    });
                }
            } catch (err: any) {
                console.warn('Could not extract LinkedIn photo:', err?.response?.data?.error || err.message);
            } finally {
                setExtractingPhoto(false);
            }
        };
        const timeoutId = setTimeout(fetchPhoto, 1500);
        return () => clearTimeout(timeoutId);
    }, [formData.linkedInProfileUrl]);

    // ── Handlers ──

    const handleSaveContact = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingContact(true);
        try {
            if (formData.role && config && !config.contactRoles.includes(formData.role)) {
                await addContactRole(formData.role);
            }

            const payload: any = { ...formData };
            if (selectedCompanies.length > 0) {
                payload.companies = selectedCompanies.map(c => c._id);
            } else {
                payload.companies = [];
            }
            if (payload.partner === '' || payload.channel !== 'partners') payload.partner = undefined;
            if (payload.partner && typeof payload.partner === 'object' && '_id' in payload.partner) {
                payload.partner = (payload.partner as any)._id;
            }
            // Send assignedTo as ID or null
            if (payload.assignedTo) {
                if (typeof payload.assignedTo === 'object' && '_id' in payload.assignedTo) {
                    payload.assignedTo = payload.assignedTo._id;
                }
            } else {
                payload.assignedTo = null; // Send null to backend to unset
            }

            let result;
            if (contactId) {
                result = await updateContact(contactId, payload);
            } else {
                result = await createContact(payload);
            }
            setContact(result);
            onSaved?.(result);
            onClose();
        } catch (error) {
            console.error('Error saving contact:', error);
        } finally {
            setSavingContact(false);
        }
    };

    const handleSubmitActivity = async () => {
        if (!actDescription.trim() || !contactId) return;
        setSavingActivity(true);
        try {
            const newActivity = await createActivity({
                type: selectedType,
                description: actDescription.trim(),
                outcome: outcome || undefined,
                contact: contactId,
                company: contact?.company?._id || undefined,
            } as any);
            setActivities(prev => [newActivity, ...prev]);
            setActDescription('');
            setOutcome('');
            setShowActivityForm(false);
            if (scrollRef.current) scrollRef.current.scrollTop = 0;
        } catch (err) {
            console.error('Failed to create activity:', err);
        } finally {
            setSavingActivity(false);
        }
    };

    const handleDeleteContact = async () => {
        if (!contactId) return;
        try {
            await deleteContact(contactId);
            onSaved?.({ ...contact, _deleted: true } as any);
            setShowDeleteConfirm(false);
            onClose();
        } catch (error) {
            console.error('Error al eliminar contacto:', error);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) onClose();
    };

    const handleSelectCompany = (comp: CompanyData) => {
        if (!selectedCompanies.find(c => c._id === comp._id)) {
            const newSelected = [...selectedCompanies, comp];
            setSelectedCompanies(newSelected);
            setFormData(prev => ({ ...prev, companies: newSelected.map(c => c._id) as any }));
        }
        setCompanySearch('');
        setShowCompanyPicker(false);
    };

    const handleRemoveCompany = (compId: string) => {
        const newSelected = selectedCompanies.filter(c => c._id !== compId);
        setSelectedCompanies(newSelected);
        setFormData(prev => ({ ...prev, companies: newSelected.map(c => c._id) as any }));
    };

    const displayContact = contact || contactPreview;

    if (!open) return null;

    return (
        <div
            onClick={handleBackdropClick}
            className="fixed inset-0 z-[100] flex justify-end"
            style={{
                background: 'rgba(15, 23, 42, 0.4)',
                backdropFilter: 'blur(8px)',
                animation: 'fadeIn 0.3s ease-out',
            }}
        >
            <div
                ref={drawerRef}
                className="h-full w-[480px] max-w-[100vw] bg-white/90 backdrop-blur-2xl border-l border-white/60 flex flex-col shadow-[-20px_0_40px_rgba(30,27,75,0.1)] relative"
                style={{ animation: 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }}
            >
                {/* Decorative Edge */}
                <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-fuchsia-500/50 via-violet-500/50 to-transparent" />

                {/* ── Header ───────────────────────────────── */}
                <div className="shrink-0 relative overflow-hidden bg-white/60 backdrop-blur-2xl border-b border-white/40 pt-6 px-6 pb-0 z-20">
                    {/* Decorative Background Elements */}
                    <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-violet-300/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
                    <div className="absolute top-0 left-0 w-[300px] h-[300px] bg-emerald-200/20 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/3 pointer-events-none" />

                    <div className="flex items-start justify-between mb-[10px] relative z-10">
                        <div className="flex items-center gap-4">
                            <div className="relative group">
                                <div className="absolute inset-0 bg-gradient-to-tr from-violet-500 to-emerald-400 rounded-[1.25rem] blur opacity-40 group-hover:opacity-70 transition-opacity duration-500" />
                                <div className="relative w-16 h-16 rounded-[1.25rem] bg-white border-2 border-white flex items-center justify-center overflow-hidden shadow-[0_8px_16px_-6px_rgba(0,0,0,0.1)] ring-1 ring-black/5 transform transition-transform duration-500 group-hover:scale-105">
                                    {displayContact?.profilePhotoUrl ? (
                                        <img src={displayContact.profilePhotoUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="font-black bg-gradient-to-br from-violet-600 to-emerald-500 bg-clip-text text-transparent text-2xl">
                                            {displayContact?.fullName?.substring(0, 2).toUpperCase() || '??'}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col justify-center">
                                <h2 className="text-[20px] font-black tracking-tight text-slate-800 leading-none mb-2">
                                    {displayContact?.fullName || 'Cargando...'}
                                </h2>
                                <div className="flex items-center gap-2 text-[12px] font-semibold">
                                    {displayContact?.position ? (
                                        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100/80 text-slate-600 border border-slate-200/50">
                                            <Briefcase size={12} className="text-slate-400" />
                                            {displayContact.position}
                                        </span>
                                    ) : (
                                        <span className="text-slate-400">Sin cargo</span>
                                    )}
                                    {displayContact?.company && (
                                        <>
                                            <span className="w-1 h-1 rounded-full bg-slate-300" />
                                            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-violet-50 text-violet-700 border border-violet-100/50">
                                                <Building2 size={12} className="text-violet-500" />
                                                {displayContact.company.name}
                                            </span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-full flex items-center justify-center transition-all bg-white hover:bg-slate-50 text-slate-400 hover:text-slate-700 shadow-sm border border-slate-200/60 hover:rotate-90 hover:scale-105"
                        >
                            <X size={15} strokeWidth={2.5} />
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1.5 bg-slate-100/60 p-1 rounded-[1rem] relative z-10 border border-slate-200/40 backdrop-blur-sm shadow-inner mb-3">
                        <button
                            onClick={() => setActiveTab('datos')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-[12px] font-bold transition-all duration-300 relative ${activeTab === 'datos'
                                ? 'bg-white text-violet-700 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)] ring-1 ring-slate-200/80 transform scale-[1.02]'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                                }`}
                        >
                            <Pencil size={13} className={activeTab === 'datos' ? "text-violet-600" : "text-slate-400"} />
                            Datos
                        </button>
                        <button
                            onClick={() => setActiveTab('actividad')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-[12px] font-bold transition-all duration-300 relative ${activeTab === 'actividad'
                                ? 'bg-white text-violet-700 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)] ring-1 ring-slate-200/80 transform scale-[1.02]'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                                }`}
                        >
                            <Clock size={13} className={activeTab === 'actividad' ? "text-violet-600" : "text-slate-400"} />
                            Actividad
                            {activities.length > 0 && (
                                <span className={`flex items-center justify-center h-[18px] min-w-[18px] px-1 text-[9px] rounded-full font-black ml-0.5 transition-colors ${activeTab === 'actividad' ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-500'}`}>
                                    {activities.length}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('tareas')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-[12px] font-bold transition-all duration-300 relative ${activeTab === 'tareas'
                                ? 'bg-white text-violet-700 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)] ring-1 ring-slate-200/80 transform scale-[1.02]'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                                }`}
                        >
                            <ListTodo size={13} className={activeTab === 'tareas' ? "text-amber-500" : "text-slate-400"} />
                            Tareas
                            {tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length > 0 && (
                                <span className={`flex items-center justify-center h-[18px] min-w-[18px] px-1 text-[9px] rounded-full font-black ml-0.5 transition-colors ${activeTab === 'tareas' ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 text-slate-500'}`}>
                                    {tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('trazabilidad')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-[12px] font-bold transition-all duration-300 relative ${activeTab === 'trazabilidad'
                                ? 'bg-white text-violet-700 shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)] ring-1 ring-slate-200/80 transform scale-[1.02]'
                                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                                }`}
                        >
                            <GitBranch size={13} className={activeTab === 'trazabilidad' ? "text-blue-500" : "text-slate-400"} />
                            Traza
                            {deals.length > 0 && (
                                <span className={`flex items-center justify-center h-[18px] min-w-[18px] px-1 text-[9px] rounded-full font-black ml-0.5 transition-colors ${activeTab === 'trazabilidad' ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-500'}`}>
                                    {deals.length}
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                {/* ── Tab Content ───────────────────────────── */}

                {activeTab === 'datos' ? (
                    /* ════════════ DATOS TAB ════════════ */
                    <form onSubmit={handleSaveContact} className="flex-1 flex flex-col overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-6 space-y-5 hidden-scrollbar">
                            {loadingContact ? (
                                <div className="flex items-center justify-center py-16">
                                    <Loader2 size={28} className="animate-spin text-violet-400" />
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center gap-4 bg-white/40 p-3 rounded-[16px] border border-slate-200/50">
                                        <div
                                            className={`relative group rounded-[16px] transition-all ${isDragging ? 'ring-4 ring-fuchsia-400/30 scale-105' : ''}`}
                                            onDragOver={handleDragOver}
                                            onDragLeave={handleDragLeave}
                                            onDrop={handleDrop}
                                        >
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept="image/png,image/jpeg,image/jpg,image/webp"
                                                onChange={handlePhotoUpload}
                                                className="hidden"
                                            />
                                            {formData.profilePhotoUrl ? (
                                                <div className="relative">
                                                    <img
                                                        src={formData.profilePhotoUrl}
                                                        alt="Foto de perfil"
                                                        className="w-16 h-16 rounded-[14px] object-cover border-2 border-white shadow-md ring-1 ring-slate-200"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setFormData(prev => ({ ...prev, profilePhotoUrl: '' }))}
                                                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                                                    >
                                                        <Trash2 size={10} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => fileInputRef.current?.click()}
                                                    disabled={uploadingPhoto || extractingPhoto}
                                                    className={`w-16 h-16 rounded-[14px] bg-gradient-to-br ${extractingPhoto ? 'from-blue-50 to-indigo-50 border-blue-300' : 'from-slate-100 to-slate-50 border-slate-300 hover:border-fuchsia-400 hover:from-fuchsia-50 hover:to-violet-50'} border-2 border-dashed transition-all flex flex-col items-center justify-center gap-1 cursor-pointer group/btn shadow-inner`}
                                                >
                                                    {(uploadingPhoto || extractingPhoto) ? (
                                                        <div className="flex flex-col items-center gap-0.5">
                                                            <Loader2 size={16} className={`${extractingPhoto ? 'text-blue-500' : 'text-fuchsia-400'} animate-spin`} />
                                                        </div>
                                                    ) : (
                                                        <Camera size={20} className="text-slate-400 group-hover/btn:text-fuchsia-500 transition-colors" />
                                                    )}
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex-1 space-y-0.5">
                                            <p className="text-[12px] font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                                                <ImagePlus size={13} className="text-fuchsia-500" />
                                                Foto de Perfil
                                            </p>
                                            <p className="text-[11px] text-slate-500 leading-tight">Arrastra una imagen o usa la URL de LinkedIn.</p>
                                            {!formData.profilePhotoUrl && (
                                                <button
                                                    type="button"
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="text-[11px] font-bold text-fuchsia-600 hover:text-fuchsia-700 flex items-center gap-1 transition-colors mt-1"
                                                >
                                                    Seleccionar archivo
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* LinkedIn Profile URL */}
                                    <div className="space-y-1.5">
                                        <label className="text-[12px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                            <Linkedin size={13} className="text-blue-600" /> Perfil de LinkedIn
                                        </label>
                                        <input
                                            type="url"
                                            value={formData.linkedInProfileUrl || ''}
                                            onChange={(e) => setFormData({ ...formData, linkedInProfileUrl: e.target.value })}
                                            placeholder="https://www.linkedin.com/in/..."
                                            className="w-full px-3 py-2.5 bg-white/60 border border-slate-200 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-300 transition-all text-[13px] font-medium text-slate-700 placeholder:text-slate-400"
                                        />
                                    </div>

                                    {/* Name */}
                                    <div className="space-y-1.5">
                                        <label className="text-[12px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                            <User size={13} className="text-fuchsia-500" /> Nombre Completo *
                                        </label>
                                        <input
                                            required
                                            type="text"
                                            value={formData.fullName || ''}
                                            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                            placeholder="Ej. Juan Pérez"
                                            className="w-full px-3 py-2.5 bg-white/60 border border-slate-200 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-fuchsia-500/10 focus:border-fuchsia-300 transition-all text-[13px] font-medium text-slate-700 placeholder:text-slate-400"
                                        />
                                    </div>

                                    {/* Position */}
                                    <div className="space-y-1.5">
                                        <CreatableAutocompleteInput
                                            label="Cargo"
                                            icon={<Briefcase size={13} className="text-amber-500" />}
                                            placeholder="Ej. Gerente de Ventas"
                                            value={formData.position || ''}
                                            onChangeSearch={(val) => setFormData(prev => ({ ...prev, position: val }))}
                                            options={config?.contactPositions?.map(p => ({ id: p, title: p })) || []}
                                            onSelect={(opt) => setFormData(prev => ({ ...prev, position: opt.title }))}
                                            onCreate={async (newTitle) => {
                                                await addContactPosition(newTitle);
                                                setConfig(prev => prev ? { ...prev, contactPositions: [...prev.contactPositions, newTitle] } : null);
                                            }}
                                            colorTheme="amber"
                                        />
                                    </div>

                                    {/* Companies Multi-Select */}
                                    <div className="space-y-1.5">
                                        <label className="text-[12px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                            <Building2 size={13} className="text-blue-500" />
                                            Empresas Asociadas
                                        </label>

                                        {selectedCompanies.length > 0 && (
                                            <div className="flex flex-col gap-2 mb-3">
                                                {selectedCompanies.map(comp => (
                                                    <div key={comp._id} className="flex items-center gap-2.5 bg-white border border-slate-200 rounded-[12px] p-2 shadow-sm group">
                                                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-100 to-indigo-100 border border-blue-200/50 flex items-center justify-center shrink-0 overflow-hidden">
                                                            {comp.logo ? (
                                                                <img src={comp.logo} alt={comp.name} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span className="font-bold text-[10px] text-blue-700">{comp.name.charAt(0).toUpperCase()}</span>
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-[12px] font-bold text-slate-800 truncate">{comp.name}</div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveCompany(comp._id)}
                                                            className="w-5 h-5 rounded-full bg-red-50 text-red-400 flex items-center justify-center hover:bg-red-100 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                                                        >
                                                            <X size={10} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className="relative">
                                            <button
                                                type="button"
                                                onClick={() => setShowCompanyPicker(!showCompanyPicker)}
                                                className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-slate-200 rounded-[12px] text-[12px] font-bold text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
                                            >
                                                <Building2 size={13} /> {selectedCompanies.length === 0 ? 'Seleccionar Empresa...' : 'Agregar Empresa'}
                                            </button>
                                            {showCompanyPicker && (
                                                <div className="absolute z-20 w-full mt-1.5 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-[14px] shadow-[0_8px_30px_rgba(0,0,0,0.12)] p-2">
                                                    <AutocompleteInput
                                                        label=""
                                                        icon={<Building2 size={13} className="text-blue-400" />}
                                                        placeholder="Buscar empresa..."
                                                        value={companySearch}
                                                        onChangeSearch={setCompanySearch}
                                                        options={companies
                                                            .filter(c => !selectedCompanies.some(sc => sc._id === c._id))
                                                            .map(c => ({ _id: c._id, title: c.name, subtitle: c.sector || c.website, data: c }))}
                                                        onSelect={(opt) => handleSelectCompany(opt.data)}
                                                        colorTheme="indigo"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Role + Channel */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <CreatableAutocompleteInput
                                                label="Rol de Compra"
                                                icon={<Tag size={13} className="text-slate-500" />}
                                                placeholder="Ej. Decisor"
                                                value={formData.role || ''}
                                                onChangeSearch={(val) => setFormData(prev => ({ ...prev, role: val }))}
                                                options={config?.contactRoles?.map(r => ({ id: r, title: r })) || []}
                                                onSelect={(opt) => setFormData(prev => ({ ...prev, role: opt.title }))}
                                                onCreate={async (newTitle) => {
                                                    await addContactRole(newTitle);
                                                    setConfig(prev => prev ? { ...prev, contactRoles: [...prev.contactRoles, newTitle] } : null);
                                                }}
                                                colorTheme="violet"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[12px] font-bold text-slate-700 uppercase tracking-wide">Canal de Origen</label>
                                            <SearchableSelect
                                                value={formData.channel || 'linkedin'}
                                                onChange={(val) => setFormData({ ...formData, channel: val })}
                                                options={[
                                                    { value: 'linkedin', label: 'LinkedIn' },
                                                    { value: 'whatsapp', label: 'WhatsApp' },
                                                    { value: 'email', label: 'Email' },
                                                    { value: 'phone', label: 'Teléfono' },
                                                    { value: 'partners', label: 'Partners' },
                                                    { value: 'other', label: 'Otro' }
                                                ]}
                                                placeholder="Seleccionar..."
                                                className="w-full px-3 py-2 bg-white/60 border border-slate-200 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-violet-500/10 focus:border-violet-300 transition-all text-[13px] font-medium text-slate-700"
                                            />
                                        </div>
                                    </div>

                                    {/* Partner selector */}
                                    {formData.channel === 'partners' && (
                                        <div className="space-y-1.5 bg-emerald-50/50 p-4 rounded-[14px] border border-emerald-100">
                                            <label className="text-[12px] font-bold text-emerald-800 flex items-center gap-1.5 uppercase tracking-wide">
                                                <Building2 size={13} /> Seleccionar Partner
                                            </label>
                                            <SearchableSelect
                                                value={(formData.partner as any)?._id || formData.partner || ''}
                                                onChange={(val) => setFormData({ ...formData, partner: val as any })}
                                                options={[
                                                    { value: '', label: 'Seleccione...' },
                                                    ...partners.map(p => ({ value: p._id, label: p.name }))
                                                ]}
                                                placeholder="Seleccione..."
                                                className="w-full px-3 py-2 bg-white/60 border border-emerald-200 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-emerald-500/10 text-[13px] font-medium text-slate-700"
                                            />
                                        </div>
                                    )}

                                    {/* Responsable / Owner Selector */}
                                    <div className="space-y-1.5">
                                        <label className="text-[12px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                            <User size={13} className="text-fuchsia-500" /> Responsable
                                        </label>
                                        <div className="relative">
                                            <SearchableSelect
                                                value={(formData.assignedTo as any)?._id || formData.assignedTo || ''}
                                                onChange={(val) => setFormData({ ...formData, assignedTo: val as any })}
                                                options={[
                                                    { value: '', label: 'Sin asignar' },
                                                    ...teamUsers.map(u => ({ value: u._id, label: u.name || u.email }))
                                                ]}
                                                placeholder="Sin asignar"
                                                className="w-full pl-10 pr-3 py-2 bg-white/60 border border-slate-200 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-fuchsia-500/10 focus:border-fuchsia-300 transition-all text-[13px] font-medium text-slate-700"
                                            />
                                            {/* Avatar preview inline */}
                                            <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                                                <OwnerAvatar
                                                    name={teamUsers.find(u => u._id === ((formData.assignedTo as any)?._id || formData.assignedTo))?.name || ''}
                                                    profilePhotoUrl={teamUsers.find(u => u._id === ((formData.assignedTo as any)?._id || formData.assignedTo))?.profilePhotoUrl}
                                                    size="xs"
                                                />
                                            </div>
                                        </div>
                                    </div>



                                    {/* Email + Phone */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[12px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                                <Mail size={13} className="text-teal-500" /> Email
                                            </label>
                                            <input
                                                type="email"
                                                value={formData.email || ''}
                                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                                placeholder="ejemplo@acme.com"
                                                className="w-full px-3 py-2.5 bg-white/60 border border-slate-200 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-teal-500/10 focus:border-teal-300 transition-all text-[13px] font-medium text-slate-700 placeholder:text-slate-400"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[12px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                                <Phone size={13} className="text-green-500" /> WhatsApp
                                            </label>
                                            <input
                                                type="tel"
                                                value={formData.phone || ''}
                                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                                placeholder="+54 9 11 ..."
                                                className="w-full px-3 py-2.5 bg-white/60 border border-slate-200 rounded-[12px] focus:outline-none focus:ring-2 focus:ring-green-500/10 focus:border-green-300 transition-all text-[13px] font-medium text-slate-700 placeholder:text-slate-400"
                                            />
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Footer — Datos */}
                        <div className="shrink-0 px-5 py-3 border-t border-slate-200/50 bg-white/80 backdrop-blur-md flex gap-2">
                            {contactId && (
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="px-3 py-2 bg-white border border-red-100 text-red-500 rounded-[10px] hover:bg-red-50 hover:border-red-200 transition-all shadow-sm"
                                    title="Eliminar"
                                >
                                    <AlertTriangle size={14} />
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-3 py-2 bg-white border border-slate-200/80 text-slate-600 rounded-[10px] text-[12px] font-bold hover:bg-slate-50 transition-all shadow-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={savingContact || !formData.fullName}
                                className="flex-1 px-3 py-2 bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white rounded-[10px] text-[12px] font-bold hover:shadow-[0_8px_24px_rgba(217,70,239,0.4)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 flex items-center justify-center gap-1.5 shadow-[0_4px_16px_rgba(217,70,239,0.3)]"
                            >
                                {savingContact ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                Guardar
                            </button>
                        </div>
                    </form>
                ) : activeTab === 'actividad' ? (
                    /* ════════════ ACTIVIDAD TAB ════════════ */
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {/* Timeline */}
                        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 hidden-scrollbar">
                            {loadingContact ? (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <Loader2 size={28} className="animate-spin text-violet-400" />
                                    <p className="text-[13px] text-slate-400 mt-3 font-medium">Cargando historial...</p>
                                </div>
                            ) : activities.length === 0 && !showActivityForm ? (
                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-4 border border-slate-100">
                                        <Clock size={28} className="text-slate-300" />
                                    </div>
                                    <h3 className="text-[15px] font-bold text-slate-600">Sin actividad registrada</h3>
                                    <p className="text-[13px] text-slate-400 mt-1 max-w-xs">
                                        Registra tu primera interacción con este contacto.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {/* Activity Form (inline, collapsible) */}
                                    {showActivityForm && (
                                        <div className="mb-6 p-4 bg-violet-50/50 rounded-[16px] border border-violet-100 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                            {/* Type Selector */}
                                            <div className="flex gap-1.5 flex-wrap">
                                                {ACTIVITY_TYPES.map(type => {
                                                    const Icon = type.icon;
                                                    const isActive = selectedType === type.value;
                                                    return (
                                                        <button
                                                            key={type.value}
                                                            onClick={() => { setSelectedType(type.value); setOutcome(''); }}
                                                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all border"
                                                            style={{
                                                                background: isActive ? type.bgColor : 'white',
                                                                borderColor: isActive ? type.color + '40' : '#e2e8f0',
                                                                color: isActive ? type.color : '#64748b',
                                                            }}
                                                        >
                                                            <Icon size={12} />
                                                            {type.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {/* Outcome Quick Select (per type) */}
                                            {OUTCOMES_BY_TYPE[selectedType]?.length > 0 && (
                                                <div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">¿Cómo fue?</p>
                                                    <div className="flex gap-1.5 flex-wrap">
                                                        {OUTCOMES_BY_TYPE[selectedType].map(o => {
                                                            const Icon = o.icon;
                                                            const isActive = outcome === o.value;
                                                            const typeInfo = ACTIVITY_TYPES.find(t => t.value === selectedType);
                                                            return (
                                                                <button
                                                                    key={o.value}
                                                                    onClick={() => setOutcome(isActive ? '' : o.value)}
                                                                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition-all border"
                                                                    style={{
                                                                        background: isActive ? (typeInfo?.bgColor || '#ecfdf5') : '#f8fafc',
                                                                        borderColor: isActive ? (typeInfo?.color || '#10b981') + '40' : '#e2e8f0',
                                                                        color: isActive ? (typeInfo?.color || '#10b981') : '#94a3b8',
                                                                    }}
                                                                >
                                                                    <Icon size={11} />
                                                                    {o.label}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Description */}
                                            <textarea
                                                ref={descRef}
                                                value={actDescription}
                                                onChange={e => setActDescription(e.target.value)}
                                                placeholder={
                                                    selectedType === 'call' ? 'Ej: Lo llamé y no respondió...' :
                                                        selectedType === 'meeting' ? 'Ej: Nos reunimos para...' :
                                                            selectedType === 'note' ? 'Escribe una nota...' :
                                                                'Describe la interacción...'
                                                }
                                                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 resize-none transition-all"
                                                rows={3}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmitActivity();
                                                }}
                                            />

                                            {/* Actions */}
                                            <div className="flex items-center justify-between">
                                                <button
                                                    onClick={() => { setShowActivityForm(false); setActDescription(''); setOutcome(''); }}
                                                    className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors px-2 py-1"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    onClick={handleSubmitActivity}
                                                    disabled={!actDescription.trim() || savingActivity}
                                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-[12px] font-bold shadow-lg shadow-violet-500/20 hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                                                >
                                                    {savingActivity ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                                    Guardar
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Timeline Items */}
                                    <div className="space-y-2">
                                        {activities.map((activity, idx) => {
                                            const typeInfo = getActivityIcon(activity.type);
                                            const Icon = typeInfo.icon;
                                            const isFirst = idx === 0;
                                            const outcomeData = (activity as any).outcome
                                                ? ALL_OUTCOMES.find(o => o.value === (activity as any).outcome)
                                                : null;
                                            const OutcomeIcon = outcomeData?.icon;

                                            return (
                                                <div
                                                    key={activity._id}
                                                    className={`bg-white rounded-[12px] border border-slate-100 px-3 py-2.5 shadow-sm hover:shadow-md transition-all ${isFirst ? 'animate-in fade-in slide-in-from-top-2 duration-300' : ''}`}
                                                >
                                                    {/* Header: icon + type + outcome + time */}
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <div
                                                            className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center border"
                                                            style={{ background: typeInfo.bgColor, borderColor: typeInfo.color + '25' }}
                                                        >
                                                            <Icon size={13} style={{ color: typeInfo.color }} />
                                                        </div>
                                                        <span
                                                            className="text-[10px] font-bold uppercase tracking-wider"
                                                            style={{ color: typeInfo.color }}
                                                        >
                                                            {typeInfo.label}
                                                        </span>
                                                        {outcomeData && (() => {
                                                            const OIcon = outcomeData.icon;
                                                            return (
                                                                <span
                                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border"
                                                                    style={{
                                                                        background: typeInfo.bgColor,
                                                                        borderColor: typeInfo.color + '20',
                                                                        color: typeInfo.color,
                                                                    }}
                                                                >
                                                                    <OIcon size={10} />
                                                                    {outcomeData.label}
                                                                </span>
                                                            );
                                                        })()}
                                                        {(activity as any).outcome && !outcomeData && (
                                                            <span className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-[10px] font-semibold text-slate-500">
                                                                {(activity as any).outcome}
                                                            </span>
                                                        )}
                                                        <div className="ml-auto flex items-center gap-2">
                                                            {activity.createdBy && (
                                                                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/60 px-1.5 py-0.5 rounded-full shadow-sm" title={`Creado por ${activity.createdBy.name || 'Usuario'} `}>
                                                                    <div className="w-4 h-4 rounded-full bg-white overflow-hidden shrink-0 flex items-center justify-center border border-slate-200/50">
                                                                        {activity.createdBy.profilePhotoUrl ? (
                                                                            <img src={activity.createdBy.profilePhotoUrl} alt="" className="w-full h-full object-cover" />
                                                                        ) : (
                                                                            <span className="text-[9px] font-bold text-slate-500">{activity.createdBy.name?.charAt(0).toUpperCase() || 'U'}</span>
                                                                        )}
                                                                    </div>
                                                                    <span className="text-[10px] font-bold text-slate-600 truncate max-w-[80px] pr-1 hidden sm:block">{activity.createdBy.name?.split(' ')[0] || 'User'}</span>
                                                                </div>
                                                            )}
                                                            <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap tabular-nums">
                                                                {formatActivityTime(activity.createdAt)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {/* Description */}
                                                    <p className="text-[12.5px] text-slate-600 leading-snug ml-9">
                                                        {activity.description}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Footer — Actividad */}
                        <div className="shrink-0 px-5 py-3 border-t border-slate-200/50 bg-white/80 backdrop-blur-md">
                            <button
                                onClick={() => setShowActivityForm(!showActivityForm)}
                                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-[13px] font-bold shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 hover:-translate-y-0.5 transition-all"
                            >
                                <Send size={14} />
                                {showActivityForm ? 'Cerrar Formulario' : 'Registrar Actividad'}
                            </button>
                        </div>
                    </div>
                ) : activeTab === 'tareas' ? (
                    /* ════════════ TAREAS TAB ════════════ */
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="flex-1 overflow-y-auto px-5 py-4 hidden-scrollbar">
                            {loadingContact ? (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <Loader2 size={28} className="animate-spin text-violet-400" />
                                    <p className="text-[13px] text-slate-400 mt-3 font-medium">Cargando tareas...</p>
                                </div>
                            ) : tasks.length === 0 && !showTaskForm ? (
                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mb-4 border border-amber-100">
                                        <ListTodo size={28} className="text-amber-300" />
                                    </div>
                                    <h3 className="text-[15px] font-bold text-slate-600">Sin tareas</h3>
                                    <p className="text-[13px] text-slate-400 mt-1 max-w-xs">
                                        Creá una tarea para hacer seguimiento de este contacto.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {/* Task Form (inline) */}
                                    {showTaskForm && (
                                        <div className="mb-4 p-3.5 bg-gradient-to-br from-amber-50/80 to-orange-50/40 rounded-[16px] border border-amber-200/60 space-y-3">
                                            <input
                                                type="text"
                                                value={taskTitle}
                                                onChange={e => setTaskTitle(e.target.value)}
                                                placeholder="¿Qué hay que hacer?"
                                                className="w-full px-3 py-2.5 rounded-xl border border-amber-200 bg-white text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all shadow-sm"
                                                autoFocus
                                            />
                                            {/* Type */}
                                            <div>
                                                <p className="text-[10px] font-bold text-amber-600/70 uppercase tracking-wider mb-1.5">Tipo</p>
                                                <div className="flex gap-1.5 flex-wrap">
                                                    {TASK_TYPES.map(t => {
                                                        const TIcon = t.icon;
                                                        const isActive = taskType === t.value;
                                                        return (
                                                            <button
                                                                key={t.value}
                                                                type="button"
                                                                onClick={() => setTaskType(t.value)}
                                                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border"
                                                                style={{
                                                                    background: isActive ? '#fffbeb' : 'white',
                                                                    borderColor: isActive ? '#f59e0b50' : '#e2e8f0',
                                                                    color: isActive ? '#d97706' : '#64748b',
                                                                    boxShadow: isActive ? '0 2px 8px rgba(245,158,11,0.15)' : 'none',
                                                                }}
                                                            >
                                                                <TIcon size={11} />
                                                                {t.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            {/* Priority */}
                                            <div>
                                                <p className="text-[10px] font-bold text-amber-600/70 uppercase tracking-wider mb-1.5">Prioridad</p>
                                                <div className="flex gap-1.5">
                                                    {TASK_PRIORITIES.map(p => {
                                                        const isActive = taskPriority === p.value;
                                                        return (
                                                            <button
                                                                key={p.value}
                                                                type="button"
                                                                onClick={() => setTaskPriority(p.value)}
                                                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border"
                                                                style={{
                                                                    background: isActive ? p.color + '15' : 'white',
                                                                    borderColor: isActive ? p.color + '40' : '#e2e8f0',
                                                                    color: isActive ? p.color : '#94a3b8',
                                                                    boxShadow: isActive ? `0 2px 8px ${p.color} 20` : 'none',
                                                                }}
                                                            >
                                                                <Flag size={10} />
                                                                {p.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            {/* Due Date & Time */}
                                            <div>
                                                <p className="text-[10px] font-bold text-amber-600/70 uppercase tracking-wider mb-1.5">Fecha y Hora</p>
                                                <div className="relative w-full">
                                                    <input
                                                        type="datetime-local"
                                                        value={taskDueDate}
                                                        onChange={e => setTaskDueDate(e.target.value)}
                                                        className="w-full px-3 py-2 rounded-xl border border-amber-200 bg-white text-[13px] text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all shadow-sm custom-date-input"
                                                    />
                                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-amber-400 bg-white/80 pl-2">
                                                        <Clock size={14} />
                                                    </div>
                                                </div>
                                            </div>
                                            {/* Responsable */}
                                            <div>
                                                <p className="text-[10px] font-bold text-amber-600/70 uppercase tracking-wider mb-1.5">Responsable</p>
                                                <div className="relative w-full">
                                                    <SearchableSelect
                                                        value={taskAssignedTo}
                                                        onChange={(val) => setTaskAssignedTo(val)}
                                                        options={[
                                                            { value: '', label: 'Sin asignar' },
                                                            ...teamUsers.map(u => ({ value: u._id, label: u.name || u.email }))
                                                        ]}
                                                        placeholder="Sin asignar"
                                                        className="w-full pl-10 pr-3 py-1.5 rounded-xl border border-amber-200 bg-white text-[13px] font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 transition-all shadow-sm"
                                                    />
                                                    <div className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                                                        <OwnerAvatar
                                                            name={teamUsers.find(u => u._id === taskAssignedTo)?.name || ''}
                                                            profilePhotoUrl={teamUsers.find(u => u._id === taskAssignedTo)?.profilePhotoUrl}
                                                            size="xs"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                            {/* Actions */}
                                            <div className="flex items-center justify-between pt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => { setShowTaskForm(false); setTaskTitle(''); setTaskDueDate(''); }}
                                                    className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/60"
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        if (!taskTitle.trim() || !contactId) return;
                                                        setSavingTask(true);
                                                        try {
                                                            const payload: Record<string, any> = {
                                                                title: taskTitle.trim(),
                                                                type: taskType,
                                                                priority: taskPriority,
                                                                contact: contactId,
                                                                company: contact?.company?._id || null,
                                                                assignedTo: taskAssignedTo || null,
                                                            };
                                                            if (taskDueDate) {
                                                                payload.dueDate = new Date(taskDueDate).toISOString();
                                                            }
                                                            const newTask = await createTask(payload);
                                                            setTasks(prev => [newTask, ...prev]);
                                                            setTaskTitle('');
                                                            setTaskDueDate('');
                                                            setShowTaskForm(false);
                                                        } catch (err) {
                                                            console.error('Failed to create task:', err);
                                                        } finally {
                                                            setSavingTask(false);
                                                        }
                                                    }}
                                                    disabled={!taskTitle.trim() || savingTask}
                                                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[12px] font-bold shadow-lg shadow-amber-500/20 hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                                                >
                                                    {savingTask ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                                                    Crear Tarea
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Task Lists */}
                                    {(() => {
                                        const pending = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
                                        const completed = tasks.filter(t => t.status === 'completed');

                                        const formatDueDate = (d: string) => {
                                            const date = new Date(d);
                                            const now = new Date();
                                            const isToday = date.toDateString() === now.toDateString();
                                            const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
                                            const isTomorrow = date.toDateString() === tomorrow.toDateString();
                                            if (isToday) return 'Hoy';
                                            if (isTomorrow) return 'Mañana';
                                            return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
                                        };

                                        const renderTaskCard = (task: TaskData, isCompleted: boolean) => {
                                            const tType = TASK_TYPES.find(t => t.value === task.type);
                                            const TIcon = tType?.icon || StickyNote;
                                            const typeLabel = tType?.label || task.type;
                                            const priorityInfo = TASK_PRIORITIES.find(p => p.value === task.priority);

                                            return (
                                                <div
                                                    key={task._id}
                                                    onClick={() => {
                                                        setEditingTask(task);
                                                        setIsTaskDrawerOpen(true);
                                                    }}
                                                    className={`rounded-[14px] border px-3.5 py-3 transition-all cursor-pointer group flex gap-3 items-center ${isCompleted
                                                        ? 'bg-emerald-50/40 border-emerald-100 hover:border-emerald-300'
                                                        : task.isOverdue
                                                            ? 'bg-red-50/30 border-red-100 shadow-sm hover:border-red-300'
                                                            : 'bg-white border-slate-100 shadow-sm hover:shadow-md hover:border-violet-200/60'
                                                        } `}
                                                >
                                                    <div className="flex-1 min-w-0">
                                                        {/* Row 1: Complete button + Title + Delete */}
                                                        <div className="flex items-start gap-2.5">
                                                            {!isCompleted ? (
                                                                <button
                                                                    onClick={async (e) => {
                                                                        e.stopPropagation();
                                                                        try {
                                                                            await completeTask(task._id);
                                                                            setTasks(prev => prev.map(t => t._id === task._id ? { ...t, status: 'completed' as const } : t));
                                                                        } catch (err) { console.error(err); }
                                                                    }}
                                                                    className="shrink-0 w-[22px] h-[22px] mt-0.5 rounded-full border-2 border-slate-300 hover:border-emerald-400 hover:bg-emerald-50 transition-all flex items-center justify-center btn-complete"
                                                                    title="Completar"
                                                                >
                                                                    <CheckCircle2 size={0} className="text-emerald-400 transition-all opacity-0" />
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={async (e) => {
                                                                        e.stopPropagation();
                                                                        try {
                                                                            await completeTask(task._id); // Assume completeTask toggles, or we need updateTask
                                                                            setTasks(prev => prev.map(t => t._id === task._id ? { ...t, status: 'pending' as const } : t));
                                                                        } catch (err) { console.error(err); }
                                                                    }}
                                                                >
                                                                    <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5 hover:text-emerald-500" />
                                                                </button>
                                                            )}
                                                            <span className={`flex-1 text-[13px] font-semibold leading-snug truncate ${isCompleted ? 'text-slate-400 line-through' : 'text-slate-800'
                                                                }`}>
                                                                {task.title}
                                                            </span>
                                                            {!isCompleted && (
                                                                <button
                                                                    onClick={async (e) => {
                                                                        e.stopPropagation();
                                                                        try {
                                                                            await deleteTaskApi(task._id);
                                                                            setTasks(prev => prev.filter(t => t._id !== task._id));
                                                                        } catch (err) { console.error(err); }
                                                                    }}
                                                                    className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                                                                    title="Eliminar"
                                                                >
                                                                    <Trash2 size={12} />
                                                                </button>
                                                            )}
                                                        </div>

                                                        {/* Row 2: Type + Priority + Due Date badges */}
                                                        <div className="flex items-center gap-1.5 mt-2 ml-8 flex-wrap">
                                                            {/* Type badge */}
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200/80 text-[10px] font-bold text-slate-500">
                                                                <TIcon size={10} />
                                                                {typeLabel}
                                                            </span>

                                                            {/* Priority badge */}
                                                            {priorityInfo && (
                                                                <span
                                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border"
                                                                    style={{
                                                                        color: isCompleted ? '#94a3b8' : priorityInfo.color,
                                                                        borderColor: (isCompleted ? '#94a3b8' : priorityInfo.color) + '25',
                                                                        background: (isCompleted ? '#94a3b8' : priorityInfo.color) + '10',
                                                                    }}
                                                                >
                                                                    <Flag size={9} />
                                                                    {priorityInfo.label}
                                                                </span>
                                                            )}

                                                            {/* Due date badge */}
                                                            {task.dueDate && (
                                                                <span
                                                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${isCompleted
                                                                        ? 'text-slate-400 border-slate-200 bg-slate-50'
                                                                        : task.isOverdue
                                                                            ? 'text-red-500 border-red-200 bg-red-50'
                                                                            : 'text-slate-500 border-slate-200 bg-slate-50'
                                                                        } `}
                                                                >
                                                                    <Calendar size={9} />
                                                                    {task.isOverdue && !isCompleted && '⚠ '}
                                                                    {formatDueDate(task.dueDate)}
                                                                </span>
                                                            )}

                                                            {/* Created date */}
                                                            <span className="text-[9px] text-slate-300 font-medium ml-auto">
                                                                {formatActivityTime(task.createdAt)}
                                                            </span>

                                                            {/* Owner assigned */}
                                                            {(task as any).assignedTo && (
                                                                <div className="ml-1.5 flex items-center">
                                                                    <OwnerAvatar name={(task as any).assignedTo.name} profilePhotoUrl={(task as any).assignedTo.profilePhotoUrl} size="xs" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="opacity-0 group-hover:opacity-100 transition-all duration-300 -translate-x-2 group-hover:translate-x-0 w-8 h-8 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                                                        <ChevronRight size={18} />
                                                    </div>
                                                </div>
                                            );
                                        };

                                        return (
                                            <>
                                                {pending.length > 0 && (
                                                    <div className="mb-5">
                                                        <div className="flex items-center gap-2 mb-2.5 px-1">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                                                Pendientes
                                                            </p>
                                                            <span className="text-[10px] font-bold text-amber-500 bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 rounded-full">
                                                                {pending.length}
                                                            </span>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {pending.map(task => renderTaskCard(task, false))}
                                                        </div>
                                                    </div>
                                                )}

                                                {completed.length > 0 && (
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-2.5 px-1">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                                                Completadas
                                                            </p>
                                                            <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded-full">
                                                                {completed.length}
                                                            </span>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {completed.map(task => renderTaskCard(task, true))}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </>
                            )}
                        </div>

                        {/* Footer — Tareas */}
                        <div className="shrink-0 px-5 py-3 border-t border-slate-200/50 bg-white/80 backdrop-blur-md">
                            <button
                                onClick={() => {
                                    if (!showTaskForm) {
                                        setTaskDueDate(getDefaultTaskDueDate());
                                        setTaskAssignedTo((user?._id || (user as any)?.id) || '');
                                    }
                                    setShowTaskForm(!showTaskForm);
                                }}
                                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[13px] font-bold shadow-lg shadow-amber-500/20 hover:shadow-amber-500/40 hover:-translate-y-0.5 transition-all"
                            >
                                <Plus size={14} />
                                {showTaskForm ? 'Cerrar Formulario' : 'Nueva Tarea'}
                            </button>
                        </div>
                    </div>
                ) : activeTab === 'trazabilidad' ? (
                    /* ════════════ TRAZABILIDAD TAB ════════════ */
                    <div className="flex-1 flex flex-col overflow-hidden">
                        <div className="flex-1 overflow-y-auto px-5 py-4 hidden-scrollbar">
                            {loadingContact ? (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <Loader2 size={28} className="animate-spin text-violet-400" />
                                    <p className="text-[13px] text-slate-400 mt-3 font-medium">Cargando oportunidades...</p>
                                </div>
                            ) : deals.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4 border border-blue-100">
                                        <TrendingUp size={28} className="text-blue-300" />
                                    </div>
                                    <h3 className="text-[15px] font-bold text-slate-600">Sin oportunidades</h3>
                                    <p className="text-[13px] text-slate-400 mt-1 max-w-xs">
                                        Este contacto no tiene deals asociados en el pipeline.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {/* Summary bar */}
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-xl text-[11px] font-bold text-emerald-700">
                                            <DollarSign size={12} className="text-emerald-500" />
                                            {deals.reduce((s, d) => s + (d.value || 0), 0).toLocaleString()}
                                            <span className="text-emerald-500/70 font-medium">total</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 border border-violet-100 rounded-xl text-[11px] font-bold text-violet-700">
                                            <Briefcase size={12} className="text-violet-500" />
                                            {deals.length}
                                            <span className="text-violet-500/70 font-medium">{deals.length === 1 ? 'deal' : 'deals'}</span>
                                        </div>
                                    </div>

                                    {/* Deal cards */}
                                    {deals.map(deal => {
                                        const stage = pipelineStages.find(s => s.key === deal.status);
                                        const stageLabel = stage?.label || deal.status;
                                        const stageColor = stage?.color || '#8b5cf6';

                                        return (
                                            <div
                                                key={deal._id}
                                                className="bg-white rounded-[16px] border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden"
                                            >
                                                {/* Stage strip */}
                                                <div
                                                    className="h-1.5 w-full"
                                                    style={{ background: `linear-gradient(90deg, ${stageColor}, ${stageColor}90)` }}
                                                />

                                                <div className="p-4">
                                                    {/* Row 1: Stage badge + Value */}
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span
                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border"
                                                            style={{
                                                                color: stageColor,
                                                                borderColor: stageColor + '30',
                                                                background: stageColor + '10',
                                                            }}
                                                        >
                                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stageColor }} />
                                                            {stageLabel}
                                                        </span>
                                                        <span className="text-[16px] font-extrabold text-emerald-600 font-mono tracking-tight">
                                                            ${deal.value?.toLocaleString() || 0}
                                                        </span>
                                                    </div>

                                                    {/* Row 2: Company + Title */}
                                                    <div className="flex items-start gap-3 mb-3">
                                                        <div
                                                            className="w-9 h-9 rounded-[10px] border border-slate-200/80 bg-white flex items-center justify-center shadow-sm shrink-0 overflow-hidden"
                                                            style={{ backgroundColor: deal.company?.themeColor || undefined }}
                                                        >
                                                            {deal.company?.logo ? (
                                                                <img
                                                                    src={deal.company.logo}
                                                                    alt=""
                                                                    className="w-full h-full object-contain p-0.5"
                                                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                                />
                                                            ) : (
                                                                <Building2 size={16} className="text-slate-400" />
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <h4 className="text-[14px] font-bold text-slate-800 truncate leading-snug">
                                                                {deal.title}
                                                            </h4>
                                                            {deal.company?.name && (
                                                                <p className="text-[11px] text-slate-400 font-medium truncate mt-0.5">
                                                                    {deal.company.name}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Row 3: Meta badges */}
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        {/* Days in stage */}
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200/80 text-[10px] font-bold text-slate-500">
                                                            <Clock size={9} />
                                                            {deal.daysInStatus || 0}d en etapa
                                                        </span>

                                                        {/* Expected close */}
                                                        {deal.expectedCloseDate && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200/80 text-[10px] font-bold text-slate-500">
                                                                <Calendar size={9} />
                                                                {new Date(deal.expectedCloseDate).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                                                            </span>
                                                        )}

                                                        {/* Pending tasks */}
                                                        {deal.pendingTasks !== undefined && deal.pendingTasks > 0 && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200/60 text-[10px] font-bold text-amber-600">
                                                                <CheckSquare size={9} />
                                                                {deal.pendingTasks} tarea{deal.pendingTasks !== 1 && 's'}
                                                            </span>
                                                        )}

                                                        {/* Created */}
                                                        <span className="text-[9px] text-slate-300 font-medium ml-auto">
                                                            Creado {new Date(deal.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                                                        </span>
                                                    </div>

                                                    {/* Row 4: Owner */}
                                                    {deal.assignedTo && (
                                                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                                                            <OwnerAvatar name={deal.assignedTo.name} profilePhotoUrl={deal.assignedTo.profilePhotoUrl} size="xs" />
                                                            <span className="text-[11px] text-slate-500 font-medium">{deal.assignedTo.name}</span>
                                                        </div>
                                                    )}

                                                    {/* Row 5: Status History Timeline */}
                                                    {((deal as any).statusHistory?.length > 0 || deal.createdAt) && (
                                                        <div className="mt-3 pt-3 border-t border-slate-100">
                                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                                                <History size={10} /> Recorrido en Pipeline
                                                            </div>
                                                            <div className="relative ml-1.5">
                                                                <div className="absolute left-[4.5px] top-1 bottom-1 w-px bg-slate-200" />
                                                                {/* Creation entry */}
                                                                <div className="relative flex items-start gap-2.5 pb-2">
                                                                    <div className="w-2.5 h-2.5 rounded-full bg-violet-400 border-2 border-white shadow-sm shrink-0 mt-0.5 z-10" />
                                                                    <div className="flex-1 flex items-baseline justify-between gap-2">
                                                                        <span className="text-[10px] font-bold text-slate-600">Creación</span>
                                                                        <span className="text-[9px] text-slate-400 font-medium shrink-0">
                                                                            {new Date(deal.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} {new Date(deal.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                {/* Status changes */}
                                                                {((deal as any).statusHistory || []).map((h: any, idx: number) => {
                                                                    const toStage = pipelineStages.find(s => s.key === h.to);
                                                                    const toLabel = toStage?.label || h.to;
                                                                    const toColor = toStage?.color || '#64748b';
                                                                    const isLast = idx === ((deal as any).statusHistory || []).length - 1;
                                                                    return (
                                                                        <div key={idx} className={`relative flex items-start gap-2.5 ${isLast ? '' : 'pb-2'}`}>
                                                                            <div className="w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm shrink-0 mt-0.5 z-10" style={{ backgroundColor: toColor }} />
                                                                            <div className="flex-1 flex items-baseline justify-between gap-2">
                                                                                <span className="text-[10px] font-bold" style={{ color: toColor }}>{toLabel}</span>
                                                                                <span className="text-[9px] text-slate-400 font-medium shrink-0">
                                                                                    {new Date(h.changedAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} {new Date(h.changedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}

                {/* ── Delete Confirmation Modal ─────────────── */}
                {showDeleteConfirm && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" style={{ animation: 'fadeIn 0.2s ease-out' }}>
                        <div className="bg-white rounded-[24px] p-6 max-w-sm w-full shadow-[0_20px_60px_rgba(0,0,0,0.1)] border border-slate-100" onClick={e => e.stopPropagation()}>
                            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-[16px] flex items-center justify-center mb-5 border border-red-100 shadow-inner">
                                <AlertTriangle size={28} />
                            </div>
                            <h3 className="text-[20px] font-bold text-slate-800 mb-2 tracking-tight">¿Eliminar Contacto?</h3>
                            <p className="text-slate-500 text-[14px] mb-6 leading-relaxed">
                                Estás a punto de eliminar a <strong>{contact?.fullName}</strong>. Esta acción no se puede deshacer.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className="flex-1 py-3 px-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-[14px] hover:bg-slate-50 transition-colors text-[14px]"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleDeleteContact}
                                    className="flex-1 py-3 px-4 bg-red-500 text-white font-bold rounded-[14px] hover:bg-red-600 transition-colors shadow-sm shadow-red-500/30 text-[14px]"
                                >
                                    Sí, eliminar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <TaskFormDrawer
                    task={editingTask}
                    open={isTaskDrawerOpen}
                    onClose={() => {
                        setIsTaskDrawerOpen(false);
                        setEditingTask(null);
                    }}
                    onSaved={() => {
                        if (contact) {
                            getTasks({ contact: contact._id, limit: 100 })
                                .then(res => setTasks(res.tasks))
                                .catch(console.error);
                        }
                    }}
                />

                <style>{`
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideInRight { from { transform: translateX(100 %); } to { transform: translateX(0); } }
                    .hidden-scrollbar::-webkit-scrollbar { display: none; }
                    .hidden-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
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
        </div >
    );
}
