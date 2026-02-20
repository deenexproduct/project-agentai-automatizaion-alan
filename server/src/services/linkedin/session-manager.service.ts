/**
 * SessionManager Service
 *
 * The single source of truth for LinkedIn session lifecycle:
 * - Encrypts and persists cookies to MongoDB
 * - Loads and decrypts cookies on startup / account switch
 * - Verifies session validity via DOM check
 * - Manages active account pointer per workspace
 * - Emits structured errors for re-auth flows
 * - Prevents concurrent operations on the same account (in-memory mutex)
 *
 * SECURITY:
 * - Cookies are encrypted with AES-256-GCM before storage
 * - Encrypted fields are never logged
 * - All state changes are written to the audit log
 */

import { Types } from 'mongoose';
import type { Page } from 'puppeteer';
import { encrypt, decrypt } from '../../utils/crypto.service';
import { LinkedInAccount, ILinkedInAccount, AccountStatus } from '../../models/linkedin-account.model';
import { LinkedInAuditLog } from '../../models/linkedin-audit-log.model';

// ── Typed Errors ──────────────────────────────────────────────

export class SessionExpiredError extends Error {
    public readonly accountId: string;
    public readonly userId: string;

    constructor(accountId: string, userId: string) {
        super(`LinkedIn session expired for account ${accountId} in workspace ${userId}`);
        this.name = 'SessionExpiredError';
        this.accountId = accountId;
        this.userId = userId;
    }
}

export class AccountNotFoundError extends Error {
    constructor(accountId: string) {
        super(`LinkedIn account not found: ${accountId}`);
        this.name = 'AccountNotFoundError';
    }
}

export class AccountDisabledError extends Error {
    constructor(accountId: string) {
        super(`LinkedIn account is disabled: ${accountId}`);
        this.name = 'AccountDisabledError';
    }
}

export class NoActiveAccountError extends Error {
    constructor(userId: string) {
        super(`No active LinkedIn account for workspace: ${userId}`);
        this.name = 'NoActiveAccountError';
    }
}

// ── Cookie type (matches Puppeteer's Protocol.Network.Cookie) ─

export interface LinkedInCookie {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
}

// ── Active Account Pointer ────────────────────────────────────
// Stored in-memory (workspace → accountId).
// On restart, the first call to getActiveAccount() will query the DB.

const activeAccountCache = new Map<string, string>(); // userId → accountId string

// ── Mutex per account ─────────────────────────────────────────
// Prevents two concurrent cookie saves or session verifications
// for the same account.

const accountMutex = new Map<string, boolean>(); // accountId → locked

async function withMutex<T>(accountId: string, fn: () => Promise<T>): Promise<T> {
    if (accountMutex.get(accountId)) {
        // Wait up to 10s for the lock to release
        const start = Date.now();
        while (accountMutex.get(accountId)) {
            if (Date.now() - start > 10_000) {
                throw new Error(`[SessionManager] Mutex timeout for account ${accountId}`);
            }
            await new Promise(r => setTimeout(r, 100));
        }
    }
    accountMutex.set(accountId, true);
    try {
        return await fn();
    } finally {
        accountMutex.delete(accountId);
    }
}

// ── SessionManager ────────────────────────────────────────────

class SessionManager {

    // ── Account CRUD ─────────────────────────────────────────

    /**
     * Creates a new LinkedIn account record (before first login).
     * Status starts as 'reauth_required' until cookies are saved.
     */
    async createAccount(userId: string, label: string): Promise<ILinkedInAccount> {
        const account = await LinkedInAccount.create({
            userId,
            label,
            status: 'reauth_required' as AccountStatus,
        });

        await LinkedInAuditLog.append(
            userId,
            account._id as Types.ObjectId,
            'account_created',
            { label }
        );

        console.log(`[SessionManager] ✅ Account created: ${label} (${account._id})`);
        return account;
    }

    /**
     * Lists all accounts for a workspace (encrypted fields excluded).
     */
    async listAccounts(userId: string): Promise<ILinkedInAccount[]> {
        return LinkedInAccount.find({ userId })
            .sort({ lastUsedAt: -1 })
            .exec() as unknown as ILinkedInAccount[];
    }

