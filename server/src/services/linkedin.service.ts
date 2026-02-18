import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';
import { LinkedInContact, type ILinkedInContact } from '../models/linkedin-contact.model';
import { LinkedInLogger } from '../utils/linkedin-logger';

// NEW: Import enhanced services
import { operationManager, OperationType } from './linkedin/operation-manager.service';
import { statePersistence, ProspectingState, ProfileProgress as PersistedProfileProgress } from './linkedin/state-persistence.service';
import { RetryService } from './linkedin/retry.service';
import { connectionVerifier, VerificationResult } from './linkedin/connection-verifier.service';
import { humanBehavior } from './linkedin/human-behavior.service';
import { healthMonitor } from './linkedin/health-monitor.service';
import { captchaHandler } from './linkedin/captcha-handler.service';
import { rateLimitHandler } from './linkedin/rate-limit-handler.service';
import { enrichmentService } from './enrichment.service';

// Apply stealth plugin — patches 10+ fingerprints
puppeteer.use(StealthPlugin());

// ============================================================
// LinkedIn Service — Prospecting Automation with Puppeteer
// ============================================================

// ── Interfaces ───────────────────────────────────────────────

export interface ProfileSteps {
    visit: 'pending' | 'done' | 'error';
    connect: 'pending' | 'done' | 'skipped' | 'error';
    like: 'pending' | 'done' | 'skipped' | 'error';
}

export interface ProfileProgress {
    index: number;
    url: string;
    name?: string;
    status: 'pending' | 'visiting' | 'connected' | 'liked' | 'done' | 'error' | 'paused';
    steps: ProfileSteps;
    error?: string;
    startedAt?: string;
    completedAt?: string;
}

export interface ProspectingOptions {
    urls: string[];
    sendNote: boolean;
    noteText?: string;
}

export interface ScrapedProfileData {
    profileUrl: string;
    fullName: string;
    firstName?: string;
    lastName?: string;
    headline?: string;
    currentCompany?: string;
    currentPosition?: string;
    companyLogoUrl?: string;
    industry?: string;
    location?: string;
    profilePhotoUrl?: string;
    bannerUrl?: string;
    about?: string;
    connectionsCount?: string;
    followersCount?: string;
    connectionDegree?: string;
    experience: { company: string; position: string; duration?: string; logoUrl?: string }[];
    education: { institution: string; degree?: string; years?: string }[];
    skills: string[];
}

type ServiceStatus = 'disconnected' | 'browser-open' | 'logged-in';

// ── Constants ────────────────────────────────────────────────

const SESSION_DIR = path.join(__dirname, '../../linkedin-session');
const COOKIES_FILE = path.join(SESSION_DIR, 'cookies.json');

// Delay ranges (milliseconds)
const DELAYS = {
    pageLoad: { min: 3000, max: 6000 },
    scroll: { min: 2000, max: 5000 },
    betweenActions: { min: 5000, max: 20000 },
    afterLike: { min: 3000, max: 8000 },
    betweenProfiles: { min: 45000, max: 120000 },
    longPause: { min: 180000, max: 420000 },  // 3-7 min
};

const LONG_PAUSE_EVERY = 15 + Math.floor(Math.random() * 6); // random 15-20

class LinkedInService extends EventEmitter {
    private browser: Browser | null = null;
    private page: Page | null = null;
    private status: ServiceStatus = 'disconnected';

    // Prospecting state
    private profiles: ProfileProgress[] = [];
    private isRunning = false;
    private isPaused = false;
    private shouldStop = false;
    private currentIndex = 0;

    // CRM state
    public isBusy = false; // Legacy flag - now uses operationManager
    private lastAcceptedCheck: Date | null = null;
    private pauseResolve: (() => void) | null = null;
    
    // NEW: Enhanced services
    private retryService = RetryService.forNavigation();
    private currentBatchId: string | null = null;
    private accountEmail: string = ''; // Set during login

    // ── Helpers ──────────────────────────────────────────────

    private getRandomDelay(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private async randomDelay(range: { min: number; max: number }): Promise<void> {
        const ms = this.getRandomDelay(range.min, range.max);
        console.log(`  ⏱️ Waiting ${(ms / 1000).toFixed(1)}s...`);
        return this.delay(ms);
    }

    // ── Human Emulation ──────────────────────────────────────

    private async humanScroll(page: Page): Promise<void> {
        // NEW: Use enhanced human behavior service
        await humanBehavior.humanScroll(page, {
            minScrolls: 2,
            maxScrolls: 5,
            minDistance: 100,
            maxDistance: 400,
            readPauseChance: 0.15
        });
    }

    private async humanClick(page: Page, element: any): Promise<void> {
        // NEW: Use enhanced human behavior service
        await humanBehavior.humanClick(page, element, true);
    }

    // ── Session Management ───────────────────────────────────

    async initialize(): Promise<void> {
        if (this.browser) {
            console.log('⚠️ LinkedIn browser already open');
            return;
        }

        console.log('🚀 Launching LinkedIn browser...');

        // Ensure session directory exists
        if (!fs.existsSync(SESSION_DIR)) {
            fs.mkdirSync(SESSION_DIR, { recursive: true });
        }

        this.browser = await puppeteer.launch({
            headless: false,
            protocolTimeout: 180000, // 180s — LinkedIn pages are very heavy
            defaultViewport: { width: 1366, height: 768 },
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-ipc-flooding-protection',
                '--window-size=1366,768',
            ],
        });

        this.page = await this.browser.newPage();

        // Set user-agent matching the ACTUAL Chrome version (145)
        await this.page.setUserAgent(
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
        );

        // Remove webdriver flag
        await this.page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        // Auto-dismiss any JavaScript dialogs (alerts, confirms, prompts)
        this.page.on('dialog', async (dialog) => {
            console.log(`  🔔 Dialog detected: "${dialog.message().substring(0, 80)}" — dismissing`);
            await dialog.dismiss().catch(() => { });
        });

        this.status = 'browser-open';

        // Try to load existing cookies
        const cookiesLoaded = await this.loadCookies();

        // Navigate to LinkedIn
        await this.page.goto('https://www.linkedin.com/feed/', {
            waitUntil: 'networkidle2',
            timeout: 30000,
        }).catch(() => {
            // If /feed fails, it may redirect to login — that's OK
        });

        // Check if we're logged in
        if (cookiesLoaded) {
            const loggedIn = await this.checkLoggedIn();
            if (loggedIn) {
                this.status = 'logged-in';
                console.log('✅ LinkedIn session restored from cookies');
            } else {
                console.log('⚠️ Cookies expired — manual login required');
                await this.page.goto('https://www.linkedin.com/login', {
                    waitUntil: 'networkidle2',
                }).catch(() => { });
            }
        } else {
            console.log('ℹ️ No saved session — manual login required');
            await this.page.goto('https://www.linkedin.com/login', {
                waitUntil: 'networkidle2',
            }).catch(() => { });
        }

        // Start monitoring for login
        this.startLoginMonitor();

        // Handle browser close
        this.browser.on('disconnected', () => {
            console.log('🔌 LinkedIn browser closed');
            this.browser = null;
            this.page = null;
            this.status = 'disconnected';
            this.isRunning = false;
        });
    }

    private async checkLoggedIn(): Promise<boolean> {
        if (!this.page) return false;

        try {
            const url = this.page.url();
            // If we're still on the feed, we're logged in
            if (url.includes('/feed') || url.includes('/in/') || url.includes('/mynetwork/')) {
                return true;
            }

            // Check for the nav bar which only appears when logged in
            const navBar = await this.page.$('nav.global-nav, .global-nav__me');
            return !!navBar;
        } catch {
            return false;
        }
    }

    private startLoginMonitor(): void {
        if (!this.page) return;

        const checkInterval = setInterval(async () => {
            if (!this.page || !this.browser) {
                clearInterval(checkInterval);
                return;
            }

            if (this.status === 'logged-in') {
                clearInterval(checkInterval);
                return;
            }

            try {
                const loggedIn = await this.checkLoggedIn();
                if (loggedIn) {
                    this.status = 'logged-in';
                    await this.saveCookies();
                    console.log('✅ LinkedIn login detected — cookies saved');
                    clearInterval(checkInterval);
                }
            } catch {
                // Page might be navigating
            }
        }, 3000);
    }

    async saveCookies(): Promise<void> {
        if (!this.page) return;

        try {
            const cookies = await this.page.cookies();
            if (!fs.existsSync(SESSION_DIR)) {
                fs.mkdirSync(SESSION_DIR, { recursive: true });
            }
            fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
            console.log(`💾 Cookies saved (${cookies.length} cookies)`);
        } catch (err) {
            console.error('Error saving cookies:', err);
        }
    }

    async loadCookies(): Promise<boolean> {
        if (!this.page) return false;

        try {
            if (!fs.existsSync(COOKIES_FILE)) return false;

            const raw = fs.readFileSync(COOKIES_FILE, 'utf-8');
            const cookies = JSON.parse(raw);

            if (!Array.isArray(cookies) || cookies.length === 0) return false;

            await this.page.setCookie(...cookies);
            console.log(`🍪 Loaded ${cookies.length} cookies from disk`);
            return true;
        } catch (err) {
            console.error('Error loading cookies:', err);
            return false;
        }
    }

    getStatus(): { status: ServiceStatus; isRunning: boolean; isPaused: boolean; isBusy: boolean; profilesTotal: number; profilesDone: number; lastAcceptedCheck: string | null } {
        return {
            status: this.status,
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            isBusy: this.isBusy,
            profilesTotal: this.profiles.length,
            profilesDone: this.profiles.filter(p => p.status === 'done').length,
            lastAcceptedCheck: this.lastAcceptedCheck?.toISOString() || null,
        };
    }

    getProgress(): { profiles: ProfileProgress[]; current: number; total: number; status: string } {
        return {
            profiles: this.profiles,
            current: this.currentIndex,
            total: this.profiles.length,
            status: this.isPaused ? 'paused' : this.isRunning ? 'running' : 'stopped',
        };
    }

    // ── Prospecting Core ─────────────────────────────────────

