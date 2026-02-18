import { Skeleton } from '../ui/Skeleton';
import { ContactCardListSkeleton } from './ContactCardSkeleton';

// ═══════════════════════════════════════════════════════════════
// KANBAN COLUMN SKELETON
// ═══════════════════════════════════════════════════════════════
// Replica el header de columna Kanban con contador
// + 5 ContactCardSkeleton
// + Fondo de columna correcto

export interface KanbanColumnSkeletonProps {
    color?: string;
    accentBg?: string;
    cardCount?: number;
    pulse?: boolean;
    className?: string;
}

export function KanbanColumnSkeleton({
    color = '#a855f7',
    accentBg = 'rgba(168, 85, 247, 0.08)',
    cardCount = 5,
    pulse = true,
    className = '',
}: KanbanColumnSkeletonProps) {
    return (
        <div
            className={`kanban-column-skeleton flex flex-col min-w-[260px] max-w-[360px] rounded-2xl ${className}`}
            style={{ background: accentBg }}
        >
            {/* Column Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <div className="flex items-center gap-2">
                    {/* Icon Placeholder */}
                    <Skeleton
                        variant="circle"
                        width={20}
                        height={20}
                        pulse={pulse}
                    />
                    {/* Label */}
                    <Skeleton variant="text" width={100} height={16} pulse={pulse} />
                </div>

                {/* Counter Badge */}
                <Skeleton
                    variant="text"
                    width={32}
                    height={20}
                    pulse={pulse}
                    style={{
                        borderRadius: 999,
                        background: `${color}40`,
                    }}
                />
            </div>

            {/* Cards Container */}
            <div
                className="flex-1 overflow-y-auto px-3 pb-3 min-h-[100px]"
                style={{
                    borderRadius: '0 0 16px 16px',
                }}
            >
                <ContactCardListSkeleton count={cardCount} pulse={pulse} />
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// FULL KANBAN BOARD SKELETON
// ═══════════════════════════════════════════════════════════════

export interface KanbanBoardSkeletonProps {
    columnCount?: number;
    cardsPerColumn?: number;
    pulse?: boolean;
    className?: string;
}

// Column configurations matching CRMPage
const COLUMN_CONFIGS = [
    { color: '#06b6d4', accentBg: 'rgba(6,182,212,0.08)' },
    { color: '#eab308', accentBg: 'rgba(234,179,8,0.08)' },
    { color: '#f97316', accentBg: 'rgba(249,115,22,0.08)' },
    { color: '#a855f7', accentBg: 'rgba(168,85,247,0.08)' },
    { color: '#f59e0b', accentBg: 'rgba(245,158,11,0.08)' },
    { color: '#10b981', accentBg: 'rgba(16,185,129,0.08)' },
    { color: '#8b5cf6', accentBg: 'rgba(139,92,246,0.08)' },
];

export function KanbanBoardSkeleton({
    columnCount = 7,
    cardsPerColumn = 3,
    pulse = true,
    className = '',
}: KanbanBoardSkeletonProps) {
    return (
        <div
            className={`kanban-board-skeleton flex gap-4 overflow-x-auto pb-2 ${className}`}
            style={{
                animation: 'kanbanSkeletonFadeIn 0.3s ease-out',
            }}
        >
            {Array.from({ length: columnCount }).map((_, i) => {
                const config = COLUMN_CONFIGS[i % COLUMN_CONFIGS.length];
                return (
                    <KanbanColumnSkeleton
                        key={i}
                        color={config.color}
                        accentBg={config.accentBg}
                        cardCount={cardsPerColumn}
                        pulse={pulse}
                    />
                );
            })}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════

export function KanbanSkeletonStyles() {
    return (
        <style>{`
            @keyframes kanbanSkeletonFadeIn {
                from {
                    opacity: 0;
                }
                to {
                    opacity: 1;
                }
            }
        `}</style>
    );
}

export default KanbanColumnSkeleton;
