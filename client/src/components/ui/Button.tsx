/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * BUTTON COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Botón versátil con múltiples variantes, tamaños y estados.
 * Integrado con el Design System de VoiceCommand.
 * 
 * @example
 * ```tsx
 * <Button variant="primary" size="md" onClick={handleClick}>
 *   Guardar cambios
 * </Button>
 * 
 * <Button variant="secondary" leftIcon={Plus} loading={isLoading}>
 *   Agregar contacto
 * </Button>
 * 
 * <Button variant="ghost" size="sm" disabled>
 *   Cancelar
 * </Button>
 * ```
 */

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   TYPES
   ───────────────────────────────────────────────────────────────────────────── */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Variante visual del botón */
  variant?: ButtonVariant;
  /** Tamaño del botón */
  size?: ButtonSize;
  /** Estado de carga */
  loading?: boolean;
  /** Icono a mostrar a la izquierda del texto */
  leftIcon?: LucideIcon;
  /** Icono a mostrar a la derecha del texto */
  rightIcon?: LucideIcon;
  /** Contenido del botón */
  children: ReactNode;
  /** Clases CSS adicionales */
  className?: string;
}

/* ─────────────────────────────────────────────────────────────────────────────
   STYLES
   ───────────────────────────────────────────────────────────────────────────── */

const baseStyles: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--vc-space-2)',
  fontFamily: 'var(--vc-font-family-base)',
  fontWeight: 'var(--vc-font-medium)',
  border: 'none',
  borderRadius: 'var(--vc-radius-lg)',
  cursor: 'pointer',
  transition: 'all var(--vc-transition-base)',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  position: 'relative',
  overflow: 'hidden',
};

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'linear-gradient(135deg, var(--vc-purple-600), var(--vc-purple-500))',
    color: 'var(--vc-gray-0)',
    boxShadow: 'var(--vc-shadow-sm)',
  },
  secondary: {
    background: 'var(--vc-gray-100)',
    color: 'var(--vc-gray-700)',
    boxShadow: 'var(--vc-shadow-xs)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--vc-gray-600)',
  },
  danger: {
    background: 'var(--vc-error-500)',
    color: 'var(--vc-gray-0)',
    boxShadow: 'var(--vc-shadow-sm)',
  },
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: {
    height: 'var(--vc-button-height-sm)',
    padding: 'var(--vc-button-padding-sm)',
    fontSize: 'var(--vc-text-sm)',
  },
  md: {
    height: 'var(--vc-button-height-md)',
    padding: 'var(--vc-button-padding-md)',
    fontSize: 'var(--vc-text-base)',
  },
  lg: {
    height: 'var(--vc-button-height-lg)',
    padding: 'var(--vc-button-padding-lg)',
    fontSize: 'var(--vc-text-md)',
  },
};

const disabledStyles: React.CSSProperties = {
  opacity: 0.5,
  cursor: 'not-allowed',
  pointerEvents: 'none',
};

const loadingStyles: React.CSSProperties = {
  cursor: 'wait',
  pointerEvents: 'none',
};

/* ─────────────────────────────────────────────────────────────────────────────
   COMPONENT
   ───────────────────────────────────────────────────────────────────────────── */

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled = false,
      leftIcon: LeftIcon,
      rightIcon: RightIcon,
      children,
      className = '',
      style,
      onMouseEnter,
      onMouseLeave,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    // Estados hover
    const [isHovered, setIsHovered] = React.useState(false);
    
    const getHoverStyles = (): React.CSSProperties => {
      if (!isHovered || isDisabled) return {};
      
      switch (variant) {
        case 'primary':
          return {
            boxShadow: 'var(--vc-shadow-purple)',
            transform: 'translateY(-1px)',
          };
        case 'secondary':
          return {
            background: 'var(--vc-gray-200)',
            transform: 'translateY(-1px)',
          };
        case 'ghost':
          return {
            background: 'var(--vc-gray-100)',
            color: 'var(--vc-gray-800)',
          };
        case 'danger':
          return {
            background: 'var(--vc-error-600)',
            boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
            transform: 'translateY(-1px)',
          };
        default:
          return {};
      }
    };

    const getActiveStyles = (): React.CSSProperties => {
      if (isDisabled) return {};
      return {
        transform: 'translateY(0)',
      };
    };

    // Spinner de carga
    const renderSpinner = () => (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        style={{
          animation: 'vc-spin 1s linear infinite',
        }}
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="31.416"
          strokeDashoffset="10"
          opacity="0.3"
        />
        <path
          d="M12 2C6.48 2 2 6.48 2 12"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <style>{`
          @keyframes vc-spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </svg>
    );

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={className}
        style={{
          ...baseStyles,
          ...variantStyles[variant],
          ...sizeStyles[size],
          ...(isDisabled && disabledStyles),
          ...(loading && loadingStyles),
          ...getHoverStyles(),
          ...getActiveStyles(),
          ...style,
        }}
        onMouseEnter={(e) => {
          setIsHovered(true);
          onMouseEnter?.(e);
        }}
        onMouseLeave={(e) => {
          setIsHovered(false);
          onMouseLeave?.(e);
        }}
        {...props}
      >
        {loading && renderSpinner()}
        {!loading && LeftIcon && (
          <LeftIcon size={size === 'sm' ? 14 : size === 'md' ? 16 : 18} />
        )}
        <span>{children}</span>
        {!loading && RightIcon && (
          <RightIcon size={size === 'sm' ? 14 : size === 'md' ? 16 : 18} />
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;

// Import React para el useState
import React from 'react';
