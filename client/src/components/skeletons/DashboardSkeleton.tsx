import { Skeleton, SkeletonCard, SkeletonAvatar } from '../ui/Skeleton';

// ═══════════════════════════════════════════════════════════════
// STAT CARD SKELETON
// ═══════════════════════════════════════════════════════════════

export interface StatCardSkeletonProps {
    pulse?: boolean;
    className?: string;
}

export function StatCardSkeleton({ pulse = true, className = '' }: StatCardSkeletonProps) {
    return (
        <SkeletonCard
            className={`stat-card-skeleton ${className}`}
            pulse={pulse}
        >
            <div className="flex items-start justify-between">
                {/* Left: Label + Value */}
                <div className="space-y-2">
                    {/* Label */}
                    <Skeleton variant="text" width={80} height={12} pulse={pulse} />
                    {/* Value */}
                    <Skeleton variant="text" width={60} height={28} pulse={pulse} />
                </div>

                {/* Right: Icon */}
                <Skeleton
                    variant="circle"
                    width={40}
                    height={40}
                    pulse={pulse}
                />
            </div>

            {/* Bottom: Trend */}
            <div className="flex items-center gap-2 mt-4">
                <Skeleton variant="text" width={40} height={14} pulse={pulse} />
                <Skeleton variant="text" width={60} height={12} pulse={pulse} />
            </div>
        </SkeletonCard>
    );
}

// ═══════════════════════════════════════════════════════════════
// STATS GRID SKELETON
// ═══════════════════════════════════════════════════════════════

export interface StatsGridSkeletonProps {
    count?: number;
    pulse?: boolean;
    className?: string;
}

