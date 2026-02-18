/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * INPUT COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Campo de entrada de texto con soporte para labels, íconos y estados de error.
 * Integrado con el Design System de VoiceCommand.
 * 
 * @example
 * ```tsx
 * <Input 
 *   label="Nombre completo" 
 *   placeholder="Ingresa tu nombre"
 *   leftIcon={User}
 * />
 * 
 * <Input 
 *   label="Email"
 *   type="email"
 *   error="El email es requerido"
 *   rightIcon={Mail}
 * />
 * 
 * <Input variant="filled" disabled value="Valor fijo" />
 * ```
 */

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   TYPES
   ───────────────────────────────────────────────────────────────────────────── */

export type InputVariant = 'default' | 'filled';
export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Label del campo */
  label?: string;
  /** Texto de ayuda */
  helperText?: string;
  /** Mensaje de error */
  error?: string;
  /** Variante visual */
  variant?: InputVariant;
  /** Tamaño del input */
  size?: InputSize;
  /** Icono a la izquierda */
  leftIcon?: LucideIcon;
  /** Icono a la derecha */
  rightIcon?: LucideIcon;
  /** Elemento a la derecha (sobrescribe rightIcon) */
  rightElement?: ReactNode;
  /** Clases CSS adicionales */
  className?: string;
  /** Clases CSS adicionales para el contenedor */
  wrapperClassName?: string;
}

/* ─────────────────────────────────────────────────────────────────────────────
   STYLES
   ───────────────────────────────────────────────────────────────────────────── */

const containerStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--vc-space-1)',
  width: '100%',
};

const labelStyles: React.CSSProperties = {
  fontFamily: 'var(--vc-font-family-base)',
  fontSize: 'var(--vc-text-sm)',
  fontWeight: 'var(--vc-font-medium)',
  color: 'var(--vc-gray-700)',
};

const inputWrapperStyles: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  width: '100%',
};

const baseInputStyles: React.CSSProperties = {
  width: '100%',
  fontFamily: 'var(--vc-font-family-base)',
  fontSize: 'var(--vc-text-base)',
  color: 'var(--vc-gray-800)',
  border: '1px solid var(--vc-gray-300)',
  borderRadius: 'var(--vc-radius-lg)',
  background: 'var(--vc-gray-0)',
  transition: 'all var(--vc-transition-fast)',
  outline: 'none',
};

const variantStyles: Record<InputVariant, React.CSSProperties> = {
  default: {
    background: 'var(--vc-gray-0)',
    border: '1px solid var(--vc-gray-300)',
  },
  filled: {
    background: 'var(--vc-gray-100)',
    border: '1px solid transparent',
  },
};

const sizeStyles: Record<InputSize, { input: React.CSSProperties; icon: React.CSSProperties }> = {
  sm: {
    input: {
      height: 'var(--vc-input-height-sm)',
      padding: '0 var(--vc-space-3)',
      fontSize: 'var(--vc-text-sm)',
    },
    icon: {
      width: '14px',
      height: '14px',
    },
  },
  md: {
    input: {
      height: 'var(--vc-input-height-md)',
      padding: '0 var(--vc-space-4)',
      fontSize: 'var(--vc-text-base)',
    },
    icon: {
      width: '16px',
      height: '16px',
    },
  },
  lg: {
    input: {
      height: 'var(--vc-input-height-lg)',
      padding: '0 var(--vc-space-5)',
      fontSize: 'var(--vc-text-md)',
    },
    icon: {
      width: '18px',
      height: '18px',
    },
  },
};

const errorStyles: React.CSSProperties = {
  borderColor: 'var(--vc-error-500)',
  background: 'var(--vc-error-50)',
};

const disabledStyles: React.CSSProperties = {
  background: 'var(--vc-gray-100)',
  color: 'var(--vc-gray-500)',
  cursor: 'not-allowed',
  opacity: 0.6,
};

