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
// WhatsApp Tenant — Connection, Sending, Scheduling per User
// ============================================================

export class WhatsAppTenant {
    public client: Client | null = null;
    private qrCode: string | null = null;
    private status: 'disconnected' | 'qr' | 'connecting' | 'connected' = 'disconnected';
    private schedulerJob: cron.ScheduledTask | null = null;
    public readonly userId: string;

    // ── Session Persistence State ────────────────────────────────
    private reconnectAttempts = 0;
    private readonly MAX_RECONNECT_ATTEMPTS = 10;
    private isReconnecting = false;
    private keepAliveInterval: NodeJS.Timeout | null = null;
    private connectedSince: Date | null = null;
    private totalReconnects = 0;
    private preventiveRestartJob: cron.ScheduledTask | null = null;
    private lastPreventiveRestart: Date | null = null;

    constructor(userId: string) {
        this.userId = userId;
    }

    public async getContactProfilePic(contactId: string): Promise<string | null> {
        if (!this.client || !this.isConnected()) return null;
        try {
            const url = await this.client.getProfilePicUrl(contactId);
            return url || null;
        } catch (error: any) {
            console.error(`[User ${this.userId}] Error fetching profile pic for ${contactId}:`, error.message);
            return null;
        }
    }

    // ── Initialization ──────────────────────────────────────────

