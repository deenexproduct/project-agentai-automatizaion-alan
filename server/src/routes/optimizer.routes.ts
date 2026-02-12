import { Router, Request, Response } from 'express';
import { optimizeText, readPersonality, writePersonality } from '../services/optimizer.service';

const router = Router();

// ── Optimize text ───────────────────────────────────────────
router.post('/optimize', async (req: Request, res: Response) => {
    try {
        const { text } = req.body;
        if (!text || typeof text !== 'string' || !text.trim()) {
            return res.status(400).json({ error: 'Text is required' });
        }

        console.log(`✨ [OPTIMIZER] Optimizing ${text.length} chars...`);
        const t0 = Date.now();

        const result = await optimizeText(text.trim());

        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`✨ [OPTIMIZER] Done in ${elapsed}s (${text.length} → ${result.optimized.length} chars)`);

        res.json(result);
    } catch (error: any) {
        console.error('✨ [OPTIMIZER] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ── Get personality profile ─────────────────────────────────
router.get('/personality', (req: Request, res: Response) => {
    try {
        const content = readPersonality();
        res.json({ content });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Update personality profile ──────────────────────────────
router.put('/personality', (req: Request, res: Response) => {
    try {
        const { content } = req.body;
        if (!content || typeof content !== 'string') {
            return res.status(400).json({ error: 'Content is required' });
        }
        writePersonality(content);
        console.log(`✨ [OPTIMIZER] Personality updated (${content.length} chars)`);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
