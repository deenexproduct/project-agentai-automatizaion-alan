/**
 * LinkedIn Browser Service
 * Sistema de navegación Puppeteer con medidas anti-detección avanzadas
 * 
 * Características:
 * - User Agent rotation
 * - Viewport randomization  
 * - WebGL/Canvas fingerprint evasion
 * - Plugins/mimeTypes evasion
 * - Retry con backoff exponencial
 * - Detección de bloqueos
 * - Logs detallados
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page, HTTPResponse, HTTPRequest } from 'puppeteer';
import { EventEmitter } from 'events';
import {
    getRandomUserAgent,
    getRandomViewport,
    getBrowserLaunchOptions,
    calculateBackoffDelay,
    isRetryableError,
    detectBlockType,
    DEFAULT_RETRY_CONFIG,
    STRICT_RETRY_CONFIG,
    BLOCK_DETECTION_PATTERNS,
    STEALTH_SCRIPTS,
    type RetryConfig,
    type BlockDetectionPattern,
    type ViewportConfig,
} from '../../config/browser.config';

// Aplicar stealth plugin globalmente
puppeteer.use((StealthPlugin as any).default());

// ============================================================
// INTERFACES & TYPES
// ============================================================

export interface BrowserSession {
    id: string;
    browser: Browser;
    page: Page;
    userAgent: string;
    viewport: ViewportConfig;
    createdAt: Date;
    lastUsedAt: Date;
    requestCount: number;
    errorCount: number;
}

export interface NavigationResult {
    success: boolean;
    url?: string;
    title?: string;
    statusCode?: number;
    error?: string;
    blockDetected?: BlockDetectionPattern;
    retryCount: number;
    durationMs: number;
}

export interface ActionResult {
    success: boolean;
    data?: any;
    error?: string;
    retryCount: number;
    durationMs: number;
}

export interface StealthMetrics {
    totalRequests: number;
    blockedRequests: number;
    captchasDetected: number;
    rateLimitsHit: number;
    averageResponseTime: number;
    sessionUptime: number;
}

// ============================================================
// LINKEDIN BROWSER SERVICE
// ============================================================

export class LinkedInBrowserService extends EventEmitter {
    private session: BrowserSession | null = null;
    private isInitializing = false;
    private readonly metrics = {
        totalRequests: 0,
        blockedRequests: 0,
        captchasDetected: 0,
        rateLimitsHit: 0,
        responseTimes: [] as number[],
        sessionStartTime: null as Date | null,
    };

    constructor() {
        super();
    }

    // ─────────────────────────────────────────────────────────
    // SESSION MANAGEMENT
    // ─────────────────────────────────────────────────────────

    /**
     * Inicializa una nueva sesión de navegador con medidas anti-detección
     */
    async initialize(headless: boolean = false): Promise<BrowserSession> {
        if (this.session) {
            this.log('⚠️ Browser session already exists, reusing...');
            return this.session;
        }

        if (this.isInitializing) {
            throw new Error('Browser initialization already in progress');
        }

        this.isInitializing = true;
        const initStartTime = Date.now();

        try {
            this.log('🚀 Initializing stealth browser session...');

            // 1. Randomizar configuración
            const userAgent = getRandomUserAgent();
            const viewport = getRandomViewport();

            this.log(`   User Agent: ${userAgent.substring(0, 60)}...`);
            this.log(`   Viewport: ${viewport.width}x${viewport.height} (scale: ${viewport.deviceScaleFactor})`);

            // 2. Lanzar navegador
            const launchOptions = getBrowserLaunchOptions(headless, viewport);
            const browser = await puppeteer.launch(launchOptions);

            // 3. Crear página y configurar
            const page = await browser.newPage();

            // Configurar viewport
            await page.setViewport({
                width: viewport.width,
                height: viewport.height,
                deviceScaleFactor: viewport.deviceScaleFactor,
                isMobile: viewport.isMobile,
                hasTouch: viewport.hasTouch,
                isLandscape: viewport.isLandscape,
            });

            // Configurar User Agent
            await page.setUserAgent(userAgent);

            // 4. Inyectar scripts anti-detección
            await this.injectStealthScripts(page);

            // 5. Configurar interceptores y monitoreo
            await this.setupPageMonitoring(page);

            // 6. Crear sesión
            const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            this.session = {
                id: sessionId,
                browser,
                page,
                userAgent,
                viewport,
                createdAt: new Date(),
                lastUsedAt: new Date(),
                requestCount: 0,
                errorCount: 0,
            };

            this.metrics.sessionStartTime = new Date();

            // 7. Manejar cierre del navegador
            browser.on('disconnected', () => {
                this.log('🔌 Browser disconnected');
                this.emit('disconnected', { sessionId });
                this.session = null;
            });

            const initDuration = Date.now() - initStartTime;
            this.log(`✅ Stealth browser initialized in ${initDuration}ms (Session: ${sessionId})`);
            this.emit('initialized', { sessionId, userAgent, viewport });

            return this.session;

        } catch (error: any) {
            this.log(`❌ Failed to initialize browser: ${error.message}`);
            throw error;
        } finally {
            this.isInitializing = false;
        }
    }

    /**
     * Inyecta scripts de evasión en la página
     */
    private async injectStealthScripts(page: Page): Promise<void> {
        // Ejecutar todos los scripts de evasión
        const scripts = [
            STEALTH_SCRIPTS.hideWebdriver,
            STEALTH_SCRIPTS.canvasEvasion,
            STEALTH_SCRIPTS.webglEvasion,
            STEALTH_SCRIPTS.pluginsEvasion,
            STEALTH_SCRIPTS.hideAutomation,
            STEALTH_SCRIPTS.consistencyEvasion,
        ];

        for (const script of scripts) {
            await page.evaluateOnNewDocument(script as any);
        }

        this.log('   🛡️ Stealth scripts injected');
    }

    /**
     * Configura monitoreo de requests/responses
     */
    private async setupPageMonitoring(page: Page): Promise<void> {
        // Monitorear requests
        await page.setRequestInterception(true);

        page.on('request', (request: HTTPRequest) => {
            // Permitir todos los requests por defecto
            request.continue();

            // Log de requests de recursos sospechosos
            const url = request.url();
            if (url.includes('captcha') || url.includes('challenge') || url.includes('security')) {
                this.log(`   🔍 Suspicious request: ${url.substring(0, 100)}`);
            }
        });

        // Monitorear responses
        page.on('response', (response: HTTPResponse) => {
            const status = response.status();
            const url = response.url();

            // Detectar errores HTTP
            if (status === 429) {
                this.log(`   🚫 Rate limit detected (429) for: ${url.substring(0, 80)}`);
                this.metrics.rateLimitsHit++;
                this.emit('rateLimit', { url, status });
            } else if (status === 403) {
                this.log(`   🚫 Access forbidden (403) for: ${url.substring(0, 80)}`);
                this.metrics.blockedRequests++;
                this.emit('blocked', { url, status });
            }
        });

        // Manejar diálogos
        page.on('dialog', async (dialog) => {
            this.log(`   🔔 Dialog detected: "${dialog.message().substring(0, 80)}"`);
            await dialog.dismiss().catch(() => { });
        });

        // Manejar errores de consola
        page.on('console', (msg) => {
            const text = msg.text().toLowerCase();
            if (text.includes('error') &&
                (text.includes('captcha') || text.includes('block') || text.includes('bot'))) {
                this.log(`   ⚠️ Console error: ${msg.text().substring(0, 100)}`);
            }
        });
    }

    // ─────────────────────────────────────────────────────────
    // NAVIGATION WITH RETRY & BLOCK DETECTION
    // ─────────────────────────────────────────────────────────

    /**
     * Navega a una URL con retry automático y detección de bloqueos
     */
    async navigate(
        url: string,
        options: {
            waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
            timeout?: number;
            retryConfig?: RetryConfig;
        } = {}
    ): Promise<NavigationResult> {
        const {
            waitUntil = 'networkidle2',
            timeout = 30000,
            retryConfig = DEFAULT_RETRY_CONFIG,
        } = options;

        if (!this.session) {
            throw new Error('Browser not initialized. Call initialize() first.');
        }

        const { page } = this.session;
        const startTime = Date.now();
        let lastError: Error | null = null;
        let blockDetected: BlockDetectionPattern | null = null;

        // Retry loop
        for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = calculateBackoffDelay(attempt, retryConfig);
                    this.log(`   ⏳ Retry ${attempt}/${retryConfig.maxRetries} - waiting ${Math.round(delay)}ms`);
                    await this.sleep(delay);
                }

                this.log(`🌐 Navigating to: ${url.substring(0, 80)} (attempt ${attempt + 1})`);

                // Navegar
                const response = await page.goto(url, {
                    waitUntil,
                    timeout,
                });

                // Verificar código de estado
                const statusCode = response?.status() || 0;

                if (statusCode >= 400) {
                    throw new Error(`HTTP ${statusCode} error`);
                }

                // Verificar bloqueos por contenido
                blockDetected = await this.checkForBlocks(page);

                if (blockDetected) {
                    this.log(`   🚨 Block detected: ${blockDetected.name} (${blockDetected.severity})`);

                    if (blockDetected.action === 'abort') {
                        throw new Error(`Critical block detected: ${blockDetected.name}`);
                    }

                    if (blockDetected.action === 'wait' && blockDetected.suggestedWaitMinutes) {
                        const waitMs = blockDetected.suggestedWaitMinutes * 60 * 1000;
                        this.log(`   ⏱️ Suggested wait: ${blockDetected.suggestedWaitMinutes} minutes`);
                        await this.sleep(Math.min(waitMs, 30000)); // Max 30s espera automática
                    }

                    if (blockDetected.action === 'captcha') {
                        this.metrics.captchasDetected++;
                        this.emit('captcha', { url, pattern: blockDetected });
                        throw new Error(`CAPTCHA detected: ${blockDetected.name}`);
                    }

                    // Continuar con retry para otros casos
                    throw new Error(`Block detected: ${blockDetected.name}`);
                }

                // Éxito
                const finalUrl = page.url();
                const title = await page.title();
                const duration = Date.now() - startTime;

                this.session.requestCount++;
                this.session.lastUsedAt = new Date();
                this.metrics.totalRequests++;
                this.metrics.responseTimes.push(duration);

                this.log(`   ✅ Navigation successful: ${title.substring(0, 50)}`);

                return {
                    success: true,
                    url: finalUrl,
                    title,
                    statusCode,
                    retryCount: attempt,
                    durationMs: duration,
                };

            } catch (error: any) {
                lastError = error;

                // Verificar si es un error retryable
                if (!isRetryableError(error, retryConfig)) {
                    this.log(`   ❌ Non-retryable error: ${error.message}`);
                    break;
                }

                this.log(`   ⚠️ Attempt ${attempt + 1} failed: ${error.message.substring(0, 80)}`);

                if (attempt === retryConfig.maxRetries) {
                    this.log(`   💥 All retries exhausted`);
                    this.session.errorCount++;
                }
            }
        }

        // Fallo después de todos los reintentos
        const duration = Date.now() - startTime;
        this.metrics.blockedRequests++;
        this.session && (this.session.errorCount++);

        return {
            success: false,
            error: lastError?.message || 'Unknown error',
            blockDetected: blockDetected || undefined,
            retryCount: retryConfig.maxRetries,
            durationMs: duration,
        };
    }

    /**
     * Verifica si la página contiene patrones de bloqueo
     */
    private async checkForBlocks(page: Page): Promise<BlockDetectionPattern | null> {
        try {
            // Obtener contenido de la página
            const content = await page.content();
            const textContent = await page.evaluate(() => document.body?.innerText || '');
            const fullText = (content + ' ' + textContent).toLowerCase();

            // 1. Detección por texto
            const textBlock = detectBlockType(fullText);
            if (textBlock) {
                return textBlock;
            }

            // 2. Detección por selectores
            for (const pattern of BLOCK_DETECTION_PATTERNS) {
                for (const selector of pattern.selectors) {
                    try {
                        const element = await page.$(selector);
                        if (element) {
                            return pattern;
                        }
                    } catch {
                        // Ignorar errores de selector inválido
                    }
                }
            }

            // 3. Verificar URL
            const url = page.url().toLowerCase();
            if (url.includes('checkpoint') || url.includes('challenge')) {
                return BLOCK_DETECTION_PATTERNS.find(p => p.name === 'captcha') || null;
            }
            if (url.includes('authwall') || url.includes('login')) {
                return BLOCK_DETECTION_PATTERNS.find(p => p.name === 'login_required') || null;
            }

            return null;

        } catch (error: any) {
            this.log(`   ⚠️ Error checking for blocks: ${error.message}`);
            return null;
        }
    }

    // ─────────────────────────────────────────────────────────
    // ACTIONS WITH RETRY
    // ─────────────────────────────────────────────────────────

    /**
     * Ejecuta una acción en la página con retry automático
     */
    async executeAction<T>(
        action: (page: Page) => Promise<T>,
        context: string,
        retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
    ): Promise<ActionResult> {
        if (!this.session) {
            throw new Error('Browser not initialized');
        }

        const { page } = this.session;
        const startTime = Date.now();
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = calculateBackoffDelay(attempt, retryConfig);
                    this.log(`   ⏳ Action retry ${attempt}/${retryConfig.maxRetries} - waiting ${Math.round(delay)}ms`);
                    await this.sleep(delay);
                }

                const data = await action(page);
                const duration = Date.now() - startTime;

                return {
                    success: true,
                    data,
                    retryCount: attempt,
                    durationMs: duration,
                };

            } catch (error: any) {
                lastError = error;

                if (!isRetryableError(error, retryConfig)) {
                    break;
                }

                if (attempt === retryConfig.maxRetries) {
                    this.session.errorCount++;
                }
            }
        }

        const duration = Date.now() - startTime;
        return {
            success: false,
            error: lastError?.message || 'Unknown error',
            retryCount: retryConfig.maxRetries,
            durationMs: duration,
        };
    }

    /**
     * Click en un elemento con comportamiento humano
     */
    async humanClick(
        selector: string,
        options: {
            waitForSelector?: boolean;
            timeout?: number;
        } = {}
    ): Promise<ActionResult> {
        const { waitForSelector = true, timeout = 10000 } = options;

        return this.executeAction(async (page) => {
            if (waitForSelector) {
                await page.waitForSelector(selector, { timeout });
            }

            const element = await page.$(selector);
            if (!element) {
                throw new Error(`Element not found: ${selector}`);
            }

            // Scroll al elemento
            await page.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), element);
            await this.sleep(200 + Math.random() * 300);

            // Click con variación aleatoria
            const box = await element.boundingBox();
            if (box) {
                const offsetX = (Math.random() - 0.5) * box.width * 0.3;
                const offsetY = (Math.random() - 0.5) * box.height * 0.3;
                await page.mouse.click(box.x + box.width / 2 + offsetX, box.y + box.height / 2 + offsetY);
            } else {
                await element.click();
            }

            return true;
        }, `humanClick(${selector})`);
    }

    /**
     * Type en un input con comportamiento humano
     */
    async humanType(
        selector: string,
        text: string,
        options: {
            clearFirst?: boolean;
            delayRange?: { min: number; max: number };
        } = {}
    ): Promise<ActionResult> {
        const { clearFirst = true, delayRange = { min: 50, max: 150 } } = options;

        return this.executeAction(async (page) => {
            const element = await page.$(selector);
            if (!element) {
                throw new Error(`Input not found: ${selector}`);
            }

            await page.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), element);

            if (clearFirst) {
                await element.click({ clickCount: 3 }); // Select all
                await this.sleep(100);
            }

            // Type con delay aleatorio entre caracteres
            for (const char of text) {
                await element.type(char, { delay: 0 });
                const delay = delayRange.min + Math.random() * (delayRange.max - delayRange.min);
                await this.sleep(delay);
            }

            return true;
        }, `humanType(${selector})`);
    }

    // ─────────────────────────────────────────────────────────
    // UTILITY METHODS
    // ─────────────────────────────────────────────────────────

    /**
     * Obtiene la sesión actual
     */
    getSession(): BrowserSession | null {
        return this.session;
    }

    /**
     * Verifica si hay una sesión activa
     */
    isReady(): boolean {
        return !!this.session && !this.session.browser.process()?.killed;
    }

    /**
     * Obtiene las métricas actuales
     */
    getMetrics(): StealthMetrics {
        const avgResponseTime = this.metrics.responseTimes.length > 0
            ? this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length
            : 0;

        const uptime = this.metrics.sessionStartTime
            ? Date.now() - this.metrics.sessionStartTime.getTime()
            : 0;

        return {
            totalRequests: this.metrics.totalRequests,
            blockedRequests: this.metrics.blockedRequests,
            captchasDetected: this.metrics.captchasDetected,
            rateLimitsHit: this.metrics.rateLimitsHit,
            averageResponseTime: Math.round(avgResponseTime),
            sessionUptime: uptime,
        };
    }

    /**
     * Toma un screenshot de la página actual
     */
    async screenshot(options: { fullPage?: boolean; path?: string } = {}): Promise<string | null> {
        if (!this.session) return null;

        try {
            const path = options.path || `./screenshot_${Date.now()}.png`;
            await this.session.page.screenshot({
                path,
                fullPage: options.fullPage
            });
            return path;
        } catch (error: any) {
            this.log(`   ⚠️ Screenshot failed: ${error.message}`);
            return null;
        }
    }

    /**
     * Obtiene el contenido HTML de la página
     */
    async getPageContent(): Promise<string> {
        if (!this.session) return '';
        return this.session.page.content();
    }

    /**
     * Evalúa JavaScript en la página
     */
    async evaluate<T>(fn: (...args: any[]) => T, ...args: any[]): Promise<T> {
        if (!this.session) {
            throw new Error('Browser not initialized');
        }
        return this.session.page.evaluate(fn, ...args);
    }

    /**
     * Espera un tiempo aleatorio (simula comportamiento humano)
     */
    async humanDelay(minMs: number = 1000, maxMs: number = 3000): Promise<void> {
        const delay = minMs + Math.random() * (maxMs - minMs);
        await this.sleep(delay);
    }

    /**
     * Cierra la sesión del navegador
     */
    async close(): Promise<void> {
        if (!this.session) return;

        this.log('🔒 Closing browser session...');

        try {
            await this.session.browser.close();
            this.emit('closed', { sessionId: this.session.id });
        } catch (error: any) {
            this.log(`   ⚠️ Error closing browser: ${error.message}`);
        } finally {
            this.session = null;
            this.metrics.sessionStartTime = null;
        }
    }

    /**
     * Rota la sesión (cierra y crea nueva)
     */
    async rotateSession(headless: boolean = false): Promise<BrowserSession> {
        this.log('🔄 Rotating browser session...');
        await this.close();
        await this.humanDelay(2000, 5000); // Espera entre sesiones
        return this.initialize(headless);
    }

    // ─────────────────────────────────────────────────────────
    // PRIVATE HELPERS
    // ─────────────────────────────────────────────────────────

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private log(message: string): void {
        const timestamp = new Date().toISOString().substring(11, 23);
        console.log(`[LinkedInBrowser][${timestamp}] ${message}`);
    }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

export const linkedInBrowser = new LinkedInBrowserService();

// Re-exportar configuraciones útiles
export {
    DEFAULT_RETRY_CONFIG,
    STRICT_RETRY_CONFIG,
    AGGRESSIVE_RETRY_CONFIG,
    BLOCK_DETECTION_PATTERNS,
    getRandomUserAgent,
    getRandomViewport,
    type RetryConfig,
    type BlockDetectionPattern,
    type ViewportConfig,
} from '../../config/browser.config';
