import fs from 'fs';
import path from 'path';
import type { Page } from 'puppeteer';

// ── Log directory setup ──────────────────────────────────────
const LOGS_DIR = path.join(__dirname, '../../logs/linkedin');
const SCREENSHOTS_DIR = path.join(LOGS_DIR, 'screenshots');

/**
 * Per-account file logger for LinkedIn automation.
 * Creates a log file per username + timestamp.
 * Captures screenshots at key decision points.
 * 
 * Usage:
 *   const logger = new LinkedInLogger('https://www.linkedin.com/in/johndoe/');
 *   logger.log('Starting connection...');
 *   await logger.screenshot(page, 'before_click');
 *   logger.close();
 */
export class LinkedInLogger {
    private stream: fs.WriteStream;
    private username: string;
    private logFilePath: string;
    private startTime: number;
    private screenshotCount = 0;

    constructor(profileUrl: string) {
        // Extract username from LinkedIn URL
        this.username = this.extractUsername(profileUrl);
        this.startTime = Date.now();

        // Create directories
        fs.mkdirSync(LOGS_DIR, { recursive: true });
        fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

        // Create log file with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        const filename = `${this.username}_${timestamp}.log`;
        this.logFilePath = path.join(LOGS_DIR, filename);

        this.stream = fs.createWriteStream(this.logFilePath, { flags: 'a' });

        // Write header
        this.stream.write(`════════════════════════════════════════════════════════════\n`);
        this.stream.write(`  LinkedIn Automation Log\n`);
        this.stream.write(`  Profile: ${profileUrl}\n`);
        this.stream.write(`  Username: ${this.username}\n`);
        this.stream.write(`  Started: ${new Date().toISOString()}\n`);
        this.stream.write(`════════════════════════════════════════════════════════════\n\n`);

        console.log(`📄 Log file created: ${this.logFilePath}`);
    }

    /**
     * Log a message to both the file and console.
     * All messages are timestamped with millisecond precision.
     */
    log(message: string): void {
        const elapsed = Date.now() - this.startTime;
        const elapsedStr = this.formatElapsed(elapsed);
        const timestamp = new Date().toISOString().substring(11, 23); // HH:mm:ss.SSS
        const line = `[${timestamp}] [+${elapsedStr}] ${message}\n`;

        // Write to file
        this.stream.write(line);

        // Also write to console for real-time visibility
        console.log(message);
    }

    /**
     * Log a separator/section header for readability.
     */
    section(title: string): void {
        const line = `\n──────────────── ${title} ────────────────\n`;
        this.stream.write(line);
        console.log(line.trim());
    }

    /**
     * Capture a screenshot and log its path.
     * Screenshots are saved as PNG with descriptive names.
     */
    async screenshot(page: Page, label: string): Promise<string | null> {
        try {
            this.screenshotCount++;
            const timestamp = Date.now();
            const filename = `${this.username}_${String(this.screenshotCount).padStart(2, '0')}_${label}_${timestamp}.png`;
            const filepath = path.join(SCREENSHOTS_DIR, filename);

            await page.screenshot({ path: filepath, fullPage: false });

            this.log(`  📸 Screenshot saved: ${filename}`);
            return filepath;
        } catch (err: any) {
            this.log(`  ⚠️ Screenshot failed (${label}): ${err.message?.substring(0, 60)}`);
            return null;
        }
    }

    /**
     * Log a full HTML snippet of an element for deep debugging.
     */
    async logElementHTML(page: Page, selector: string, label: string): Promise<void> {
        try {
            const html = await page.evaluate((sel: string) => {
                const el = document.querySelector(sel);
                if (!el) return null;
                return el.outerHTML.substring(0, 2000);
            }, selector);

            if (html) {
                this.log(`  🔬 HTML [${label}]:\n${html}`);
            } else {
                this.log(`  🔬 HTML [${label}]: Element not found (${selector})`);
            }
        } catch (err: any) {
            this.log(`  ⚠️ HTML capture failed (${label}): ${err.message?.substring(0, 60)}`);
        }
    }

