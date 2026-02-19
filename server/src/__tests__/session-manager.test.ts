/**
 * Unit Tests — SessionManager Service
 *
 * Tests encrypted cookie save/load, session verification, typed errors,
 * account management, and mutex behavior.
 *
 * Run with: npx jest src/__tests__/session-manager.test.ts --verbose
 *
 * NOTE: MongoDB operations are mocked via jest.mock().
 */

import * as crypto from 'crypto';

// Set encryption key before any imports
const TEST_KEY = crypto.randomBytes(32).toString('hex');
process.env.LINKEDIN_ENCRYPTION_KEY = TEST_KEY;

// ── Mocks ──────────────────────────────────────────────────────

const mockAccount = {
    _id: { toString: () => 'account-id-123' },
    workspaceId: 'default',
    label: 'Test Account',
    status: 'active',
    cookiesEncrypted: null,
    cookiesIv: null,
    cookiesAuthTag: null,
    cookieCount: 0,
    cookiesSavedAt: null,
    expiresAt: null,
    lastAuthAt: null,
    lastUsedAt: null,
    lastVerifiedAt: null,
};

jest.mock('../models/linkedin-account.model', () => {
    return {
        LinkedInAccount: {
            create: jest.fn().mockResolvedValue(mockAccount),
            findById: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockAccount),
                select: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue(mockAccount),
                }),
            }),
            findOne: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockAccount),
                sort: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue(mockAccount),
                }),
            }),
            findOneAndUpdate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(mockAccount),
            }),
            findByIdAndUpdate: jest.fn().mockResolvedValue(mockAccount),
            find: jest.fn().mockReturnValue({
                sort: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue([mockAccount]),
                }),
            }),
            findActive: jest.fn().mockResolvedValue(mockAccount),
        },
    };
});

jest.mock('../models/linkedin-audit-log.model', () => ({
    LinkedInAuditLog: {
        append: jest.fn().mockResolvedValue(undefined),
        getRecent: jest.fn().mockResolvedValue([]),
    },
}));

// ── Import after mocks ─────────────────────────────────────────

import {
    sessionManager,
    SessionExpiredError,
    AccountNotFoundError,
    AccountDisabledError,
} from '../services/linkedin/session-manager.service';
import { LinkedInAccount } from '../models/linkedin-account.model';
import { LinkedInAuditLog } from '../models/linkedin-audit-log.model';
import { encrypt, _resetKeyCache } from '../utils/crypto.service';

// ── Mock Puppeteer Page ────────────────────────────────────────

function createMockPage(options: {
    isLoggedIn?: boolean;
    url?: string;
} = {}) {
    return {
        url: jest.fn().mockReturnValue(options.url ?? 'https://www.linkedin.com/feed/'),
        goto: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue(options.isLoggedIn ?? true),
        cookies: jest.fn().mockResolvedValue([
            { name: 'li_at', value: 'test_token', domain: '.linkedin.com', expires: Math.floor(Date.now() / 1000) + 86400 },
            { name: 'JSESSIONID', value: 'session_123', domain: '.linkedin.com' },
        ]),
        setCookie: jest.fn().mockResolvedValue(undefined),
        createCDPSession: jest.fn().mockResolvedValue({
            send: jest.fn().mockResolvedValue(undefined),
        }),
    } as any;
}

// ── Tests ──────────────────────────────────────────────────────