    async startProspecting(options: ProspectingOptions): Promise<boolean> {
        // NEW: Use operation manager for mutual exclusion
        if (!await operationManager.acquire('prospecting', { urlCount: options.urls.length })) {
            const current = operationManager.getCurrent();
            console.error(`❌ Cannot start prospecting — operation '${current}' in progress`);
            return false;
        }

        if (!this.page || this.status !== 'logged-in') {
            operationManager.release();
            console.error('❌ Cannot start prospecting — not logged in');
            return false;
        }

        if (this.isRunning) {
            operationManager.release();
            console.error('❌ Prospecting already running');
            return false;
        }

        // Parse and validate URLs
        const urls = options.urls
            .map(u => u.trim())
            .filter(u => u.length > 0 && (u.includes('linkedin.com/in/') || u.includes('linkedin.com/pub/')));

        if (urls.length === 0) {
            operationManager.release();
            console.error('❌ No valid LinkedIn URLs provided');
            return false;
        }

        console.log(`\n🎯 Starting prospecting for ${urls.length} profiles`);

        // Initialize progress
        this.profiles = urls.map((url, index) => ({
            index,
            url,
            status: 'pending' as const,
            steps: {
                visit: 'pending' as const,
                connect: 'pending' as const,
                like: 'pending' as const,
            },
        }));

        this.isRunning = true;
        this.isPaused = false;
        this.shouldStop = false;
        this.currentIndex = 0;
        this.currentBatchId = new Date().toISOString();

        // CRM: Register all URLs as 'visitando' immediately
        const batchId = new Date().toISOString().split('T')[0];
        for (const url of urls) {
            try {
                const normalizedUrl = this.normalizeUrl(url);
                await LinkedInContact.findOneAndUpdate(
                    { profileUrl: normalizedUrl },
                    {
                        $setOnInsert: {
                            profileUrl: normalizedUrl,
                            fullName: url.split('/in/')[1]?.replace(/\//g, '') || 'Pending',
                            status: 'visitando',
                            notes: [],
                            experience: [],
                            education: [],
                            skills: [],
                            prospectingBatchId: batchId,
                        },
                    },
                    { upsert: true }
                );
            } catch { /* skip — non-critical */ }
        }
        console.log(`📋 CRM: Registered ${urls.length} profiles as 'visitando'`);

        // NEW: Save initial state for recovery
        await this.saveCurrentState(options);

        // Emit initial state
        this.emitProgress();

        // Run in background (don't await)
        this.runProspectingLoop(options).catch(err => {
            console.error('❌ Prospecting loop error:', err);
            this.isRunning = false;
            operationManager.release();
            this.emitProgress();
        }).finally(() => {
            // Always release the lock when done
            operationManager.release();
            // Clear saved state on completion
            statePersistence.clear().catch(() => {});
        });

        return true;
    }

    // NEW: Save current state for crash recovery
    private async saveCurrentState(options: ProspectingOptions): Promise<void> {
        if (!this.currentBatchId) return;

        const persistedProfiles: PersistedProfileProgress[] = this.profiles.map(p => ({
            url: p.url,
            status: p.status === 'done' ? 'completed' : 
                    p.status === 'error' ? 'failed' : 
                    p.status === 'pending' ? 'pending' : 'processing',
            attempts: p.status === 'error' ? 1 : 0,
            lastError: p.error,
        }));

        await statePersistence.save({
            batchId: this.currentBatchId,
            accountEmail: this.accountEmail || 'unknown',
            profiles: persistedProfiles,
            currentIndex: this.currentIndex,
            startTime: new Date().toISOString(),
            isPaused: this.isPaused,
            options: {
                totalLimit: this.profiles.length,
                dailyLimit: this.profiles.length,
                connectionNote: options.noteText,

            },
            stats: {
                processed: this.profiles.filter(p => p.status !== 'pending').length,
                successful: this.profiles.filter(p => p.status === 'done').length,
                failed: this.profiles.filter(p => p.status === 'error').length,
                pending: this.profiles.filter(p => p.status === 'pending').length,
            },
        });
    }

    private async runProspectingLoop(options: ProspectingOptions): Promise<void> {
        for (let i = 0; i < this.profiles.length; i++) {
            if (this.shouldStop) {
                console.log('⏹️ Prospecting stopped by user');
                // NEW: Save state before stopping
                await this.saveCurrentState(options);
                break;
            }

            // Check pause
            await this.checkPause();

            if (this.shouldStop) break;

            this.currentIndex = i;

            try {
                await this.processProfile(i, options);
            } catch (err: any) {
                console.error(`❌ Error processing profile ${i}:`, err.message);
                this.updateProfile(i, {
                    status: 'error',
                    error: err.message || 'Unknown error',
                });
                this.emitProgress();
                // NEW: Save state on error
                await this.saveCurrentState(options);
            }

            // NEW: Auto-save every 5 profiles
            if (statePersistence.shouldAutoSave(i + 1, 5)) {
                await this.saveCurrentState(options);
            }

            // Delay between profiles
            if (i < this.profiles.length - 1 && !this.shouldStop) {
                // Every 15-20 profiles, take a longer break
                if ((i + 1) % LONG_PAUSE_EVERY === 0) {
                    console.log(`\n☕ Taking a longer break after ${i + 1} profiles...`);
                    await this.saveCurrentState(options); // Save before long break
                    await this.randomDelay(DELAYS.longPause);
                } else {
                    await this.randomDelay(DELAYS.betweenProfiles);
                }
            }
        }

        // NEW: Retry failed profiles
        const failedProfiles = this.profiles.filter(p => p.status === 'error');
        if (failedProfiles.length > 0 && !this.shouldStop) {
            console.log(`\n🔄 Retrying ${failedProfiles.length} failed profiles...`);
            for (const failedProfile of failedProfiles) {
                if (this.shouldStop) break;
                
                const index = failedProfile.index;
                console.log(`  🔄 Retrying profile ${index + 1}: ${failedProfile.url}`);
                
                try {
                    // Reset status
                    this.updateProfile(index, {
                        status: 'pending',
                        error: undefined,
                    });
                    await this.processProfile(index, options);
                    
                    // Delay between retries
                    await this.randomDelay(DELAYS.betweenProfiles);
                } catch (err: any) {
                    console.error(`  ❌ Retry failed for profile ${index + 1}:`, err.message);
                    this.updateProfile(index, {
                        status: 'error',
                        error: `Retry failed: ${err.message}`,
                    });
                }
            }
        }

        this.isRunning = false;
        this.isPaused = false;

        const done = this.profiles.filter(p => p.status === 'done').length;
        const errors = this.profiles.filter(p => p.status === 'error').length;

        console.log(`\n✅ Prospecting complete: ${done} done, ${errors} errors, ${this.profiles.length - done - errors} skipped`);

        // NEW: Print health status
        const health = healthMonitor.getHealthStatus();
        console.log(`📊 Health Status: ${health.healthy ? '✅ HEALTHY' : '❌ UNHEALTHY'} (risk: ${health.riskScore})`);
        if (health.alerts.length > 0) {
            console.log(`⚠️ Alerts: ${health.alerts.join(', ')}`);
        }

        this.emit('complete', {
            type: 'complete',
            processed: this.profiles.length,
            succeeded: done,
            failed: errors,
            skipped: this.profiles.length - done - errors,
            health: healthMonitor.getMetrics(),
        });
    }

    private async processProfile(index: number, options: ProspectingOptions): Promise<void> {
        const profile = this.profiles[index];
        const page = this.page!;
        const normalizedUrl = this.normalizeUrl(profile.url);
        const profileStartTime = Date.now();

        // ── Create per-account logger ──
        const logger = new LinkedInLogger(profile.url);
        logger.section(`PROFILE ${index + 1}/${this.profiles.length}`);
        logger.log(`📋 Processing: ${profile.url}`);
        logger.log(`   Normalized URL: ${normalizedUrl}`);
        logger.log(`   Options: sendNote=${options.sendNote}, noteText="${(options.noteText || '').substring(0, 50)}"`);

        // NEW: Start operation tracking
        healthMonitor.startOperation(`processing_profile_${index}`);

        try {
            // ── CRM: Mark as 'visitando' ──
            logger.log(`  🔄 CRM: → visitando`);
            await this.updateCrmStatus(normalizedUrl, 'visitando');

            // ── Step 1: Visit Profile ──
            this.updateProfile(index, {
                status: 'visiting',
                steps: { ...profile.steps, visit: 'pending' },
                startedAt: new Date().toISOString(),
            });
            this.emitProgress();

            // Navigate with retry mechanism (up to 3 attempts)
            let pageLoaded = false;

            // ── Phase 1: Navigate to profile page ──
            // LinkedIn is a heavy SPA. We try networkidle2 first, then fall back to
            // just 'load' event, and finally no-wait + manual poll.
            const navStrategies = [
                { waitUntil: 'networkidle2' as const, timeout: 25000, label: 'networkidle2' },
                { waitUntil: 'load' as const, timeout: 20000, label: 'load' },
                { waitUntil: 'domcontentloaded' as const, timeout: 15000, label: 'domcontentloaded' },
            ];

            for (let i = 0; i < navStrategies.length; i++) {
                const strategy = navStrategies[i];
                try {
                    logger.log(`  🌐 Navigating to profile... (strategy ${i + 1}/${navStrategies.length}: ${strategy.label}, timeout=${strategy.timeout}ms)`);
                    await page.goto(profile.url, { waitUntil: strategy.waitUntil, timeout: strategy.timeout });
                    logger.log(`  ✅ Page loaded (${strategy.label})`);
                    pageLoaded = true;
                    break;
                } catch (navErr: any) {
                    const msg = navErr.message?.substring(0, 100) || 'Unknown error';
                    logger.log(`  ⚠️ Strategy ${strategy.label} failed: ${msg}`);

                    // After timeout, check if the page is at least partially useful
                    const currentUrl = page.url();
                    logger.log(`  🔗 Current URL after timeout: ${currentUrl.substring(0, 120)}`);

                    // Try to get raw HTML length — tells us if the page has content
                    try {
                        const html = await page.content();
                        logger.log(`  📏 Page HTML length: ${html.length} chars`);
                        if (html.length > 1000 && currentUrl.includes('/in/')) {
                            logger.log(`  ✅ Page has content (${html.length} chars) — treating as loaded`);
                            pageLoaded = true;
                            break;
                        }
                    } catch (contentErr: any) {
                        logger.log(`  ⚠️ Cannot read page content: ${contentErr.message?.substring(0, 60)}`);
                    }

                    if (i < navStrategies.length - 1) {
                        logger.log(`  🔄 Trying next strategy in 3s...`);
                        await this.delay(3000);
                    }
                }
            }

            // ── Phase 2: Wait for profile content to render ──
            // Even if navigation "failed", we may have enough content. Check for h1.
            logger.log(`  ⏱️ Waiting for profile content to render...`);
            let contentReady = false;

            // First, force a small delay to let React hydrate
            await this.delay(2000);

            // Try to take a diagnostic screenshot regardless of page state
            await logger.screenshot(page, 'after_navigation').catch(() => { });

            try {
                await page.waitForSelector('h1', { timeout: 10000 });
                contentReady = true;
                logger.log(`  ✅ Profile content detected (h1 found)`);
            } catch {
                logger.log(`  ⚠️ h1 not found — checking page HTML for content...`);
                try {
                    const html = await page.content();
                    logger.log(`  📏 Page HTML: ${html.length} chars`);
                    // Log the first 500 chars of HTML for debugging
                    logger.log(`  📄 HTML preview: ${html.substring(0, 500).replace(/\n/g, ' ')}`);
                    if (html.length > 500) {
                        contentReady = true;
                        logger.log(`  ✅ Page has substantial HTML — proceeding`);
                    }
                } catch (err: any) {
                    logger.log(`  ❌ Cannot read page content: ${err.message?.substring(0, 60)}`);
                }
            }

            if (!pageLoaded && !contentReady) {
                logger.log('  ❌ Page completely failed to load — skipping profile');
                logger.logResult(false, 'Page failed to load');
                this.updateProfile(index, { status: 'error', error: 'Page failed to load', steps: { ...profile.steps, visit: 'error' } });
                this.emitProgress();
                return;
            }

            // Log complete page state after load
            await logger.logPageState(page, 'after_load');

            // Check if profile exists
            let pageContent = '';
            try {
                pageContent = await page.content();
            } catch (contentErr: any) {
                logger.log(`  ⚠️ Could not read page content: ${contentErr.message?.substring(0, 60)}`);
            }

            if (pageContent.includes('Page not found') || pageContent.includes('page-not-found')) {
                logger.log('  ❌ Profile not found (404)');
                logger.logResult(false, 'Profile not found');
                this.updateProfile(index, { status: 'error', error: 'Profile not found', steps: { ...profile.steps, visit: 'error' } });
                this.emitProgress();
                logger.close();
                return;
            }

            // NEW: Check for captcha
            const captchaCheck = await captchaHandler.detect(page);
            if (captchaCheck.detected) {
                logger.log(`  🔒 CAPTCHA DETECTED (${captchaCheck.type}, confidence: ${captchaCheck.confidence})`);
                const result = await captchaHandler.handle(page);
                if (result !== 'resolved') {
                    throw new Error(`Captcha not resolved: ${result}`);
                }
                logger.log('  ✅ Captcha resolved, continuing...');
            }

            // NEW: Check for rate limit
            const rateLimitCheck = await rateLimitHandler.detect(page);
            if (rateLimitCheck.isRateLimited) {
                logger.log(`  🚫 RATE LIMIT DETECTED: ${rateLimitCheck.type} - ${rateLimitCheck.message}`);
                await rateLimitHandler.handle(page, rateLimitCheck);
                throw new Error(`Rate limited: ${rateLimitCheck.message}. Retry after ${rateLimitCheck.suggestedWaitHours}h`);
            }

            // Check for captcha
            try {
                if (await this.detectCaptcha(page)) {
                    logger.log('  ⚠️ CAPTCHA detected!');
                    await logger.screenshot(page, 'captcha_detected');
                    this.updateProfile(index, { status: 'paused', error: 'Captcha detected' });
                    this.emitProgress();
                    this.emit('captcha', { message: '⚠️ Captcha detected — resolve manually in the browser' });
                    await this.waitForCaptchaResolution(page);
                    logger.log('  ✅ CAPTCHA resolved');
                }
            } catch (captchaErr: any) {
                logger.log(`  ⚠️ Captcha check error: ${captchaErr.message?.substring(0, 60)}`);
            }

            // Check for login redirect
            if (page.url().includes('/login')) {
                logger.log('  ❌ Redirected to login page — session expired');
                logger.logResult(false, 'Session expired');
                this.status = 'browser-open';
                this.isPaused = true;
                this.emit('session-expired', { message: 'Session expired — please login again' });
                await this.checkPause();
                logger.close();
                return;
            }

            // 📸 Screenshot after page load
            await logger.screenshot(page, 'profile_loaded');

            // Extract profile name
            try {
                const nameEl = await page.$('h1');
                if (nameEl) {
                    const name = await page.evaluate(el => el.textContent?.trim(), nameEl);
                    if (name) {
                        logger.log(`  👤 Profile name: ${name}`);
                        this.updateProfile(index, { name });
                    }
                } else {
                    // Fallback: get name from page title ("Name | LinkedIn")
                    const title = await page.title();
                    if (title && title.includes('|')) {
                        const name = title.split('|')[0].trim();
                        if (name && name.length < 60) {
                            logger.log(`  👤 Profile name (from title): ${name}`);
                            this.updateProfile(index, { name });
                        }
                    }
                }
            } catch {
                // Name extraction failed — not critical
            }

            this.updateProfile(index, { steps: { ...this.profiles[index].steps, visit: 'done' } });
            this.emitProgress();
            logger.log(`  ✅ Visit step complete`);

            // Human-like scroll
            logger.log(`  📜 Scrolling page...`);
            try {
                await this.humanScroll(page);
            } catch (scrollErr: any) {
                logger.log(`  ⚠️ Scroll error: ${scrollErr.message?.substring(0, 60)}`);
            }
            await this.randomDelay(DELAYS.betweenActions);

            // ── Step 2: Connect ──
            await this.checkPause();
            if (this.shouldStop) { logger.close(); return; }

            // ── CRM: Mark as 'conectando' ──
            logger.log(`  🔄 CRM: → conectando`);
            await this.updateCrmStatus(normalizedUrl, 'conectando');

            let connectionSent = false;
            try {
                logger.section('CONNECT ATTEMPT');
                logger.log(`  🔗 Attempting to connect...`);
                const connected = await this.connectProfile(page, logger, options.sendNote ? options.noteText : undefined);
                this.updateProfile(index, {
                    status: 'connected',
                    steps: { ...this.profiles[index].steps, connect: connected ? 'done' : 'skipped' },
                });

                if (connected) {
                    connectionSent = true;
                    await LinkedInContact.updateOne(
                        { profileUrl: normalizedUrl },
                        { $set: { sentAt: new Date() } }
                    ).catch(() => { });
                    logger.logResult(true, 'Connection request sent successfully');
                } else {
                    logger.log(`  ℹ️ Connect skipped (already connected or pending)`);
                    logger.logResult(false, 'Connect skipped or failed');
                }
            } catch (err: any) {
                logger.log(`  ⚠️ Connect error: ${err.message?.substring(0, 80)}`);
                logger.logResult(false, `Connect error: ${err.message?.substring(0, 80)}`);
                this.updateProfile(index, { steps: { ...this.profiles[index].steps, connect: 'error' } });
            }
            this.emitProgress();
            await this.randomDelay(DELAYS.betweenActions);

            // ── Step 4: Like Latest Post ──
            await this.checkPause();
            if (this.shouldStop) { logger.close(); return; }

            try {
                logger.section('LIKE ATTEMPT');
                logger.log(`  ❤️ Attempting to like latest post...`);
                const liked = await this.likeLatestPost(page, profile.url, logger);
                this.updateProfile(index, {
                    status: 'liked',
                    steps: { ...this.profiles[index].steps, like: liked ? 'done' : 'skipped' },
                });
                logger.log(`  ${liked ? '✅ Post liked' : '⏭️ No post to like'}`);

                if (liked) {
                    // ── CRM: Mark as 'interactuando' after successful like ──
                    logger.log(`  🔄 CRM: → interactuando (liked post)`);
                    await this.updateCrmStatus(normalizedUrl, 'interactuando');
                }
            } catch (err: any) {
                logger.log(`  ⚠️ Like error: ${err.message?.substring(0, 60)}`);
                this.updateProfile(index, { steps: { ...this.profiles[index].steps, like: 'error' } });
            }

            // ── Step 5: Navigate back to profile & Scrape full data ──
            await this.checkPause();
            if (this.shouldStop) { logger.close(); return; }

            try {
                logger.section('SCRAPE PROFILE DATA');
                logger.log(`  📸 Navigating back to profile for full scrape...`);

                // Navigate back to the profile page (like step may have gone to posts page)
                await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
                await this.delay(3000);

                // Scroll down to load lazy sections, then back up
                await this.humanScroll(page);
                await this.delay(1000);
                await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
                await this.delay(2000);

                logger.log(`  🔍 Scraping profile data...`);
                const scraped = await this.scrapeProfileData(page);
                if (scraped) {
                    // Use fallback name if scraper couldn't get it
                    if (!scraped.fullName) {
                        const fallbackName = this.profiles[index].name;
                        if (fallbackName && fallbackName !== profile.url) {
                            scraped.fullName = fallbackName;
                            const parts = fallbackName.split(' ');
                            scraped.firstName = parts[0] || '';
                            scraped.lastName = parts.slice(1).join(' ') || '';
                        }
                    }

                    // Build $set with only non-empty values to avoid overwriting existing data with empty strings
                    const setData: any = { profileUrl: normalizedUrl, prospectingBatchId: new Date().toISOString().split('T')[0] };
                    for (const [key, value] of Object.entries(scraped)) {
                        if (value && (typeof value !== 'string' || value.trim() !== '')) {
                            if (Array.isArray(value) && value.length === 0) continue;
                            setData[key] = value;
                        }
                    }

                    await LinkedInContact.findOneAndUpdate(
                        { profileUrl: normalizedUrl },
                        { $set: setData },
                        { upsert: true, new: true }
                    );
                    const savedFields = Object.keys(setData).filter(k => !['profileUrl', 'prospectingBatchId'].includes(k));
                    logger.log(`  💾 CRM: Saved ${savedFields.length} fields for: ${scraped.fullName || normalizedUrl}`);
                    
                    // ── TRIGGER: Auto-enrichment AFTER scraping is complete ──
                    // Only trigger if we have meaningful data (headline, position, or company)
                    if (scraped.headline || scraped.currentPosition || scraped.currentCompany) {
                        try {
                            const contact = await LinkedInContact.findOne({ profileUrl: normalizedUrl });
                            if (contact && contact.status === 'interactuando') {
                                logger.log(`  🧬 Triggering auto-enrichment for ${contact.fullName}...`);
                                enrichmentService.triggerAutoEnrichment(contact._id.toString(), 'interactuando')
                                    .catch(err => logger.log(`  ⚠️ Auto-enrichment error: ${err.message?.substring(0, 60)}`));
                            }
                        } catch (enrichTriggerErr: any) {
                            logger.log(`  ⚠️ Failed to trigger enrichment: ${enrichTriggerErr.message?.substring(0, 60)}`);
                        }
                    }
                } else {
                    // Total failure — try fallback name from h1
                    const fallbackName = this.profiles[index].name;
                    if (fallbackName && fallbackName !== profile.url) {
                        await LinkedInContact.updateOne(
                            { profileUrl: normalizedUrl },
                            { $set: { fullName: fallbackName, firstName: fallbackName.split(' ')[0] || '', lastName: fallbackName.split(' ').slice(1).join(' ') || '' } }
                        );
                        logger.log(`  💾 CRM: Saved fallback name: ${fallbackName}`);
                    } else {
                        logger.log(`  ⚠️ CRM: Could not scrape any profile data`);
                    }
                }
            } catch (crmErr: any) {
                logger.log(`  ⚠️ CRM scrape/save error: ${crmErr.message?.substring(0, 80)}`);
                // Non-critical — continue
            }

            // ── Final status: interactuando (scraping done, enrichment will handle next) ──
            // The enrichment service will automatically pick up contacts in 'interactuando' status
            // and move them through: enriqueciendo → esperando_aceptacion
            logger.log(`  ✅ CRM: Pipeline complete for this profile`);
            logger.log(`     → Status: interactuando (waiting for auto-enrichment)`);

            // Mark as done
            this.updateProfile(index, {
                status: 'done',
                completedAt: new Date().toISOString(),
            });
            this.emitProgress();

            logger.log(`  ✅ Profile done: ${this.profiles[index].name || profile.url}`);

            // NEW: Record success in HealthMonitor
            const duration = Date.now() - profileStartTime;
            healthMonitor.recordSuccess(duration);
            rateLimitHandler.recordSuccess(); // Reset rate limit counter

        } catch (error: any) {
            // NEW: Record error in HealthMonitor
            healthMonitor.recordError(error, `profile_${index}`);
            logger.log(`  ❌ Profile error: ${error.message}`);
            throw error; // Re-throw to be handled by caller

        } finally {
            // Always close the logger, even on exceptions
            logger.close();
            healthMonitor.endOperation();
        }
    }

    // ── Connect ──────────────────────────────────────────────

    private async connectProfile(page: Page, logger: LinkedInLogger, note?: string): Promise<boolean> {

        // Scroll to top — action buttons are in the profile header
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
        await this.delay(this.getRandomDelay(800, 1500));

        // Wait for profile action buttons to be visible in the DOM
        try {
            await page.waitForSelector('button', { timeout: 5000 });
        } catch {
            logger.log('  ⚠️ No buttons found on page');
        }

        const currentUrl = page.url();

        // ── DEBUG: Log all buttons AND links in the header area ──
        try {
            const debugInfo = await page.evaluate(() => {
                const elements = document.querySelectorAll('button, a');
                const headerItems: { text: string; aria: string; top: number; tag: string; href: string }[] = [];
                for (const el of elements) {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0 && rect.top < 700) {
                        headerItems.push({
                            text: (el.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 50),
                            aria: (el.getAttribute('aria-label') || '').substring(0, 80),
                            top: Math.round(rect.top),
                            tag: el.tagName,
                            href: (el.getAttribute('href') || '').substring(0, 60),
                        });
                    }
                }
                return headerItems;
            });
            logger.log(`  🔍 DEBUG: ${debugInfo.length} elements in header area:`);
            debugInfo.forEach((b, i) => {
                logger.log(`     [${i}] <${b.tag}> text="${b.text}" aria="${b.aria}" href="${b.href}" top=${b.top}`);
            });
        } catch (debugErr: any) {
            logger.log(`  ⚠️ Debug info failed: ${debugErr.message?.substring(0, 60)}`);
        }

        // 📸 Screenshot of profile header with action buttons
        await logger.screenshot(page, 'before_connect');

        // Log ALL interactive elements (complete DOM dump)
        await logger.logAllInteractiveElements(page, 800);

        let connectEl: any = null;
        let connectHref: string | null = null;
        let usedStrategy = '';

        // ── PRE-SCAN: Collect connectHref from any <a> link with custom-invite ──
        // We store this for fallback navigation later (Strategy 3)
        connectHref = await page.evaluate(() => {
            const links = document.querySelectorAll('a');
            for (const link of links) {
                const href = (link.getAttribute('href') || '');
                const rect = link.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    if (href.toLowerCase().includes('/preload/custom-invite') || href.toLowerCase().includes('custom-invite')) {
                        return href;
                    }
                }
            }
            return null;
        });
        if (connectHref) {
            logger.log(`  📝 Pre-scan: Found custom-invite href for fallback: "${connectHref}"`);
        }