    async initialize(): Promise<void> {
        if (this.status !== 'disconnected') {
            return;
        }
        this.status = 'connecting';
        console.log(`📱 [User ${this.userId}] Initializing WhatsApp client...`);

        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: path.join(__dirname, '../../wa-sessions', this.userId),
            }),
            // ── Memory optimization ──────────────────────────────────
            webVersionCache: {
                type: 'none',
            },
            puppeteer: {
                headless: true,
                protocolTimeout: 300000,
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-extensions',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-features=IsolateOrigins,site-per-process',
                    '--disable-site-isolation-trials',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-ipc-flooding-protection',
                    '--disable-component-update',
                    '--js-flags=--max-old-space-size=256',
                    '--renderer-process-limit=1',
                    '--disable-accelerated-2d-canvas',
                ],
            },
        });

        // QR event
        this.client.on('qr', async (qr: string) => {
            console.log(`📱 [User ${this.userId}] QR code received`);
            this.status = 'qr';
            try {
                this.qrCode = await QRCode.toDataURL(qr, { width: 300 });
            } catch (err) {
                console.error(`[User ${this.userId}] QR generation error:`, err);
            }
        });

        // Ready event
        this.client.on('ready', () => {
            console.log(`✅ [User ${this.userId}] WhatsApp client ready!`);
            this.status = 'connected';
            this.qrCode = null;
            this.reconnectAttempts = 0;
            this.isReconnecting = false;
            this.connectedSince = new Date();
            this.startKeepAlive();
            this.startPreventiveRestart();
            this.startScheduler();
            this.refreshChats();
        });

        // Authenticated event
        this.client.on('authenticated', () => {
            console.log(`🔐 [User ${this.userId}] WhatsApp authenticated`);
            this.status = 'connecting';
            this.refreshChats();
        });

        // Auth failure
        this.client.on('auth_failure', (msg: string) => {
            console.error(`❌ [User ${this.userId}] WhatsApp auth failure:`, msg);
            this.status = 'disconnected';
            this.deleteSessionData();
        });

        // Disconnected — trigger auto-reconnect
        this.client.on('disconnected', (reason: string) => {
            console.warn(`⚠️ [User ${this.userId}] WhatsApp disconnected:`, reason);
            this.status = 'disconnected';
            this.qrCode = null;
            this.connectedSince = null;
            this.stopKeepAlive();
            this.stopScheduler();

            if (reason === 'NAVIGATION' || reason === 'LOGOUT' || reason.toLowerCase().includes('logout')) {
                this.deleteSessionData();
            }

            this.attemptReconnect(reason);
        });

        // State change
        this.client.on('change_state', (state: string) => {
            console.log(`📱 [User ${this.userId}] WhatsApp state changed:`, state);
            if (state === 'CONFLICT' || state === 'UNLAUNCHED' || state === 'UNPAIRED') {
                console.warn(`⚠️ [User ${this.userId}] Problematic state detected: ${state} — triggering reconnect`);
                this.stopKeepAlive();
                this.stopScheduler();
                if (state === 'UNPAIRED') this.deleteSessionData();
                this.attemptReconnect(state);
            }
        });

        try {
            await this.client.initialize();
        } catch (error: any) {
            console.error(`❌ [User ${this.userId}] WhatsApp init error:`, error.message);
            this.status = 'disconnected';
        }
    }

    // ── Session Cleanup ─────────────────────────────────────────

    public deleteSessionData() {
        const sessionPath = path.join(__dirname, '../../wa-sessions', this.userId);
        if (fs.existsSync(sessionPath)) {
            try {
                fs.rmSync(sessionPath, { recursive: true, force: true });
                console.log(`🗑️ [User ${this.userId}] Local session data cleared.`);
            } catch (err) {
                console.error(`❌ [User ${this.userId}] Failed to clear session data:`, err);
            }
        }
    }

    public async resetSession(): Promise<void> {
        console.log(`♻️ [User ${this.userId}] Forcing session reset...`);
        this.stopPreventiveRestart();
        this.stopKeepAlive();
        this.stopScheduler();
        if (this.client) {
            try { await this.client.destroy(); } catch (err) { }
            this.client = null;
        }
        this.status = 'disconnected';
        this.connectedSince = null;
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        this.deleteSessionData();

        // Wait a bit before forcing re-init
        await new Promise(resolve => setTimeout(resolve, 3000));
        await this.initialize();
    }

    // ── Status & QR ─────────────────────────────────────────────

    getStatus(): { status: string; qr: string | null } {
        // Auto-initialize if someone asks for status and we are fully disconnected
        if (this.status === 'disconnected') {
            this.initialize().catch(err => console.error(err));
        }

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

    private chatsCache: { id: string; name: string; isGroup: boolean; timestamp: number }[] | null = null;
    private isFetchingChats = false;

    async refreshChats(): Promise<void> {
        if (this.isFetchingChats || !this.client || !this.isConnected()) return;

        this.isFetchingChats = true;
        console.log(`🔄 [User ${this.userId}] Refreshing contacts...`);

        try {
            // Use getContacts to get the full address book instead of just active chats
            const contacts = await this.client.getContacts();
            console.log(`📡 [User ${this.userId}] RAW contacts fetched: ${contacts.length}`);

            const mapped = contacts
                // Exclude status updates
                .filter(contact => contact.id._serialized !== 'status@broadcast')
                // Require them to be a saved contact, a group, o...
                .filter(contact => contact.isMyContact || contact.isGroup || (contact.name && contact.name.trim() !== '') || (contact.pushname && contact.pushname.trim() !== ''))
                .map(contact => ({
                    id: contact.id._serialized,
                    name: contact.name || contact.pushname || contact.number || 'Desconocido',
                    isGroup: contact.isGroup,
                    timestamp: 0, // Contacts don't have a recent timestamp like chats
                }))
                .filter(c => c.name !== 'Desconocido')
                // Sort alphabetically
                .sort((a, b) => a.name.localeCompare(b.name));

            console.log(`🔍 [User ${this.userId}] Filtered mapped contacts: ${mapped.length}`);

            if (mapped.length > 0) {
                this.chatsCache = mapped;
                console.log(`✅ [User ${this.userId}] Cached ${this.chatsCache.length} contacts/groups`);
            } else {
                console.log(`⚠️ [User ${this.userId}] No contacts returned by WhatsApp client.`);
            }
        } catch (error: any) {
            console.error(`❌ [User ${this.userId}] Error refreshing contacts:`, error.message);
        } finally {
            this.isFetchingChats = false;
        }
    }

    async getChats(limit: number = 50, search?: string): Promise<{ id: string; name: string; isGroup: boolean }[]> {
        if (!this.client || !this.isConnected()) return [];

        if (!this.chatsCache || this.chatsCache.length === 0) {
            if (!this.isFetchingChats) this.refreshChats();
            let retries = 0;
            // Wait up to 60 seconds for massive contact histories
            while (this.isFetchingChats && retries < 60) {
                await this.delay(1000);
                if (this.chatsCache && this.chatsCache.length > 0) break;
                retries++;
            }
        }

        let results = this.chatsCache || [];

        if (search) {
            const lowerSearch = search.toLowerCase();
            results = results.filter(c => c.name.toLowerCase().includes(lowerSearch));
        }

        return results.slice(0, limit);
    }

    // ── Message Sending ─────────────────────────────────────────

    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private getRandomDelay(): number {
        return 3000 + Math.random() * 2000;
    }

    private async convertToOgg(inputPath: string): Promise<string> {
        const ext = path.extname(inputPath).toLowerCase();
        if (ext === '.ogg') return inputPath;

        const outputPath = inputPath.replace(/\.[^.]+$/, '.ogg');
        console.log(`🔄 [User ${this.userId}] Converting ${path.basename(inputPath)} → OGG/Opus...`);

        try {
            await execFileAsync('ffmpeg', [
                '-i', inputPath,
                '-vn',
                '-acodec', 'libopus',
                '-b:a', '128k',
                '-ar', '48000',
                '-ac', '1',
                '-y',
                outputPath,
            ]);
            return outputPath;
        } catch (error: any) {
            throw new Error(`Error al convertir audio: ${error.stderr || error.message}`);
        }
    }

    async sendTextMessage(chatId: string, text: string): Promise<boolean> {
        if (!this.client || !this.isConnected()) throw new Error('WhatsApp not connected');

        try {
            const chat = await this.client.getChatById(chatId);
            await chat.sendStateTyping();
            await this.delay(1000 + Math.random() * 1000);

            await chat.sendMessage(text);
            console.log(`✅ [User ${this.userId}] Message sent to ${chat.name}`);
            return true;
        } catch (error: any) {
            console.error(`❌ [User ${this.userId}] Error sending to ${chatId}:`, error.message);
            throw error;
        }
    }

    async sendMediaMessage(chatId: string, filePath: string, caption?: string, isAudio: boolean = false): Promise<boolean> {
        if (!this.client || !this.isConnected()) throw new Error('WhatsApp no está conectado');
        if (!fs.existsSync(filePath)) throw new Error(`Archivo no encontrado: ${filePath}`);

        let convertedPath: string | null = null;
        try {
            let mediaPath = filePath;
            if (isAudio) {
                const ext = path.extname(filePath).toLowerCase();
                if (ext === '.webm' || ext === '.wav' || ext === '.mp3') {
                    mediaPath = await this.convertToOgg(filePath);
                    if (mediaPath !== filePath) convertedPath = mediaPath;
                }
            }

            const chat = await this.client.getChatById(chatId);
            await chat.sendStateTyping();
            await this.delay(1000 + Math.random() * 1000);

            const media = MessageMedia.fromFilePath(mediaPath);
            const options: any = {};
            if (isAudio) options.sendAudioAsVoice = true;
            if (caption) options.caption = caption;

            await chat.sendMessage(media, options);
            console.log(`✅ [User ${this.userId}] Media sent to ${chat.name} [${isAudio ? 'voice' : 'file'}]`);
            return true;
        } catch (error: any) {
            const errorMsg = error.message || error.toString() || 'Error desconocido';
            throw new Error(`Error al enviar media: ${errorMsg}`);
        } finally {
            if (convertedPath && fs.existsSync(convertedPath)) {
                try { fs.unlinkSync(convertedPath); } catch { }
            }
        }
    }

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

            msg.status = 'sent';
            msg.sentAt = new Date();
            msg.error = undefined;
            await msg.save();
        } catch (error: any) {
            const errorMsg = error.message || error.toString() || 'Error desconocido';
            msg.retryCount += 1;
            msg.error = errorMsg;

            if (msg.retryCount >= 3) {
                msg.status = 'failed';
            }
            await msg.save();
        }
    }

    async retryMessage(messageId: string): Promise<{ success: boolean; error?: string }> {
        const msg = await ScheduledMessage.findOne({ _id: messageId, userId: this.userId });
        if (!msg) return { success: false, error: 'Mensaje no encontrado' };
        if (!this.isConnected()) return { success: false, error: 'WhatsApp no está conectado' };

        msg.status = 'pending';
        msg.retryCount = 0;
        msg.error = undefined;
        await msg.save();

        await this.sendScheduledMessage(msg);

        const updated = await ScheduledMessage.findById(messageId);
        return {
            success: updated?.status === 'sent',
            error: updated?.error || undefined,
        };
    }

    private async generateNextRecurringInstance(msg: IScheduledMessage): Promise<void> {
        if (!msg.isRecurring || !msg.cronPattern) return;
        try {
            const nextDate = this.getNextCronDate(msg.cronPattern);
            if (!nextDate) return;

            const newMsg = new ScheduledMessage({
                userId: this.userId,
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
        } catch (error: any) {
            console.error(`[User ${this.userId}] Error creating recurring instance:`, error.message);
        }
    }

    private getNextCronDate(cronPattern: string): Date | null {
        try {
            const parts = cronPattern.split(' ');
            if (parts.length !== 5) return null;
            const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
            const now = new Date();
            const next = new Date();
            next.setSeconds(0);
            next.setMilliseconds(0);
            if (minute !== '*') next.setMinutes(parseInt(minute));
            if (hour !== '*') next.setHours(parseInt(hour));
            if (dayOfWeek !== '*') {
                const targetDay = parseInt(dayOfWeek);
                const currentDay = now.getDay();
                let daysUntil = targetDay - currentDay;
                if (daysUntil <= 0) daysUntil += 7;
                next.setDate(now.getDate() + daysUntil);
            } else if (dayOfMonth !== '*') {
                const targetDate = parseInt(dayOfMonth);
                next.setDate(targetDate);
                if (next <= now) next.setMonth(next.getMonth() + 1);
            } else {
                if (next <= now) next.setDate(next.getDate() + 1);
            }
            if (next <= now) next.setDate(next.getDate() + 7);
            return next;
        } catch {
            return null;
        }
    }

    // ── Scheduler (runs every minute) ───────────────────────────

    startScheduler(): void {
        if (this.schedulerJob) return;
        console.log(`⏰ [User ${this.userId}] WhatsApp scheduler started`);

        this.schedulerJob = cron.schedule('* * * * *', async () => {
            if (!this.isConnected()) return;
            try {
                const now = new Date();
                const pendingMessages = await ScheduledMessage.find({
                    userId: this.userId,
                    status: 'pending',
                    scheduledAt: { $lte: now },
                }).sort({ scheduledAt: 1 });

                if (pendingMessages.length === 0) return;

                console.log(`📤 [User ${this.userId}] Processing ${pendingMessages.length} pending message(s)...`);
                for (let i = 0; i < pendingMessages.length; i++) {
                    const msg = pendingMessages[i];
                    await this.sendScheduledMessage(msg);
                    if (msg.status === 'sent' && msg.isRecurring) {
                        await this.generateNextRecurringInstance(msg);
                    }
                    if (i < pendingMessages.length - 1) {
                        await this.delay(this.getRandomDelay());
                    }
                }
            } catch (error: any) {
                console.error(`[User ${this.userId}] Scheduler error:`, error.message);
            }
        });
    }

    stopScheduler(): void {
        if (this.schedulerJob) {
            this.schedulerJob.stop();
            this.schedulerJob = null;
        }
    }

    // ── Auto-Reconnect with Exponential Backoff ─────────────────

    private async attemptReconnect(reason: string): Promise<void> {
        if (this.isReconnecting) return;
        if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
            console.error(`🔴 [User ${this.userId}] Max reconnect attempts reached. Manual restart required.`);
            return;
        }
        this.isReconnecting = true;
        this.reconnectAttempts++;
        this.totalReconnects++;

        const backoffDelay = Math.min(5000 * Math.pow(2, this.reconnectAttempts - 1), 300000);
        console.log(`🔄 [User ${this.userId}] Reconnect ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS} in ${backoffDelay / 1000}s (${reason})`);

        await this.delay(backoffDelay);

        if (this.client) {
            try { await this.client.destroy(); } catch (err) { }
            this.client = null;
        }

        this.status = 'disconnected'; // explicitly reset
        this.isReconnecting = false;  // release lock before calling initialize which checks it

        try {
            await this.initialize();
        } catch (err: any) {
            console.error(`❌ [User ${this.userId}] Reconnect initialization failed:`, err.message);
        }
    }

    // ── Keep-Alive Heartbeat ─────────────────────────────────────

    private startKeepAlive(): void {
        this.stopKeepAlive();
        this.keepAliveInterval = setInterval(async () => {
            if (!this.client || this.status !== 'connected') return;
            try {
                const state = await this.client.getState();
                if (state !== 'CONNECTED') {
                    this.stopKeepAlive();
                    this.status = 'disconnected';
                    this.connectedSince = null;
                    this.stopScheduler();
                    this.attemptReconnect(`heartbeat_state_${state}`);
                    return;
                }
                const page = (this.client as any).pupPage;
                if (page) {
                    await page.evaluate(() => { document.title; window.scrollY; });
                }
            } catch (err: any) {
                if (err.message?.includes('Protocol error') || err.message?.includes('Target closed') || err.message?.includes('Execution context was destroyed')) {
                    this.stopKeepAlive();
                    this.status = 'disconnected';
                    this.connectedSince = null;
                    this.stopScheduler();
                    this.attemptReconnect('heartbeat_error');
                }
            }
        }, 30000);
    }

    private stopKeepAlive(): void {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }

    // ── Preventive Restart ──────────────────────────────────────

    private startPreventiveRestart(): void {
        this.stopPreventiveRestart();
        // Add a random offset so all tenants don't restart at exactly 4:00 AM
        const randomMinute = Math.floor(Math.random() * 59);
        this.preventiveRestartJob = cron.schedule(`${randomMinute} 4 * * *`, async () => {
            try {
                const soonMessages = await ScheduledMessage.countDocuments({
                    userId: this.userId,
                    status: 'pending',
                    scheduledAt: { $lte: new Date(Date.now() + 5 * 60 * 1000) },
                });
                if (soonMessages > 0) {
                    setTimeout(() => this.doPreventiveRestart(), 10 * 60 * 1000);
                    return;
                }
            } catch (err) { }
            await this.doPreventiveRestart();
        });
    }

    private async doPreventiveRestart(): Promise<void> {
        this.stopKeepAlive();
        this.stopScheduler();
        if (this.client) {
            try { await this.client.destroy(); } catch (err) { }
            this.client = null;
        }
        this.status = 'disconnected';
        this.connectedSince = null;
        this.lastPreventiveRestart = new Date();
        if (global.gc) global.gc();
        await this.delay(5000);
        try {
            await this.initialize();
        } catch (err: any) {
            this.attemptReconnect('preventive_restart_failed');
        }
    }

    private stopPreventiveRestart(): void {
        if (this.preventiveRestartJob) {
            this.preventiveRestartJob.stop();
            this.preventiveRestartJob = null;
        }
    }

    // ── Health Info & Cleanup ────────────────────────────────────

    getHealthInfo() {
        return {
            status: this.status,
            connectedSince: this.connectedSince?.toISOString() || null,
            uptimeSeconds: this.connectedSince ? Math.floor((new Date().getTime() - this.connectedSince.getTime()) / 1000) : null,
            reconnectAttempts: this.reconnectAttempts,
            totalReconnects: this.totalReconnects,
            isReconnecting: this.isReconnecting,
            keepAliveActive: this.keepAliveInterval !== null,
            schedulerActive: this.schedulerJob !== null,
            lastPreventiveRestart: this.lastPreventiveRestart?.toISOString() || null,
        };
    }

    async destroy(): Promise<void> {
        console.log(`🛑 [User ${this.userId}] Destroying WhatsApp tenant`);
        this.stopPreventiveRestart();
        this.stopKeepAlive();
        this.stopScheduler();
        if (this.client) {
            try { await this.client.destroy(); } catch (err) { }
            this.client = null;
        }
        this.status = 'disconnected';
        this.connectedSince = null;
    }
}

