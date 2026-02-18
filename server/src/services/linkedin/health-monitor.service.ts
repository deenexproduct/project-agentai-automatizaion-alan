/**
 * Health Monitor Service
 * Monitorea la salud del sistema de prospecting y detecta problemas
 * - Detecta stalls (operaciones colgadas)
 * - Detecta spikes de errores
 * - Detecta patrones de riesgo
 * - Dispara alertas y recuperación automática
 */

import { EventEmitter } from 'events';

export interface HealthStatus {
    healthy: boolean;
    riskScore: number; // 0-100
    consecutiveErrors: number;
    lastSuccessTimestamp: Date | null;
    currentOperation: string;
    alerts: string[];
}

export interface MetricSnapshot {
    timestamp: Date;
    profilesProcessed: number;
    successRate: number;
    avgTimePerProfile: number;
    errorRate: number;
}

export class HealthMonitor extends EventEmitter {
    private lastSuccessTimestamp: Date = new Date();
    private consecutiveErrors = 0;
    private consecutiveCaptchas = 0;
    private profilesSinceStart = 0;
    private errorCount = 0;
    private successCount = 0;
    private profileStartTimes: Date[] = [];
    private currentOperation = 'idle';
    private alerts: string[] = [];
    
    // Umbrales
    private readonly STALL_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutos sin éxito
    private readonly ERROR_THRESHOLD = 5; // 5 errores consecutivos
    private readonly CAPTCHA_THRESHOLD = 3; // 3 captchas consecutivos
    private readonly MAX_AVG_TIME_MS = 5 * 60 * 1000; // 5 min por perfil promedio

    // Historial de métricas
    private metricsHistory: MetricSnapshot[] = [];
    private readonly MAX_HISTORY = 100;

    /**
     * Registra un perfil procesado exitosamente
     */
    recordSuccess(durationMs: number): void {
        this.lastSuccessTimestamp = new Date();
        this.consecutiveErrors = 0;
        this.consecutiveCaptchas = 0;
        this.successCount++;
        this.profilesSinceStart++;
        this.profileStartTimes.push(new Date());
        this.trimHistory();
        
        this.emit('success', { durationMs, totalProcessed: this.profilesSinceStart });
        
        // Verificar si recuperamos de un estado de error
        if (this.consecutiveErrors === 0 && this.alerts.length > 0) {
            this.clearAlerts();
        }
    }

    /**
     * Registra un error
     */
    recordError(error: Error, context?: string): void {
        this.consecutiveErrors++;
        this.errorCount++;
        
        console.warn(`[HealthMonitor] ⚠️ Error recorded (${this.consecutiveErrors}/${this.ERROR_THRESHOLD}): ${error.message}`);
        
        this.emit('error', { error, context, consecutive: this.consecutiveErrors });

        // Alerta si hay muchos errores consecutivos
        if (this.consecutiveErrors >= this.ERROR_THRESHOLD) {
            const alert = `ERROR_SPIKE: ${this.consecutiveErrors} consecutive errors`;
            this.addAlert(alert);
            this.emit('error-spike', { count: this.consecutiveErrors });
        }
    }

    /**
     * Registra un captcha detectado
     */
    recordCaptcha(): void {
        this.consecutiveCaptchas++;
        console.warn(`[HealthMonitor] 🔒 Captcha recorded (${this.consecutiveCaptchas}/${this.CAPTCHA_THRESHOLD})`);
        
        this.emit('captcha', { consecutive: this.consecutiveCaptchas });

        if (this.consecutiveCaptchas >= this.CAPTCHA_THRESHOLD) {
            const alert = `CAPTCHA_SPIKE: ${this.consecutiveCaptchas} consecutive captchas`;
            this.addAlert(alert);
            this.emit('captcha-spike', { count: this.consecutiveCaptchas });
        }
    }

    /**
     * Inicia monitoreo de una operación
     */
    startOperation(operation: string): void {
        this.currentOperation = operation;
        this.emit('operation-start', operation);
    }

    /**
     * Finaliza monitoreo de operación
     */
    endOperation(): void {
        this.currentOperation = 'idle';
        this.emit('operation-end');
    }

    /**
     * Obtiene estado de salud actual
     */
    getHealthStatus(): HealthStatus {
        const riskScore = this.calculateRiskScore();
        const isStalled = this.isStalled();
        
        const alerts = [...this.alerts];
        
        if (isStalled) {
            alerts.push(`STALL_DETECTED: No success for ${this.getStallDurationMinutes()}min`);
        }

        return {
            healthy: riskScore < 50 && !isStalled && this.consecutiveErrors < this.ERROR_THRESHOLD,
            riskScore,
            consecutiveErrors: this.consecutiveErrors,
            lastSuccessTimestamp: this.lastSuccessTimestamp,
            currentOperation: this.currentOperation,
            alerts
        };
    }