    /**
     * Disables an account. Does not delete cookies (for audit trail).
     */
    async disableAccount(userId: string, accountId: string): Promise<void> {
        const account = await LinkedInAccount.findOneAndUpdate(
            { _id: accountId, userId },
            { status: 'disabled' as AccountStatus },
            { new: true }
        );

        if (!account) throw new AccountNotFoundError(accountId);

        // Clear active account cache if this was the active one
        if (activeAccountCache.get(userId) === accountId) {
            activeAccountCache.delete(userId);
        }

        await LinkedInAuditLog.append(
            userId,
            new Types.ObjectId(accountId),
            'account_disabled',
            { label: account.label }
        );

        console.log(`[SessionManager] 🚫 Account disabled: ${account.label} (${accountId})`);
    }

    // ── Active Account Pointer ────────────────────────────────

    /**
     * Returns the currently active account for a workspace.
     * Prefers the in-memory cache, falls back to DB query.
     * Returns null if no active account is set.
     */
    async getActiveAccount(userId: string): Promise<ILinkedInAccount | null> {
        const cachedId = activeAccountCache.get(userId);
        if (cachedId) {
            const account = await LinkedInAccount.findOne({
                _id: cachedId,
                userId,
                status: 'active',
            }).exec();
            if (account) return account as ILinkedInAccount;
            // Cache is stale — clear it
            activeAccountCache.delete(userId);
        }

        // Fall back to DB: most recently used active account
        const account = await LinkedInAccount.findActive(userId);
        if (account) {
            activeAccountCache.set(userId, (account._id as Types.ObjectId).toString());
        }
        return account as ILinkedInAccount | null;
    }

    /**
     * Sets the active account for a workspace.
     * Throws if the account doesn't exist or is disabled.
     */
    async setActiveAccount(userId: string, accountId: string): Promise<ILinkedInAccount> {
        const account = await LinkedInAccount.findOne({ _id: accountId, userId }).exec();
        if (!account) throw new AccountNotFoundError(accountId);
        if (account.status === 'disabled') throw new AccountDisabledError(accountId);

        const previousId = activeAccountCache.get(userId);
        activeAccountCache.set(userId, accountId);

        await LinkedInAuditLog.append(
            userId,
            new Types.ObjectId(accountId),
            'account_switch',
            {
                previousAccountId: previousId ?? null,
                newAccountId: accountId,
                label: account.label,
            }
        );

        console.log(`[SessionManager] 🔄 Active account set: ${account.label} (${accountId})`);
        return account;
    }

    // ── Cookie Storage ────────────────────────────────────────

    /**
     * Encrypts and saves cookies to MongoDB for the given account.
     * Updates session metadata (cookieCount, cookiesSavedAt, expiresAt).
     * Thread-safe: uses per-account mutex.
     */
    async saveCookies(accountId: string, cookies: LinkedInCookie[]): Promise<void> {
        await withMutex(accountId, async () => {
            const account = await LinkedInAccount.findById(accountId).exec();
            if (!account) throw new AccountNotFoundError(accountId);

            // Encrypt the cookie array
            const plaintext = JSON.stringify(cookies);
            const { ciphertext, iv, authTag } = encrypt(plaintext);

            // Calculate earliest expiry from critical cookies
            const criticalCookies = cookies.filter(c =>
                ['li_at', 'JSESSIONID', 'li_gc'].includes(c.name)
            );
            let expiresAt: Date | null = null;
            for (const cookie of criticalCookies) {
                if (cookie.expires && cookie.expires > 0) {
                    const expDate = new Date(cookie.expires * 1000);
                    if (!expiresAt || expDate < expiresAt) {
                        expiresAt = expDate;
                    }
                }
            }

            await LinkedInAccount.findByIdAndUpdate(accountId, {
                cookiesEncrypted: ciphertext,
                cookiesIv: iv,
                cookiesAuthTag: authTag,
                cookieCount: cookies.length,
                cookiesSavedAt: new Date(),
                expiresAt,
                status: 'active' as AccountStatus,
                lastAuthAt: new Date(),
            });

            await LinkedInAuditLog.append(
                account.userId,
                account._id as Types.ObjectId,
                'cookies_saved',
                {
                    cookieCount: cookies.length,
                    hasCriticalCookies: criticalCookies.length > 0,
                    expiresAt: expiresAt?.toISOString() ?? null,
                    // NEVER log cookie names/values
                }
            );

            console.log(`[SessionManager] 💾 Cookies saved for account ${accountId} (${cookies.length} cookies, encrypted)`);
        });
    }

