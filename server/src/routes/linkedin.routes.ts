import { Router, Request, Response } from 'express';
import { linkedinService } from '../services/linkedin.service';
import { healthMonitor } from '../services/linkedin/health-monitor.service';
import { operationManager } from '../services/linkedin/operation-manager.service';
import { rateLimitHandler } from '../services/linkedin/rate-limit-handler.service';
import { statePersistence } from '../services/linkedin/state-persistence.service';

const router = Router();

// Helper: get userId from authenticated user (must match linkedin-accounts.routes.ts)
function getUserId(req: Request): string {
    if (!req.user || !req.user._id) {
        throw new Error('Unauthorized');
    }
    return req.user._id.toString();
}

// ── GET /status — Session & prospecting status ──────────────
router.get('/status', (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        const tenant = linkedinService.getTenant(userId);
        res.json(tenant.getStatus());
    } catch (err: any) {
        if (err.message === 'Unauthorized') {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        res.status(500).json({ error: 'Internal error' });
    }
});

// ── POST /launch — Open browser, load cookies ──────────────
router.post('/launch', async (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        const tenant = linkedinService.getTenant(userId);
        await tenant.initialize();
        res.json({ success: true, status: tenant.getStatus() });
    } catch (err: any) {
        console.error('LinkedIn launch error:', err);
        res.status(500).json({ error: err.message || 'Failed to launch browser' });
    }
});

// ── POST /start-prospecting — Start automation ─────────────
router.post('/start-prospecting', async (req: Request, res: Response) => {
    try {
        const { urls, sendNote, noteText } = req.body;
        const userId = getUserId(req);
        const tenant = linkedinService.getTenant(userId);

        if (!urls || !Array.isArray(urls) || urls.length === 0) {
            return res.status(400).json({ error: 'urls must be a non-empty array of strings' });
        }

        await tenant.startProspecting({
            urls,
            sendNote: !!sendNote,
            noteText: noteText || undefined,
        });

        res.json({ success: true, message: `Prospecting started for ${urls.length} profiles` });
    } catch (err: any) {
        // Log the specific error and return it to the client
        console.error('Start prospecting error:', err.message);
        res.status(400).json({ error: err.message || 'Cannot start prospecting — check session status' });
    }
});

// ── POST /pause — Pause prospecting ────────────────────────
router.post('/pause', async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const tenant = linkedinService.getTenant(userId);
    await tenant.pause();
    res.json({ success: true, message: 'Prospecting paused' });
});

// ── POST /resume — Resume prospecting ──────────────────────
router.post('/resume', async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const tenant = linkedinService.getTenant(userId);
    await tenant.resume();
    res.json({ success: true, message: 'Prospecting resumed' });
});

// ── POST /stop — Stop prospecting completely ───────────────
router.post('/stop', async (req: Request, res: Response) => {
    const userId = getUserId(req);
    const tenant = linkedinService.getTenant(userId);
    const result = await tenant.stop();
    res.json({
        success: true,
        message: 'Prospecting stopped',
        deletedCount: result.deletedCount
    });
});

// ── GET /progress — Current progress (polling) ─────────────
router.get('/progress', (req: Request, res: Response) => {
    const userId = getUserId(req);
    const tenant = linkedinService.getTenant(userId);
    res.json(tenant.getProgress());
});

// ── GET /progress/stream — SSE real-time progress ──────────
router.get('/progress/stream', (req: Request, res: Response) => {
    const userId = getUserId(req);
    const tenant = linkedinService.getTenant(userId);

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Prevent nginx buffering
    });

    // Send initial state
    const initial = tenant.getProgress();
    res.write(`data: ${JSON.stringify(initial)}\n\n`);

    // Listen for progress events
    const onProgress = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const onComplete = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    const onPaused = (data: any) => {
        res.write(`data: ${JSON.stringify({ type: 'paused', ...data })}\n\n`);
    };

    const onResumed = (data: any) => {
        res.write(`data: ${JSON.stringify({ type: 'resumed', ...data })}\n\n`);
    };

    const onCaptcha = (data: any) => {
        res.write(`data: ${JSON.stringify({ type: 'captcha', ...data })}\n\n`);
    };

    const onSessionExpired = (data: any) => {
        res.write(`data: ${JSON.stringify({ type: 'session-expired', ...data })}\n\n`);
    };

    tenant.on('progress', onProgress);
    tenant.on('complete', onComplete);
    tenant.on('paused', onPaused);
    tenant.on('resumed', onResumed);
    tenant.on('captcha', onCaptcha);
    tenant.on('session-expired', onSessionExpired);

    // Clean up on client disconnect
    req.on('close', () => {
        tenant.off('progress', onProgress);
        tenant.off('complete', onComplete);
        tenant.off('paused', onPaused);
        tenant.off('resumed', onResumed);
        tenant.off('captcha', onCaptcha);
        tenant.off('session-expired', onSessionExpired);
    });
});

