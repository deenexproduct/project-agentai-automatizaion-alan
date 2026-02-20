/**
 * LinkedIn Publishing Config Routes
 *
 * REST endpoints for managing client profile, content pillars, trends, and AI health.
 *
 * Endpoints:
 *   GET    /profile              Get client profile
 *   PUT    /profile              Update client profile
 *   GET    /pilares              List content pillars
 *   POST   /pilares              Create a pilar
 *   PUT    /pilares/:id          Update a pilar
 *   DELETE /pilares/:id          Soft-delete a pilar
 *   GET    /trends               Get active trend signals
 *   GET    /ai/health            Check AI services health
 *   GET    /notifications        Get recent notifications
 *   GET    /insights             Get learning insights
 *   POST   /engagement           Record post engagement metrics
 */

import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { ClientProfile } from '../models/client-profile.model';
import { ContentPilar } from '../models/content-pilar.model';
import { TrendSignal } from '../models/trend-signal.model';
import { ollamaService } from '../services/linkedin/ollama.service';
import { imageGenerator } from '../services/linkedin/image-generator.service';
import { publishingNotifications } from '../services/linkedin/publishing-notifications.service';
import { learningLoop } from '../services/linkedin/learning-loop.service';

const router = Router();

function getUserId(req: Request): string {
    if (!req.user || !req.user._id) {
        throw new Error('Unauthorized');
    }
    return req.user._id.toString();
}

// ── GET /profile ────────────────────────────────────────────

router.get('/profile', async (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        const profile = await ClientProfile.getForWorkspace(userId);
        if (!profile) {
            return res.status(404).json({ error: 'Client profile not found. Run the seed script first.' });
        }
        res.json({ profile });
    } catch (err: any) {
        console.error('[PublishingConfig] getProfile error:', err.message);
        res.status(500).json({ error: 'Failed to get profile' });
    }
});

// ── PUT /profile ────────────────────────────────────────────

router.put('/profile', async (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        const update = req.body;

        const profile = await ClientProfile.findOneAndUpdate(
            { userId },
            { $set: update },
            { new: true, upsert: true }
        ).exec();

        res.json({ profile });
    } catch (err: any) {
        console.error('[PublishingConfig] updateProfile error:', err.message);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ── GET /pilares ────────────────────────────────────────────

router.get('/pilares', async (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        const pilares = await ContentPilar.getActiveForWorkspace(userId);
        res.json({ pilares, count: pilares.length });
    } catch (err: any) {
        console.error('[PublishingConfig] getPilares error:', err.message);
        res.status(500).json({ error: 'Failed to get pilares' });
    }
});

// ── POST /pilares ───────────────────────────────────────────

router.post('/pilares', async (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        const { nombre, descripcion, keywords, frecuenciaSemanal, formatoPreferido, diasPreferidos, ejemplos } = req.body;

        if (!nombre || !descripcion) {
            return res.status(400).json({ error: 'nombre and descripcion are required' });
        }

        const pilar = await ContentPilar.create({
            userId,
            nombre,
            descripcion,
            keywords: keywords || [],
            frecuenciaSemanal: frecuenciaSemanal || 1,
            formatoPreferido: formatoPreferido || 'text',
            diasPreferidos: diasPreferidos || [],
            ejemplos: ejemplos || [],
        });

        res.status(201).json({ pilar });
    } catch (err: any) {
        console.error('[PublishingConfig] createPilar error:', err.message);
        res.status(500).json({ error: 'Failed to create pilar' });
    }
});

// ── PUT /pilares/:id ────────────────────────────────────────

router.put('/pilares/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid pilar ID' });
        }

        const pilar = await ContentPilar.findByIdAndUpdate(id, { $set: req.body }, { new: true }).exec();
        if (!pilar) {
            return res.status(404).json({ error: 'Pilar not found' });
        }
        res.json({ pilar });
    } catch (err: any) {
        console.error('[PublishingConfig] updatePilar error:', err.message);
        res.status(500).json({ error: 'Failed to update pilar' });
    }
});

// ── DELETE /pilares/:id (soft delete) ───────────────────────

router.delete('/pilares/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid pilar ID' });
        }

        const pilar = await ContentPilar.findByIdAndUpdate(id, { activo: false }, { new: true }).exec();
        if (!pilar) {
            return res.status(404).json({ error: 'Pilar not found' });
        }
        res.json({ pilar, message: 'Pilar deactivated' });
    } catch (err: any) {
        console.error('[PublishingConfig] deletePilar error:', err.message);
        res.status(500).json({ error: 'Failed to delete pilar' });
    }
});

// ── GET /trends ─────────────────────────────────────────────

router.get('/trends', async (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        const minScore = parseInt(req.query.minScore as string) || 30;
        const trends = await TrendSignal.getActiveForWorkspace(userId, minScore);
        res.json({ trends, count: trends.length });
    } catch (err: any) {
        console.error('[PublishingConfig] getTrends error:', err.message);
        res.status(500).json({ error: 'Failed to get trends' });
    }
});

// ── GET /ai/health — AI services status ─────────────────────

router.get('/ai/health', async (req: Request, res: Response) => {
    try {
        const [ollamaHealth, imageAvailable] = await Promise.all([
            ollamaService.healthCheck(),
            imageGenerator.isAvailable(),
        ]);

        res.json({
            ollama: ollamaHealth,
            imageGenerator: { available: imageAvailable },
            overall: ollamaHealth.healthy ? 'ok' : 'degraded',
        });
    } catch (err: any) {
        console.error('[PublishingConfig] aiHealth error:', err.message);
        res.status(500).json({ error: 'Failed to check AI health' });
    }
});

// ── GET /notifications — Recent notification history ────────

router.get('/notifications', async (_req: Request, res: Response) => {
    try {
        const limit = Math.min(parseInt(_req.query.limit as string) || 20, 50);
        const notifications = publishingNotifications.getRecent(limit);
        res.json({ notifications, count: notifications.length });
    } catch (err: any) {
        console.error('[PublishingConfig] getNotifications error:', err.message);
        res.status(500).json({ error: 'Failed to get notifications' });
    }
});

// ── GET /insights — Learning loop insights ──────────────────

router.get('/insights', async (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        const insights = await learningLoop.getInsights(userId);
        res.json({ insights });
    } catch (err: any) {
        console.error('[PublishingConfig] getInsights error:', err.message);
        res.status(500).json({ error: 'Failed to get insights' });
    }
});

// ── POST /engagement — Record engagement metrics ────────────

router.post('/engagement', async (req: Request, res: Response) => {
    try {
        const { postId, impressions, likes, comments, shares, clicks, engagementRate } = req.body;

        if (!postId || typeof postId !== 'string') {
            return res.status(400).json({ error: 'postId is required' });
        }

        await learningLoop.recordEngagement(postId, {
            impressions: impressions || 0,
            likes: likes || 0,
            comments: comments || 0,
            shares: shares || 0,
            clicks: clicks || 0,
            engagementRate: engagementRate || 0,
        });

        res.json({ message: 'Engagement recorded' });
    } catch (err: any) {
        console.error('[PublishingConfig] recordEngagement error:', err.message);
        res.status(500).json({ error: 'Failed to record engagement' });
    }
});

export default router;
