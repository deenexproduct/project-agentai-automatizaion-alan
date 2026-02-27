/**
 * Browser Configuration
 * Configuración centralizada para el sistema anti-detección de Puppeteer
 * Incluye: User Agents, Viewports, Retry Config, Block Detection Patterns
 */

import type { Browser, Page } from 'puppeteer';

// Puppeteer launch options type (extracted from puppeteer types)
export interface PuppeteerLaunchOptions {
    headless?: boolean | 'shell';
    protocolTimeout?: number;
    defaultViewport?: { width: number; height: number; } | null;
    args?: string[];
    ignoreDefaultArgs?: boolean | string[];
    [key: string]: any;
}

// ============================================================
// USER AGENT ROTATION
// 10 User Agents reales de diferentes navegadores y sistemas
// ============================================================

export const USER_AGENTS = [
    // Chrome Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    // Chrome macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    // Edge Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    // Firefox Windows
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
    // Firefox macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
    // Safari macOS
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    // Chrome Linux
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    // Chrome Android (para emulación móvil opcional)
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
];

// ============================================================
// VIEWPORT CONFIGURATIONS
// Diferentes resoluciones para randomización
// ============================================================

export interface ViewportConfig {
    width: number;
    height: number;
    deviceScaleFactor: number;
    isMobile: boolean;
    hasTouch: boolean;
    isLandscape: boolean;
}

export const VIEWPORTS: ViewportConfig[] = [
    // Desktop - Full HD
    { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false, hasTouch: false, isLandscape: true },
    // Desktop - Common
    { width: 1366, height: 768, deviceScaleFactor: 1, isMobile: false, hasTouch: false, isLandscape: true },
    // Desktop - Large
    { width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false, isLandscape: true },
    // Desktop - 4K scaled
    { width: 1536, height: 864, deviceScaleFactor: 1.25, isMobile: false, hasTouch: false, isLandscape: true },
    // Laptop - MacBook style
    { width: 1280, height: 800, deviceScaleFactor: 2, isMobile: false, hasTouch: false, isLandscape: true },
    // Laptop - Small
    { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false, isLandscape: true },
];

// ============================================================
// BROWSER LAUNCH OPTIONS
// Argumentos anti-detección para Chromium
// ============================================================

export const BROWSER_ARGS = [
    // Sandbox & Security
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',

    // Automation hiding
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',

    // UI
    '--disable-infobars',
    '--window-position=0,0',
    '--ignore-certificate-errors',
    '--ignore-certificate-errors-spki-list',

    // Performance
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-ipc-flooding-protection',

    // GPU & Media
    '--disable-features=TranslateUI',
    '--disable-component-extensions-with-background-pages',
    '--disable-extensions',

    // Memory
    '--max-old-space-size=4096',
    '--disable-web-security',
    '--allow-running-insecure-content',

    // Audio (prevent audio context fingerprinting)
    '--autoplay-policy=user-gesture-required',
    '--disable-features=AudioServiceOutOfProcess',
];

export function getBrowserLaunchOptions(headless: boolean = (process.env.NODE_ENV === 'production' ? true : false), viewport?: ViewportConfig): PuppeteerLaunchOptions {
    const args = [...BROWSER_ARGS];

    if (viewport) {
        args.push(`--window-size=${viewport.width},${viewport.height}`);
    }

    return {
        headless,
        protocolTimeout: 180000, // 180s
        defaultViewport: viewport ? {
            width: viewport.width,
            height: viewport.height,
        } : undefined,
        args,
        ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=IdleDetection'],
    };
}

// ============================================================
// RETRY CONFIGURATION
// Backoff exponencial con jitter
// ============================================================

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
    maxDelayMs: 60000,
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
        'Disconnected',
        'Network error',
        'ERR_',
        'blocked',
        'rate limit',
        'too many requests',
    ],
};

export const STRICT_RETRY_CONFIG: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    maxRetries: 5,
    baseDelayMs: 5000,
    maxDelayMs: 120000,
    backoffMultiplier: 2.5,
};

export const AGGRESSIVE_RETRY_CONFIG: RetryConfig = {
    ...DEFAULT_RETRY_CONFIG,
    maxRetries: 2,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 1.5,
};

// ============================================================
// BLOCK DETECTION PATTERNS
// Patrones de texto para detectar bloqueos de LinkedIn
// ============================================================

export interface BlockDetectionPattern {
    name: string;
    patterns: string[];
    selectors: string[];
    severity: 'low' | 'medium' | 'high' | 'critical';
    action: 'retry' | 'wait' | 'abort' | 'captcha';
    suggestedWaitMinutes?: number;
}

