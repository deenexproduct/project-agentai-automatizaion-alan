/**
 * Captcha Handler Service
 * Detecta y maneja captchas de LinkedIn
 * - Detección automática
 * - Notificación al usuario
 * - Pausa de operaciones
 * - Espera de resolución manual
 */

import { Page } from 'puppeteer';
import { EventEmitter } from 'events';
import { healthMonitor } from './health-monitor.service';

export interface CaptchaDetectionResult {
    detected: boolean;
    type?: 'image' | 'recaptcha' | 'challenge' | 'unknown';
    confidence: 'high' | 'medium' | 'low';
}

export class CaptchaHandler extends EventEmitter {
    private isHandlingCaptcha = false;
    private readonly MAX_WAIT_MS = 10 * 60 * 1000; // 10 minutos máximo de espera
    private checkInterval: NodeJS.Timeout | null = null;

    /**
     * Verifica si hay un captcha en la página
     */
    async detect(page: Page): Promise<CaptchaDetectionResult> {
        const result = await page.evaluate(() => {
            const indicators = {
                // Selectores comunes de captcha
                selectors: [
                    'iframe[src*="recaptcha"]',
                    'iframe[src*="captcha"]',
                    '.g-recaptcha',
                    '#captcha',
                    '[data-testid="captcha"]',
                    '.captcha',
                    'input[name="captcha"]',
                    'img[src*="captcha"]',
                    '.challenge',
                    '[aria-label*="captcha" i]',
                    '[aria-label*="security check" i]',
                ],
                // Textos indicativos
                texts: [
                    'captcha',
                    'security check',
                    'verificación de seguridad',
                    'confirm you',
                    'not a robot',
                    'no soy un robot',
                    'please verify',
                    'por favor verifica',
                    'challenge',
                    'desafío',
                ]
            };

            // Buscar por selectores
            for (const selector of indicators.selectors) {
                const el = document.querySelector(selector);
                if (el && (el as HTMLElement).offsetParent !== null) { // Visible
                    return { 
                        detected: true, 
                        type: (selector.includes('recaptcha') ? 'recaptcha' : 'image') as any,
                        confidence: 'high' as any
                    };
                }
            }

            // Buscar por texto
            const pageText = document.body.innerText.toLowerCase();
            const foundTexts = indicators.texts.filter(t => pageText.includes(t.toLowerCase()));
            
            if (foundTexts.length >= 2) {
                return { 
                    detected: true, 
                    type: 'unknown' as any, 
                    confidence: 'medium' as any
                };
            }

            // Verificar si estamos en una URL de challenge
            const url = window.location.href.toLowerCase();
            if (url.includes('challenge') || url.includes('captcha') || url.includes('checkpoint')) {
                return { 
                    detected: true, 
                    type: 'challenge' as any, 
                    confidence: 'high' as any
                };
            }

            return { detected: false, confidence: 'high' as any };
        });

        if (result.detected) {
            healthMonitor.recordCaptcha();
        }

        return result;
    }

    /**
     * Maneja un captcha detectado
     */
    async handle(page: Page, onResolved?: () => void): Promise<'resolved' | 'timeout' | 'aborted'> {
        if (this.isHandlingCaptcha) {
            console.log('[CaptchaHandler] ⏳ Already handling captcha, waiting...');
            return this.waitForResolution();
        }

        this.isHandlingCaptcha = true;
        console.log('[CaptchaHandler] 🔒 CAPTCHA DETECTED - Starting handling protocol');

        try {
            // 1. Notificar
            this.emit('captcha-detected', {
                url: page.url(),
                timestamp: new Date()
            });

            // 2. Pausar operaciones
            await this.pauseOperations();

            // 3. Esperar resolución
            const result = await this.waitForCaptchaResolution(page);

            if (result === 'resolved') {
                console.log('[CaptchaHandler] ✅ Captcha resolved by user');
                healthMonitor.reset(); // Resetear métricas después de resolver
                if (onResolved) onResolved();
            } else if (result === 'timeout') {
                console.error('[CaptchaHandler] ⏰ Captcha resolution timeout');
                this.emit('captcha-timeout');
            }

            return result;
        } finally {
            this.isHandlingCaptcha = false;
            this.stopCheckInterval();
        }
    }

    /**
     * Verifica rápidamente si hay captcha (para verificaciones frecuentes)
     */
    async quickCheck(page: Page): Promise<boolean> {
        // Verificación rápida por URL
        const url = page.url().toLowerCase();
        if (url.includes('challenge') || url.includes('captcha')) {
            return true;
        }

        // Verificación rápida por iframe de recaptcha
        const hasRecaptcha = await page.evaluate(() => {
            return !!document.querySelector('iframe[src*="recaptcha"]');
        });

        return hasRecaptcha;
    }

    /**
     * Indica que el captcha fue resuelto manualmente (llamado desde UI/API)
     */
    markResolved(): void {
        if (this.isHandlingCaptcha) {
            console.log('[CaptchaHandler] 👤 Manual resolution marked');
            this.emit('captcha-resolved-manual');
        }
    }

    /**
     * Aborta el manejo del captcha
     */
    abort(): void {
        console.log('[CaptchaHandler] 🛑 Captcha handling aborted');
        this.isHandlingCaptcha = false;
        this.stopCheckInterval();
        this.emit('captcha-aborted');
    }

    /**
     * Obtiene estado actual
     */
    getStatus(): { handling: boolean; elapsedMs: number } {
        return {
            handling: this.isHandlingCaptcha,
            elapsedMs: 0 // TODO: trackear tiempo
        };
    }

    // ─── Private helpers ─────────────────────────────────────────

    private async pauseOperations(): Promise<void> {
        console.log('[CaptchaHandler] ⏸️ Pausing all operations');
        this.emit('operations-paused');
    }

    private async waitForCaptchaResolution(page: Page): Promise<'resolved' | 'timeout' | 'aborted'> {
        const startTime = Date.now();
        
        return new Promise((resolve) => {
            // Verificar periódicamente si el captcha fue resuelto
            this.checkInterval = setInterval(async () => {
                try {
                    // Verificar si ya no hay captcha
                    const stillHasCaptcha = await this.quickCheck(page);
                    
                    if (!stillHasCaptcha) {
                        resolve('resolved');
                        return;
                    }

                    // Verificar timeout
                    if (Date.now() - startTime > this.MAX_WAIT_MS) {
                        resolve('timeout');
                        return;
                    }

                    // Verificar si fue abortado
                    if (!this.isHandlingCaptcha) {
                        resolve('aborted');
                        return;
                    }
                } catch (error) {
                    // Error en verificación, asumir que sigue resolviendo
                    console.warn('[CaptchaHandler] Error checking captcha status:', error);
                }
            }, 3000); // Verificar cada 3 segundos

            // También escuchar evento de resolución manual
            this.once('captcha-resolved-manual', () => {
                resolve('resolved');
            });

            this.once('captcha-aborted', () => {
                resolve('aborted');
            });
        });
    }

    private waitForResolution(): Promise<'resolved' | 'timeout' | 'aborted'> {
        return new Promise((resolve) => {
            this.once('captcha-resolved-manual', () => resolve('resolved'));
            this.once('captcha-aborted', () => resolve('aborted'));
            
            // Timeout por si no se resuelve
            setTimeout(() => resolve('timeout'), this.MAX_WAIT_MS);
        });
    }

    private stopCheckInterval(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }
}

// Singleton instance
export const captchaHandler = new CaptchaHandler();
