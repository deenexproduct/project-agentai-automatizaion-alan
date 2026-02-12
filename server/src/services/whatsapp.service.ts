import { Client, LocalAuth, MessageMedia, Chat } from 'whatsapp-web.js';
import * as QRCode from 'qrcode';
import cron from 'node-cron';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ScheduledMessage, IScheduledMessage } from '../models/scheduled-message.model';

const execFileAsync = promisify(execFile);

// ============================================================
// WhatsApp Service — Connection, Sending, Scheduling
// ============================================================

class WhatsAppService {
    private client: Client | null = null;
    private qrCode: string | null = null;
    private status: 'disconnected' | 'qr' | 'connecting' | 'connected' = 'disconnected';
    private schedulerJob: cron.ScheduledTask | null = null;

    // ── Initialization ──────────────────────────────────────────

    async initialize(): Promise<void> {
        console.log('📱 Initializing WhatsApp client...');

        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: path.join(__dirname, '../../wa-session'),
            }),
            puppeteer: {
                headless: true,
                protocolTimeout: 120000, // 120s — prevents 'Error: t' on large media
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-extensions',
                    '--disable-background-timer-throttling',
                ],
            },
        });

        // QR event
        this.client.on('qr', async (qr: string) => {
            console.log('📱 QR code received');
            this.status = 'qr';
            try {
                this.qrCode = await QRCode.toDataURL(qr, { width: 300 });
            } catch (err) {
                console.error('QR generation error:', err);
            }
        });

        // Ready event
        this.client.on('ready', () => {
            console.log('✅ WhatsApp client ready!');
            this.status = 'connected';
            this.qrCode = null;
            this.startScheduler();
            this.refreshChats();
        });

        // Authenticated event
        this.client.on('authenticated', () => {
            console.log('🔐 WhatsApp authenticated');
            this.status = 'connecting';
            this.refreshChats();
        });

        // Auth failure
        this.client.on('auth_failure', (msg: string) => {
            console.error('❌ WhatsApp auth failure:', msg);
            this.status = 'disconnected';
        });

        // Disconnected
        this.client.on('disconnected', (reason: string) => {
            console.log('📱 WhatsApp disconnected:', reason);
            this.status = 'disconnected';
            this.qrCode = null;
            this.stopScheduler();
        });

        try {
            await this.client.initialize();
        } catch (error: any) {
            console.error('❌ WhatsApp init error:', error.message);
            this.status = 'disconnected';
        }
    }

    // ── Status & QR ─────────────────────────────────────────────

    getStatus(): { status: string; qr: string | null } {
        return {
            status: this.status,
            qr: this.status === 'qr' ? this.qrCode : null,
        };
    }

    getQR(): string | null {
        return this.qrCode;
    }

    isConnected(): boolean {
        return this.status === 'connected';
    }

    // ── Contacts & Chats ────────────────────────────────────────

    private chatsCache: { id: string; name: string; isGroup: boolean }[] | null = null;
    private isFetchingChats = false;

    async refreshChats(): Promise<void> {
        if (this.isFetchingChats || !this.client || !this.isConnected()) return;

        this.isFetchingChats = true;
        console.log('🔄 Refreshing chats...');

        try {
            const chats = await this.client.getChats();
            this.chatsCache = chats
                .filter((chat: Chat) => chat.name && chat.name.trim() !== '')
                .map((chat: Chat) => ({
                    id: chat.id._serialized,
                    name: chat.name,
                    isGroup: chat.isGroup,
                }))
                .sort((a, b) => a.name.localeCompare(b.name));

            console.log(`✅ Cached ${this.chatsCache.length} chats`);
        } catch (error: any) {
            console.error('❌ Error refreshing chats:', error.message);
        } finally {
            this.isFetchingChats = false;
        }
    }

    async getChats(): Promise<{ id: string; name: string; isGroup: boolean }[]> {
        if (!this.client || !this.isConnected()) return [];

        // Return cache if available
        if (this.chatsCache) {
            return this.chatsCache;
        }

        // If no cache, try to fetch with timeout
        if (!this.isFetchingChats) {
            this.refreshChats(); // Background fetch
        }

        // Wait for initial fetch (max 10s on Railway where Chrome is slower)
        let retries = 0;
        while (this.isFetchingChats && retries < 20) {
            await this.delay(500);
            if (this.chatsCache) return this.chatsCache;
            retries++;
        }

        return this.chatsCache || [];
    }

    // ── Message Sending ─────────────────────────────────────────

    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private getRandomDelay(): number {
        return 3000 + Math.random() * 2000; // 3-5 seconds
    }

    // ── Audio Conversion (WebM → OGG/Opus) ──────────────────────
    //
    // WhatsApp Web rechaza audio/webm internamente (error minificado "t").
    // Requiere audio/ogg con codec Opus. El contenido de audio es el mismo
    // codec (Opus), solo cambia el contenedor: WebM → OGG.
    //
    // Ref: whatsapp-web.js issues #5683, #3831
    //
    private async convertToOgg(inputPath: string): Promise<string> {
        const ext = path.extname(inputPath).toLowerCase();
        if (ext === '.ogg') return inputPath; // Ya es OGG, no convertir

        const outputPath = inputPath.replace(/\.[^.]+$/, '.ogg');
        console.log(`🔄 Converting ${path.basename(inputPath)} → OGG/Opus...`);

        try {
            await execFileAsync('ffmpeg', [
                '-i', inputPath,          // Input
                '-vn',                     // Sin video
                '-acodec', 'libopus',      // Codec Opus
                '-b:a', '128k',            // Bitrate
                '-ar', '48000',            // Sample rate (Opus standard)
                '-ac', '1',                // Mono (WhatsApp voice notes)
                '-y',                      // Overwrite
                outputPath,
            ]);

            const sizeMB = fs.statSync(outputPath).size / (1024 * 1024);
            console.log(`✅ Converted to OGG: ${path.basename(outputPath)} (${sizeMB.toFixed(2)} MB)`);
            return outputPath;
        } catch (error: any) {
            console.error('❌ ffmpeg conversion error:', error.stderr || error.message);
            throw new Error(`Error al convertir audio: ${error.stderr || error.message}`);
        }
    }

    async sendTextMessage(chatId: string, text: string): Promise<boolean> {
        if (!this.client || !this.isConnected()) {
            throw new Error('WhatsApp not connected');
        }

        try {
            const chat = await this.client.getChatById(chatId);

            // Simulate typing for natural behavior
            await chat.sendStateTyping();
            await this.delay(1000 + Math.random() * 1000);

            await chat.sendMessage(text);
            console.log(`✅ Message sent to ${chat.name}`);
            return true;
        } catch (error: any) {
            console.error(`❌ Error sending to ${chatId}:`, error.message);
            throw error;
        }
    }

    async sendMediaMessage(chatId: string, filePath: string, caption?: string, isAudio: boolean = false): Promise<boolean> {
        if (!this.client || !this.isConnected()) {
            throw new Error('WhatsApp no está conectado');
        }

        // Validate file exists
        if (!fs.existsSync(filePath)) {
            throw new Error(`Archivo no encontrado: ${filePath}`);
        }

        const fileSizeMB = fs.statSync(filePath).size / (1024 * 1024);
        const fileName = path.basename(filePath);
        console.log(`📎 Preparing media: ${fileName} (${fileSizeMB.toFixed(2)} MB) [audio=${isAudio}]`);

        let convertedPath: string | null = null;

        try {
            let mediaPath = filePath;

            // ── Audio conversion: WebM → OGG/Opus ──
            // WhatsApp Web requiere OGG/Opus para audio.
            // El browser MediaRecorder produce WebM/Opus.
            // Mismo codec, distinto contenedor → ffmpeg re-mux.
            if (isAudio) {
                const ext = path.extname(filePath).toLowerCase();
                if (ext === '.webm' || ext === '.wav' || ext === '.mp3') {
                    mediaPath = await this.convertToOgg(filePath);
                    if (mediaPath !== filePath) {
                        convertedPath = mediaPath; // Track for cleanup
                    }
                }
            }

            const chat = await this.client.getChatById(chatId);

            // Simulate typing
            await chat.sendStateTyping();
            await this.delay(1000 + Math.random() * 1000);

            const media = MessageMedia.fromFilePath(mediaPath);

            // sendAudioAsVoice: true → aparece como nota de voz nativa
            const options: any = {};
            if (isAudio) {
                options.sendAudioAsVoice = true;
            }
            if (caption) {
                options.caption = caption;
            }

            await chat.sendMessage(media, options);
            console.log(`✅ Media sent to ${chat.name} [${isAudio ? 'voice note' : 'file'}]`);
            return true;
        } catch (error: any) {
            const errorMsg = error.message || error.toString() || 'Error desconocido';
            console.error(`❌ Error sending media to ${chatId}:`, errorMsg);
            if (error.stack) console.error('Stack:', error.stack);
            throw new Error(`Error al enviar media: ${errorMsg}`);
        } finally {
            // Cleanup: eliminar archivo OGG temporal
            if (convertedPath && fs.existsSync(convertedPath)) {
                try {
                    fs.unlinkSync(convertedPath);
                    console.log(`🧹 Cleaned up temp file: ${path.basename(convertedPath)}`);
                } catch { }
            }
        }
    }

    // ── Send a Scheduled Message ────────────────────────────────

    private async sendScheduledMessage(msg: IScheduledMessage): Promise<void> {
        try {
            if (msg.messageType === 'text' && msg.textContent) {
                await this.sendTextMessage(msg.chatId, msg.textContent);
            } else if ((msg.messageType === 'audio' || msg.messageType === 'file') && msg.filePath) {
                const isAudio = msg.messageType === 'audio';
                await this.sendMediaMessage(msg.chatId, msg.filePath, msg.textContent, isAudio);
            } else {
                throw new Error('Configuración de mensaje inválida');
            }

            // Mark as sent
            msg.status = 'sent';
            msg.sentAt = new Date();
            msg.error = undefined;
            await msg.save();

            console.log(`✅ Scheduled message sent: ${msg.chatName} (${msg.messageType})`);
        } catch (error: any) {
            const errorMsg = error.message || error.toString() || 'Error desconocido';
            msg.retryCount += 1;
            msg.error = errorMsg;

            if (msg.retryCount >= 3) {
                msg.status = 'failed';
                console.error(`❌ Message permanently failed after 3 retries: ${msg.chatName} — ${errorMsg}`);
            } else {
                console.warn(`⚠️ Retry ${msg.retryCount}/3 for ${msg.chatName}: ${errorMsg}`);
            }

            await msg.save();
        }
    }

    // ── Manual Retry ────────────────────────────────────────────

    async retryMessage(messageId: string): Promise<{ success: boolean; error?: string }> {
        const msg = await ScheduledMessage.findById(messageId);
        if (!msg) return { success: false, error: 'Mensaje no encontrado' };

        if (!this.isConnected()) return { success: false, error: 'WhatsApp no está conectado' };

        // Reset for retry
        msg.status = 'pending';
        msg.retryCount = 0;
        msg.error = undefined;
        await msg.save();

        // Attempt to send now
        await this.sendScheduledMessage(msg);

        // Re-fetch to get updated status
        const updated = await ScheduledMessage.findById(messageId);
        return {
            success: updated?.status === 'sent',
            error: updated?.error || undefined,
        };
    }

    // ── Generate Next Recurring Instance ────────────────────────

    private async generateNextRecurringInstance(msg: IScheduledMessage): Promise<void> {
        if (!msg.isRecurring || !msg.cronPattern) return;

        try {
            // Parse cron to find next execution time
            const nextDate = this.getNextCronDate(msg.cronPattern);
            if (!nextDate) return;

            const newMsg = new ScheduledMessage({
                chatId: msg.chatId,
                chatName: msg.chatName,
                isGroup: msg.isGroup,
                messageType: msg.messageType,
                textContent: msg.textContent,
                filePath: msg.filePath,
                fileName: msg.fileName,
                scheduledAt: nextDate,
                status: 'pending',
                retryCount: 0,
                isRecurring: true,
                cronPattern: msg.cronPattern,
                recurringLabel: msg.recurringLabel,
                parentId: msg.parentId || msg._id,
            });

            await newMsg.save();
            console.log(`🔄 Next recurring instance created for ${msg.chatName}: ${nextDate}`);
        } catch (error: any) {
            console.error('Error creating recurring instance:', error.message);
        }
    }

    private getNextCronDate(cronPattern: string): Date | null {
        try {
            // Simple cron parser: use node-cron validation + manual calculation
            // Format: minute hour dayOfMonth month dayOfWeek
            const parts = cronPattern.split(' ');
            if (parts.length !== 5) return null;

            const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
            const now = new Date();
            const next = new Date();

            // Set the time
            next.setSeconds(0);
            next.setMilliseconds(0);
            if (minute !== '*') next.setMinutes(parseInt(minute));
            if (hour !== '*') next.setHours(parseInt(hour));

            // Handle day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
            if (dayOfWeek !== '*') {
                const targetDay = parseInt(dayOfWeek);
                const currentDay = now.getDay();
                let daysUntil = targetDay - currentDay;
                if (daysUntil <= 0) daysUntil += 7;
                next.setDate(now.getDate() + daysUntil);
            } else if (dayOfMonth !== '*') {
                const targetDate = parseInt(dayOfMonth);
                next.setDate(targetDate);
                if (next <= now) {
                    next.setMonth(next.getMonth() + 1);
                }
            } else {
                // Daily: just move to tomorrow if time has passed
                if (next <= now) {
                    next.setDate(next.getDate() + 1);
                }
            }

            // Final check: if still in past, skip
            if (next <= now) {
                next.setDate(next.getDate() + 7); // Jump a week for weekly
            }

            return next;
        } catch {
            return null;
        }
    }

    // ── Scheduler (runs every minute) ───────────────────────────

    startScheduler(): void {
        if (this.schedulerJob) return;

        console.log('⏰ WhatsApp scheduler started');

        this.schedulerJob = cron.schedule('* * * * *', async () => {
            if (!this.isConnected()) return;

            try {
                const now = new Date();
                const pendingMessages = await ScheduledMessage.find({
                    status: 'pending',
                    scheduledAt: { $lte: now },
                }).sort({ scheduledAt: 1 });

                if (pendingMessages.length === 0) return;

                console.log(`📤 Processing ${pendingMessages.length} pending message(s)...`);

                for (const msg of pendingMessages) {
                    await this.sendScheduledMessage(msg);

                    // If recurring and successfully sent, create next instance
                    if (msg.status === 'sent' && msg.isRecurring) {
                        await this.generateNextRecurringInstance(msg);
                    }

                    // Anti-ban delay between messages
                    if (pendingMessages.indexOf(msg) < pendingMessages.length - 1) {
                        await this.delay(this.getRandomDelay());
                    }
                }
            } catch (error: any) {
                console.error('Scheduler error:', error.message);
            }
        });
    }

    stopScheduler(): void {
        if (this.schedulerJob) {
            this.schedulerJob.stop();
            this.schedulerJob = null;
            console.log('⏰ WhatsApp scheduler stopped');
        }
    }

    // ── Cleanup ─────────────────────────────────────────────────

    async destroy(): Promise<void> {
        this.stopScheduler();
        if (this.client) {
            try {
                await this.client.destroy();
            } catch { }
            this.client = null;
        }
        this.status = 'disconnected';
    }
}

// Singleton instance
export const whatsappService = new WhatsAppService();
