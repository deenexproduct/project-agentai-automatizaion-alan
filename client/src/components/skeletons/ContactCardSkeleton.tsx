import { Skeleton, SkeletonAvatar } from '../ui/Skeleton';

// ═══════════════════════════════════════════════════════════════
// CONTACT CARD SKELETON
// ═══════════════════════════════════════════════════════════════
// Replica exacta de ContactCard pero en skeleton
// Incluye: foto, nombre, cargo, empresa, badges

export interface ContactCardSkeletonProps {
    pulse?: boolean;
    className?: string;
}

export function ContactCardSkeleton({ pulse = true, className = '' }: ContactCardSkeletonProps) {
    return (
        <div
            className={`contact-card-skeleton ${className}`}
            style={{
                background: 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(10px)',
                borderRadius: 10,
                borderLeft: '3px solid #e9d5ff',
                padding: '10px 12px',
                marginBottom: 8,
            }}
        >
            {/* Main Row: Avatar + Info */}
            <div className="flex items-start gap-3">
                {/* Avatar Skeleton */}
                <SkeletonAvatar size={40} pulse={pulse} />

                {/* Info Skeleton */}
                <div className="flex-1 min-w-0 space-y-1.5">
                    {/* Name */}
                    <Skeleton variant="text" width="75%" height={16} pulse={pulse} />
                    
                    {/* Position */}
                    <Skeleton variant="text" width="60%" height={12} pulse={pulse} />
                    
                    {/* Company */}
                    <Skeleton variant="text" width="45%" height={12} pulse={pulse} />
                </div>

                {/* Action Button Placeholder */}
                <Skeleton
                    variant="rectangle"
                    width={26}
                    height={26}
                    pulse={pulse}
                    style={{ borderRadius: 6, flexShrink: 0 }}
                />
            </div>

            {/* Footer Row */}
            <div className="flex items-center justify-between mt-2 pl-[52px]">
                <div className="flex items-center gap-2">
                    {/* Location */}
                    <Skeleton variant="text" width={60} height={10} pulse={pulse} />
                    
                    {/* Badge */}
                    <Skeleton
                        variant="text"
                        width={70}
                        height={16}
                        pulse={pulse}
                        style={{ borderRadius: 999 }}
                    />
                </div>

                {/* Date */}
                <Skeleton variant="text" width={35} height={10} pulse={pulse} />
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// MULTIPLE CARDS SKELETON
// ═══════════════════════════════════════════════════════════════

export interface ContactCardListSkeletonProps {
    count?: number;
    pulse?: boolean;
    className?: string;
}

export function ContactCardListSkeleton({
    count = 5,
    pulse = true,
    className = '',
}: ContactCardListSkeletonProps) {
    return (
        <div className={`contact-card-list-skeleton ${className}`}>
            {Array.from({ length: count }).map((_, i) => (
                <ContactCardSkeleton key={i} pulse={pulse} />
            ))}
        </div>
    );
}

export default ContactCardSkeleton;
