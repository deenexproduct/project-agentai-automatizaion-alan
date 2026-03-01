import { useMemo, useState, useRef, useEffect } from 'react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday, addMinutes } from 'date-fns';
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
    onEventDrop?: (eventId: string, type: 'meet' | 'physical' | 'task', newDate: string, newStartTime: string, newEndTime: string) => void;
}

const HOURS = Array.from({ length: 18 }, (_, i) => i + 7); // 7 to 24 (24 is next day 00)
const PIXELS_PER_HOUR = 60; // Base height for one hour

// Helper to convert "HH:MM" to decimal hours (e.g. "09:30" -> 9.5)
const timeToDecimal = (timeStr: string) => {
    if (!timeStr) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours + (minutes / 60);
};

// Helper: Decimal back to HH:mm string
const decimalToTime = (dec: number) => {
    const h = Math.floor(dec);
    const m = Math.round((dec - h) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export default function WeeklyCalendarView({ currentDate, events, searchQuery, onEventSelect, onNewEvent, previewDate, isPreviewing, onEventDrop }: WeeklyCalendarViewProps) {
    // --- Drag and Drop State ---
    const [draggingEvent, setDraggingEvent] = useState<EventData | null>(null);
    const [dragGhostState, setDragGhostState] = useState<{ dayIndex: number; startDec: number; durationDec: number } | null>(null);
    const gridRef = useRef<HTMLDivElement>(null);

    // Store drag start info
    const dragInfo = useRef<{ startY: number; eventStartDec: number; durationDec: number; startCursorY: number; isDragging: boolean }>({
        startY: 0, eventStartDec: 0, durationDec: 0, startCursorY: 0, isDragging: false
    });
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

    // --- Drag Handlers ---
    const handleMouseMove = (e: React.MouseEvent) => {
        if (!draggingEvent || !gridRef.current) return;

        // Indicate dragging started to prevent accidental clicks
        if (!dragInfo.current.isDragging && Math.abs(e.clientY - dragInfo.current.startCursorY) > 5) {
            dragInfo.current.isDragging = true;
        }

        if (!dragInfo.current.isDragging) return;

        const rect = gridRef.current.getBoundingClientRect();

        // 1. Calculate Day Column
        const x = Math.max(0, e.clientX - rect.left - 60); // 60px is the time column offset
        const columnWidth = (rect.width - 60) / 7;
        let dayColIndex = Math.floor(x / columnWidth);
        dayColIndex = Math.max(0, Math.min(6, dayColIndex));

        // 2. Calculate Vertical Position (Time)
        // Add the delta from when the user clicked inside the event box
        const yDelta = e.clientY - dragInfo.current.startCursorY;
        const baseTop = dragInfo.current.startY + yDelta;

        let newStartDec = (baseTop / PIXELS_PER_HOUR) + 7;

        // Snap to 15-minute intervals (0.25 hours)
        newStartDec = Math.round(newStartDec * 4) / 4;

        // Bound checks
        newStartDec = Math.max(7, Math.min(24 - dragInfo.current.durationDec, newStartDec));

        setDragGhostState({
            dayIndex: dayColIndex,
            startDec: newStartDec,
            durationDec: dragInfo.current.durationDec
        });
    };

    const handleMouseUp = () => {
        if (draggingEvent && dragGhostState && dragInfo.current.isDragging && onEventDrop) {
            const targetDate = format(days[dragGhostState.dayIndex], 'yyyy-MM-dd');
            const newStartTime = decimalToTime(dragGhostState.startDec);
            const newEndTime = decimalToTime(dragGhostState.startDec + dragGhostState.durationDec);

            onEventDrop(
                draggingEvent._id,
                draggingEvent.type,
                targetDate,
                newStartTime,
                newEndTime
            );
        }

        // Reset state
        setDraggingEvent(null);
        setDragGhostState(null);
        setTimeout(() => {
            dragInfo.current.isDragging = false;
        }, 50); // small delay to prevent click fire
    };

    // Add global mouse up listener to catch releases outside the component
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            if (draggingEvent) {
                handleMouseUp();
            }
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, [draggingEvent, dragGhostState]);

    return (
        <div
            className={`bg-white/80 backdrop-blur-xl border border-white/90 shadow-[0_8px_32px_rgba(30,27,75,0.05)] rounded-[20px] flex flex-col relative z-10 transition-all duration-300 min-h-[600px] max-h-[calc(100vh-220px)] overflow-auto custom-scrollbar ${draggingEvent ? 'cursor-grabbing select-none' : ''}`}
        >
            {/* Header: Days of the week */}
            <div className="flex border-b border-slate-200 bg-white/95 backdrop-blur-xl shrink-0 select-none sticky top-0 z-[60] shadow-[0_4px_20px_rgba(0,0,0,0.03)] rounded-t-[20px]">
                {/* Time column spacer */}
                <div className="w-[50px] md:w-[60px] shrink-0 border-r border-slate-100 bg-transparent"></div>
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
            <div className="relative bg-white pb-6 rounded-b-[20px] pt-4">
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
                    <div
                        className="flex-1 grid grid-cols-7 relative"
                        ref={gridRef}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                    >
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
                                        if (dragInfo.current.isDragging) return;
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
                                    {(() => {
                                        // 1. Process and sort events
                                        const processed = dayEvents
                                            .map(event => {
                                                const startDec = timeToDecimal(event.startTime);
                                                const endDec = timeToDecimal(event.endTime);
                                                const boundedStart = Math.max(7, startDec);
                                                const boundedEnd = Math.max(7, Math.max(startDec + 0.5, endDec));
                                                return { event, startDec: boundedStart, endDec: boundedEnd };
                                            })
                                            .filter(e => e.startDec < 24)
                                            .sort((a, b) => a.startDec - b.startDec || b.endDec - a.endDec);

                                        // 2. Group into overlapping clusters
                                        const clusters: typeof processed[] = [];
                                        let currentCluster: typeof processed = [];
                                        let clusterEnd = 0;

                                        for (const item of processed) {
                                            if (item.startDec >= clusterEnd) {
                                                if (currentCluster.length > 0) clusters.push(currentCluster);
                                                currentCluster = [item];
                                                clusterEnd = item.endDec;
                                            } else {
                                                currentCluster.push(item);
                                                clusterEnd = Math.max(clusterEnd, item.endDec);
                                            }
                                        }
                                        if (currentCluster.length > 0) clusters.push(currentCluster);

                                        // 3. Assign columns within each cluster
                                        const eventLayout = new Map<string, { col: number; totalCols: number }>();
                                        for (const cluster of clusters) {
                                            const cols: (typeof processed)[] = [];
                                            for (const item of cluster) {
                                                let placed = false;
                                                for (let i = 0; i < cols.length; i++) {
                                                    const colLastItem = cols[i][cols[i].length - 1];
                                                    // Add a tiny margin (0.01) so adjacent events aren't considered overlapping if they touch exactly
                                                    if (colLastItem.endDec <= item.startDec + 0.01) {
                                                        cols[i].push(item);
                                                        eventLayout.set(item.event._id, { col: i, totalCols: 0 });
                                                        placed = true;
                                                        break;
                                                    }
                                                }
                                                if (!placed) {
                                                    cols.push([item]);
                                                    eventLayout.set(item.event._id, { col: cols.length - 1, totalCols: 0 });
                                                }
                                            }
                                            for (const item of cluster) {
                                                eventLayout.get(item.event._id)!.totalCols = cols.length;
                                            }
                                        }

                                        // 4. Render events
                                        return processed.map(({ event, startDec, endDec }) => {
                                            const layout = eventLayout.get(event._id) || { col: 0, totalCols: 1 };
                                            const widthPercent = 100 / layout.totalCols;
                                            const leftPercent = layout.col * widthPercent;

                                            const top = (startDec - 7) * PIXELS_PER_HOUR;
                                            const maxBottom = (24 - 7) * PIXELS_PER_HOUR;
                                            const Math1 = Math;
                                            const calculatedHeight = (endDec - startDec) * PIXELS_PER_HOUR;
                                            const height = Math1.min(calculatedHeight, maxBottom - top);

                                            let styleClasses = 'bg-amber-50 border-amber-200 border-l-amber-500 text-amber-800';
                                            let Icon = MapPin;
                                            if (event.type === 'meet') {
                                                styleClasses = 'bg-violet-50 border-violet-200 border-l-violet-500 text-violet-800';
                                                Icon = Video;
                                            } else if (event.type === 'task') {
                                                styleClasses = 'bg-emerald-50 border-emerald-200 border-l-emerald-500 text-emerald-800';
                                                Icon = CheckSquare;
                                            }

                                            const isBeingDragged = draggingEvent?._id === event._id;

                                            const paddingClass = layout.totalCols >= 4 ? 'px-0.5' : 'px-1.5';
                                            const borderClass = layout.totalCols >= 4 ? 'border-l-2' : 'border-l-4';

                                            return (
                                                <div
                                                    key={`event-${event._id}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (!dragInfo.current.isDragging) {
                                                            onEventSelect(event);
                                                        }
                                                    }}
                                                    onMouseDown={(e) => {
                                                        if (e.button !== 0 || !onEventDrop) return; // Only left click and if drop is enabled
                                                        e.stopPropagation();

                                                        // Calculate accurate initial positions
                                                        const currentTop = (startDec - 7) * PIXELS_PER_HOUR;

                                                        dragInfo.current = {
                                                            startY: currentTop,
                                                            startCursorY: e.clientY,
                                                            eventStartDec: startDec,
                                                            durationDec: endDec - startDec,
                                                            isDragging: false
                                                        };

                                                        setDraggingEvent(event);
                                                        setDragGhostState({
                                                            dayIndex: index,
                                                            startDec: startDec,
                                                            durationDec: endDec - startDec
                                                        });
                                                    }}
                                                    className={`group absolute rounded-[6px] border ${borderClass} shadow-sm ${paddingClass} py-1 text-xs transition-all z-20 hover:!z-[70] hover:!w-max hover:!max-w-[180px] hover:!h-auto hover:!min-w-[100%] hover:shadow-xl overflow-hidden hover:!overflow-visible ${styleClasses} ${isBeingDragged ? 'opacity-50 ring-2 ring-violet-400 scale-[1.02] cursor-grabbing shadow-lg' : 'cursor-grab hover:brightness-95'}`}
                                                    style={{
                                                        top: `${top}px`,
                                                        height: `${height}px`,
                                                        minHeight: '24px',
                                                        left: `calc(${leftPercent}% + 2px)`,
                                                        width: `calc(${widthPercent}% - 4px)`
                                                    }}
                                                >
                                                    <div className="flex font-bold text-[10px] md:text-[11px] leading-tight items-start gap-1 overflow-hidden">
                                                        <Icon size={12} className={`shrink-0 mt-0.5 opacity-70 ${layout.totalCols >= 3 ? 'hidden group-hover:block' : ''}`} />
                                                        <span className="truncate min-w-0 flex-1 group-hover:whitespace-normal group-hover:overflow-visible group-hover:-mt-0.5 group-hover:pb-1 select-none">
                                                            {event.title.replace(/\[.*?\]/g, '').trim()}
                                                        </span>
                                                    </div>
                                                    {/* Always show extra info on hover, or if naturally large enough */}
                                                    <div className={`${height >= 40 && widthPercent > 30 ? 'block' : 'hidden group-hover:block'}`}>
                                                        <div className="text-[9px] md:text-[10px] opacity-80 mt-0.5 truncate group-hover:whitespace-normal font-medium select-none">
                                                            {event.startTime} - {event.endTime}
                                                        </div>
                                                        <div className="text-[9px] opacity-70 mt-0.5 truncate group-hover:whitespace-normal select-none">
                                                            {event.linkedTo?.contacts?.length ? event.linkedTo.contacts.map(c => c.fullName).join(', ') : (event.linkedTo?.contact ? event.linkedTo.contact.fullName : (event.linkedTo?.deal ? event.linkedTo.deal.title : ''))}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}


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

                                    {/* Drag Ghost Overlay */}
                                    {dragGhostState && draggingEvent && dragGhostState.dayIndex === index && (() => {
                                        const top = (dragGhostState.startDec - 7) * PIXELS_PER_HOUR;
                                        const maxBottom = (24 - 7) * PIXELS_PER_HOUR;
                                        const calculatedHeight = dragGhostState.durationDec * PIXELS_PER_HOUR;
                                        const height = Math.min(calculatedHeight, maxBottom - top);

                                        let styleClasses = 'bg-amber-100/60 border-amber-300 border-l-amber-600 text-amber-900';
                                        let Icon = MapPin;
                                        if (draggingEvent.type === 'meet') {
                                            styleClasses = 'bg-violet-100/60 border-violet-300 border-l-violet-600 text-violet-900';
                                            Icon = Video;
                                        } else if (draggingEvent.type === 'task') {
                                            styleClasses = 'bg-emerald-100/60 border-emerald-300 border-l-emerald-600 text-emerald-900';
                                            Icon = CheckSquare;
                                        }

                                        return (
                                            <div
                                                className={`absolute left-0.5 right-0.5 rounded-[6px] border border-l-4 border-dashed shadow-md px-1.5 py-1 text-xs z-30 pointer-events-none backdrop-blur-sm ${styleClasses}`}
                                                style={{
                                                    top: `${top}px`,
                                                    height: `${height}px`,
                                                    minHeight: '24px'
                                                }}
                                            >
                                                <div className="flex font-bold text-[10px] md:text-[11px] leading-tight items-start gap-1">
                                                    <Icon size={12} className="shrink-0 mt-0.5 opacity-70" />
                                                    <span className="truncate">{draggingEvent.title.replace(/^\[.*?\]\s*/, '')}</span>
                                                </div>
                                                <div className="text-[10px] opacity-90 mt-0.5 truncate font-bold text-center">
                                                    {decimalToTime(dragGhostState.startDec)} - {decimalToTime(dragGhostState.startDec + dragGhostState.durationDec)}
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
