import React from 'react';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type SkeletonVariant = 'text' | 'card' | 'avatar' | 'circle' | 'rectangle';

export interface SkeletonProps {
    variant?: SkeletonVariant;
    width?: string | number;
    height?: string | number;
    pulse?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

// ═══════════════════════════════════════════════════════════════
// BASE SKELETON COMPONENT
// ═══════════════════════════════════════════════════════════════

export function Skeleton({
    variant = 'text',
    width,
    height,
    pulse = true,
    className = '',
    style = {},
}: SkeletonProps) {
    const baseStyles: React.CSSProperties = {
        background: 'linear-gradient(90deg, #e9d5ff 25%, #f3e8ff 50%, #e9d5ff 75%)',
        backgroundSize: '200% 100%',
        borderRadius: variant === 'circle' ? '50%' : variant === 'avatar' ? '50%' : 8,
        ...getVariantDimensions(variant, width, height),
        ...style,
    };

    const animationClass = pulse ? 'skeleton-pulse' : '';

    return (
        <div
            className={`skeleton ${animationClass} ${className}`}
            style={baseStyles}
            aria-hidden="true"
        />
    );
}

// Helper to get default dimensions based on variant
function getVariantDimensions(
    variant: SkeletonVariant,
    width?: string | number,
    height?: string | number
): React.CSSProperties {
    const dims: React.CSSProperties = {};

    switch (variant) {
        case 'text':
            dims.width = width ?? '100%';
            dims.height = height ?? 16;
            break;
        case 'card':
            dims.width = width ?? '100%';
            dims.height = height ?? 120;
            break;
        case 'avatar':
            dims.width = width ?? 40;
            dims.height = height ?? 40;
            break;
        case 'circle':
            dims.width = width ?? 48;
            dims.height = height ?? 48;
            break;
        case 'rectangle':
            dims.width = width ?? '100%';
            dims.height = height ?? 80;
            break;
    }

    return dims;
}

// ═══════════════════════════════════════════════════════════════
// COMPOSITION COMPONENTS
// ═══════════════════════════════════════════════════════════════

export interface SkeletonTextProps {
    lines?: number;
    width?: string | number;
    lastLineWidth?: string | number;
    pulse?: boolean;
    className?: string;
    gap?: number;
}

export function SkeletonText({
    lines = 3,
    width = '100%',
    lastLineWidth = '60%',
    pulse = true,
    className = '',
    gap = 8,
}: SkeletonTextProps) {
    return (
        <div className={`flex flex-col ${className}`} style={{ gap }}>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton
                    key={i}
                    variant="text"
                    width={i === lines - 1 ? lastLineWidth : width}
                    height={14}
                    pulse={pulse}
                />
            ))}
        </div>
    );
}

export interface SkeletonAvatarProps {
    size?: number;
    pulse?: boolean;
    className?: string;
}

export function SkeletonAvatar({ size = 40, pulse = true, className = '' }: SkeletonAvatarProps) {
    return (
        <Skeleton
            variant="avatar"
            width={size}
            height={size}
            pulse={pulse}
            className={className}
        />
    );
}

export interface SkeletonCardProps {
    width?: string | number;
    height?: string | number;
    pulse?: boolean;
    className?: string;
    children?: React.ReactNode;
}

export function SkeletonCard({
    width = '100%',
    height,
    pulse = true,
    className = '',
    children,
}: SkeletonCardProps) {
    if (children) {
        return (
            <div
                className={`skeleton-card ${className}`}
                style={{
                    width,
                    height,
                    background: 'rgba(255, 255, 255, 0.5)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: 12,
                    padding: 16,
                    border: '1px solid rgba(168, 85, 247, 0.1)',
                }}
            >
                {children}
            </div>
        );
    }

    return (
        <Skeleton
            variant="card"
            width={width}
            height={height ?? 120}
            pulse={pulse}
            className={className}
            style={{
                background: 'rgba(233, 213, 255, 0.4)',
                borderRadius: 12,
            }}
        />
    );
}

// ═══════════════════════════════════════════════════════════════
// GLOBAL STYLES
// ═══════════════════════════════════════════════════════════════

export function SkeletonStyles() {
    return (
        <style>{`
            @keyframes skeleton-pulse {
                0% {
                    background-position: 200% 0;
                }
                100% {
                    background-position: -200% 0;
                }
            }

            .skeleton-pulse {
                animation: skeleton-pulse 1.5s ease-in-out infinite;
            }

            .skeleton {
                display: block;
                pointer-events: none;
                user-select: none;
            }

            /* Reduced motion support */
            @media (prefers-reduced-motion: reduce) {
                .skeleton-pulse {
                    animation: none;
                    background: #e9d5ff;
                }
            }
        `}</style>
    );
}

export default Skeleton;