describe('SessionManager', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        _resetKeyCache();
        process.env.LINKEDIN_ENCRYPTION_KEY = TEST_KEY;
    });

    afterEach(() => {
        _resetKeyCache();
    });

    // ── createAccount ──────────────────────────────────────────

    describe('createAccount()', () => {
        it('should create an account and write an audit log', async () => {
            const account = await sessionManager.createAccount('default', 'Test Account');
            expect(LinkedInAccount.create).toHaveBeenCalledWith({
                workspaceId: 'default',
                label: 'Test Account',
                status: 'reauth_required',
            });
            expect(LinkedInAuditLog.append).toHaveBeenCalledWith(
                'default',
                expect.anything(),
                'account_created',
                expect.objectContaining({ label: 'Test Account' })
            );
            expect(account).toBeDefined();
        });
    });

    // ── listAccounts ───────────────────────────────────────────

    describe('listAccounts()', () => {
        it('should return accounts for a workspace', async () => {
            const accounts = await sessionManager.listAccounts('default');
            expect(LinkedInAccount.find).toHaveBeenCalledWith({ workspaceId: 'default' });
            expect(Array.isArray(accounts)).toBe(true);
        });
    });

    // ── saveCookies ────────────────────────────────────────────

    describe('saveCookies()', () => {
        it('should encrypt cookies and save to DB (not plaintext)', async () => {
            const cookies = [
                { name: 'li_at', value: 'super_secret_token', domain: '.linkedin.com', expires: Math.floor(Date.now() / 1000) + 86400 },
            ];

            await sessionManager.saveCookies('account-id-123', cookies);

            expect(LinkedInAccount.findByIdAndUpdate).toHaveBeenCalledWith(
                'account-id-123',
                expect.objectContaining({
                    cookiesEncrypted: expect.any(String),
                    cookiesIv: expect.any(String),
                    cookiesAuthTag: expect.any(String),
                    cookieCount: 1,
                    status: 'active',
                })
            );

            // The stored ciphertext must NOT contain the plaintext cookie value
            const callArgs = (LinkedInAccount.findByIdAndUpdate as jest.Mock).mock.calls[0][1];
            expect(callArgs.cookiesEncrypted).not.toContain('super_secret_token');
        });

        it('should write a cookies_saved audit event', async () => {
            await sessionManager.saveCookies('account-id-123', [
                { name: 'li_at', value: 'token', domain: '.linkedin.com' },
            ]);
            expect(LinkedInAuditLog.append).toHaveBeenCalledWith(
                'default',
                expect.anything(),
                'cookies_saved',
                expect.objectContaining({ cookieCount: 1 })
            );
        });

        it('should calculate expiresAt from li_at cookie', async () => {
            const futureExpiry = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
            await sessionManager.saveCookies('account-id-123', [
                { name: 'li_at', value: 'token', domain: '.linkedin.com', expires: futureExpiry },
            ]);
            const callArgs = (LinkedInAccount.findByIdAndUpdate as jest.Mock).mock.calls[0][1];
            expect(callArgs.expiresAt).toBeInstanceOf(Date);
        });

        it('should NOT include cookie values in audit log metadata', async () => {
            await sessionManager.saveCookies('account-id-123', [
                { name: 'li_at', value: 'SENSITIVE_TOKEN', domain: '.linkedin.com' },
            ]);
            const auditCalls = (LinkedInAuditLog.append as jest.Mock).mock.calls;
            const metadata = JSON.stringify(auditCalls);
            expect(metadata).not.toContain('SENSITIVE_TOKEN');
        });

        it('should set status to active after saving cookies', async () => {
            await sessionManager.saveCookies('account-id-123', [
                { name: 'li_at', value: 'token', domain: '.linkedin.com' },
            ]);
            const callArgs = (LinkedInAccount.findByIdAndUpdate as jest.Mock).mock.calls[0][1];
            expect(callArgs.status).toBe('active');
        });
    });

    // ── loadCookies ────────────────────────────────────────────

    describe('loadCookies()', () => {
        it('should return empty array when no cookies stored', async () => {
            (LinkedInAccount.findById as jest.Mock).mockReturnValueOnce({
                select: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue({
                        _id: { toString: () => 'account-id-123' },
                        workspaceId: 'default',
                        cookiesEncrypted: null,
                        cookiesIv: null,
                        cookiesAuthTag: null,
                    }),
                }),
            });

            const cookies = await sessionManager.loadCookies('account-id-123');
            expect(cookies).toEqual([]);
        });

        it('should decrypt and return cookies after save/load cycle', async () => {
            const originalCookies = [
                { name: 'li_at', value: 'my_secret_token', domain: '.linkedin.com' },
                { name: 'JSESSIONID', value: 'session_abc', domain: '.linkedin.com' },
            ];

            // Encrypt what saveCookies would store
            const { ciphertext, iv, authTag } = encrypt(JSON.stringify(originalCookies));

            (LinkedInAccount.findById as jest.Mock).mockReturnValueOnce({
                select: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue({
                        _id: { toString: () => 'account-id-123' },
                        workspaceId: 'default',
                        cookiesEncrypted: ciphertext,
                        cookiesIv: iv,
                        cookiesAuthTag: authTag,
                    }),
                }),
            });

            const loaded = await sessionManager.loadCookies('account-id-123');
            expect(loaded).toHaveLength(2);
            expect(loaded[0].name).toBe('li_at');
            expect(loaded[0].value).toBe('my_secret_token');
            expect(loaded[1].name).toBe('JSESSIONID');
        });

        it('should throw AccountNotFoundError when account does not exist', async () => {
            (LinkedInAccount.findById as jest.Mock).mockReturnValueOnce({
                select: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue(null),
                }),
            });

            await expect(sessionManager.loadCookies('nonexistent-id'))
                .rejects
                .toThrow(AccountNotFoundError);
        });

        it('should write a cookies_loaded audit event', async () => {
            const { ciphertext, iv, authTag } = encrypt(JSON.stringify([
                { name: 'li_at', value: 'token', domain: '.linkedin.com' },
            ]));

            (LinkedInAccount.findById as jest.Mock).mockReturnValueOnce({
                select: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue({
                        _id: { toString: () => 'account-id-123' },
                        workspaceId: 'default',
                        cookiesEncrypted: ciphertext,
                        cookiesIv: iv,
                        cookiesAuthTag: authTag,
                    }),
                }),
            });

            await sessionManager.loadCookies('account-id-123');
            expect(LinkedInAuditLog.append).toHaveBeenCalledWith(
                'default',
                expect.anything(),
                'cookies_loaded',
                expect.objectContaining({ cookieCount: 1 })
            );
        });
    });

    // ── ensureValidSession ─────────────────────────────────────

    describe('ensureValidSession()', () => {
        it('should resolve when DOM check passes (session valid)', async () => {
            const page = createMockPage({ isLoggedIn: true });
            const account = {
                _id: { toString: () => 'account-id-123' },
                workspaceId: 'default',
            } as any;

            await expect(sessionManager.ensureValidSession(page, account)).resolves.toBeUndefined();
            expect(LinkedInAccount.findByIdAndUpdate).toHaveBeenCalledWith(
                'account-id-123',
                expect.objectContaining({ lastVerifiedAt: expect.any(Date) })
            );
        });

        it('should throw SessionExpiredError when DOM check fails', async () => {
            const page = createMockPage({ isLoggedIn: false });
            const account = {
                _id: { toString: () => 'account-id-123' },
                workspaceId: 'default',
                label: 'Test',
            } as any;

            await expect(sessionManager.ensureValidSession(page, account))
                .rejects
                .toThrow(SessionExpiredError);
        });

        it('should mark account as reauth_required when session expires', async () => {
            const page = createMockPage({ isLoggedIn: false });
            const account = {
                _id: { toString: () => 'account-id-123' },
                workspaceId: 'default',
                label: 'Test',
            } as any;

            try {
                await sessionManager.ensureValidSession(page, account);
            } catch {
                // Expected SessionExpiredError
            }

            expect(LinkedInAccount.findByIdAndUpdate).toHaveBeenCalledWith(
                'account-id-123',
                expect.objectContaining({ status: 'reauth_required' })
            );
        });

        it('should write a reauth_required audit event on session expiry', async () => {
            const page = createMockPage({ isLoggedIn: false });
            const account = {
                _id: { toString: () => 'account-id-123' },
                workspaceId: 'default',
                label: 'Test',
            } as any;

            try {
                await sessionManager.ensureValidSession(page, account);
            } catch {
                // Expected
            }

            const auditCalls = (LinkedInAuditLog.append as jest.Mock).mock.calls;
            const reauthCall = auditCalls.find((c: any[]) => c[2] === 'reauth_required');
            expect(reauthCall).toBeDefined();
        });

        it('should write a session_verified audit event on success', async () => {
            const page = createMockPage({ isLoggedIn: true });
            const account = {
                _id: { toString: () => 'account-id-123' },
                workspaceId: 'default',
            } as any;

            await sessionManager.ensureValidSession(page, account);

            const auditCalls = (LinkedInAuditLog.append as jest.Mock).mock.calls;
            const verifiedCall = auditCalls.find((c: any[]) => c[2] === 'session_verified');
            expect(verifiedCall).toBeDefined();
        });
    });

    // ── Typed Errors ───────────────────────────────────────────

    describe('Typed Errors', () => {
        it('SessionExpiredError should have accountId and workspaceId properties', () => {
            const err = new SessionExpiredError('acc-123', 'ws-456');
            expect(err.name).toBe('SessionExpiredError');
            expect(err.accountId).toBe('acc-123');
            expect(err.workspaceId).toBe('ws-456');
            expect(err).toBeInstanceOf(Error);
        });

        it('AccountNotFoundError should be an Error', () => {
            const err = new AccountNotFoundError('acc-123');
            expect(err.name).toBe('AccountNotFoundError');
            expect(err).toBeInstanceOf(Error);
        });

        it('AccountDisabledError should be an Error', () => {
            const err = new AccountDisabledError('acc-123');
            expect(err.name).toBe('AccountDisabledError');
            expect(err).toBeInstanceOf(Error);
        });

        it('SessionExpiredError message should include accountId', () => {
            const err = new SessionExpiredError('acc-123', 'ws-456');
            expect(err.message).toContain('acc-123');
        });
    });

    // ── onLoginSuccess ─────────────────────────────────────────

    describe('onLoginSuccess()', () => {
        it('should save cookies and write auth_success audit event', async () => {
            const page = createMockPage();
            const account = {
                _id: { toString: () => 'account-id-123' },
                workspaceId: 'default',
                label: 'Test',
            } as any;

            await sessionManager.onLoginSuccess(page, account);

            expect(LinkedInAccount.findByIdAndUpdate).toHaveBeenCalled();
            const auditCalls = (LinkedInAuditLog.append as jest.Mock).mock.calls;
            const successCall = auditCalls.find((c: any[]) => c[2] === 'auth_success');
            expect(successCall).toBeDefined();
        });

        it('should call page.cookies() to get the current session cookies', async () => {
            const page = createMockPage();
            const account = {
                _id: { toString: () => 'account-id-123' },
                workspaceId: 'default',
                label: 'Test',
            } as any;

            await sessionManager.onLoginSuccess(page, account);
            expect(page.cookies).toHaveBeenCalled();
        });
    });

    // ── restoreSession ─────────────────────────────────────────

    describe('restoreSession()', () => {
        it('should return false when no cookies stored', async () => {
            (LinkedInAccount.findById as jest.Mock).mockReturnValueOnce({
                select: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue({
                        _id: { toString: () => 'account-id-123' },
                        workspaceId: 'default',
                        cookiesEncrypted: null,
                        cookiesIv: null,
                        cookiesAuthTag: null,
                    }),
                }),
            });

            const page = createMockPage();
            const account = {
                _id: { toString: () => 'account-id-123' },
                workspaceId: 'default',
            } as any;

            const result = await sessionManager.restoreSession(page, account);
            expect(result).toBe(false);
        });

        it('should return true and inject cookies when cookies exist', async () => {
            const { ciphertext, iv, authTag } = encrypt(JSON.stringify([
                { name: 'li_at', value: 'token', domain: '.linkedin.com' },
            ]));

            (LinkedInAccount.findById as jest.Mock).mockReturnValueOnce({
                select: jest.fn().mockReturnValue({
                    exec: jest.fn().mockResolvedValue({
                        _id: { toString: () => 'account-id-123' },
                        workspaceId: 'default',
                        cookiesEncrypted: ciphertext,
                        cookiesIv: iv,
                        cookiesAuthTag: authTag,
                    }),
                }),
            });

            const page = createMockPage();
            const account = {
                _id: { toString: () => 'account-id-123' },
                workspaceId: 'default',
            } as any;

            const result = await sessionManager.restoreSession(page, account);
            expect(result).toBe(true);
            expect(page.setCookie).toHaveBeenCalled();
        });
    });
});
