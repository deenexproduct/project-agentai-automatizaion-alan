import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { whatsappService } from '../services/whatsapp.service';
import { ScheduledMessage } from '../models/scheduled-message.model';

const router = Router();

// ── Simple Rate Limiter (per user, no extra dependency) ─────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 requests per minute

function checkRateLimit(userId: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(userId);
    if (!entry || now > entry.resetAt) {
        rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }
    if (entry.count >= RATE_LIMIT_MAX) return false;
    entry.count++;
    return true;
}

// Configure multer for WhatsApp file uploads
const waStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../uploads/whatsapp');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    },
});

const upload = multer({
    storage: waStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

// ── Status & QR ─────────────────────────────────────────────

router.get('/status', (req: Request, res: Response) => {
    const userId = req.user?._id?.toString();
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const tenant = whatsappService.getTenant(userId);
    res.json(tenant.getStatus());
});

router.get('/qr', (req: Request, res: Response) => {
    const userId = req.user?._id?.toString();
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const tenant = whatsappService.getTenant(userId);

    const qr = tenant.getQR();
    if (qr) {
        res.json({ qr });
    } else if (tenant.isConnected()) {
        res.json({ connected: true, message: 'Already connected' });
    } else {
        res.json({ qr: null, message: 'Waiting for QR...' });
    }
});

// ── Chats ───────────────────────────────────────────────────

router.get('/debug', (req: Request, res: Response) => {
    const userId = req.user?._id?.toString() || 'default';
    const tenant = whatsappService.getTenant(userId);
    res.json({
        isConnected: tenant.isConnected(),
        status: tenant.getStatus(),
        chatsCacheLength: (tenant as any).chatsCache?.length,
        isFetching: (tenant as any).isFetchingChats
    });
});

router.get('/chats', async (req: Request, res: Response) => {
    try {
        console.log(`📡 [HTTP GET /chats] Request received from token ${req.user?._id}`);
        const userId = req.user?._id?.toString();
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const tenant = whatsappService.getTenant(userId);
        console.log(`📡 [HTTP GET /chats] Tenant retrieved, isConnected: ${tenant.isConnected()}`);

        // Force refresh if ?refresh=true or cache is empty
        const forceRefresh = req.query.refresh === 'true';
        if (forceRefresh) {
            console.log(`📡 [HTTP GET /chats] Forcing refreshChats()...`);
            await tenant.refreshChats();
            console.log(`📡 [HTTP GET /chats] refreshChats() completed.`);
        }

        const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
        const search = req.query.search ? (req.query.search as string) : undefined;

        console.log(`📡 [HTTP GET /chats] Calling getChats() with limit=${limit}, search=${search}`);
        const chats = await tenant.getChats(limit, search);
        console.log(`📡 [HTTP GET /chats] Returning ${chats.length} elements to client.`);
        res.json(chats);
    } catch (error: any) {
        console.error(`❌ [HTTP GET /chats] Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

router.get('/contact/:id/profile-pic', async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id?.toString();
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const tenant = whatsappService.getTenant(userId);

        const url = await tenant.getContactProfilePic(req.params.id);
        res.json({ url });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Schedule a Message ──────────────────────────────────────

router.post('/schedule', (req: Request, res: Response, next: Function) => {
    upload.single('file')(req, res, (err: any) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'El archivo excede el límite de 10MB' });
            }
            return res.status(400).json({ error: err.message || 'Error al subir archivo' });
        }
        next();
    });
}, async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id?.toString();
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!checkRateLimit(userId)) return res.status(429).json({ error: 'Demasiadas solicitudes. Esperá un momento.' });

        const { chatId,
            chatName,
            isGroup,
            messageType,
            textContent,
            scheduledAt,
            isRecurring,
            cronPattern,
            recurringLabel,
        } = req.body;

        if (!chatId || !chatName || !messageType || !scheduledAt) {
            return res.status(400).json({ error: 'Missing required fields: chatId, chatName, messageType, scheduledAt' });
        }

        // Validate that scheduledAt is in the future
        const scheduledDate = new Date(scheduledAt);
        if (isNaN(scheduledDate.getTime())) {
            return res.status(400).json({ error: 'Fecha inválida' });
        }
        if (scheduledDate.getTime() <= Date.now()) {
            return res.status(400).json({ error: 'La fecha de envío debe ser en el futuro' });
        }

        // Validate message content
        if (messageType === 'text' && !textContent) {
            return res.status(400).json({ error: 'Text content required for text messages' });
        }

        if ((messageType === 'audio' || messageType === 'file') && !req.file) {
            return res.status(400).json({ error: 'File required for audio/file messages' });
        }

        const message = new ScheduledMessage({
            userId: req.user?._id?.toString(),
            chatId,
            chatName,
            isGroup: isGroup === 'true' || isGroup === true,
            messageType,
            textContent: textContent || undefined,
            filePath: req.file ? req.file.path : undefined,
            fileName: req.file ? req.file.originalname : undefined,
            scheduledAt: scheduledDate,
            isRecurring: isRecurring === 'true' || isRecurring === true,
            cronPattern: cronPattern || undefined,
            recurringLabel: recurringLabel || undefined,
        });

        await message.save();

        console.log(`📅 Message scheduled: ${chatName} at ${scheduledAt} (${messageType})`);
        console.log(`📅 Parsed scheduledAt: ${message.scheduledAt.toISOString()} | Server now: ${new Date().toISOString()}`);
        res.json(message);
    } catch (error: any) {
        console.error('Schedule error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ── Scheduled (pending) Messages ────────────────────────────

router.get('/scheduled', async (req: Request, res: Response) => {
    try {
        const messages = await ScheduledMessage.find({
            userId: req.user?._id?.toString(),
            status: 'pending',
        }).sort({ scheduledAt: 1 });

        res.json(messages);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Sent/Failed History ─────────────────────────────────────

router.get('/history', async (req: Request, res: Response) => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
        const skip = (page - 1) * limit;

        const [messages, total] = await Promise.all([
            ScheduledMessage.find({
                userId: req.user?._id?.toString(),
                status: { $in: ['sent', 'failed'] },
            }).sort({ sentAt: -1, scheduledAt: -1 }).skip(skip).limit(limit),
            ScheduledMessage.countDocuments({
                userId: req.user?._id?.toString(),
                status: { $in: ['sent', 'failed'] },
            }),
        ]);

        res.json({ messages, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Cancel a Scheduled Message ──────────────────────────────

router.delete('/scheduled/:id', async (req: Request, res: Response) => {
    try {
        const message = await ScheduledMessage.findOne({ _id: req.params.id, userId: req.user?._id?.toString() });
        if (!message) {
            return res.status(404).json({ error: 'Message not found or unauthorized' });
        }

        if (message.status !== 'pending') {
            return res.status(400).json({ error: 'Can only cancel pending messages' });
        }

        message.status = 'cancelled';
        await message.save();

        // If it's recurring, also cancel all future pending instances
        if (message.isRecurring) {
            await ScheduledMessage.updateMany(
                {
                    userId: req.user?._id?.toString(),
                    $or: [
                        { parentId: message._id, status: 'pending' },
                        { parentId: message.parentId, status: 'pending', _id: { $ne: message._id } },
                    ],
                },
                { status: 'cancelled' }
            );
        }

        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Reset Session / Logout ────────────────────────────────
router.post('/reset', async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id?.toString();
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const tenant = whatsappService.getTenant(userId);
        await tenant.resetSession();

        res.json({ success: true, message: 'La sesión fue reseteada correctamente' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Retry a Failed/Pending Message ──────────────────────────

router.post('/retry/:id', async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id?.toString();
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!checkRateLimit(userId)) return res.status(429).json({ error: 'Demasiadas solicitudes. Esperá un momento.' });

        const msg = await ScheduledMessage.findOne({ _id: req.params.id, userId });
        if (!msg) return res.status(404).json({ error: 'Mensaje no encontrado' });

        // Reschedule to 1 minute from now so it goes through the scheduler with proper delays
        msg.status = 'pending';
        msg.retryCount = 0;
        msg.error = undefined;
        msg.scheduledAt = new Date(Date.now() + 60 * 1000); // 1 minute from now
        await msg.save();

        res.json({ success: true, message: 'Mensaje reprogramado para enviar en 1 minuto' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Scheduler Diagnostics ─────────────────────────────────

router.get('/scheduler-status', async (req: Request, res: Response) => {
    try {
        const userId = req.user?._id?.toString();
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        const tenant = whatsappService.getTenant(userId);
        const diagnostics = await tenant.getSchedulerDiagnostics();
        res.json(diagnostics);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
