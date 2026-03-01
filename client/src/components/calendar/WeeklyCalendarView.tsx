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
    const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
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

                                        // 3. Assign layout: side-by-side for small clusters, stacked rows for dense ones
                                        // The user requested side-by-side for all overlaps (e.g., 4 items = 25% width each)
                                        const DENSE_THRESHOLD = 100;
                                        const ROW_HEIGHT = 24; // px per stacked row
                                        const ROW_GAP = 2; // px gap between rows

                                        const eventLayout = new Map<string, { col: number; totalCols: number; stacked: boolean; stackIndex: number; stackTotal: number; clusterStartDec: number; clusterEndDec: number; overflowed: boolean }>();

                                        for (const cluster of clusters) {
                                            if (cluster.length >= DENSE_THRESHOLD) {
                                                const cStart = Math.min(...cluster.map(i => i.startDec));
                                                const cEnd = Math.max(...cluster.map(i => i.endDec));
                                                // Calculate how many rows fit in the cluster's time range
                                                const clusterHeightPx = (cEnd - cStart) * PIXELS_PER_HOUR;
                                                const maxVisibleRows = Math.max(2, Math.floor(clusterHeightPx / (ROW_HEIGHT + ROW_GAP)));

                                                cluster.forEach((item, idx) => {
                                                    eventLayout.set(item.event._id, {
                                                        col: 0, totalCols: 1,
                                                        stacked: true, stackIndex: idx, stackTotal: cluster.length,
                                                        clusterStartDec: cStart, clusterEndDec: cEnd,
                                                        overflowed: idx >= maxVisibleRows
                                                    });
                                                });
                                            } else {
                                                const cols: (typeof processed)[] = [];
                                                for (const item of cluster) {
                                                    let placed = false;
                                                    for (let i = 0; i < cols.length; i++) {
                                                        const colLastItem = cols[i][cols[i].length - 1];
                                                        if (colLastItem.endDec <= item.startDec + 0.01) {
                                                            cols[i].push(item);
                                                            eventLayout.set(item.event._id, { col: i, totalCols: 0, stacked: false, stackIndex: 0, stackTotal: 0, clusterStartDec: 0, clusterEndDec: 0, overflowed: false });
                                                            placed = true;
                                                            break;
                                                        }
                                                    }
                                                    if (!placed) {
                                                        cols.push([item]);
                                                        eventLayout.set(item.event._id, { col: cols.length - 1, totalCols: 0, stacked: false, stackIndex: 0, stackTotal: 0, clusterStartDec: 0, clusterEndDec: 0, overflowed: false });
                                                    }
                                                }
                                                for (const item of cluster) {
                                                    const el = eventLayout.get(item.event._id)!;
                                                    el.totalCols = cols.length;
                                                }
                                            }
                                        }

                                        // Calculate "+N more" badges for overflowed clusters
                                        const overflowBadges: { top: number; count: number; clusterKey: string }[] = [];
                                        const processedClusters = new Set<string>();
                                        for (const cluster of clusters) {
                                            if (cluster.length >= DENSE_THRESHOLD) {
                                                const cStart = Math.min(...cluster.map(i => i.startDec));
                                                const cEnd = Math.max(...cluster.map(i => i.endDec));
                                                const clusterKey = `${cStart}-${cEnd}`;
                                                if (!processedClusters.has(clusterKey)) {
                                                    processedClusters.add(clusterKey);
                                                    const clusterHeightPx = (cEnd - cStart) * PIXELS_PER_HOUR;
                                                    const maxVisibleRows = Math.max(2, Math.floor(clusterHeightPx / (ROW_HEIGHT + ROW_GAP)));
                                                    const overflowCount = cluster.length - maxVisibleRows;
                                                    if (overflowCount > 0) {
                                                        const badgeTop = (cStart - 7) * PIXELS_PER_HOUR + maxVisibleRows * (ROW_HEIGHT + ROW_GAP);
                                                        overflowBadges.push({ top: badgeTop, count: overflowCount, clusterKey });
                                                    }
                                                }
                                            }
                                        }

                                        // 4. Render events
                                        const renderedEvents = processed
                                            .filter(({ event }) => {
                                                const layout = eventLayout.get(event._id);
                                                if (!layout) return false;
                                                if (!layout.overflowed) return true;
                                                // Show overflowed events if their cluster is expanded
                                                const clusterKey = `${layout.clusterStartDec}-${layout.clusterEndDec}`;
                                                return expandedClusters.has(clusterKey);
                                            })
                                            .map(({ event, startDec, endDec }) => {
                                                const layout = eventLayout.get(event._id)!;

                                                let top: number, height: number, leftStyle: string, widthStyle: string;

                                                if (layout.stacked) {
                                                    const clusterTopPx = (layout.clusterStartDec - 7) * PIXELS_PER_HOUR;
                                                    top = clusterTopPx + layout.stackIndex * (ROW_HEIGHT + ROW_GAP);
                                                    height = ROW_HEIGHT;
                                                    leftStyle = '2px';
                                                    widthStyle = 'calc(100% - 4px)';
                                                } else {
                                                    const widthPercent = 100 / layout.totalCols;
                                                    const leftPercent = layout.col * widthPercent;
                                                    top = (startDec - 7) * PIXELS_PER_HOUR;
                                                    const maxBottom = (24 - 7) * PIXELS_PER_HOUR;
                                                    let calculatedHeight = (endDec - startDec) * PIXELS_PER_HOUR;
                                                    if (calculatedHeight < 14) calculatedHeight = 14; // Minimum clickable height
                                                    height = Math.min(calculatedHeight, maxBottom - top);
                                                    leftStyle = `calc(${leftPercent}% + 2px)`;
                                                    widthStyle = `calc(${widthPercent}% - 4px)`;
                                                }

                                                // Color system
                                                let bgClass = 'bg-amber-50', borderClass = 'border-amber-200', leftBorderClass = 'border-l-amber-500', textClass = 'text-amber-800', hoverBg = 'hover:bg-amber-100';
                                                let Icon = MapPin;
                                                if (event.type === 'meet') {
                                                    bgClass = 'bg-violet-50'; borderClass = 'border-violet-200'; leftBorderClass = 'border-l-violet-500'; textClass = 'text-violet-800'; hoverBg = 'hover:bg-violet-100';
                                                    Icon = Video;
                                                } else if (event.type === 'task') {
                                                    bgClass = 'bg-emerald-50'; borderClass = 'border-emerald-200'; leftBorderClass = 'border-l-emerald-500'; textClass = 'text-emerald-800'; hoverBg = 'hover:bg-emerald-100';
                                                    Icon = CheckSquare;
                                                }

                                                const isBeingDragged = draggingEvent?._id === event._id;
                                                const isStacked = layout.stacked;
                                                const isVerySmall = height < 20 && !isStacked;
                                                const displayTitle = event.title.replace(/\[.*?\]/g, '').trim();

                                                // Extract contact name for inline display
                                                const contactName = event.linkedTo?.contacts?.length
                                                    ? event.linkedTo.contacts[0].fullName
                                                    : (event.linkedTo?.contact as any)?.fullName || '';

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
                                                            if (e.button !== 0 || !onEventDrop) return;
                                                            e.stopPropagation();
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
                                                        className={`group absolute rounded-md border ${isStacked ? 'border-l-[3px]' : 'border-l-4'} ${bgClass} ${borderClass} ${leftBorderClass} ${textClass} ${hoverBg} shadow-sm ${isStacked ? 'px-1.5 py-0' : (isVerySmall ? 'px-1.5 py-0.5' : 'px-2 py-1')} text-xs transition-all duration-150 ease-out z-20 hover:!z-[70] hover:!w-max hover:!max-w-[280px] hover:!h-auto hover:!min-w-[100%] hover:shadow-lg hover:shadow-black/10 overflow-hidden hover:!overflow-visible hover:!py-2 hover:!px-2.5 hover:!rounded-lg ${isBeingDragged ? 'opacity-40 ring-2 ring-violet-400 cursor-grabbing shadow-lg scale-[0.97]' : 'cursor-grab active:cursor-grabbing'}`}
                                                        style={{
                                                            top: `${top}px`,
                                                            height: `${height}px`,
                                                            minHeight: isStacked ? '22px' : '14px',
                                                            left: leftStyle,
                                                            width: widthStyle
                                                        }}
                                                    >
                                                        {/* Main line: icon + title + optional contact tag */}
                                                        <div className={`flex font-semibold ${isStacked || isVerySmall ? 'text-[10px]' : 'text-[11px]'} leading-tight items-center gap-1 overflow-hidden ${isStacked || isVerySmall ? 'h-full' : ''}`}>
                                                            <Icon size={isStacked || isVerySmall ? 11 : 13} className="shrink-0 opacity-60" strokeWidth={2.5} />
                                                            <span className="truncate min-w-0 flex-1 group-hover:whitespace-normal group-hover:overflow-visible select-none">
                                                                {displayTitle}
                                                            </span>
                                                            {/* Inline contact pill on stacked rows to differentiate */}
                                                            {isStacked && contactName && (
                                                                <span className="shrink-0 text-[8px] font-medium opacity-50 bg-black/5 rounded px-1 py-0.5 truncate max-w-[80px] hidden md:inline select-none">
                                                                    {contactName.split(' ')[0]}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Time: always visible when card has space */}
                                                        {!isStacked && height >= 40 && (
                                                            <div className="text-[10px] opacity-70 mt-0.5 truncate font-medium select-none flex items-center gap-1">
                                                                <span>{event.startTime} - {event.endTime}</span>
                                                                {contactName && <span className="opacity-60">· {contactName}</span>}
                                                            </div>
                                                        )}

                                                        {/* Hover popover content */}
                                                        <div className="hidden group-hover:block mt-1 space-y-0.5">
                                                            <div className="text-[10px] opacity-80 font-medium select-none flex items-center gap-1">
                                                                <span>🕐</span>
                                                                <span>{event.startTime} - {event.endTime}</span>
                                                            </div>
                                                            {contactName && (
                                                                <div className="text-[10px] opacity-70 select-none flex items-center gap-1">
                                                                    <span>👤</span>
                                                                    <span>{event.linkedTo?.contacts?.map(c => c.fullName).join(', ') || contactName}</span>
                                                                </div>
                                                            )}
                                                            {event.linkedTo?.deal && (
                                                                <div className="text-[9px] opacity-60 select-none flex items-center gap-1">
                                                                    <span>💼</span>
                                                                    <span>{event.linkedTo.deal.title}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            });

                                        // Render "+N more" overflow badges (hidden once expanded)
                                        const badges = overflowBadges
                                            .filter(({ clusterKey }) => !expandedClusters.has(clusterKey))
                                            .map(({ top, count, clusterKey }) => (
                                                <div
                                                    key={`overflow-${clusterKey}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setExpandedClusters(prev => new Set([...prev, clusterKey]));
                                                    }}
                                                    className="absolute left-1 right-1 text-center text-[10px] font-semibold text-emerald-600 bg-emerald-50/80 border border-emerald-200 border-dashed rounded-md py-0.5 cursor-pointer hover:bg-emerald-100 transition-colors z-30 select-none"
                                                    style={{ top: `${top}px`, height: `${ROW_HEIGHT}px` }}
                                                >
                                                    +{count} más
                                                </div>
                                            ));

                                        return [...renderedEvents, ...badges];
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
