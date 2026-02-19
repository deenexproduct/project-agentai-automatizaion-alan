/**
 * OllamaService
 *
 * Wrapper around the Ollama REST API for local LLM text generation.
 * Handles retries with exponential backoff, health checks, and descriptive errors.
 *
 * Usage:
 *   const response = await ollamaService.chat([
 *     { role: 'system', content: '...' },
 *     { role: 'user', content: '...' },
 *   ]);
 */

import { OLLAMA_CONFIG } from '../../config/ai.config';

// ── Types ─────────────────────────────────────────────────────

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface OllamaOptions {
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    model?: string;
    timeoutMs?: number;
}

export interface OllamaResponse {
    content: string;
    model: string;
    totalDuration: number;  // nanoseconds
    evalCount: number;      // tokens generated
}

export interface OllamaHealthStatus {
    healthy: boolean;
    models: string[];
    error?: string;
}

// ── Service ───────────────────────────────────────────────────

class OllamaService {
    private readonly baseUrl: string;
    private readonly defaultModel: string;
    private readonly fallbackModel: string;

    constructor() {
        this.baseUrl = OLLAMA_CONFIG.baseUrl;
        this.defaultModel = OLLAMA_CONFIG.textModel;
        this.fallbackModel = OLLAMA_CONFIG.fallbackModel;
    }

    // ── Health Check ──────────────────────────────────────────

    async healthCheck(): Promise<OllamaHealthStatus> {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            const res = await fetch(`${this.baseUrl}/api/tags`, {
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (!res.ok) {
                return { healthy: false, models: [], error: `HTTP ${res.status}` };
            }

            const data = await res.json();
            const models = (data.models || []).map((m: any) => m.name);

            return { healthy: true, models };
        } catch (err: any) {
            return {
                healthy: false,
                models: [],
                error: `Ollama no está disponible en ${this.baseUrl}. ¿Está corriendo? Ejecutá: ollama serve`,
            };
        }
    }

    // ── Chat (multi-message) ──────────────────────────────────

    async chat(messages: ChatMessage[], options?: OllamaOptions): Promise<OllamaResponse> {
        const model = options?.model || this.defaultModel;
        const startTime = Date.now();

        const body = {
            model,
            messages,
            stream: false,
            options: {
                temperature: options?.temperature ?? OLLAMA_CONFIG.temperature,
                top_p: options?.topP ?? OLLAMA_CONFIG.topP,
                num_predict: options?.maxTokens ?? OLLAMA_CONFIG.maxTokens,
            },
        };

        const response = await this.requestWithRetry(
            `${this.baseUrl}/api/chat`,
            body,
            model,
            options?.timeoutMs
        );

        const elapsed = Date.now() - startTime;
        const content = response.message?.content || '';
        const evalCount = response.eval_count || 0;

        console.log(
            `[OllamaService] Chat completed: model=${model}, tokens=${evalCount}, time=${elapsed}ms`
        );

        return {
            content,
            model: response.model || model,
            totalDuration: response.total_duration || 0,
            evalCount,
        };
    }

    // ── Generate (single prompt) ──────────────────────────────

    async generate(prompt: string, options?: OllamaOptions): Promise<OllamaResponse> {
        const model = options?.model || this.defaultModel;
        const startTime = Date.now();

        const body = {
            model,
            prompt,
            stream: false,
            options: {
                temperature: options?.temperature ?? OLLAMA_CONFIG.temperature,
                top_p: options?.topP ?? OLLAMA_CONFIG.topP,
                num_predict: options?.maxTokens ?? OLLAMA_CONFIG.maxTokens,
            },
        };

        const response = await this.requestWithRetry(
            `${this.baseUrl}/api/generate`,
            body,
            model,
            options?.timeoutMs
        );

        const elapsed = Date.now() - startTime;
        const content = response.response || '';

        console.log(
            `[OllamaService] Generate completed: model=${model}, time=${elapsed}ms`
        );

        return {
            content,
            model: response.model || model,
            totalDuration: response.total_duration || 0,
            evalCount: response.eval_count || 0,
        };
    }

    // ── Request with Retry ────────────────────────────────────

    private async requestWithRetry(
        url: string,
        body: any,
        model: string,
        timeoutMs?: number
    ): Promise<any> {
        const attempts = OLLAMA_CONFIG.retryAttempts;
        const backoff = OLLAMA_CONFIG.retryBackoffMs;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt < attempts; attempt++) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(
                    () => controller.abort(),
                    timeoutMs || OLLAMA_CONFIG.timeoutMs
                );

                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    signal: controller.signal,
                });
                clearTimeout(timeout);

                if (!res.ok) {
                    const errText = await res.text().catch(() => '');
                    // Model not found
                    if (res.status === 404 || errText.includes('not found')) {
                        throw new Error(
                            `Modelo "${model}" no encontrado. Ejecutá: ollama pull ${model}`
                        );
                    }
                    throw new Error(`Ollama HTTP ${res.status}: ${errText}`);
                }

                return await res.json();
            } catch (err: any) {
                lastError = err;

                // Don't retry model-not-found errors
                if (err.message?.includes('no encontrado')) {
                    throw err;
                }

                if (attempt < attempts - 1) {
                    const delay = backoff[attempt] || backoff[backoff.length - 1];
                    console.warn(
                        `[OllamaService] Attempt ${attempt + 1}/${attempts} failed: ${err.message}. Retrying in ${delay}ms...`
                    );
                    await new Promise((r) => setTimeout(r, delay));
                }
            }
        }

        throw new Error(
            `Ollama falló después de ${attempts} intentos. Último error: ${lastError?.message}. ` +
            `Probá con un modelo más liviano: ollama pull ${this.fallbackModel}`
        );
    }
}

// ── Singleton ─────────────────────────────────────────────────

export const ollamaService = new OllamaService();
