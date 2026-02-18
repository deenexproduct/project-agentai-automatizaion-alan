/**
 * StatusIcon Component
 * Renders Lucide icons for each pipeline status with consistent styling
 */

import { STATUS_ICONS, ICON_SIZES, type IconSize } from '../../lib/icons';
import type { ContactStatus } from '../../services/linkedin-crm.service';

interface StatusIconProps {
    status: ContactStatus;
    size?: IconSize | number;
    className?: string;
    color?: string;
}

const STATUS_COLORS: Record<ContactStatus, string> = {
    visitando: '#06b6d4',
    conectando: '#eab308',
    interactuando: '#f97316',
    enriqueciendo: '#a855f7',
    esperando_aceptacion: '#f59e0b',
    aceptado: '#10b981',
    mensaje_enviado: '#8b5cf6',
};

export default function StatusIcon({ 
    status, 
    size = 'md', 
    className = '',
    color 
}: StatusIconProps) {
    const Icon = STATUS_ICONS[status];
    const iconSize = typeof size === 'number' ? size : ICON_SIZES[size];
    const iconColor = color || STATUS_COLORS[status];

    if (!Icon) return null;

    return (
        <Icon 
            size={iconSize} 
            color={iconColor}
            className={className}
            strokeWidth={2}
        />
    );
}

// Helper to get status config (icon component, label, color)
export function getStatusConfig(status: ContactStatus) {
    return {
        Icon: STATUS_ICONS[status],
        label: {
            visitando: 'Visitando',
            conectando: 'Conectando',
            interactuando: 'Interactuando',
            enriqueciendo: 'Enriqueciendo',
            esperando_aceptacion: 'Esperando Aceptación',
            aceptado: 'Aceptado',
            mensaje_enviado: 'Mensaje Enviado',
        }[status],
        color: STATUS_COLORS[status],
    };
}
