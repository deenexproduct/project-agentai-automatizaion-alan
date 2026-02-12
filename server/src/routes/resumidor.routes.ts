import { Router, Request, Response } from 'express';
import { resumidorService, DEFAULT_CONFIG } from '../services/resumidor.service';
import { whatsappService } from '../services/whatsapp.service';
import { Summary } from '../models/summary.model';

const router = Router();

// ── Health Check ────────────────────────────────────────────

router.get('/health', async (req: Request, res: Response) => {
    const llm = await resumidorService.checkLLMHealth();
    const waConnected = whatsappService.isConnected();

    res.json({
        provider: llm.provider,
        llm: llm.ok,
        llmModels: llm.models,
        llmError: llm.error,
        whatsapp: waConnected,
        ready: llm.ok && waConnected,
    });
});

// ── Available Models ────────────────────────────────────────

router.get('/models', async (req: Request, res: Response) => {
    const models = await resumidorService.getAvailableModels();
    res.json(models);
});

// ── Groups Only ─────────────────────────────────────────────

router.get('/groups', async (req: Request, res: Response) => {
    try {
        const chats = await whatsappService.getChats();
        const groups = chats.filter(c => c.isGroup);
        res.json(groups);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Summarize (SSE for real-time progress) ──────────────────

router.post('/summarize', async (req: Request, res: Response) => {
    // Set up Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const sendEvent = (type: string, data: any) => {
        res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
    };

    try {
        const { chatId, rangeMode, hours, rangeFrom, rangeTo, model, config, timezoneOffset } = req.body;

        if (!chatId || !rangeMode) {
            sendEvent('error', { message: 'Faltan campos: chatId, rangeMode' });
            res.end();
            return;
        }

        if (rangeMode === 'hours' && !hours) {
            sendEvent('error', { message: 'Falta el campo: hours' });
            res.end();
            return;
        }

        if (rangeMode === 'range' && (!rangeFrom || !rangeTo)) {
            sendEvent('error', { message: 'Faltan campos: rangeFrom, rangeTo' });
            res.end();
            return;
        }

        const reportConfig = config || DEFAULT_CONFIG;

        // Progress callback → SSE events
        const onProgress = (step: string, detail: string, progress?: number) => {
            sendEvent('progress', { step, detail, progress });
        };

        const result = await resumidorService.summarize(
            { chatId, rangeMode, hours, rangeFrom, rangeTo, model, config: reportConfig, timezoneOffset },
            onProgress
        );

        // Save to history
        try {
            const summaryDoc = new Summary({
                chatId,
                chatName: result.chatName,
                hours: rangeMode === 'hours' ? hours : undefined,
                rangeFrom: rangeMode === 'range' ? new Date() : undefined,
                rangeTo: rangeMode === 'range' ? new Date() : undefined,
                rangeMode,
                totalMessages: result.totalMessages,
                totalAudios: result.totalAudios,
                summary: result.summary,
                config: reportConfig,
                llmModel: model || resumidorService.getProvider() === 'groq' ? 'llama-3.3-70b-versatile' : 'mistral',
                processingTimeSeconds: result.processingTimeSeconds,
            });
            await summaryDoc.save();
        } catch (saveErr: any) {
            console.error('Error saving summary to history:', saveErr.message);
        }

        // Send final result
        sendEvent('complete', {
            summary: result.summary,
            chatName: result.chatName,
            totalMessages: result.totalMessages,
            totalAudios: result.totalAudios,
            processingTimeSeconds: result.processingTimeSeconds,
        });
    } catch (error: any) {
        console.error('Summarize error:', error.message);
        sendEvent('error', { message: error.message });
    }

    res.end();
});

// ── Summary History ─────────────────────────────────────────

router.get('/history', async (req: Request, res: Response) => {
    try {
        const summaries = await Summary.find()
            .sort({ createdAt: -1 })
            .limit(50);
        res.json(summaries);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Delete Summary ──────────────────────────────────────────

router.delete('/history/:id', async (req: Request, res: Response) => {
    try {
        await Summary.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
