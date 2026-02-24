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
  'http://localhost:3000'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
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
  console.log(`[REQUEST] ${req.method} ${req.url}`);
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

// Transcribe audio using Whisper
async function transcribeWithWhisper(audioPath: string): Promise<string> {
  try {
    // Convert webm to wav first using ffmpeg
    const wavPath = audioPath.replace(/\.\w+$/, '_converted.wav');

    try {
      await execAsync(`ffmpeg -y -i "${audioPath}" -ar 16000 -ac 1 "${wavPath}" 2>/dev/null`);
    } catch (e) {
      console.log('FFmpeg conversion failed/skipped, continuing with original file...');
      // Try direct transcription if ffmpeg fails
    }

    const fileToTranscribe = fs.existsSync(wavPath) ? wavPath : audioPath;

    // Run Whisper
    console.log(`Starting transcription for: ${fileToTranscribe}`);
    const { stdout, stderr } = await execAsync(
      `/opt/homebrew/bin/whisper "${fileToTranscribe}" --language Spanish --model tiny --output_format txt --output_dir /tmp`,
      { timeout: 600000 } // 10 minutes timeout
    );

    // Read the output file
    const txtPath = fileToTranscribe.replace(/\.\w+$/, '.txt').replace(/.*\//, '/tmp/');
    const baseName = path.basename(fileToTranscribe).replace(/\.\w+$/, '.txt');
    const outputPath = `/tmp/${baseName}`;

    if (fs.existsSync(outputPath)) {
      const text = fs.readFileSync(outputPath, 'utf-8').trim();
      // Cleanup
      try { fs.unlinkSync(outputPath); } catch { }
      try { fs.unlinkSync(wavPath); } catch { }
      return text || 'No se detectó texto';
    }

    return 'No se pudo obtener la transcripción';
  } catch (error: any) {
    console.error('Whisper error:', error.message);
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
    console.error('Transcription error:', error);
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

    console.log('Transcribing audio blob:', file.path);
    const text = await transcribeWithWhisper(file.path);
    console.log('Transcription result:', text);

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
    console.error('Transcription error:', error);
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
app.use('/api/optimizer', authMiddleware, optimizerRoutes);

// LinkedIn routes
app.use('/api/linkedin', authMiddleware, linkedinRoutes);

// LinkedIn CRM routes
app.use('/api/linkedin/crm', authMiddleware, linkedinCrmRoutes);
console.log('📊 LinkedIn CRM routes mounted at /api/linkedin/crm');

// LinkedIn Accounts routes (multi-account management)
app.use('/api/linkedin/accounts', authMiddleware, linkedinAccountsRoutes);
app.use('/api/linkedin/posts', authMiddleware, linkedinPostsRoutes);
app.use('/api/linkedin/publishing', authMiddleware, linkedinPublishingConfigRoutes);
console.log('🔑 LinkedIn Accounts routes mounted at /api/linkedin/accounts');

// CRM and Dashboard routes
app.use('/api/crm', authMiddleware, crmRoutes);
app.use('/api/dashboard', authMiddleware, dashboardRoutes);
console.log('📋 CRM & Dashboard routes mounted at /api/crm and /api/dashboard');

// System Settings & Partners
app.use('/api/system-config', authMiddleware, systemConfigRoutes);
app.use('/api/partners', authMiddleware, partnerRoutes);
app.use('/api/calendar', calendarRoutes);
console.log('⚙️ System Config & Partners routes mounted');

// Start server
async function startServer() {
  // Validate encryption key before anything else
  validateEncryptionKey();

  // Connect to MongoDB
  await connectDB();

  app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`🎙️ Using Whisper for transcription`);
    console.log(`📱 WhatsApp scheduler enabled`);
    console.log(`📡 API endpoints available:`);
    console.log(`   GET  /api/health`);
    console.log(`   GET  /api/history`);
    console.log(`   POST /api/transcribe/file`);
    console.log(`   POST /api/transcribe/blob`);
    console.log(`   GET  /api/settings`);
    console.log(`   GET  /api/whatsapp/status`);
    console.log(`   GET  /api/whatsapp/qr`);
    console.log(`   GET  /api/whatsapp/chats`);
    console.log(`   POST /api/whatsapp/schedule`);
    console.log(`   GET  /api/whatsapp/scheduled`);
    console.log(`   GET  /api/whatsapp/history`);
    console.log(`   📊 Resumidor:`);
    console.log(`   GET  /api/resumidor/health`);
    console.log(`   GET  /api/resumidor/groups`);
    console.log(`   POST /api/resumidor/summarize`);
    console.log(`   GET  /api/resumidor/models`);
    console.log(`   GET  /api/resumidor/history`);
    console.log(`   🔗 LinkedIn:`);
    console.log(`   GET  /api/linkedin/status`);
    console.log(`   POST /api/linkedin/launch`);
    console.log(`   POST /api/linkedin/start-prospecting`);
    console.log(`   POST /api/linkedin/pause`);
    console.log(`   POST /api/linkedin/resume`);
    console.log(`   POST /api/linkedin/stop`);
    console.log(`   GET  /api/linkedin/progress`);
    console.log(`   GET  /api/linkedin/progress/stream`);

    // Initialize active WhatsApp tenants after server is ready (based on pending scheduled messages)
    whatsappService.initializeActiveTenants().catch((err) => {
      console.error('WhatsApp initialization error:', err);
    });
  });

  // ── Graceful Shutdown ─────────────────────────────────────────
  // Cleanly destroy the WhatsApp client on SIGTERM/SIGINT
  // This prevents session file corruption during Railway redeploys
  const shutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal} — shutting down gracefully...`);
    try {
      await whatsappService.destroyAll();
      console.log('✅ All WhatsApp tenants destroyed cleanly');
    } catch (err) {
      console.error('⚠️ Error during shutdown:', err);
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();
