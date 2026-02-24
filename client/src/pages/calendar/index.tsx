import { useState, useEffect } from 'react';
import { Settings, ChevronLeft, ChevronRight, Plus, MapPin, Video, CheckSquare, ChevronDown } from 'lucide-react';
import { format, addMonths, subMonths, subDays, addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { parseSafeDate } from '../../utils/date';
import CalendarConfigModal from '../../components/calendar/CalendarConfigModal';
import EventFormDrawer from '../../components/calendar/EventFormDrawer';
import TaskFormDrawer from '../../components/crm/TaskFormDrawer';
import DailyEventsDrawer from '../../components/calendar/DailyEventsDrawer';
import { getEvents, EventData, TaskData } from '../../services/crm.service';

export default function CalendarPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState<EventData[]>([]);
    const [loading, setLoading] = useState(true);

    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [isEventDrawerOpen, setIsEventDrawerOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<EventData | undefined>(undefined);
    const [isDailyDrawerOpen, setIsDailyDrawerOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);

    const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<TaskData | undefined>(undefined);
    const [showNewDropdown, setShowNewDropdown] = useState(false);

    const loadEvents = async () => {
        try {
            setLoading(true);
            const start = subDays(startOfWeek(startOfMonth(currentDate)), 1);
            const end = addDays(endOfWeek(endOfMonth(currentDate)), 1);
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
        if (event.type === 'task') {
            // Reconstruct a partial TaskData object from the unified EventData
            const taskData: Partial<TaskData> = {
                _id: event._id,
                title: event.title.replace('[Tarea] ', ''),
                type: event.taskType || 'other',
                status: event.taskStatus || 'pending',
                priority: event.taskPriority || 'medium',
                dueDate: event.date,
                assignedTo: event.assignedTo as any,
                contact: event.linkedTo?.contacts?.[0] as any,
                company: event.linkedTo?.company as any,
                deal: event.linkedTo?.deal as any
            };
            setSelectedTask(taskData as TaskData);
            setIsTaskDrawerOpen(true);
        } else {
            setSelectedEvent(event);
            setIsEventDrawerOpen(true);
        }
    };

    const openNewTask = () => {
        setSelectedTask(undefined);
        setIsTaskDrawerOpen(true);
    };

    const days = eachDayOfInterval({
        start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 })
    });

    const weekDays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

    return (
        <div className="flex-1 flex flex-col p-8 overflow-y-auto min-h-[calc(100vh-80px)] custom-scrollbar">

            {/* Header */}
            <div className="flex items-center justify-between mb-8 shrink-0 relative z-30">
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


                    <div className="relative">
                        <button
                            onClick={() => setShowNewDropdown(!showNewDropdown)}
                            className="h-10 px-5 bg-violet-600 text-white font-bold rounded-[14px] hover:bg-violet-700 hover:-translate-y-0.5 transition-all shadow-[0_4px_12px_rgba(139,92,246,0.3)] flex items-center gap-2 text-[14px]"
                        >
                            <Plus size={16} /> Crear <ChevronDown size={14} className={`transition-transform ${showNewDropdown ? 'rotate-180' : ''}`} />
                        </button>

                        {showNewDropdown && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowNewDropdown(false)}></div>
                                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-[14px] shadow-xl border border-slate-100 py-1.5 z-50 animate-in fade-in slide-in-from-top-2">
                                    <button
                                        onClick={() => {
                                            setShowNewDropdown(false);
                                            openNewEvent();
                                        }}
                                        className="w-full text-left px-4 py-2 text-[13px] font-bold text-slate-700 hover:bg-violet-50 hover:text-violet-700 flex items-center gap-2"
                                    >
                                        <Video size={16} /> Evento o Reunión
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowNewDropdown(false);
                                            openNewTask();
                                        }}
                                        className="w-full text-left px-4 py-2 text-[13px] font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center gap-2"
                                    >
                                        <CheckSquare size={16} /> Tarea Programada
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
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
                <div className="flex-1 grid grid-cols-7 overflow-hidden">
                    {loading ? (
                        <div className="col-span-7 row-span-5 flex items-center justify-center bg-white/50 backdrop-blur-sm">
                            <div className="animate-spin w-10 h-10 border-4 border-transparent border-t-violet-600 rounded-full" />
                        </div>
                    ) : (
                        days.map((day, idx) => {
                            const isCurrentMonth = isSameMonth(day, currentDate);
                            const dayEvents = events.filter(e => isSameDay(parseSafeDate(e.date), day));

                            return (
                                <div
                                    key={day.toISOString()}
                                    className={` border-r border-b border-slate-100 p-2 flex flex-col gap-1 transition-colors ${!isCurrentMonth ? 'bg-slate-50/50' : 'bg-white hover:bg-violet-50/20'} ${dayEvents.length > 0 ? 'min-h-[200px]' : 'min-h-[100px]'}`}
                                    onClick={() => {
                                        setSelectedDate(day);
                                        setIsDailyDrawerOpen(true);
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
                                                className={`px-2 py-1.5 rounded-[8px] text-[11px] font-bold shrink-0 cursor-pointer transition-all hover:scale-[1.02] border border-l-4 
                                                    ${event.type === 'meet' ? 'bg-violet-50 border-violet-100 border-l-violet-500 text-violet-700' :
                                                        event.type === 'task' ? 'bg-emerald-50 border-emerald-100 border-l-emerald-500 text-emerald-700' :
                                                            'bg-amber-50 border-amber-100 border-l-amber-500 text-amber-700'}`}
                                            >
                                                <div className="flex items-center justify-between gap-1">
                                                    <span className="truncate">{event.title}</span>
                                                    {event.type === 'meet' ? <Video size={10} className="shrink-0 opacity-70" /> :
                                                        event.type === 'task' ? <CheckSquare size={10} className="shrink-0 opacity-70" /> :
                                                            <MapPin size={10} className="shrink-0 opacity-70" />}
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
                initialDate={selectedDate || currentDate}
                onClose={() => setIsEventDrawerOpen(false)}
                onSaved={loadEvents}
            />

            <TaskFormDrawer
                open={isTaskDrawerOpen}
                task={selectedTask}
                initialDate={selectedDate || currentDate}
                onClose={() => setIsTaskDrawerOpen(false)}
                onSaved={loadEvents}
            />

            <DailyEventsDrawer
                open={isDailyDrawerOpen}
                date={selectedDate}
                events={events}
                onClose={() => setIsDailyDrawerOpen(false)}
                onEditEvent={(event) => {
                    setIsDailyDrawerOpen(false);
                    openEditEvent(event);
                }}
                onNewEvent={(date, type) => {
                    setIsDailyDrawerOpen(false);
                    setTimeout(() => {
                        setSelectedDate(date);
                        if (type === 'task') {
                            openNewTask();
                        } else {
                            openNewEvent();
                        }
                    }, 50); // Small delay to allow daily drawer to unmount and avoid event conflicts
                }}
            />
        </div>
    );
}