// ── GET /health — System health status ──────────────────────
router.get('/health', (_req: Request, res: Response) => {
    res.json({
        health: healthMonitor.getHealthStatus(),
        metrics: healthMonitor.getMetrics(),
        operation: {
            current: operationManager.getCurrent(),
            info: operationManager.getCurrentOperationInfo(),
        },
        rateLimit: rateLimitHandler.getStatus(),
        state: statePersistence.hasState(),
    });
});

// ── GET /health/history — Metrics history ───────────────────
router.get('/health/history', (_req: Request, res: Response) => {
    res.json({
        history: healthMonitor.getMetricsHistory(),
    });
});

// ── POST /health/reset — Reset health metrics ───────────────
router.post('/health/reset', (_req: Request, res: Response) => {
    healthMonitor.reset();
    res.json({ success: true, message: 'Health metrics reset' });
});

// ── GET /state — Persistence state status ───────────────────
router.get('/state', async (_req: Request, res: Response) => {
    const summary = await statePersistence.getSummary();
    res.json({
        hasState: summary.hasState,
        summary: summary.summary,
        backups: statePersistence.listBackups(),
    });
});

// ── POST /state/clear — Clear persistence state ─────────────
router.post('/state/clear', async (_req: Request, res: Response) => {
    await statePersistence.clear();
    res.json({ success: true, message: 'State cleared' });
});

// ── POST /state/restore — Restore from backup ───────────────
router.post('/state/restore', async (req: Request, res: Response) => {
    const { backupFile } = req.body;
    if (!backupFile) {
        return res.status(400).json({ error: 'backupFile is required' });
    }

    const state = await statePersistence.restoreFromBackup(backupFile);
    if (state) {
        res.json({ success: true, message: 'State restored', batchId: state.batchId });
    } else {
        res.status(500).json({ error: 'Failed to restore state' });
    }
});

// ── GET /scrape-profile — Quick scrape a single profile for CRM auto-fill ──
router.get('/scrape-profile', async (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        const profileUrl = req.query.url as string;

        if (!profileUrl || !profileUrl.includes('linkedin.com/in/')) {
            return res.status(400).json({ error: 'A valid LinkedIn profile URL is required' });
        }

        const tenant = linkedinService.getTenant(userId);
        const page = tenant.getActivePage();

        if (!page) {
            return res.status(503).json({ error: 'LinkedIn browser is not active. Please launch LinkedIn first.' });
        }

        const status = tenant.getStatus();
        if (status.status !== 'logged-in') {
            return res.status(503).json({ error: 'LinkedIn session is not logged in. Please log in first.' });
        }

        // Navigate to the profile
        console.log(`🔍 Scraping profile for CRM auto-fill: ${profileUrl}`);
        await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {
            // fallback — try load event only
            return page.goto(profileUrl, { waitUntil: 'load', timeout: 15000 });
        });

        // Give page time to render
        await new Promise(r => setTimeout(r, 2000));

        const data = await tenant.scrapeProfileData(page);

        if (!data) {
            return res.status(404).json({ error: 'Could not extract profile data from this page.' });
        }

        res.json({
            fullName: data.fullName,
            headline: data.headline,
            position: data.currentPosition || data.headline,
            company: data.currentCompany,
            profilePhotoUrl: data.profilePhotoUrl,
            location: data.location,
        });
    } catch (err: any) {
        console.error('Scrape profile error:', err.message);
        res.status(500).json({ error: err.message || 'Failed to scrape profile' });
    }
});

export default router;
