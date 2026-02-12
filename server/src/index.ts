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
import { whatsappService } from './services/whatsapp.service';

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

app.use(cors());
app.use(express.json());

// In-memory storage for now (replace with MongoDB later)
let transcriptionHistory: any[] = [];

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Get transcription history
app.get('/api/history', (req, res) => {
  res.json(transcriptionHistory);
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

// Transcribe audio file
app.post('/api/transcribe/file', upload.array('files'), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const results = await Promise.all(files.map(async (file, index) => {
      const text = await transcribeWithWhisper(file.path);
      return {
        id: Date.now() + index,
        filename: file.originalname,
        text,
        duration: 0,
        source: 'file',
        createdAt: new Date().toISOString()
      };
    }));

    // Add to history
    transcriptionHistory = [...results, ...transcriptionHistory];

    res.json(results);
  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: 'Error processing transcription' });
  }
});

// Transcribe audio blob (from recording)
app.post('/api/transcribe/blob', upload.single('audio'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No audio uploaded' });
    }

    console.log('Transcribing audio file:', file.path);
    const text = await transcribeWithWhisper(file.path);
    console.log('Transcription result:', text);

    const result = {
      id: Date.now(),
      filename: 'recording.webm',
      text,
      duration: 0,
      source: 'dictation',
      createdAt: new Date().toISOString()
    };

    // Add to history
    transcriptionHistory = [result, ...transcriptionHistory];

    // Cleanup uploaded file
    try { fs.unlinkSync(file.path); } catch { }

    res.json(result);
  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({ error: 'Error processing transcription' });
  }
});

// Delete transcription from history
app.delete('/api/history/:id', (req, res) => {
  const id = parseInt(req.params.id);
  transcriptionHistory = transcriptionHistory.filter(item => item.id !== id);
  res.json({ success: true });
});

// Clear all history
app.delete('/api/history', (req, res) => {
  transcriptionHistory = [];
  res.json({ success: true });
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

// Mount WhatsApp routes
app.use('/api/whatsapp', whatsappRoutes);

// Mount Resumidor routes
app.use('/api/resumidor', resumidorRoutes);

// Start server
async function startServer() {
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

    // Initialize WhatsApp after server is ready
    whatsappService.initialize().catch((err) => {
      console.error('WhatsApp initialization error:', err);
    });
  });
}

startServer();
