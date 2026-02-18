/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BADGE COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Indicadores visuales para estados, etiquetas y contadores.
 * Incluye variantes para todos los estados del pipeline CRM.
 * 
 * @example
 * ```tsx
 * <Badge variant="success">Completado</Badge>
 * <Badge variant="status" status="aceptado" />
 * <Badge variant="warning" leftIcon={AlertCircle}>Pendiente</Badge>
 * <Badge variant="pipeline" status="enriqueciendo" />
 * ```
 */

import { forwardRef, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   TYPES
   ───────────────────────────────────────────────────────────────────────────── */

export type BadgeVariant = 
  | 'default' 
  | 'primary' 
  | 'success' 
  | 'warning' 
  | 'error' 
  | 'info' 
  | 'status'
  | 'pipeline';

export type PipelineStatus = 
  | 'visitando'
  | 'conectando'
  | 'interactuando'
  | 'enriqueciendo'
  | 'esperando_aceptacion'
  | 'aceptado'
  | 'mensaje_enviado';

export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  /** Variante visual del badge */
  variant?: BadgeVariant;
  /** Estado del pipeline (requerido para variantes 'status' o 'pipeline') */
  status?: PipelineStatus;
  /** Tamaño del badge */
  size?: BadgeSize;
  /** Mostrar solo el punto de estado (sin texto) */
  dot?: boolean;
  /** Icono a mostrar a la izquierda */
  leftIcon?: LucideIcon;
  /** Contenido del badge */
  children?: ReactNode;
  /** Clases CSS adicionales */
  className?: string;
  /** Estilos inline adicionales */
  style?: React.CSSProperties;
}

/* ─────────────────────────────────────────────────────────────────────────────
   PIPELINE CONFIGURATION
   ───────────────────────────────────────────────────────────────────────────── */

const PIPELINE_CONFIG: Record<PipelineStatus, { label: string; color: string }> = {
  visitando: { label: 'Visitando', color: 'var(--vc-pipeline-visitando)' },
  conectando: { label: 'Conectando', color: 'var(--vc-pipeline-conectando)' },
  interactuando: { label: 'Interactuando', color: 'var(--vc-pipeline-interactuando)' },
  enriqueciendo: { label: 'Enriqueciendo', color: 'var(--vc-pipeline-enriqueciendo)' },
  esperando_aceptacion: { label: 'Esperando', color: 'var(--vc-pipeline-esperando)' },
  aceptado: { label: 'Aceptado', color: 'var(--vc-pipeline-aceptado)' },
  mensaje_enviado: { label: 'Mensaje enviado', color: 'var(--vc-pipeline-mensaje)' },
};

/* ─────────────────────────────────────────────────────────────────────────────
   STYLES
   ───────────────────────────────────────────────────────────────────────────── */

const baseStyles: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--vc-space-1)',
  fontFamily: 'var(--vc-font-family-base)',
  fontWeight: 'var(--vc-font-semibold)',
  borderRadius: 'var(--vc-radius-full)',
  whiteSpace: 'nowrap',
  transition: 'all var(--vc-transition-fast)',
};

const sizeStyles: Record<BadgeSize, React.CSSProperties> = {
  sm: {
    height: '1.25rem',
    padding: '0 var(--vc-space-2)',
    fontSize: 'var(--vc-text-xs)',
  },
  md: {
    height: '1.5rem',
    padding: '0 var(--vc-space-3)',
    fontSize: 'var(--vc-text-sm)',
  },
};

const dotStyles: React.CSSProperties = {
  width: '8px',
  height: '8px',
  borderRadius: 'var(--vc-radius-full)',
};

const getVariantStyles = (variant: BadgeVariant, color?: string): React.CSSProperties => {
  const baseColor = color || getVariantColor(variant);
  
  switch (variant) {
    case 'default':
      return {
        background: 'var(--vc-gray-100)',
        color: 'var(--vc-gray-700)',
      };
    case 'primary':
      return {
        background: 'var(--vc-purple-100)',
        color: 'var(--vc-purple-700)',
      };
    case 'success':
      return {
        background: 'var(--vc-success-100)',
        color: 'var(--vc-success-700)',
      };
    case 'warning':
      return {
        background: 'var(--vc-warning-100)',
        color: 'var(--vc-warning-700)',
      };
    case 'error':
      return {
        background: 'var(--vc-error-100)',
        color: 'var(--vc-error-700)',
      };
    case 'info':
      return {
        background: 'var(--vc-info-100)',
        color: 'var(--vc-info-700)',
      };
    case 'status':
    case 'pipeline':
      return {
        background: `${baseColor}15`, // 15 = ~10% opacity en hex
        color: baseColor,
      };
    default:
      return {};
  }
};

const getVariantColor = (variant: BadgeVariant): string => {
  switch (variant) {
    case 'primary': return 'var(--vc-purple-600)';
    case 'success': return 'var(--vc-success-600)';
    case 'warning': return 'var(--vc-warning-600)';
    case 'error': return 'var(--vc-error-600)';
    case 'info': return 'var(--vc-info-600)';
    default: return 'var(--vc-gray-600)';
  }
};

/* ─────────────────────────────────────────────────────────────────────────────
   COMPONENT
   ───────────────────────────────────────────────────────────────────────────── */

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant = 'default',
      status,
      size = 'md',
      dot = false,
      leftIcon: LeftIcon,
      children,
      className = '',
      style,
    },
    ref
  ) => {
    // Obtener color y label para estados del pipeline
    const pipelineConfig = status ? PIPELINE_CONFIG[status] : null;
    const statusColor = pipelineConfig?.color;
    const statusLabel = pipelineConfig?.label;

    // Determinar el contenido a mostrar
    const content = children || statusLabel;

    // Tamaño de icono según tamaño del badge
    const iconSize = size === 'sm' ? 10 : 12;

    if (dot) {
      return (
        <span
          ref={ref}
          className={className}
          style={{
            ...dotStyles,
            background: statusColor || getVariantColor(variant),
            ...style,
          }}
          title={content as string}
        />
      );
    }

    return (
      <span
        ref={ref}
        className={className}
        style={{
          ...baseStyles,
          ...sizeStyles[size],
          ...getVariantStyles(variant, statusColor),
          ...style,
        }}
      >
        {LeftIcon && <LeftIcon size={iconSize} />}
        {content}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

/* ─────────────────────────────────────────────────────────────────────────────
   UTILITY EXPORTS
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Hook para obtener el color de un estado del pipeline
 */
export const usePipelineColor = (status: PipelineStatus): string => {
  return PIPELINE_CONFIG[status]?.color || 'var(--vc-gray-500)';
};

/**
 * Hook para obtener el label de un estado del pipeline
 */
export const usePipelineLabel = (status: PipelineStatus): string => {
  return PIPELINE_CONFIG[status]?.label || status;
};

export default Badge;
