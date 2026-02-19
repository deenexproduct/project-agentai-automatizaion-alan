/**
 * Integration Tests — Session Lifecycle (Phase 4)
 *
 * Tests the end-to-end session lifecycle:
 * - Session pre-check (status + expiry)
 * - waitForReauth polling
 * - Account switching
 *
 * Run with: npx jest src/__tests__/session-lifecycle.test.ts --verbose
 */

import * as crypto from 'crypto';
import { Types } from 'mongoose';

// Set encryption key before any imports
const TEST_KEY = crypto.randomBytes(32).toString('hex');
process.env.LINKEDIN_ENCRYPTION_KEY = TEST_KEY;

// ── Mocks ──────────────────────────────────────────────────────

const mockFindById = jest.fn();
const mockFindByIdAndUpdate = jest.fn();
const mockFindOne = jest.fn();
const mockFindActive = jest.fn();

jest.mock('../models/linkedin-account.model', () => ({
    LinkedInAccount: {
        findById: () => ({ exec: mockFindById }),
        findByIdAndUpdate: mockFindByIdAndUpdate,
        findOne: () => ({ exec: mockFindOne }),
        findActive: mockFindActive,
        create: jest.fn(),
    },
    __esModule: true,
}));

jest.mock('../models/linkedin-audit-log.model', () => ({
    LinkedInAuditLog: {
        append: jest.fn().mockResolvedValue(undefined),
    },
}));

// Import after mocks
import { sessionManager, SessionExpiredError, AccountNotFoundError, AccountDisabledError } from '../services/linkedin/session-manager.service';

// ── Tests ──────────────────────────────────────────────────────

describe('Session Lifecycle Integration', () => {
    const ACCOUNT_ID = new Types.ObjectId().toString();
    const WORKSPACE_ID = 'default';

    const makeAccount = (overrides: any = {}) => ({
        _id: new Types.ObjectId(ACCOUNT_ID),
        workspaceId: WORKSPACE_ID,
        label: 'test-account',
        status: 'active',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        cookiesEncrypted: null,
        cookiesIv: null,
        cookiesAuthTag: null,
        cookieCount: 0,
        ...overrides,
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ── Session Pre-Check ────────────────────────────────────

    describe('sessionPreCheck', () => {
        it('should pass when account is active and session is not expiring', async () => {
            const account = makeAccount();
            const mockPage = {} as any;

            // Should not throw
            await expect(
                sessionManager.sessionPreCheck(account, mockPage, false)
            ).resolves.not.toThrow();
        });

        it('should throw SessionExpiredError when account status is reauth_required', async () => {
            const account = makeAccount({ status: 'reauth_required' });
            const mockPage = {} as any;

            await expect(
                sessionManager.sessionPreCheck(account, mockPage, false)
            ).rejects.toThrow(SessionExpiredError);
        });

        it('should throw AccountDisabledError when account is disabled', async () => {
            const account = makeAccount({ status: 'disabled' });
            const mockPage = {} as any;

            await expect(
                sessionManager.sessionPreCheck(account, mockPage, false)
            ).rejects.toThrow(AccountDisabledError);
        });

        it('should throw SessionExpiredError when cookies have expired', async () => {
            const account = makeAccount({
                expiresAt: new Date(Date.now() - 1000), // expired 1s ago
            });
            const mockPage = {} as any;

            await expect(
                sessionManager.sessionPreCheck(account, mockPage, false)
            ).rejects.toThrow(SessionExpiredError);
        });

        it('should warn but not throw when session expires within 24h', async () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const account = makeAccount({
                expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12h from now
            });
            const mockPage = {} as any;

            await expect(
                sessionManager.sessionPreCheck(account, mockPage, false)
            ).resolves.not.toThrow();

            // Should log expiring-soon warning via console.warn
            const warnCalls = consoleSpy.mock.calls.filter(
                c => typeof c[0] === 'string' && c[0].includes('expiring soon')
            );
            expect(warnCalls.length).toBeGreaterThanOrEqual(1);

            consoleSpy.mockRestore();
        });
    });

    // ── waitForReauth ────────────────────────────────────────

    describe('waitForReauth', () => {
        it('should resolve immediately if account is already active', async () => {
            const activeAccount = makeAccount({ status: 'active' });
            // waitForReauth uses LinkedInAccount.findOne({ _id, workspaceId, status: 'active' }).exec()
            mockFindOne.mockResolvedValue(activeAccount);

            const result = await sessionManager.waitForReauth(ACCOUNT_ID, WORKSPACE_ID, 5000);
            expect(result.status).toBe('active');
        });

        it('should timeout if account never becomes active', async () => {
            // findOne returns null (no active account found)
            mockFindOne.mockResolvedValue(null);

            // Set very short timeout and poll interval to avoid test hanging
            await expect(
                sessionManager.waitForReauth(ACCOUNT_ID, WORKSPACE_ID, 200, 50)
            ).rejects.toThrow(/timeout/i);
        }, 10000);

        it('should throw timeout error if account does not exist', async () => {
            // findOne returns null (account doesn't exist or isn't active)
            mockFindOne.mockResolvedValue(null);

            await expect(
                sessionManager.waitForReauth(ACCOUNT_ID, WORKSPACE_ID, 200, 50)
            ).rejects.toThrow(/timeout/i);
        });
    });

    // ── switchAccount ────────────────────────────────────────

    describe('switchAccount', () => {
        it('should throw AccountNotFoundError for non-existent account', async () => {
            mockFindOne.mockResolvedValue(null);
            const mockPage = { createCDPSession: jest.fn() } as any;

            await expect(
                sessionManager.switchAccount(mockPage, ACCOUNT_ID, WORKSPACE_ID)
            ).rejects.toThrow(AccountNotFoundError);
        });

        it('should throw AccountDisabledError for disabled account', async () => {
            mockFindOne.mockResolvedValue(makeAccount({ status: 'disabled' }));
            const mockPage = { createCDPSession: jest.fn() } as any;

            await expect(
                sessionManager.switchAccount(mockPage, ACCOUNT_ID, WORKSPACE_ID)
            ).rejects.toThrow(AccountDisabledError);
        });
    });

    // ── Error Types ──────────────────────────────────────────

    describe('Error Types', () => {
        it('SessionExpiredError should have correct properties', () => {
            const err = new SessionExpiredError('acc-1', 'ws-1');
            expect(err.name).toBe('SessionExpiredError');
            expect(err.accountId).toBe('acc-1');
            expect(err.workspaceId).toBe('ws-1');
            expect(err.message).toContain('acc-1');
        });

        it('AccountNotFoundError should have correct properties', () => {
            const err = new AccountNotFoundError('acc-2');
            expect(err.name).toBe('AccountNotFoundError');
            expect(err.message).toContain('acc-2');
        });

        it('AccountDisabledError should have correct properties', () => {
            const err = new AccountDisabledError('acc-3');
            expect(err.name).toBe('AccountDisabledError');
            expect(err.message).toContain('acc-3');
        });
    });
});
