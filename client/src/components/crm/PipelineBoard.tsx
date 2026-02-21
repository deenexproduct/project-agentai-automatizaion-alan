import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { getDealsPipeline, updateDeal, DealData } from '../../services/crm.service';
import { Settings, Plus, DollarSign, Calendar, Clock, CheckSquare, Users, Building2, Columns3, Briefcase } from 'lucide-react';
import { formatToArgentineDate } from '../../utils/date';
import DealFormDrawer from './DealFormDrawer';
import PremiumHeader from './PremiumHeader';
import OwnerAvatar from '../common/OwnerAvatar';

interface StageData {
    key: string;
    label: string;
    color: string;
    deals: DealData[];
}

export default function PipelineBoard() {
    const [stages, setStages] = useState<StageData[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [editingDeal, setEditingDeal] = useState<DealData | null>(null);
    const [search, setSearch] = useState('');

    const loadPipeline = async () => {
        setLoading(true);
        try {
            const res = await getDealsPipeline();
            setStages(res.stages);
        } catch (error) {
            console.error("Failed to load pipeline", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPipeline();
    }, []);

    const onDragEnd = async (result: DropResult) => {
        const { source, destination, draggableId } = result;
        if (!destination) return;
        if (source.droppableId === destination.droppableId && source.index === destination.index) return;

        const fromStageKey = source.droppableId;
        const toStageKey = destination.droppableId;

        // Optimistic update
        setStages(prev => {
            const newStages = [...prev];
            const fromStageIdx = newStages.findIndex(s => s.key === fromStageKey);
            const toStageIdx = newStages.findIndex(s => s.key === toStageKey);

            const fromStage = newStages[fromStageIdx];
            const toStage = newStages[toStageIdx];

            const dealToMove = fromStage.deals.find(d => d._id === draggableId);
            if (!dealToMove) return prev;

            // Remove from source
            const newFromDeals = [...fromStage.deals];
            const sourceIndex = newFromDeals.findIndex(d => d._id === draggableId);
            if (sourceIndex !== -1) newFromDeals.splice(sourceIndex, 1);
            newStages[fromStageIdx] = { ...fromStage, deals: newFromDeals };

            // Add to destination
            const newToDeals = [...toStage.deals];
            const updatedDeal = { ...dealToMove, status: toStageKey };

            if (fromStageKey === toStageKey) {
                newFromDeals.splice(destination.index, 0, updatedDeal);
                newStages[fromStageIdx] = { ...fromStage, deals: newFromDeals };
            } else {
                newToDeals.splice(destination.index, 0, updatedDeal);
                newStages[toStageIdx] = { ...toStage, deals: newToDeals };
            }

            return newStages;
        });

        // Sync to backend if column changed
        if (fromStageKey !== toStageKey) {
            try {
                await updateDeal(draggableId, { status: toStageKey });
                loadPipeline(); // Fetch to get new statusHistory
            } catch (error) {
                console.error("Failed to update deal status", error);
                loadPipeline(); // Revert on failure
            }
        }
    };

    const handleAddDeal = (stageKey?: string) => {
        setEditingDeal(stageKey ? { status: stageKey } as DealData : null);
        setIsDrawerOpen(true);
    };

    const handleEditDeal = (deal: DealData, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingDeal(deal);
        setIsDrawerOpen(true);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] min-h-[500px] relative mt-4">
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
                    onAdd={() => handleAddDeal()}
                    addLabel="Nuevo Deal"
                    containerClassName="px-5 py-2.5 !border-none !shadow-none bg-transparent"
                >
                    <div className="flex gap-2 items-center mx-2">
                        <div className="px-3 py-1.5 bg-emerald-50/80 border border-emerald-100 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8)] rounded-[12px] text-[12px] font-bold text-emerald-700 flex items-center gap-1.5 transition-all hover:bg-emerald-100/80 whitespace-nowrap">
                            <DollarSign size={14} strokeWidth={2.5} className="text-emerald-500" />
                            {stages.reduce((acc, stage) => acc + stage.deals.reduce((sum, d) => sum + (d.value || 0), 0), 0).toLocaleString()} <span className="text-emerald-500/70 font-medium">en juego</span>
                        </div>
                        <div className="px-3 py-1.5 bg-blue-50/80 border border-blue-100 shadow-[inset_0_1px_2px_rgba(255,255,255,0.8)] rounded-[12px] text-[12px] font-bold text-blue-700 flex items-center gap-1.5 transition-all hover:bg-blue-100/80 whitespace-nowrap">
                            <Building2 size={14} strokeWidth={2.5} className="text-blue-500" />
                            {stages.reduce((acc, stage) => acc + stage.deals.reduce((sum, d) => sum + (d.company?.localesCount || 0), 0), 0).toLocaleString()} <span className="text-blue-500/70 font-medium">locales</span>
                        </div>
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
                    <DragDropContext onDragEnd={onDragEnd}>
                        <div className="flex gap-4 h-full min-w-max">
                            {stages.map(stage => (
                                <div
                                    key={stage.key}
                                    className="flex flex-col w-[320px] rounded-[28px] h-full border border-white/60 overflow-hidden"
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.45)',
                                        backdropFilter: 'blur(24px)',
                                        WebkitBackdropFilter: 'blur(24px)',
                                        boxShadow: '0 8px 32px rgba(30, 27, 75, 0.04)'
                                    }}
                                >
                                    {/* Column Header */}
                                    <div className="flex flex-col px-4 py-3.5 border-b border-white/60 bg-white/40 backdrop-blur-md shrink-0">
                                        <div className="flex items-center justify-between w-full">
                                            <div className="flex items-center gap-2 shrink-0 pr-2">
                                                <div className="w-3.5 h-3.5 rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.1)] border border-white/50" style={{ backgroundColor: stage.color }} />
                                                <h3 className="font-bold text-[14px] text-slate-800 tracking-tight truncate max-w-[110px]" title={stage.label}>{stage.label}</h3>
                                            </div>
                                            <div className="flex items-center rounded-[8px] overflow-hidden border border-white/60 shadow-sm shrink-0">
                                                <div className="flex items-center justify-center gap-1 px-1.5 text-[10px] font-bold text-violet-700 bg-violet-50/90 backdrop-blur-md py-1 border-r border-white/40" title="Deals Totales">
                                                    <Briefcase size={10} />
                                                    {stage.deals.length}
                                                </div>
                                                <div className="flex items-center justify-center gap-1 px-1.5 text-[10px] font-bold text-emerald-700 bg-emerald-50/90 backdrop-blur-md py-1 border-r border-white/40" title="Valor del Pipeline">
                                                    <DollarSign size={10} />
                                                    {stage.deals.reduce((sum, d) => sum + (d.value || 0), 0).toLocaleString()}
                                                </div>
                                                <div className="flex items-center justify-center gap-1 px-1.5 text-[10px] font-bold text-blue-700 bg-blue-50/90 backdrop-blur-md py-1" title="Cantidad de Locales">
                                                    <Building2 size={10} />
                                                    {stage.deals.reduce((sum, d) => sum + (d.company?.localesCount || 0), 0).toLocaleString()}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Droppable Area */}
                                    <Droppable droppableId={stage.key}>
                                        {(provided, snapshot) => (
                                            <div
                                                ref={provided.innerRef}
                                                {...provided.droppableProps}
                                                className="flex-1 overflow-y-auto overflow-x-hidden p-3 custom-scrollbar transition-colors duration-300"
                                                style={{
                                                    background: snapshot.isDraggingOver ? `${stage.color}15` : 'transparent'
                                                }}
                                            >
                                                {stage.deals.length === 0 && !snapshot.isDraggingOver && (
                                                    <div className="h-full flex items-center justify-center pt-8">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleAddDeal(stage.key); }}
                                                            className="w-14 h-14 rounded-[20px] bg-white/40 border-2 border-dashed border-white/80 flex items-center justify-center shadow-inner hover:bg-white/60 transition-all duration-300 cursor-pointer group hover:-translate-y-1 hover:shadow-md hover:border-violet-300"
                                                        >
                                                            <Plus size={24} className="text-slate-400 group-hover:text-violet-500 transition-colors" />
                                                        </button>
                                                    </div>
                                                )}

                                                {stage.deals
                                                    .filter(d => !search ||
                                                        (d.title || '').toLowerCase().includes(search.toLowerCase()) ||
                                                        (d.company?.name || '').toLowerCase().includes(search.toLowerCase()) ||
                                                        (d.primaryContact?.fullName || '').toLowerCase().includes(search.toLowerCase())
                                                    )
                                                    .map((deal, index) => (
                                                        <Draggable key={deal._id} draggableId={deal._id} index={index}>
                                                            {(dragProvided, dragSnapshot) => (
                                                                <div
                                                                    ref={dragProvided.innerRef}
                                                                    {...dragProvided.draggableProps}
                                                                    {...dragProvided.dragHandleProps}
                                                                    onClick={(e) => handleEditDeal(deal, e)}
                                                                    className={`bg-white rounded-[20px] p-5 mb-3 border ${dragSnapshot.isDragging ? 'border-violet-300 shadow-[0_20px_60px_rgba(139,92,246,0.15)] scale-[1.02] rotate-1 z-50' : 'border-slate-100 shadow-[0_2px_12px_rgba(30,27,75,0.02)] hover:border-violet-200/60 hover:shadow-[0_8px_30px_rgba(139,92,246,0.06)] hover:-translate-y-1'} transition-all duration-300 group cursor-pointer relative overflow-hidden`}
                                                                >
                                                                    {/* Hover Gradient Overlay Minimal */}
                                                                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-violet-500/5 to-transparent opacity-0 group-hover:opacity-100 rounded-bl-full transition-opacity duration-500 -z-0 blur-xl pointer-events-none" />

                                                                    <div className="relative z-10">
                                                                        <div className="flex justify-between items-center mb-4">
                                                                            <div className="text-[10px] font-bold px-2.5 py-1 rounded-[8px] uppercase tracking-wider bg-slate-50 text-slate-400 border border-slate-200/40" title="Días en esta etapa">
                                                                                {deal.daysInStatus || 0} Días
                                                                            </div>
                                                                            <div className="font-bold text-emerald-600 font-mono text-[14px] tracking-tight bg-emerald-50/40 px-3 py-1 rounded-[8px] border border-emerald-100/40">
                                                                                ${deal.value?.toLocaleString() || 0}
                                                                            </div>
                                                                        </div>

                                                                        <div className="flex items-start gap-3 mb-4">
                                                                            <div className="w-8 h-8 rounded-[8px] border border-slate-200/80 bg-white/80 flex items-center justify-center shadow-sm shrink-0 overflow-hidden backdrop-blur-md relative mt-0.5" title={deal.company?.name || deal.primaryContact?.fullName || deal.title}>
                                                                                {deal.company?.logo || deal.primaryContact?.profilePhotoUrl ? (
                                                                                    <img
                                                                                        src={deal.company?.logo || deal.primaryContact?.profilePhotoUrl}
                                                                                        alt="Logo"
                                                                                        className="w-full h-full object-contain p-0.5 absolute inset-0 z-10"
                                                                                        style={{ backgroundColor: deal.company?.themeColor || 'transparent' }}
                                                                                        onError={(e) => {
                                                                                            e.currentTarget.style.display = 'none';
                                                                                            const spanFallback = e.currentTarget.parentElement?.querySelector('span');
                                                                                            if (spanFallback) spanFallback.style.display = 'block';
                                                                                        }}
                                                                                    />
                                                                                ) : null}
                                                                                <span className="font-bold text-[13px] text-slate-600 uppercase relative z-0" style={{ display: (deal.company?.logo || deal.primaryContact?.profilePhotoUrl) ? 'none' : 'block' }}>
                                                                                    {(deal.company?.name || deal.primaryContact?.fullName || deal.title || '?').charAt(0)}
                                                                                </span>
                                                                            </div>
                                                                            <h4 className="font-extrabold text-slate-800 text-[16px] leading-snug group-hover:text-violet-700 transition-colors pt-1">
                                                                                {deal.company?.name || deal.primaryContact?.fullName || deal.title}
                                                                            </h4>
                                                                        </div>

                                                                        <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-auto">
                                                                            <div className="flex items-center gap-2">
                                                                                <div className="flex items-center gap-1.5 text-[12px] font-bold text-slate-500 bg-white border border-slate-200/40 px-3 py-1.5 rounded-[8px]">
                                                                                    <Calendar size={13} className="text-slate-400" />
                                                                                    {new Date(deal.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                                                                                </div>
                                                                                {deal.company?.localesCount !== undefined && deal.company.localesCount > 0 && (
                                                                                    <div className="flex items-center gap-1.5 text-[12px] font-bold text-blue-600 bg-blue-50/50 border border-blue-100/50 px-3 py-1.5 rounded-[8px]">
                                                                                        <Building2 size={13} className="text-blue-500" />
                                                                                        {deal.company.localesCount} Local{deal.company.localesCount !== 1 && 'es'}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            {deal.pendingTasks !== undefined && deal.pendingTasks > 0 && (
                                                                                <div className="px-2.5 py-1.5 rounded-[8px] border border-amber-200/40 text-amber-600 flex items-center justify-center text-[12px] font-bold" title={`${deal.pendingTasks} tareas pendientes`}>
                                                                                    <CheckSquare size={13} className="mr-1.5 text-amber-500" />{deal.pendingTasks}
                                                                                </div>
                                                                            )}
                                                                            <OwnerAvatar name={deal.assignedTo?.name} profilePhotoUrl={deal.assignedTo?.profilePhotoUrl} size="xs" />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </Draggable>
                                                    ))}
                                                {provided.placeholder}
                                            </div>
                                        )}
                                    </Droppable>
                                </div>
                            ))}
                        </div>
                    </DragDropContext>
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
                onClose={() => setIsDrawerOpen(false)}
                onSaved={loadPipeline}
            />
        </div>
    );
}
