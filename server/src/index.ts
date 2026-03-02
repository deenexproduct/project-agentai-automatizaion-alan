import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { connectDB } from './db';
import whatsappRoutes from './routes/whatsapp.routes';
import resumidorRoutes from './routes/resumidor.routes';
import optimizerRoutes from './routes/optimizer.routes';
import linkedinRoutes from './routes/linkedin.routes';
import linkedinCrmRoutes from './routes/linkedin-crm.routes';
import linkedinAccountsRoutes from './routes/linkedin-accounts.routes';
import linkedinPostsRoutes from './routes/linkedin-posts.routes';
import linkedinPublishingConfigRoutes from './routes/linkedin-publishing-config.routes';
import authRoutes from './routes/auth.routes';
import crmRoutes from './routes/crm.routes';
import dashboardRoutes from './routes/dashboard.routes';
import systemConfigRoutes from './routes/system-config.routes';
import partnerRoutes from './routes/partner.routes';
import competitorRoutes from './routes/competitor.routes';
import posSystemRoutes from './routes/pos-system.routes';
import calendarRoutes from './routes/calendar.routes';
import { authMiddleware } from './middleware/auth.middleware';
import { whatsappService } from './services/whatsapp.service';
import { validateEncryptionKey } from './utils/crypto.service';

const execAsync = promisify(exec);

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://desirable-compassion-production.up.railway.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'https://web.whatsapp.com'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || origin.startsWith('chrome-extension://')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use((req, res, next) => {
  logger.info(`[REQUEST] ${req.method} ${req.url}`);
  next();
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

import { Transcription } from './models/transcription.model';

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// WhatsApp health — detailed session diagnostics
app.get('/api/whatsapp/health', (req, res) => {
  res.json(whatsappService.getHealthInfo());
});

