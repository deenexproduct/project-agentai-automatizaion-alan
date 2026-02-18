/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * CARD COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Contenedor de contenido con múltiples variantes y soporte para
 * header, content y footer estructurados.
 * 
 * @example
 * ```tsx
 * <Card variant="elevated" hover>
 *   <Card.Header>
 *     <h3>Título</h3>
 *   </Card.Header>
 *   <Card.Content>
 *     <p>Contenido de la tarjeta</p>
 *   </Card.Content>
 *   <Card.Footer>
 *     <Button>Acción</Button>
 *   </Card.Footer>
 * </Card>
 * 
 * <Card variant="ghost">
 *   <Card.Content>Contenido simple</Card.Content>
 * </Card>
 * ```
 */

import { forwardRef, type ReactNode, type HTMLAttributes } from 'react';

/* ─────────────────────────────────────────────────────────────────────────────
   TYPES
   ───────────────────────────────────────────────────────────────────────────── */

export type CardVariant = 'default' | 'ghost' | 'elevated';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Variante visual de la tarjeta */
  variant?: CardVariant;
  /** Activar efecto hover */
  hover?: boolean;
  /** Borde lateral con color de acento */
  accentColor?: string;
  /** Padding interno (sobrescribe el default) */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Contenido de la tarjeta */
  children: ReactNode;
  /** Clases CSS adicionales */
  className?: string;
}

export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
}

export interface CardContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
}

export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right' | 'between';
}

/* ─────────────────────────────────────────────────────────────────────────────
   STYLES
   ───────────────────────────────────────────────────────────────────────────── */

const cardBaseStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  borderRadius: 'var(--vc-radius-xl)',
  transition: 'all var(--vc-transition-base)',
  overflow: 'hidden',
};

const variantStyles: Record<CardVariant, React.CSSProperties> = {
  default: {
    background: 'rgba(255, 255, 255, 0.85)',
    backdropFilter: 'var(--vc-backdrop-blur)',
    boxShadow: 'var(--vc-shadow-sm)',
    border: '1px solid var(--vc-gray-200)',
  },
  ghost: {
    background: 'transparent',
    border: '1px solid transparent',
  },
  elevated: {
    background: 'var(--vc-gray-0)',
    boxShadow: 'var(--vc-shadow-md)',
    border: '1px solid var(--vc-gray-100)',
  },
};

const paddingStyles: Record<NonNullable<CardProps['padding']>, React.CSSProperties> = {
  none: { padding: 0 },
  sm: { padding: 'var(--vc-space-3)' },
  md: { padding: 'var(--vc-space-4)' },
  lg: { padding: 'var(--vc-space-5)' },
};

const defaultPaddingByVariant: Record<CardVariant, CardProps['padding']> = {
  default: 'md',
  ghost: 'none',
  elevated: 'md',
};

/* ─────────────────────────────────────────────────────────────────────────────
   CARD COMPONENT
   ───────────────────────────────────────────────────────────────────────────── */

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = 'default',
      hover = false,
      accentColor,
      padding,
      children,
      className = '',
      style,
      onMouseEnter,
      onMouseLeave,
      ...props
    },
    ref
  ) => {
    const [isHovered, setIsHovered] = React.useState(false);
    
    const effectivePadding = padding ?? defaultPaddingByVariant[variant];

    const getHoverStyles = (): React.CSSProperties => {
      if (!hover || !isHovered) return {};
      
      return {
        transform: 'scale(1.02)',
        boxShadow: variant === 'elevated' 
          ? 'var(--vc-shadow-lg)' 
          : 'var(--vc-shadow-xl)',
      };
    };

    return (
      <div
        ref={ref}
        className={className}
        style={{
          ...cardBaseStyles,
          ...variantStyles[variant],
          ...paddingStyles[effectivePadding],
          ...getHoverStyles(),
          ...(accentColor && {
            borderLeftWidth: '3px',
            borderLeftColor: accentColor,
          }),
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
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

/* ─────────────────────────────────────────────────────────────────────────────
   CARD HEADER
   ───────────────────────────────────────────────────────────────────────────── */

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ children, className = '', style, ...props }, ref) => (
    <div
      ref={ref}
      className={className}
      style={{
        padding: 'var(--vc-space-4) var(--vc-space-4) var(--vc-space-2)',
        borderBottom: '1px solid var(--vc-gray-100)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  )
);

CardHeader.displayName = 'CardHeader';

/* ─────────────────────────────────────────────────────────────────────────────
   CARD CONTENT
   ───────────────────────────────────────────────────────────────────────────── */

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ children, className = '', style, ...props }, ref) => (
    <div
      ref={ref}
      className={className}
      style={{
        flex: 1,
        padding: 'var(--vc-space-4)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  )
);

CardContent.displayName = 'CardContent';

/* ─────────────────────────────────────────────────────────────────────────────
   CARD FOOTER
   ───────────────────────────────────────────────────────────────────────────── */

const footerAlignStyles: Record<NonNullable<CardFooterProps['align']>, React.CSSProperties> = {
  left: { justifyContent: 'flex-start' },
  center: { justifyContent: 'center' },
  right: { justifyContent: 'flex-end' },
  between: { justifyContent: 'space-between' },
};

export const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ children, className = '', align = 'right', style, ...props }, ref) => (
    <div
      ref={ref}
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--vc-space-3)',
        padding: 'var(--vc-space-2) var(--vc-space-4) var(--vc-space-4)',
        borderTop: '1px solid var(--vc-gray-100)',
        marginTop: 'auto',
        ...footerAlignStyles[align],
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  )
);

CardFooter.displayName = 'CardFooter';

// Asignar subcomponentes
Card.Header = CardHeader;
Card.Content = CardContent;
Card.Footer = CardFooter;

export default Card;

// Import React
import React from 'react';
