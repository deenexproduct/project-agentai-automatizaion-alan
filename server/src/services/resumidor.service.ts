import { whatsappService } from './whatsapp.service';
import path from 'path';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import Groq from 'groq-sdk';

const execAsync = promisify(exec);

// ============================================================
// Resumidor Service — Fetch, Transcribe, Summarize
// Multi-provider: Groq (cloud) or Ollama (local)
// ============================================================

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

// Auto-detect provider: Groq if API key exists, else Ollama
type Provider = 'groq' | 'ollama';
function getProvider(): Provider {
    return GROQ_API_KEY ? 'groq' : 'ollama';
}

let groqClient: Groq | null = null;
function getGroqClient(): Groq {
    if (!groqClient) {
        groqClient = new Groq({ apiKey: GROQ_API_KEY });
    }
    return groqClient;
}

export interface SummarizeOptions {
    chatId: string;
    rangeMode: 'hours' | 'range';
    hours?: number;
    rangeFrom?: string; // HH:MM or ISO date
    rangeTo?: string;
    model?: string;
    config?: ReportConfig;
}

export interface ReportConfig {
    includeExecutiveSummary: boolean;
    includeTopics: boolean;
    includeDecisions: boolean;
    includeTasks: boolean;
    includeImportantData: boolean;
    includeSentiment: boolean;
    includeSuggestions: boolean;
}

export const DEFAULT_CONFIG: ReportConfig = {
    includeExecutiveSummary: true,
    includeTopics: true,
    includeDecisions: true,
    includeTasks: true,
    includeImportantData: true,
    includeSentiment: true,
    includeSuggestions: true,
};

type ProgressCallback = (step: string, detail: string, progress?: number) => void;

interface ParsedMessage {
    timestamp: Date;
    author: string;
    body: string;
    hasMedia: boolean;
    isAudio: boolean;
    mediaData?: { data: string; mimetype: string; filename?: string };
}

class ResumidorService {

    // ── Health Checks ───────────────────────────────────────────

    getProvider(): Provider {
        return getProvider();
    }

    async checkLLMHealth(): Promise<{ ok: boolean; provider: Provider; error?: string; models?: string[] }> {
        const provider = getProvider();
        console.log(`📊 [RESUMIDOR] Health check — provider: ${provider}`);

        if (provider === 'groq') {
            try {
                // Verify API key works with a simple test call
                const groq = getGroqClient();
                await groq.chat.completions.create({
                    model: 'llama-3.3-70b-versatile',
                    messages: [{ role: 'user', content: 'ping' }],
                    max_tokens: 1,
                });
                const modelNames = ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'];
                return { ok: true, provider, models: modelNames };
            } catch (err: any) {
                return { ok: false, provider, error: `Groq API error: ${err.message}` };
            }
        } else {
            try {
                const res = await fetch(`${OLLAMA_URL}/api/tags`);
                if (!res.ok) return { ok: false, provider, error: 'Ollama no responde' };
                const data: any = await res.json();
                const models = (data.models || []).map((m: any) => m.name);
                if (models.length === 0) {
                    return { ok: false, provider, error: 'No hay modelos instalados. Ejecutá: ollama pull mistral' };
                }
                return { ok: true, provider, models };
            } catch {
                return { ok: false, provider, error: 'Ollama no está corriendo. Ejecutá: brew services start ollama' };
            }
        }
    }

    async getAvailableModels(): Promise<string[]> {
        const provider = getProvider();
        if (provider === 'groq') {
            return [
                'llama-3.3-70b-versatile',
                'mixtral-8x7b-32768',
                'gemma2-9b-it',
                'whisper-large-v3-turbo',
            ];
        } else {
            try {
                const res = await fetch(`${OLLAMA_URL}/api/tags`);
                const data: any = await res.json();
                return (data.models || []).map((m: any) => m.name);
            } catch {
                return [];
            }
        }
    }

    // ── Get Group Messages ──────────────────────────────────────