        // ══════════════════════════════════════════════════════════
        // Strategy 0: Direct <a> link with custom-invite href
        // LinkedIn often renders the "Conectar" action as an <a> link
        // pointing to /preload/custom-invite/?vanityName=... 
        // This is the MOST RELIABLE strategy — this href only appears
        // on profiles you haven't connected with yet.
        // ══════════════════════════════════════════════════════════
        logger.log('  🔎 Strategy 0: Looking for <a> link with custom-invite href...');
        const customInviteLink = await page.evaluateHandle(() => {
            const links = document.querySelectorAll('a');
            for (const link of links) {
                const href = (link.getAttribute('href') || '').toLowerCase();
                const rect = link.getBoundingClientRect();
                // Only look in the profile header area (top < 550), skip sidebar suggestions
                if (rect.width > 0 && rect.height > 0 && rect.top > 0 && rect.top < 550) {
                    if (href.includes('/preload/custom-invite') || href.includes('custom-invite')) {
                        // Check if this is a sidebar suggestion (has "Invita a" for someone else)
                        const ariaLabel = (link.getAttribute('aria-label') || '').toLowerCase();
                        // The profile's own Conectar link says "Invita a [PROFILE NAME]"
                        // Sidebar suggestions also say "Invita a [OTHER NAME]"
                        // We want the one in the profile header area (top < 550)
                        return link;
                    }
                }
            }
            return null;
        });
        connectEl = customInviteLink.asElement();

        if (connectEl) {
            usedStrategy = '0 (custom-invite <a> link)';
            logger.log('  ✅ Strategy 0: Found custom-invite <a> link');
        }

        // ══════════════════════════════════════════════════════════
        // Strategy 1: Direct <button> OR <a> with "Conectar"/"Connect" (top < 400)
        // For profiles where Connect is a primary action button or link.
        // IMPORTANT: Exclude sidebar suggestion buttons.
        // ══════════════════════════════════════════════════════════
        if (!connectEl) {
            logger.log('  🔎 Strategy 1: Looking for direct Connect <button> or <a>...');
            const directBtn = await page.evaluateHandle(() => {
                // Search both buttons AND links
                const elements = document.querySelectorAll('button, a');
                for (const el of elements) {
                    const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
                    const text = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                    const rect = el.getBoundingClientRect();
                    const tag = el.tagName.toLowerCase();

                    if (rect.width > 0 && rect.height > 0 && rect.top > 0 && rect.top < 400) {
                        // SKIP suggestion card buttons — they say "Invita a [Other Person] a conectar"
                        // But DON'T skip the profile's own "Invita a [Profile Name] a conectar" link
                        // Distinguish: sidebar suggestions are typically at top > 350 or in the right panel
                        if (tag === 'button' && (ariaLabel.includes('invita a') || ariaLabel.includes('invite '))) {
                            continue;
                        }

                        if ((ariaLabel.includes('conectar') || ariaLabel.includes('connect')) &&
                            !ariaLabel.includes('disconnect') && !ariaLabel.includes('desconectar')) {
                            return el;
                        }
                        if ((text === 'conectar' || text === 'connect') &&
                            !text.includes('message') && !text.includes('mensaje')) {
                            return el;
                        }
                    }
                }
                return null;
            });
            connectEl = directBtn.asElement();

            if (connectEl) {
                usedStrategy = '1 (direct button/link)';
                logger.log('  ✅ Strategy 1: Found direct Connect element');
            }
        }


