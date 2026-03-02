import { Client, LocalAuth, MessageMedia, Chat } from 'whatsapp-web.js';
import * as QRCode from 'qrcode';
import cron from 'node-cron';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ScheduledMessage, IScheduledMessage } from '../models/scheduled-message.model';

const execFileAsync = promisify(execFile);

// Session path: absolute for Railway Volume, relative for local dev
const WA_SESSIONS_DIR = process.env.NODE_ENV === 'production'
    ? '/app/wa-sessions'
    : path.join(__dirname, '../../wa-sessions');

// ============================================================
// WhatsApp Tenant — Connection, Sending, Scheduling per User
// ============================================================

export class WhatsAppTenant {
    public client: Client | null = null;
    private qrCode: string | null = null;
    private status: 'disconnected' | 'qr' | 'connecting' | 'connected' = 'disconnected';
    private schedulerJob: cron.ScheduledTask | null = null;
    public readonly userId: string;
    private isInitializing = false;

    // ── Session Persistence State ────────────────────────────────
    private reconnectAttempts = 0;
    private readonly MAX_RECONNECT_ATTEMPTS = 10;
    private isReconnecting = false;
    private lastReconnectFailTime: Date | null = null;
    private keepAliveInterval: NodeJS.Timeout | null = null;
    private connectedSince: Date | null = null;
    private totalReconnects = 0;
    private preventiveRestartJob: cron.ScheduledTask | null = null;
    private lastPreventiveRestart: Date | null = null;
    private connectingTimeout: NodeJS.Timeout | null = null;

