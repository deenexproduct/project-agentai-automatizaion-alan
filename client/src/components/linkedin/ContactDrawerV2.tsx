import { useState, useEffect, useRef } from 'react';
import type { LinkedInContact, INote } from '../../services/linkedin-crm.service';
import { getContact, addNote, enrichContact } from '../../services/linkedin-crm.service';
import {
    X,
    User,
    Briefcase,
    GraduationCap,
    Sparkles,
    StickyNote,
    History,
    ExternalLink,
    MessageCircle,
    Edit3,
    Mail,
    Building2,
    TrendingUp,
    Lightbulb,
    ShoppingCart,
    Newspaper,
    Globe,
    MapPin,
    Link2,
    Clock,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Send,
    Plus,
    ChevronDown,
    ChevronUp,
    Phone,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────

type TabType = 'overview' | 'profile' | 'enrichment' | 'notes' | 'history';

// ── Status Config ─────────────────────────────────────────────

const STATUS_INFO: Record<string, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
    visitando: {
        label: 'Visitando',
        color: '#06b6d4',
        bgColor: 'rgba(6, 182, 212, 0.15)',
        icon: <Clock size={14} />
    },
    conectando: {
        label: 'Conectando',
        color: '#eab308',
        bgColor: 'rgba(234, 179, 8, 0.15)',
        icon: <Link2 size={14} />
    },
    interactuando: {
        label: 'Interactuando',
        color: '#f97316',
        bgColor: 'rgba(249, 115, 22, 0.15)',
        icon: <MessageCircle size={14} />
    },
    enriqueciendo: {
        label: 'Enriqueciendo',
        color: '#a855f7',
        bgColor: 'rgba(168, 85, 247, 0.15)',
        icon: <Sparkles size={14} />
    },
    esperando_aceptacion: {
        label: 'Esperando Aceptación',
        color: '#f59e0b',
        bgColor: 'rgba(245, 158, 11, 0.15)',
        icon: <Clock size={14} />
    },
    aceptado: {
        label: 'Aceptado',
        color: '#10b981',
        bgColor: 'rgba(16, 185, 129, 0.15)',
        icon: <CheckCircle2 size={14} />
    },
    mensaje_enviado: {
        label: 'Mensaje Enviado',
        color: '#8b5cf6',
        bgColor: 'rgba(139, 92, 246, 0.15)',
        icon: <Send size={14} />
    },
};

const PIPELINE_STEPS = [
    { key: 'visitando', label: 'Visitando', color: '#06b6d4', dateField: 'createdAt' as const },
    { key: 'conectando', label: 'Conectando', color: '#eab308', dateField: 'createdAt' as const },
    { key: 'interactuando', label: 'Interactuando', color: '#f97316', dateField: 'interactedAt' as const },
    { key: 'enriqueciendo', label: 'Enriqueciendo', color: '#a855f7', dateField: 'enrichedAt' as const },
    { key: 'esperando_aceptacion', label: 'Esperando', color: '#f59e0b', dateField: 'sentAt' as const },
    { key: 'aceptado', label: 'Aceptado', color: '#10b981', dateField: 'acceptedAt' as const },
    { key: 'mensaje_enviado', label: 'Mensaje', color: '#8b5cf6', dateField: 'messageSentAt' as const },
];

// ── Helpers ───────────────────────────────────────────────────

function formatDate(dateStr?: string): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatDateShort(dateStr?: string): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: 'short',
    });
}

function getInitials(name: string): string {
    return name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

function extractWhatsAppNumber(contact: LinkedInContact): string | null {
    // Intentar extraer de about o de notas
    const text = contact.about || '';
    const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/);
    if (phoneMatch) {
        const cleaned = phoneMatch[0].replace(/[^\d+]/g, '');
        return cleaned.startsWith('+') ? cleaned : `+54${cleaned}`;
    }
    return null;
}

// ── Circular Progress Component ───────────────────────────────

function CircularProgress({
    value,
    size = 60,
    strokeWidth = 4,
    color = '#7c3aed'
}: {
    value: number;
    size?: number;
    strokeWidth?: number;
    color?: string;
}) {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (value / 100) * circumference;

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="transform -rotate-90">
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="rgba(124, 58, 237, 0.1)"
                    strokeWidth={strokeWidth}
                    fill="transparent"
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke={color}
                    strokeWidth={strokeWidth}
                    fill="transparent"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold" style={{ color }}>{value}%</span>
            </div>
        </div>
    );
}

// ── Tab Button Component ─────────────────────────────────────

function TabButton({
    active,
    onClick,
    icon: Icon,
    label
}: {
    active: boolean;
    onClick: () => void;
    icon: React.ElementType;
    label: string;
}) {
    return (
        <button
            onClick={onClick}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200"
            style={{
                background: active ? 'rgba(124, 58, 237, 0.15)' : 'transparent',
                color: active ? '#7c3aed' : '#64748b',
            }}
        >
            <Icon size={14} />
            <span className="hidden sm:inline">{label}</span>
        </button>
    );
}

// ── Expandable Card Component ─────────────────────────────────

