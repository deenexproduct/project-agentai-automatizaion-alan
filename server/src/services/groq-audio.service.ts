import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import Groq from 'groq-sdk';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

// ============================================================
// Groq Audio — Compress, Split, Transcribe
// Groq rechaza el upload con 413 cuando el audio pesa de más
// (25 MB en free tier). Antes mandábamos WAV PCM 16 kHz, que
// ocupa ~1,9 MB por minuto: un m4a de 8 MB salía convertido en
// 50 MB y reventaba. FLAC 16 kHz mono es el formato que Groq
// recomienda y pesa la mitad; lo que aún así se pasa del límite
// va partido en tramos y se transcribe por partes.
// ============================================================

const MODEL = 'whisper-large-v3-turbo';
// Margen sobre el límite real: el multipart suma overhead al tamaño del archivo.
const MAX_UPLOAD_BYTES = Number(process.env.GROQ_MAX_AUDIO_MB || 24) * 1024 * 1024;
// FLAC 16 kHz mono ronda 1 MB por minuto, así que cada tramo entra holgado.
const CHUNK_SECONDS = 15 * 60;
const FFMPEG_OPTS = { maxBuffer: 10 * 1024 * 1024 };

let _groqInstance: Groq | null = null;
function getGroqClient(): Groq {
    if (!_groqInstance) {
        _groqInstance = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
    return _groqInstance;
}

export function isGroqConfigured(): boolean {
    return Boolean(process.env.GROQ_API_KEY);
}

/** Traduce el error de Groq a algo que se entienda desde la UI. */
export function describeGroqError(err: any): string {
    const status = err?.status ?? err?.response?.status;
    if (status === 413) return 'Groq rechazó el audio por tamaño (413)';
    if (status === 401 || status === 403) return `Groq rechazó la GROQ_API_KEY (${status})`;
    if (status === 429) return 'Groq sin cuota disponible por ahora (429)';
    if (status >= 500) return `Groq no responde (${status})`;
    return `Groq falló: ${err?.message ?? 'error desconocido'}`;
}

function mb(bytes: number): string {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Convierte a FLAC 16 kHz mono. Si ffmpeg falla, devuelve el original. */
async function compressForGroq(audioPath: string): Promise<string> {
    const flacPath = audioPath.replace(/\.\w+$/, '') + '_16k.flac';
    try {
        await execAsync(
            `ffmpeg -y -i "${audioPath}" -ar 16000 -ac 1 -c:a flac "${flacPath}" 2>/dev/null`,
            FFMPEG_OPTS
        );
    } catch {
        logger.info('🎤 [TRANSCRIBE] FFmpeg conversion failed, using original file');
        return audioPath;
    }
    if (!fs.existsSync(flacPath)) return audioPath;
    logger.info(
        `🎤 [TRANSCRIBE] FFmpeg → FLAC 16k mono: ${mb(fs.statSync(audioPath).size)} → ${mb(fs.statSync(flacPath).size)}`
    );
    return flacPath;
}

/** Parte el audio en tramos de CHUNK_SECONDS. Devuelve las rutas ordenadas. */
async function splitAudio(audioPath: string): Promise<string[]> {
    const partsDir = `${audioPath.replace(/\.\w+$/, '')}_parts`;
    fs.mkdirSync(partsDir, { recursive: true });
    const pattern = path.join(partsDir, 'part_%03d.flac');

    await execAsync(
        `ffmpeg -y -i "${audioPath}" -f segment -segment_time ${CHUNK_SECONDS} -ar 16000 -ac 1 -c:a flac "${pattern}" 2>/dev/null`,
        FFMPEG_OPTS
    );

    const parts = fs
        .readdirSync(partsDir)
        .filter(f => f.endsWith('.flac'))
        .sort()
        .map(f => path.join(partsDir, f));

    if (parts.length === 0) {
        throw new Error('el audio no se pudo partir en tramos');
    }
    return parts;
}

async function sendToGroq(filePath: string): Promise<string> {
    const transcription = await getGroqClient().audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: MODEL,
        language: 'es',
        response_format: 'text',
    });
    return typeof transcription === 'string' ? transcription : (transcription as any).text || '';
}

function remove(target: string): void {
    try {
        fs.rmSync(target, { recursive: true, force: true });
    } catch { /* nada que limpiar */ }
}

/**
 * Transcribe con Groq Whisper. Comprime a FLAC y, si sigue pasándose del
 * límite de upload, lo parte en tramos y concatena las transcripciones.
 * Lanza si Groq falla — el caller decide qué hacer con el error.
 */
export async function transcribeWithGroq(audioPath: string): Promise<string> {
    const t0 = Date.now();
    logger.info(`🎤 [TRANSCRIBE] Using Groq API (${MODEL})...`);

    const prepared = await compressForGroq(audioPath);
    const temps: string[] = prepared !== audioPath ? [prepared] : [];

    try {
        const size = fs.statSync(prepared).size;
        let text: string;

        if (size <= MAX_UPLOAD_BYTES) {
            text = await sendToGroq(prepared);
        } else {
            logger.info(
                `🎤 [TRANSCRIBE] ${mb(size)} supera el máximo de ${mb(MAX_UPLOAD_BYTES)}, partiendo en tramos de ${CHUNK_SECONDS / 60} min...`
            );
            const parts = await splitAudio(prepared);
            temps.push(path.dirname(parts[0]));

            const chunks: string[] = [];
            for (const [i, part] of parts.entries()) {
                logger.info(`🎤 [TRANSCRIBE] Tramo ${i + 1}/${parts.length} (${mb(fs.statSync(part).size)})...`);
                chunks.push((await sendToGroq(part)).trim());
            }
            text = chunks.filter(Boolean).join(' ');
        }

        const clean = text.trim();
        logger.info(`🎤 [TRANSCRIBE] Groq API OK (${Date.now() - t0}ms) → "${clean.substring(0, 60)}..."`);
        return clean || 'No se detectó texto';
    } finally {
        temps.forEach(remove);
    }
}