    /**
     * Loads and decrypts cookies from MongoDB for the given account.
     * Returns an empty array if no cookies are stored.
     * Thread-safe: uses per-account mutex.
     */
    async loadCookies(accountId: string): Promise<LinkedInCookie[]> {
        return withMutex(accountId, async () => {
            // Must explicitly select encrypted fields (they are excluded by default)
            const account = await LinkedInAccount
                .findById(accountId)
                .select('+cookiesEncrypted +cookiesIv +cookiesAuthTag')
                .exec();

            if (!account) throw new AccountNotFoundError(accountId);

            if (!account.cookiesEncrypted || !account.cookiesIv || !account.cookiesAuthTag) {
                console.log(`[SessionManager] ℹ️ No cookies stored for account ${accountId}`);
                return [];
            }

            const plaintext = decrypt({
                ciphertext: account.cookiesEncrypted,
                iv: account.cookiesIv,
                authTag: account.cookiesAuthTag,
            });

            const cookies: LinkedInCookie[] = JSON.parse(plaintext);

            await LinkedInAccount.findByIdAndUpdate(accountId, {
                lastUsedAt: new Date(),
            });

            await LinkedInAuditLog.append(
                account.userId,
                account._id as Types.ObjectId,
                'cookies_loaded',
                { cookieCount: cookies.length }
            );

            console.log(`[SessionManager] 🔓 Cookies loaded for account ${accountId} (${cookies.length} cookies)`);
            return cookies;
        });
    }

    // ── Session Verification ──────────────────────────────────

    /**
     * Verifies that the current browser session is valid.
     * Performs a DOM check on LinkedIn's feed page.
     *
     * If valid: updates lastVerifiedAt and returns true.
     * If invalid: marks account as reauth_required, throws SessionExpiredError.
     *
     * @param page - The active Puppeteer page
     * @param account - The LinkedInAccount document
     */
    async ensureValidSession(page: Page, account: ILinkedInAccount): Promise<void> {
        const accountId = (account._id as Types.ObjectId).toString();

        try {
            // Navigate to feed and check for the authenticated nav bar
            const currentUrl = page.url();
            if (!currentUrl.includes('linkedin.com')) {
                await page.goto('https://www.linkedin.com/feed/', {
                    waitUntil: 'domcontentloaded',
                    timeout: 15_000,
                });
            }

            const isLoggedIn = await page.evaluate(() => {
                // Check for the authenticated navigation bar
                const nav = document.querySelector('.global-nav__primary-link') ||
                    document.querySelector('[data-control-name="nav.homepage"]') ||
                    document.querySelector('.feed-identity-module');
                const loginForm = document.querySelector('#session_key') ||
                    document.querySelector('.login__form');
                return !!nav && !loginForm;
            });

            if (!isLoggedIn) {
                throw new Error('DOM check failed — not logged in');
            }

            // Session is valid — update metadata
            await LinkedInAccount.findByIdAndUpdate(accountId, {
                lastVerifiedAt: new Date(),
                lastUsedAt: new Date(),
            });

            await LinkedInAuditLog.append(
                account.userId,
                account._id as Types.ObjectId,
                'session_verified',
                { url: page.url() }
            );

            console.log(`[SessionManager] ✅ Session verified for account ${accountId}`);

        } catch (err: any) {
            // Session is invalid — mark for re-auth
            await this.markReauthRequired(account, err.message);
            throw new SessionExpiredError(accountId, account.userId);
        }
    }

