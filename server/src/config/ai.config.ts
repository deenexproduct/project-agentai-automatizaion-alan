/**
 * AI Configuration
 *
 * Centralized configuration for all AI services (Ollama text, image generation).
 * All values can be overridden via environment variables.
 *
 * COST: $0/month — everything runs locally.
 */

// ── Ollama (Text Generation) ─────────────────────────────────

export const OLLAMA_CONFIG = {
    baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
    textModel: process.env.OLLAMA_TEXT_MODEL || 'mistral:latest',
    fallbackModel: process.env.OLLAMA_FALLBACK_MODEL || 'mistral:latest',
    temperature: parseFloat(process.env.OLLAMA_TEMPERATURE || '0.7'),
    topP: parseFloat(process.env.OLLAMA_TOP_P || '0.9'),
    maxTokens: parseInt(process.env.OLLAMA_MAX_TOKENS || '1024', 10),
    timeoutMs: parseInt(process.env.OLLAMA_TIMEOUT_MS || '60000', 10),
    retryAttempts: 3,
    retryBackoffMs: [1000, 3000, 9000], // exponential backoff
} as const;

// ── OpenRouter (Content Publishing — free models) ────────────

export const OPENROUTER_PUBLISHING_CONFIG = {
    /** Primary free model for content generation */
    model: process.env.OPENROUTER_PUBLISHING_MODEL || 'google/gemini-2.0-flash-lite-preview-02-05:free',
    /** Fallback model if primary fails */
    fallbackModel: process.env.OPENROUTER_PUBLISHING_FALLBACK || 'qwen/qwen3-coder:free',
    temperature: parseFloat(process.env.OPENROUTER_PUBLISHING_TEMP || '0.7'),
    maxTokens: parseInt(process.env.OPENROUTER_PUBLISHING_MAX_TOKENS || '2048', 10),
} as const;

// ── Image Generation ─────────────────────────────────────────

export const IMAGE_CONFIG = {
    provider: (process.env.IMAGE_PROVIDER || 'ollama') as 'ollama' | 'comfyui',
    ollama: {
        model: process.env.OLLAMA_IMAGE_MODEL || 'z-image-turbo',
        timeoutMs: 30000,
    },
    comfyui: {
        baseUrl: process.env.COMFYUI_URL || 'http://localhost:8188',
        timeoutMs: 120000,
    },
    output: {
        directory: process.env.IMAGE_OUTPUT_DIR || 'data/generated-images',
        formats: {
            square: { width: 1080, height: 1080 },
            landscape: { width: 1200, height: 627 },
            carousel: { width: 1080, height: 1350 },
        },
    },
} as const;

// ── Scheduler ────────────────────────────────────────────────

export const SCHEDULER_CONFIG = {
    /** Cron: generate daily post (Mon-Fri at 22:00 local) */
    generateCron: process.env.SCHEDULER_GENERATE_CRON || '0 22 * * 1-5',
    /** Cron: scrape trends (every 6 hours) */
    trendsCron: process.env.SCHEDULER_TRENDS_CRON || '0 */6 * * *',
    /** Interval: check publish queue (every 60 seconds) */
    publishIntervalMs: parseInt(process.env.SCHEDULER_PUBLISH_INTERVAL_MS || '60000', 10),
    /** Metrics scraping intervals after publish */
    metricsScrapeDelays: [
        4 * 60 * 60 * 1000,   // 4 hours
        24 * 60 * 60 * 1000,  // 24 hours
        7 * 24 * 60 * 60 * 1000, // 7 days
    ],
    timezone: process.env.SCHEDULER_TIMEZONE || 'America/Argentina/Buenos_Aires',
} as const;

// ── Content Rules ────────────────────────────────────────────

export const CONTENT_RULES = {
    maxPostLength: 3000,
    maxHashtags: 5,
    /** Delivery apps — NEVER mention by name */
    blockedDeliveryApps: ['Rappi', 'PedidosYa', 'Uber Eats', 'iFood', 'Didi Food', 'Glovo'],
    /** Approved client names — only these can be mentioned */
    approvedClients: ['Coquitos', 'La Fábrica', 'Quem', 'Somos Palta', 'Monti'],
    /** Prohibited vocabulary */
    prohibitedWords: ['sinergia', 'disruptivo', 'paradigma', 'revolucionar', 'game-changer'],
    /** Pricing patterns — NEVER reveal */
    pricingPatterns: [
        /USD\s*\d+/i,
        /\$\s*\d+/,
        /\d+\s*%\s*(de\s+)?comisi[oó]n/i,
    ],
} as const;
