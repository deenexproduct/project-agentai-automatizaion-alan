import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, ChevronLeft, ChevronRight, Plus, MapPin, Video, CheckSquare, ChevronDown, RefreshCw } from 'lucide-react';
import { format, addMonths, subMonths, addWeeks, subWeeks, subDays, addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isToday, getWeekOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { parseSafeDate } from '../../utils/date';
import CalendarConfigModal from '../../components/calendar/CalendarConfigModal';
import EventFormDrawer from '../../components/calendar/EventFormDrawer';
import TaskFormDrawer from '../../components/crm/TaskFormDrawer';
import DailyEventsDrawer from '../../components/calendar/DailyEventsDrawer';
import WeeklyCalendarView from '../../components/calendar/WeeklyCalendarView';
import { getEvents, syncGoogleEvents, updateEvent, updateTask, EventData, TaskData } from '../../services/crm.service';

export default function CalendarPage({ urlEventId }: { urlEventId?: string }) {
    const [viewMode, setViewMode] = useState<'month' | 'week'>('week');
    const [currentDate, setCurrentDate] = useState(new Date());
    const [events, setEvents] = useState<EventData[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);

    const [isConfigOpen, setIsConfigOpen] = useState(false);
    const [isEventDrawerOpen, setIsEventDrawerOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<EventData | undefined>(undefined);
    const [isDailyDrawerOpen, setIsDailyDrawerOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);

    const [isTaskDrawerOpen, setIsTaskDrawerOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<TaskData | undefined>(undefined);
    const [showNewDropdown, setShowNewDropdown] = useState(false);

    const navigate = useNavigate();

    // Deep-linking effect for events/tasks via calendar
    useEffect(() => {
        if (urlEventId && events.length > 0) {
            // First try to find it in loaded events to see if it's a task or an event
            const loadedItem = events.find(e => e._id === urlEventId || e.sourceId === urlEventId);
            if (loadedItem) {
                openEditEvent(loadedItem);
            } else {
                // If not found in current view, fallback to treating it as an event drawer
                setSelectedEvent({ _id: urlEventId } as any);
                setIsEventDrawerOpen(true);
            }
        } else if (urlEventId && events.length === 0) {
            // Loading state, just fallback to event Drawer with ID
            setSelectedEvent({ _id: urlEventId } as any);
            setIsEventDrawerOpen(true);
        } else if (isEventDrawerOpen && selectedEvent?._id) {
            setIsEventDrawerOpen(false);
            setSelectedEvent(undefined);
        }
    }, [urlEventId, events.length]);

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

    const handleManualSync = async () => {
        try {
            setIsSyncing(true);
            const start = subDays(startOfWeek(startOfMonth(currentDate)), 1);
            const end = addDays(endOfWeek(endOfMonth(currentDate)), 1);
            await syncGoogleEvents(start.toISOString(), end.toISOString());
            // Reload local events after sync is complete
            await loadEvents();
        } catch (error) {
            console.error('Error syncing events:', error);
            // Optionally could add a toast here
        } finally {
            setIsSyncing(false);
        }
    };

    useEffect(() => {
        loadEvents();
    }, [currentDate]);

    const goNext = () => setCurrentDate(viewMode === 'week' ? addWeeks(currentDate, 1) : addMonths(currentDate, 1));
    const goPrev = () => setCurrentDate(viewMode === 'week' ? subWeeks(currentDate, 1) : subMonths(currentDate, 1));
    const today = () => setCurrentDate(new Date());

    const openNewEvent = () => {
        setSelectedEvent(undefined);
        setIsEventDrawerOpen(true);
        if (urlEventId) navigate('/linkedin/calendar');
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

        // Don't navigate if we are already coming from a URL to avoid loops
        if (!urlEventId || urlEventId !== (event.sourceId || event._id)) {
            navigate(`/linkedin/calendar/${event.sourceId || event._id}`);
        }
    };

    const handleEventDrop = async (eventId: string, type: 'meet' | 'physical' | 'task', newDate: string, newStartTime: string, newEndTime: string) => {
        try {
            // Optimistic UI update
            setEvents(prev => prev.map(e =>
                e._id === eventId ? { ...e, date: newDate, startTime: newStartTime, endTime: newEndTime } : e
            ));

            if (type === 'task') {
                // Build UTC ISO string directly from the visual time to avoid local timezone offset.
                // The backend calendar route reads dueDate with getUTCHours(), so we must store
                // the intended visual time as the UTC component of the date.
                const isoDate = `${newDate}T${newStartTime}:00.000Z`;
                await updateTask(eventId, { dueDate: isoDate });
            } else {
                // Regular event update — send the date as ISO too for consistency
                const isoDate = `${newDate}T${newStartTime}:00.000Z`;
                await updateEvent(eventId, { date: isoDate, startTime: newStartTime, endTime: newEndTime });
            }

            // Reload from server to ensure perfect sync
            loadEvents();
        } catch (error) {
            console.error('Failed to move event', error);
            // Revert on error
            loadEvents();
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

    const weekDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const weekDaysFull = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

    return (
        <div className="flex-1 flex flex-col pt-4 md:pt-6 pb-24 md:pb-8 relative custom-scrollbar">

            {/* Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 md:mb-6 shrink-0 relative z-30 gap-3 px-4 md:px-0">
                <div className="flex items-center gap-3 md:gap-4">
                    <h2 className="text-base md:text-xl font-bold text-slate-600 capitalize shrink-0 flex items-center gap-2">
                        {format(currentDate, 'MMMM yyyy', { locale: es })}
                        {viewMode === 'week' && (
                            <span className="text-[12px] md:text-[14px] font-semibold text-slate-500 normal-case bg-slate-100/80 px-2.5 py-0.5 rounded-[8px] border border-slate-200/60 shadow-sm">
                                Semana {getWeekOfMonth(currentDate, { weekStartsOn: 1 })}
                            </span>
                        )}
                    </h2>
                </div>

                <div className="flex-1 mx-4 hidden md:block">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 md:pl-4 flex items-center pointer-events-none">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 group-focus-within:text-violet-500 transition-colors"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar en el calendario..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-11 md:h-12 pl-10 md:pl-12 pr-4 bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-[14px] md:rounded-[18px] text-[14px] md:text-[15px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all shadow-sm group-hover:border-slate-300"
                        />
                    </div>
                </div>

                {/* Mobile Search */}
                <div className="w-full md:hidden mb-2">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-10 pl-10 pr-4 bg-white border border-slate-200 rounded-[12px] text-[14px] focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto flex-wrap">
                    <div className="flex items-center bg-white rounded-[14px] shadow-sm border border-slate-200 p-1">
                        <button onClick={goPrev} className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-[10px] transition-colors">
                            <ChevronLeft size={20} />
                        </button>
                        <button onClick={today} className="px-3 md:px-4 h-8 flex items-center justify-center text-[13px] font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-[10px] transition-colors">
                            Hoy
                        </button>
                        <button onClick={goNext} className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-[10px] transition-colors">
                            <ChevronRight size={20} />
                        </button>
                    </div>

                    <div className="flex bg-slate-100 p-1 rounded-[14px] mx-1 md:mx-2 border border-slate-200 shadow-sm gap-1">
                        <button
                            onClick={() => setViewMode('week')}
                            className={`px-3 py-1 text-[13px] font-bold rounded-[10px] transition-all ${viewMode === 'week' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                        >
                            Semana
                        </button>
                        <button
                            onClick={() => setViewMode('month')}
                            className={`px-3 py-1 text-[13px] font-bold rounded-[10px] transition-all ${viewMode === 'month' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                        >
                            Mes
                        </button>
                    </div>

                    <button
                        onClick={handleManualSync}
                        disabled={isSyncing}
                        className="h-10 w-10 md:w-auto md:px-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-[14px] hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all flex items-center justify-center gap-2 text-[14px] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
                        <span className="hidden md:inline">{isSyncing ? 'Sincronizando...' : 'Sincronizar'}</span>
                    </button>

                    <button
                        onClick={() => setIsConfigOpen(true)}
                        className="h-10 w-10 md:w-auto md:px-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-[14px] hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50 transition-all flex items-center justify-center gap-2 text-[14px] shadow-sm"
                    >
                        <Settings size={16} />
                        <span className="hidden md:inline">Configuración</span>
                    </button>


                    <div className="relative ml-auto md:ml-0">
                        <button
                            onClick={() => setShowNewDropdown(!showNewDropdown)}
                            className="h-10 px-4 md:px-5 bg-violet-600 text-white font-bold rounded-[14px] hover:bg-violet-700 hover:-translate-y-0.5 transition-all shadow-[0_4px_12px_rgba(139,92,246,0.3)] flex items-center gap-2 text-[14px]"
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

            {/* Calendar Grid / Weekly View */}
            {viewMode === 'month' ? (
                <div className="flex-1 bg-white/80 backdrop-blur-xl border border-white/90 shadow-[0_8px_32px_rgba(30,27,75,0.05)] overflow-hidden flex flex-col relative z-10 transition-all duration-300 hover:bg-white/95">
                    {/* Weekday Headers */}
                    <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/50 shrink-0">
                        {weekDays.map((day, i) => (
                            <div key={day} className="py-2 md:py-3 text-center text-[10px] md:text-[12px] font-bold text-slate-500 uppercase tracking-wider">
                                <span className="md:hidden">{day}</span>
                                <span className="hidden md:inline">{weekDaysFull[i]}</span>
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

                                // Filter events matching the search query
                                let dayEvents = events.filter(e => isSameDay(parseSafeDate(e.date), day));
                                if (searchQuery.trim() !== '') {
                                    const q = searchQuery.toLowerCase();
                                    dayEvents = dayEvents.filter(e =>
                                        e.title.toLowerCase().includes(q) ||
                                        e.description?.toLowerCase().includes(q) ||
                                        e.linkedTo?.contacts?.some(c => c.fullName.toLowerCase().includes(q)) ||
                                        (e.linkedTo?.contact && e.linkedTo.contact.fullName.toLowerCase().includes(q)) ||
                                        e.linkedTo?.company?.name?.toLowerCase().includes(q) ||
                                        e.linkedTo?.deal?.title?.toLowerCase().includes(q)
                                    );
                                }

                                return (
                                    <div
                                        key={day.toISOString()}
                                        className={` border-r border-b border-slate-100 p-1 md:p-2 flex flex-col gap-0.5 md:gap-1 transition-colors ${!isCurrentMonth ? 'bg-slate-50/50' : 'bg-white hover:bg-violet-50/20'} ${dayEvents.length > 0 ? 'min-h-[60px] md:min-h-[200px]' : 'min-h-[44px] md:min-h-[100px]'}`}
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
            ) : (
                <div className="flex-1 relative">
                    <WeeklyCalendarView
                        currentDate={currentDate}
                        events={events}
                        searchQuery={searchQuery}
                        onEventSelect={openEditEvent}
                        onNewEvent={(date) => {
                            setSelectedDate(date);
                            openNewEvent();
                        }}
                        previewDate={selectedDate}
                        isPreviewing={isEventDrawerOpen && !selectedEvent}
                        onEventDrop={handleEventDrop}
                    />
                    {loading && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm rounded-[20px]">
                            <div className="animate-spin w-10 h-10 border-4 border-transparent border-t-violet-600 rounded-full" />
                        </div>
                    )}
                </div>
            )}

            {/* Drawers and Modals */}
            <CalendarConfigModal
                open={isConfigOpen}
                onClose={() => setIsConfigOpen(false)}
            />

            <EventFormDrawer
                open={isEventDrawerOpen}
                event={selectedEvent}
                initialDate={selectedDate || currentDate}
                onClose={() => {
                    setIsEventDrawerOpen(false);
                    if (urlEventId) navigate('/linkedin/calendar');
                }}
                onSaved={loadEvents}
            />

            <TaskFormDrawer
                open={isTaskDrawerOpen}
                task={selectedTask}
                initialDate={selectedDate || currentDate}
                onClose={() => {
                    setIsTaskDrawerOpen(false);
                    if (urlEventId) navigate('/linkedin/calendar');
                }}
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