export const BLOCK_DETECTION_PATTERNS: BlockDetectionPattern[] = [
    // CAPTCHA / Human Verification
    {
        name: 'captcha',
        patterns: [
            'verify you\'re human',
            'verify you are human',
            'captcha',
            'recaptcha',
            'security check',
            'challenge',
            'prove you\'re not a robot',
            'i\'m not a robot',
            'please verify',
            'verification required',
        ],
        selectors: [
            '[class*="captcha"]',
            '[class*="challenge"]',
            '#captcha',
            '.g-recaptcha',
            'iframe[src*="recaptcha"]',
            'iframe[src*="captcha"]',
        ],
        severity: 'high',
        action: 'captcha',
    },
    // Rate Limiting
    {
        name: 'rate_limit',
        patterns: [
            'unusual activity',
            'too many requests',
            'rate limit',
            'temporarily restricted',
            'slow down',
            'you\'re going too fast',
            'action blocked',
            'temporarily limited',
            'we\'ve detected',
            'automated behavior',
        ],
        selectors: [
            '[class*="rate-limit"]',
            '[class*="restriction"]',
            '[class*="blocked"]',
        ],
        severity: 'high',
        action: 'wait',
        suggestedWaitMinutes: 60,
    },
    // Account Restriction
    {
        name: 'account_restriction',
        patterns: [
            'account restricted',
            'account suspended',
            'account blocked',
            'access denied',
            'unauthorized',
            'forbidden',
            'your account has been',
            'permanently restricted',
            'violating our terms',
            'community standards',
        ],
        selectors: [
            '[class*="suspended"]',
            '[class*="restricted"]',
            '[class*="banned"]',
        ],
        severity: 'critical',
        action: 'abort',
    },
    // Login Required
    {
        name: 'login_required',
        patterns: [
            'sign in to continue',
            'please sign in',
            'session expired',
            'log in to view',
            'authwall',
            'login required',
        ],
        selectors: [
            'form[action*="login"]',
            '[class*="authwall"]',
            'input[name="session_key"]',
        ],
        severity: 'medium',
        action: 'retry',
    },
    // IP Block / VPN Detection
    {
        name: 'ip_block',
        patterns: [
            'unusual location',
            ' unrecognized device',
            'verify your identity',
            'suspicious activity',
            'confirm your identity',
            'login from new device',
        ],
        selectors: [
            '[class*="verify"]',
            '[class*="identity"]',
        ],
        severity: 'high',
        action: 'wait',
        suggestedWaitMinutes: 30,
    },
    // Cloudflare / DDoS Protection
    {
        name: 'cloudflare',
        patterns: [
            'checking your browser',
            'ddos protection',
            'cloudflare',
            'please wait',
            'ray id',
            'checking',
            'just a moment',
        ],
        selectors: [
            '#cf-wrapper',
            '.cf-browser-verification',
            'iframe[src*="challenge"]',
        ],
        severity: 'medium',
        action: 'wait',
        suggestedWaitMinutes: 5,
    },
];

// ============================================================
// STEALTH SCRIPTS
// Scripts para inyectar en las páginas y evadir detección
// ============================================================

