import { useState, useEffect, useCallback } from 'react';
import { Loader2, Building2, User, ChevronRight, GripVertical } from 'lucide-react';
import { getOpsDealsGrouped, getOpsPipelineConfig, updateOpsDealStatus } from '../../services/ops.service';

interface OpsStage {
    key: string;
    label: string;
    emoji: string;
    color: string;
    order: number;
    duration: string;
    description: string;
    isActive?: boolean;
}

interface OpsDeal {
    _id: string;
    title: string;
    value: number;
    currency: string;
    opsStatus: string;
    opsStartDate: string;
    company?: { name: string; logo?: string };
    primaryContact?: { fullName: string; profilePhotoUrl?: string };
    opsAssignedTo?: { name: string; email: string; profilePhotoUrl?: string };
}

export default function OpsPipelineBoard() {
    const [stages, setStages] = useState<OpsStage[]>([]);
    const [grouped, setGrouped] = useState<Record<string, OpsDeal[]>>({});
    const [loading, setLoading] = useState(true);
    const [draggedDeal, setDraggedDeal] = useState<string | null>(null);
    const [dragOverStage, setDragOverStage] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [config, dealsGrouped] = await Promise.all([
                getOpsPipelineConfig(),
                getOpsDealsGrouped(),
            ]);
            setStages(config.stages?.filter((s: OpsStage) => s.isActive).sort((a: OpsStage, b: OpsStage) => a.order - b.order) || []);
            setGrouped(dealsGrouped);
        } catch (err) {
            console.error('Error loading ops pipeline:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleDragStart = (dealId: string) => {
        setDraggedDeal(dealId);
    };

    const handleDragOver = (e: React.DragEvent, stageKey: string) => {
        e.preventDefault();
        setDragOverStage(stageKey);
    };

    const handleDragLeave = () => {
        setDragOverStage(null);
    };

    const handleDrop = async (stageKey: string) => {
        if (!draggedDeal) return;
        setDragOverStage(null);

        // Find current stage of the deal
        let currentStage = '';
        for (const [key, deals] of Object.entries(grouped)) {
            if (deals.find(d => d._id === draggedDeal)) {
                currentStage = key;
                break;
            }
        }

        if (currentStage === stageKey) {
            setDraggedDeal(null);
            return;
        }

        // Optimistic update
        const deal = grouped[currentStage]?.find(d => d._id === draggedDeal);
        if (deal) {
            setGrouped(prev => {
                const next = { ...prev };
                next[currentStage] = (next[currentStage] || []).filter(d => d._id !== draggedDeal);
                next[stageKey] = [...(next[stageKey] || []), { ...deal, opsStatus: stageKey }];
                return next;
            });
        }

        try {
            await updateOpsDealStatus(draggedDeal, stageKey);
        } catch (err) {
            console.error('Error updating deal status:', err);
            loadData(); // Revert on error
        }

        setDraggedDeal(null);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 size={32} className="animate-spin" style={{ color: '#3b82f6' }} />
            </div>
        );
    }

    return (
        <div className="py-4">
            <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 180px)' }}>
                {stages.map((stage) => {
                    const deals = grouped[stage.key] || [];
                    const isOver = dragOverStage === stage.key;

                    return (
                        <div
                            key={stage.key}
                            className="flex flex-col shrink-0 rounded-2xl transition-all duration-200"
                            style={{
                                width: 320,
                                background: isOver ? `${stage.color}15` : 'rgba(255, 255, 255, 0.5)',
                                backdropFilter: 'blur(20px)',
                                border: isOver ? `2px solid ${stage.color}` : '1px solid rgba(59, 130, 246, 0.08)',
                                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
                            }}
                            onDragOver={(e) => handleDragOver(e, stage.key)}
                            onDragLeave={handleDragLeave}
                            onDrop={() => handleDrop(stage.key)}
                        >
                            {/* Column Header */}
                            <div className="p-4 border-b" style={{ borderColor: `${stage.color}20` }}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">{stage.emoji}</span>
                                        <span className="font-semibold text-gray-900 text-sm">{stage.label}</span>
                                    </div>
                                    <div
                                        className="px-2 py-0.5 rounded-full text-xs font-bold"
                                        style={{ background: `${stage.color}20`, color: stage.color }}
                                    >
                                        {deals.length}
                                    </div>
                                </div>
                                <div className="text-xs text-gray-500 mt-1">{stage.duration}</div>
                            </div>

                            {/* Cards */}
                            <div className="flex-1 p-3 space-y-3 overflow-y-auto">
                                {deals.length === 0 ? (
                                    <div className="text-center py-8 text-gray-400 text-sm">
                                        Sin proyectos
                                    </div>
                                ) : (
                                    deals.map((deal) => (
                                        <div
                                            key={deal._id}
                                            draggable
                                            onDragStart={() => handleDragStart(deal._id)}
                                            className="rounded-xl p-4 cursor-grab active:cursor-grabbing transition-all duration-200 hover:scale-[1.02]"
                                            style={{
                                                background: 'white',
                                                border: '1px solid rgba(0,0,0,0.06)',
                                                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                                                opacity: draggedDeal === deal._id ? 0.5 : 1,
                                            }}
                                        >
                                            <div className="flex items-start gap-2">
                                                <GripVertical size={14} className="text-gray-300 mt-0.5 shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-sm text-gray-900 truncate">{deal.title}</div>
                                                    {deal.company && (
                                                        <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                                                            <Building2 size={12} />
                                                            <span className="truncate">{deal.company.name}</span>
                                                        </div>
                                                    )}
                                                    {deal.primaryContact && (
                                                        <div className="flex items-center gap-1 mt-0.5 text-xs text-gray-500">
                                                            <User size={12} />
                                                            <span className="truncate">{deal.primaryContact.fullName}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center justify-between mt-2">
                                                        <span className="text-sm font-semibold" style={{ color: stage.color }}>
                                                            ${deal.value?.toLocaleString() || '0'}
                                                        </span>
                                                        {deal.opsAssignedTo && (
                                                            <div
                                                                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                                                                style={{ background: stage.color }}
                                                                title={deal.opsAssignedTo.name || deal.opsAssignedTo.email}
                                                            >
                                                                {(deal.opsAssignedTo.name || deal.opsAssignedTo.email)?.[0]?.toUpperCase()}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
