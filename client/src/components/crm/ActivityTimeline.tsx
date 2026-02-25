import { ActivityData } from '../../services/crm.service';
import { Phone, MessageCircle, Linkedin, Mail, Users, FileText, CheckCircle2, Activity, Briefcase, Building2, CheckSquare } from 'lucide-react';

interface ActivityTimelineProps {
    activities: (ActivityData & { source?: string })[];
    onItemClick?: (item: ActivityData & { source?: string }) => void;
}

export default function ActivityTimeline({ activities, onItemClick }: ActivityTimelineProps) {
    if (activities.length === 0) {
        return <div className="text-sm text-slate-500 text-center py-4">No hay actividad reciente.</div>;
    }

    return (
        <div className="relative border-l-2 border-slate-200 ml-4 py-2 space-y-6">
            {activities.map((activity, index) => {
                const isLast = index === activities.length - 1;
                return (
                    <div key={activity._id} className="relative pl-6">
                        {/* Connecting Line Adjustment for last item */}
                        {isLast && (
                            <div className="absolute top-6 left-[-2px] bottom-[-24px] w-1 bg-white" />
                        )}

                        {/* Icon Node */}
                        <div className={`absolute -left-[17px] top-0.5 w-8 h-8 rounded-full flex items-center justify-center shadow-sm border-2 border-white ${getIconConfig(activity.type).bg}`}>
                            {getIconConfig(activity.type).icon}
                        </div>

                        {/* Content */}
                        <div
                            onClick={() => onItemClick && onItemClick(activity)}
                            className={`bg-slate-50 border border-slate-100 rounded-2xl p-3 shadow-sm transition-shadow ${onItemClick ? 'cursor-pointer hover:shadow-md hover:border-violet-200' : ''}`}
                        >
                            <div className="flex items-start justify-between gap-4 mb-2">
                                <span className={`text-[11px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${getIconConfig(activity.type).badgeInfo}`}>
                                    {getIconConfig(activity.type).label}
                                </span>
                                <div className="flex items-center gap-2">
                                    {(() => {
                                        const responsible = activity.createdBy || (activity as any).assignedTo;
                                        if (responsible) {
                                            return (
                                                <div className="flex flex-row-reverse items-center gap-1.5" title={`Responsable: ${responsible.name || 'Usuario'}`}>
                                                    <time className="text-[11px] font-semibold text-slate-400">
                                                        {formatTimeAgo(activity.createdAt)}
                                                    </time>
                                                    <div className="flex items-center gap-1.5 bg-white border border-slate-200/60 px-1.5 py-0.5 rounded-full shadow-sm">
                                                        <span className="text-[10px] font-bold text-slate-600 truncate max-w-[90px] pl-1 hidden sm:block">{responsible.name?.split(' ')[0] || 'User'}</span>
                                                        <div className="w-4 h-4 rounded-full bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center border border-slate-200/50">
                                                            {responsible.profilePhotoUrl ? (
                                                                <img src={responsible.profilePhotoUrl} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span className="text-[9px] font-bold text-slate-500">{responsible.name?.charAt(0).toUpperCase() || 'U'}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return (
                                            <time className="text-[11px] font-semibold text-slate-400">
                                                {formatTimeAgo(activity.createdAt)}
                                            </time>
                                        );
                                    })()}
                                </div>
                            </div>

                            <p className="text-sm text-slate-700 font-medium leading-relaxed mb-1.5">
                                {activity.description}
                            </p>

                            {/* Context Links (Contact/Deal/Company) */}
                            <div className="flex flex-wrap gap-2 mt-2">
                                {activity.contact && (
                                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-full">
                                        <div className="w-4 h-4 rounded-full bg-slate-200 overflow-hidden shrink-0">
                                            {activity.contact.profilePhotoUrl ? (
                                                <img src={activity.contact.profilePhotoUrl} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-violet-100 text-violet-600 font-bold text-[8px]">
                                                    {activity.contact.fullName.charAt(0)}
                                                </div>
                                            )}
                                        </div>
                                        {activity.contact.fullName}
                                    </span>
                                )}
                                {activity.deal && (
                                    <span className="inline-flex items-center text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
                                        Deal: {activity.deal.title}
                                    </span>
                                )}
                                {activity.company && !activity.deal && (
                                    <span className="inline-flex items-center text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-full">
                                        Empresa: {activity.company.name}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ── Helpers ──────────────────────────────────────────────────────

function getIconConfig(type: string) {
    switch (type) {
        case 'call': return {
            icon: <Phone size={14} className="text-white" />,
            bg: 'bg-emerald-500',
            badgeInfo: 'text-emerald-700 bg-emerald-100',
            label: 'Llamada'
        };
        case 'whatsapp': return {
            icon: <MessageCircle size={14} className="text-white" />,
            bg: 'bg-green-500',
            badgeInfo: 'text-green-700 bg-green-100',
            label: 'WhatsApp'
        };
        case 'linkedin_message': return {
            icon: <Linkedin size={14} className="text-white" />,
            bg: 'bg-blue-600',
            badgeInfo: 'text-blue-700 bg-blue-100',
            label: 'LinkedIn'
        };
        case 'email': return {
            icon: <Mail size={14} className="text-white" />,
            bg: 'bg-amber-500',
            badgeInfo: 'text-amber-700 bg-amber-100',
            label: 'Email'
        };
        case 'meeting': return {
            icon: <Users size={14} className="text-white" />,
            bg: 'bg-indigo-500',
            badgeInfo: 'text-indigo-700 bg-indigo-100',
            label: 'Reunión'
        };
        case 'note': return {
            icon: <FileText size={14} className="text-slate-600" />,
            bg: 'bg-slate-200',
            badgeInfo: 'text-slate-600 bg-slate-200',
            label: 'Nota'
        };
        case 'task_completed': return {
            icon: <CheckCircle2 size={14} className="text-white" />,
            bg: 'bg-violet-500',
            badgeInfo: 'text-violet-700 bg-violet-100',
            label: 'Tarea Terminada'
        };
        case 'deal_created': return {
            icon: <Briefcase size={14} className="text-white" />,
            bg: 'bg-emerald-500',
            badgeInfo: 'text-emerald-700 bg-emerald-100',
            label: 'Nuevo Deal'
        };
        case 'company_created': return {
            icon: <Building2 size={14} className="text-white" />,
            bg: 'bg-blue-600',
            badgeInfo: 'text-blue-700 bg-blue-100',
            label: 'Nueva Empresa'
        };
        case 'task_created': return {
            icon: <CheckSquare size={14} className="text-white" />,
            bg: 'bg-amber-500',
            badgeInfo: 'text-amber-700 bg-amber-100',
            label: 'Nueva Tarea'
        };
        default: return {
            icon: <Activity size={14} className="text-slate-600" />,
            bg: 'bg-slate-300',
            badgeInfo: 'text-slate-700 bg-slate-200',
            label: 'Actividad'
        };
    }
}

function formatTimeAgo(dateInput: string | Date): string {
    const date = new Date(dateInput);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " años";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " meses";
    interval = seconds / 86400;
    if (interval >= 1) {
        if (Math.floor(interval) === 1) return "Ayer";
        return Math.floor(interval) + " días";
    }
    interval = seconds / 3600;
    if (interval >= 1) return Math.floor(interval) + " h";
    interval = seconds / 60;
    if (interval >= 1) return Math.floor(interval) + " min";
    return "Ahora";
}
