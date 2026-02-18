import { useState, useEffect, useCallback } from 'react';
import {
  Eye,
  Link2,
  Hand,
  Microscope,
  Clock,
  CheckCircle,
  Send,
  Sparkles,
  AlertCircle,
  Loader2,
  Building2,
  User,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────

export type ContactStatus =
  | 'visitando'
  | 'conectando'
  | 'interactuando'
  | 'enriqueciendo'
  | 'esperando_aceptacion'
  | 'aceptado'
  | 'mensaje_enviado';

export type EnrichmentStatus = 'pending' | 'enriching' | 'completed' | 'failed';

export interface PipelineContact {
  _id: string;
  fullName: string;
  currentCompany?: string;
  currentPosition?: string;
  profilePhotoUrl?: string;
  status: ContactStatus;
  enrichmentStatus?: EnrichmentStatus;
  sentAt?: string;
  interactedAt?: string;
  enrichedAt?: string;
  acceptedAt?: string;
  messageSentAt?: string;
}

export interface StatusCounts {
  visitando: number;
  conectando: number;
  interactuando: number;
  enriqueciendo: number;
  esperando_aceptacion: number;
  aceptado: number;
  mensaje_enviado: number;
}

// ── Column Configuration ──────────────────────────────────────

interface ColumnConfig {
  id: ContactStatus;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}

const COLUMNS: ColumnConfig[] = [
  {
    id: 'visitando',
    label: 'Visitando',
    icon: <Eye className="w-4 h-4" />,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
    borderColor: 'border-cyan-200',
  },
  {
    id: 'conectando',
    label: 'Conectando',
    icon: <Link2 className="w-4 h-4" />,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
  },
  {
    id: 'interactuando',
    label: 'Interactuando',
    icon: <Hand className="w-4 h-4" />,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
  },
  {
    id: 'enriqueciendo',
    label: 'Enriqueciendo',
    icon: <Microscope className="w-4 h-4" />,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
  },
  {
    id: 'esperando_aceptacion',
    label: 'Esperando Aceptación',
    icon: <Clock className="w-4 h-4" />,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
  {
    id: 'aceptado',
    label: 'Aceptado',
    icon: <CheckCircle className="w-4 h-4" />,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
  },
  {
    id: 'mensaje_enviado',
    label: 'Mensaje Enviado',
    icon: <Send className="w-4 h-4" />,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    borderColor: 'border-violet-200',
  },
];

// ── Helper Functions ──────────────────────────────────────────

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

function getRelevantDate(contact: PipelineContact): string {
  switch (contact.status) {
    case 'mensaje_enviado':
      return formatRelativeDate(contact.messageSentAt);
    case 'aceptado':
      return formatRelativeDate(contact.acceptedAt);
    case 'enriqueciendo':
      return formatRelativeDate(contact.enrichedAt);
    case 'interactuando':
      return formatRelativeDate(contact.interactedAt);
    default:
      return formatRelativeDate(contact.sentAt);
  }
}

// ── Sub-components ────────────────────────────────────────────

interface PipelineCardProps {
  contact: PipelineContact;
  onClick?: (contact: PipelineContact) => void;
  columnColor: string;
}

function PipelineCard({ contact, onClick, columnColor }: PipelineCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const date = getRelevantDate(contact);

  const getEnrichmentBadge = () => {
    switch (contact.enrichmentStatus) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
            <Sparkles className="w-3 h-3" />
            Enriquecido
          </span>
        );
      case 'enriching':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
            <Loader2 className="w-3 h-3 animate-spin" />
            Enriqueciendo
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
            <AlertCircle className="w-3 h-3" />
            Error
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div
      onClick={() => onClick?.(contact)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative bg-white rounded-lg border border-slate-200 p-3 cursor-pointer transition-all duration-200"
      style={{
        borderLeftWidth: '3px',
        borderLeftColor: columnColor,
        transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: isHovered
          ? '0 4px 12px rgba(0, 0, 0, 0.1)'
          : '0 1px 3px rgba(0, 0, 0, 0.05)',
      }}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div
          className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center overflow-hidden"
          style={{
            background: contact.profilePhotoUrl
              ? 'transparent'
              : 'linear-gradient(135deg, #7c3aed, #a855f7)',
          }}
        >
          {contact.profilePhotoUrl ? (
            <img
              src={contact.profilePhotoUrl}
              alt={contact.fullName}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                target.parentElement!.innerHTML = `<span class="text-white font-bold text-sm">${contact.fullName.charAt(0)}</span>`;
              }}
            />
          ) : (
            <User className="w-5 h-5 text-white" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-sm text-slate-900 truncate">
            {contact.fullName}
          </h4>
          
          {contact.currentCompany && (
            <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
              <Building2 className="w-3 h-3 shrink-0" />
              <span className="truncate">{contact.currentCompany}</span>
            </div>
          )}
          
          {contact.currentPosition && (
            <p className="text-xs text-slate-400 truncate mt-0.5">
              {contact.currentPosition}
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-2">
          {getEnrichmentBadge()}
        </div>
        {date && (
          <span className="text-[10px] text-slate-400">{date}</span>
        )}
      </div>
    </div>
  );
}

interface PipelineColumnProps {
  config: ColumnConfig;
  contacts: PipelineContact[];
  count: number;
  onContactClick?: (contact: PipelineContact) => void;
  onScrollEnd?: (status: ContactStatus) => void;
  loading?: boolean;
}

function PipelineColumn({
  config,
  contacts,
  count,
  onContactClick,
  onScrollEnd,
  loading,
}: PipelineColumnProps) {
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      onScrollEnd?.(config.id);
    }
  };

  // Extract color hex for border
  const colorMap: Record<ContactStatus, string> = {
    visitando: '#0891b2',
    conectando: '#ca8a04',
    interactuando: '#ea580c',
    enriqueciendo: '#9333ea',
    esperando_aceptacion: '#d97706',
    aceptado: '#059669',
    mensaje_enviado: '#7c3aed',
  };

  return (
    <div className="flex flex-col min-w-[280px] max-w-[320px] h-full rounded-xl border border-slate-200 bg-slate-50/50">
      {/* Column Header */}
      <div
        className={`flex items-center justify-between px-4 py-3 rounded-t-xl border-b ${config.bgColor} ${config.borderColor}`}
      >
        <div className="flex items-center gap-2">
          <span className={config.color}>{config.icon}</span>
          <h3 className="font-semibold text-sm text-slate-700">
            {config.label}
          </h3>
        </div>
        <span
          className={`text-xs font-bold px-2.5 py-1 rounded-full ${config.bgColor} ${config.color}`}
        >
          {count}
        </span>
      </div>

      {/* Cards Container */}
      <div
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px]"
        style={{ maxHeight: 'calc(100vh - 250px)' }}
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mb-2" />
            <span className="text-xs">Cargando...</span>
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-300">
            <span className={config.color}>{config.icon}</span>
            <p className="text-xs mt-2">Sin contactos</p>
          </div>
        ) : (
          contacts.map((contact) => (
            <PipelineCard
              key={contact._id}
              contact={contact}
              onClick={onContactClick}
              columnColor={colorMap[config.id]}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────

export interface PipelineKanbanProps {
  /** Contacts organized by status */
  contactsByStatus?: Record<ContactStatus, PipelineContact[]>;
  /** Counts per status */
  counts?: StatusCounts;
  /** Loading state */
  loading?: boolean;
  /** Callback when a contact card is clicked */
  onContactClick?: (contact: PipelineContact) => void;
  /** Callback when scrolling to the end of a column (for infinite scroll) */
  onScrollEnd?: (status: ContactStatus) => void;
  /** Optional search query */
  searchQuery?: string;
  /** Callback when search changes */
  onSearchChange?: (query: string) => void;
}

export function PipelineKanban({
  contactsByStatus,
  counts,
  loading = false,
  onContactClick,
  onScrollEnd,
  searchQuery = '',
  onSearchChange,
}: PipelineKanbanProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);

  // Initialize default data if not provided
  const defaultContacts: Record<ContactStatus, PipelineContact[]> = {
    visitando: [],
    conectando: [],
    interactuando: [],
    enriqueciendo: [],
    esperando_aceptacion: [],
    aceptado: [],
    mensaje_enviado: [],
  };

  const defaultCounts: StatusCounts = {
    visitando: 0,
    conectando: 0,
    interactuando: 0,
    enriqueciendo: 0,
    esperando_aceptacion: 0,
    aceptado: 0,
    mensaje_enviado: 0,
  };

  const contacts = contactsByStatus ?? defaultContacts;
  const statusCounts = counts ?? defaultCounts;

  const handleSearchChange = useCallback(
    (value: string) => {
      setLocalSearch(value);
      onSearchChange?.(value);
    },
    [onSearchChange]
  );

  const totalContacts = Object.values(statusCounts).reduce(
    (acc, count) => acc + count,
    0
  );

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-slate-800">Pipeline CRM</h2>
          <span className="text-xs font-medium px-3 py-1 rounded-full bg-purple-100 text-purple-700">
            {totalContacts} contactos
          </span>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={localSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar contacto..."
            className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-4 h-full min-w-max">
          {COLUMNS.map((column) => (
            <PipelineColumn
              key={column.id}
              config={column}
              contacts={contacts[column.id]}
              count={statusCounts[column.id]}
              onContactClick={onContactClick}
              onScrollEnd={onScrollEnd}
              loading={loading}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default PipelineKanban;