    /**
     * Verifica si el sistema está en stall
     */
    isStalled(): boolean {
        const stallDuration = Date.now() - this.lastSuccessTimestamp.getTime();
        return stallDuration > this.STALL_THRESHOLD_MS;
    }

    /**
     * Obtiene métricas actuales
     */
    getMetrics(): MetricSnapshot {
        const recent = this.metricsHistory.slice(-20);
        
        return {
            timestamp: new Date(),
            profilesProcessed: this.profilesSinceStart,
            successRate: this.calculateSuccessRate(),
            avgTimePerProfile: this.calculateAvgTime(),
            errorRate: this.calculateErrorRate()
        };
    }

    /**
     * Obtiene historial de métricas
     */
    getMetricsHistory(): MetricSnapshot[] {
        return [...this.metricsHistory];
    }

    /**
     * Resetea contadores (útil después de recovery)
     */
    reset(): void {
        this.consecutiveErrors = 0;
        this.consecutiveCaptchas = 0;
        this.errorCount = 0;
        this.successCount = 0;
        this.alerts = [];
        this.lastSuccessTimestamp = new Date();
        console.log('[HealthMonitor] 🔄 Metrics reset');
    }

    /**
     * Verifica si se debe detener por seguridad
     */
    shouldEmergencyStop(): boolean {
        return this.consecutiveErrors >= this.ERROR_THRESHOLD * 2 || // 10 errores
               this.consecutiveCaptchas >= this.CAPTCHA_THRESHOLD || // 3 captchas
               this.isStalled();
    }

    /**
     * Obtiene recomendación de acción
     */
    getRecommendation(): string {
        if (this.shouldEmergencyStop()) {
            return 'EMERGENCY_STOP: Too many errors/captchas or stalled';
        }
        if (this.consecutiveErrors >= this.ERROR_THRESHOLD) {
            return 'PAUSE_AND_INVESTIGATE: High error rate detected';
        }
        if (this.consecutiveCaptchas >= 2) {
            return 'SLOW_DOWN: Multiple captchas detected, increase delays';
        }
        if (this.calculateRiskScore() > 70) {
            return 'REDUCE_SPEED: Risk score elevated';
        }
        return 'CONTINUE: Operating normally';
    }

    // ─── Private helpers ─────────────────────────────────────────

    private calculateRiskScore(): number {
        let score = 0;
        
        // Errores: máximo 40 puntos
        score += Math.min(40, this.consecutiveErrors * 8);
        
        // Captchas: máximo 30 puntos
        score += Math.min(30, this.consecutiveCaptchas * 10);
        
        // Stall: 25 puntos
        if (this.isStalled()) {
            score += 25;
        }
        
        // Tasa de éxito baja: máximo 20 puntos
        const successRate = this.calculateSuccessRate();
        if (this.profilesSinceStart > 5 && successRate < 0.7) {
            score += Math.min(20, (0.7 - successRate) * 100);
        }
        
        return Math.min(100, Math.round(score));
    }

    private calculateSuccessRate(): number {
        const total = this.successCount + this.errorCount;
        if (total === 0) return 1;
        return this.successCount / total;
    }

    private calculateErrorRate(): number {
        const total = this.successCount + this.errorCount;
        if (total === 0) return 0;
        return this.errorCount / total;
    }

    private calculateAvgTime(): number {
        if (this.profileStartTimes.length < 2) return 0;
        
        const recent = this.profileStartTimes.slice(-10);
        if (recent.length < 2) return 0;
        
        let totalTime = 0;
        for (let i = 1; i < recent.length; i++) {
            totalTime += recent[i].getTime() - recent[i-1].getTime();
        }
        
        return Math.round(totalTime / (recent.length - 1));
    }

    private getStallDurationMinutes(): number {
        return Math.round((Date.now() - this.lastSuccessTimestamp.getTime()) / 60000);
    }

    private addAlert(alert: string): void {
        if (!this.alerts.includes(alert)) {
            this.alerts.push(alert);
            console.error(`[HealthMonitor] 🚨 ALERT: ${alert}`);
        }
    }

    private clearAlerts(): void {
        if (this.alerts.length > 0) {
            console.log('[HealthMonitor] ✅ Alerts cleared');
            this.alerts = [];
        }
    }

    private trimHistory(): void {
        // Mantener solo últimas 100 métricas
        if (this.metricsHistory.length >= this.MAX_HISTORY) {
            this.metricsHistory.shift();
        }
        
        // Agregar snapshot actual
        this.metricsHistory.push({
            timestamp: new Date(),
            profilesProcessed: this.profilesSinceStart,
            successRate: this.calculateSuccessRate(),
            avgTimePerProfile: this.calculateAvgTime(),
            errorRate: this.calculateErrorRate()
        });
    }
}

// Singleton instance
export const healthMonitor = new HealthMonitor();
