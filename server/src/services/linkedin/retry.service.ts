/**
 * Retry Service
 * Sistema de reintentos con backoff exponencial y jitter
 */

export interface RetryConfig {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    retryableErrors: string[];
    onRetry?: (attempt: number, error: Error, delay: number) => void;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 2000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    retryableErrors: [
        'timeout',
        'net::',
        'Navigation failed',
        'Execution context was destroyed',
        'Target closed',
        'Protocol error',
        'waiting for selector',
        'Unable to find element',
    ]
};

export class RetryService {
    private config: RetryConfig;

    constructor(config: Partial<RetryConfig> = {}) {
        this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
    }

    /**
     * Ejecuta una función con retry automático
     */
    async execute<T>(
        operation: (attempt: number) => Promise<T>,
        context?: string
    ): Promise<T> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = this.calculateDelay(attempt);
                    console.log(`[RetryService] ⏳ Retry ${attempt}/${this.config.maxRetries} for ${context || 'operation'} - waiting ${delay}ms`);
                    
                    if (this.config.onRetry) {
                        this.config.onRetry(attempt, lastError!, delay);
                    }
                    
                    await this.sleep(delay);
                }

                const result = await operation(attempt);
                
                if (attempt > 0) {
                    console.log(`[RetryService] ✅ Retry successful on attempt ${attempt}`);
                }
                
                return result;
            } catch (error: any) {
                lastError = error;
                
                if (!this.isRetryableError(error)) {
                    console.log(`[RetryService] ❌ Non-retryable error: ${error.message}`);
                    throw error;
                }

                if (attempt === this.config.maxRetries) {
                    console.error(`[RetryService] 💥 All retries exhausted for ${context || 'operation'}: ${error.message}`);
                    throw error;
                }

                console.warn(`[RetryService] ⚠️ Attempt ${attempt + 1} failed: ${error.message}`);
            }
        }

        throw lastError || new Error('Unknown error');
    }

    /**
     * Ejecuta con retry pero retorna null en lugar de throw
     */
    async executeSafe<T>(
        operation: (attempt: number) => Promise<T>,
        context?: string
    ): Promise<T | null> {
        try {
            return await this.execute(operation, context);
        } catch {
            return null;
        }
    }

    /**
     * Calcula el delay con backoff exponencial y jitter
     */
    private calculateDelay(attempt: number): number {
        // Backoff exponencial: base * multiplier^(attempt-1)
        const exponentialDelay = this.config.baseDelayMs * Math.pow(
            this.config.backoffMultiplier, 
            attempt - 1
        );
        
        // Agregar jitter aleatorio (±25%)
        const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
        
        // Limitar al máximo
        return Math.min(
            this.config.maxDelayMs,
            exponentialDelay + jitter
        );
    }

    /**
     * Verifica si un error es retryable
     */
    private isRetryableError(error: Error): boolean {
        const errorMessage = error.message.toLowerCase();
        
        return this.config.retryableErrors.some(pattern => 
            errorMessage.includes(pattern.toLowerCase())
        );
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Crea una configuración específica para navegación
     */
    static forNavigation(): RetryService {
        return new RetryService({
            maxRetries: 3,
            baseDelayMs: 3000,
            maxDelayMs: 20000,
            backoffMultiplier: 2,
        });
    }

    /**
     * Crea una configuración específica para clicks
     */
    static forClick(): RetryService {
        return new RetryService({
            maxRetries: 2,
            baseDelayMs: 1000,
            maxDelayMs: 5000,
            backoffMultiplier: 1.5,
        });
    }

    /**
     * Crea una configuración específica para verificación
     */
    static forVerification(): RetryService {
        return new RetryService({
            maxRetries: 3,
            baseDelayMs: 2000,
            maxDelayMs: 15000,
            backoffMultiplier: 2,
        });
    }
}

/**
 * Decorator para métodos con retry automático
 */
export function WithRetry(config: Partial<RetryConfig> = {}) {
    const retryService = new RetryService(config);
    
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        
        descriptor.value = async function (...args: any[]) {
            return retryService.execute(
                () => originalMethod.apply(this, args),
                `${target.constructor.name}.${propertyKey}`
            );
        };
        
        return descriptor;
    };
}