    async getGroupMessages(
        chatId: string,
        options: { rangeMode: 'hours' | 'range'; hours?: number; rangeFrom?: string; rangeTo?: string },
        onProgress?: ProgressCallback
    ): Promise<{ messages: ParsedMessage[]; chatName: string }> {

        const t0 = Date.now();
        console.log(`📊 [RESUMIDOR] ═══ PASO 1: Obteniendo mensajes ═══`);

        onProgress?.('fetch', '🔍 Conectando con WhatsApp y obteniendo chat...', 2);

        const client = (whatsappService as any).client;
        if (!client || !whatsappService.isConnected()) {
            throw new Error('WhatsApp no está conectado');
        }

        const t1 = Date.now();
        const chat = await client.getChatById(chatId);
        console.log(`📊 [RESUMIDOR]   getChatById: ${Date.now() - t1}ms`);

        if (!chat.isGroup) {
            throw new Error('El chat seleccionado no es un grupo');
        }

        onProgress?.('fetch', `🔍 Obteniendo mensajes de "${chat.name}"...`, 5);

        // Determine time range
        let cutoffStart: Date;
        let cutoffEnd: Date = new Date();

        if (options.rangeMode === 'hours' && options.hours) {
            cutoffStart = new Date(Date.now() - options.hours * 60 * 60 * 1000);
        } else if (options.rangeMode === 'range' && options.rangeFrom && options.rangeTo) {
            const today = new Date();
            const [fromH, fromM] = options.rangeFrom.split(':').map(Number);
            const [toH, toM] = options.rangeTo.split(':').map(Number);
            cutoffStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), fromH, fromM);
            cutoffEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), toH, toM);
            if (cutoffStart > cutoffEnd) {
                cutoffStart.setDate(cutoffStart.getDate() - 1);
            }
        } else {
            throw new Error('Configuración de rango inválida');
        }

        console.log(`📊 [RESUMIDOR]   Rango: ${cutoffStart.toLocaleTimeString()} → ${cutoffEnd.toLocaleTimeString()}`);

        // Fetch messages (up to 500)
        const t2 = Date.now();
        onProgress?.('fetch', `🔍 Descargando mensajes (máx 500)...`, 8);
        const allMessages = await chat.fetchMessages({ limit: 500 });
        console.log(`📊 [RESUMIDOR]   fetchMessages(500): ${Date.now() - t2}ms → ${allMessages.length} mensajes raw`);

        onProgress?.('filter', `📊 Obtenidos ${allMessages.length} mensajes, filtrando por rango...`, 12);

        // Filter by time range
        const filtered = allMessages.filter((msg: any) => {
            const msgTime = new Date(msg.timestamp * 1000);
            return msgTime >= cutoffStart && msgTime <= cutoffEnd;
        });
        console.log(`📊 [RESUMIDOR]   Filtrados por rango: ${filtered.length} de ${allMessages.length}`);

        onProgress?.('filter', `📊 ${filtered.length} mensajes en rango. Procesando contactos...`, 15);

        // Parse messages — with detailed timing
        const parsed: ParsedMessage[] = [];
        const t3 = Date.now();
        for (let idx = 0; idx < filtered.length; idx++) {
            const msg = filtered[idx];
            // Skip system messages, stickers, images, videos, documents
            if (msg.isStatus || msg.type === 'sticker' || msg.type === 'image' ||
                msg.type === 'video' || msg.type === 'document' || msg.type === 'vcard' ||
                msg.type === 'location' || msg.type === 'revoked') {
                continue;
            }

            const contactT = Date.now();
            const contact = await msg.getContact();
            const contactMs = Date.now() - contactT;
            if (contactMs > 500) {
                console.log(`📊 [RESUMIDOR]   ⚠️ getContact() lento: ${contactMs}ms para msg ${idx}`);
            }
            const authorName = contact.pushname || contact.name || contact.number || 'Desconocido';

            const isAudio = msg.type === 'ptt' || msg.type === 'audio';

            let mediaData;
            if (isAudio && msg.hasMedia) {
                const dlT = Date.now();
                try {
                    const media = await msg.downloadMedia();
                    console.log(`📊 [RESUMIDOR]   downloadMedia (audio ${idx}): ${Date.now() - dlT}ms`);
                    if (media) {
                        mediaData = {
                            data: media.data,
                            mimetype: media.mimetype,
                            filename: media.filename || `audio_${msg.timestamp}.ogg`,
                        };
                    }
                } catch (err: any) {
                    console.error(`📊 [RESUMIDOR]   ❌ Error downloading audio: ${err.message}`);
                }
            }

            parsed.push({
                timestamp: new Date(msg.timestamp * 1000),
                author: authorName,
                body: msg.body || '',
                hasMedia: msg.hasMedia,
                isAudio,
                mediaData,
            });

            // Progress update every 10 messages
            if (idx % 10 === 0 && filtered.length > 10) {
                onProgress?.('parse', `📊 Procesando mensaje ${idx + 1}/${filtered.length}...`, 15 + (idx / filtered.length) * 5);
            }
        }
        console.log(`📊 [RESUMIDOR]   Parsing total: ${Date.now() - t3}ms para ${parsed.length} mensajes`);

        const audioCount = parsed.filter(m => m.isAudio).length;
        const textCount = parsed.filter(m => !m.isAudio).length;
        const ignoredCount = filtered.length - parsed.length;

        onProgress?.('filter',
            `📊 ${parsed.length} mensajes válidos: ${textCount} textos, ${audioCount} audios, ${ignoredCount} media ignorados`,
            20
        );

        console.log(`📊 [RESUMIDOR] ═══ PASO 1 COMPLETO: ${Date.now() - t0}ms total ═══`);

        return { messages: parsed, chatName: chat.name };
    }

    // ── Transcribe Audios ───────────────────────────────────────

    async transcribeAudios(messages: ParsedMessage[], onProgress?: ProgressCallback): Promise<ParsedMessage[]> {
        const audios = messages.filter(m => m.isAudio && m.mediaData);

        if (audios.length === 0) {
            console.log(`📊 [RESUMIDOR] ═══ PASO 2: Sin audios para transcribir ═══`);
            onProgress?.('transcribe', '📝 No hay audios para transcribir', 40);
            return messages;
        }

        console.log(`📊 [RESUMIDOR] ═══ PASO 2: Transcribiendo ${audios.length} audios ═══`);
        onProgress?.('transcribe', `🎤 Transcribiendo ${audios.length} audio(s)...`, 25);

        const tempDir = path.join(__dirname, '../../uploads/resumidor-temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        for (let i = 0; i < audios.length; i++) {
            const audio = audios[i];
            const progress = 25 + ((i + 1) / audios.length) * 35;
            const tAudio = Date.now();

            onProgress?.('transcribe', `🎤 Transcribiendo audio ${i + 1}/${audios.length} (${audio.author})...`, progress);

            try {
                const ext = audio.mediaData!.mimetype.includes('ogg') ? 'ogg' :
                    audio.mediaData!.mimetype.includes('webm') ? 'webm' :
                        audio.mediaData!.mimetype.includes('mp4') ? 'm4a' : 'ogg';

                const tempFile = path.join(tempDir, `audio_${Date.now()}_${i}.${ext}`);
                const buffer = Buffer.from(audio.mediaData!.data, 'base64');
                fs.writeFileSync(tempFile, buffer);

                const transcription = await this.transcribeAudio(tempFile);
                audio.body = `[🎤 AUDIO TRANSCRITO] ${transcription}`;
                console.log(`📊 [RESUMIDOR]   Audio ${i + 1}/${audios.length}: ${Date.now() - tAudio}ms → "${transcription.substring(0, 50)}..."`);

                onProgress?.('transcribe', `✅ Audio ${i + 1}/${audios.length} transcrito (${Math.round((Date.now() - tAudio) / 1000)}s)`, progress);

                try { fs.unlinkSync(tempFile); } catch { }
            } catch (err: any) {
                console.error(`📊 [RESUMIDOR]   ❌ Audio ${i + 1}: ${err.message}`);
                audio.body = '[🎤 AUDIO - Error al transcribir]';
            }
        }

        try {
            const remaining = fs.readdirSync(tempDir);
            for (const f of remaining) {
                try { fs.unlinkSync(path.join(tempDir, f)); } catch { }
            }
        } catch { }

        onProgress?.('transcribe', `✅ ${audios.length} audio(s) transcritos`, 60);
        return messages;
    }

    // ── Auto-detect transcription method ─────────────────────

    private async transcribeAudio(audioPath: string): Promise<string> {
        const provider = getProvider();
        if (provider === 'groq') {
            return this.transcribeWithGroq(audioPath);
        } else {
            return this.transcribeWithWhisperLocal(audioPath);
        }
    }

    private async transcribeWithGroq(audioPath: string): Promise<string> {
        try {
            const groq = getGroqClient();

            // Convert to wav for best compatibility
            const wavPath = audioPath.replace(/\.\w+$/, '_converted.wav');
            try {
                await execAsync(`ffmpeg -y -i "${audioPath}" -ar 16000 -ac 1 "${wavPath}" 2>/dev/null`);
            } catch { }

            const fileToSend = fs.existsSync(wavPath) ? wavPath : audioPath;
            const audioFile = fs.createReadStream(fileToSend);

            const transcription = await groq.audio.transcriptions.create({
                file: audioFile,
                model: 'whisper-large-v3-turbo',
                language: 'es',
                response_format: 'text',
            });

            try { fs.unlinkSync(wavPath); } catch { }

            const text = typeof transcription === 'string' ? transcription : (transcription as any).text || '';
            return text.trim() || 'No se detectó texto';
        } catch (error: any) {
            console.error('Groq Whisper error:', error.message);
            return `Error de transcripción: ${error.message}`;
        }
    }

    private async transcribeWithWhisperLocal(audioPath: string): Promise<string> {
        try {
            const wavPath = audioPath.replace(/\.\w+$/, '_converted.wav');
            try {
                await execAsync(`ffmpeg -y -i "${audioPath}" -ar 16000 -ac 1 "${wavPath}" 2>/dev/null`);
            } catch { }

            const fileToTranscribe = fs.existsSync(wavPath) ? wavPath : audioPath;
            const { stdout } = await execAsync(
                `/opt/homebrew/bin/whisper "${fileToTranscribe}" --language Spanish --model tiny --output_format txt --output_dir /tmp`,
                { timeout: 600000 }
            );

            const baseName = path.basename(fileToTranscribe).replace(/\.\w+$/, '.txt');
            const outputPath = `/tmp/${baseName}`;

            if (fs.existsSync(outputPath)) {
                const text = fs.readFileSync(outputPath, 'utf-8').trim();
                try { fs.unlinkSync(outputPath); } catch { }
                try { fs.unlinkSync(wavPath); } catch { }
                return text || 'No se detectó texto';
            }
            return 'No se pudo obtener la transcripción';
        } catch (error: any) {
            console.error('Whisper local error:', error.message);
            return `Error de transcripción: ${error.message}`;
        }
    }

    // ── Build Conversation Document ─────────────────────────────

    buildConversationDocument(messages: ParsedMessage[]): string {
        const sorted = [...messages].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        return sorted
            .map(msg => {
                const time = msg.timestamp.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                return `[${time}] ${msg.author}: ${msg.body}`;
            })
            .join('\n');
    }

    // ── Build Prompt ────────────────────────────────────────────

    buildPrompt(document: string, chatName: string, hours: number | string, config: ReportConfig): string {
        const sections: string[] = [];

        sections.push(`Eres un analista experto que genera informes de conversaciones de grupos de WhatsApp en español.`);
        sections.push(`\nTe doy la conversación del grupo "${chatName}" del período: ${hours}.`);
        sections.push(`Los audios transcritos se marcan como [🎤 AUDIO TRANSCRITO].`);
        sections.push(`\nGenera un INFORME COMPLETO con las siguientes secciones:\n`);

        if (config.includeExecutiveSummary) {
            sections.push(`📌 RESUMEN EJECUTIVO: Un párrafo directo con lo más importante.`);
        }
        if (config.includeTopics) {
            sections.push(`📋 TEMAS DISCUTIDOS: Lista numerada de cada tema con un resumen de qué se habló.`);
        }
        if (config.includeDecisions) {
            sections.push(`✅ DECISIONES Y ACUERDOS: Qué se decidió y quién lo propuso.`);
        }
        if (config.includeTasks) {
            sections.push(`📝 TAREAS PENDIENTES: Con responsable asignado.`);
        }
        if (config.includeImportantData) {
            sections.push(`📊 DATOS IMPORTANTES: Fechas, números, links o información clave mencionada.`);
        }
        if (config.includeSentiment) {
            sections.push(`\n🧠 ANÁLISIS DE SENTIMIENTO:\n- Tono general de la conversación (amigable, tenso, formal, informal, etc.)\n- Dinámicas entre participantes (quién lideró, quién fue pasivo)\n- Momentos de tensión, humor o desacuerdo\n- Intuición sobre la situación general del grupo`);
        }
        if (config.includeSuggestions) {
            sections.push(`\n💡 SUGERENCIAS DE RESPUESTA:\nBasándote en TODO el contexto de la conversación, sugiere 2-3 mensajes exactos que el usuario debería enviar al grupo. Para cada sugerencia:\n1. El mensaje textual sugerido (entre comillas)\n2. Explicación de por qué ese mensaje sería apropiado dado el contexto\n3. El tono recomendado (formal, casual, humor, etc.)`);
        }

        sections.push(`\nSé directo, preciso, y no omitas información importante.`);
        sections.push(`Si hay audios transcritos, integra su contenido naturalmente en el resumen.`);
        sections.push(`\nCONVERSACIÓN:\n${document}`);

        return sections.join('\n');
    }

    // ── Summarize with Ollama (STREAMING) ───────────────────────

    async summarizeWithOllama(
        document: string,
        chatName: string,
        hoursLabel: string,
        config: ReportConfig,
        model: string = 'mistral',
        onProgress?: ProgressCallback
    ): Promise<string> {

        console.log(`📊 [RESUMIDOR] ═══ PASO 4: Ollama (${model}) ═══`);
        const tOllama = Date.now();

        onProgress?.('summarize', '🤖 Preparando prompt para el LLM...', 65);

        const prompt = this.buildPrompt(document, chatName, hoursLabel, config);
        const promptChars = prompt.length;
        const tokenEstimate = Math.round(promptChars / 4);

        console.log(`📊 [RESUMIDOR]   Prompt: ${promptChars} chars (~${tokenEstimate} tokens)`);
        console.log(`📊 [RESUMIDOR]   Documento conversación: ${document.length} chars`);

        onProgress?.('summarize', `🤖 Enviando a ${model} (${tokenEstimate.toLocaleString()} tokens, ${promptChars.toLocaleString()} chars)...`, 68);

        try {
            // Use STREAMING mode for real-time progress
            const res = await fetch(`${OLLAMA_URL}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    prompt,
                    stream: true,  // STREAMING for real-time feedback
                    options: {
                        temperature: 0.3,
                        num_ctx: 4096,  // Reduced from 8192 for speed on 8GB RAM
                    },
                }),
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Ollama error (${res.status}): ${errText}`);
            }

            console.log(`📊 [RESUMIDOR]   Ollama responded, streaming tokens...`);
            onProgress?.('summarize', '⏳ Generando informe (recibiendo tokens en tiempo real)...', 70);

            // Read streaming response
            const reader = res.body?.getReader();
            if (!reader) throw new Error('No se pudo leer stream de Ollama');

            const decoder = new TextDecoder();
            let fullResponse = '';
            let tokenCount = 0;
            let lastProgressUpdate = Date.now();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Process JSON lines
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const chunk = JSON.parse(line);
                        if (chunk.response) {
                            fullResponse += chunk.response;
                            tokenCount++;
                        }

                        // Update progress every 500ms
                        if (Date.now() - lastProgressUpdate > 500) {
                            const elapsedSec = Math.round((Date.now() - tOllama) / 1000);
                            const tokPerSec = tokenCount > 0 ? (tokenCount / ((Date.now() - tOllama) / 1000)).toFixed(1) : '...';
                            const progressPct = Math.min(70 + (tokenCount / 500) * 25, 95); // 70% → 95%

                            onProgress?.('summarize',
                                `⏳ Generando: ${tokenCount} tokens (${tokPerSec} tok/s, ${elapsedSec}s)`,
                                progressPct
                            );
                            lastProgressUpdate = Date.now();
                        }

                        if (chunk.done) {
                            const totalTime = Date.now() - tOllama;
                            const finalTokPerSec = (tokenCount / (totalTime / 1000)).toFixed(1);
                            console.log(`📊 [RESUMIDOR]   Ollama COMPLETO: ${tokenCount} tokens en ${Math.round(totalTime / 1000)}s (${finalTokPerSec} tok/s)`);
                            if (chunk.eval_count) {
                                console.log(`📊 [RESUMIDOR]   Ollama stats: eval_count=${chunk.eval_count}, eval_duration=${chunk.eval_duration}, prompt_eval_count=${chunk.prompt_eval_count}`);
                            }
                        }
                    } catch { }
                }
            }

            if (!fullResponse.trim()) {
                throw new Error('Ollama no generó respuesta');
            }

            onProgress?.('summarize', `✅ Informe generado: ${tokenCount} tokens en ${Math.round((Date.now() - tOllama) / 1000)}s`, 100);

            return fullResponse;
        } catch (error: any) {
            console.error(`📊 [RESUMIDOR]   ❌ Ollama error (${Date.now() - tOllama}ms): ${error.message}`);
            if (error.message.includes('fetch')) {
                throw new Error('Ollama no está corriendo. Ejecutá: brew services start ollama');
            }
            throw error;
        }
    }

    // ── Summarize with Groq (CLOUD) ─────────────────────────────

    async summarizeWithGroq(
        document: string,
        chatName: string,
        hoursLabel: string,
        config: ReportConfig,
        model: string = 'llama-3.3-70b-versatile',
        onProgress?: ProgressCallback
    ): Promise<string> {

        console.log(`📊 [RESUMIDOR] ═══ PASO 4: Groq (${model}) ═══`);
        const tGroq = Date.now();

        onProgress?.('summarize', '🤖 Preparando prompt para Groq...', 65);

        const prompt = this.buildPrompt(document, chatName, hoursLabel, config);
        const promptChars = prompt.length;
        const tokenEstimate = Math.round(promptChars / 4);

        console.log(`📊 [RESUMIDOR]   Prompt: ${promptChars} chars (~${tokenEstimate} tokens)`);
        onProgress?.('summarize', `🤖 Enviando a Groq ${model} (~${tokenEstimate} tokens)...`, 70);

        try {
            const groq = getGroqClient();

            // Use streaming for real-time progress
            const stream = await groq.chat.completions.create({
                model,
                messages: [
                    { role: 'system', content: 'Eres un analista experto que genera informes de conversaciones de WhatsApp en español. Sé directo, preciso, y no omitas información importante.' },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.3,
                max_tokens: 4096,
                stream: true,
            });

            let fullResponse = '';
            let tokenCount = 0;
            let lastProgressUpdate = Date.now();

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    fullResponse += content;
                    tokenCount++;
                }

                // Update progress every 500ms
                if (Date.now() - lastProgressUpdate > 500) {
                    const elapsedSec = Math.round((Date.now() - tGroq) / 1000);
                    const tokPerSec = tokenCount > 0 ? (tokenCount / ((Date.now() - tGroq) / 1000)).toFixed(0) : '...';
                    const progressPct = Math.min(70 + (tokenCount / 500) * 25, 95);

                    onProgress?.('summarize',
                        `⚡ Groq: ${tokenCount} tokens (${tokPerSec} tok/s, ${elapsedSec}s)`,
                        progressPct
                    );
                    lastProgressUpdate = Date.now();
                }
            }

            const totalTime = Date.now() - tGroq;
            const finalTokPerSec = (tokenCount / (totalTime / 1000)).toFixed(0);
            console.log(`📊 [RESUMIDOR]   Groq COMPLETO: ${tokenCount} tokens en ${Math.round(totalTime / 1000)}s (${finalTokPerSec} tok/s)`);

            if (!fullResponse.trim()) {
                throw new Error('Groq no generó respuesta');
            }

            onProgress?.('summarize', `✅ Informe generado: ${tokenCount} tokens en ${Math.round(totalTime / 1000)}s`, 100);
            return fullResponse;
        } catch (error: any) {
            console.error(`📊 [RESUMIDOR]   ❌ Groq error (${Date.now() - tGroq}ms): ${error.message}`);
            throw error;
        }
    }

    // ── Full Summarize Flow ─────────────────────────────────────

    async summarize(
        options: SummarizeOptions,
        onProgress?: ProgressCallback
    ): Promise<{
        summary: string;
        chatName: string;
        totalMessages: number;
        totalAudios: number;
        processingTimeSeconds: number;
    }> {
        const startTime = Date.now();
        const config = options.config || DEFAULT_CONFIG;
        const provider = getProvider();

        // Set default model based on provider
        let model = options.model || (provider === 'groq' ? 'llama-3.3-70b-versatile' : 'mistral');

        console.log(`\n📊 ══════════════════════════════════════════════════`);
        console.log(`📊 [RESUMIDOR] INICIO — provider=${provider}, chat=${options.chatId}, model=${model}`);
        console.log(`📊 ══════════════════════════════════════════════════\n`);

        // Step 1: Get messages
        const { messages, chatName } = await this.getGroupMessages(
            options.chatId,
            {
                rangeMode: options.rangeMode,
                hours: options.hours,
                rangeFrom: options.rangeFrom,
                rangeTo: options.rangeTo,
            },
            onProgress
        );

        if (messages.length === 0) {
            throw new Error('No se encontraron mensajes en el rango seleccionado');
        }

        // Step 2: Transcribe audios
        await this.transcribeAudios(messages, onProgress);

        // Step 3: Build document
        console.log(`📊 [RESUMIDOR] ═══ PASO 3: Construyendo documento ═══`);
        onProgress?.('build', '📝 Construyendo documento cronológico...', 62);
        const document = this.buildConversationDocument(messages);
        console.log(`📊 [RESUMIDOR]   Documento: ${document.length} chars, ${messages.length} mensajes`);

        // Log a preview of the document
        const preview = document.substring(0, 300);
        console.log(`📊 [RESUMIDOR]   Preview:\n${preview}\n...`);

        onProgress?.('build', `📝 Documento listo: ${document.length} caracteres`, 64);

        // Step 4: Summarize (auto-detect provider)
        const hoursLabel = options.rangeMode === 'hours'
            ? `últimas ${options.hours} horas`
            : `de ${options.rangeFrom} a ${options.rangeTo}`;

        const summary = provider === 'groq'
            ? await this.summarizeWithGroq(document, chatName, hoursLabel, config, model, onProgress)
            : await this.summarizeWithOllama(document, chatName, hoursLabel, config, model, onProgress);

        const processingTimeSeconds = Math.round((Date.now() - startTime) / 1000);
        const totalAudios = messages.filter(m => m.isAudio).length;

        console.log(`\n📊 ══════════════════════════════════════════════════`);
        console.log(`📊 [RESUMIDOR] COMPLETO — ${processingTimeSeconds}s total`);
        console.log(`📊   Mensajes: ${messages.length} | Audios: ${totalAudios} | Resumen: ${summary.length} chars`);
        console.log(`📊 ══════════════════════════════════════════════════\n`);

        return {
            summary,
            chatName,
            totalMessages: messages.length,
            totalAudios,
            processingTimeSeconds,
        };
    }
}

// Singleton
export const resumidorService = new ResumidorService();