        // ══════════════════════════════════════════════════════════
        // Strategy 2: "Más" / "..." dropdown → "Conectar" inside
        // THIS IS THE PRIMARY STRATEGY for profiles like carlosjacoste where
        // Connect is hidden inside the "..." dropdown menu.
        // Sorted: header buttons (top ≤ 20) FIRST, then by top descending.
        // ══════════════════════════════════════════════════════════
        if (!connectEl) {
            logger.log('  🔎 Strategy 2: Looking for Más/... dropdown with Conectar inside...');

            // Collect ALL "Más"/"More" buttons with their positions
            const moreButtonPositions = await page.evaluate(() => {
                const buttons = document.querySelectorAll('button');
                const results: { index: number; top: number; aria: string }[] = [];
                let idx = 0;
                for (const btn of buttons) {
                    const ariaLabel = (btn.getAttribute('aria-label') || '').trim().toLowerCase();
                    const rect = btn.getBoundingClientRect();

                    if (rect.width > 0 && rect.height > 0 && rect.top < 700) {
                        if (ariaLabel === 'más' || ariaLabel === 'more' ||
                            ariaLabel.includes('more actions') || ariaLabel.includes('más acciones') ||
                            ariaLabel.includes('more options') || ariaLabel.includes('más opciones')) {
                            results.push({ index: idx, top: Math.round(rect.top), aria: ariaLabel });
                        }
                    }
                    idx++;
                }
                // Sort: HEADER buttons (top ≤ 20) first, then by top descending
                // The profile's "..." button at top=3 should be tried BEFORE sidebar "..." at top=544
                results.sort((a, b) => {
                    const aIsHeader = a.top <= 20 ? 0 : 1;
                    const bIsHeader = b.top <= 20 ? 0 : 1;
                    if (aIsHeader !== bIsHeader) return aIsHeader - bIsHeader;
                    return b.top - a.top;
                });
                return results;
            });

            logger.log(`  🔍 Found ${moreButtonPositions.length} Más/More buttons: ${JSON.stringify(moreButtonPositions)}`);

            // Try each Más button until we find one with "Conectar" in its dropdown
            for (const morePos of moreButtonPositions) {
                logger.log(`  🔄 Trying Más button at top=${morePos.top}...`);

                // Get this specific button by its index
                const moreButton = await page.evaluateHandle((targetIdx: number) => {
                    const buttons = document.querySelectorAll('button');
                    let idx = 0;
                    for (const btn of buttons) {
                        if (idx === targetIdx) return btn;
                        idx++;
                    }
                    return null;
                }, morePos.index);

                const moreEl = moreButton.asElement();
                if (!moreEl) continue;

                // Scroll Más button into view before clicking
                await page.evaluate((el: Element) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), moreEl);
                await this.delay(this.getRandomDelay(300, 600));

                await this.humanClick(page, moreEl);
                await this.delay(this.getRandomDelay(1500, 3000));

                // Debug: log dropdown items (broad search — LinkedIn uses obfuscated classes)
                try {
                    const dropdownDebug = await page.evaluate(() => {
                        // Search ALL visible elements — LinkedIn's new UI doesn't use artdeco classes
                        const items = document.querySelectorAll(
                            '[aria-label], [role="menuitem"], [role="option"], ' +
                            '.artdeco-dropdown__content span, .artdeco-dropdown__content div, ' +
                            '[role="menu"] span, [role="menu"] div, ' +
                            '.artdeco-dropdown__content-inner span, ' +
                            '.artdeco-dropdown__content-inner li, ' +
                            'div[class*="dropdown"] span'
                        );
                        return Array.from(items)
                            .filter(el => {
                                const rect = el.getBoundingClientRect();
                                return rect.width > 0 && rect.height > 0 && rect.top > 0 && rect.top < 600;
                            })
                            .slice(0, 25)
                            .map(el => ({
                                text: (el.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 50),
                                tag: el.tagName,
                                aria: (el.getAttribute('aria-label') || '').substring(0, 60),
                            }));
                    });
                    logger.log(`  🔍 Dropdown items (${dropdownDebug.length}): ${JSON.stringify(dropdownDebug)}`);
                } catch { /* skip */ }

                // Look for "Conectar" / "Connect" INSIDE the dropdown only
                // LinkedIn's new UI uses <div aria-label="Invita a X a conectar"> with <p>Conectar</p>
                // CRITICAL: Only search div/span elements — NOT <button> (sidebar suggestions)
                // and NOT <a> (header links). Dropdown items are always <div> elements.
                const dropdownConnect = await page.evaluateHandle(() => {
                    // ── Method 1: aria-label on div/span/li only (dropdown items) ──
                    // Excludes <button> (sidebar suggestions) and <a> (header links)
                    const ariaElements = document.querySelectorAll(
                        'div[aria-label], span[aria-label], li[aria-label]'
                    );
                    for (const el of ariaElements) {
                        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0 && rect.top > 0 && rect.top < 600) {
                            if ((ariaLabel.includes('invita') && ariaLabel.includes('conectar')) ||
                                (ariaLabel.includes('invite') && ariaLabel.includes('connect')) ||
                                ariaLabel === 'conectar' || ariaLabel === 'connect') {
                                return el;
                            }
                        }
                    }

                    // ── Method 2: Text search — verify NOT inside a <button> ancestor ──
                    // Sidebar suggestion "Conectar" is always inside a <button> parent
                    // Dropdown items are standalone <div>/<p> elements, never inside <button>
                    const allElements = document.querySelectorAll(
                        'p, span, div, ' +
                        '.artdeco-dropdown__content span, .artdeco-dropdown__content div, ' +
                        '[role="menu"] span, [role="menuitem"] span, [role="menuitem"], ' +
                        '.artdeco-dropdown__content-inner span, ' +
                        '.artdeco-dropdown__content-inner li, ' +
                        'div[data-control-name] span, ' +
                        'div[class*="dropdown"] span'
                    );

                    for (const el of allElements) {
                        const text = (el.textContent || '').trim().toLowerCase();
                        if (text === 'connect' || text === 'conectar') {
                            const rect = el.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0 && rect.top > 0 && rect.top < 600) {
                                // GUARD: if inside a <button>, it's a sidebar suggestion — skip
                                if (el.closest('button')) continue;
                                // GUARD: if inside an <a>, it's a header link — skip
                                if (el.closest('a')) continue;

                                // Find the closest clickable ancestor (div-based)
                                const clickable = el.closest(
                                    '[role="menuitem"], [role="button"], [aria-label], ' +
                                    'div[tabindex], div[data-control-name], div[componentkey]'
                                ) || el;
                                return clickable;
                            }
                        }
                    }
                    return null;
                });

                connectEl = dropdownConnect.asElement();

                if (connectEl) {
                    usedStrategy = `2 (Más dropdown at top=${morePos.top})`;
                    logger.log(`  ✅ Strategy 2: Found Conectar in dropdown (from Más at top=${morePos.top})`);
                    break; // Found it!
                } else {
                    // Close this dropdown and try the next Más button
                    await page.keyboard.press('Escape');
                    await this.delay(this.getRandomDelay(500, 1000));
                    logger.log(`  ⏭️ No Conectar in this dropdown, trying next...`);
                }
            }

            if (!connectEl && moreButtonPositions.length > 0) {
                logger.log('  ⏭️ Conectar not found in any Más dropdown');
            } else if (moreButtonPositions.length === 0) {
                logger.log('  ℹ️ No Más/More buttons found on page');
            }
        }

        // ══════════════════════════════════════════════════════════
        // Strategy 3 (LAST RESORT): Direct navigation to the invite URL
        // Instead of clicking <a> links (unreliable due to SPA interception),
        // we navigate directly to the invite URL via page.goto().
        // ══════════════════════════════════════════════════════════
        if (!connectEl && connectHref) {
            logger.log(`  🔎 Strategy 3: Direct navigation to invite URL: ${connectHref}`);
            try {
                const fullUrl = connectHref.startsWith('http') ? connectHref : `https://www.linkedin.com${connectHref}`;
                await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                await this.delay(this.getRandomDelay(3000, 5000));

                const invitePageUrl = page.url();
                logger.log(`  🔗 Invite page URL: ${invitePageUrl.substring(0, 80)}`);

                const isInvitePage = invitePageUrl.includes('/preload/custom-invite') || invitePageUrl.includes('custom-invite');
                if (isInvitePage) {
                    logger.log('  ✅ Strategy 3: On invite page');

                    // DEBUG: Log ALL buttons on invite page
                    try {
                        const inviteDebug = await page.evaluate(() => {
                            const btns = document.querySelectorAll('button');
                            return Array.from(btns)
                                .filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
                                .slice(0, 15)
                                .map(b => ({
                                    text: (b.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 50),
                                    aria: (b.getAttribute('aria-label') || '').substring(0, 60),
                                    top: Math.round(b.getBoundingClientRect().top),
                                }));
                        });
                        logger.log(`  🔍 Invite page buttons: ${JSON.stringify(inviteDebug)}`);
                    } catch { /* skip */ }

                    // Find the Send button on the invite page
                    const sendBtnOnInvite = await page.evaluateHandle(() => {
                        const buttons = document.querySelectorAll('button');
                        for (const btn of buttons) {
                            const text = (btn.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                            const rect = btn.getBoundingClientRect();
                            if (rect.width > 0 && rect.height > 0) {
                                if (text.includes('enviar sin nota') || text.includes('send without a note') ||
                                    text.includes('enviar invitación') || text.includes('send invitation') ||
                                    text === 'enviar' || text === 'send') {
                                    return btn;
                                }
                                if ((ariaLabel.includes('send') || ariaLabel.includes('enviar')) &&
                                    !ariaLabel.includes('message') && !ariaLabel.includes('mensaje') &&
                                    !ariaLabel.includes('perfil') && !ariaLabel.includes('profile')) {
                                    return btn;
                                }
                            }
                        }
                        return null;
                    });
                    const sendElDirect = sendBtnOnInvite.asElement();
                    if (sendElDirect) {
                        const sendText = await page.evaluate((el: Element) => ({
                            text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
                            aria: el.getAttribute('aria-label') || '',
                        }), sendElDirect);
                        logger.log(`  📨 Strategy 3: Found Send: text="${sendText.text}" aria="${sendText.aria}"`);
                        await this.humanClick(page, sendElDirect);
                        logger.log('  ✅ Strategy 3: Connection request sent via invite page!');
                        await this.delay(this.getRandomDelay(2000, 3000));

                        // Navigate back and verify
                        logger.log('  🔍 Verifying connection was actually sent...');
                        const verification = await this.verifyConnectionSent(page, logger, currentUrl);

                        if (verification === 'verified') {
                            logger.log('  ✅ VERIFIED: Connection request confirmed');
                            return true;
                        } else if (verification === 'failed') {
                            logger.log('  ❌ VERIFICATION FAILED: Connection was NOT sent');
                            return false;
                        } else {
                            logger.log('  ⚠️ VERIFICATION UNCERTAIN: Assuming sent (invite page flow)');
                            return true;
                        }
                    } else {
                        logger.log('  ⚠️ Strategy 3: No Send button found on invite page');
                        await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => { });
                    }
                } else {
                    logger.log(`  ⚠️ Strategy 3: Didn't reach invite page (url: ${invitePageUrl.substring(0, 80)})`);
                    await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => { });
                }
            } catch (err: any) {
                logger.log(`  ⚠️ Strategy 3 error: ${err.message?.substring(0, 80)}`);
                await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => { });
            }
        }

        // ══════════════════════════════════════════════════════════
        // No connect found — bail out
        // ══════════════════════════════════════════════════════════
        if (!connectEl) {
            logger.log('  ⏭️ Connect button not found via any strategy (possibly already connected or pending)');
            return false;
        }

        // ── Scroll element into view before clicking ──
        logger.log(`  📌 Scrolling connect element into view (strategy: ${usedStrategy})...`);
        await page.evaluate((el: Element) => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), connectEl);
        await this.delay(this.getRandomDelay(500, 1000));

        // ── Click the Connect element ──
        // 📸 Screenshot before clicking connect
        await logger.screenshot(page, 'before_click_connect');

        logger.log('  🖱️ Clicking connect element...');
        await this.humanClick(page, connectEl);
        await this.delay(this.getRandomDelay(2000, 4000));

        // GUARD: check we didn't navigate away (but /preload/custom-invite is expected)
        const postClickUrl = page.url();
        logger.log(`  🔗 Post-click URL: ${postClickUrl.substring(0, 80)}`);

        // 📸 Screenshot after clicking connect
        await logger.screenshot(page, 'after_click_connect');
        if (!postClickUrl.includes('/in/') && !postClickUrl.includes('/preload/custom-invite') && postClickUrl !== currentUrl) {
            logger.log('  ⚠️ Navigation detected after clicking Connect — going back');
            await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => { });
            return false;
        }

        // If we navigated to /preload/custom-invite, wait for the invite page to load
        let isInvitePage = page.url().includes('/preload/custom-invite');
        if (isInvitePage) {
            logger.log('  📋 Navigated to invite page, waiting for it to load...');
            await this.delay(this.getRandomDelay(2000, 4000));
        }

        // ── Handle the connect modal ──
        // Wait for the INVITE-specific modal (not generic role=dialog which always exists)
        let modalVisible = false;
        try {
            // Wait for the actual modal overlay that LinkedIn shows for invitations
            await page.waitForSelector('.artdeco-modal-overlay--visible, .artdeco-modal-overlay, .send-invite', { timeout: 5000 });
            // Verify it's actually an invite modal (contains send button text)
            modalVisible = await page.evaluate(() => {
                const overlay = document.querySelector('.artdeco-modal-overlay--visible, .artdeco-modal-overlay, .send-invite');
                if (!overlay) return false;
                const text = (overlay.textContent || '').toLowerCase();
                return text.includes('enviar sin nota') || text.includes('send without') ||
                    text.includes('añadir una nota') || text.includes('add a note') ||
                    text.includes('enviar invitación') || text.includes('send invitation') ||
                    text.includes('nota a la invitación') || text.includes('note to invitation');
            });
            if (modalVisible) {
                logger.log('  📋 Connect/invite modal detected');
            } else {
                logger.log('  ⚠️ Modal overlay exists but does NOT contain invite content');
            }
        } catch {
            // No modal overlay found — check if maybe it's a different type of dialog
            modalVisible = await page.evaluate(() => {
                const modals = document.querySelectorAll('[role="dialog"][aria-modal="true"], .artdeco-modal');
                for (const m of modals) {
                    const text = (m.textContent || '').toLowerCase();
                    if (text.includes('enviar sin nota') || text.includes('send without') ||
                        text.includes('añadir una nota') || text.includes('add a note')) {
                        return true;
                    }
                }
                return false;
            });
            if (modalVisible) {
                logger.log('  📋 Connect modal detected (via evaluate fallback)');
            }
        }

        if (!modalVisible && !isInvitePage) {
            logger.log('  ⚠️ No connect modal appeared after clicking element');

            // ── FALLBACK: If we have a stored connectHref, try direct navigation ──
            if (connectHref) {
                logger.log(`  🔄 Fallback: Navigating directly to invite URL: ${connectHref}`);
                try {
                    const fullUrl = connectHref.startsWith('http') ? connectHref : `https://www.linkedin.com${connectHref}`;
                    await page.goto(fullUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    await this.delay(this.getRandomDelay(2000, 4000));

                    isInvitePage = page.url().includes('/preload/custom-invite') || page.url().includes('custom-invite');
                    if (isInvitePage) {
                        logger.log('  ✅ Fallback: Reached invite page via direct navigation');
                    } else {
                        logger.log(`  ⚠️ Fallback: Direct navigation failed (url: ${page.url().substring(0, 80)})`);
                        await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => { });
                        return false;
                    }
                } catch (err: any) {
                    logger.log(`  ⚠️ Fallback navigation error: ${err.message?.substring(0, 80)}`);
                    return false;
                }
            } else {
                logger.log('  ❌ No fallback available — click may not have worked');
                return false;
            }
        }

        // ── Determine search scope ──
        const searchScope = isInvitePage
            ? 'button'
            : '[role="dialog"] button, .artdeco-modal button, button.artdeco-button';

        // ── Handle note (if sending with note) ──
        if (note) {
            const addNoteBtn = await page.evaluateHandle((scope: string) => {
                const buttons = document.querySelectorAll(scope);
                for (const btn of buttons) {
                    const text = (btn.textContent || '').trim().toLowerCase();
                    if (text.includes('add a note') || text.includes('añadir nota') ||
                        text.includes('añadir una nota') || text.includes('agregar nota')) {
                        return btn;
                    }
                }
                return null;
            }, searchScope);

            const addNoteEl = addNoteBtn.asElement();
            if (addNoteEl) {
                logger.log('  📝 Clicking "Añadir nota"...');
                await this.humanClick(page, addNoteEl);
                await this.delay(this.getRandomDelay(800, 1500));

                // Find the note textarea
                const textarea = await page.$('[role="dialog"] textarea') ||
                    await page.$('.artdeco-modal textarea') ||
                    await page.$('textarea[name="message"]') ||
                    await page.$('textarea') ||
                    await page.$('#custom-message');
                if (textarea) {
                    await textarea.click();
                    await this.delay(this.getRandomDelay(300, 600));

                    const profileName = this.profiles[this.currentIndex]?.name || '';
                    const firstName = profileName.split(' ')[0] || '';
                    const personalizedNote = note.replace(/\{nombre\}/gi, firstName);

                    await page.keyboard.type(personalizedNote, { delay: this.getRandomDelay(30, 80) });
                    await this.delay(this.getRandomDelay(500, 1000));
                    logger.log('  ✅ Note typed');
                }
            }
        }

        // DEBUG: Log ALL visible buttons INSIDE the modal overlay
        try {
            const sendDebug = await page.evaluate((invPage: boolean) => {
                const overlay = document.querySelector('.artdeco-modal-overlay--visible, .artdeco-modal-overlay, .artdeco-modal');
                const modalBtns = overlay ? overlay.querySelectorAll('button') : null;
                const allBtns = document.querySelectorAll('button');
                const wh = window.innerHeight;

                // Use function declaration instead of const arrow to avoid __name issues
                function formatBtn(b: Element) {
                    return {
                        text: (b.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 50),
                        aria: (b.getAttribute('aria-label') || '').substring(0, 60),
                        top: Math.round(b.getBoundingClientRect().top),
                        inModal: !!b.closest('.artdeco-modal-overlay--visible, .artdeco-modal-overlay, .artdeco-modal'),
                    };
                }

                const modalResults = modalBtns
                    ? Array.from(modalBtns).filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).map(formatBtn)
                    : [];

                const viewportEnviar = Array.from(allBtns)
                    .filter(b => {
                        const r = b.getBoundingClientRect();
                        const t = (b.textContent || '').toLowerCase().trim();
                        return r.width > 0 && r.height > 0 && r.top > -50 && r.top < wh && t.includes('enviar');
                    })
                    .map(formatBtn);

                return { modalButtons: modalResults, viewportEnviar, hasOverlay: !!overlay, viewportHeight: wh };
            }, isInvitePage);
            logger.log(`  🔍 Modal overlay found: ${sendDebug.hasOverlay}, modal buttons: ${sendDebug.modalButtons.length}, viewport enviar: ${sendDebug.viewportEnviar.length}`);
            if (sendDebug.modalButtons.length > 0) {
                logger.log(`  🔍 Modal buttons: ${JSON.stringify(sendDebug.modalButtons)}`);
            }
            if (sendDebug.viewportEnviar.length > 0) {
                logger.log(`  🔍 Viewport "enviar" buttons: ${JSON.stringify(sendDebug.viewportEnviar)}`);
            }
        } catch { /* skip */ }

        // ── 2-Phase Send Button Search ──
        // Phase 1: Search ONLY inside the modal overlay (most reliable)
        // Phase 2: Search viewport-visible buttons as fallback
        // NOTE: All logic is inlined to avoid __name decorator issues with tsx/esbuild
        const sendBtn = await page.evaluateHandle(() => {
            const wh = window.innerHeight;

            // Phase 1: Search inside the modal overlay
            const overlays = document.querySelectorAll(
                '.artdeco-modal-overlay--visible, .artdeco-modal-overlay, .artdeco-modal, [role="dialog"][aria-modal="true"]'
            );
            for (const overlay of overlays) {
                const btns = overlay.querySelectorAll('button');
                for (const btn of btns) {
                    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                    const text = (btn.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                    const rect = btn.getBoundingClientRect();
                    if (rect.width <= 0 || rect.height <= 0) continue;

                    if (text === 'enviar sin nota' || text === 'send without a note' ||
                        text === 'enviar invitación' || text === 'send invitation' ||
                        text === 'enviar' || text === 'send') {
                        if (!text.includes('mensaje') && !text.includes('message') &&
                            !text.includes('perfil') && !text.includes('profile')) {
                            return btn;
                        }
                    }
                    if ((ariaLabel.includes('send without') || ariaLabel.includes('enviar sin') ||
                        ariaLabel === 'send' || ariaLabel === 'enviar') &&
                        !ariaLabel.includes('message') && !ariaLabel.includes('mensaje') &&
                        !ariaLabel.includes('perfil') && !ariaLabel.includes('profile')) {
                        return btn;
                    }
                }
            }

            // Phase 2: Search ALL buttons but ONLY if visible in viewport
            const allButtons = document.querySelectorAll('button');
            for (const btn of allButtons) {
                const rect = btn.getBoundingClientRect();
                // STRICT viewport check: must be visible on screen
                if (rect.top < -50 || rect.top > wh + 50) continue;
                if (rect.width <= 0 || rect.height <= 0) continue;

                const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                const text = (btn.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();

                if (text === 'enviar sin nota' || text === 'send without a note' ||
                    text === 'enviar invitación' || text === 'send invitation' ||
                    text === 'enviar' || text === 'send') {
                    if (!text.includes('mensaje') && !text.includes('message') &&
                        !text.includes('perfil') && !text.includes('profile')) {
                        return btn;
                    }
                }
                if ((ariaLabel.includes('send without') || ariaLabel.includes('enviar sin') ||
                    ariaLabel === 'send' || ariaLabel === 'enviar') &&
                    !ariaLabel.includes('message') && !ariaLabel.includes('mensaje') &&
                    !ariaLabel.includes('perfil') && !ariaLabel.includes('profile')) {
                    return btn;
                }
            }

            return null;
        });

        const sendEl = sendBtn.asElement();
        if (sendEl) {
            // Log exactly which button we're clicking
            const sendDetails = await page.evaluate((el: Element) => ({
                text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
                aria: el.getAttribute('aria-label') || '',
                top: Math.round(el.getBoundingClientRect().top),
            }), sendEl);
            logger.log(`  📨 Clicking Send: text="${sendDetails.text}" aria="${sendDetails.aria}" top=${sendDetails.top}`);
            await this.humanClick(page, sendEl);
            logger.log('  ✅ Connection request sent (click done)');
            await this.delay(this.getRandomDelay(2000, 3000));

            // ── VERIFICATION: Reload profile and confirm connection was sent ──
            logger.log('  🔍 Verifying connection was actually sent...');
            const verification = await this.verifyConnectionSent(page, logger, currentUrl);

            if (verification === 'verified') {
                logger.log('  ✅ VERIFIED: Connection request confirmed');
                return true;
            } else if (verification === 'failed') {
                logger.log('  ❌ VERIFICATION FAILED: "Conectar" still visible — connection was NOT sent');
                return false;
            } else {
                // uncertain — benefit of the doubt
                logger.log('  ⚠️ VERIFICATION UNCERTAIN: No Pendiente/Conectar found — assuming sent');
                return true;
            }
        } else {
            // Try to dismiss any modal
            await page.keyboard.press('Escape');
            logger.log('  ⚠️ Could not find Send button — dismissed modal');

            // Navigate back if on invite page
            if (isInvitePage) {
                await page.goto(currentUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => { });
            }
            return false;
        }
    }

    // ── Verify Connection Was Actually Sent ───────────────────

    private async verifyConnectionSent(page: Page, logger: LinkedInLogger, profileUrl: string): Promise<'verified' | 'failed' | 'uncertain'> {
        try {
            // NEW: Use the robust ConnectionVerifier
            logger.log('  🌐 Reloading profile for verification (using multi-method verifier)...');
            
            const verification = await connectionVerifier.verify(page, profileUrl, 2);
            
            // 📸 Screenshot during verification
            await logger.screenshot(page, 'verification');
            await logger.logPageState(page, 'verification');

            logger.log(`  🔍 Verification result: connected=${verification.connected}, confidence=${verification.confidence}, method=${verification.method}`);
            
            if (verification.evidence.length > 0) {
                for (const evidence of verification.evidence.slice(0, 3)) {
                    logger.log(`     → ${evidence}`);
                }
            }

            // Map new verification result to legacy return type
            if (verification.connected && verification.confidence === 'high') {
                return 'verified';
            } else if (!verification.connected && verification.confidence === 'high') {
                return 'failed';
            } else if (verification.connected && verification.confidence === 'medium') {
                return 'verified'; // Accept medium confidence as verified
            } else if (!verification.connected && verification.confidence === 'medium') {
                return 'uncertain'; // Medium confidence failure is uncertain
            }
            
            return 'uncertain';
        } catch (err: any) {
            logger.log(`  ⚠️ Verification error: ${err.message?.substring(0, 80)}`);
            return 'uncertain';
        }
    }

    // ── Like Latest Post ─────────────────────────────────────

    private async likeLatestPost(page: Page, profileUrl: string, logger?: LinkedInLogger): Promise<boolean> {


        // Navigate to recent activity/posts
        const postsUrl = profileUrl.replace(/\/$/, '') + '/recent-activity/all/';
        try {
            await page.goto(postsUrl, { waitUntil: 'networkidle2', timeout: 15000 });
        } catch {
            (logger || console).log('  ⚠️ Posts page load timeout, continuing...' as any);
        }

        await this.randomDelay(DELAYS.pageLoad);
        await this.humanScroll(page);

        // Find the first like/reaction button that's not already pressed
        const liked = await page.evaluate(() => {
            // LinkedIn reaction buttons have aria-label containing "React Like" or "Recomendar"
            const buttons = document.querySelectorAll(
                'button[aria-label*="Like" i], ' +
                'button[aria-label*="React" i], ' +
                'button[aria-label*="Recomendar" i], ' +
                'button[aria-label*="Me gusta" i]'
            );

            for (const btn of buttons) {
                const pressed = btn.getAttribute('aria-pressed');
                if (pressed === 'true') continue; // Already liked

                const rect = btn.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    // Scroll it into view and click
                    btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    return { found: true, top: rect.top };
                }
            }
            return { found: false };
        });

        if (!liked.found) {
            (logger || console).log('  ⏭️ No posts to like' as any);
            return false;
        }

        // Wait for scroll to settle, then find and click the button
        await this.delay(this.getRandomDelay(600, 1200));

        const likeBtn = await page.$('button[aria-label*="Like" i][aria-pressed="false"], button[aria-label*="React" i][aria-pressed="false"], button[aria-label*="Recomendar" i][aria-pressed="false"], button[aria-label*="Me gusta" i][aria-pressed="false"]');

        if (likeBtn) {
            await this.humanClick(page, likeBtn);
            (logger || console).log('  ✅ Liked latest post' as any);
            await this.randomDelay(DELAYS.afterLike);
            return true;
        }

        (logger || console).log('  ⏭️ No posts to like' as any);
        return false;
    }

    // ── Captcha Detection ────────────────────────────────────

    private async detectCaptcha(page: Page): Promise<boolean> {
        try {
            // Use specific selectors instead of broad keyword matching
            // The word 'challenge' appears in normal LinkedIn content (false positive)
            const hasCaptcha = await page.evaluate(() => {
                // Check for specific captcha elements
                const captchaSelectors = [
                    'iframe[src*="captcha"]',
                    'iframe[src*="recaptcha"]',
                    'iframe[src*="hcaptcha"]',
                    '.g-recaptcha',
                    '#captcha',
                    '[data-captcha]',
                    '.captcha-container',
                    'iframe[title*="captcha" i]',
                    'iframe[title*="challenge" i]',
                ];
                for (const sel of captchaSelectors) {
                    if (document.querySelector(sel)) return true;
                }

                // Check URL for LinkedIn's security challenge page
                const url = window.location.href.toLowerCase();
                if (url.includes('/checkpoint/challenge') ||
                    url.includes('/checkpoint/lg/') ||
                    url.includes('/authwall')) {
                    return true;
                }

                // Check for specific security verification text in main content
                const bodyText = document.body?.innerText?.toLowerCase() || '';
                if (bodyText.includes('security verification') ||
                    bodyText.includes('verificación de seguridad') ||
                    bodyText.includes('let\'s do a quick security check') ||
                    bodyText.includes('hagamos una verificación')) {
                    return true;
                }

                return false;
            });
            if (hasCaptcha) {
                console.log(`  🔒 Captcha detected (URL: ${page.url().substring(0, 80)})`);
            }
            return hasCaptcha;
        } catch {
            return false;
        }
    }

    private async waitForCaptchaResolution(page: Page): Promise<void> {
        console.log('  🔒 Waiting for captcha to be resolved manually (timeout: 5min)...');

        return new Promise<void>((resolve) => {
            const MAX_WAIT = 5 * 60 * 1000; // 5 minutes
            const startTime = Date.now();

            const check = setInterval(async () => {
                // Timeout guard — don't wait forever
                if (Date.now() - startTime > MAX_WAIT) {
                    console.log('  ⏰ Captcha wait timeout (5min) — continuing...');
                    clearInterval(check);
                    resolve();
                    return;
                }

                try {
                    const hasCaptcha = await this.detectCaptcha(page);
                    if (!hasCaptcha) {
                        console.log('  ✅ Captcha resolved');
                        clearInterval(check);
                        resolve();
                    }
                } catch {
                    // Page changed, captcha probably resolved
                    clearInterval(check);
                    resolve();
                }
            }, 3000);
        });
    }

    // ── Pause/Resume/Stop ────────────────────────────────────

    async pause(): Promise<void> {
        if (!this.isRunning) return;
        this.isPaused = true;
        console.log('⏸️ Prospecting paused');
        this.emit('paused', { current: this.currentIndex, total: this.profiles.length });
    }

    async resume(): Promise<void> {
        if (!this.isPaused) return;
        this.isPaused = false;
        console.log('▶️ Prospecting resumed');

        // If we have a pending session-expired issue, re-check login
        if (this.status === 'browser-open' && this.page) {
            const loggedIn = await this.checkLoggedIn();
            if (loggedIn) {
                this.status = 'logged-in';
                await this.saveCookies();
            }
        }

        if (this.pauseResolve) {
            this.pauseResolve();
            this.pauseResolve = null;
        }
        this.emit('resumed', { current: this.currentIndex, total: this.profiles.length });
    }

    async stop(): Promise<{ deletedCount: number }> {
        this.shouldStop = true;
        this.isPaused = false;
        this.isRunning = false;

        if (this.pauseResolve) {
            this.pauseResolve();
            this.pauseResolve = null;
        }

        // 🗑️ Eliminar contactos pendientes (estado 'visitando' - aún no procesados)
        let deletedCount = 0;
        try {
            const pendingStatuses = ['visitando', 'conectando'];
            const deleteResult = await LinkedInContact.deleteMany({
                status: { $in: pendingStatuses },
            });
            deletedCount = deleteResult.deletedCount || 0;
            console.log(`🗑️ Eliminados ${deletedCount} contactos pendientes`);
            
            // También limpiar el array de profiles interno
            this.profiles = [];
            this.currentIndex = 0;
        } catch (err: any) {
            console.error('❌ Error eliminando contactos pendientes:', err.message);
        }

        // 🧹 Limpiar estado guardado para que la próxima vez empiece desde cero
        try {
            await statePersistence.clear();
            console.log('[StatePersistence] 🧹 Estado limpiado tras detención manual');
        } catch (err: any) {
            console.error('[StatePersistence] ❌ Error limpiando estado:', err.message);
        }

        console.log('⏹️ Prospecting stopped');
        return { deletedCount };
    }

    private async checkPause(): Promise<void> {
        if (!this.isPaused) return;

        return new Promise<void>((resolve) => {
            this.pauseResolve = resolve;
        });
    }

    // ── Progress Emission ────────────────────────────────────

    private updateProfile(index: number, updates: Partial<ProfileProgress>): void {
        this.profiles[index] = { ...this.profiles[index], ...updates };
        if (updates.steps) {
            this.profiles[index].steps = { ...this.profiles[index].steps, ...updates.steps };
        }
    }

    private emitProgress(): void {
        this.emit('progress', this.getProgress());
    }

    // ── Cleanup ──────────────────────────────────────────────

    async destroy(): Promise<void> {
        this.shouldStop = true;
        this.isRunning = false;

        if (this.pauseResolve) {
            this.pauseResolve();
        }

        if (this.browser) {
            try {
                await this.browser.close();
            } catch {
                // Browser may already be closed
            }
            this.browser = null;
            this.page = null;
        }

        this.status = 'disconnected';
        console.log('🔌 LinkedIn service destroyed');
    }
    // ── CRM: URL Normalization ────────────────────────────────

    private normalizeUrl(url: string): string {
        return url
            .replace(/\/+$/, '')       // trailing slashes
            .split('?')[0]             // query params
            .split('#')[0]             // fragment
            .toLowerCase();
    }

    // ── CRM: Scrape Profile Data ─────────────────────────────

    async scrapeProfileData(page: Page): Promise<ScrapedProfileData | null> {
        console.log('  📸 CRM: Scraping profile data...');

        try {
            // Pre-diagnostic: log page state
            const pageUrl = page.url();
            const pageTitle = await page.title();
            console.log(`  📸 CRM: Page URL: ${pageUrl}`);
            console.log(`  📸 CRM: Page title: "${pageTitle}"`);

            // Wait for the profile to be fully rendered
            // Try multiple selectors — LinkedIn DOM varies
            let foundMainElement = false;
            const selectors = ['h1', '.text-heading-xlarge', '.pv-text-details__left-panel', '.scaffold-layout__main'];
            for (const sel of selectors) {
                try {
                    await page.waitForSelector(sel, { timeout: 5000 });
                    console.log(`  📸 CRM: Found selector: ${sel}`);
                    foundMainElement = true;
                    break;
                } catch {
                    // Try next selector
                }
            }
            if (!foundMainElement) {
                console.log('  ⚠️ CRM: No main profile selectors found, trying to scrape anyway...');
            }

            // Small extra wait for lazy-loaded images
            await new Promise(r => setTimeout(r, 1500));

            const data = await page.evaluate(() => {
                const result: any = { _debug: {} };

                // ── Name (multiple fallbacks) ──
                try {
                    // Try LinkedIn-specific class first (most reliable)
                    const nameEl =
                        document.querySelector('.text-heading-xlarge') ||
                        document.querySelector('h1.text-heading-xlarge') ||
                        document.querySelector('h1') ||
                        document.querySelector('[data-anonymize="person-name"]');
                    result.fullName = nameEl?.textContent?.trim() || '';
                    result._debug.nameSelector = nameEl ? (nameEl.tagName + '.' + (nameEl.className || '').split(' ')[0]) : 'none';

                    // Fallback: look for div with role="button" containing the name (profile header)
                    if (!result.fullName) {
                        const nameButtons = document.querySelectorAll('div[role="button"]');
                        for (const btn of nameButtons) {
                            const rect = btn.getBoundingClientRect();
                            const text = (btn.textContent || '').trim();
                            // Profile name is usually top 300-400px, short text
                            if (rect.top > 300 && rect.top < 450 && text.length > 2 && text.length < 60 && text.includes(' ')) {
                                result.fullName = text;
                                result._debug.nameSelector = 'div-role-button';
                                break;
                            }
                        }
                    }

                    // Fallback: try aria-label on profile section
                    if (!result.fullName) {
                        const profileSection = document.querySelector('section.pv-top-card, .scaffold-layout__main');
                        const ariaName = profileSection?.querySelector('[aria-label]');
                        if (ariaName) {
                            const label = ariaName.getAttribute('aria-label') || '';
                            if (label && label.length < 80) {
                                result.fullName = label;
                                result._debug.nameSelector = 'aria-label';
                            }
                        }
                    }

                    // Fallback: try title tag
                    if (!result.fullName) {
                        const titleText = document.title || '';
                        // LinkedIn titles: "Name | LinkedIn"
                        if (titleText.includes('|')) {
                            result.fullName = titleText.split('|')[0].trim();
                            result._debug.nameSelector = 'title-tag';
                        }
                    }

                    const parts = (result.fullName || '').split(' ');
                    result.firstName = parts[0] || '';
                    result.lastName = parts.slice(1).join(' ') || '';
                } catch { /* skip */ }

                // ── Headline (multiple fallbacks) ──
                try {
                    // Strategy 1: Try LinkedIn-specific selectors
                    const headlineSelectors = [
                        '.text-body-medium.break-words',
                        'div.text-body-medium',
                        '[data-generated-suggestion-target]',
                        '.pv-text-details__left-panel .text-body-medium',
                        '.pv-top-card .text-body-medium',
                        'h2.text-body-medium',
                        '[class*="headline"]'
                    ];
                    
                    let headline = null;
                    for (const sel of headlineSelectors) {
                        headline = document.querySelector(sel);
                        if (headline?.textContent?.trim()) {
                            result.headline = headline.textContent.trim();
                            break;
                        }
                    }
                    
                    // Strategy 2: Search for text containing "|" pipe separator
                    // Modern LinkedIn uses obfuscated classes, so search by content pattern
                    if (!result.headline) {
                        const allElements = document.querySelectorAll('div, span, h2, h3');
                        for (const el of Array.from(allElements)) {
                            const text = el.textContent?.trim();
                            // Look for text with pattern containing "|"
                            // Must have content before and after the pipe
                            if (text && 
                                text.length >= 20 && 
                                text.length <= 150 &&
                                text.includes('|') &&
                                !text.includes('seguidores') &&
                                !text.includes('contactos') &&
                                !text.includes('en común') &&
                                !text.includes('LinkedIn') &&  // Exclude page title artifacts
                                text.split('|')[0].trim().length > 5) {  // Must have content before pipe
                                result.headline = text;
                                break;
                            }
                        }
                    }
                    
                    // CLEANUP: Remove name from headline if it's prepended
                    // LinkedIn sometimes shows "NameTitle at Company" without space
                    if (result.headline && result.fullName) {
                        // Remove name if it's at the start (with or without space)
                        const nameVariants = [
                            result.fullName,
                            result.fullName.replace(/\s+/g, '')
                        ];
                        for (const nameVar of nameVariants) {
                            if (result.headline.toLowerCase().startsWith(nameVar.toLowerCase())) {
                                result.headline = result.headline.substring(nameVar.length).trim();
                                break;
                            }
                        }
                        
                        // Also clean up common artifacts
                        result.headline = result.headline
                            .replace(/^[\s•·–—-]+/, '') // Remove leading separators
                            .replace(/Enviar mensaje.*$/i, '') // Remove UI artifacts
                            .replace(/Seguir.*$/i, '')
                            .trim();
                    }
                    
                    // Validate: reject invalid headlines
                    if (result.headline) {
                        const invalidPatterns = [
                            /^\|?\s*LinkedIn$/i,  // Just "| LinkedIn"
                            /^\s*\|\s*$/,           // Just "|"
                            /seguidores/i,
                            /contactos/i
                        ];
                        if (invalidPatterns.some(p => p.test(result.headline))) {
                            result._debug.headlineRejected = result.headline;
                            result.headline = '';
                        }
                    }
                    
                    result._debug.headline = !!result.headline;
                } catch { /* skip */ }

                // ── Location (multiple fallbacks) ──
                try {
                    const loc =
                        document.querySelector('.text-body-small.inline.t-black--light.break-words') ||
                        document.querySelector('.pv-text-details__left-panel .text-body-small') ||
                        document.querySelector('span.text-body-small.inline.t-black--light');
                    result.location = loc?.textContent?.trim() || '';
                    result._debug.location = !!result.location;
                } catch { /* skip */ }

                // ── Profile Photo (robust detection) ──
                try {
                    // Strategy 1: Look for profile-displayphoto in src
                    // But prioritize images that are likely the profile photo (not user's own photo)
                    const allImgs = document.querySelectorAll('img');
                    let photoUrl = '';
                    
                    // First, try to find the largest profile photo image
                    // The main profile photo is usually larger than thumbnails
                    let largestPhoto = { src: '', size: 0 };
                    
                    for (const img of Array.from(allImgs)) {
                        const src = img.src || '';
                        if (src.includes('profile-displayphoto') || src.includes('profile-framedphoto')) {
                            // Calculate size (width * height, or use 100 as default if not loaded)
                            const size = (img.width || 100) * (img.height || 100);
                            if (size > largestPhoto.size) {
                                largestPhoto = { src, size };
                            }
                        }
                    }
                    
                    photoUrl = largestPhoto.src;
                    
                    // Strategy 2: Try specific selectors
                    if (!photoUrl) {
                        const selectors = [
                            'button[aria-label*="photo"] img',
                            'img[class*="profile-photo" i]',
                            'img[class*="EntityPhoto" i]',
                            'img.pv-top-card-profile-picture__image',
                            '.pv-top-card__photo img',
                            '.pv-top-card img'
                        ];
                        for (const sel of selectors) {
                            const el = document.querySelector(sel) as HTMLImageElement;
                            if (el?.src && (el.src.includes('licdn.com') || el.src.includes('linkedin'))) {
                                photoUrl = el.src;
                                break;
                            }
                        }
                    }
                    
                    // Strategy 3: Look for any LinkedIn image with person's name in alt
                    if (!photoUrl && result.fullName) {
                        const nameForAlt = result.fullName.toLowerCase();
                        for (const img of Array.from(allImgs)) {
                            const imgEl = img as HTMLImageElement;
                            const alt = (img.getAttribute('alt') || '').toLowerCase();
                            const src = imgEl.src || '';
                            if (alt.includes(nameForAlt) && src.includes('licdn.com')) {
                                photoUrl = src;
                                break;
                            }
                        }
                    }
                    
                    // Strategy 4: Find largest image in top card area
                    if (!photoUrl) {
                        const topCard = document.querySelector('.pv-top-card, .scaffold-layout__main section, [class*="top-card"]');
                        if (topCard) {
                            let largestImg = null;
                            let largestSize = 0;
                            for (const img of Array.from(topCard.querySelectorAll('img'))) {
                                const imgEl = img as HTMLImageElement;
                                const src = imgEl.src || '';
                                if (src.includes('licdn.com') || src.includes('media.licdn')) {
                                    const size = (imgEl.width || 0) * (imgEl.height || 0);
                                    if (size > largestSize) {
                                        largestSize = size;
                                        largestImg = imgEl;
                                    }
                                }
                            }
                            if (largestImg) {
                                photoUrl = largestImg.src;
                            }
                        }
                    }

                    result.profilePhotoUrl = photoUrl;
                    result._debug.photo = !!photoUrl;
                } catch { /* skip */ }

                // ── Banner ──
                try {
                    const banner =
                        document.querySelector('.profile-background-image img') ||
                        document.querySelector('.pv-top-card__bg-photo img') ||
                        document.querySelector('img[class*="profile-background"]');
                    result.bannerUrl = (banner as HTMLImageElement)?.src || '';
                } catch { /* skip */ }

                // ── Connection degree ──
                try {
                    const degree =
                        document.querySelector('.dist-value') ||
                        document.querySelector('.pv-text-details__separator + span') ||
                        document.querySelector('span.text-body-small:not(.break-words)');
                    const degreeText = degree?.textContent?.trim() || '';
                    // Only keep if it looks like "1°", "2°", "3°"
                    if (degreeText.match(/^\d[°º]?$/)) {
                        result.connectionDegree = degreeText;
                    }
                } catch { /* skip */ }

                // ── Connections/Followers count ──
                try {
                    const connectionsLink = document.querySelector('a[href*="connections"], a[href*="/detail/connections"]');
                    if (connectionsLink) {
                        const connText = connectionsLink.textContent?.trim() || '';
                        result.connectionsCount = connText;
                    } else {
                        const spanBold = document.querySelector('li.text-body-small span.t-bold');
                        result.connectionsCount = spanBold?.textContent?.trim() || '';
                    }
                } catch { /* skip */ }

                // ── About / Summary ──
                try {
                    const aboutSection =
                        document.querySelector('#about ~ .display-flex .inline-show-more-text') ||
                        document.querySelector('#about ~ div .pv-shared-text-with-see-more span[aria-hidden="true"]') ||
                        document.querySelector('#about + .pvs-list__outer-container span[aria-hidden="true"]') ||
                        document.querySelector('section:has(#about) .inline-show-more-text span[aria-hidden="true"]');
                    result.about = aboutSection?.textContent?.trim()?.substring(0, 2000) || '';
                    result._debug.about = !!result.about;
                } catch { /* skip */ }

                // ── Current Company + Position (from top card area) ──
                try {
                    // Method 1: Top card buttons/links near company (multilingual)
                    const companyBtn = document.querySelector(
                        'button[aria-label*="empresa actual"], a[aria-label*="empresa actual"], ' +
                        'button[aria-label*="current company"], a[aria-label*="current company"], ' +
                        'button[aria-label*="Current company"], a[aria-label*="Current company"], ' +
                        'a[href*="company"], a[href*="/company/"]'
                    );
                    if (companyBtn) {
                        result.currentCompany = companyBtn.textContent?.trim() || '';
                    }

                    // Method 2: Experience section first item (most reliable for position)
                    if (!result.currentPosition || !result.currentCompany) {
                        // Try different selectors for experience section
                        const expSelectors = [
                            '#experience ~ .pvs-list__outer-container .pvs-list__paged-list-item',
                            'section:has(#experience) .pvs-list__paged-list-item',
                            '#experience-section .pvs-list__paged-list-item',
                            '[data-section="experience"] .pvs-list__paged-list-item',
                            'section:has(h2:contains("Experience")) .pvs-list__paged-list-item',
                            'section:has(h2:contains("Experiencia")) .pvs-list__paged-list-item'
                        ];
                        
                        let expItems: NodeListOf<Element> | null = null;
                        for (const sel of expSelectors) {
                            try {
                                expItems = document.querySelectorAll(sel);
                                if (expItems && expItems.length > 0) break;
                            } catch { /* invalid selector, try next */ }
                        }
                        
                        if (expItems && expItems.length > 0) {
                            const first = expItems[0];
                            // Try to get position from various elements
                            const positionEl = 
                                first.querySelector('.mr1 .t-bold, .t-bold, span[aria-hidden="true"]') ||
                                first.querySelector('div[data-test-id="experience-title"]');
                            if (positionEl && !result.currentPosition) {
                                result.currentPosition = positionEl.textContent?.trim() || '';
                            }
                            
                            // Try to get company from various elements
                            const companyEl = 
                                first.querySelector('.t-14.t-normal, span[class*="company"], a[href*="company"]') ||
                                first.querySelector('div[data-test-id="experience-company"]');
                            if (companyEl && !result.currentCompany) {
                                result.currentCompany = companyEl.textContent?.trim() || '';
                            }
                            
                            // Fallback: get all spans and use first two
                            if ((!result.currentPosition || !result.currentCompany)) {
                                const spans = first.querySelectorAll('span[aria-hidden="true"], .visually-hidden');
                                const texts: string[] = [];
                                spans.forEach(s => {
                                    const text = s.textContent?.trim() || '';
                                    if (text && text.length > 2 && !texts.includes(text)) {
                                        texts.push(text);
                                    }
                                });
                                if (texts.length >= 2) {
                                    if (!result.currentPosition) result.currentPosition = texts[0];
                                    if (!result.currentCompany) result.currentCompany = texts[1];
                                } else if (texts.length === 1 && !result.currentPosition) {
                                    result.currentPosition = texts[0];
                                }
                            }
                        }
                    }

                    // Method 3: From the top card detail links
                    if (!result.currentCompany) {
                        const detailSelectors = [
                            '.pv-text-details__right-panel li',
                            '.pv-text-details__right-panel-item-text',
                            '.pv-top-card__list-container li',
                            '[class*="top-card"] a[href*="company"]',
                            '.text-body-medium a[href*="company"]'
                        ];
                        for (const sel of detailSelectors) {
                            const links = document.querySelectorAll(sel);
                            for (const link of Array.from(links)) {
                                const text = link.textContent?.trim() || '';
                                if (text && text.length < 100 && text.length > 2) {
                                    result.currentCompany = text;
                                    break;
                                }
                            }
                            if (result.currentCompany) break;
                        }
                    }

                    // Method 4: Try to extract from headline if still missing company/position
                    if ((!result.currentCompany || !result.currentPosition) && result.headline) {
                        // Format 1: "Position at Company | Rest" (English)
                        // Format 2: "Cargo: Empresa | Resto" (Spanish with colon)
                        
                        const pipeIndex = result.headline.indexOf('|');
                        const colonIndex = result.headline.indexOf(':');
                        
                        if (colonIndex > 0 && (pipeIndex === -1 || colonIndex < pipeIndex)) {
                            // Format: "Cargo: Empresa | Resto"
                            if (!result.currentPosition) {
                                result.currentPosition = result.headline.substring(0, colonIndex).trim();
                            }
                            if (!result.currentCompany) {
                                const afterColon = result.headline.substring(colonIndex + 1).trim();
                                const afterPipe = afterColon.indexOf('|');
                                result.currentCompany = afterPipe > 0 
                                    ? afterColon.substring(0, afterPipe).trim()
                                    : afterColon.trim();
                            }
                        } else {
                            // Format: "Position at Company | Rest" or "Position @ Company"
                            const atMatch = result.headline.match(/(.+?)\s+(at|en|@)\s+(.+?)(\s+[|·]\s+|$)/i);
                            if (atMatch) {
                                if (!result.currentPosition) result.currentPosition = atMatch[1].trim();
                                if (!result.currentCompany) result.currentCompany = atMatch[3].trim();
                            }
                        }
                    }

                    result._debug.company = !!result.currentCompany;
                    result._debug.position = !!result.currentPosition;
                } catch { /* skip */ }

                // ── Company Logo ──
                try {
                    const expSection = document.querySelector('#experience');
                    if (expSection) {
                        const logoImg = expSection.closest('section')?.querySelector('img');
                        result.companyLogoUrl = (logoImg as HTMLImageElement)?.src || '';
                    }
                } catch { /* skip */ }

                // ── Experience (last 3) ──
                result.experience = [];
                try {
                    const expSection = document.querySelector('#experience');
                    if (expSection) {
                        const section = expSection.closest('section');
                        const items = section?.querySelectorAll(':scope > .pvs-list__outer-container .pvs-list__paged-list-item') ||
                            section?.querySelectorAll('.pvs-list__paged-list-item') || [];
                        const maxItems = Math.min(items.length, 3);
                        for (let i = 0; i < maxItems; i++) {
                            const item = items[i];
                            const spans = item.querySelectorAll('span[aria-hidden="true"]');
                            const logo = item.querySelector('img');
                            if (spans.length >= 2) {
                                result.experience.push({
                                    position: spans[0]?.textContent?.trim() || 'Unknown',
                                    company: spans[1]?.textContent?.trim() || 'Unknown',
                                    duration: spans[3]?.textContent?.trim() || '',
                                    logoUrl: (logo as HTMLImageElement)?.src || '',
                                });
                            }
                        }
                    }
                    result._debug.experience = result.experience.length;
                } catch { /* skip */ }

                // ── Education (last 2) ──
                result.education = [];
                try {
                    const eduSection = document.querySelector('#education');
                    if (eduSection) {
                        const section = eduSection.closest('section');
                        const items = section?.querySelectorAll(':scope > .pvs-list__outer-container .pvs-list__paged-list-item') ||
                            section?.querySelectorAll('.pvs-list__paged-list-item') || [];
                        const maxItems = Math.min(items.length, 2);
                        for (let i = 0; i < maxItems; i++) {
                            const item = items[i];
                            const spans = item.querySelectorAll('span[aria-hidden="true"]');
                            if (spans.length >= 1) {
                                result.education.push({
                                    institution: spans[0]?.textContent?.trim() || 'Unknown',
                                    degree: spans[1]?.textContent?.trim() || '',
                                    years: spans[2]?.textContent?.trim() || '',
                                });
                            }
                        }
                    }
                    result._debug.education = result.education.length;
                } catch { /* skip */ }

                // ── Skills (top 5) ──
                result.skills = [];
                try {
                    const skillsSection = document.querySelector('#skills');
                    if (skillsSection) {
                        const section = skillsSection.closest('section');
                        const items = section?.querySelectorAll('.pvs-list__paged-list-item span[aria-hidden="true"]') || [];
                        const maxItems = Math.min(items.length, 5);
                        for (let i = 0; i < maxItems; i++) {
                            const text = items[i]?.textContent?.trim();
                            if (text && !result.skills.includes(text)) {
                                result.skills.push(text);
                            }
                        }
                    }
                    result._debug.skills = result.skills.length;
                } catch { /* skip */ }

                return result;
            });

            // Extract and log debug info
            const debug = data?._debug || {};
            delete data?._debug;
            console.log(`  🔍 CRM Scrape debug: name=${debug.nameSelector || 'none'}, headline=${debug.headline}, location=${debug.location}, photo=${debug.photo}, position=${debug.position}, company=${debug.company}, about=${debug.about}, exp=${debug.experience}, edu=${debug.education}, skills=${debug.skills}`);

            if (!data) {
                console.log('  ⚠️ CRM: page.evaluate returned null');
                return null;
            }

            // Accept partial data — don't discard everything just because fullName is empty
            if (!data.fullName) {
                console.log('  ⚠️ CRM: fullName empty, checking page title...');
                try {
                    const title = await page.title();
                    // LinkedIn: "FirstName LastName | LinkedIn"
                    if (title && title.includes('|')) {
                        data.fullName = title.split('|')[0].trim();
                        const parts = data.fullName.split(' ');
                        data.firstName = parts[0] || '';
                        data.lastName = parts.slice(1).join(' ') || '';
                        console.log(`  ✅ CRM: Got name from page title: ${data.fullName}`);
                    }
                } catch { /* skip */ }
            }

            // Log what we got with actual values for key fields
            const fields = ['fullName', 'headline', 'location', 'profilePhotoUrl', 'currentCompany', 'currentPosition', 'about'];
            const found = fields.filter(f => data[f]);
            console.log(`  📊 CRM: Scraped ${found.length}/${fields.length} fields: [${found.join(', ')}]`);
            
            // Log actual values for debugging
            if (data.currentPosition) console.log(`     → Position: ${data.currentPosition.substring(0, 50)}`);
            if (data.currentCompany) console.log(`     → Company: ${data.currentCompany.substring(0, 50)}`);
            if (data.profilePhotoUrl) console.log(`     → Photo: ${data.profilePhotoUrl.substring(0, 80)}...`);

            // Return whatever we have (even partial) — the save logic will merge
            return data as ScrapedProfileData;
        } catch (err: any) {
            console.log(`  ⚠️ CRM: Scraping failed: ${err.message}`);
            return null;
        }
    }

    // ── CRM: Check Accepted Connections ───────────────────────

    async checkAcceptedConnections(): Promise<{ found: number; updated: number }> {
        // NEW: Use operation manager for mutual exclusion
        if (!await operationManager.acquire('checking_accepted')) {
            const current = operationManager.getCurrent();
            throw new Error(`Cannot check accepted — operation '${current}' in progress`);
        }
        
        if (!this.page || this.status !== 'logged-in') {
            operationManager.release();
            throw new Error('Browser not open or not logged in');
        }

        this.isBusy = true;
        console.log('\n🔄 CRM: Checking accepted connections...');

        try {
            const page = this.page!;

            // ── Phase 1: Get contacts waiting for acceptance ──
            const pendingContacts = await LinkedInContact.find({ status: 'esperando_aceptacion' });

            if (pendingContacts.length === 0) {
                console.log('  ℹ️ No contacts in esperando_aceptacion — nothing to check');
                this.lastAcceptedCheck = new Date();
                return { found: 0, updated: 0 };
            }

            console.log(`  📋 Found ${pendingContacts.length} contacts to verify`);

            // ── Phase 2: Visit each profile to get real name + check status ──
            // The stored fullName may be the vanityName, not the actual name
            const contactInfos: Array<{
                _id: any;
                profileUrl: string;
                vanityName: string;
                realName: string;
                firstName: string;
                isConnected: boolean;
            }> = [];

            for (let i = 0; i < pendingContacts.length; i++) {
                const contact = pendingContacts[i];
                const vanityName = contact.profileUrl
                    .replace(/\/$/, '')
                    .split('/in/')[1]
                    ?.toLowerCase() || '';

                console.log(`  🌐 [${i + 1}/${pendingContacts.length}] Visiting profile: ${vanityName}...`);

                try {
                    // Navigate to profile
                    try {
                        await page.goto(contact.profileUrl, { waitUntil: 'networkidle2', timeout: 20000 });
                    } catch {
                        try { await page.goto(contact.profileUrl, { waitUntil: 'load', timeout: 15000 }); } catch { /* proceed */ }
                    }
                    await this.delay(this.getRandomDelay(3000, 5000));

                    // Scrape real name from h1 (with title fallback) and check connection indicators
                    const profileData = await page.evaluate(() => {
                        // Get the real name from h1
                        const h1 = document.querySelector('h1');
                        let realName = h1?.textContent?.trim() || '';

                        // Fallback: extract name from page title ("Name | LinkedIn")
                        if (!realName) {
                            const title = document.title || '';
                            if (title.includes('|')) {
                                realName = title.split('|')[0].trim();
                            }
                        }

                        // Check for connection indicators
                        const buttons = document.querySelectorAll('button, a, span');
                        let hasPendiente = false;
                        let hasConectar = false;
                        let hasEnviarMensaje = false;
                        let connectionDegree = '';

                        for (const btn of buttons) {
                            const text = (btn.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                            const rect = btn.getBoundingClientRect();

                            if (rect.width <= 0 || rect.height <= 0 || rect.top > 700) continue;

                            if (text === 'pendiente' || text === 'pending' ||
                                ariaLabel.includes('pendiente') || ariaLabel.includes('pending')) {
                                hasPendiente = true;
                            }
                            if (text === 'conectar' || text === 'connect') {
                                hasConectar = true;
                            }
                            if (text === 'enviar mensaje' || text === 'message' || text === 'mensaje') {
                                hasEnviarMensaje = true;
                            }
                        }

                        // Check connection degree (1º = connected)
                        const degreeEl = document.querySelector('.dist-value, .distance-badge, span[class*="degree"]');
                        if (degreeEl) {
                            connectionDegree = degreeEl.textContent?.trim() || '';
                        }
                        // Also check for "1º" in spans near the name
                        const allSpans = document.querySelectorAll('span');
                        for (const span of allSpans) {
                            const t = span.textContent?.trim() || '';
                            if (t === '1º' || t === '1st') {
                                connectionDegree = t;
                                break;
                            }
                        }

                        return { realName, hasPendiente, hasConectar, hasEnviarMensaje, connectionDegree };
                    });

                    const isConnected = !profileData.hasPendiente && !profileData.hasConectar &&
                        (profileData.hasEnviarMensaje || profileData.connectionDegree === '1º' || profileData.connectionDegree === '1st');

                    const firstName = profileData.realName.split(' ')[0] || '';

                    console.log(`     Name: "${profileData.realName}", 1st: ${isConnected}, pendiente: ${profileData.hasPendiente}, degree: ${profileData.connectionDegree}`);

                    // Update fullName in DB if we got a real name
                    if (profileData.realName && profileData.realName !== contact.fullName) {
                        await LinkedInContact.updateOne(
                            { _id: contact._id },
                            { $set: { fullName: profileData.realName, firstName } }
                        );
                    }

                    contactInfos.push({
                        _id: contact._id,
                        profileUrl: contact.profileUrl,
                        vanityName,
                        realName: profileData.realName,
                        firstName,
                        isConnected,
                    });

                    // If already connected based on profile check, update immediately
                    if (isConnected) {
                        await LinkedInContact.updateOne(
                            { _id: contact._id },
                            { $set: { status: 'aceptado', acceptedAt: new Date() } }
                        );
                        console.log(`  ✅ ${profileData.realName} → aceptado ✓ (detected from profile)`);
                    }

                } catch (err: any) {
                    console.log(`  ⚠️ Error visiting ${vanityName}: ${err.message?.substring(0, 60)}`);
                    contactInfos.push({
                        _id: contact._id,
                        profileUrl: contact.profileUrl,
                        vanityName,
                        realName: '',
                        firstName: '',
                        isConnected: false,
                    });
                }

                // Human-like delay between profiles
                if (i < pendingContacts.length - 1) {
                    await this.delay(this.getRandomDelay(2000, 4000));
                }
            }

            // Count already-updated ones
            let updated = contactInfos.filter(c => c.isConnected).length;
            const remaining = contactInfos.filter(c => !c.isConnected && c.firstName);

            // ── Phase 3: Verify remaining via connections search ──
            if (remaining.length > 0) {
                console.log(`\n  🔍 Phase 3: Verifying ${remaining.length} remaining contacts via connections search...`);

                // Navigate to connections page
                try {
                    await page.goto('https://www.linkedin.com/mynetwork/invite-connect/connections/', {
                        waitUntil: 'networkidle2',
                        timeout: 20000,
                    });
                } catch {
                    try {
                        await page.goto('https://www.linkedin.com/mynetwork/invite-connect/connections/', {
                            waitUntil: 'load',
                            timeout: 15000,
                        });
                    } catch { /* proceed */ }
                }
                await this.randomDelay(DELAYS.pageLoad);

                // Find search input
                const searchInput = await page.$(
                    'input[data-testid="typeahead-input"]'
                ) || await page.$(
                    'input[placeholder="Buscar por nombre"]'
                ) || await page.$(
                    'input[placeholder="Search by name"]'
                ) || await page.$(
                    'input[componentkey*="connectionsListTypeahead"]'
                );

                if (searchInput) {
                    console.log('  ✅ Search input found on connections page');

                    for (let i = 0; i < remaining.length; i++) {
                        const contact = remaining[i];

                        console.log(`  🔍 [${i + 1}/${remaining.length}] Searching "${contact.firstName}" (vanity: ${contact.vanityName})...`);

                        // Clear input
                        await searchInput.click({ clickCount: 3 });
                        await this.delay(200);
                        await page.keyboard.press('Backspace');
                        await this.delay(300);

                        // Type firstName
                        await page.keyboard.type(contact.firstName, { delay: this.getRandomDelay(50, 120) });

                        // Wait for results
                        await this.delay(this.getRandomDelay(2500, 4000));

                        // Check if vanityName appears in result links
                        const isFound = await page.evaluate((vn: string) => {
                            const links = document.querySelectorAll('a[href*="/in/"]');
                            for (const link of links) {
                                const href = (link.getAttribute('href') || '').toLowerCase();
                                if (href.includes('/in/' + vn)) {
                                    return true;
                                }
                            }
                            return false;
                        }, contact.vanityName);

                        if (isFound) {
                            await LinkedInContact.updateOne(
                                { _id: contact._id },
                                { $set: { status: 'aceptado', acceptedAt: new Date() } }
                            );
                            updated++;
                            console.log(`  ✅ ${contact.realName || contact.vanityName} → aceptado ✓ (found in search)`);
                        } else {
                            console.log(`  ⏳ ${contact.realName || contact.vanityName} — not in connections yet`);
                        }

                        // Delay between searches
                        if (i < remaining.length - 1) {
                            await this.delay(this.getRandomDelay(2000, 4000));
                        }
                    }

                    // Clear search
                    try {
                        await searchInput.click({ clickCount: 3 });
                        await this.delay(200);
                        await page.keyboard.press('Backspace');
                    } catch { /* non-critical */ }
                } else {
                    console.log('  ⚠️ Search input not found — skipping connections page verification');
                }
            }

            this.lastAcceptedCheck = new Date();
            console.log(`\n🔄 CRM: Check complete — ${pendingContacts.length} contacts checked, ${updated} updated to aceptado`);

            return { found: pendingContacts.length, updated };
        } finally {
            this.isBusy = false;
            operationManager.release(); // NEW: Release operation lock
        }
    }

    private async updateCrmStatus(normalizedUrl: string, status: string): Promise<void> {
        try {
            await LinkedInContact.updateOne(
                { profileUrl: normalizedUrl },
                { $set: { status } }
            );
        } catch { /* non-critical */ }
    }

    getLastAcceptedCheck(): string | null {
        return this.lastAcceptedCheck?.toISOString() || null;
    }
}

// Singleton instance
export const linkedinService = new LinkedInService();