// Get transcription history (Multi-Tenant Protected)
app.get('/api/history', authMiddleware, async (req: any, res) => {
  try {
    const history = await Transcription.find({ userId: req.user._id }).sort({ createdAt: -1 });
    // Map _id to id to maintain backwards compatibility with the frontend React components
    const formattedHistory = history.map(doc => ({
      ...doc.toObject(),
      id: doc._id
    }));
    res.json(formattedHistory);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ── Transcription: Groq API (cloud) or Whisper CLI (local) ──────────
// Priority: Groq API if GROQ_API_KEY is set → Local Whisper (dynamic path)
import Groq from 'groq-sdk';
import { logger } from './utils/logger';

let _groqInstance: Groq | null = null;
function getGroqForTranscription(): Groq {
  if (!_groqInstance) {
    _groqInstance = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return _groqInstance;
}

let _cachedWhisperPath: string | null = null;
async function findWhisperPath(): Promise<string | null> {
  if (_cachedWhisperPath) return _cachedWhisperPath;
  try {
    const { stdout } = await execAsync('which whisper');
    const resolved = stdout.trim();
    if (resolved) {
      _cachedWhisperPath = resolved;
      logger.info(`🎤 [TRANSCRIBE] Whisper CLI found at: ${resolved}`);
      return resolved;
    }
  } catch { /* Whisper not installed */ }
  logger.warn('🎤 [TRANSCRIBE] ⚠️ Whisper CLI not found in PATH');
  return null;
}

async function convertToWav(audioPath: string): Promise<string> {
  const wavPath = audioPath.replace(/\.\w+$/, '_converted.wav');
  try {
    await execAsync(`ffmpeg -y -i "${audioPath}" -ar 16000 -ac 1 "${wavPath}" 2>/dev/null`);
    logger.info(`🎤 [TRANSCRIBE] FFmpeg conversion OK → ${path.basename(wavPath)}`);
  } catch {
    logger.info('🎤 [TRANSCRIBE] FFmpeg conversion skipped, using original file');
  }
  return fs.existsSync(wavPath) ? wavPath : audioPath;
}

async function transcribeWithGroqAPI(audioPath: string): Promise<string> {
  const t0 = Date.now();
  logger.info(`🎤 [TRANSCRIBE] Using Groq API (whisper-large-v3-turbo)...`);
  const fileToSend = await convertToWav(audioPath);
  const groq = getGroqForTranscription();
  const audioFile = fs.createReadStream(fileToSend);

  const transcription = await groq.audio.transcriptions.create({
    file: audioFile,
    model: 'whisper-large-v3-turbo',
    language: 'es',
    response_format: 'text',
  });

  // Cleanup wav if created
  if (fileToSend !== audioPath) {
    try { fs.unlinkSync(fileToSend); } catch { }
  }

  const text = typeof transcription === 'string' ? transcription : (transcription as any).text || '';
  logger.info(`🎤 [TRANSCRIBE] Groq API OK (${Date.now() - t0}ms) → "${text.substring(0, 60)}..."`);
  return text.trim() || 'No se detectó texto';
}

async function transcribeWithWhisperLocal(audioPath: string): Promise<string> {
  const t0 = Date.now();
  const whisperPath = await findWhisperPath();
  if (!whisperPath) {
    throw new Error('Whisper CLI not available and no GROQ_API_KEY configured');
  }

  logger.info(`🎤 [TRANSCRIBE] Using Whisper CLI at ${whisperPath}...`);
  const fileToTranscribe = await convertToWav(audioPath);

  await execAsync(
    `"${whisperPath}" "${fileToTranscribe}" --language Spanish --model tiny --output_format txt --output_dir /tmp`,
    { timeout: 600000 }
  );

  const baseName = path.basename(fileToTranscribe).replace(/\.\w+$/, '.txt');
  const outputPath = `/tmp/${baseName}`;

  if (fs.existsSync(outputPath)) {
    const text = fs.readFileSync(outputPath, 'utf-8').trim();
    try { fs.unlinkSync(outputPath); } catch { }
    if (fileToTranscribe !== audioPath) {
      try { fs.unlinkSync(fileToTranscribe); } catch { }
    }
    logger.info(`🎤 [TRANSCRIBE] Whisper CLI OK (${Date.now() - t0}ms) → "${text.substring(0, 60)}..."`);
    return text || 'No se detectó texto';
  }
  return 'No se pudo obtener la transcripción';
}

async function transcribeWithWhisper(audioPath: string): Promise<string> {
  try {
    // Strategy: Groq cloud first → Whisper CLI fallback
    if (process.env.GROQ_API_KEY) {
      try {
        return await transcribeWithGroqAPI(audioPath);
      } catch (groqErr: any) {
        logger.error(`🎤 [TRANSCRIBE] ❌ Groq API failed: ${groqErr.message}`);
        logger.info('🎤 [TRANSCRIBE] Falling back to local Whisper CLI...');
        return await transcribeWithWhisperLocal(audioPath);
      }
    }
    // No Groq key → try local Whisper
    return await transcribeWithWhisperLocal(audioPath);
  } catch (error: any) {
    logger.error(`🎤 [TRANSCRIBE] ❌ All transcription methods failed: ${error.message}`);
    return `Error de transcripción: ${error.message}`;
  }
}

// Transcribe audio file (Multi-Tenant Protected)
app.post('/api/transcribe/file', authMiddleware, upload.array('files'), async (req: any, res: any) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const results = await Promise.all(files.map(async (file, index) => {
      const text = await transcribeWithWhisper(file.path);

      const transDoc = await Transcription.create({
        userId: req.user._id,
        text,
        source: 'file',
        filename: file.originalname,
        duration: 0
      });

      return {
        ...transDoc.toObject(),
        id: transDoc._id
      };
    }));

    res.json(results);
  } catch (error) {
    logger.error('Transcription error:', error);
    res.status(500).json({ error: 'Error processing transcription' });
  }
});

// Transcribe audio blob (from recording) (Multi-Tenant Protected)
app.post('/api/transcribe/blob', authMiddleware, upload.single('audio'), async (req: any, res: any) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No audio uploaded' });
    }

    logger.info('Transcribing audio blob:', file.path);
    const text = await transcribeWithWhisper(file.path);
    logger.info('Transcription result:', text);

    const transDoc = await Transcription.create({
      userId: req.user._id,
      text,
      source: 'dictation',
      filename: 'recording.webm',
      duration: 0
    });

    const result = {
      ...transDoc.toObject(),
      id: transDoc._id
    };

    // Cleanup uploaded file
    try { fs.unlinkSync(file.path); } catch { }

    res.json(result);
  } catch (error) {
    logger.error('Transcription error:', error);
    res.status(500).json({ error: 'Error processing transcription' });
  }
});