    /**
     * Log all visible buttons/links on the page (comprehensive DOM dump).
     */
    async logAllInteractiveElements(page: Page, maxTop: number = 700): Promise<void> {
        try {
            const elements = await page.evaluate((mt: number) => {
                const els = document.querySelectorAll('button, a, [role="button"], [role="menuitem"]');
                const results: any[] = [];
                let idx = 0;
                for (const el of els) {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0 && rect.top < mt) {
                        results.push({
                            i: idx,
                            tag: el.tagName,
                            text: (el.textContent || '').replace(/\s+/g, ' ').trim().substring(0, 60),
                            aria: (el.getAttribute('aria-label') || '').substring(0, 80),
                            href: (el.getAttribute('href') || '').substring(0, 80),
                            role: el.getAttribute('role') || '',
                            class: (el.className || '').toString().substring(0, 80),
                            top: Math.round(rect.top),
                            left: Math.round(rect.left),
                            w: Math.round(rect.width),
                            h: Math.round(rect.height),
                            disabled: (el as HTMLButtonElement).disabled || false,
                        });
                    }
                    idx++;
                }
                return results;
            }, maxTop);

            this.log(`  🔍 Interactive elements (top < ${maxTop}): ${elements.length} found`);
            for (const el of elements) {
                this.log(`     [${el.i}] <${el.tag}> text="${el.text}" aria="${el.aria}" href="${el.href}" role="${el.role}" top=${el.top} left=${el.left} ${el.w}x${el.h} disabled=${el.disabled}`);
            }
        } catch (err: any) {
            this.log(`  ⚠️ Element dump failed: ${err.message?.substring(0, 60)}`);
        }
    }

    /**
     * Log complete page state (URL, title, document ready state).
     */
    async logPageState(page: Page, label: string = ''): Promise<void> {
        try {
            const url = page.url();
            const state = await page.evaluate(() => ({
                title: document.title,
                readyState: document.readyState,
                bodyChildCount: document.body?.children.length || 0,
                hasDialog: !!document.querySelector('[role="dialog"]'),
                hasModal: !!document.querySelector('.artdeco-modal'),
                hasOverlay: !!document.querySelector('.artdeco-modal-overlay'),
                visibleModals: document.querySelectorAll('[role="dialog"], .artdeco-modal').length,
            }));

            const prefix = label ? `[${label}] ` : '';
            this.log(`  🌐 ${prefix}Page state: url="${url.substring(0, 100)}" title="${state.title.substring(0, 60)}" readyState=${state.readyState} bodyChildren=${state.bodyChildCount}`);
            this.log(`  🌐 ${prefix}Modals: dialog=${state.hasDialog} artdeco=${state.hasModal} overlay=${state.hasOverlay} count=${state.visibleModals}`);
        } catch (err: any) {
            this.log(`  ⚠️ Page state capture failed: ${err.message?.substring(0, 60)}`);
        }
    }

    /**
     * Log the result of the connection attempt.
     */
    logResult(success: boolean, reason: string): void {
        this.section('RESULT');
        const elapsed = Date.now() - this.startTime;
        this.log(`  ${success ? '✅ SUCCESS' : '❌ FAILURE'}: ${reason}`);
        this.log(`  Total time: ${this.formatElapsed(elapsed)}`);
    }

    /**
     * Close the log file stream.
     */
    close(): void {
        const elapsed = Date.now() - this.startTime;
        this.stream.write(`\n════════════════════════════════════════════════════════════\n`);
        this.stream.write(`  Log ended: ${new Date().toISOString()}\n`);
        this.stream.write(`  Total duration: ${this.formatElapsed(elapsed)}\n`);
        this.stream.write(`  Screenshots taken: ${this.screenshotCount}\n`);
        this.stream.write(`════════════════════════════════════════════════════════════\n`);
        this.stream.end();
    }

    /**
     * Get the path to the log file.
     */
    getLogFilePath(): string {
        return this.logFilePath;
    }

    // ── Private helpers ──────────────────────────────────────

    private extractUsername(url: string): string {
        // https://www.linkedin.com/in/johndoe/ → johndoe
        const match = url.match(/\/in\/([^/?#]+)/);
        return match ? match[1].toLowerCase() : 'unknown';
    }

    private formatElapsed(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        const millis = ms % 1000;
        if (minutes > 0) {
            return `${minutes}m${secs}s`;
        }
        return `${secs}.${String(millis).padStart(3, '0')}s`;
    }
}