// ============================================================
// WhatsApp Manager — Multi-Tenant Wrapper
// ============================================================

export class WhatsAppManager {
    private tenants = new Map<string, WhatsAppTenant>();

    getTenant(userId: string): WhatsAppTenant {
        if (!this.tenants.has(userId)) {
            const tenant = new WhatsAppTenant(userId);
            this.tenants.set(userId, tenant);
        }
        return this.tenants.get(userId)!;
    }

    async destroyAll(): Promise<void> {
        console.log('🛑 Shutting down all WhatsApp tenants...');
        for (const tenant of this.tenants.values()) {
            await tenant.destroy();
        }
        this.tenants.clear();
    }

    // Health across all active tenants (useful for single /health check)
    getHealthInfo() {
        const mem = process.memoryUsage();
        const activeTenants = Array.from(this.tenants.keys());
        const details: any = {};
        for (const [userId, tenant] of this.tenants.entries()) {
            details[userId] = tenant.getHealthInfo();
        }
        return {
            totalActiveSessions: this.tenants.size,
            activeTenants,
            memory: {
                rss: `${Math.round(mem.rss / 1024 / 1024)}MB`,
                heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
                heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)}MB`,
            },
            tenantDetails: details,
        };
    }

    // Lazy load or auto-load active tenants based on pending DB schedules on startup Server Init
    async initializeActiveTenants(): Promise<void> {
        console.log('🚀 Checking for pending scheduled messages to boot specific users...');
        try {
            const userIdsWithTasks = await ScheduledMessage.distinct('userId', {
                status: 'pending'
            });
            console.log(`📡 Found ${userIdsWithTasks.length} user(s) with pending messages.`);
            for (const userId of userIdsWithTasks) {
                if (userId) {
                    const tenant = this.getTenant(userId.toString());
                    // This kicks off async puppeteer launch, which might take ~10s each
                    tenant.initialize().catch(console.error);
                }
            }
        } catch (error) {
            console.error('❌ Error initializing active WhatsApp tenants:', error);
        }
    }
}

export const whatsappService = new WhatsAppManager();
