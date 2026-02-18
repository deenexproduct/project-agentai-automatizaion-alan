// server/src/services/openrouter.service.ts
// Generic OpenRouter service with multi-account fallback
// Reusable for enrichment, future messaging, and any AI call

import OpenAI from 'openai';

// ── Load API keys (filter empty strings) ─────────────────────
const KEYS = [
    process.env.OPENROUTER_API_KEY_1,
    process.env.OPENROUTER_API_KEY_2,
    process.env.OPENROUTER_API_KEY_3,
].filter(k => k && k.trim().length > 0) as string[];

const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'moonshotai/kimi-k2';

// ── Types ────────────────────────────────────────────────────
interface CallOptions {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    [key: string]: any;
}

// ── Service ──────────────────────────────────────────────────
class OpenRouterService {
    private clients: OpenAI[];
    private currentKeyIndex = 0;

    constructor() {
        if (KEYS.length === 0) {
            console.warn('⚠️ [OpenRouter] No API keys configured. Set OPENROUTER_API_KEY_1 in .env');
            this.clients = [];
            return;
        }

        this.clients = KEYS.map(key => new OpenAI({
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey: key,
            defaultHeaders: {
                'HTTP-Referer': 'http://localhost:3000',
                'X-Title': 'LinkedIn CRM Enrichment',
            },
        }));

        console.log(`🔑 [OpenRouter] ${this.clients.length} cuenta(s) configurada(s)`);
    }

    /**
     * Call OpenRouter with automatic multi-account fallback.
     * If one account hits rate limit (429), payment required (402), 
     * or forbidden (403), automatically tries the next account.
     */
    async call(messages: OpenAI.Chat.ChatCompletionMessageParam[], options: CallOptions = {}): Promise<string> {
        if (this.clients.length === 0) {
            throw new Error('[OpenRouter] No API keys configured');
        }

        const maxRetries = this.clients.length;
        const {
            model = DEFAULT_MODEL,
            temperature = 0.2,
            max_tokens = 4096,
            ...restOptions
        } = options;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const idx = (this.currentKeyIndex + attempt) % this.clients.length;
            const client = this.clients[idx];

            try {
                console.log(`🔬 [OpenRouter] Usando cuenta ${idx + 1}/${this.clients.length} (modelo: ${model})`);

                const completion = await client.chat.completions.create({
                    model,
                    messages,
                    temperature,
                    max_tokens,
                    ...restOptions,
                });

                const content = completion.choices[0]?.message?.content || '';

                // Success — keep this index for next call
                this.currentKeyIndex = idx;

                console.log(`✅ [OpenRouter] Respuesta recibida (${content.length} chars) vía cuenta ${idx + 1}`);
                return content;

            } catch (error: any) {
                const status = error?.status || error?.response?.status;
                console.error(`⚠️ [OpenRouter] Cuenta ${idx + 1} falló (status: ${status}): ${error.message?.substring(0, 120)}`);

                // Rotate on rate limit, payment, or auth errors
                if (status === 429 || status === 402 || status === 403) {
                    console.log(`🔄 [OpenRouter] Rotando a siguiente cuenta...`);
                    continue;
                }

                // On other errors (500, network, etc.), also try next
                if (attempt < maxRetries - 1) {
                    console.log(`🔄 [OpenRouter] Error genérico, probando siguiente cuenta...`);
                    continue;
                }
            }
        }

        throw new Error(`[OpenRouter] Todas las ${this.clients.length} cuenta(s) fallaron`);
    }

    /**
     * Get the number of configured (active) API keys.
     */
    getActiveKeysCount(): number {
        return this.clients.length;
    }

    /**
     * Check if the service is configured and ready to use.
     */
    isConfigured(): boolean {
        return this.clients.length > 0;
    }
}

export const openRouterService = new OpenRouterService();
