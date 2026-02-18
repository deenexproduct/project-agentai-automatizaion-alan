/**
 * Operation Manager Service
 * Previene race conditions entre operaciones concurrentes
 * Mutex global con timeout automático
 */

export type OperationType = 'prospecting' | 'checking_accepted' | 'enriching' | 'none';

interface OperationState {
    type: OperationType;
    startTime: Date;
    metadata?: Record<string, any>;
}

export class OperationManager {
    private currentOp: OperationState | null = null;
    private readonly MAX_OP_DURATION_MS = 30 * 60 * 1000; // 30 minutos timeout
    private operationHistory: Array<{ op: OperationType; start: Date; end: Date; success: boolean }> = [];

    /**
     * Intenta adquirir el lock para una operación
     * @returns true si se adquirió el lock, false si está ocupado
     */
    async acquire(operation: OperationType, metadata?: Record<string, any>): Promise<boolean> {
        // Verificar si hay operación colgada
        if (this.currentOp) {
            const duration = Date.now() - this.currentOp.startTime.getTime();
            
            if (duration > this.MAX_OP_DURATION_MS) {
                console.warn(`[OperationManager] ⚠️ Operation ${this.currentOp.type} timeout (${Math.round(duration / 60000)}min) - auto-releasing`);
                this.recordHistory(this.currentOp.type, this.currentOp.startTime, new Date(), false);
                this.release();
            } else {
                console.log(`[OperationManager] ❌ Cannot acquire '${operation}' - '${this.currentOp.type}' in progress (${Math.round(duration / 1000)}s)`);
                return false;
            }
        }

        this.currentOp = {
            type: operation,
            startTime: new Date(),
            metadata
        };

        console.log(`[OperationManager] ✅ Lock acquired: ${operation}`);
        return true;
    }

    /**
     * Libera el lock actual
     */
    release(): void {
        if (this.currentOp) {
            const duration = Date.now() - this.currentOp.startTime.getTime();
            console.log(`[OperationManager] 🔓 Lock released: ${this.currentOp.type} (duration: ${Math.round(duration / 1000)}s)`);
            this.recordHistory(this.currentOp.type, this.currentOp.startTime, new Date(), true);
            this.currentOp = null;
        }
    }

    /**
     * Obtiene la operación actual
     */
    getCurrent(): OperationType {
        return this.currentOp?.type || 'none';
    }

    /**
     * Verifica si hay operación en curso
     */
    isBusy(): boolean {
        // Auto-cleanup de operaciones colgadas
        if (this.currentOp) {
            const duration = Date.now() - this.currentOp.startTime.getTime();
            if (duration > this.MAX_OP_DURATION_MS) {
                this.release();
                return false;
            }
            return true;
        }
        return false;
    }

    /**
     * Obtiene información de la operación actual
     */
    getCurrentOperationInfo(): OperationState | null {
        return this.currentOp ? { ...this.currentOp } : null;
    }

    /**
     * Fuerza la liberación del lock (emergency)
     */
    forceRelease(): void {
        if (this.currentOp) {
            console.warn(`[OperationManager] 🚨 FORCE RELEASE of ${this.currentOp.type}`);
            this.recordHistory(this.currentOp.type, this.currentOp.startTime, new Date(), false);
            this.currentOp = null;
        }
    }

    /**
     * Obtiene historial de operaciones
     */
    getHistory(limit: number = 50): Array<{ op: OperationType; start: Date; end: Date; success: boolean; durationSec: number }> {
        return this.operationHistory
            .slice(-limit)
            .map(h => ({
                ...h,
                durationSec: Math.round((h.end.getTime() - h.start.getTime()) / 1000)
            }));
    }

    private recordHistory(op: OperationType, start: Date, end: Date, success: boolean): void {
        this.operationHistory.push({ op, start, end, success });
        // Mantener solo últimas 100 operaciones
        if (this.operationHistory.length > 100) {
            this.operationHistory.shift();
        }
    }
}

// Singleton instance
export const operationManager = new OperationManager();
