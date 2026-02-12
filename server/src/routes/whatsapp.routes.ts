import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { whatsappService } from '../services/whatsapp.service';
import { ScheduledMessage } from '../models/scheduled-message.model';

const router = Router();

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

const upload = multer({ storage: waStorage });

// ── Status & QR ─────────────────────────────────────────────

router.get('/status', (req: Request, res: Response) => {
    res.json(whatsappService.getStatus());
});

router.get('/qr', (req: Request, res: Response) => {
    const qr = whatsappService.getQR();
    if (qr) {
        res.json({ qr });
    } else if (whatsappService.isConnected()) {
        res.json({ connected: true, message: 'Already connected' });
    } else {
        res.json({ qr: null, message: 'Waiting for QR...' });
    }
});

// ── Chats ───────────────────────────────────────────────────

router.get('/chats', async (req: Request, res: Response) => {
    try {
        const chats = await whatsappService.getChats();
        res.json(chats);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Schedule a Message ──────────────────────────────────────

router.post('/schedule', upload.single('file'), async (req: Request, res: Response) => {
    try {
        const {
            chatId,
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

        // Validate message content
        if (messageType === 'text' && !textContent) {
            return res.status(400).json({ error: 'Text content required for text messages' });
        }

        if ((messageType === 'audio' || messageType === 'file') && !req.file) {
            return res.status(400).json({ error: 'File required for audio/file messages' });
        }

        const message = new ScheduledMessage({
            chatId,
            chatName,
            isGroup: isGroup === 'true' || isGroup === true,
            messageType,
            textContent: textContent || undefined,
            filePath: req.file ? req.file.path : undefined,
            fileName: req.file ? req.file.originalname : undefined,
            scheduledAt: new Date(scheduledAt),
            isRecurring: isRecurring === 'true' || isRecurring === true,
            cronPattern: cronPattern || undefined,
            recurringLabel: recurringLabel || undefined,
        });

        await message.save();

        console.log(`📅 Message scheduled: ${chatName} at ${scheduledAt} (${messageType})`);
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
            status: { $in: ['pending', 'failed'] },
        }).sort({ scheduledAt: 1 });

        res.json(messages);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Sent/Failed History ─────────────────────────────────────

router.get('/history', async (req: Request, res: Response) => {
    try {
        const messages = await ScheduledMessage.find({
            status: { $in: ['sent', 'failed'] },
        }).sort({ sentAt: -1, scheduledAt: -1 }).limit(100);

        res.json(messages);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// ── Cancel a Scheduled Message ──────────────────────────────

router.delete('/scheduled/:id', async (req: Request, res: Response) => {
    try {
        const message = await ScheduledMessage.findById(req.params.id);
        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
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

// ── Retry a Failed/Pending Message ──────────────────────────

router.post('/retry/:id', async (req: Request, res: Response) => {
    try {
        const result = await whatsappService.retryMessage(req.params.id);
        if (result.success) {
            res.json({ success: true, message: 'Mensaje enviado exitosamente' });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
