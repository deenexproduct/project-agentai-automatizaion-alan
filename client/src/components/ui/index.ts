/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * UI COMPONENTS - INDEX
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Exportación centralizada de todos los componentes UI del Design System.
 * 
 * @example
 * ```tsx
 * import { Button, Card, Badge, Input, Icon } from '@/components/ui';
 * 
 * // O importar individualmente
 * import { Button } from '@/components/ui/Button';
 * ```
 */

// Button
export { Button, default as ButtonDefault } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

// Card
export { Card, CardHeader, CardContent, CardFooter, default as CardDefault } from './Card';
export type { CardProps, CardHeaderProps, CardContentProps, CardFooterProps, CardVariant } from './Card';

// Badge
export { Badge, usePipelineColor, usePipelineLabel, default as BadgeDefault } from './Badge';
export type { BadgeProps, BadgeVariant, BadgeSize, PipelineStatus } from './Badge';

// Input
export { Input, default as InputDefault } from './Input';
export type { InputProps, InputVariant, InputSize } from './Input';

// Icon
export { Icon, useIconSize, useIconColor, IconSizes, IconColors, default as IconDefault } from './Icon';
export type { IconProps, IconSize, IconColor } from './Icon';
