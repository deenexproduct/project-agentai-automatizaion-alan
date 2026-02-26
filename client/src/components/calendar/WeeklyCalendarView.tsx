import { useMemo } from 'react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday } from 'date-fns';
import { es } from 'date-fns/locale';
import { Video, CheckSquare, MapPin } from 'lucide-react';
import { EventData } from '../../services/crm.service';
import { parseSafeDate } from '../../utils/date';

interface WeeklyCalendarViewProps {
    currentDate: Date;
    events: EventData[];
    searchQuery: string;
    onEventSelect: (event: EventData) => void;
    onNewEvent: (date: Date) => void;
    previewDate?: Date | null;
    isPreviewing?: boolean;
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 7); // 7 to 24 (24 is next day 00)
const PIXELS_PER_HOUR = 60; // Base height for one hour

// Helper to convert "HH:MM" to decimal hours (e.g. "09:30" -> 9.5)
const timeToDecimal = (timeStr: string) => {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours + (minutes / 60);
};

export default function WeeklyCalendarView({ currentDate, events, searchQuery, onEventSelect, onNewEvent, previewDate, isPreviewing }: WeeklyCalendarViewProps) {
    const days = useMemo(() => {
        return eachDayOfInterval({
            start: startOfWeek(currentDate, { weekStartsOn: 1 }),
            end: endOfWeek(currentDate, { weekStartsOn: 1 })
        });
    }, [currentDate]);

    const weekDaysFull = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const weekDaysShort = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

    // Filter events based on search query
    const filteredEvents = useMemo(() => {
        if (!searchQuery.trim()) return events;
        const q = searchQuery.toLowerCase();
        return events.filter(e =>
            e.title.toLowerCase().includes(q) ||
            e.description?.toLowerCase().includes(q) ||
            e.linkedTo?.contacts?.some(c => c.fullName.toLowerCase().includes(q)) ||
            (e.linkedTo?.contact && e.linkedTo.contact.fullName.toLowerCase().includes(q)) ||
            e.linkedTo?.company?.name?.toLowerCase().includes(q) ||
            e.linkedTo?.deal?.title?.toLowerCase().includes(q)
        );
    }, [events, searchQuery]);

    // Group events by day
    const eventsByDay = useMemo(() => {
        const grouped = new Map<string, EventData[]>();
        days.forEach(day => {
            const dayEvents = filteredEvents.filter(e => isSameDay(parseSafeDate(e.date), day));
            grouped.set(day.toISOString(), dayEvents);
        });
        return grouped;
    }, [days, filteredEvents]);

    return (
        <div className="bg-white/80 backdrop-blur-xl border border-white/90 shadow-[0_8px_32px_rgba(30,27,75,0.05)] rounded-[20px] flex flex-col relative z-10 transition-all duration-300 min-h-[600px] max-h-[calc(100vh-220px)] overflow-auto custom-scrollbar">
            {/* Header: Days of the week */}
            <div className="flex border-b border-slate-200 bg-white/95 backdrop-blur-xl shrink-0 select-none sticky top-0 z-[60] shadow-[0_4px_20px_rgba(0,0,0,0.03)] rounded-t-[20px]">
                {/* Time column spacer */}
                <div className="w-[50px] md:w-[60px] shrink-0 border-r border-slate-100"></div>
                {/* Days headers */}
                <div className="flex-1 grid grid-cols-7">
                    {days.map((day, i) => {
                        const today = isToday(day);
                        return (
                            <div key={day.toISOString()} className="flex flex-col items-center justify-center py-2 md:py-3 border-r border-slate-100 last:border-r-0 bg-white/50">
                                <span className="text-[10px] md:text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                    <span className="md:hidden">{weekDaysShort[i]}</span>
                                    <span className="hidden md:inline">{weekDaysFull[i]}</span>
                                </span>
                                <div className={`mt-1 w-7 h-7 flex items-center justify-center rounded-full text-[13px] md:text-[14px] font-bold ${today ? 'bg-violet-600 text-white shadow-md' : 'text-slate-700'}`}>
                                    {format(day, 'd')}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Grid area */}
            <div className="relative bg-white pb-6 rounded-b-[20px]">
                <div className="flex relative min-w-[600px] md:min-w-0 pb-8">

                    {/* Time labels column */}
                    <div className="w-[50px] md:w-[60px] shrink-0 border-r border-slate-100 bg-white relative select-none">
                        {HOURS.map(hour => (
                            <div key={`label-${hour}`} className="relative text-right pr-2 select-none" style={{ height: PIXELS_PER_HOUR }}>
                                <span className="text-[10px] md:text-[11px] font-medium text-slate-400 absolute top-[-8px] right-2 bg-white px-1">
                                    {hour === 24 ? '00:00' : `${hour.toString().padStart(2, '0')}:00`}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Timeline Grid & Events */}
                    <div className="flex-1 grid grid-cols-7 relative">
                        {/* Horizontal Grid lines */}
                        <div className="absolute inset-0 pointer-events-none">
                            {HOURS.map(hour => (
                                <div key={`gridline-${hour}`} className="border-t border-slate-100/80 w-full" style={{ height: PIXELS_PER_HOUR }}></div>
                            ))}
                        </div>

                        {/* Day columns */}
                        {days.map((day, index) => {
                            const dayEvents = eventsByDay.get(day.toISOString()) || [];
                            return (
                                <div
                                    key={`col-${day.toISOString()}`}
                                    className="relative border-r border-slate-100 last:border-r-0 hover:bg-slate-50/30 transition-colors cursor-pointer"
                                    onClick={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const y = Math.max(0, e.clientY - rect.top);

                                        // Calculate nearest 30 mins interval from 7:00
                                        const clickedHourDecimal = Math.floor((y / PIXELS_PER_HOUR) * 2) / 2 + 7;
                                        const h = Math.floor(clickedHourDecimal);
                                        const m = (clickedHourDecimal - h) * 60;

                                        const clickDate = new Date(day);
                                        clickDate.setHours(h, m, 0, 0);
                                        onNewEvent(clickDate);
                                    }}
                                >
                                    {dayEvents.map(event => {
                                        const startDec = timeToDecimal(event.startTime);
                                        const endDec = timeToDecimal(event.endTime);

                                        // Bound logic (only show events inside 07:00 to 24:00 window, roughly)
                                        // E.g., if starts before 7:00, cap at 7:00
                                        const boundedStart = Math.max(7, startDec);
                                        const boundedEnd = Math.max(7, Math.max(startDec + 0.5, endDec)); // At least 30 mins block

                                        if (boundedStart >= 24) return null; // Outside view

                                        const top = (boundedStart - 7) * PIXELS_PER_HOUR;
                                        // Calculate height. Ensure it doesn't go beyond view (24 hours = 17 * 60)
                                        const maxBottom = (24 - 7) * PIXELS_PER_HOUR;
                                        const calculatedHeight = (boundedEnd - boundedStart) * PIXELS_PER_HOUR;
                                        const height = Math.min(calculatedHeight, maxBottom - top);

                                        let styleClasses = 'bg-amber-50 border-amber-200 border-l-amber-500 text-amber-800';
                                        let Icon = MapPin;
                                        if (event.type === 'meet') {
                                            styleClasses = 'bg-violet-50 border-violet-200 border-l-violet-500 text-violet-800';
                                            Icon = Video;
                                        } else if (event.type === 'task') {
                                            styleClasses = 'bg-emerald-50 border-emerald-200 border-l-emerald-500 text-emerald-800';
                                            Icon = CheckSquare;
                                        }

                                        return (
                                            <div
                                                key={`event-${event._id}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onEventSelect(event);
                                                }}
                                                className={`absolute left-0.5 right-0.5 rounded-[6px] border border-l-4 shadow-sm px-1.5 py-1 text-xs cursor-pointer hover:brightness-95 transition-all overflow-hidden z-10 ${styleClasses}`}
                                                style={{
                                                    top: `${top}px`,
                                                    height: `${height}px`,
                                                    minHeight: '24px' // Ensures it is clickable
                                                }}
                                            >
                                                <div className="flex font-bold text-[10px] md:text-[11px] leading-tight items-start gap-1">
                                                    <Icon size={12} className="shrink-0 mt-0.5 opacity-70" />
                                                    <span className="truncate">{event.title}</span>
                                                </div>
                                                {height >= 40 && (
                                                    <>
                                                        <div className="text-[9px] md:text-[10px] opacity-80 mt-0.5 truncate font-medium">
                                                            {event.startTime} - {event.endTime}
                                                        </div>
                                                        <div className="text-[9px] opacity-70 mt-0.5 truncate">
                                                            {event.linkedTo?.contacts?.length ? event.linkedTo.contacts.map(c => c.fullName).join(', ') : (event.linkedTo?.contact ? event.linkedTo.contact.fullName : (event.linkedTo?.deal ? event.linkedTo.deal.title : ''))}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {/* Temp Preview Event */}
                                    {isPreviewing && previewDate && isSameDay(previewDate, day) && (() => {
                                        const startDec = previewDate.getHours() + previewDate.getMinutes() / 60;
                                        const boundedStart = Math.max(7, startDec);
                                        const boundedEnd = boundedStart + 0.5; // Always 30 mins default

                                        if (boundedStart >= 24) return null;

                                        const top = (boundedStart - 7) * PIXELS_PER_HOUR;
                                        const maxBottom = (24 - 7) * PIXELS_PER_HOUR;
                                        const calculatedHeight = (boundedEnd - boundedStart) * PIXELS_PER_HOUR;
                                        const height = Math.min(calculatedHeight, maxBottom - top);

                                        return (
                                            <div
                                                className="absolute left-0.5 right-0.5 rounded-[6px] border border-l-4 shadow-sm px-1.5 py-1 text-xs z-20 bg-violet-50/80 border-violet-200 border-l-violet-500 text-violet-800 animate-pulse pointer-events-none"
                                                style={{
                                                    top: `${top}px`,
                                                    height: `${height}px`,
                                                    minHeight: '24px'
                                                }}
                                            >
                                                <div className="flex font-bold text-[10px] md:text-[11px] leading-tight items-start gap-1 opacity-70">
                                                    <span>(Nuevo evento...)</span>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
