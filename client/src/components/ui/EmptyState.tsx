import React from 'react';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type EmptyStateVariant = 'pipeline-empty' | 'search-empty' | 'error' | 'default';

export interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    description?: string;
    action?: {
        label: string;
        onClick: () => void;
        variant?: 'primary' | 'secondary';
    };
    variant?: EmptyStateVariant;
    className?: string;
}

// ═══════════════════════════════════════════════════════════════
// VARIANT CONFIGURATIONS
// ═══════════════════════════════════════════════════════════════

const VARIANT_CONFIG: Record<EmptyStateVariant, { icon: string; color: string; bgColor: string }> = {
    'pipeline-empty': {
        icon: '📋',
        color: '#a855f7',
        bgColor: 'rgba(168, 85, 247, 0.1)',
    },
    'search-empty': {
        icon: '🔍',
        color: '#64748b',
        bgColor: 'rgba(100, 116, 139, 0.1)',
    },
    'error': {
        icon: '⚠️',
        color: '#ef4444',
        bgColor: 'rgba(239, 68, 68, 0.1)',
    },
    'default': {
        icon: '✨',
        color: '#7c3aed',
        bgColor: 'rgba(124, 58, 237, 0.1)',
    },
};

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function EmptyState({
    icon,
    title,
    description,
    action,
    variant = 'default',
    className = '',
}: EmptyStateProps) {
    const config = VARIANT_CONFIG[variant];
    const displayIcon = icon ?? config.icon;

    return (
        <div
            className={`empty-state ${className}`}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '48px 24px',
                animation: 'emptyStateFadeIn 0.4s ease-out',
            }}
        >
            {/* Icon Container */}
            <div
                className="empty-state-icon"
                style={{
                    width: 80,
                    height: 80,
                    borderRadius: '50%',
                    background: config.bgColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 36,
                    marginBottom: 20,
                    transition: 'transform 0.3s ease',
                }}
            >
                {displayIcon}
            </div>

            {/* Title */}
            <h3
                className="empty-state-title"
                style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: '#1e293b',
                    margin: '0 0 8px 0',
                    lineHeight: 1.3,
                }}
            >
                {title}
            </h3>

            {/* Description */}
            {description && (
                <p
                    className="empty-state-description"
                    style={{
                        fontSize: 14,
                        color: '#64748b',
                        margin: '0 0 20px 0',
                        maxWidth: 280,
                        lineHeight: 1.5,
                    }}
                >
                    {description}
                </p>
            )}

            {/* Action Button */}
            {action && (
                <button
                    onClick={action.onClick}
                    className="empty-state-action"
                    style={{
                        padding: '10px 20px',
                        borderRadius: 10,
                        border: 'none',
                        fontSize: 14,
                        fontWeight: 500,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        ...(action.variant === 'secondary'
                            ? {
                                  background: 'transparent',
                                  color: '#7c3aed',
                                  border: '1px solid rgba(124, 58, 237, 0.3)',
                              }
                            : {
                                  background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                                  color: '#fff',
                                  boxShadow: '0 2px 10px rgba(124, 58, 237, 0.3)',
                              }),
                    }}
                    onMouseEnter={(e) => {
                        if (action.variant !== 'secondary') {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 4px 15px rgba(124, 58, 237, 0.4)';
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (action.variant !== 'secondary') {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 2px 10px rgba(124, 58, 237, 0.3)';
                        }
                    }}
                >
                    {action.label}
                </button>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// PRESET COMPONENTS
// ═══════════════════════════════════════════════════════════════

export interface PipelineEmptyProps {
    columnName?: string;
    onAddContact?: () => void;
    className?: string;
}

export function PipelineEmpty({ columnName, onAddContact, className = '' }: PipelineEmptyProps) {
    return (
        <EmptyState
            variant="pipeline-empty"
            title={columnName ? `${columnName} vacío` : 'Sin contactos'}
            description="Los contactos aparecerán aquí cuando los agregues a esta etapa del pipeline."
            action={onAddContact ? { label: 'Agregar contacto', onClick: onAddContact } : undefined}
            className={className}
        />
    );
}

export interface SearchEmptyProps {
    searchTerm?: string;
    onClearSearch?: () => void;
    className?: string;
}

export function SearchEmpty({ searchTerm, onClearSearch, className = '' }: SearchEmptyProps) {
    return (
        <EmptyState
            variant="search-empty"
            icon="🔍"
            title="No se encontraron resultados"
            description={
                searchTerm
                    ? `No hay contactos que coincidan con "${searchTerm}"`
                    : 'Intenta con otros términos de búsqueda'
            }
            action={onClearSearch ? { label: 'Limpiar búsqueda', onClick: onClearSearch, variant: 'secondary' } : undefined}
            className={className}
        />
    );
}

export interface ErrorStateProps {
    title?: string;
    description?: string;
    onRetry?: () => void;
    className?: string;
}

export function ErrorState({
    title = 'Algo salió mal',
    description = 'No pudimos cargar los datos. Por favor, intenta nuevamente.',
    onRetry,
    className = '',
}: ErrorStateProps) {
    return (
        <EmptyState
            variant="error"
            title={title}
            description={description}
            action={onRetry ? { label: 'Reintentar', onClick: onRetry } : undefined}
            className={className}
        />
    );
}

// ═══════════════════════════════════════════════════════════════
// GLOBAL STYLES
// ═══════════════════════════════════════════════════════════════

export function EmptyStateStyles() {
    return (
        <style>{`
            @keyframes emptyStateFadeIn {
                from {
                    opacity: 0;
                    transform: translateY(10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .empty-state:hover .empty-state-icon {
                transform: scale(1.05);
            }
        `}</style>
    );
}

export default EmptyState;