export function StatsGridSkeleton({
    count = 4,
    pulse = true,
    className = '',
}: StatsGridSkeletonProps) {
    return (
        <div
            className={`stats-grid-skeleton grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}
            style={{
                animation: 'dashboardSkeletonFadeIn 0.3s ease-out',
            }}
        >
            {Array.from({ length: count }).map((_, i) => (
                <StatCardSkeleton key={i} pulse={pulse} />
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// CHART SKELETON
// ═══════════════════════════════════════════════════════════════

export interface ChartSkeletonProps {
    height?: number;
    pulse?: boolean;
    className?: string;
}

export function ChartSkeleton({
    height = 300,
    pulse = true,
    className = '',
}: ChartSkeletonProps) {
    return (
        <SkeletonCard
            className={`chart-skeleton ${className}`}
            pulse={pulse}
            style={{ height }}
        >
            {/* Chart Title */}
            <Skeleton variant="text" width={120} height={18} pulse={pulse} />

            {/* Chart Area */}
            <div className="relative mt-4" style={{ height: height - 80 }}>
                {/* Y-axis lines */}
                <div className="absolute inset-0 flex flex-col justify-between">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div
                            key={i}
                            className="w-full h-px"
                            style={{ background: 'rgba(233, 213, 255, 0.5)' }}
                        />
                    ))}
                </div>

                {/* Bars */}
                <div className="absolute inset-0 flex items-end justify-around px-4 pb-px">
                    {Array.from({ length: 7 }).map((_, i) => (
                        <Skeleton
                            key={i}
                            variant="rectangle"
                            width={32}
                            height={Math.random() * 60 + 20 + '%'}
                            pulse={pulse}
                            style={{
                                borderRadius: '4px 4px 0 0',
                                opacity: 0.3 + (i * 0.1),
                            }}
                        />
                    ))}
                </div>
            </div>
        </SkeletonCard>
    );
}

// ═══════════════════════════════════════════════════════════════
// QUICK ACTION SKELETON
// ═══════════════════════════════════════════════════════════════

export interface QuickActionSkeletonProps {
    pulse?: boolean;
    className?: string;
}

export function QuickActionSkeleton({ pulse = true, className = '' }: QuickActionSkeletonProps) {
    return (
        <div
            className={`quick-action-skeleton flex items-center gap-3 p-3 rounded-xl ${className}`}
            style={{
                background: 'rgba(255, 255, 255, 0.6)',
                border: '1px solid rgba(168, 85, 247, 0.1)',
            }}
        >
            {/* Icon */}
            <Skeleton
                variant="circle"
                width={36}
                height={36}
                pulse={pulse}
            />

            {/* Text */}
            <div className="flex-1 space-y-1.5">
                <Skeleton variant="text" width="70%" height={14} pulse={pulse} />
                <Skeleton variant="text" width="50%" height={10} pulse={pulse} />
            </div>

            {/* Arrow */}
            <Skeleton variant="text" width={16} height={16} pulse={pulse} />
        </div>
    );
}

export interface QuickActionsSkeletonProps {
    count?: number;
    pulse?: boolean;
    className?: string;
}

export function QuickActionsSkeleton({
    count = 4,
    pulse = true,
    className = '',
}: QuickActionsSkeletonProps) {
    return (
        <SkeletonCard className={`quick-actions-skeleton ${className}`} pulse={pulse}>
            {/* Title */}
            <Skeleton variant="text" width={100} height={16} pulse={pulse} />

            {/* Actions List */}
            <div className="space-y-2 mt-3">
                {Array.from({ length: count }).map((_, i) => (
                    <QuickActionSkeleton key={i} pulse={pulse} />
                ))}
            </div>
        </SkeletonCard>
    );
}

// ═══════════════════════════════════════════════════════════════
// FULL DASHBOARD SKELETON
// ═══════════════════════════════════════════════════════════════

export interface DashboardSkeletonProps {
    pulse?: boolean;
    className?: string;
}

export function DashboardSkeleton({ pulse = true, className = '' }: DashboardSkeletonProps) {
    return (
        <div
            className={`dashboard-skeleton space-y-6 ${className}`}
            style={{
                animation: 'dashboardSkeletonFadeIn 0.4s ease-out',
            }}
        >
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Skeleton variant="text" width={140} height={24} pulse={pulse} />
                    <Skeleton
                        variant="text"
                        width={80}
                        height={20}
                        pulse={pulse}
                        style={{ borderRadius: 999 }}
                    />
                </div>
                <Skeleton variant="rectangle" width={120} height={36} pulse={pulse} style={{ borderRadius: 10 }} />
            </div>

            {/* Stats Grid */}
            <StatsGridSkeleton count={4} pulse={pulse} />

            {/* Main Content: Chart + Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chart - Takes 2 columns */}
                <div className="lg:col-span-2">
                    <ChartSkeleton height={320} pulse={pulse} />
                </div>

                {/* Quick Actions */}
                <QuickActionsSkeleton count={4} pulse={pulse} />
            </div>

            {/* Secondary Content Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <SkeletonCard pulse={pulse}>
                    <Skeleton variant="text" width={100} height={16} pulse={pulse} />
                    <div className="space-y-3 mt-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <SkeletonAvatar size={32} pulse={pulse} />
                                <div className="flex-1 space-y-1">
                                    <Skeleton variant="text" width="60%" height={12} pulse={pulse} />
                                    <Skeleton variant="text" width="40%" height={10} pulse={pulse} />
                                </div>
                            </div>
                        ))}
                    </div>
                </SkeletonCard>

                <SkeletonCard pulse={pulse}>
                    <Skeleton variant="text" width={100} height={16} pulse={pulse} />
                    <div className="space-y-3 mt-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <Skeleton variant="circle" size={32} pulse={pulse} />
                                <div className="flex-1 space-y-1">
                                    <Skeleton variant="text" width="60%" height={12} pulse={pulse} />
                                    <Skeleton variant="text" width="40%" height={10} pulse={pulse} />
                                </div>
                            </div>
                        ))}
                    </div>
                </SkeletonCard>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════

export function DashboardSkeletonStyles() {
    return (
        <style>{`
            @keyframes dashboardSkeletonFadeIn {
                from {
                    opacity: 0;
                    transform: translateY(10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
        `}</style>
    );
}

export default DashboardSkeleton;