    /**
     * Marks an account as requiring re-authentication.
     * Called by ensureValidSession() on failure, or externally on 
     * session-expired events from the browser.
     */
    async markReauthRequired(account: ILinkedInAccount, reason?: string): Promise<void> {
        const accountId = (account._id as Types.ObjectId).toString();

        await LinkedInAccount.findByIdAndUpdate(accountId, {
            status: 'reauth_required' as AccountStatus,
        });

        // Clear from active account cache
        if (activeAccountCache.get(account.userId) === accountId) {
            activeAccountCache.delete(account.userId);
        }

        await LinkedInAuditLog.append(
            account.userId,
            account._id as Types.ObjectId,
            'reauth_required',
            { reason: reason ?? 'unknown' }
        );

        console.log(`[SessionManager] ⚠️ Re-auth required for account ${accountId}: ${reason ?? 'unknown'}`);
    }

    /**
     * Called after a successful manual login.
     * Saves cookies and marks the account as active.
     */
    async onLoginSuccess(
        page: Page,
        account: ILinkedInAccount
    ): Promise<void> {
        const accountId = (account._id as Types.ObjectId).toString();

        // Get all cookies from the browser
        const rawCookies = await page.cookies();
        const cookies: LinkedInCookie[] = rawCookies.map(c => ({
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path,
            expires: c.expires,
            httpOnly: c.httpOnly,
            secure: c.secure,
            sameSite: c.sameSite,
        }));

        await this.saveCookies(accountId, cookies);

        await LinkedInAuditLog.append(
            account.userId,
            account._id as Types.ObjectId,
            'auth_success',
            { cookieCount: cookies.length }
        );

        // Set as active account for this workspace
        activeAccountCache.set(account.userId, accountId);

        console.log(`[SessionManager] 🎉 Login success for account ${accountId}`);
    }

    /**
     * Restores a session from stored cookies into the browser.
     * Returns true if cookies were loaded, false if no cookies exist.
     */
    async restoreSession(page: Page, account: ILinkedInAccount): Promise<boolean> {
        const accountId = (account._id as Types.ObjectId).toString();
        const cookies = await this.loadCookies(accountId);

        if (cookies.length === 0) {
            return false;
        }

        // Clear existing cookies first
        const client = await page.createCDPSession();
        await client.send('Network.clearBrowserCookies');

        // Inject stored cookies
        for (const cookie of cookies) {
            try {
                await page.setCookie(cookie as any);
            } catch (err) {
                // Skip malformed cookies — don't fail the whole restore
                console.warn(`[SessionManager] ⚠️ Skipped cookie '${cookie.name}': ${(err as Error).message}`);
            }
        }

        await LinkedInAuditLog.append(
            account.userId,
            account._id as Types.ObjectId,
            'session_restored',
            { cookieCount: cookies.length }
        );

        console.log(`[SessionManager] 🔄 Session restored for account ${accountId} (${cookies.length} cookies injected)`);
        return true;
    }

    // ── Phase 2: Session Pre-Check ────────────────────────────

    /**
     * Pre-checks session validity before starting a long operation.
     * Checks:
     *   1. Account exists and is active
     *   2. Cookies are not expired (based on stored expiresAt)
     *   3. Optionally performs a live DOM check (more expensive)
     *
     * @param account - The account to check
     * @param page - The Puppeteer page (required for live DOM check)
     * @param liveCheck - If true, performs a live DOM verification
     * @throws SessionExpiredError if the session is invalid
     */
    async sessionPreCheck(
        account: ILinkedInAccount,
        page: Page,
        liveCheck: boolean = false
    ): Promise<void> {
        const accountId = (account._id as Types.ObjectId).toString();

        // 1. Status check
        if (account.status === 'disabled') {
            throw new AccountDisabledError(accountId);
        }

        if (account.status === 'reauth_required') {
            throw new SessionExpiredError(accountId, account.userId);
        }

        // 2. Expiry check (fast — no network)
        if (account.expiresAt) {
            const now = new Date();
            const msUntilExpiry = account.expiresAt.getTime() - now.getTime();
            const hoursUntilExpiry = msUntilExpiry / (1000 * 60 * 60);

            if (msUntilExpiry <= 0) {
                console.warn(`[SessionManager] ⏰ Session expired for account ${accountId} (expired ${Math.abs(hoursUntilExpiry).toFixed(1)}h ago)`);
                await this.markReauthRequired(account, 'Cookie expiry date passed');
                throw new SessionExpiredError(accountId, account.userId);
            }

            if (hoursUntilExpiry < 24) {
                console.warn(`[SessionManager] ⚠️ Session expiring soon for account ${accountId} (${hoursUntilExpiry.toFixed(1)}h remaining)`);
                await LinkedInAuditLog.append(
                    account.userId,
                    account._id as Types.ObjectId,
                    'session_expiring_soon',
                    { hoursRemaining: Math.round(hoursUntilExpiry) }
                );
            }
        }

        // 3. Live DOM check (optional — use before critical operations)
        if (liveCheck) {
            await this.ensureValidSession(page, account);
        }
    }

