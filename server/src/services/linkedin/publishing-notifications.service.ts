/**
 * Publishing Notification Service
 *
 * Event-driven notification system for the LinkedIn Publishing lifecycle.
 * Emits structured events that can be consumed by WhatsApp, email, webhooks, etc.
 *
 * Events:
 *   post:generated   — Draft ready for review
 *   post:approved    — Post approved for publishing
 *   post:published   — Post successfully published
 *   post:failed      — Post failed to publish
 *   post:rejected    — Post rejected by user
 *   ai:health        — Ollama went down or recovered
 */

import { EventEmitter } from 'events';

// ── Types ──────────────────────────────────────────────────────

export type NotificationChannel = 'console' | 'whatsapp' | 'webhook';
export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

export interface PublishingNotification {
    event: string;
    priority: NotificationPriority;
    title: string;
    message: string;
    metadata?: Record<string, unknown>;
    timestamp: Date;
}

export type NotificationHandler = (notification: PublishingNotification) => void | Promise<void>;

// ── Event Templates ──────────────────────────────────────────

const TEMPLATES: Record<string, { title: string; priority: NotificationPriority; message: (data: any) => string }> = {
    'post:generated': {
        title: '✨ Post generado',
        priority: 'medium',
        message: (d) => `Nuevo borrador "${d.idea?.substring(0, 60)}..." listo para revisión. Pilar: ${d.pilar || 'auto'}. Engagement predicho: ${d.engagement || '—'}.`,
    },
    'post:approved': {
        title: '✅ Post aprobado',
        priority: 'low',
        message: (d) => `Post aprobado. Publicación programada para ${d.scheduledAt ? new Date(d.scheduledAt).toLocaleString('es-AR') : '—'}.`,
    },
    'post:published': {
        title: '🚀 Post publicado',
        priority: 'high',
        message: (d) => `Post publicado exitosamente en LinkedIn.${d.url ? ` URL: ${d.url}` : ''}`,
    },
    'post:failed': {
        title: '❌ Publicación fallida',
        priority: 'critical',
        message: (d) => `Error al publicar: ${d.error || 'Unknown error'}. Reintentos: ${d.retryCount ?? 0}/3.`,
    },
    'post:rejected': {
        title: '👎 Post rechazado',
        priority: 'low',
        message: (d) => `Post rechazado.${d.reason ? ` Motivo: ${d.reason}` : ''}`,
    },
    'ai:health:down': {
        title: '🔴 Ollama caído',
        priority: 'critical',
        message: (d) => `Ollama no responde en ${d.url || 'localhost:11434'}. ${d.error || ''}`,
    },
    'ai:health:recovered': {
        title: '🟢 Ollama recuperado',
        priority: 'medium',
        message: () => 'Ollama volvió a estar disponible.',
    },
    'scheduler:daily_summary': {
        title: '📊 Resumen diario',
        priority: 'low',
        message: (d) => `Hoy: ${d.published || 0} publicados, ${d.pending || 0} pendientes, ${d.failed || 0} fallidos.`,
    },
};

// ── Service ──────────────────────────────────────────────────

class PublishingNotificationService {
    private emitter = new EventEmitter();
    private handlers: Map<NotificationChannel, NotificationHandler> = new Map();
    private history: PublishingNotification[] = [];
    private readonly maxHistory = 100;

    constructor() {
        // Register default console handler
        this.registerChannel('console', (notif) => {
            const prefix = notif.priority === 'critical' ? '🚨' : notif.priority === 'high' ? '📢' : '📋';
            console.log(`[Notifications] ${prefix} ${notif.title}: ${notif.message}`);
        });
    }

    /**
     * Register a notification channel handler.
     * Can be extended later for WhatsApp, Slack, email, etc.
     */
    registerChannel(channel: NotificationChannel, handler: NotificationHandler): void {
        this.handlers.set(channel, handler);
        console.log(`[Notifications] Channel "${channel}" registered`);
    }

    /**
     * Emit a notification event.
     */
    async notify(event: string, data: Record<string, unknown> = {}): Promise<void> {
        const template = TEMPLATES[event];

        const notification: PublishingNotification = {
            event,
            priority: template?.priority || 'low',
            title: template?.title || event,
            message: template ? template.message(data) : JSON.stringify(data),
            metadata: data,
            timestamp: new Date(),
        };

        // Store in history
        this.history.unshift(notification);
        if (this.history.length > this.maxHistory) {
            this.history = this.history.slice(0, this.maxHistory);
        }

        // Dispatch to all registered handlers
        for (const [channel, handler] of this.handlers) {
            try {
                await handler(notification);
            } catch (err: any) {
                console.error(`[Notifications] Error in channel "${channel}":`, err.message);
            }
        }

        // Emit to internal listeners
        this.emitter.emit(event, notification);
        this.emitter.emit('*', notification);
    }

    /**
     * Subscribe to notification events.
     */
    on(event: string, listener: (notification: PublishingNotification) => void): void {
        this.emitter.on(event, listener);
    }

    /**
     * Get recent notifications.
     */
    getRecent(limit = 20): PublishingNotification[] {
        return this.history.slice(0, limit);
    }

    /**
     * Get notifications filtered by priority.
     */
    getByPriority(priority: NotificationPriority, limit = 20): PublishingNotification[] {
        return this.history.filter(n => n.priority === priority).slice(0, limit);
    }
}

// Export singleton
export const publishingNotifications = new PublishingNotificationService();