export const STEALTH_SCRIPTS = {
    // Ocultar webdriver
    hideWebdriver: () => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
        });
    },

    // Evasión de Canvas fingerprinting
    canvasEvasion: () => {
        const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
        const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;

        // Agregar ruido sutil a los datos de canvas
        HTMLCanvasElement.prototype.toDataURL = function (type?: string, quality?: any): string {
            const context = this.getContext('2d');
            if (context) {
                const imageData = context.getImageData(0, 0, this.width, this.height);
                const data = imageData.data;
                // Agregar ruido imperceptible (±1 en cada canal de píxeles aleatorios)
                for (let i = 0; i < data.length; i += 4) {
                    if (Math.random() < 0.01) {
                        data[i] = Math.max(0, Math.min(255, data[i] + (Math.random() > 0.5 ? 1 : -1)));
                    }
                }
                context.putImageData(imageData, 0, 0);
            }
            return originalToDataURL.apply(this, [type, quality] as any);
        };

        CanvasRenderingContext2D.prototype.getImageData = function (sx: number, sy: number, sw: number, sh: number) {
            const imageData = originalGetImageData.apply(this, [sx, sy, sw, sh] as any);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                if (Math.random() < 0.01) {
                    data[i] = Math.max(0, Math.min(255, data[i] + (Math.random() > 0.5 ? 1 : -1)));
                }
            }
            return imageData;
        };
    },

    // Evasión de WebGL fingerprinting
    webglEvasion: () => {
        const getParameter = WebGLRenderingContext.prototype.getParameter;
        const parameterMap: Record<number, any> = {
            37445: 'Intel Inc.',
            37446: 'Intel Iris OpenGL Engine',
        };

        WebGLRenderingContext.prototype.getParameter = function (parameter: number): any {
            if (parameterMap[parameter]) {
                return parameterMap[parameter];
            }
            return getParameter.call(this, parameter);
        };
    },

    // Plugins y mimeTypes simulados
    pluginsEvasion: () => {
        // Crear plugins simulados
        const mockPlugins = [
            {
                name: 'Chrome PDF Plugin',
                filename: 'internal-pdf-viewer',
                description: 'Portable Document Format',
                version: 'undefined',
                length: 1,
                item: () => null,
                namedItem: () => null,
            },
            {
                name: 'Native Client',
                filename: 'native-client.nmf',
                description: 'Native Client module',
                version: 'undefined',
                length: 2,
                item: () => null,
                namedItem: () => null,
            },
        ];

        const mockMimeTypes = [
            {
                type: 'application/pdf',
                suffixes: 'pdf',
                description: 'Portable Document Format',
                enabledPlugin: mockPlugins[0],
            },
            {
                type: 'application/x-google-chrome-pdf',
                suffixes: 'pdf',
                description: 'Portable Document Format',
                enabledPlugin: mockPlugins[0],
            },
        ];

        Object.defineProperty(navigator, 'plugins', {
            get: () => mockPlugins as unknown as PluginArray,
            enumerable: true,
            configurable: true,
        });

        Object.defineProperty(navigator, 'mimeTypes', {
            get: () => mockMimeTypes as unknown as MimeTypeArray,
            enumerable: true,
            configurable: true,
        });
    },

    // Ocultar el uso de Puppeteer
    hideAutomation: () => {
        // Eliminar propiedades que revelan automation
        delete (window as any).__phantomas;

        // Ocultar Chrome Runtime
        if ((window as any).chrome) {
            Object.defineProperty(window, 'chrome', {
                get: () => ({
                    runtime: {
                        OnInstalledReason: {
                            CHROME_UPDATE: 'chrome_update',
                            INSTALL: 'install',
                            SHARED_MODULE_UPDATE: 'shared_module_update',
                            UPDATE: 'update',
                        },
                        OnRestartRequiredReason: {
                            APP_UPDATE: 'app_update',
                            OS_UPDATE: 'os_update',
                            PERIODIC: 'periodic',
                        },
                        PlatformArch: {
                            ARM: 'arm',
                            ARM64: 'arm64',
                            MIPS: 'mips',
                            MIPS64: 'mips64',
                            MIPS64EL: 'mips64el',
                            MIPSEL: 'mipsel',
                            X86_32: 'x86-32',
                            X86_64: 'x86-64',
                        },
                        PlatformNaclArch: {
                            MIPS: 'mips',
                            MIPS64: 'mips64',
                            MIPS64EL: 'mips64el',
                            MIPSEL: 'mipsel',
                            MIPSEL64: 'mipsel64',
                            X86_32: 'x86-32',
                            X86_64: 'x86-64',
                        },
                        PlatformOs: {
                            ANDROID: 'android',
                            CROS: 'cros',
                            LINUX: 'linux',
                            MAC: 'mac',
                            OPENBSD: 'openbsd',
                            WIN: 'win',
                        },
                        RequestUpdateCheckStatus: {
                            NO_UPDATE: 'no_update',
                            THROTTLED: 'throttled',
                            UPDATE_AVAILABLE: 'update_available',
                        },
                    },
                }),
            });
        }

        // Simular notification permissions
        const originalQuery = window.Notification?.requestPermission;
        if (originalQuery) {
            window.Notification.requestPermission = async function () {
                return 'default';
            };
        }
    },

    // Language y timezone consistentes
    consistencyEvasion: () => {
        Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en'],
        });

        // Asegurar que el hardwareConcurrency sea realista
        Object.defineProperty(navigator, 'hardwareConcurrency', {
            get: () => 4 + Math.floor(Math.random() * 4),
        });

        // Memory realista
        Object.defineProperty(navigator, 'deviceMemory', {
            get: () => 8,
        });
    },
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

export function getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function getRandomViewport(): ViewportConfig {
    return VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
}

export function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
    const exponentialDelay = config.baseDelayMs * Math.pow(
        config.backoffMultiplier,
        attempt - 1
    );
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    return Math.min(config.maxDelayMs, exponentialDelay + jitter);
}

// Type guard para verificar si es un error retryable
export function isRetryableError(error: Error, config: RetryConfig): boolean {
    const errorMessage = error.message.toLowerCase();
    return config.retryableErrors.some(pattern =>
        errorMessage.includes(pattern.toLowerCase())
    );
}

// Detectar tipo de bloqueo basado en el contenido de la página
export function detectBlockType(text: string): BlockDetectionPattern | null {
    const lowerText = text.toLowerCase();

    for (const pattern of BLOCK_DETECTION_PATTERNS) {
        if (pattern.patterns.some(p => lowerText.includes(p))) {
            return pattern;
        }
    }

    return null;
}