const helperTextStyles: React.CSSProperties = {
  fontFamily: 'var(--vc-font-family-base)',
  fontSize: 'var(--vc-text-xs)',
  color: 'var(--vc-gray-500)',
  marginTop: 'var(--vc-space-1)',
};

const errorTextStyles: React.CSSProperties = {
  ...helperTextStyles,
  color: 'var(--vc-error-600)',
};

/* ─────────────────────────────────────────────────────────────────────────────
   COMPONENT
   ───────────────────────────────────────────────────────────────────────────── */

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      helperText,
      error,
      variant = 'default',
      size = 'md',
      disabled = false,
      leftIcon: LeftIcon,
      rightIcon: RightIcon,
      rightElement,
      className = '',
      wrapperClassName = '',
      style,
      onFocus,
      onBlur,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = React.useState(false);

    // Calcular padding para iconos
    const getInputPadding = (): React.CSSProperties => {
      const base = sizeStyles[size].input.padding as string;
      const iconSpace = size === 'sm' ? '2rem' : size === 'md' ? '2.5rem' : '3rem';
      
      return {
        paddingLeft: LeftIcon ? iconSpace : base,
        paddingRight: (RightIcon || rightElement) ? iconSpace : base,
      };
    };

    // Estilos de focus
    const getFocusStyles = (): React.CSSProperties => {
      if (!isFocused) return {};
      if (error) return {};
      
      return {
        borderColor: 'var(--vc-purple-500)',
        boxShadow: '0 0 0 3px var(--vc-purple-100)',
      };
    };

    // Posición de iconos
    const iconPositionStyles: React.CSSProperties = {
      position: 'absolute',
      top: '50%',
      transform: 'translateY(-50%)',
      color: isFocused ? 'var(--vc-purple-500)' : 'var(--vc-gray-400)',
      transition: 'color var(--vc-transition-fast)',
      pointerEvents: 'none',
    };

    const leftIconPosition: React.CSSProperties = {
      ...iconPositionStyles,
      left: size === 'sm' ? 'var(--vc-space-2)' : 'var(--vc-space-3)',
    };

    const rightIconPosition: React.CSSProperties = {
      ...iconPositionStyles,
      right: size === 'sm' ? 'var(--vc-space-2)' : 'var(--vc-space-3)',
    };

    const iconSize = sizeStyles[size].icon.width as number;

    return (
      <div style={containerStyles} className={wrapperClassName}>
        {label && (
          <label style={labelStyles}>
            {label}
            {props.required && (
              <span style={{ color: 'var(--vc-error-500)', marginLeft: '2px' }}>*</span>
            )}
          </label>
        )}
        
        <div style={inputWrapperStyles}>
          {LeftIcon && (
            <LeftIcon 
              size={iconSize} 
              style={leftIconPosition} 
              color={isFocused ? 'var(--vc-purple-500)' : 'var(--vc-gray-400)'}
            />
          )}
          
          <input
            ref={ref}
            disabled={disabled}
            className={className}
            style={{
              ...baseInputStyles,
              ...variantStyles[variant],
              ...sizeStyles[size].input,
              ...getInputPadding(),
              ...(error && errorStyles),
              ...(disabled && disabledStyles),
              ...getFocusStyles(),
              ...style,
            }}
            onFocus={(e) => {
              setIsFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              onBlur?.(e);
            }}
            {...props}
          />
          
          {rightElement ? (
            <div style={{ ...rightIconPosition, pointerEvents: 'auto' }}>
              {rightElement}
            </div>
          ) : RightIcon ? (
            <RightIcon 
              size={iconSize} 
              style={rightIconPosition}
              color={isFocused ? 'var(--vc-purple-500)' : 'var(--vc-gray-400)'}
            />
          ) : null}
        </div>
        
        {error ? (
          <span style={errorTextStyles}>{error}</span>
        ) : helperText ? (
          <span style={helperTextStyles}>{helperText}</span>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;

// Import React
import React from 'react';
