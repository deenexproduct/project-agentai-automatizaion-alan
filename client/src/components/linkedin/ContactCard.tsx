import { useState } from 'react';
import type { ContactCardData, ContactStatus } from '../../services/linkedin-crm.service';

// ── Status Colors ────────────────────────────────────────────

const STATUS_COLORS: Record<ContactStatus, string> = {
    visitando: '#06b6d4',
    conectando: '#eab308',
    conectado: '#22c55e',
    interactuando: '#f97316',
    esperando_aceptacion: '#f59e0b',
    aceptado: '#10b981',
    listo_para_mensaje: '#06b6d4',
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
        case 'listo_para_mensaje': return formatRelativeDate(contact.readyForMessageAt);
        case 'aceptado': return formatRelativeDate(contact.acceptedAt);
        default: return formatRelativeDate(contact.sentAt);
    }
}

// ── Component ────────────────────────────────────────────────

interface Props {
    contact: ContactCardData;
    onClick: () => void;
    provided?: any;
}

export default function ContactCard({ contact, onClick, provided }: Props) {
    const [hovered, setHovered] = useState(false);
    const color = STATUS_COLORS[contact.status];
    const date = getRelevantDate(contact);

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
                        <p className="text-xs text-slate-400 truncate">
                            🏢 {contact.currentCompany}
                        </p>
                    )}
                </div>
            </div>

            {/* Footer row */}
            <div className="flex items-center justify-between mt-2 pl-[52px]">
                {contact.location && (
                    <span className="text-[10px] text-slate-400 truncate max-w-[60%]">
                        📍 {contact.location}
                    </span>
                )}
                {date && (
                    <span className="text-[10px] text-slate-400 ml-auto">
                        {date}
                    </span>
                )}
            </div>
        </div>
    );
}
