/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ICON COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Wrapper consistente para íconos Lucide con tamaños y colores predefinidos
 * del Design System de VoiceCommand.
 * 
 * @example
 * ```tsx
 * <Icon icon={User} size="md" color="primary" />
 * <Icon icon={Check} size="lg" color="success" />
 * <Icon icon={Alert} size="sm" color="error" />
 * <Icon icon={Info} color="var(--vc-purple-600)" />
 * ```
 */

import { forwardRef } from 'react';
import type { LucideIcon } from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   TYPES
   ───────────────────────────────────────────────────────────────────────────── */

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;

export type IconColor = 
  | 'inherit'
  | 'current'
  | 'default'
  | 'muted'
  | 'primary'
  | 'success'
  | 'warning'
  | 'error'
  | 'info';

export interface IconProps {
  /** Componente de icono de Lucide */
  icon: LucideIcon;
  /** Tamaño del icono */
  size?: IconSize;
  /** Color del icono */
  color?: IconColor | string;
  /** Grosor del trazo */
  strokeWidth?: number;
  /** Rotación en grados */
  rotation?: number;
  /** Clases CSS adicionales */
  className?: string;
  /** Estilos inline adicionales */
  style?: React.CSSProperties;
  /** Evento click */
  onClick?: () => void;
  /** Título para accesibilidad */
  title?: string;
}

/* ─────────────────────────────────────────────────────────────────────────────
   CONFIGURATION
   ───────────────────────────────────────────────────────────────────────────── */

const sizeMap: Record<string, number> = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
};

const colorMap: Record<IconColor, string> = {
  inherit: 'inherit',
  current: 'currentColor',
  default: 'var(--vc-gray-800)',
  muted: 'var(--vc-gray-500)',
  primary: 'var(--vc-purple-600)',
  success: 'var(--vc-success-600)',
  warning: 'var(--vc-warning-600)',
  error: 'var(--vc-error-600)',
  info: 'var(--vc-info-600)',
};

/* ─────────────────────────────────────────────────────────────────────────────
   HELPER FUNCTIONS
   ───────────────────────────────────────────────────────────────────────────── */

function resolveSize(size: IconSize): number {
  if (typeof size === 'number') return size;
  return sizeMap[size] || sizeMap.md;
}

function resolveColor(color: IconColor | string): string {
  if (color in colorMap) {
    return colorMap[color as IconColor];
  }
  return color; // Asume que es un valor CSS válido
}

/* ─────────────────────────────────────────────────────────────────────────────
   COMPONENT
   ───────────────────────────────────────────────────────────────────────────── */

export const Icon = forwardRef<SVGSVGElement, IconProps>(
  (
    {
      icon: IconComponent,
      size = 'md',
      color = 'default',
      strokeWidth = 2,
      rotation = 0,
      className = '',
      style,
      onClick,
      title,
      ...props
    },
    ref
  ) => {
    const resolvedSize = resolveSize(size);
    const resolvedColor = resolveColor(color);

    const containerStyles: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: resolvedSize,
      height: resolvedSize,
      transform: rotation ? `rotate(${rotation}deg)` : undefined,
      cursor: onClick ? 'pointer' : 'default',
      ...style,
    };

    return (
      <span 
        className={className}
        style={containerStyles}
        onClick={onClick}
        title={title}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        <IconComponent
          ref={ref}
          size={resolvedSize}
          color={resolvedColor}
          strokeWidth={strokeWidth}
          {...props}
        />
      </span>
    );
  }
);

Icon.displayName = 'Icon';

/* ─────────────────────────────────────────────────────────────────────────────
   UTILITY EXPORTS
   ───────────────────────────────────────────────────────────────────────────── */

/**
 * Hook para obtener el tamaño resuelto de un icono
 */
export function useIconSize(size: IconSize): number {
  return resolveSize(size);
}

/**
 * Hook para obtener el color resuelto de un icono
 */
export function useIconColor(color: IconColor | string): string {
  return resolveColor(color);
}

/**
 * Objeto de tamaños predefinidos para referencia
 */
export const IconSizes = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
} as const;

/**
 * Objeto de colores predefinidos para referencia
 */
export const IconColors = {
  inherit: 'inherit',
  current: 'currentColor',
  default: 'var(--vc-gray-800)',
  muted: 'var(--vc-gray-500)',
  primary: 'var(--vc-purple-600)',
  success: 'var(--vc-success-600)',
  warning: 'var(--vc-warning-600)',
  error: 'var(--vc-error-600)',
  info: 'var(--vc-info-600)',
} as const;

export default Icon;
