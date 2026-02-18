/**
 * Icon library for VoiceCommand app
 * Centralized Lucide icons with consistent sizing
 */

import {
    Eye,
    Link,
    Hand,
    Microscope,
    Clock,
    CheckCircle,
    Send,
    BarChart3,
    Target,
    MessageSquare,
    Users,
    Settings,
    ArrowLeft,
    Building2,
    MapPin,
    X,
    Loader2,
    RefreshCw,
    Search,
    Briefcase,
    GraduationCap,
    Globe,
    Newspaper,
    Lightbulb,
    TrafficCone,
    Save,
    Calendar,
    Mail,
    Store,
    Folder,
    type LucideIcon,
} from 'lucide-react';

// Size definitions
export const ICON_SIZES = {
    sm: 16,
    md: 20,
    lg: 24,
    xl: 32,
} as const;

export type IconSize = keyof typeof ICON_SIZES;

// Pipeline status icons
export const STATUS_ICONS = {
    visitando: Eye,
    conectando: Link,
    interactuando: Hand,
    enriqueciendo: Microscope,
    esperando_aceptacion: Clock,
    aceptado: CheckCircle,
    mensaje_enviado: Send,
} as const;

// Sidebar navigation icons
export const NAV_ICONS = {
    crm: BarChart3,
    prospecting: Target,
    comments: MessageSquare,
    requests: Users,
    config: Settings,
    back: ArrowLeft,
} as const;

// Contact card icons
export const CONTACT_ICONS = {
    company: Building2,
    location: MapPin,
    enriched: CheckCircle,
    enriching: Loader2,
    enrichError: X,
    enrichTrigger: Microscope,
} as const;

// Contact drawer icons
export const DRAWER_ICONS = {
    experience: Briefcase,
    education: GraduationCap,
    company: Building2,
    website: Globe,
    news: Newspaper,
    insights: Lightbulb,
    buyingSignals: TrafficCone,
    save: Save,
    enrichment: Microscope,
    refreshing: Loader2,
    success: CheckCircle,
    error: X,
    link: Link,
    location: MapPin,
    connections: Link,
    locationsCount: Store,
    sector: Folder,
} as const;

// WhatsApp tab icons
export const WHATSAPP_ICONS = {
    schedule: Calendar,
    pending: Clock,
    history: Mail,
} as const;

// Common UI icons
export const UI_ICONS = {
    search: Search,
    refresh: RefreshCw,
    close: X,
    spinner: Loader2,
} as const;

// Re-export all Lucide icons for direct use
export {
    Eye,
    Link,
    Hand,
    Microscope,
    Clock,
    CheckCircle,
    Send,
    BarChart3,
    Target,
    MessageSquare,
    Users,
    Settings,
    ArrowLeft,
    Building2,
    MapPin,
    X,
    Loader2,
    RefreshCw,
    Search,
    Briefcase,
    GraduationCap,
    Globe,
    Newspaper,
    Lightbulb,
    TrafficCone,
    Save,
    Calendar,
    Mail,
    Store,
    Folder,
};

// Helper type for icon components
export type IconComponent = LucideIcon;
