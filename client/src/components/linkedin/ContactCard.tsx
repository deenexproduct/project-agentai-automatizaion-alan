import { useState } from 'react';
import { Building2, MapPin, CheckCircle, Loader2, X, Microscope } from 'lucide-react';
import type { ContactCardData, ContactStatus } from '../../services/linkedin-crm.service';
import { enrichContact } from '../../services/linkedin-crm.service';

// ── Status Colors & Glows ────────────────────────────────────

const STATUS_THEME: Record<ContactStatus, { color: string, glow: string }> = {
    visitando: { color: '#06b6d4', glow: 'rgba(6,182,212,0.4)' }, // Cyan
    conectando: { color: '#eab308', glow: 'rgba(234,179,8,0.4)' }, // Yellow
    interactuando: { color: '#f97316', glow: 'rgba(249,115,22,0.4)' }, // Orange
    enriqueciendo: { color: '#a855f7', glow: 'rgba(168,85,247,0.4)' }, // Purple
    esperando_aceptacion: { color: '#f59e0b', glow: 'rgba(245,158,11,0.4)' }, // Amber
    aceptado: { color: '#10b981', glow: 'rgba(16,185,129,0.4)' }, // Emerald
    mensaje_enviado: { color: '#8b5cf6', glow: 'rgba(139,92,246,0.4)' }, // Violet
};

function formatRelativeDate(dateStr: string | undefined): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays}d`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)}sem`;
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function getRelevantDate(contact: ContactCardData): string {
    switch (contact.status) {
        case 'mensaje_enviado': return formatRelativeDate(contact.messageSentAt);
        case 'aceptado': return formatRelativeDate(contact.acceptedAt);
        case 'enriqueciendo': return formatRelativeDate(contact.enrichedAt);
        case 'interactuando': return formatRelativeDate(contact.interactedAt);
        default: return formatRelativeDate(contact.sentAt);
    }
}

// ── Component ────────────────────────────────────────────────

interface Props {
    contact: ContactCardData;
    onClick: () => void;
    provided?: any;
    onEnriched?: () => void;
}

