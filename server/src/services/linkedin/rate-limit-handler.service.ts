/**
 * Rate Limit Handler Service
 * Detecta y maneja límites de rate de LinkedIn
 * - Detección de rate limiting
 * - Backoff exponencial
 * - Programación de reanudación
 * - Notificaciones al usuario
 */

import { Page } from 'puppeteer';
import { EventEmitter } from 'events';

export interface RateLimitInfo {
    isRateLimited: boolean;
    type?: 'weekly' | 'daily' | 'hourly' | 'temporary';
    message?: string;
    suggestedWaitHours?: number;
}

export class RateLimitHandler extends EventEmitter {
    private consecutiveLimits = 0;
    private lastLimitTime: Date | null = null;
    private isPaused = false;
    private resumeTimer: NodeJS.Timeout | null = null;

    // Patrones de detección
    private readonly RATE_LIMIT_PATTERNS = [
        {
            pattern: /weekly invitation limit/i,
            type: 'weekly' as const,
            waitHours: 168 // 7 días
        },
        {
            pattern: /you've reached.*limit/i,
            type: 'daily' as const,
            waitHours: 24
        },
        {
            pattern: /too many requests/i,
            type: 'hourly' as const,
            waitHours: 1
        },
        {
            pattern: /temporarily restricted/i,
            type: 'temporary' as const,
            waitHours: 4
        },
        {
            pattern: /slow down/i,
            type: 'hourly' as const,
            waitHours: 2
        },
        {
            pattern: /action blocked/i,
            type: 'temporary' as const,
            waitHours: 24
        }
    ];

    /**
     * Detecta si hay rate limiting en la página
     */
    async detect(page: Page): Promise<RateLimitInfo> {
        const pageText = await page.evaluate(() => document.body.innerText);
        const url = page.url();

        // Buscar patrones en el texto
        for (const { pattern, type, waitHours } of this.RATE_LIMIT_PATTERNS) {
            if (pattern.test(pageText)) {
                this.consecutiveLimits++;
                this.lastLimitTime = new Date();

                // Extraer mensaje específico
                const lines = pageText.split('\n');
                const message = lines.find(l => pattern.test(l)) || `Rate limit detected: ${type}`;

                return {
                    isRateLimited: true,
                    type,
                    message: message.trim(),
                    suggestedWaitHours: this.calculateBackoff(waitHours)
                };
            }
        }

        // Verificar por URL (checkpoint/challenge pages)
        if (url.includes('/checkpoint/') || url.includes('/challenge/')) {
            return {
                isRateLimited: true,
                type: 'temporary',
                message: 'LinkedIn security checkpoint detected',
                suggestedWaitHours: this.calculateBackoff(4)
            };
        }

        return { isRateLimited: false };
    }

    /**
     * Maneja el rate limit detectado
     */
    async handle(page: Page, info?: RateLimitInfo): Promise<void> {
        const limitInfo = info || await this.detect(page);

        if (!limitInfo.isRateLimited) {
            return;
        }

        console.log(`[RateLimitHandler] 🚫 RATE LIMIT DETECTED: ${limitInfo.type}`);
        console.log(`   Message: ${limitInfo.message}`);
        console.log(`   Suggested wait: ${limitInfo.suggestedWaitHours} hours`);

        this.emit('rate-limit-detected', limitInfo);

        // Pausar operaciones
        await this.pauseOperations(limitInfo);

        // Programar reanudación
        if (limitInfo.suggestedWaitHours) {
            this.scheduleResume(limitInfo.suggestedWaitHours);
        }
    }

    /**
     * Verifica si actualmente estamos en rate limit
     */
    isCurrentlyLimited(): boolean {
        return this.isPaused;
    }

    /**
     * Obtiene tiempo estimado para reanudar
     */
    getResumeTime(): Date | null {
        if (!this.isPaused || !this.lastLimitTime) return null;
        
        // Estimar basado en último limit
        const waitMs = this.calculateBackoff(4) * 60 * 60 * 1000;
        return new Date(this.lastLimitTime.getTime() + waitMs);
    }

    /**
     * Reanuda operaciones manualmente
     */
    resume(): void {
        if (this.isPaused) {
            console.log('[RateLimitHandler] ▶️ Operations resumed manually');
            this.isPaused = false;
            this.consecutiveLimits = 0;
            
            if (this.resumeTimer) {
                clearTimeout(this.resumeTimer);
                this.resumeTimer = null;
            }
            
            this.emit('rate-limit-resumed');
        }
    }

    /**
     * Obtiene estado actual
     */
    getStatus(): {
        isPaused: boolean;
        consecutiveLimits: number;
        lastLimitTime: Date | null;
        resumeTime: Date | null;
    } {
        return {
            isPaused: this.isPaused,
            consecutiveLimits: this.consecutiveLimits,
            lastLimitTime: this.lastLimitTime,
            resumeTime: this.getResumeTime()
        };
    }

    /**
     * Sugiere delay entre acciones basado en estado
     */
    getRecommendedDelay(): number {
        if (this.consecutiveLimits === 0) {
            return 0; // Sin delay extra
        }
        
        // Aumentar delay progresivamente
        const baseDelay = 5000; // 5 segundos
        const multiplier = Math.min(5, this.consecutiveLimits);
        return baseDelay * multiplier;
    }

    /**
     * Resetea el contador de límites consecutivos
     * Llamar cuando una operación tiene éxito
     */
    recordSuccess(): void {
        if (this.consecutiveLimits > 0) {
            console.log('[RateLimitHandler] ✅ Success recorded, resetting limit counter');
            this.consecutiveLimits = 0;
        }
    }

    // ─── Private helpers ─────────────────────────────────────────

    private calculateBackoff(baseHours: number): number {
        // Backoff exponencial: base * 2^(consecutiveLimits-1)
        if (this.consecutiveLimits <= 1) {
            return baseHours;
        }
        
        const multiplier = Math.pow(2, this.consecutiveLimits - 1);
        const result = Math.round(baseHours * multiplier);
        
        // Cap en 7 días (168 horas)
        return Math.min(168, result);
    }

    private async pauseOperations(info: RateLimitInfo): Promise<void> {
        this.isPaused = true;
        console.log('[RateLimitHandler] ⏸️ Operations paused due to rate limit');
        this.emit('operations-paused', info);
    }

    private scheduleResume(hours: number): void {
        const ms = hours * 60 * 60 * 1000;
        
        console.log(`[RateLimitHandler] ⏰ Scheduled resume in ${hours} hours (${new Date(Date.now() + ms).toLocaleString()})`);
        
        if (this.resumeTimer) {
            clearTimeout(this.resumeTimer);
        }
        
        this.resumeTimer = setTimeout(() => {
            console.log('[RateLimitHandler] ▶️ Auto-resuming after rate limit');
            this.resume();
        }, ms);
        
        this.emit('resume-scheduled', { hours, timestamp: new Date(Date.now() + ms) });
    }
}

// Singleton instance
export const rateLimitHandler = new RateLimitHandler();
