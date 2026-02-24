import { X, Calendar as CalendarIcon, MapPin, Video, User, Plus } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { EventData } from '../../services/crm.service';
import { parseSafeDate } from '../../utils/date';

interface DailyEventsDrawerProps {
    open: boolean;
    date: Date | null;
    events: EventData[];
    onClose: () => void;
    onEditEvent: (event: EventData) => void;
    onNewEvent: (date: Date) => void;
}

export default function DailyEventsDrawer({ open, date, events, onClose, onEditEvent, onNewEvent }: DailyEventsDrawerProps) {
    if (!open || !date) return null;

    // Filter events for the selected date and sort them chronologically
    const dayEvents = events
        .filter(event => format(parseSafeDate(event.date), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd'))
        .sort((a, b) => {
            const timeA = a.startTime || '00:00';
            const timeB = b.startTime || '00:00';
            return timeA.localeCompare(timeB);
        });

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

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
                className="h-full overflow-y-auto w-[400px] max-w-[100vw] bg-white/90 backdrop-blur-2xl border-l border-white/60 flex flex-col shadow-[-20px_0_40px_rgba(30,27,75,0.1)] relative"
                style={{
                    animation: 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
            >
                {/* Decorative Edge */}
                <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-indigo-500/50 via-violet-500/50 to-transparent" />

                {/* Header */}
                <div className="flex flex-col p-6 border-b border-slate-200/50 bg-white/50 backdrop-blur-md sticky top-0 z-20 shrink-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-[20px] font-bold text-slate-800 tracking-tight flex items-center gap-2 capitalize">
                                <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
                                    <CalendarIcon size={16} className="text-white" />
                                </div>
                                {format(date, "EEEE d 'de' MMMM", { locale: es })}
                            </h2>
                            <p className="text-[13px] font-medium text-slate-500 mt-1.5 ml-10">
                                {dayEvents.length} {dayEvents.length === 1 ? 'evento programado' : 'eventos programados'}
                            </p>
                        </div>
                        <button
                            onClick={onClose}
                            className="w-8 h-8 rounded-[10px] flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700 bg-white border border-slate-200 shadow-sm"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Events Timeline */}
                <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                    {dayEvents.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 text-center space-y-3">
                            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">
                                <CalendarIcon size={24} />
                            </div>
                            <p className="text-[14px] font-medium text-slate-500">No hay eventos para este día.</p>
                        </div>
                    ) : (
                        <div className="relative border-l border-slate-200/80 ml-3 space-y-6 pb-6">
                            {dayEvents.map(event => (
                                <div
                                    key={event._id}
                                    onClick={() => onEditEvent(event)}
                                    className="relative pl-6 group cursor-pointer"
                                >
                                    {/* Timeline dot */}
                                    <div className={`absolute -left-[5px] top-1.5 w-[9px] h-[9px] rounded-full border-2 border-white ring-2 transition-all group-hover:scale-125 ${event.type === 'meet' ? 'bg-violet-500 ring-violet-200' : 'bg-amber-500 ring-amber-200'}`} />

                                    {/* Event Card */}
                                    <div className={`bg-white/80 backdrop-blur-sm border rounded-[16px] p-4 transition-all hover:shadow-md hover:-translate-y-0.5 ${event.type === 'meet' ? 'border-violet-100/80 group-hover:border-violet-300' : 'border-amber-100/80 group-hover:border-amber-300'}`}>

                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex flex-col">
                                                <span className={`text-[11px] font-extrabold uppercase tracking-wider mb-1 flex items-center gap-1 ${event.type === 'meet' ? 'text-violet-600' : 'text-amber-600'}`}>
                                                    {event.type === 'meet' ? <Video size={10} /> : <MapPin size={10} />}
                                                    {event.startTime} - {event.endTime}
                                                </span>
                                                <h3 className="text-[15px] font-bold text-slate-800 leading-tight group-hover:text-indigo-600 transition-colors">
                                                    {event.title}
                                                </h3>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-y-2 gap-x-3 mt-3">
                                            {/* Contacts/Deals indicator */}
                                            {((event.linkedTo?.contacts && event.linkedTo.contacts.length > 0) || event.linkedTo?.contact || event.linkedTo?.deal) && (
                                                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-[6px]">
                                                    <User size={10} className="text-slate-400" />
                                                    <span className="truncate max-w-[150px]">
                                                        {event.linkedTo?.contacts?.length ?
                                                            (event.linkedTo.contacts.length === 1 ? event.linkedTo.contacts[0].fullName : `${event.linkedTo.contacts[0].fullName} y ${event.linkedTo.contacts.length - 1} más`) :
                                                            (event.linkedTo?.contact ? event.linkedTo.contact.fullName : (event.linkedTo?.deal ? event.linkedTo.deal.title : ''))}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-6 border-t border-slate-200/50 bg-white/50 backdrop-blur-md shrink-0">
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onNewEvent(date);
                        }}
                        className="w-full h-11 bg-violet-600 text-white font-bold rounded-[14px] hover:bg-violet-700 hover:-translate-y-0.5 transition-all shadow-[0_4px_12px_rgba(139,92,246,0.3)] flex items-center justify-center gap-2 text-[14px]"
                    >
                        <Plus size={18} /> Crear Evento
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
            `}</style>
        </div>
    );
}
