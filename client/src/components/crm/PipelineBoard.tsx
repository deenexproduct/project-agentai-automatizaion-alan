import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    closestCorners,
    useDroppable,
    type DragStartEvent,
    type DragEndEvent,
    type DragOverEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { getDealsPipeline, updateDeal, DealData } from '../../services/crm.service';
import { getOpsDealsGrouped, getOpsPipelineConfig, updateOpsDealStatus } from '../../services/ops.service';
import { Settings, Plus, DollarSign, Calendar, Clock, CheckSquare, Users, Building2, Columns3, Briefcase, Flame, CircleOff, User } from 'lucide-react';
import { formatToArgentineDate } from '../../utils/date';
import DealFormDrawer from './DealFormDrawer';
import PremiumHeader from './PremiumHeader';
import OwnerAvatar from '../common/OwnerAvatar';
import { useCompanyLogos } from '../../hooks/useCompanyLogos';

// Helper: extraer el userId del JWT almacenado en localStorage
function getCurrentUserId(): string | null {
    try {
        const token = localStorage.getItem('token');
        if (!token) return null;
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.userId || payload._id || payload.id || payload.sub || null;
    } catch { return null; }
}

// Tipos de filtros rápidos disponibles
type QuickFilter = 'focus_hoy' | 'huerfanos' | 'mios' | null;

interface StageData {
    key: string;
    label: string;
    color: string;
    deals: DealData[];
}

// ── DealCard — visual-only card (used in both SortableCard and DragOverlay) ──
interface DealCardVisualProps {
    deal: DealData;
    isDragging?: boolean;
    isOverlay?: boolean;
    onEdit?: (deal: DealData, e: React.MouseEvent) => void;
    cachedLogo?: { logo: string; themeColor?: string };
}