export default function ContactCard({ contact, onClick, provided, onEnriched }: Props) {
    const [hovered, setHovered] = useState(false);
    const [enriching, setEnriching] = useState(false);

    const theme = STATUS_THEME[contact.status];
    const date = getRelevantDate(contact);

    const handleEnrich = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (enriching) return;
        setEnriching(true);
        try {
            await enrichContact(contact._id);
            onEnriched?.();
        } catch (err: any) {
            console.error('Enrichment error:', err.message);
        } finally {
            setEnriching(false);
        }
    };

    return (
        <div
            ref={provided?.innerRef}
            {...(provided?.draggableProps || {})}
            {...(provided?.dragHandleProps || {})}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="relative cursor-pointer select-none group"
            style={{
                background: 'rgba(255, 255, 255, 0.75)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderRadius: '16px',
                border: '1px solid rgba(255, 255, 255, 0.8)',
                padding: '12px 14px',
                marginBottom: 12,
                transition: 'all 0.3s cubic-bezier(0.25, 1, 0.5, 1)',
                transform: hovered ? 'translateY(-4px) scale(1.01)' : 'translateY(0) scale(1)',
                boxShadow: hovered
                    ? `0 12px 24px -8px ${theme.glow}, 0 4px 12px rgba(0,0,0,0.03)`
                    : '0 2px 8px rgba(0,0,0,0.04)',
            }}
        >
            {/* Elegant side indicator line */}
            <div
                className="absolute left-0 top-[15%] bottom-[15%] w-[4px] rounded-r-full transition-all duration-300"
                style={{
                    background: theme.color,
                    height: hovered ? '70%' : '40%',
                    opacity: hovered ? 1 : 0.7
                }}
            />

            <div className="flex items-start gap-3 pl-2">
                {/* Photo with subtle glowing border on hover */}
                <div
                    className="shrink-0 flex items-center justify-center rounded-[14px] overflow-hidden transition-all duration-300"
                    style={{
                        width: 44,
                        height: 44,
                        background: `linear-gradient(135deg, ${theme.color}DD, ${theme.color}88)`,
                        boxShadow: hovered ? `0 0 0 2px rgba(255,255,255,0.8), 0 0 0 4px ${theme.glow}` : '0 0 0 1px rgba(255,255,255,0.5)',
                    }}
                >
                    {contact.profilePhotoUrl ? (
                        <img
                            src={contact.profilePhotoUrl}
                            alt={contact.fullName}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                (e.target as HTMLImageElement).parentElement!.innerHTML =
                                    `<span style="color:white;font-weight:bold;font-size:15px;text-shadow:0 1px 2px rgba(0,0,0,0.2)">${contact.fullName?.charAt(0) || '?'}</span>`;
                            }}
                        />
                    ) : (
                        <span className="text-white font-bold text-[15px]" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
                            {contact.fullName?.charAt(0) || '?'}
                        </span>
                    )}
                </div>

                {/* Info Text */}
                <div className="flex-1 min-w-0 flex flex-col justify-center min-h-[44px]">
                    <p className="font-bold text-[13.5px] text-slate-800 truncate leading-tight group-hover:text-slate-900 transition-colors">
                        {contact.fullName}
                    </p>

                    {contact.currentPosition && (
                        <p className="text-[11px] text-slate-500 truncate mt-0.5 font-medium leading-tight">
                            {contact.currentPosition}
                        </p>
                    )}

                    {contact.currentCompany && (
                        <p className="text-[11px] text-slate-400 truncate flex items-center gap-1 mt-0.5" style={{ opacity: 0.8 }}>
                            <Building2 size={10} className="shrink-0" />
                            {contact.currentCompany}
                        </p>
                    )}

                    {/* Fallback pattern */}
                    {!contact.currentPosition && !contact.currentCompany && contact.headline && (
                        <p className="text-[11px] text-slate-500 truncate mt-0.5 leading-tight">
                            {contact.headline}
                        </p>
                    )}
                </div>

                {/* Quick Action: Enrich */}
                {contact.enrichmentStatus !== 'completed' && contact.enrichmentStatus !== 'enriching' && (
                    <button
                        onClick={handleEnrich}
                        disabled={enriching}
                        title="Extraer Email/Datos"
                        className="shrink-0 flex items-center justify-center transition-all duration-300 backdrop-blur-md"
                        style={{
                            width: 28,
                            height: 28,
                            borderRadius: '10px',
                            border: '1px solid rgba(255,255,255,0.5)',
                            background: enriching ? 'rgba(241, 245, 249, 0.8)' : 'rgba(255, 255, 255, 0.9)',
                            cursor: enriching ? 'wait' : 'pointer',
                            opacity: hovered ? 1 : 0,
                            transform: hovered ? 'scale(1)' : 'scale(0.8)',
                            boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                        }}
                    >
                        {enriching ? (
                            <Loader2 size={14} className="animate-spin text-slate-400" />
                        ) : (
                            <Microscope size={14} color={theme.color} className="group-hover/btn:scale-110 transition-transform" />
                        )}
                    </button>
                )}
            </div>

            {/* Footer row: Badges and Date */}
            <div className="flex items-center justify-between mt-3 pl-[54px]">
                <div className="flex items-center gap-1.5 flex-wrap">

                    {contact.location && (
                        <span className="text-[10px] text-slate-400 truncate max-w-[80px] flex items-center gap-0.5 font-medium">
                            <MapPin size={10} className="shrink-0" />
                            {contact.location.split(',')[0]}
                        </span>
                    )}

                    {/* Premium Enrichment Badges */}
                    {contact.enrichmentStatus === 'completed' && (
                        <span
                            className="text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1 uppercase tracking-wider shadow-sm"
                            style={{
                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                color: 'white',
                                fontWeight: 700,
                            }}
                        >
                            <CheckCircle size={9} strokeWidth={3} />
                            Enriquecido
                        </span>
                    )}
                    {contact.enrichmentStatus === 'enriching' && (
                        <span
                            className="text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1 uppercase tracking-wider shadow-sm"
                            style={{
                                background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
                                color: 'white',
                                fontWeight: 700,
                            }}
                        >
                            <Loader2 size={9} strokeWidth={3} className="animate-spin" />
                            Scraping
                        </span>
                    )}
                    {contact.enrichmentStatus === 'failed' && (
                        <span
                            className="text-[9px] px-2 py-0.5 rounded-full flex items-center gap-1 uppercase tracking-wider shadow-sm"
                            style={{
                                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                color: 'white',
                                fontWeight: 700,
                            }}
                        >
                            <X size={9} strokeWidth={3} />
                            Fallo
                        </span>
                    )}
                </div>

                {date && (
                    <span
                        className="text-[10.5px] font-bold ml-auto shrink-0 transition-colors"
                        style={{ color: hovered ? theme.color : '#94a3b8' }}
                    >
                        {date}
                    </span>
                )}
            </div>
        </div>
    );
}