function ExpandableCard({ title, children, defaultExpanded = false }: { title: string; children: React.ReactNode; defaultExpanded?: boolean }) {
    const [expanded, setExpanded] = useState(defaultExpanded);

    return (
        <div className="rounded-lg bg-white/60 border border-purple-50 overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-white/40 transition-colors"
            >
                <span className="text-xs font-semibold text-slate-700">{title}</span>
                {expanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
            </button>
            {expanded && (
                <div className="px-3 pb-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    {children}
                </div>
            )}
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────

interface Props {
    contactId: string | null;
    onClose: () => void;
}

export default function ContactDrawerV2({ contactId, onClose }: Props) {
    const [contact, setContact] = useState<LinkedInContact | null>(null);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [noteText, setNoteText] = useState('');
    const [savingNote, setSavingNote] = useState(false);
    const [enriching, setEnriching] = useState(false);
    const drawerRef = useRef<HTMLDivElement>(null);

    // Fetch contact
    useEffect(() => {
        if (!contactId) { setContact(null); return; }
        setLoading(true);
        getContact(contactId)
            .then(setContact)
            .catch(() => setContact(null))
            .finally(() => setLoading(false));
    }, [contactId]);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    // Close on backdrop click
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
            onClose();
        }
    };

    const handleAddNote = async () => {
        if (!contact || !noteText.trim() || savingNote) return;
        setSavingNote(true);
        try {
            const notes = await addNote(contact._id, noteText.trim());
            setContact({ ...contact, notes });
            setNoteText('');
        } catch { /* ignore */ }
        setSavingNote(false);
    };

    const handleEnrich = async () => {
        if (!contact || enriching) return;
        setEnriching(true);
        try {
            const result = await enrichContact(contact._id);
            if (result.contact) setContact(result.contact);
            else {
                const updated = await getContact(contact._id);
                setContact(updated);
            }
        } catch (err: any) {
            console.error('Enrichment failed:', err.message);
        } finally {
            setEnriching(false);
        }
    };

    const whatsappNumber = contact ? extractWhatsAppNumber(contact) : null;

    if (!contactId) return null;

    const statusConfig = contact ? STATUS_INFO[contact.status] : null;

    return (
        <div
            onClick={handleBackdropClick}
            className="fixed inset-0 z-50 flex justify-end"
            style={{
                background: 'rgba(0,0,0,0.3)',
                backdropFilter: 'blur(4px)',
                animation: 'fadeIn 0.2s ease',
            }}
        >
            <div
                ref={drawerRef}
                className="h-full flex flex-col"
                style={{
                    width: 480,
                    maxWidth: '100vw',
                    background: 'linear-gradient(180deg, #faf8ff 0%, #f5f0ff 100%)',
                    boxShadow: '-4px 0 30px rgba(124, 58, 237, 0.15)',
                    animation: 'slideInRight 0.3s ease',
                }}
            >
                {loading ? (
                    <div className="flex items-center justify-center flex-1">
                        <div className="animate-spin w-8 h-8 border-3 border-purple-200 border-t-purple-600 rounded-full" />
                    </div>
                ) : !contact ? (
                    <div className="flex items-center justify-center flex-1 text-slate-400">
                        No se encontró el contacto
                    </div>
                ) : (
                    <>
                        {/* ── Header ───────────────────────────────────────── */}
                        <div className="relative shrink-0">
                            {/* Banner/Gradient Background */}
                            <div
                                className="h-24"
                                style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(168,85,247,0.1))' }}
                            />

                            {/* Close Button */}
                            <button
                                onClick={onClose}
                                className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center z-10 hover:bg-white/40 transition-colors"
                                style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(4px)' }}
                            >
                                <X size={16} className="text-slate-600" />
                            </button>

                            {/* Profile Section */}
                            <div className="px-6 -mt-10">
                                <div className="flex items-end gap-4">
                                    {/* Avatar */}
                                    <div className="relative">
                                        <div
                                            className="rounded-full overflow-hidden flex items-center justify-center border-4 border-white shadow-lg"
                                            style={{
                                                width: 80,
                                                height: 80,
                                                background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                                            }}
                                        >
                                            {contact.profilePhotoUrl ? (
                                                <img
                                                    src={contact.profilePhotoUrl}
                                                    alt={contact.fullName}
                                                    className="w-full h-full object-cover"
                                                    referrerPolicy="no-referrer"
                                                />
                                            ) : (
                                                <span className="text-white text-2xl font-bold">{getInitials(contact.fullName)}</span>
                                            )}
                                        </div>
                                        {/* Online Status Indicator */}
                                        <div
                                            className="absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-white"
                                            style={{ background: '#10b981' }}
                                            title="Online"
                                        />
                                    </div>

                                    {/* Quick Actions */}
                                    <div className="flex gap-2 mb-2">
                                        <button
                                            className="p-2 rounded-lg transition-all hover:scale-105"
                                            style={{ background: 'rgba(124, 58, 237, 0.1)' }}
                                            title="Editar contacto"
                                        >
                                            <Edit3 size={16} style={{ color: '#7c3aed' }} />
                                        </button>
                                        <button
                                            onClick={handleEnrich}
                                            disabled={enriching}
                                            className="p-2 rounded-lg transition-all hover:scale-105 disabled:opacity-50"
                                            style={{ background: 'rgba(168, 85, 247, 0.1)' }}
                                            title="Enriquecer contacto"
                                        >
                                            {enriching ? <Loader2 size={16} className="animate-spin" style={{ color: '#a855f7' }} /> : <Sparkles size={16} style={{ color: '#a855f7' }} />}
                                        </button>
                                        <button
                                            className="p-2 rounded-lg transition-all hover:scale-105"
                                            style={{ background: 'rgba(6, 182, 212, 0.1)' }}
                                            title="Enviar mensaje"
                                        >
                                            <Mail size={16} style={{ color: '#06b6d4' }} />
                                        </button>
                                    </div>
                                </div>

                                {/* Name & Headline */}
                                <div className="mt-3">
                                    <h2 className="text-xl font-bold text-slate-800">{contact.fullName}</h2>
                                    {contact.headline && (
                                        <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{contact.headline}</p>
                                    )}
                                    {contact.location && (
                                        <div className="flex items-center gap-1 text-xs text-slate-400 mt-1">
                                            <MapPin size={12} />
                                            {contact.location}
                                        </div>
                                    )}
                                </div>

                                {/* Status Badge */}
                                <div className="mt-3 flex items-center gap-2 flex-wrap">
                                    {statusConfig && (
                                        <span
                                            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
                                            style={{
                                                background: statusConfig.bgColor,
                                                color: statusConfig.color,
                                            }}
                                        >
                                            {statusConfig.icon}
                                            {statusConfig.label}
                                        </span>
                                    )}
                                    {contact.connectionDegree && (
                                        <span className="text-xs text-slate-500 px-2.5 py-1.5 rounded-full bg-white/70 border border-purple-50">
                                            {contact.connectionDegree}
                                        </span>
                                    )}
                                    {contact.connectionsCount && (
                                        <span className="text-xs text-slate-500 px-2.5 py-1.5 rounded-full bg-white/70 border border-purple-50 flex items-center gap-1">
                                            <Link2 size={12} />
                                            {contact.connectionsCount}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* ── Tabs ───────────────────────────────────────── */}
                            <div className="px-4 mt-4 border-b border-purple-100/50">
                                <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-2">
                                    <TabButton
                                        active={activeTab === 'overview'}
                                        onClick={() => setActiveTab('overview')}
                                        icon={User}
                                        label="Overview"
                                    />
                                    <TabButton
                                        active={activeTab === 'profile'}
                                        onClick={() => setActiveTab('profile')}
                                        icon={Briefcase}
                                        label="Perfil"
                                    />
                                    <TabButton
                                        active={activeTab === 'enrichment'}
                                        onClick={() => setActiveTab('enrichment')}
                                        icon={Sparkles}
                                        label="Enriquecimiento"
                                    />
                                    <TabButton
                                        active={activeTab === 'notes'}
                                        onClick={() => setActiveTab('notes')}
                                        icon={StickyNote}
                                        label="Notas"
                                    />
                                    <TabButton
                                        active={activeTab === 'history'}
                                        onClick={() => setActiveTab('history')}
                                        icon={History}
                                        label="Historial"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* ── Content Area ─────────────────────────────────── */}
                        <div className="flex-1 overflow-y-auto">
                            {/* ===== OVERVIEW TAB ===== */}
                            {activeTab === 'overview' && (
                                <div className="p-6 space-y-6 animate-in fade-in duration-200">
                                    {/* Current Status Card */}
                                    <div className="rounded-xl bg-white/60 border border-purple-50 p-4">
                                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                            <TrendingUp size={14} />
                                            Estado en Pipeline
                                        </h3>
                                        <div className="flex items-center gap-4">
                                            <div
                                                className="w-12 h-12 rounded-full flex items-center justify-center"
                                                style={{ background: statusConfig?.bgColor }}
                                            >
                                                {statusConfig?.icon}
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-slate-700">{statusConfig?.label}</p>
                                                <p className="text-xs text-slate-400">
                                                    Desde {formatDateShort(contact.createdAt)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Contact Info */}
                                    <div className="rounded-xl bg-white/60 border border-purple-50 p-4">
                                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                                            Información de Contacto
                                        </h3>
                                        <div className="space-y-3">
                                            {contact.currentCompany && (
                                                <div className="flex items-start gap-3">
                                                    <Building2 size={16} className="text-purple-500 mt-0.5 shrink-0" />
                                                    <div>
                                                        <p className="text-xs text-slate-400">Empresa actual</p>
                                                        <p className="text-sm text-slate-700 font-medium">{contact.currentCompany}</p>
                                                        {contact.currentPosition && (
                                                            <p className="text-xs text-slate-500">{contact.currentPosition}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                            {contact.industry && (
                                                <div className="flex items-start gap-3">
                                                    <Globe size={16} className="text-purple-500 mt-0.5 shrink-0" />
                                                    <div>
                                                        <p className="text-xs text-slate-400">Industria</p>
                                                        <p className="text-sm text-slate-700">{contact.industry}</p>
                                                    </div>
                                                </div>
                                            )}
                                            {contact.followersCount && (
                                                <div className="flex items-start gap-3">
                                                    <User size={16} className="text-purple-500 mt-0.5 shrink-0" />
                                                    <div>
                                                        <p className="text-xs text-slate-400">Seguidores</p>
                                                        <p className="text-sm text-slate-700">{contact.followersCount}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* About */}
                                    {contact.about && (
                                        <div className="rounded-xl bg-white/60 border border-purple-50 p-4">
                                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                                                Acerca de
                                            </h3>
                                            <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed line-clamp-6">
                                                {contact.about}
                                            </p>
                                        </div>
                                    )}

                                    {/* Latest Enrichment Preview */}
                                    {contact.enrichmentStatus === 'completed' && contact.enrichmentData && (
                                        <div className="rounded-xl bg-gradient-to-br from-purple-50/50 to-purple-100/30 border border-purple-100 p-4">
                                            <h3 className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                                                <Sparkles size={14} />
                                                Último Enriquecimiento
                                            </h3>
                                            {contact.enrichmentData.keyInsights?.[0] && (
                                                <p className="text-sm text-slate-600 mb-2">
                                                    • {typeof contact.enrichmentData.keyInsights[0] === 'string'
                                                        ? contact.enrichmentData.keyInsights[0]
                                                        : contact.enrichmentData.keyInsights[0].text}
                                                </p>
                                            )}
                                            <button
                                                onClick={() => setActiveTab('enrichment')}
                                                className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                                            >
                                                Ver más detalles →
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ===== PROFILE TAB ===== */}
                            {activeTab === 'profile' && (
                                <div className="p-6 space-y-6 animate-in fade-in duration-200">
                                    {/* Experience */}
                                    {contact.experience?.length > 0 && (
                                        <div className="rounded-xl bg-white/60 border border-purple-50 p-4">
                                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                                <Briefcase size={14} />
                                                Experiencia
                                            </h3>
                                            <div className="space-y-4">
                                                {contact.experience.map((exp, i) => (
                                                    <div key={i} className="flex items-start gap-3">
                                                        <div
                                                            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                                                            style={{ background: 'rgba(124,58,237,0.08)' }}
                                                        >
                                                            {exp.logoUrl ? (
                                                                <img src={exp.logoUrl} alt="" className="w-full h-full object-contain" />
                                                            ) : (
                                                                <Briefcase size={16} className="text-purple-400" />
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-semibold text-slate-700">{exp.position}</p>
                                                            <p className="text-xs text-slate-500">{exp.company}</p>
                                                            {exp.duration && <p className="text-[10px] text-slate-400 mt-0.5">{exp.duration}</p>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Education */}
                                    {contact.education?.length > 0 && (
                                        <div className="rounded-xl bg-white/60 border border-purple-50 p-4">
                                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                                <GraduationCap size={14} />
                                                Educación
                                            </h3>
                                            <div className="space-y-4">
                                                {contact.education.map((edu, i) => (
                                                    <div key={i} className="flex items-start gap-3">
                                                        <div
                                                            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                                                            style={{ background: 'rgba(124,58,237,0.08)' }}
                                                        >
                                                            <GraduationCap size={16} className="text-purple-400" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-semibold text-slate-700">{edu.institution}</p>
                                                            {edu.degree && <p className="text-xs text-slate-500">{edu.degree}</p>}
                                                            {edu.years && <p className="text-[10px] text-slate-400 mt-0.5">{edu.years}</p>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Skills */}
                                    {contact.skills?.length > 0 && (
                                        <div className="rounded-xl bg-white/60 border border-purple-50 p-4">
                                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                                <Sparkles size={14} />
                                                Skills
                                            </h3>
                                            <div className="flex flex-wrap gap-2">
                                                {contact.skills.map((skill, i) => (
                                                    <span
                                                        key={i}
                                                        className="text-xs px-3 py-1.5 rounded-full font-medium"
                                                        style={{ background: 'rgba(124,58,237,0.08)', color: '#7c3aed' }}
                                                    >
                                                        {skill}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ===== ENRICHMENT TAB ===== */}
                            {activeTab === 'enrichment' && (
                                <div className="p-6 space-y-4 animate-in fade-in duration-200">
                                    {/* Header with Enrich Button */}
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                                            <Sparkles size={16} className="text-purple-500" />
                                            Datos Enriquecidos
                                        </h3>
                                        {contact.enrichmentStatus !== 'enriching' && (
                                            <button
                                                onClick={handleEnrich}
                                                disabled={enriching}
                                                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium transition-all disabled:opacity-50"
                                                style={{
                                                    background: enriching ? '#e2e8f0' : 'rgba(124,58,237,0.1)',
                                                    color: enriching ? '#94a3b8' : '#7c3aed',
                                                }}
                                            >
                                                {enriching ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                                {enriching ? 'Enriqueciendo...' : contact.enrichmentStatus === 'completed' ? 'Re-enriquecer' : 'Enriquecer'}
                                            </button>
                                        )}
                                    </div>

                                    {/* Status banners */}
                                    {contact.enrichmentStatus === 'enriching' && (
                                        <div className="p-4 rounded-xl flex items-center gap-3" style={{ background: 'rgba(234,179,8,0.1)' }}>
                                            <Loader2 size={20} className="text-yellow-600 animate-spin" />
                                            <span className="text-sm text-yellow-700">Enriquecimiento en proceso...</span>
                                        </div>
                                    )}
                                    {contact.enrichmentStatus === 'failed' && (
                                        <div className="p-4 rounded-xl flex items-center gap-3" style={{ background: 'rgba(239,68,68,0.1)' }}>
                                            <AlertCircle size={20} className="text-red-600" />
                                            <span className="text-sm text-red-700">El enriquecimiento falló. Intentá de nuevo.</span>
                                        </div>
                                    )}

                                    {/* Enrichment Data */}
                                    {contact.enrichmentStatus === 'completed' && contact.enrichmentData ? (
                                        <div className="space-y-4">
                                            {/* Personalized Pitch — MOST IMPORTANT */}
                                            {contact.enrichmentData.personalizedPitch && (
                                                <div className="rounded-xl border-2 border-purple-200 p-4" style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.06), rgba(168,85,247,0.04))' }}>
                                                    <h4 className="text-xs font-bold text-purple-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                                                        🎯 Pitch Personalizado
                                                    </h4>
                                                    <p className="text-sm text-slate-700 leading-relaxed italic">
                                                        "{contact.enrichmentData.personalizedPitch}"
                                                    </p>
                                                    {contact.enrichmentData.bestApproachChannel && (
                                                        <p className="text-[10px] text-purple-500 mt-2 font-medium">
                                                            📱 Canal recomendado: {contact.enrichmentData.bestApproachChannel}
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            {/* Commercial Score + Confidence Score */}
                                            <div className="rounded-xl bg-white/60 border border-purple-50 p-4">
                                                <div className="flex items-center gap-4">
                                                    <CircularProgress
                                                        value={contact.enrichmentData.commercialScore || contact.enrichmentData.confidenceScore || 75}
                                                        size={70}
                                                        color={
                                                            (contact.enrichmentData.commercialScore || contact.enrichmentData.confidenceScore || 0) >= 70 ? '#10b981' :
                                                                (contact.enrichmentData.commercialScore || contact.enrichmentData.confidenceScore || 0) >= 40 ? '#eab308' : '#ef4444'
                                                        }
                                                    />
                                                    <div>
                                                        <p className="text-sm font-semibold text-slate-700">
                                                            {contact.enrichmentData.commercialScore ? 'Score Comercial' : 'Score de Confianza'}
                                                        </p>
                                                        <p className="text-xs text-slate-500">
                                                            {contact.enrichmentData.dataQuality === 'verified' ? '✅ Datos verificados' :
                                                                contact.enrichmentData.dataQuality === 'partial' ? '⚠️ Datos parciales' : 'Basado en fuentes disponibles'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Score Breakdown */}
                                                {contact.enrichmentData.commercialScoreBreakdown && (
                                                    <div className="mt-3 pt-3 border-t border-purple-50 space-y-1.5">
                                                        {Object.entries(contact.enrichmentData.commercialScoreBreakdown).map(([key, val]: [string, any]) => (
                                                            <div key={key} className="flex items-center gap-2">
                                                                <span className="text-[10px] text-slate-500 w-28 truncate capitalize">
                                                                    {key.replace(/([A-Z])/g, ' $1').trim()}
                                                                </span>
                                                                <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                                                    <div
                                                                        className="h-full rounded-full transition-all"
                                                                        style={{
                                                                            width: `${((val as number) / 20) * 100}%`,
                                                                            background: (val as number) >= 15 ? '#10b981' : (val as number) >= 10 ? '#eab308' : '#ef4444'
                                                                        }}
                                                                    />
                                                                </div>
                                                                <span className="text-[10px] text-slate-500 w-8 text-right">{val as number}/20</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Pain Points */}
                                            {contact.enrichmentData.painPoints?.length > 0 && (
                                                <ExpandableCard title="💢 Pain Points" defaultExpanded={true}>
                                                    <div className="space-y-2">
                                                        {contact.enrichmentData.painPoints.map((point: string, i: number) => (
                                                            <div key={i} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.05)' }}>
                                                                <span className="text-red-400 mt-0.5 shrink-0 text-xs">⚡</span>
                                                                <p className="text-xs text-slate-600 leading-relaxed">{point}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ExpandableCard>
                                            )}

                                            {/* Talking Points */}
                                            {contact.enrichmentData.talkingPoints?.length > 0 && (
                                                <ExpandableCard title="💬 Talking Points" defaultExpanded={true}>
                                                    <div className="space-y-2">
                                                        {contact.enrichmentData.talkingPoints.map((point: string, i: number) => (
                                                            <div key={i} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: 'rgba(59,130,246,0.05)' }}>
                                                                <span className="text-blue-400 mt-0.5 shrink-0 text-xs">💡</span>
                                                                <p className="text-xs text-slate-600 leading-relaxed">{point}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ExpandableCard>
                                            )}

                                            {/* Company Info */}
                                            {contact.enrichmentData.company && (
                                                <ExpandableCard title="🏢 Información de Empresa" defaultExpanded={true}>
                                                    <div className="space-y-2">
                                                        <p className="text-sm font-semibold text-slate-700">
                                                            {contact.enrichmentData.company.name}
                                                        </p>
                                                        {contact.enrichmentData.company.description && contact.enrichmentData.company.description !== 'No verificado' && (
                                                            <p className="text-xs text-slate-500 leading-relaxed">
                                                                {contact.enrichmentData.company.description}
                                                            </p>
                                                        )}
                                                        <div className="flex flex-wrap gap-2 mt-2">
                                                            {contact.enrichmentData.company.employeeCount && (
                                                                <span className="text-[10px] px-2 py-1 rounded-full bg-blue-50 text-blue-600">
                                                                    👥 {contact.enrichmentData.company.employeeCount} empleados
                                                                </span>
                                                            )}
                                                            {contact.enrichmentData.company.locationsCount && contact.enrichmentData.company.locationsCount !== 'No verificado' && (
                                                                <span className="text-[10px] px-2 py-1 rounded-full bg-green-50 text-green-600">
                                                                    🏪 {contact.enrichmentData.company.locationsCount} locales
                                                                </span>
                                                            )}
                                                            {contact.enrichmentData.company.sector && contact.enrichmentData.company.sector !== 'No verificado' && (
                                                                <span className="text-[10px] px-2 py-1 rounded-full bg-purple-50 text-purple-600">
                                                                    📂 {contact.enrichmentData.company.sector}
                                                                </span>
                                                            )}
                                                            {contact.enrichmentData.company.website && contact.enrichmentData.company.website !== 'No verificado' && (
                                                                <a
                                                                    href={contact.enrichmentData.company.website}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-[10px] px-2 py-1 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                                                                >
                                                                    🌐 Web
                                                                </a>
                                                            )}
                                                            {contact.enrichmentData.company.socialMedia?.instagram && contact.enrichmentData.company.socialMedia.instagram !== 'No verificado' && (
                                                                <span className="text-[10px] px-2 py-1 rounded-full bg-pink-50 text-pink-600">
                                                                    📸 {contact.enrichmentData.company.socialMedia.instagram}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </ExpandableCard>
                                            )}

                                            {/* Google Maps Data */}
                                            {contact.enrichmentData.googleMaps && (
                                                <ExpandableCard title="📍 Google Maps" defaultExpanded={false}>
                                                    <div className="space-y-2">
                                                        {contact.enrichmentData.googleMaps.rating && (
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-yellow-500">{'⭐'.repeat(Math.round(contact.enrichmentData.googleMaps.rating))}</span>
                                                                <span className="text-xs text-slate-600 font-medium">{contact.enrichmentData.googleMaps.rating}</span>
                                                                {contact.enrichmentData.googleMaps.reviewCount && (
                                                                    <span className="text-[10px] text-slate-400">({contact.enrichmentData.googleMaps.reviewCount} reviews)</span>
                                                                )}
                                                            </div>
                                                        )}
                                                        {contact.enrichmentData.googleMaps.address && (
                                                            <p className="text-xs text-slate-500">📍 {contact.enrichmentData.googleMaps.address}</p>
                                                        )}
                                                        {contact.enrichmentData.googleMaps.phone && (
                                                            <p className="text-xs text-slate-500">📞 {contact.enrichmentData.googleMaps.phone}</p>
                                                        )}
                                                        {contact.enrichmentData.googleMaps.category && (
                                                            <div className="flex flex-wrap gap-1">
                                                                {(Array.isArray(contact.enrichmentData.googleMaps.category)
                                                                    ? contact.enrichmentData.googleMaps.category
                                                                    : [contact.enrichmentData.googleMaps.category]
                                                                ).map((cat: string, i: number) => (
                                                                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-600">
                                                                        {cat}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </ExpandableCard>
                                            )}

                                            {/* Website & Social Links */}
                                            {contact.enrichmentData.companyWebsite?.socialLinks && (
                                                <ExpandableCard title="🔗 Redes Sociales" defaultExpanded={false}>
                                                    <div className="flex flex-wrap gap-2">
                                                        {Object.entries(contact.enrichmentData.companyWebsite.socialLinks).filter(([_, v]) => v).map(([platform, url]: [string, any]) => (
                                                            <a
                                                                key={platform}
                                                                href={url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-[10px] px-2.5 py-1 rounded-full font-medium hover:opacity-80 transition-opacity"
                                                                style={{
                                                                    background: platform === 'instagram' ? 'rgba(228,64,95,0.1)' :
                                                                        platform === 'facebook' ? 'rgba(66,103,178,0.1)' :
                                                                            platform === 'twitter' ? 'rgba(29,161,242,0.1)' :
                                                                                platform === 'tiktok' ? 'rgba(0,0,0,0.06)' :
                                                                                    platform === 'youtube' ? 'rgba(255,0,0,0.08)' :
                                                                                        platform === 'linkedin' ? 'rgba(0,119,181,0.1)' : 'rgba(100,100,100,0.08)',
                                                                    color: platform === 'instagram' ? '#e4405f' :
                                                                        platform === 'facebook' ? '#4267b2' :
                                                                            platform === 'twitter' ? '#1da1f2' :
                                                                                platform === 'tiktok' ? '#333' :
                                                                                    platform === 'youtube' ? '#ff0000' :
                                                                                        platform === 'linkedin' ? '#0077b5' : '#666',
                                                                }}
                                                            >
                                                                {platform.charAt(0).toUpperCase() + platform.slice(1)}
                                                            </a>
                                                        ))}
                                                    </div>
                                                </ExpandableCard>
                                            )}

                                            {/* Company News */}
                                            {contact.enrichmentData.companyNews?.length > 0 && (
                                                <ExpandableCard title="📰 Noticias" defaultExpanded={false}>
                                                    <div className="space-y-2">
                                                        {contact.enrichmentData.companyNews.slice(0, 5).map((news: any, i: number) => (
                                                            <div key={i} className="p-2.5 rounded-lg bg-white/40 border border-purple-50/50">
                                                                <div className="flex items-start gap-2">
                                                                    <Newspaper size={14} className="text-purple-400 mt-0.5 shrink-0" />
                                                                    <div>
                                                                        {news.url ? (
                                                                            <a href={news.url} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-700 font-medium hover:text-purple-600">
                                                                                {news.title}
                                                                            </a>
                                                                        ) : (
                                                                            <p className="text-xs text-slate-700 font-medium">{news.title}</p>
                                                                        )}
                                                                        {news.summary && (
                                                                            <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{news.summary}</p>
                                                                        )}
                                                                        <div className="flex items-center gap-2 mt-1">
                                                                            {news.source && <span className="text-[10px] text-slate-400 font-medium">{news.source}</span>}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ExpandableCard>
                                            )}

                                            {/* Person News */}
                                            {contact.enrichmentData.personNews?.length > 0 && (
                                                <ExpandableCard title="📰 Noticias de la Persona" defaultExpanded={false}>
                                                    <div className="space-y-2">
                                                        {contact.enrichmentData.personNews.slice(0, 5).map((news: any, i: number) => (
                                                            <div key={i} className="p-2.5 rounded-lg bg-white/40 border border-purple-50/50">
                                                                <div className="flex items-start gap-2">
                                                                    <Newspaper size={14} className="text-purple-400 mt-0.5 shrink-0" />
                                                                    <div>
                                                                        <p className="text-xs text-slate-700 font-medium">{news.title}</p>
                                                                        <div className="flex items-center gap-2 mt-1">
                                                                            {news.source && <span className="text-[10px] text-slate-400">{news.source}</span>}
                                                                            {news.date && <span className="text-[10px] text-slate-400">• {news.date}</span>}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ExpandableCard>
                                            )}

                                            {/* Key Insights */}
                                            {contact.enrichmentData.keyInsights?.length > 0 && (
                                                <ExpandableCard title="💡 Insights Clave" defaultExpanded={true}>
                                                    <div className="space-y-2">
                                                        {contact.enrichmentData.keyInsights.map((insight: any, i: number) => (
                                                            <div key={i} className="flex items-start gap-2">
                                                                <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${insight.confidence === 'high' ? 'bg-green-500' :
                                                                    insight.confidence === 'medium' ? 'bg-yellow-500' : 'bg-red-400'
                                                                    }`} />
                                                                <div className="flex-1">
                                                                    <p className="text-xs text-slate-600 leading-relaxed">{insight.text || insight}</p>
                                                                    {insight.source && insight.source !== 'No verificado' && (
                                                                        <p className="text-[10px] text-slate-400 mt-0.5">{insight.source}</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ExpandableCard>
                                            )}

                                            {/* Buying Signals */}
                                            {contact.enrichmentData.buyingSignals?.length > 0 && (
                                                <ExpandableCard title="🚦 Señales de Compra" defaultExpanded={true}>
                                                    <div className="space-y-2">
                                                        {contact.enrichmentData.buyingSignals.map((signal: any, i: number) => (
                                                            <div key={i} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: 'rgba(16,185,129,0.05)' }}>
                                                                <ShoppingCart size={12} className="text-emerald-500 mt-0.5 shrink-0" />
                                                                <div className="flex-1">
                                                                    <p className="text-xs text-slate-600 leading-relaxed">{signal.text || signal}</p>
                                                                    {signal.evidence && (
                                                                        <p className="text-[10px] text-slate-400 mt-0.5 italic">📋 {signal.evidence}</p>
                                                                    )}
                                                                    <div className="flex items-center gap-1.5 mt-1">
                                                                        {signal.source && signal.source !== 'No verificado' && (
                                                                            <span className="text-[10px] text-slate-400">{signal.source}</span>
                                                                        )}
                                                                        {signal.confidence && (
                                                                            <span className={`w-1.5 h-1.5 rounded-full ${signal.confidence === 'high' ? 'bg-green-500' :
                                                                                signal.confidence === 'medium' ? 'bg-yellow-500' : 'bg-red-400'
                                                                                }`} />
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </ExpandableCard>
                                            )}

                                            {/* Enriched Timestamp */}
                                            {contact.enrichedAt && (
                                                <p className="text-[10px] text-slate-400 text-right">
                                                    Enriquecido: {formatDate(contact.enrichedAt)}
                                                </p>
                                            )}
                                        </div>
                                    ) : !contact.enrichmentStatus && !enriching ? (
                                        <div className="text-center py-8">
                                            <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ background: 'rgba(124,58,237,0.08)' }}>
                                                <Sparkles size={24} className="text-purple-400" />
                                            </div>
                                            <p className="text-sm text-slate-500 mb-2">Sin datos de enriquecimiento</p>
                                            <p className="text-xs text-slate-400">Hacé click en "Enriquecer" para investigar este contacto</p>
                                        </div>
                                    ) : null}
                                </div>
                            )}

                            {/* ===== NOTES TAB ===== */}
                            {activeTab === 'notes' && (
                                <div className="p-6 space-y-4 animate-in fade-in duration-200">
                                    {/* Add Note */}
                                    <div className="rounded-xl bg-white/60 border border-purple-50 p-4">
                                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                            <Plus size={14} />
                                            Agregar Nota
                                        </h3>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={noteText}
                                                onChange={(e) => setNoteText(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote(); }}
                                                placeholder="Escribí una nota..."
                                                className="flex-1 text-sm px-3 py-2.5 rounded-lg border border-purple-100 focus:border-purple-300 focus:outline-none bg-white/70 transition-colors"
                                            />
                                            <button
                                                onClick={handleAddNote}
                                                disabled={!noteText.trim() || savingNote}
                                                className="px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50 flex items-center gap-1.5"
                                                style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)' }}
                                            >
                                                {savingNote ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                                                Agregar
                                            </button>
                                        </div>
                                    </div>

                                    {/* Notes List */}
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                            <StickyNote size={14} />
                                            Notas ({contact.notes?.length || 0})
                                        </h3>
                                        {(contact.notes || []).length === 0 ? (
                                            <div className="text-center py-8 text-slate-400">
                                                <StickyNote size={32} className="mx-auto mb-2 opacity-30" />
                                                <p className="text-sm">No hay notas aún</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {(contact.notes || []).slice().reverse().map((note: INote, i: number) => (
                                                    <div
                                                        key={note._id || i}
                                                        className="p-4 rounded-xl bg-white/60 border border-purple-50 hover:border-purple-100 transition-colors"
                                                    >
                                                        <p className="text-sm text-slate-700 leading-relaxed">{note.text}</p>
                                                        <div className="flex items-center gap-2 mt-2">
                                                            <Clock size={12} className="text-slate-400" />
                                                            <p className="text-[10px] text-slate-400">{formatDate(note.createdAt)}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* ===== HISTORY TAB ===== */}
                            {activeTab === 'history' && (
                                <div className="p-6 animate-in fade-in duration-200">
                                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <History size={14} />
                                        Timeline de Pipeline
                                    </h3>

                                    <div className="relative">
                                        {/* Timeline Line */}
                                        <div
                                            className="absolute left-4 top-2 bottom-2 w-0.5"
                                            style={{ background: 'linear-gradient(to bottom, #7c3aed, #a855f7)' }}
                                        />

                                        <div className="space-y-4">
                                            {PIPELINE_STEPS.map((step, i) => {
                                                const date = (contact as any)?.[step.dateField];
                                                const isCurrent = contact.status === step.key;
                                                const isPast = PIPELINE_STEPS.findIndex(s => s.key === contact.status) > i;

                                                return (
                                                    <div key={step.key} className="relative flex items-start gap-4 pl-1">
                                                        {/* Timeline Dot */}
                                                        <div
                                                            className="relative z-10 w-7 h-7 rounded-full flex items-center justify-center border-2 shrink-0"
                                                            style={{
                                                                background: isCurrent ? step.color : isPast ? step.color : 'white',
                                                                borderColor: step.color,
                                                            }}
                                                        >
                                                            {isCurrent ? (
                                                                <div className="w-2 h-2 rounded-full bg-white" />
                                                            ) : isPast ? (
                                                                <CheckCircle2 size={12} className="text-white" />
                                                            ) : (
                                                                <div className="w-2 h-2 rounded-full" style={{ background: step.color }} />
                                                            )}
                                                        </div>

                                                        {/* Content */}
                                                        <div className="flex-1 pt-0.5">
                                                            <div className="flex items-center justify-between">
                                                                <p className={`text-sm font-medium ${isCurrent ? 'text-slate-800' : isPast ? 'text-slate-600' : 'text-slate-400'}`}>
                                                                    {step.label}
                                                                </p>
                                                                {isCurrent && (
                                                                    <span className="text-[10px] px-2 py-0.5 rounded-full text-white" style={{ background: step.color }}>
                                                                        Actual
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-slate-400 mt-0.5">
                                                                {date ? formatDate(date) : 'Pendiente'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Sticky Footer ────────────────────────────────── */}
                        <div className="shrink-0 px-6 py-4 border-t border-purple-100/50 bg-white/50 backdrop-blur-sm">
                            <div className="flex gap-3">
                                <a
                                    href={contact.profileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
                                    style={{
                                        background: 'linear-gradient(135deg, #0077B5, #0a66c2)',
                                        color: 'white',
                                    }}
                                >
                                    <ExternalLink size={16} />
                                    Ver en LinkedIn
                                </a>
                                {whatsappNumber && (
                                    <a
                                        href={`https://wa.me/${whatsappNumber}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
                                        style={{
                                            background: 'linear-gradient(135deg, #25D366, #128C7E)',
                                            color: 'white',
                                        }}
                                    >
                                        <Phone size={16} />
                                        WhatsApp
                                    </a>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Animations */}
            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
                .animate-in { animation-fill-mode: both; }
                .fade-in { animation: fadeIn 0.2s ease; }
                .slide-in-from-top-2 { animation: slideInTop 0.2s ease; }
                @keyframes slideInTop { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                .scrollbar-hide::-webkit-scrollbar { display: none; }
                .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
        </div>
    );
}