const DealCardVisual = memo(function DealCardVisual({ deal, isDragging, isOverlay, onEdit, cachedLogo }: DealCardVisualProps) {
    return (
        <div
            onClick={(e) => onEdit?.(deal, e)}
            className={`bg-white rounded-[20px] p-5 mb-3 border ${isOverlay
                ? 'border-violet-300 shadow-[0_20px_60px_rgba(139,92,246,0.25)] scale-[1.03] rotate-1 z-[999]'
                : isDragging
                    ? 'opacity-40 border-violet-200 shadow-none'
                    : 'border-slate-100 shadow-[0_2px_12px_rgba(30,27,75,0.02)] hover:border-violet-200/60 hover:shadow-[0_8px_30px_rgba(139,92,246,0.06)] hover:-translate-y-1'
                } transition-[transform,box-shadow,border-color,opacity] duration-150 group cursor-pointer relative overflow-hidden`}
            style={{
                borderLeftWidth: '3px',
                borderLeftColor: deal.alertLevel === 'red'
                    ? '#ef4444'
                    : deal.alertLevel === 'green'
                        ? '#4ade80'
                        : '#f59e0b',
            }}
        >
            {/* Hover glow — only when idle */}
            {!isDragging && !isOverlay && (
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-violet-500/5 to-transparent opacity-0 group-hover:opacity-100 rounded-bl-full transition-opacity duration-500 -z-0 blur-xl pointer-events-none" />
            )}

            <div className="relative z-10">
                <div className="flex items-start gap-3 mb-4">
                    <div className="relative">
                        <div className="w-8 h-8 rounded-[8px] border border-slate-200/80 bg-white/80 flex items-center justify-center shadow-sm shrink-0 overflow-hidden relative mt-0.5" title={deal.company?.name || deal.primaryContact?.fullName || deal.title}>
                            {cachedLogo?.logo ? (
                                <img
                                    src={cachedLogo.logo}
                                    alt="Logo"
                                    className="w-full h-full object-contain p-0.5 absolute inset-0 z-10"
                                    style={{ backgroundColor: cachedLogo.themeColor || 'transparent' }}
                                    onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                        const spanFallback = e.currentTarget.parentElement?.querySelector('span');
                                        if (spanFallback) (spanFallback as HTMLElement).style.display = 'block';
                                    }}
                                />
                            ) : null}
                            <span className="font-bold text-[13px] text-slate-600 uppercase relative z-0" style={{ display: cachedLogo?.logo ? 'none' : 'block' }}>
                                {(deal.company?.name || deal.primaryContact?.fullName || deal.title || '?').charAt(0)}
                            </span>
                        </div>
                        <div
                            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-[1.5px] border-white z-20 ${deal.alertLevel === 'red'
                                ? 'bg-red-500 animate-pulse'
                                : deal.alertLevel === 'green'
                                    ? 'bg-emerald-400'
                                    : 'bg-amber-400'
                                }`}
                            title={
                                deal.alertLevel === 'red'
                                    ? '⚠️ Tiene tareas atrasadas — acción inmediata'
                                    : deal.alertLevel === 'green'
                                        ? '✅ Tareas programadas a futuro'
                                        : '⚡ Sin tareas asignadas — requiere planificación'
                            }
                        />
                    </div>
                    <h4 className="font-extrabold text-slate-800 text-[16px] leading-snug group-hover:text-violet-700 transition-colors pt-1">
                        {deal.company?.name || deal.primaryContact?.fullName || deal.title}
                    </h4>
                </div>

                <div className="flex items-center flex-nowrap gap-1 pt-3 border-t border-slate-100 mt-auto overflow-hidden w-full">
                    <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold text-slate-500 bg-white border border-slate-200/40 px-1.5 py-1 rounded-[8px] shrink-0">
                        <Calendar size={12} className="text-slate-400 hidden sm:block" />
                        {new Date(deal.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                    </div>
                    <div className="text-[10px] sm:text-[11px] font-bold px-1.5 py-1 rounded-[8px] uppercase tracking-wider bg-slate-50 text-slate-400 border border-slate-200/40 shrink-0" title="Días en esta etapa">
                        {deal.daysInStatus || 0}d
                    </div>
                    {deal.company?.localesCount !== undefined && deal.company.localesCount > 0 && (
                        <div className="flex items-center gap-1 text-[10px] sm:text-[11px] font-bold text-blue-600 bg-blue-50/50 border border-blue-100/50 px-1.5 py-1 rounded-[8px] shrink-0">
                            <Building2 size={12} className="text-blue-500 hidden sm:block" />
                            {deal.company.localesCount}
                        </div>
                    )}
                    <div className="font-bold text-emerald-600 font-mono text-[10px] sm:text-[11px] tracking-tight bg-emerald-50/40 px-1.5 py-1 rounded-[8px] border border-emerald-100/40 shrink-0 truncate min-w-0">
                        ${deal.value?.toLocaleString() || 0}
                    </div>
                    {deal.pendingTasks !== undefined && deal.pendingTasks > 0 && (
                        <div className={`px-1.5 py-1 rounded-[8px] border flex items-center justify-center text-[10px] sm:text-[11px] font-bold shrink-0 ${deal.alertLevel === 'red'
                            ? 'border-red-200/60 text-red-600 bg-red-50/40'
                            : 'border-amber-200/40 text-amber-600'
                            }`} title={`${deal.pendingTasks} tareas pendientes`}>
                            <CheckSquare size={12} className={`mr-0.5 hidden sm:block ${deal.alertLevel === 'red' ? 'text-red-500' : 'text-amber-500'}`} />{deal.pendingTasks}
                        </div>
                    )}
                    <div className="ml-auto pl-1 shrink-0">
                        <OwnerAvatar name={deal.assignedTo?.name} profilePhotoUrl={deal.assignedTo?.profilePhotoUrl} size="xs" />
                    </div>
                </div>
            </div>
        </div>
    );
});

// ── SortableDealCard — wraps DealCardVisual with dnd-kit sortable ──
function SortableDealCard({ deal, onEdit, cachedLogo }: { deal: DealData; onEdit: (deal: DealData, e: React.MouseEvent) => void; cachedLogo?: { logo: string; themeColor?: string } }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: deal._id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <DealCardVisual deal={deal} isDragging={isDragging} onEdit={onEdit} cachedLogo={cachedLogo} />
        </div>
    );
}

// ── DroppableColumn — accepts drops using useDroppable ──
function DroppableColumn({
    stage,
    isOps,
    isDragOver,
    onAddDeal,
    onEditDeal,
    logoCache,
}: {
    stage: StageData;
    isOps: boolean;
    isDragOver: boolean;
    onAddDeal: (stageKey: string) => void;
    onEditDeal: (deal: DealData, e: React.MouseEvent) => void;
    logoCache: Record<string, { logo: string; themeColor?: string }>;
}) {
    const { setNodeRef } = useDroppable({ id: stage.key });

    return (
        <div
            className="flex flex-col w-[260px] md:w-[320px] rounded-[28px] h-full border overflow-hidden transition-colors duration-150"
            style={{
                background: isDragOver ? `${stage.color}12` : 'rgba(255, 255, 255, 0.45)',
                borderColor: isDragOver ? stage.color : 'rgba(255, 255, 255, 0.6)',
                boxShadow: '0 8px 32px rgba(30, 27, 75, 0.04)',
            }}
        >
            {/* Column Header */}
            <div className="flex flex-col px-4 py-3.5 border-b border-white/60 bg-white/40 shrink-0">
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2 shrink-0 pr-2">
                        <div className="w-3.5 h-3.5 rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.1)] border border-white/50" style={{ backgroundColor: stage.color }} />
                        <h3 className="font-bold text-[14px] text-slate-800 tracking-tight truncate max-w-[110px]" title={stage.label}>{stage.label}</h3>
                    </div>
                    <div className="flex items-center rounded-[8px] overflow-hidden border border-white/60 shadow-sm shrink-0">
                        <div className="flex items-center justify-center gap-1 px-1.5 text-[10px] font-bold text-violet-700 bg-violet-50/90 py-1 border-r border-white/40" title="Deals Totales">
                            <Briefcase size={10} />
                            {stage.deals.length}
                        </div>
                        <div className="flex items-center justify-center gap-1 px-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50/90 py-1 border-r border-white/40" title="Valor del Pipeline">
                            <DollarSign size={10} />
                            {stage.deals.reduce((sum, d) => sum + (d.value || 0), 0).toLocaleString()}
                        </div>
                        <div className="flex items-center justify-center gap-1 px-1.5 text-[10px] font-bold text-blue-700 bg-blue-50/90 py-1" title="Cantidad de Locales">
                            <Building2 size={10} />
                            {stage.deals.reduce((sum, d) => sum + (d.company?.localesCount || 0), 0).toLocaleString()}
                        </div>
                    </div>
                </div>
            </div>

            {/* Droppable Area — useDroppable makes empty columns accept drops */}
            <SortableContext items={stage.deals.map(d => d._id)} strategy={verticalListSortingStrategy}>
                <div ref={setNodeRef} className="flex-1 overflow-y-auto overflow-x-hidden p-3 custom-scrollbar min-h-[80px]">
                    {stage.deals.length === 0 && !isOps && (
                        <div className="h-full flex items-center justify-center pt-8">
                            <button
                                onClick={(e) => { e.stopPropagation(); onAddDeal(stage.key); }}
                                className="w-14 h-14 rounded-[20px] bg-white/40 border-2 border-dashed border-white/80 flex items-center justify-center shadow-inner hover:bg-white/60 transition-all duration-300 cursor-pointer group hover:-translate-y-1 hover:shadow-md hover:border-violet-300"
                            >
                                <Plus size={24} className="text-slate-400 group-hover:text-violet-500 transition-colors" />
                            </button>
                        </div>
                    )}
                    {stage.deals.map((deal) => (
                        <SortableDealCard key={deal._id} deal={deal} onEdit={onEditDeal} cachedLogo={deal.company?._id ? logoCache[deal.company._id] : undefined} />
                    ))}
                </div>
            </SortableContext>
        </div>
    );
}

export default function PipelineBoard({ urlDealId, platform }: { urlDealId?: string, platform?: 'comercial' | 'operaciones' }) {
    const isOps = platform === 'operaciones';
    const basePath = isOps ? '/ops/pipeline' : '/linkedin/pipeline';
    const [stages, setStages] = useState<StageData[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [editingDeal, setEditingDeal] = useState<DealData | null>(null);
    const [search, setSearch] = useState('');
    const [activeFilter, setActiveFilter] = useState<QuickFilter>(null);
    const [activeDeal, setActiveDeal] = useState<DealData | null>(null);
    const [overColumnKey, setOverColumnKey] = useState<string | null>(null);
    const navigate = useNavigate();
    const currentUserId = useMemo(() => getCurrentUserId(), []);

    // Extract company IDs from all deals for logo caching
    const companyIds = useMemo(() => {
        const ids = new Set<string>();
        for (const stage of stages) {
            for (const deal of stage.deals) {
                if (deal.company?._id) ids.add(deal.company._id);
            }
        }
        return Array.from(ids);
    }, [stages]);
    const logoCache = useCompanyLogos(companyIds);

    // dnd-kit sensor — requires 5px movement before starting drag (prevents accidental drags on click)
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 5 },
        })
    );

    // Función de filtro centralizada: se aplica a TODOS los deals en el pipeline
    const applyDealFilter = useMemo(() => {
        return (d: DealData) => {
            // Filtro de búsqueda por texto
            if (search && !(
                (d.title || '').toLowerCase().includes(search.toLowerCase()) ||
                (d.company?.name || '').toLowerCase().includes(search.toLowerCase()) ||
                (d.primaryContact?.fullName || '').toLowerCase().includes(search.toLowerCase())
            )) return false;
            // Filtros rápidos del semáforo
            if (activeFilter === 'focus_hoy') return d.alertLevel === 'red';
            if (activeFilter === 'huerfanos') return d.alertLevel === 'yellow';
            if (activeFilter === 'mios') return d.assignedTo?._id === currentUserId || d.userId?._id === currentUserId;
            return true;
        };
    }, [search, activeFilter, currentUserId]);

    // Stages con deals filtrados — se usa para renderar TODO el pipeline
    const filteredStages = useMemo(() => {
        return stages.map(stage => ({
            ...stage,
            deals: stage.deals.filter(applyDealFilter),
        }));
    }, [stages, applyDealFilter]);

    // Deep-linking effect
    useEffect(() => {
        if (urlDealId) {
            setEditingDeal({ _id: urlDealId } as any);
            setIsDrawerOpen(true);
        } else if (isDrawerOpen && editingDeal?._id) {
            setIsDrawerOpen(false);
            setEditingDeal(null);
        }
    }, [urlDealId]);

    const loadPipeline = useCallback(async () => {
        setLoading(true);
        try {
            if (isOps) {
                const [configData, groupedData] = await Promise.all([
                    getOpsPipelineConfig(),
                    getOpsDealsGrouped(),
                ]);
                const opsStages: StageData[] = (configData.stages || []).map((s: any) => ({
                    key: s.key,
                    label: s.label,
                    color: s.color || '#6366f1',
                    deals: (groupedData[s.key] || []) as DealData[],
                }));
                setStages(opsStages);
            } else {
                const res = await getDealsPipeline();
                setStages(res.stages);
            }
        } catch (error) {
            console.error("Failed to load pipeline", error);
        } finally {
            setLoading(false);
        }
    }, [isOps]);

    useEffect(() => {
        loadPipeline();
    }, []);

    // ── dnd-kit handlers ──
    // Find which stage a deal belongs to
    const findStageOfDeal = useCallback((dealId: string): string | null => {
        for (const stage of stages) {
            if (stage.deals.some(d => d._id === dealId)) return stage.key;
        }
        return null;
    }, [stages]);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const dealId = event.active.id as string;
        // Find the deal object
        for (const stage of stages) {
            const deal = stage.deals.find(d => d._id === dealId);
            if (deal) {
                setActiveDeal(deal);
                break;
            }
        }
    }, [stages]);

    const handleDragOver = useCallback((event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) {
            setOverColumnKey(null);
            return;
        }

        const activeId = active.id as string;
        const overId = over.id as string;

        // Determine which column we're dragging over
        const activeStage = findStageOfDeal(activeId);

        // Check if over is a column (stage key) or another deal
        let overStage = findStageOfDeal(overId);
        if (!overStage) {
            // overId might be a column key directly (empty column)
            overStage = stages.find(s => s.key === overId)?.key || null;
        }

        setOverColumnKey(overStage);

        if (!activeStage || !overStage || activeStage === overStage) return;

        // Move deal between columns in real-time
        setStages(prev => {
            const newStages = [...prev];
            const fromIdx = newStages.findIndex(s => s.key === activeStage);
            const toIdx = newStages.findIndex(s => s.key === overStage);
            if (fromIdx === -1 || toIdx === -1) return prev;

            const fromStage = newStages[fromIdx];
            const dealToMove = fromStage.deals.find(d => d._id === activeId);
            if (!dealToMove) return prev;

            // Remove from source
            newStages[fromIdx] = {
                ...fromStage,
                deals: fromStage.deals.filter(d => d._id !== activeId),
            };

            // Add to destination
            const toStage = newStages[toIdx];
            const overIndex = toStage.deals.findIndex(d => d._id === overId);
            const newToDeals = [...toStage.deals];
            const updatedDeal = { ...dealToMove, status: overStage };

            if (overIndex >= 0) {
                newToDeals.splice(overIndex, 0, updatedDeal);
            } else {
                newToDeals.push(updatedDeal);
            }
            newStages[toIdx] = { ...toStage, deals: newToDeals };

            return newStages;
        });
    }, [findStageOfDeal, stages]);

    const handleDragEnd = useCallback(async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveDeal(null);
        setOverColumnKey(null);

        if (!over) return;

        const activeId = active.id as string;
        const currentStage = findStageOfDeal(activeId);

        // Find the original stage from before the drag started
        // We need to check if the deal moved columns — compare with what we tracked
        const deal = activeDeal;
        if (!deal || !currentStage) return;

        const originalStage = deal.status;
        if (originalStage !== currentStage) {
            // Column changed — sync to backend
            try {
                await (isOps ? updateOpsDealStatus(activeId, currentStage) : updateDeal(activeId, { status: currentStage }));
            } catch (error) {
                console.error("Failed to update deal status", error);
                loadPipeline(); // Revert on failure
            }
        }
    }, [isOps, loadPipeline, findStageOfDeal, activeDeal]);

    const handleAddDeal = (stageKey?: string) => {
        setEditingDeal(stageKey ? { status: stageKey } as DealData : null);
        setIsDrawerOpen(true);
        if (urlDealId) navigate(basePath);
    };

    const handleEditDeal = useCallback((deal: DealData, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        navigate(`${basePath}/${deal._id}`);
    }, [basePath, navigate]);

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] min-h-[500px] relative mt-4 pb-20 md:pb-0">
            {/* Atmospheric Background Effects */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[32px] -z-10 bg-slate-50/30">
                <div className="absolute -top-[20%] -left-[10%] w-[70vw] h-[70vw] rounded-full bg-gradient-to-br from-violet-400/20 to-fuchsia-400/20 blur-[120px] mix-blend-multiply opacity-70 animate-[pulse_15s_ease-in-out_infinite_reverse]" />
                <div className="absolute top-[20%] -right-[10%] w-[60vw] h-[60vw] rounded-full bg-gradient-to-tl from-blue-400/20 to-emerald-400/20 blur-[120px] mix-blend-multiply opacity-60 animate-[pulse_20s_ease-in-out_infinite]" />
                <div className="absolute -bottom-[20%] left-[20%] w-[80vw] h-[60vw] rounded-full bg-gradient-to-t from-slate-200/50 to-transparent blur-[100px] opacity-80" />
            </div>

            {/* Premium Header Reutilizable */}
            <div className="shrink-0 z-10 bg-white/40 backdrop-blur-2xl rounded-[24px] overflow-hidden mb-4 border border-white/60 shadow-[0_8px_32px_rgba(30,27,75,0.05)]">
                <PremiumHeader
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder="Buscar deal por título, empresa..."
                    onAdd={isOps ? undefined : () => handleAddDeal()}
                    addLabel={isOps ? undefined : "Nuevo Deal"}
                    containerClassName="px-5 py-2.5 !border-none !shadow-none bg-transparent"
                >
                    <div className="hidden md:flex gap-2 items-center mx-2">
                        <div className="px-3 py-1.5 bg-emerald-50/80 border border-emerald-100 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8)] rounded-[12px] text-[12px] font-bold text-emerald-700 flex items-center gap-1.5 transition-all hover:bg-emerald-100/80 whitespace-nowrap">
                            <DollarSign size={14} strokeWidth={2.5} className="text-emerald-500" />
                            {filteredStages.filter(s => {
                                const k = s.key.toLowerCase();
                                return !k.includes('perdid') && !k.includes('lost') && k !== 'pausado';
                            }).reduce((acc, stage) => acc + stage.deals.reduce((sum, d) => sum + (d.value || 0), 0), 0).toLocaleString()} <span className="text-emerald-500/70 font-medium">en juego</span>
                        </div>
                        <div className="px-3 py-1.5 bg-blue-50/80 border border-blue-100 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8)] rounded-[12px] text-[12px] font-bold text-blue-700 flex items-center gap-1.5 transition-all hover:bg-blue-100/80 whitespace-nowrap">
                            <Building2 size={14} strokeWidth={2.5} className="text-blue-500" />
                            {filteredStages.reduce((acc, stage) => acc + stage.deals.reduce((sum, d) => sum + (d.company?.localesCount || 0), 0), 0).toLocaleString()} <span className="text-blue-500/70 font-medium">locales</span>
                        </div>
                    </div>
                    {/* Filtros rápidos del pipeline */}
                    <div className="flex gap-1.5 items-center ml-1">
                        {([
                            { key: 'focus_hoy' as QuickFilter, label: 'Focus Hoy', icon: Flame, activeColors: 'bg-red-50 border-red-200 text-red-700', iconColor: 'text-red-500', tooltip: 'Deals con tareas atrasadas' },
                            { key: 'huerfanos' as QuickFilter, label: 'Huérfanos', icon: CircleOff, activeColors: 'bg-amber-50 border-amber-200 text-amber-700', iconColor: 'text-amber-500', tooltip: 'Deals sin tareas asignadas' },
                            { key: 'mios' as QuickFilter, label: 'Míos', icon: User, activeColors: 'bg-violet-50 border-violet-200 text-violet-700', iconColor: 'text-violet-500', tooltip: 'Deals asignados a mí' },
                        ]).map(f => (
                            <button
                                key={f.key}
                                onClick={() => setActiveFilter(prev => prev === f.key ? null : f.key)}
                                title={f.tooltip}
                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-[10px] text-[11px] font-bold border transition-all duration-200 whitespace-nowrap cursor-pointer ${activeFilter === f.key
                                    ? `${f.activeColors} shadow-sm`
                                    : 'bg-white/60 border-slate-200/50 text-slate-500 hover:bg-white hover:border-slate-300 hover:text-slate-700'
                                    }`}
                            >
                                <f.icon size={13} strokeWidth={2.5} className={activeFilter === f.key ? f.iconColor : 'text-slate-400'} />
                                <span className="hidden lg:inline">{f.label}</span>
                            </button>
                        ))}
                    </div>
                </PremiumHeader>
            </div>

            {/* Board */}
            {loading ? (
                <div className="flex-1 flex items-center justify-center bg-white/30 backdrop-blur-xl rounded-[32px] border border-white/60 shadow-[0_8px_32px_rgba(30,27,75,0.05)] mt-2">
                    <div className="relative">
                        <div className="absolute inset-0 bg-violet-500/20 rounded-full blur-xl animate-pulse" />
                        <div className="animate-spin w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full relative z-10" />
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar pb-4 rounded-[24px]">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCorners}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDragEnd={handleDragEnd}
                    >
                        <div className="flex gap-4 h-full min-w-max">
                            {filteredStages.map(stage => (
                                <DroppableColumn
                                    key={stage.key}
                                    stage={stage}
                                    isOps={isOps}
                                    isDragOver={overColumnKey === stage.key}
                                    onAddDeal={handleAddDeal}
                                    onEditDeal={handleEditDeal}
                                    logoCache={logoCache}
                                />
                            ))}
                        </div>

                        {/* DragOverlay renders the dragged card in a portal — outside the blur context, no layout recalculation */}
                        <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
                            {activeDeal ? (
                                <div style={{ width: 280 }}>
                                    <DealCardVisual deal={activeDeal} isOverlay cachedLogo={activeDeal.company?._id ? logoCache[activeDeal.company._id] : undefined} />
                                </div>
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                </div>
            )}

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 8px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(139, 92, 246, 0.2); border-radius: 10px; }
                .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: rgba(139, 92, 246, 0.4); }
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

            <DealFormDrawer
                open={isDrawerOpen}
                deal={editingDeal}
                stages={stages.map(s => ({ key: s.key, label: s.label }))}
                onClose={() => {
                    setIsDrawerOpen(false);
                    if (urlDealId) navigate(basePath);
                }}
                onSaved={loadPipeline}
            />
        </div>
    );
}
