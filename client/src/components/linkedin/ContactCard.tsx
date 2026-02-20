import { useState } from 'react';
import { Building2, MapPin, CheckCircle, Loader2, X, Microscope } from 'lucide-react';
import type { ContactCardData, ContactStatus } from '../../services/linkedin-crm.service';
import { enrichContact } from '../../services/linkedin-crm.service';

// ── Status Colors ────────────────────────────────────────────

const STATUS_COLORS: Record<ContactStatus, string> = {
    visitando: '#06b6d4',
    conectando: '#eab308',
    interactuando: '#f97316',
    enriqueciendo: '#a855f7',
    esperando_aceptacion: '#f59e0b',
    aceptado: '#10b981',
    mensaje_enviado: '#8b5cf6',
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
    const color = STATUS_COLORS[contact.status];
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
            className="relative cursor-pointer select-none"
            style={{
                background: 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(10px)',
                borderRadius: 10,
                borderLeft: `3px solid ${color}`,
                padding: '10px 12px',
                marginBottom: 8,
                transition: 'all 0.2s ease',
                transform: hovered ? 'scale(1.02)' : 'scale(1)',
                boxShadow: hovered
                    ? '0 4px 20px rgba(124, 58, 237, 0.15)'
                    : '0 1px 4px rgba(0,0,0,0.06)',
            }}
        >
            <div className="flex items-start gap-3">
                {/* Photo */}
                <div
                    className="shrink-0 flex items-center justify-center rounded-full overflow-hidden"
                    style={{
                        width: 40,
                        height: 40,
                        background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
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
                                    `<span style="color:white;font-weight:bold;font-size:14px">${contact.fullName?.charAt(0) || '?'}</span>`;
                            }}
                        />
                    ) : (
                        <span className="text-white font-bold text-sm">
                            {contact.fullName?.charAt(0) || '?'}
                        </span>
                    )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-800 truncate leading-tight">
                        {contact.fullName}
                    </p>
                    {contact.currentPosition && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                            {contact.currentPosition}
                        </p>
                    )}
                    {contact.currentCompany && (
                        <p className="text-xs text-slate-400 truncate flex items-center gap-1">
                            <Building2 size={10} />
                            {contact.currentCompany}
                        </p>
                    )}
                    {/* Fallback: show headline if neither position nor company */}
                    {!contact.currentPosition && !contact.currentCompany && contact.headline && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                            {contact.headline}
                        </p>
                    )}
                </div>

                {/* Enrich button */}
                {contact.enrichmentStatus !== 'completed' && contact.enrichmentStatus !== 'enriching' && (
                    <button
                        onClick={handleEnrich}
                        disabled={enriching}
                        title="Enriquecer contacto"
                        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{
                            width: 26,
                            height: 26,
                            borderRadius: 6,
                            border: 'none',
                            background: enriching ? '#e2e8f0' : 'rgba(124, 58, 237, 0.1)',
                            cursor: enriching ? 'wait' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 13,
                            opacity: hovered ? 1 : 0,
                            transition: 'opacity 0.2s',
                        }}
                    >
                        {enriching ? <Loader2 size={14} className="animate-spin text-slate-500" /> : <Microscope size={14} color="#7c3aed" />}
                    </button>
                )}
            </div>

            {/* Footer row */}
            <div className="flex items-center justify-between mt-2 pl-[52px]">
                <div className="flex items-center gap-1.5">
                    {contact.location && (
                        <span className="text-[10px] text-slate-400 truncate max-w-[60%] flex items-center gap-0.5">
                            <MapPin size={10} />
                            {contact.location}
                        </span>
                    )}
                    {/* Enrichment badge */}
                    {contact.enrichmentStatus === 'completed' && (
                        <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1"
                            style={{
                                background: 'rgba(16, 185, 129, 0.1)',
                                color: '#10b981',
                                fontWeight: 600,
                            }}
                        >
                            <CheckCircle size={10} />
                            Enriquecido
                        </span>
                    )}
                    {contact.enrichmentStatus === 'enriching' && (
                        <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1"
                            style={{
                                background: 'rgba(234, 179, 8, 0.1)',
                                color: '#eab308',
                                fontWeight: 600,
                            }}
                        >
                            <Loader2 size={10} className="animate-spin" />
                            Enriqueciendo...
                        </span>
                    )}
                    {contact.enrichmentStatus === 'failed' && (
                        <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1"
                            style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                color: '#ef4444',
                                fontWeight: 600,
                            }}
                        >
                            <X size={10} />
                            Error
                        </span>
                    )}
                </div>
                {date && (
                    <span className="text-[10px] text-slate-400 ml-auto">
                        {date}
                    </span>
                )}
            </div>
        </div>
    );
}
