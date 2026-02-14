import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';
import { LinkedInContact, type ILinkedInContact } from '../models/linkedin-contact.model';
import { LinkedInLogger } from '../utils/linkedin-logger';

// Apply stealth plugin — patches 10+ fingerprints
puppeteer.use(StealthPlugin());

// ============================================================
// LinkedIn Service — Prospecting Automation with Puppeteer
// ============================================================

// ── Interfaces ───────────────────────────────────────────────

export interface ProfileSteps {
    visit: 'pending' | 'done' | 'error';
    follow: 'pending' | 'done' | 'skipped' | 'error';
    connect: 'pending' | 'done' | 'skipped' | 'error';
    like: 'pending' | 'done' | 'skipped' | 'error';
}

export interface ProfileProgress {
    index: number;
    url: string;
    name?: string;
    status: 'pending' | 'visiting' | 'followed' | 'connected' | 'liked' | 'done' | 'error' | 'paused';
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
    public isBusy = false;
    private lastAcceptedCheck: Date | null = null;
    private pauseResolve: (() => void) | null = null;

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
        const scrolls = this.getRandomDelay(2, 5);
        for (let i = 0; i < scrolls; i++) {
            const distance = this.getRandomDelay(100, 400);
            await page.evaluate((d) => {
                window.scrollBy({ top: d, behavior: 'smooth' });
            }, distance);
            await this.delay(this.getRandomDelay(500, 1500));
        }
    }

    private async humanClick(page: Page, element: any): Promise<void> {
        const box = await element.boundingBox();
        if (!box) {
            await element.click();
            return;
        }

        // Move to element with slight offset for natural feel
        const x = box.x + box.width / 2 + this.getRandomDelay(-3, 3);
        const y = box.y + box.height / 2 + this.getRandomDelay(-3, 3);

        await page.mouse.move(x, y, { steps: this.getRandomDelay(5, 15) });
        await this.delay(this.getRandomDelay(100, 300));
        await page.mouse.click(x, y);
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
            protocolTimeout: 120000, // 120s — prevents timeout on heavy LinkedIn pages
            defaultViewport: { width: 1366, height: 768 },
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1366,768',
            ],
        });

        this.page = await this.browser.newPage();

        // Set realistic user-agent
        await this.page.setUserAgent(
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        );

        // Remove webdriver flag
        await this.page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
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
        if (!this.page || this.status !== 'logged-in') {
            console.error('❌ Cannot start prospecting — not logged in');
            return false;
        }

        if (this.isRunning) {
            console.error('❌ Prospecting already running');
            return false;
        }

        // Parse and validate URLs
        const urls = options.urls
            .map(u => u.trim())
            .filter(u => u.length > 0 && (u.includes('linkedin.com/in/') || u.includes('linkedin.com/pub/')));

        if (urls.length === 0) {
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
                follow: 'pending' as const,
                connect: 'pending' as const,
                like: 'pending' as const,
            },
        }));

        this.isRunning = true;
        this.isPaused = false;
        this.shouldStop = false;
        this.currentIndex = 0;

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

        // Emit initial state
        this.emitProgress();

        // Run in background (don't await)
        this.runProspectingLoop(options).catch(err => {
            console.error('❌ Prospecting loop error:', err);
            this.isRunning = false;
            this.emitProgress();
        });

        return true;
    }

    private async runProspectingLoop(options: ProspectingOptions): Promise<void> {
        for (let i = 0; i < this.profiles.length; i++) {
            if (this.shouldStop) {
                console.log('⏹️ Prospecting stopped by user');
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
            }

            // Delay between profiles
            if (i < this.profiles.length - 1 && !this.shouldStop) {
                // Every 15-20 profiles, take a longer break
                if ((i + 1) % LONG_PAUSE_EVERY === 0) {
                    console.log(`\n☕ Taking a longer break after ${i + 1} profiles...`);
                    await this.randomDelay(DELAYS.longPause);
                } else {
                    await this.randomDelay(DELAYS.betweenProfiles);
                }
            }
        }

        this.isRunning = false;
        this.isPaused = false;

        const done = this.profiles.filter(p => p.status === 'done').length;
        const errors = this.profiles.filter(p => p.status === 'error').length;

        console.log(`\n✅ Prospecting complete: ${done} done, ${errors} errors, ${this.profiles.length - done - errors} skipped`);

        this.emit('complete', {
            type: 'complete',
            processed: this.profiles.length,
            succeeded: done,
            failed: errors,
            skipped: this.profiles.length - done - errors,
        });
    }

    private async processProfile(index: number, options: ProspectingOptions): Promise<void> {
        const profile = this.profiles[index];
        const page = this.page!;
        const normalizedUrl = this.normalizeUrl(profile.url);

        // ── Create per-account logger ──
        const logger = new LinkedInLogger(profile.url);
        logger.section(`PROFILE ${index + 1}/${this.profiles.length}`);
        logger.log(`📋 Processing: ${profile.url}`);
        logger.log(`   Normalized URL: ${normalizedUrl}`);
        logger.log(`   Options: sendNote=${options.sendNote}, noteText="${(options.noteText || '').substring(0, 50)}"`);

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
            const retryTimeouts = [30000, 45000, 60000];
            for (let attempt = 0; attempt < retryTimeouts.length; attempt++) {
                try {
                    logger.log(`  🌐 Navigating to profile... (attempt ${attempt + 1}/${retryTimeouts.length})`);
                    await page.goto(profile.url, { waitUntil: 'domcontentloaded', timeout: retryTimeouts[attempt] });
                    logger.log(`  ✅ Page loaded (domcontentloaded)`);
                    pageLoaded = true;
                    break;
                } catch (navErr: any) {
                    logger.log(`  ⚠️ Navigation attempt ${attempt + 1} failed: ${navErr.message?.substring(0, 60)}`);
                    if (attempt < retryTimeouts.length - 1) {
                        logger.log(`  🔄 Retrying in 3s...`);
                        await this.delay(3000);
                    }
                }
            }

            // Wait for the page to settle
            logger.log(`  ⏱️ Waiting for page to settle...`);
            await this.randomDelay(DELAYS.pageLoad);

            // Wait for body to be available
            let bodyFound = false;
            try {
                await page.waitForSelector('body', { timeout: 10000 });
                bodyFound = true;
            } catch {
                logger.log('  ⚠️ Body not found, page may not have loaded');
            }

            // If navigation failed AND body not found, skip this profile
            if (!pageLoaded && !bodyFound) {
                logger.log('  ❌ Page completely failed to load after all retries — skipping profile');
                logger.logResult(false, 'Page failed to load');
                this.updateProfile(index, { status: 'error', error: 'Page failed to load', steps: { ...profile.steps, visit: 'error' } });
                this.emitProgress();
                logger.close();
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

            // ── CRM: Scrape profile data and save to MongoDB ──
            try {
                // Scroll back to top so h1/header elements are accessible
                await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
                await this.delay(2000);

                logger.log(`  🔍 Scraping profile data...`);
                const scraped = await this.scrapeProfileData(page);
                if (scraped && scraped.fullName) {
                    await LinkedInContact.findOneAndUpdate(
                        { profileUrl: normalizedUrl },
                        {
                            $set: {
                                ...scraped,
                                profileUrl: normalizedUrl,
                                prospectingBatchId: new Date().toISOString().split('T')[0],
                            },
                        },
                        { upsert: true, new: true }
                    );
                    logger.log(`  💾 CRM: Scraped data saved for: ${scraped.fullName}`);
                } else {
                    // Fallback: use the name we extracted from h1 earlier
                    const fallbackName = this.profiles[index].name;
                    if (fallbackName && fallbackName !== profile.url) {
                        await LinkedInContact.updateOne(
                            { profileUrl: normalizedUrl },
                            { $set: { fullName: fallbackName, firstName: fallbackName.split(' ')[0] || '', lastName: fallbackName.split(' ').slice(1).join(' ') || '' } }
                        );
                        logger.log(`  💾 CRM: Saved fallback name: ${fallbackName}`);
                    } else {
                        logger.log(`  ⚠️ CRM: Could not scrape profile data`);
                    }
                }
            } catch (crmErr: any) {
                logger.log(`  ⚠️ CRM save error: ${crmErr.message?.substring(0, 80)}`);
                // Non-critical — continue with prospecting
            }

            // ── Step 2: Follow Profile — SKIPPED (user wants Connect only) ──
            this.updateProfile(index, {
                steps: { ...this.profiles[index].steps, follow: 'skipped' },
            });
            this.emitProgress();

            // ── Step 3: Connect ──
            await this.checkPause();
            if (this.shouldStop) { logger.close(); return; }

            // ── CRM: Mark as 'conectando' ──
            logger.log(`  🔄 CRM: → conectando`);
            await this.updateCrmStatus(normalizedUrl, 'conectando');

            try {
                logger.section('CONNECT ATTEMPT');
                logger.log(`  🔗 Attempting to connect...`);
                const connected = await this.connectProfile(page, logger, options.sendNote ? options.noteText : undefined);
                this.updateProfile(index, {
                    status: 'connected',
                    steps: { ...this.profiles[index].steps, connect: connected ? 'done' : 'skipped' },
                });

                if (connected) {
                    // ── CRM: Mark as 'esperando_aceptacion' after successful connection ──
                    logger.log(`  🔄 CRM: → esperando_aceptacion (connection sent, waiting for acceptance)`);
                    await this.updateCrmStatus(normalizedUrl, 'esperando_aceptacion');
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

            // Mark as done
            this.updateProfile(index, {
                status: 'done',
                completedAt: new Date().toISOString(),
            });
            this.emitProgress();

            logger.log(`  ✅ Profile done: ${this.profiles[index].name || profile.url}`);

        } finally {
            // Always close the logger, even on exceptions
            logger.close();
        }
    }

    // ── Follow ───────────────────────────────────────────────

    private async followProfile(page: Page): Promise<boolean> {
        console.log('  👤 Attempting to follow...');

        // Scroll to top first — action buttons are in the profile header
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
        await this.delay(this.getRandomDelay(500, 1000));

        // Find the Follow button specifically within the profile's action area
        const followButton = await page.evaluateHandle(() => {
            // LinkedIn wraps profile actions in a section with the profile header
            // Look for buttons whose visible text is exactly "Follow" or "Seguir"
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                const span = btn.querySelector('span');
                const text = (span?.textContent || btn.textContent || '').trim();

                // Skip if it's "Following" / "Siguiendo" (already following)
                if (text === 'Following' || text === 'Siguiendo') continue;

                if (text === 'Follow' || text === 'Seguir') {
                    const rect = btn.getBoundingClientRect();
                    // Only match buttons in the upper portion of the page (profile header area)
                    if (rect.width > 0 && rect.height > 0 && rect.top < 600) {
                        return btn;
                    }
                }
            }
            return null;
        });

        const followEl = followButton.asElement();
        if (!followEl) {
            console.log('  ⏭️ Follow button not found (possibly already following)');
            return false;
        }

        await this.humanClick(page, followEl);
        console.log('  ✅ Followed');
        return true;
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
        // Strategy 1: Direct <button> with "Conectar"/"Connect" (top < 400)
        // For profiles where Connect is a primary action button.
        // IMPORTANT: Exclude "Invita a [X]" — sidebar suggestion buttons.
        // ══════════════════════════════════════════════════════════
        logger.log('  🔎 Strategy 1: Looking for direct Connect <button>...');
        const directBtn = await page.evaluateHandle(() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                const text = (btn.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                const rect = btn.getBoundingClientRect();

                if (rect.width > 0 && rect.height > 0 && rect.top > 0 && rect.top < 400) {
                    // SKIP suggestion card buttons — they say "Invita a [Other Person] a conectar"
                    if (ariaLabel.includes('invita a') || ariaLabel.includes('invite ')) {
                        continue;
                    }

                    if ((ariaLabel.includes('conectar') || ariaLabel.includes('connect')) &&
                        !ariaLabel.includes('disconnect') && !ariaLabel.includes('desconectar')) {
                        return btn;
                    }
                    if ((text === 'conectar' || text === 'connect') &&
                        !text.includes('message') && !text.includes('mensaje')) {
                        return btn;
                    }
                }
            }
            return null;
        });
        connectEl = directBtn.asElement();

        if (connectEl) {
            usedStrategy = '1 (direct button)';
            logger.log('  ✅ Strategy 1: Found direct Connect <button>');
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
        // Wait for modal to appear (both artdeco-modal and role=dialog)
        let modalVisible = false;
        try {
            await page.waitForSelector('[role="dialog"], .artdeco-modal, .send-invite', { timeout: 5000 });
            modalVisible = true;
            logger.log('  📋 Connect modal detected');
        } catch {
            // Check again with evaluate as fallback
            modalVisible = await page.evaluate(() => {
                return !!document.querySelector('[role="dialog"], .artdeco-modal, .send-invite');
            });
            if (modalVisible) {
                logger.log('  📋 Connect modal detected (via evaluate)');
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

        // DEBUG: Log ALL visible buttons before searching for Send
        try {
            const sendDebug = await page.evaluate((invPage: boolean) => {
                const selector = invPage
                    ? 'button'
                    : '[role="dialog"] button, .artdeco-modal button, button.artdeco-button, button';
                const btns = document.querySelectorAll(selector);
                return Array.from(btns)
                    .filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
                    .slice(0, 10)
                    .map(b => ({
                        text: (b.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 50),
                        aria: (b.getAttribute('aria-label') || '').substring(0, 60),
                        top: Math.round(b.getBoundingClientRect().top),
                    }));
            }, isInvitePage);
            logger.log(`  🔍 Send candidates (isInvitePage=${isInvitePage}): ${JSON.stringify(sendDebug)}`);
        } catch { /* skip */ }

        // Search broadly: modal buttons AND all artdeco-buttons on the page
        const sendBtn = await page.evaluateHandle(() => {
            const buttons = document.querySelectorAll(
                '[role="dialog"] button, .artdeco-modal button, button.artdeco-button, button'
            );
            for (const btn of buttons) {
                const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                const text = (btn.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                const rect = btn.getBoundingClientRect();

                if (rect.width > 0 && rect.height > 0) {
                    // Match Send/Enviar variants but NOT "Enviar mensaje" or "Enviar perfil"
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
            // Navigate back to the profile to check the current state
            logger.log('  🌐 Reloading profile for verification...');
            await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => { });
            await this.delay(this.getRandomDelay(3000, 5000));

            // 📸 Screenshot during verification
            await logger.screenshot(page, 'verification');
            await logger.logPageState(page, 'verification');

            // Check for indicators on the reloaded profile
            const result = await page.evaluate(() => {
                const buttons = document.querySelectorAll('button, a');
                let hasPendiente = false;
                let hasConectar = false;
                let hasRetirar = false;
                const debugInfo: string[] = [];

                for (const btn of buttons) {
                    const text = (btn.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                    const rect = btn.getBoundingClientRect();

                    // Only check visible elements in the header area (top < 600)
                    if (rect.width <= 0 || rect.height <= 0 || rect.top > 600) continue;

                    // Check for "Pendiente" / "Pending" indicators
                    if (text === 'pendiente' || text === 'pending' ||
                        ariaLabel.includes('pendiente') || ariaLabel.includes('pending') ||
                        ariaLabel.includes('invitation sent') || ariaLabel.includes('invitación enviada')) {
                        hasPendiente = true;
                        debugInfo.push(`PENDIENTE: text="${text}" aria="${ariaLabel.substring(0, 50)}" top=${Math.round(rect.top)}`);
                    }

                    // Check for "Retirar" / "Withdraw" indicators
                    if (text === 'retirar' || text === 'withdraw' ||
                        ariaLabel.includes('retirar') || ariaLabel.includes('withdraw')) {
                        hasRetirar = true;
                        debugInfo.push(`RETIRAR: text="${text}" aria="${ariaLabel.substring(0, 50)}" top=${Math.round(rect.top)}`);
                    }

                    // Check if "Conectar" / "Connect" is still visible (= connection NOT sent)
                    // Exclude sidebar suggestion cards ("Invita a")
                    if ((text === 'conectar' || text === 'connect') &&
                        !ariaLabel.includes('invita a') && !ariaLabel.includes('invite ') &&
                        rect.top < 500) {
                        hasConectar = true;
                        debugInfo.push(`CONECTAR: text="${text}" aria="${ariaLabel.substring(0, 50)}" top=${Math.round(rect.top)}`);
                    }

                    // REMOVED: Do NOT check <a> connect links here.
                    // <a> links with /preload/custom-invite are ALWAYS present on the profile
                    // page, even AFTER a connection request has been sent.
                    // They are NOT evidence that the connection was not sent.
                }

                return { hasPendiente, hasConectar, hasRetirar, debugInfo };
            });

            logger.log(`  🔍 Verification check: pendiente=${result.hasPendiente}, retirar=${result.hasRetirar}, conectar=${result.hasConectar}`);
            if (result.debugInfo.length > 0) {
                for (const info of result.debugInfo) {
                    logger.log(`     → ${info}`);
                }
            }

            // Decision logic
            if (result.hasPendiente || result.hasRetirar) {
                return 'verified';
            }
            if (result.hasConectar) {
                return 'failed';
            }
            // Neither Pendiente nor Conectar found — could be already connected (1st degree)
            // or page didn't load properly
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

    async stop(): Promise<void> {
        this.shouldStop = true;
        this.isPaused = false;

        if (this.pauseResolve) {
            this.pauseResolve();
            this.pauseResolve = null;
        }

        console.log('⏹️ Prospecting stopped');
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
            const data = await page.evaluate(() => {
                const result: any = {};

                // ── Name ──
                try {
                    const h1 = document.querySelector('h1');
                    result.fullName = h1?.textContent?.trim() || '';
                    const parts = (result.fullName || '').split(' ');
                    result.firstName = parts[0] || '';
                    result.lastName = parts.slice(1).join(' ') || '';
                } catch { /* skip */ }

                // ── Headline ──
                try {
                    const headline = document.querySelector('.text-body-medium.break-words');
                    result.headline = headline?.textContent?.trim() || '';
                } catch { /* skip */ }

                // ── Location ──
                try {
                    const loc = document.querySelector('.text-body-small.inline.t-black--light.break-words');
                    result.location = loc?.textContent?.trim() || '';
                } catch { /* skip */ }

                // ── Profile Photo ──
                try {
                    const img = document.querySelector('img.pv-top-card-profile-picture__image--show') ||
                        document.querySelector('.pv-top-card__photo img') ||
                        document.querySelector('img[alt*="foto"], img[alt*="photo"]');
                    result.profilePhotoUrl = (img as HTMLImageElement)?.src || '';
                } catch { /* skip */ }

                // ── Banner ──
                try {
                    const banner = document.querySelector('.profile-background-image img, .pv-top-card__bg-photo img');
                    result.bannerUrl = (banner as HTMLImageElement)?.src || '';
                } catch { /* skip */ }

                // ── Connection degree ──
                try {
                    const degree = document.querySelector('.dist-value, .pv-text-details__separator + span');
                    result.connectionDegree = degree?.textContent?.trim() || '';
                } catch { /* skip */ }

                // ── Connections/Followers count ──
                try {
                    const connEl = document.querySelector('span.t-bold') ||
                        document.querySelector('a[href*="connections"] span');
                    const connText = connEl?.textContent?.trim() || '';
                    if (connText.includes('connections') || connText.includes('conexiones') || connText.match(/\d+/)) {
                        result.connectionsCount = connText;
                    }
                } catch { /* skip */ }

                // ── About / Summary ──
                try {
                    const aboutSection = document.querySelector('#about ~ .display-flex .inline-show-more-text, #about ~ div .pv-shared-text-with-see-more span[aria-hidden="true"]');
                    result.about = aboutSection?.textContent?.trim()?.substring(0, 2000) || '';
                } catch { /* skip */ }

                // ── Current Company + Position ──
                try {
                    const expItems = document.querySelectorAll('.pvs-list__paged-list-item .display-flex.flex-column');
                    if (expItems.length > 0) {
                        const first = expItems[0];
                        const spans = first.querySelectorAll('span[aria-hidden="true"]');
                        if (spans.length >= 2) {
                            result.currentPosition = spans[0]?.textContent?.trim() || '';
                            result.currentCompany = spans[1]?.textContent?.trim() || '';
                        }
                    }

                    // Try the top card info area too
                    if (!result.currentCompany) {
                        const companyLink = document.querySelector('button[aria-label*="Current company"], a[aria-label*="Current company"]');
                        result.currentCompany = companyLink?.textContent?.trim() || '';
                    }
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
                        const items = expSection.closest('section')?.querySelectorAll(':scope > .pvs-list__outer-container .pvs-list__paged-list-item') || [];
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
                } catch { /* skip */ }

                // ── Education (last 2) ──
                result.education = [];
                try {
                    const eduSection = document.querySelector('#education');
                    if (eduSection) {
                        const items = eduSection.closest('section')?.querySelectorAll(':scope > .pvs-list__outer-container .pvs-list__paged-list-item') || [];
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
                } catch { /* skip */ }

                // ── Skills (top 5) ──
                result.skills = [];
                try {
                    const skillsSection = document.querySelector('#skills');
                    if (skillsSection) {
                        const items = skillsSection.closest('section')?.querySelectorAll('.pvs-list__paged-list-item span[aria-hidden="true"]') || [];
                        const maxItems = Math.min(items.length, 5);
                        for (let i = 0; i < maxItems; i++) {
                            const text = items[i]?.textContent?.trim();
                            if (text && !result.skills.includes(text)) {
                                result.skills.push(text);
                            }
                        }
                    }
                } catch { /* skip */ }

                return result;
            });

            if (!data || !data.fullName) {
                console.log('  ⚠️ CRM: Could not extract profile name');
                return null;
            }

            return data as ScrapedProfileData;
        } catch (err: any) {
            console.log(`  ⚠️ CRM: Scraping failed: ${err.message}`);
            return null;
        }
    }

    // ── CRM: Check Accepted Connections ───────────────────────

    async checkAcceptedConnections(): Promise<{ found: number; updated: number }> {
        if (this.isBusy) {
            throw new Error('Another operation is in progress (prospecting or check)');
        }
        if (!this.page || this.status !== 'logged-in') {
            throw new Error('Browser not open or not logged in');
        }

        this.isBusy = true;
        console.log('\n🔄 CRM: Checking accepted connections...');

        try {
            const page = this.page!;
            const currentUrl = page.url();

            // Navigate to connections page
            await page.goto('https://www.linkedin.com/mynetwork/invite-connect/connections/', {
                waitUntil: 'networkidle2',
                timeout: 15000,
            }).catch(() => { });

            await this.randomDelay(DELAYS.pageLoad);

            let found = 0;
            let updated = 0;
            let scrollAttempts = 0;
            const maxScrolls = 10; // Limit scrolling to avoid detection

            while (scrollAttempts < maxScrolls) {
                // Scrape visible connection cards
                const connections = await page.evaluate(() => {
                    const cards = document.querySelectorAll('.mn-connection-card, .reusable-search__result-container, li.mn-connection-card');
                    const results: { name: string; profileUrl: string; connectedDate: string }[] = [];

                    cards.forEach(card => {
                        try {
                            const link = card.querySelector('a[href*="/in/"]') as HTMLAnchorElement;
                            const nameEl = card.querySelector('.mn-connection-card__name, .entity-result__title-text a span, span[aria-hidden="true"]');
                            const timeEl = card.querySelector('.mn-connection-card__connected-time, time, .time-badge');

                            if (link && nameEl) {
                                results.push({
                                    name: nameEl.textContent?.trim() || '',
                                    profileUrl: link.href.split('?')[0].replace(/\/+$/, '').toLowerCase(),
                                    connectedDate: timeEl?.textContent?.trim() || '',
                                });
                            }
                        } catch { /* skip card */ }
                    });

                    return results;
                });

                found += connections.length;

                // Update each matched connection in MongoDB
                for (const conn of connections) {
                    try {
                        const result = await LinkedInContact.findOneAndUpdate(
                            { profileUrl: conn.profileUrl, status: 'conectado' },
                            {
                                $set: {
                                    status: 'aceptado',
                                    acceptedAt: new Date(),
                                },
                            }
                        );
                        if (result) {
                            updated++;
                            console.log(`  ✅ CRM: ${conn.name} accepted connection`);
                        }
                    } catch { /* skip */ }
                }

                // Try to scroll for more
                const previousHeight = await page.evaluate(() => document.body.scrollHeight);
                await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
                await this.randomDelay({ min: 2000, max: 4000 });

                const newHeight = await page.evaluate(() => document.body.scrollHeight);
                if (newHeight === previousHeight) break; // No more content

                scrollAttempts++;
            }

            this.lastAcceptedCheck = new Date();
            console.log(`\n🔄 CRM: Check complete — ${found} connections found, ${updated} updated to accepted`);

            return { found, updated };
        } finally {
            this.isBusy = false;
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