// Delete transcription from history (Multi-Tenant Protected)
app.delete('/api/history/:id', authMiddleware, async (req: any, res: any) => {
  try {
    const id = req.params.id;
    await Transcription.deleteOne({ _id: id, userId: req.user._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// Clear all history (Multi-Tenant Protected)
app.delete('/api/history', authMiddleware, async (req: any, res: any) => {
  try {
    await Transcription.deleteMany({ userId: req.user._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

// Settings endpoint (for future use)
app.get('/api/settings', (req, res) => {
  res.json({
    hotkey: 'Option+Space',
    autoCopyToClipboard: true,
    showNotifications: true,
    language: 'es-AR'
  });
});

app.put('/api/settings', (req, res) => {
  // For future: persist settings
  res.json(req.body);
});

// Mount Auth routes
app.use('/api/auth', authRoutes);

// Mount WhatsApp routes
app.use('/api/whatsapp', authMiddleware, whatsappRoutes);

// Mount Resumidor routes
app.use('/api/resumidor', authMiddleware, resumidorRoutes);

// Optimizer routes
app.use('/api/optimizer', optimizerRoutes);

// LinkedIn routes
app.use('/api/linkedin', authMiddleware, linkedinRoutes);

// LinkedIn CRM routes
app.use('/api/linkedin/crm', authMiddleware, linkedinCrmRoutes);
logger.info('📊 LinkedIn CRM routes mounted at /api/linkedin/crm');

// LinkedIn Accounts routes (multi-account management)
app.use('/api/linkedin/accounts', authMiddleware, linkedinAccountsRoutes);
app.use('/api/linkedin/posts', authMiddleware, linkedinPostsRoutes);
app.use('/api/linkedin/publishing', authMiddleware, linkedinPublishingConfigRoutes);
logger.info('🔑 LinkedIn Accounts routes mounted at /api/linkedin/accounts');

// CRM and Dashboard routes
app.use('/api/crm', authMiddleware, crmRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
logger.info('📋 CRM & Dashboard routes mounted at /api/crm and /api/dashboard');

// System Settings & Partners
app.use('/api/system-config', authMiddleware, systemConfigRoutes);
app.use('/api/partners', authMiddleware, partnerRoutes);
app.use('/api/competitors', authMiddleware, competitorRoutes);
app.use('/api/pos-systems', authMiddleware, posSystemRoutes);
app.use('/api/calendar', calendarRoutes);
logger.info('⚙️ System Config, Partners, Competitors & POS Systems routes mounted');

// Start server
async function startServer() {
  // Validate encryption key before anything else
  validateEncryptionKey();

  // Connect to MongoDB
  await connectDB();

  app.listen(PORT, () => {
    logger.info(`✅ Server running on http://localhost:${PORT}`);
    logger.info(`🕐 Server timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone} | UTC offset: ${new Date().getTimezoneOffset()}min | Now: ${new Date().toISOString()}`);
    logger.info(`🎙️ Using Whisper for transcription`);
    logger.info(`📱 WhatsApp scheduler enabled (runs independently of WA connection)`);
    logger.info(`📡 API endpoints available:`);
    logger.info(`   GET  /api/health`);
    logger.info(`   GET  /api/history`);
    logger.info(`   POST /api/transcribe/file`);
    logger.info(`   POST /api/transcribe/blob`);
    logger.info(`   GET  /api/settings`);
    logger.info(`   GET  /api/whatsapp/status`);
    logger.info(`   GET  /api/whatsapp/qr`);
    logger.info(`   GET  /api/whatsapp/chats`);
    logger.info(`   POST /api/whatsapp/schedule`);
    logger.info(`   GET  /api/whatsapp/scheduled`);
    logger.info(`   GET  /api/whatsapp/history`);
    logger.info(`   📊 Resumidor:`);
    logger.info(`   GET  /api/resumidor/health`);
    logger.info(`   GET  /api/resumidor/groups`);
    logger.info(`   POST /api/resumidor/summarize`);
    logger.info(`   GET  /api/resumidor/models`);
    logger.info(`   GET  /api/resumidor/history`);
    logger.info(`   🔗 LinkedIn:`);
    logger.info(`   GET  /api/linkedin/status`);
    logger.info(`   POST /api/linkedin/launch`);
    logger.info(`   POST /api/linkedin/start-prospecting`);
    logger.info(`   POST /api/linkedin/pause`);
    logger.info(`   POST /api/linkedin/resume`);
    logger.info(`   POST /api/linkedin/stop`);
    logger.info(`   GET  /api/linkedin/progress`);
    logger.info(`   GET  /api/linkedin/progress/stream`);

    // Initialize active WhatsApp tenants after server is ready (based on pending scheduled messages)
    whatsappService.initializeActiveTenants().catch((err) => {
      logger.error('WhatsApp initialization error:', err);
    });
  });

  // ── Graceful Shutdown ─────────────────────────────────────────
  // Cleanly destroy the WhatsApp client on SIGTERM/SIGINT
  // This prevents session file corruption during Railway redeploys
  const shutdown = async (signal: string) => {
    logger.info(`\n🛑 Received ${signal} — shutting down gracefully...`);
    try {
      await whatsappService.destroyAll();
      logger.info('✅ All WhatsApp tenants destroyed cleanly');
    } catch (err) {
      logger.error('⚠️ Error during shutdown:', err);
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Prevent Puppeteer uncaught errors from crashing the entire Node process
  process.on('unhandledRejection', (reason: any) => {
    logger.error('⚠️ [unhandledRejection]', reason?.message || reason);
    // Don't crash — let reconnect logic handle it
  });
  process.on('uncaughtException', (err: Error) => {
    logger.error('⚠️ [uncaughtException]', err.message);
    // Only crash for truly fatal errors (like OOM), not Puppeteer protocol errors
    if (err.message?.includes('out of memory') || err.message?.includes('ENOMEM')) {
      logger.error('💀 Fatal memory error — shutting down');
      process.exit(1);
    }
    // Otherwise log and continue
  });
}

startServer();