    // ── Phase 2: Re-auth Wait ─────────────────────────────────

    /**
     * Waits for a re-authentication to complete.
     * Polls the account status in MongoDB until it becomes 'active',
     * or until the timeout is reached.
     *
     * Call this after emitting a 'session-expired' event to the frontend
     * and pausing the current operation. The operation can resume once
     * this resolves.
     *
     * @param accountId - The account that needs re-auth
     * @param userId - The workspace
     * @param timeoutMs - Maximum wait time (default: 10 minutes)
     * @param pollIntervalMs - How often to check (default: 5 seconds)
     * @throws Error if timeout is reached without re-auth
     */
    async waitForReauth(
        accountId: string,
        userId: string,
        timeoutMs: number = 10 * 60 * 1000,
        pollIntervalMs: number = 5_000
    ): Promise<ILinkedInAccount> {
        const start = Date.now();
        console.log(`[SessionManager] ⏳ Waiting for re-auth on account ${accountId} (timeout: ${timeoutMs / 60000}min)...`);

        while (true) {
            const elapsed = Date.now() - start;
            if (elapsed >= timeoutMs) {
                throw new Error(`[SessionManager] Re-auth timeout after ${timeoutMs / 60000}min for account ${accountId}`);
            }

            const account = await LinkedInAccount.findOne({
                _id: accountId,
                userId,
                status: 'active',
            }).exec();

            if (account) {
                console.log(`[SessionManager] ✅ Re-auth complete for account ${accountId}`);
                await LinkedInAuditLog.append(
                    userId,
                    new Types.ObjectId(accountId),
                    'session_restored',
                    { waitedMs: elapsed }
                );
                return account as ILinkedInAccount;
            }

            await new Promise(r => setTimeout(r, pollIntervalMs));
        }
    }

    // ── Phase 2: Account Switching ────────────────────────────

    /**
     * Switches the active account in the browser.
     * Clears current cookies, loads the new account's cookies,
     * and verifies the session.
     *
     * @param page - The active Puppeteer page
     * @param newAccountId - The account to switch to
     * @param userId - The workspace
     * @returns The new active account document
     * @throws SessionExpiredError if the new account's session is invalid
     */
    async switchAccount(
        page: Page,
        newAccountId: string,
        userId: string
    ): Promise<ILinkedInAccount> {
        const newAccount = await LinkedInAccount.findOne({
            _id: newAccountId,
            userId,
        }).exec();

        if (!newAccount) throw new AccountNotFoundError(newAccountId);
        if (newAccount.status === 'disabled') throw new AccountDisabledError(newAccountId);

        console.log(`[SessionManager] 🔄 Switching to account: ${newAccount.label} (${newAccountId})`);

        // Restore the new account's session into the browser
        const restored = await this.restoreSession(page, newAccount as ILinkedInAccount);

        if (!restored) {
            throw new SessionExpiredError(newAccountId, userId);
        }

        // Navigate to feed and verify
        await page.goto('https://www.linkedin.com/feed/', {
            waitUntil: 'domcontentloaded',
            timeout: 15_000,
        });

        await this.ensureValidSession(page, newAccount as ILinkedInAccount);

        // Update active account pointer
        activeAccountCache.set(userId, newAccountId);
        await LinkedInAccount.findByIdAndUpdate(newAccountId, {
            lastUsedAt: new Date(),
        });

        await LinkedInAuditLog.append(
            userId,
            new Types.ObjectId(newAccountId),
            'account_switch',
            { label: newAccount.label }
        );

        console.log(`[SessionManager] ✅ Switched to account: ${newAccount.label}`);
        return newAccount as ILinkedInAccount;
    }
}

// ── Singleton ─────────────────────────────────────────────────

export const sessionManager = new SessionManager();

