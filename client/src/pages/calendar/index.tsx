import { useState, useEffect } from 'react';
import { Settings, ChevronLeft, ChevronRight, Plus, MapPin, Video } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import CalendarConfigModal from '../../components/calendar/CalendarConfigModal';
import EventFormDrawer from '../../components/calendar/EventFormDrawer';
import { getEvents, EventData } from '../../services/crm.service';

export default function CalendarPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState<EventData[]>([]);
    const [loading, setLoading] = useState(true);

    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [isEventDrawerOpen, setIsEventDrawerOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<EventData | undefined>(undefined);

    const loadEvents = async () => {
        try {
            setLoading(true);
            const start = startOfWeek(startOfMonth(currentDate));
            const end = endOfWeek(endOfMonth(currentDate));
            const data = await getEvents({
                start: start.toISOString(),
                end: end.toISOString()
            });
            setEvents(data.events);
        } catch (error) {
            console.error('Error loading events:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadEvents();
    }, [currentDate]);

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
    const today = () => setCurrentDate(new Date());

    const openNewEvent = () => {
        setSelectedEvent(undefined);
        setIsEventDrawerOpen(true);
    };

    const openEditEvent = (event: EventData) => {
        setSelectedEvent(event);
        setIsEventDrawerOpen(true);
    };

    const days = eachDayOfInterval({
        start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 })
    });

    const weekDays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

    return (
        <div className="flex-1 flex flex-col p-8 overflow-hidden h-[calc(100vh-80px)]">

            {/* Header */}
            <div className="flex items-center justify-between mb-8 shrink-0 relative z-10">
                <div className="flex items-center gap-4">
                    <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
                        Calendario
                    </h1>
                    <div className="h-6 w-px bg-slate-300 mx-1"></div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-slate-600 capitalize">
                            {format(currentDate, 'MMMM yyyy', { locale: es })}
                        </h2>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-white rounded-[14px] shadow-sm border border-slate-200 p-1">
                        <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-[10px] transition-colors">
                            <ChevronLeft size={20} />
                        </button>
                        <button onClick={today} className="px-4 h-8 flex items-center justify-center text-[13px] font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-[10px] transition-colors">
                            Hoy
                        </button>
                        <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-[10px] transition-colors">
                            <ChevronRight size={20} />
                        </button>
                    </div>

                    <button
                        onClick={() => setIsConfigOpen(true)}
                        className="h-10 px-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-[14px] hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50 transition-all flex items-center gap-2 text-[14px] shadow-sm"
                    >
                        <Settings size={16} /> Configuración
                    </button>

                    <button
                        onClick={openNewEvent}
                        className="h-10 px-5 bg-violet-600 text-white font-bold rounded-[14px] hover:bg-violet-700 hover:-translate-y-0.5 transition-all shadow-[0_4px_12px_rgba(139,92,246,0.3)] flex items-center gap-2 text-[14px]"
                    >
                        <Plus size={16} /> Nuevo Evento
                    </button>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="flex-1 bg-white/80 backdrop-blur-xl border border-white/90 rounded-[24px] shadow-[0_8px_32px_rgba(30,27,75,0.05)] overflow-hidden flex flex-col relative z-10 transition-all duration-300 hover:bg-white/95">
                {/* Weekday Headers */}
                <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50 shrink-0">
                    {weekDays.map(day => (
                        <div key={day} className="py-3 text-center text-[12px] font-bold text-slate-500 uppercase tracking-wider">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Days Grid */}
                <div className="flex-1 grid grid-cols-7 grid-rows-5 overflow-hidden">
                    {loading ? (
                        <div className="col-span-7 row-span-5 flex items-center justify-center bg-white/50 backdrop-blur-sm">
                            <div className="animate-spin w-10 h-10 border-4 border-transparent border-t-violet-600 rounded-full" />
                        </div>
                    ) : (
                        days.map((day, idx) => {
                            const isCurrentMonth = isSameMonth(day, currentDate);
                            const dayEvents = events.filter(e => isSameDay(new Date(e.date), day));

                            return (
                                <div
                                    key={day.toISOString()}
                                    className={`min-h-[100px] border-r border-b border-slate-100 p-2 flex flex-col gap-1 transition-colors ${!isCurrentMonth ? 'bg-slate-50/50' : 'bg-white hover:bg-violet-50/20'}`}
                                    onClick={() => {
                                        // Optional: set initial date for new event based on clicked day
                                        setSelectedEvent(undefined);
                                        // We'd need to lift state to pass initialDate, skipping for simplicity now
                                    }}
                                >
                                    <div className="flex justify-end p-1">
                                        <div className={`w-7 h-7 flex items-center justify-center rounded-full text-[13px] font-bold ${isToday(day) ? 'bg-violet-600 text-white shadow-md' : isCurrentMonth ? 'text-slate-700' : 'text-slate-400'}`}>
                                            {format(day, 'd')}
                                        </div>
                                    </div>
                                    <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-1.5 px-1 pb-1">
                                        {dayEvents.map(event => (
                                            <div
                                                key={event._id}
                                                onClick={(e) => { e.stopPropagation(); openEditEvent(event); }}
                                                className={`px-2 py-1.5 rounded-[8px] text-[11px] font-bold truncate cursor-pointer transition-all hover:scale-[1.02] border border-l-4 ${event.type === 'meet' ? 'bg-violet-50 border-violet-100 border-l-violet-500 text-violet-700' : 'bg-amber-50 border-amber-100 border-l-amber-500 text-amber-700'}`}
                                            >
                                                <div className="flex items-center justify-between gap-1">
                                                    <span className="truncate">{event.title}</span>
                                                    {event.type === 'meet' ? <Video size={10} className="shrink-0 opacity-70" /> : <MapPin size={10} className="shrink-0 opacity-70" />}
                                                </div>
                                                <div className="text-[10px] font-medium opacity-80 mt-1 truncate flex items-center gap-1 text-slate-500">
                                                    {event.startTime} - {event.endTime}
                                                </div>
                                                <div className="text-[9px] font-semibold opacity-70 mt-0.5 truncate flex justify-between items-center">
                                                    <span>{event.linkedTo?.contacts?.length ? (event.linkedTo.contacts.length === 1 ? event.linkedTo.contacts[0].fullName : `${event.linkedTo.contacts[0].fullName} +${event.linkedTo.contacts.length - 1}`) : (event.linkedTo?.contact ? event.linkedTo.contact.fullName : (event.linkedTo?.deal ? event.linkedTo.deal.title : ''))}</span>
                                                    <span className="italic shrink-0 ml-1">por {(event.assignedTo || event.userId)?.name?.split(' ')[0] || 'Doc'}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Drawers and Modals */}
            <CalendarConfigModal
                open={isConfigOpen}
                onClose={() => setIsConfigOpen(false)}
            />

            <EventFormDrawer
                open={isEventDrawerOpen}
                event={selectedEvent}
                onClose={() => setIsEventDrawerOpen(false)}
                onSaved={loadEvents}
            />
        </div>
    );
}