    constructor(userId: string) {
        this.userId = userId;
        // Start the scheduler immediately — it checks isConnected() internally
        this.startScheduler();
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
        if (this.status !== 'disconnected' || this.isInitializing) {
            return;
        }
        this.isInitializing = true;
        this.status = 'connecting';
        console.log(`📱 [User ${this.userId}] Initializing WhatsApp client...`);

        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: path.join(WA_SESSIONS_DIR, this.userId),
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
            // Clear connecting timeout — we made it
            if (this.connectingTimeout) {
                clearTimeout(this.connectingTimeout);
                this.connectingTimeout = null;
            }
            this.status = 'connected';
            this.qrCode = null;
            this.reconnectAttempts = 0;
            this.isReconnecting = false;
            this.isInitializing = false;
            this.connectedSince = new Date();
            this.startKeepAlive();
            this.startPreventiveRestart();
            // Ensure scheduler is running (might have been stopped by reset)
            this.startScheduler();
            this.refreshChats();
        });

        // Authenticated event
        this.client.on('authenticated', () => {
            console.log(`🔐 [User ${this.userId}] WhatsApp authenticated`);
            this.status = 'connecting';
            this.refreshChats();

            // Safety timeout: if `ready` doesn't fire within 2 minutes, force reconnect
            if (this.connectingTimeout) clearTimeout(this.connectingTimeout);
            this.connectingTimeout = setTimeout(async () => {
                if (this.status === 'connecting') {
                    console.warn(`⚠️ [User ${this.userId}] Stuck in 'connecting' for 2min — forcing reconnect`);
                    if (this.client) {
                        try { await this.client.destroy(); } catch { }
                        this.client = null;
                    }
                    this.status = 'disconnected';
                    this.isInitializing = false;
                    this.connectingTimeout = null;
                    this.attemptReconnect('connecting_timeout');
                }
            }, 120_000); // 2 minutes
        });

        // Auth failure
        this.client.on('auth_failure', (msg: string) => {
            console.error(`❌ [User ${this.userId}] WhatsApp auth failure:`, msg);
            this.status = 'disconnected';
            this.isInitializing = false;
            this.deleteSessionData();
        });

        // Disconnected — trigger auto-reconnect
        this.client.on('disconnected', (reason: string) => {
            console.warn(`⚠️ [User ${this.userId}] WhatsApp disconnected:`, reason);
            this.status = 'disconnected';
            this.qrCode = null;
            this.connectedSince = null;
            this.stopKeepAlive();
            // Keep scheduler running — it checks isConnected() internally
            // and will send messages once WA reconnects

            if (reason === 'NAVIGATION' || reason === 'LOGOUT' || reason.toLowerCase().includes('logout')) {
                this.deleteSessionData();
            }

            this.attemptReconnect(reason);
        });

        // State change
        this.client.on('change_state', (state: string) => {
            console.log(`📱 [User ${this.userId}] WhatsApp state changed:`, state);

            if (state === 'CONFLICT') {
                // CONFLICT = WhatsApp Web opened elsewhere temporarily
                // Wait 30s and re-check — usually resolves itself
                console.warn(`⚠️ [User ${this.userId}] CONFLICT detected — waiting 30s for auto-resolution...`);
                setTimeout(async () => {
                    try {
                        if (!this.client) return;
                        const currentState = await this.client.getState();
                        if (currentState !== 'CONNECTED') {
                            console.warn(`⚠️ [User ${this.userId}] Still in bad state (${currentState}) after CONFLICT — reconnecting`);
                            this.stopKeepAlive();
                            this.attemptReconnect('conflict_persistent');
                        } else {
                            console.log(`✅ [User ${this.userId}] CONFLICT resolved — back to CONNECTED`);
                        }
                    } catch { this.attemptReconnect('conflict_check_error'); }
                }, 30000);
            } else if (state === 'UNPAIRED') {
                // UNPAIRED can be a false positive during reconnections
                // Wait 60s and re-check before wiping session
                console.warn(`⚠️ [User ${this.userId}] UNPAIRED detected — waiting 60s to confirm...`);
                setTimeout(async () => {
                    try {
                        if (!this.client) {
                            // Client was already destroyed, session is truly gone
                            this.deleteSessionData();
                            return;
                        }
                        const currentState = await this.client.getState();
                        if (currentState === 'CONNECTED') {
                            console.log(`✅ [User ${this.userId}] UNPAIRED was false positive — back to CONNECTED`);
                            return;
                        }
                        // Confirmed UNPAIRED — delete session and reconnect
                        console.warn(`🔴 [User ${this.userId}] UNPAIRED confirmed after 60s — deleting session`);
                        this.stopKeepAlive();
                        this.deleteSessionData();
                        this.attemptReconnect('unpaired_confirmed');
                    } catch {
                        this.deleteSessionData();
                        this.attemptReconnect('unpaired_check_error');
                    }
                }, 60000);
            } else if (state === 'UNLAUNCHED') {
                console.warn(`⚠️ [User ${this.userId}] UNLAUNCHED — triggering reconnect`);
                this.stopKeepAlive();
                this.attemptReconnect(state);
            }
        });

        try {
            await this.client.initialize();
        } catch (error: any) {
            console.error(`❌ [User ${this.userId}] WhatsApp init error:`, error.message);
            this.status = 'disconnected';
            this.isInitializing = false;
            // Auto-retry initialization instead of dying silently
            this.attemptReconnect('init_failure');
        }
    }

    // ── Session Cleanup ─────────────────────────────────────────

    public deleteSessionData() {
        const sessionPath = path.join(WA_SESSIONS_DIR, this.userId);
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
        if (this.connectingTimeout) { clearTimeout(this.connectingTimeout); this.connectingTimeout = null; }
        if (this.client) {
            try { await this.client.destroy(); } catch (err) { }
            this.client = null;
        }
        this.status = 'disconnected';
        this.connectedSince = null;
        this.isReconnecting = false;
        this.isInitializing = false;
        this.reconnectAttempts = 0;
        this.deleteSessionData();

        // Wait a bit before forcing re-init
        await new Promise(resolve => setTimeout(resolve, 3000));
        await this.initialize();
    }

    // ── Status & QR ─────────────────────────────────────────────

    getStatus(): { status: string; qr: string | null } {
        // Auto-initialize if someone asks for status and we are fully disconnected
        if (this.status === 'disconnected' && !this.isInitializing) {
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

        // If cache is empty, trigger refresh in background but return immediately
        if (!this.chatsCache || this.chatsCache.length === 0) {
            if (!this.isFetchingChats) this.refreshChats();
            return []; // Return empty — frontend will poll again
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

            // Cleanup uploaded file after successful send (only for non-recurring)
            if (msg.filePath && !msg.isRecurring && fs.existsSync(msg.filePath)) {
                try { fs.unlinkSync(msg.filePath); } catch { }
            }
        } catch (error: any) {
            const errorMsg = error.message || error.toString() || 'Error desconocido';
            msg.retryCount += 1;
            msg.error = errorMsg;

            // Detect Puppeteer/connection death errors → immediate reconnect + fast retry
            const isPuppeteerDeath = errorMsg.includes('Protocol error') ||
                errorMsg.includes('Target closed') ||
                errorMsg.includes('Execution context') ||
                errorMsg.includes('Session closed') ||
                errorMsg.includes('not connected');

            if (isPuppeteerDeath && msg.retryCount < 3) {
                console.warn(`⚡ [User ${this.userId}] Puppeteer connection dead — triggering reconnect + fast retry for msg ${msg._id}`);
                await msg.save();

                // Trigger reconnect
                this.status = 'disconnected';
                this.connectedSince = null;
                this.stopKeepAlive();
                this.attemptReconnect('send_puppeteer_death');

                // Wait up to 20s for reconnection
                for (let wait = 0; wait < 20; wait++) {
                    await this.delay(1000);
                    if (this.isConnected()) break;
                }

                // If reconnected, retry immediately
                if (this.isConnected()) {
                    console.log(`⚡ [User ${this.userId}] Reconnected — retrying msg ${msg._id} immediately`);
                    try {
                        if (msg.messageType === 'text' && msg.textContent) {
                            await this.sendTextMessage(msg.chatId, msg.textContent);
                        } else if ((msg.messageType === 'audio' || msg.messageType === 'file') && msg.filePath) {
                            await this.sendMediaMessage(msg.chatId, msg.filePath, msg.textContent, msg.messageType === 'audio');
                        }
                        msg.status = 'sent';
                        msg.sentAt = new Date();
                        msg.error = undefined;
                        await msg.save();
                        if (msg.filePath && !msg.isRecurring && fs.existsSync(msg.filePath)) {
                            try { fs.unlinkSync(msg.filePath); } catch { }
                        }
                        return; // Success on fast retry
                    } catch (retryErr: any) {
                        msg.retryCount += 1;
                        msg.error = retryErr.message || 'Error en reintento rápido';
                        if (msg.retryCount >= 3) msg.status = 'failed';
                        await msg.save();
                    }
                }
                return; // Already saved above
            }

            if (msg.retryCount >= 3) {
                msg.status = 'failed';
                // Cleanup file for permanently failed non-recurring messages
                if (msg.filePath && !msg.isRecurring && fs.existsSync(msg.filePath)) {
                    try { fs.unlinkSync(msg.filePath); } catch { }
                }
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

            // Get current time in Argentina timezone
            const argFormatter = new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/Argentina/Buenos_Aires',
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', hour12: false,
                weekday: 'short',
            });
            const argParts = argFormatter.formatToParts(new Date());
            const getPart = (type: string) => argParts.find(p => p.type === type)?.value || '0';
            const nowArgYear = parseInt(getPart('year'));
            const nowArgMonth = parseInt(getPart('month')) - 1;
            const nowArgDay = parseInt(getPart('day'));
            const nowArgHour = parseInt(getPart('hour'));
            const nowArgMinute = parseInt(getPart('minute'));
            const nowArgWeekday = new Date().toLocaleDateString('en-US', { timeZone: 'America/Argentina/Buenos_Aires', weekday: 'short' });
            const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
            const nowArgDayOfWeek = dayMap[nowArgWeekday] ?? 0;

            // Build the target time in Argentina, then convert to UTC Date
            const targetMinute = minute !== '*' ? parseInt(minute) : nowArgMinute;
            const targetHour = hour !== '*' ? parseInt(hour) : nowArgHour;
            let targetDay = nowArgDay;
            let targetMonth = nowArgMonth;
            let targetYear = nowArgYear;

            if (dayOfWeek !== '*') {
                const targetDayOfWeek = parseInt(dayOfWeek);
                let daysUntil = targetDayOfWeek - nowArgDayOfWeek;
                if (daysUntil < 0) daysUntil += 7;
                if (daysUntil === 0) {
                    // Same day — check if time already passed
                    const nowTimeMinutes = nowArgHour * 60 + nowArgMinute;
                    const targetTimeMinutes = targetHour * 60 + targetMinute;
                    if (targetTimeMinutes <= nowTimeMinutes) daysUntil = 7;
                }
                targetDay += daysUntil;
            } else if (dayOfMonth !== '*') {
                targetDay = parseInt(dayOfMonth);
                // If the target day already passed this month
                const nowTimeMinutes = nowArgHour * 60 + nowArgMinute;
                const targetTimeMinutes = targetHour * 60 + targetMinute;
                if (targetDay < nowArgDay || (targetDay === nowArgDay && targetTimeMinutes <= nowTimeMinutes)) {
                    targetMonth += 1;
                    if (targetMonth > 11) { targetMonth = 0; targetYear += 1; }
                }
            } else {
                // Daily — if today's time passed, go to tomorrow
                const nowTimeMinutes = nowArgHour * 60 + nowArgMinute;
                const targetTimeMinutes = targetHour * 60 + targetMinute;
                if (targetTimeMinutes <= nowTimeMinutes) targetDay += 1;
            }

            // Construct the date string in Argentina timezone and parse it
            // Using a workaround: create date in UTC then adjust for Argentina offset (-3)
            const argDate = new Date(targetYear, targetMonth, targetDay, targetHour, targetMinute, 0, 0);
            // Convert from Argentina time to UTC by adding 3 hours
            const utcDate = new Date(argDate.getTime() + 3 * 60 * 60 * 1000);

            // Safety check: if somehow still in the past, skip ahead
            if (utcDate <= new Date()) {
                if (dayOfWeek !== '*') utcDate.setDate(utcDate.getDate() + 7);
                else utcDate.setDate(utcDate.getDate() + 1);
            }

            return utcDate;
        } catch {
            return null;
        }
    }

    // ── Scheduler (runs every minute) ───────────────────────────

    startScheduler(): void {
        if (this.schedulerJob) return;
        console.log(`⏰ [User ${this.userId}] WhatsApp scheduler started (runs independently of WA connection)`);
        console.log(`⏰ [User ${this.userId}] Server timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}, UTC offset: ${new Date().getTimezoneOffset()}min`);

        this.schedulerJob = cron.schedule('* * * * *', async () => {
            try {
                const now = new Date();
                const pendingMessages = await ScheduledMessage.find({
                    userId: this.userId,
                    status: 'pending',
                    scheduledAt: { $lte: now },
                }).sort({ scheduledAt: 1 });

                if (pendingMessages.length === 0) return;

                // Check if WA is connected before trying to send
                if (!this.isConnected()) {
                    console.warn(`⏰ [User ${this.userId}] ${pendingMessages.length} message(s) ready to send but WhatsApp is NOT connected (status: ${this.status}). Will retry next minute.`);
                    return;
                }

                console.log(`📤 [User ${this.userId}] Processing ${pendingMessages.length} pending message(s)...`);
                for (let i = 0; i < pendingMessages.length; i++) {
                    const msg = pendingMessages[i];
                    console.log(`📤 [User ${this.userId}] Sending scheduled msg ${msg._id} to ${msg.chatName} (scheduled: ${msg.scheduledAt.toISOString()}, now: ${now.toISOString()})`);
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
            // Cooldown reset: after 30 minutes, reset counter and try again
            if (!this.lastReconnectFailTime) {
                this.lastReconnectFailTime = new Date();
                console.error(`🔴 [User ${this.userId}] Max reconnect attempts reached. Will retry after cooldown.`);
                setTimeout(() => {
                    console.log(`🔄 [User ${this.userId}] Cooldown expired — resetting reconnect counter.`);
                    this.reconnectAttempts = 0;
                    this.lastReconnectFailTime = null;
                    this.attemptReconnect('cooldown_reset');
                }, 30 * 60 * 1000); // 30 minutes
            }
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
        this.isInitializing = false;  // reset to allow re-initialization
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
                    // DO NOT stop scheduler — it will resume sending once reconnected
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
                    // DO NOT stop scheduler — it will resume sending once reconnected
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
        console.log(`🔄 [User ${this.userId}] Starting preventive restart...`);
        this.stopKeepAlive();
        // DO NOT stop scheduler — keep it running to send messages after restart

        // Give Puppeteer time to flush session data to disk (Railway Volume)
        await this.delay(3000);

        if (this.client) {
            try { await this.client.destroy(); } catch (err) { }
            this.client = null;
        }
        this.status = 'disconnected';
        this.isInitializing = false;
        this.connectedSince = null;
        this.lastPreventiveRestart = new Date();
        if (global.gc) global.gc();

        // Longer delay to let filesystem sync to volume
        await this.delay(8000);
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

    async getSchedulerDiagnostics() {
        const now = new Date();
        const pendingCount = await ScheduledMessage.countDocuments({
            userId: this.userId,
            status: 'pending',
        });
        const readyToSend = await ScheduledMessage.countDocuments({
            userId: this.userId,
            status: 'pending',
            scheduledAt: { $lte: now },
        });
        const nextMessage = await ScheduledMessage.findOne({
            userId: this.userId,
            status: 'pending',
        }).sort({ scheduledAt: 1 }).select('scheduledAt chatName messageType');

        return {
            serverTime: now.toISOString(),
            serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            utcOffset: now.getTimezoneOffset(),
            schedulerActive: this.schedulerJob !== null,
            whatsappConnected: this.isConnected(),
            whatsappStatus: this.status,
            pendingMessages: pendingCount,
            readyToSendNow: readyToSend,
            nextScheduledMessage: nextMessage ? {
                scheduledAt: nextMessage.scheduledAt.toISOString(),
                chatName: nextMessage.chatName,
                messageType: nextMessage.messageType,
                minutesUntilSend: Math.round((nextMessage.scheduledAt.getTime() - now.getTime()) / 60000),
            } : null,
        };
    }

    async destroy(): Promise<void> {
        console.log(`🛑 [User ${this.userId}] Destroying WhatsApp tenant`);
        this.stopPreventiveRestart();
        this.stopKeepAlive();
        this.stopScheduler();
        if (this.connectingTimeout) { clearTimeout(this.connectingTimeout); this.connectingTimeout = null; }
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
    private cleanupJob: cron.ScheduledTask | null = null;

    constructor() {
        // Weekly cleanup cron: every Sunday at 3:00 AM
        this.cleanupJob = cron.schedule('0 3 * * 0', async () => {
            await this.cleanupOldMessages();
            await this.cleanupInactiveTenants();
        });
    }

    getTenant(userId: string): WhatsAppTenant {
        if (!this.tenants.has(userId)) {
            const tenant = new WhatsAppTenant(userId);
            this.tenants.set(userId, tenant);
        }
        return this.tenants.get(userId)!;
    }

    async destroyAll(): Promise<void> {
        console.log('🛑 Shutting down all WhatsApp tenants...');
        if (this.cleanupJob) { this.cleanupJob.stop(); this.cleanupJob = null; }
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

            // Limit concurrency: initialize max 3 tenants at a time
            const CONCURRENT_LIMIT = 3;
            const DELAY_BETWEEN_CHUNKS_MS = 5000;

            for (let i = 0; i < userIdsWithTasks.length; i += CONCURRENT_LIMIT) {
                const chunk = userIdsWithTasks.slice(i, i + CONCURRENT_LIMIT);
                const promises = chunk
                    .filter((uid: any) => !!uid)
                    .map((uid: any) => {
                        const tenant = this.getTenant(uid.toString());
                        return tenant.initialize().catch(console.error);
                    });

                await Promise.allSettled(promises);

                // Delay between chunks to let memory stabilize
                if (i + CONCURRENT_LIMIT < userIdsWithTasks.length) {
                    console.log(`⏳ Waiting ${DELAY_BETWEEN_CHUNKS_MS / 1000}s before next batch...`);
                    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHUNKS_MS));
                }
            }

            console.log(`✅ All ${userIdsWithTasks.length} tenant(s) initialization started.`);
        } catch (error) {
            console.error('❌ Error initializing active WhatsApp tenants:', error);
        }
    }

    // ── TTL Cleanup: delete messages older than 90 days ──────────
    private async cleanupOldMessages(): Promise<void> {
        try {
            const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
            const result = await ScheduledMessage.deleteMany({
                status: { $in: ['sent', 'failed', 'cancelled'] },
                createdAt: { $lt: cutoffDate },
            });
            if (result.deletedCount > 0) {
                console.log(`🗑️ [Cleanup] Deleted ${result.deletedCount} messages older than 90 days`);
            }
        } catch (error) {
            console.error('❌ [Cleanup] Error cleaning old messages:', error);
        }
    }

    // ── Inactive Tenant Cleanup ─────────────────────────────────
    private async cleanupInactiveTenants(): Promise<void> {
        try {
            for (const [userId, tenant] of this.tenants.entries()) {
                const health = tenant.getHealthInfo();
                if (health.status === 'disconnected') {
                    const pendingCount = await ScheduledMessage.countDocuments({
                        userId,
                        status: 'pending',
                    });
                    if (pendingCount === 0) {
                        console.log(`🧹 [Cleanup] Destroying inactive tenant for user ${userId}`);
                        await tenant.destroy();
                        this.tenants.delete(userId);
                    }
                }
            }
        } catch (error) {
            console.error('❌ [Cleanup] Error cleaning inactive tenants:', error);
        }
    }
}

export const whatsappService = new WhatsAppManager();
