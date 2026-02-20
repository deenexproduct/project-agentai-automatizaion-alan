/**
 * LinkedIn Accounts Routes
 *
 * REST endpoints for managing LinkedIn accounts (multi-account support).
 * All routes are scoped to a userId (defaults to 'default' for single-user setups).
 *
 * Endpoints:
 *   GET    /api/linkedin/accounts                  — list accounts
 *   POST   /api/linkedin/accounts                  — create account
 *   POST   /api/linkedin/accounts/:id/set-active   — set active account
 *   DELETE /api/linkedin/accounts/:id              — disable account
 *   GET    /api/linkedin/accounts/:id/audit        — get audit log
 *   GET    /api/linkedin/accounts/active           — get active account info
 */

import { Router, Request, Response } from 'express';
import { sessionManager, AccountNotFoundError, AccountDisabledError } from '../services/linkedin/session-manager.service';
import { circuitBreaker } from '../services/linkedin/circuit-breaker.service';
import { LinkedInAuditLog } from '../models/linkedin-audit-log.model';
import { Types } from 'mongoose';
import { linkedinService } from '../services/linkedin.service';

const router = Router();

// Helper: get userId from query param or default to 'default'
function getUserId(req: Request): string {
    if (!req.user || !req.user._id) {
        throw new Error('Unauthorized');
    }
    return req.user._id.toString();
}

// ── GET /accounts — List all accounts ───────────────────────
router.get('/', async (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        const accounts = await sessionManager.listAccounts(userId);
        res.json({ success: true, accounts });
    } catch (err: any) {
        console.error('[AccountsRoutes] listAccounts error:', err.message);
        res.status(500).json({ error: 'Failed to list accounts' });
    }
});

// ── GET /accounts/active — Get active account ────────────────
router.get('/active', async (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        const account = await sessionManager.getActiveAccount(userId);
        if (!account) {
            return res.json({ success: true, account: null, message: 'No active account' });
        }
        res.json({ success: true, account });
    } catch (err: any) {
        console.error('[AccountsRoutes] getActiveAccount error:', err.message);
        res.status(500).json({ error: 'Failed to get active account' });
    }
});

// ── POST /accounts — Create account ─────────────────────────
router.post('/', async (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        const { label } = req.body;

        if (!label || typeof label !== 'string' || label.trim().length === 0) {
            return res.status(400).json({ error: 'label is required and must be a non-empty string' });
        }

        const account = await sessionManager.createAccount(userId, label.trim());
        res.status(201).json({ success: true, account });
    } catch (err: any) {
        if (err.code === 11000) {
            // MongoDB duplicate key — label already exists for this workspace
            return res.status(409).json({ error: 'An account with this label already exists' });
        }
        console.error('[AccountsRoutes] createAccount error:', err.message);
        res.status(500).json({ error: 'Failed to create account' });
    }
});

// ── POST /accounts/:id/set-active — Set active account ──────
router.post('/:id/set-active', async (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        const { id } = req.params;

        if (!Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid account ID' });
        }

        const account = await sessionManager.setActiveAccount(userId, id);
        res.json({ success: true, account });
    } catch (err: any) {
        if (err instanceof AccountNotFoundError) {
            return res.status(404).json({ error: err.message });
        }
        if (err instanceof AccountDisabledError) {
            return res.status(409).json({ error: err.message });
        }
        console.error('[AccountsRoutes] setActiveAccount error:', err.message);
        res.status(500).json({ error: 'Failed to set active account' });
    }
});

// ── DELETE /accounts/:id — Disable account ───────────────────
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        const { id } = req.params;

        if (!Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid account ID' });
        }

        await sessionManager.disableAccount(userId, id);
        res.json({ success: true, message: 'Account disabled' });
    } catch (err: any) {
        if (err instanceof AccountNotFoundError) {
            return res.status(404).json({ error: err.message });
        }
        console.error('[AccountsRoutes] disableAccount error:', err.message);
        res.status(500).json({ error: 'Failed to disable account' });
    }
});

// ── GET /accounts/:id/audit — Get audit log ──────────────────
router.get('/:id/audit', async (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        const { id } = req.params;
        const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

        if (!Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid account ID' });
        }

        const events = await LinkedInAuditLog.getRecent(
            userId,
            new Types.ObjectId(id),
            limit
        );

        res.json({ success: true, events, count: events.length });
    } catch (err: any) {
        console.error('[AccountsRoutes] getAudit error:', err.message);
        res.status(500).json({ error: 'Failed to get audit log' });
    }
});

// ── POST /accounts/:id/switch — Switch active account in browser ──
router.post('/:id/switch', async (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        const { id } = req.params;

        if (!Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid account ID' });
        }

        // Get the current browser page from the LinkedIn service
        const tenant = linkedinService.getTenant(userId);
        const page = tenant.getActivePage();
        if (!page) {
            return res.status(409).json({
                error: 'Browser not open. Launch the browser first via POST /api/linkedin/launch'
            });
        }

        const account = await sessionManager.switchAccount(page, id, userId);
        res.json({ success: true, account, message: `Switched to account: ${account.label}` });
    } catch (err: any) {
        if (err instanceof AccountNotFoundError) {
            return res.status(404).json({ error: err.message });
        }
        if (err instanceof AccountDisabledError) {
            return res.status(409).json({ error: err.message });
        }
        console.error('[AccountsRoutes] switchAccount error:', err.message);
        res.status(500).json({ error: 'Failed to switch account', details: err.message });
    }
});

// ── GET /accounts/:id/circuit — Circuit breaker status ───────
router.get('/:id/circuit', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid account ID' });
        }

        const status = circuitBreaker.getStatus(id);
        res.json({ success: true, circuit: status });
    } catch (err: any) {
        console.error('[AccountsRoutes] circuitStatus error:', err.message);
        res.status(500).json({ error: 'Failed to get circuit status' });
    }
});

// ── POST /accounts/:id/circuit/reset — Reset circuit breaker ─
router.post('/:id/circuit/reset', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid account ID' });
        }

        circuitBreaker.reset(id);
        res.json({ success: true, message: 'Circuit breaker reset' });
    } catch (err: any) {
        console.error('[AccountsRoutes] circuitReset error:', err.message);
        res.status(500).json({ error: 'Failed to reset circuit breaker' });
    }
});

export default router;
