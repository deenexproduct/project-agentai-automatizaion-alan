// ============================================================
// Context Extractor Service — Reusable Context Processing
// 
// Extracts, structures, and formats conversation context from
// any source (WhatsApp, emails, documents, etc.) into a format
// optimized for LLM comprehension.
// ============================================================

export interface ContextChunk {
    index: number;
    author: string;
    timestamp: Date;
    type: 'text' | 'audio_transcript' | 'image' | 'video' | 'document' | 'sticker' | 'location' | 'contact' | 'deleted' | 'system';
    content: string;
    metadata?: Record<string, any>; // duration, filename, replied-to, etc.
}

export interface ConversationContext {
    source: string;            // e.g. "WhatsApp Group: Team Dev"
    timeRange: string;         // e.g. "08:00 - 14:00" or "últimas 4 horas"
    participants: ParticipantInfo[];
    totalMessages: number;
    totalAudios: number;
    totalMedia: number;
    chunks: ContextChunk[];
}

export interface ParticipantInfo {
    name: string;
    messageCount: number;
    audioCount: number;
    firstMessage: Date;
    lastMessage: Date;
}

// Max chars for a single LLM call (~25k tokens ≈ 100k chars for Groq)
const MAX_CONTEXT_CHARS = 90_000;

class ContextExtractorService {

    /**
     * Build a structured ConversationContext from raw ContextChunks.
     * Analyzes participants, counts, and prepares everything for prompt building.
     */
    buildContext(
        chunks: ContextChunk[],
        source: string,
        timeRange: string
    ): ConversationContext {
        // Sort chronologically
        const sorted = [...chunks].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        // Analyze participants
        const participantMap = new Map<string, ParticipantInfo>();
        for (const chunk of sorted) {
            if (chunk.type === 'system') continue;
            const existing = participantMap.get(chunk.author);
            if (existing) {
                existing.messageCount++;
                if (chunk.type === 'audio_transcript') existing.audioCount++;
                existing.lastMessage = chunk.timestamp;
            } else {
                participantMap.set(chunk.author, {
                    name: chunk.author,
                    messageCount: 1,
                    audioCount: chunk.type === 'audio_transcript' ? 1 : 0,
                    firstMessage: chunk.timestamp,
                    lastMessage: chunk.timestamp,
                });
            }
        }

        const participants = Array.from(participantMap.values())
            .sort((a, b) => b.messageCount - a.messageCount);

        return {
            source,
            timeRange,
            participants,
            totalMessages: sorted.length,
            totalAudios: sorted.filter(c => c.type === 'audio_transcript').length,
            totalMedia: sorted.filter(c => ['image', 'video', 'document', 'sticker'].includes(c.type)).length,
            chunks: sorted,
        };
    }

    /**
     * Format a ConversationContext into a rich, structured document
     * that preserves every piece of context for the LLM.
     */
    formatDocument(context: ConversationContext): string {
        const lines: string[] = [];

        // Header
        lines.push(`═══════════════════════════════════════════════════════`);
        lines.push(`📋 TRANSCRIPCIÓN COMPLETA — ${context.source}`);
        lines.push(`═══════════════════════════════════════════════════════`);
        lines.push(``);
        lines.push(`📅 Período: ${context.timeRange}`);
        lines.push(`📊 Total: ${context.totalMessages} mensajes | ${context.totalAudios} audios transcritos | ${context.totalMedia} archivos multimedia`);
        lines.push(``);

        // Participant summary
        lines.push(`👥 PARTICIPANTES (${context.participants.length}):`);
        for (const p of context.participants) {
            const audioNote = p.audioCount > 0 ? `, ${p.audioCount} audios` : '';
            lines.push(`   • ${p.name}: ${p.messageCount} mensajes${audioNote}`);
        }
        lines.push(``);
        lines.push(`───────────────────────────────────────────────────────`);
        lines.push(`                    INICIO DE CONVERSACIÓN`);
        lines.push(`───────────────────────────────────────────────────────`);
        lines.push(``);

        // Messages — one by one, with full context
        for (const chunk of context.chunks) {
            const time = chunk.timestamp.toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZone: 'America/Argentina/Buenos_Aires',
            });

            switch (chunk.type) {
                case 'text':
                    lines.push(`[${time}] 💬 ${chunk.author}:`);
                    lines.push(`  ${chunk.content}`);
                    break;

                case 'audio_transcript':
                    const duration = chunk.metadata?.duration ? ` (${chunk.metadata.duration}s)` : '';
                    lines.push(`[${time}] 🎤 ${chunk.author} [AUDIO TRANSCRITO${duration}]:`);
                    lines.push(`  "${chunk.content}"`);
                    break;

                case 'image':
                    lines.push(`[${time}] 📷 ${chunk.author}: [Imagen enviada${chunk.content ? ' — ' + chunk.content : ''}]`);
                    break;

                case 'video':
                    lines.push(`[${time}] 🎬 ${chunk.author}: [Video enviado${chunk.content ? ' — ' + chunk.content : ''}]`);
                    break;

                case 'document':
                    const fname = chunk.metadata?.filename || 'documento';
                    lines.push(`[${time}] 📄 ${chunk.author}: [Documento: ${fname}${chunk.content ? ' — ' + chunk.content : ''}]`);
                    break;

                case 'sticker':
                    lines.push(`[${time}] 😄 ${chunk.author}: [Sticker]`);
                    break;

                case 'location':
                    lines.push(`[${time}] 📍 ${chunk.author}: [Ubicación compartida]`);
                    break;

                case 'contact':
                    lines.push(`[${time}] 👤 ${chunk.author}: [Contacto compartido${chunk.content ? ': ' + chunk.content : ''}]`);
                    break;

                case 'deleted':
                    lines.push(`[${time}] 🗑️ ${chunk.author}: [Mensaje eliminado]`);
                    break;

                case 'system':
                    lines.push(`[${time}] ⚙️ SISTEMA: ${chunk.content}`);
                    break;
            }
            lines.push(``); // blank line between messages for readability
        }

        lines.push(`───────────────────────────────────────────────────────`);
        lines.push(`                     FIN DE CONVERSACIÓN`);
        lines.push(`───────────────────────────────────────────────────────`);

        return lines.join('\n');
    }

    /**
     * Build an optimal prompt for LLM summarization.
     * Includes full context, participant analysis, and per-message comprehension instructions.
     */
    buildAnalysisPrompt(
        document: string,
        context: ConversationContext,
        config: {
            includeExecutiveSummary?: boolean;
            includeTopics?: boolean;
            includeDecisions?: boolean;
            includeTasks?: boolean;
            includeImportantData?: boolean;
            includeSentiment?: boolean;
            includeSuggestions?: boolean;
        }
    ): string {
        const parts: string[] = [];

        // System instruction
        parts.push(`# ROL Y CONTEXTO`);
        parts.push(`Eres un analista experto en comunicaciones. Tu tarea es analizar CADA MENSAJE de la siguiente conversación de WhatsApp del grupo "${context.source}", procesándolos UNO A UNO para comprender el contexto completo.`);
        parts.push(``);

        // Key instructions
        parts.push(`# INSTRUCCIONES CRÍTICAS`);
        parts.push(`1. LEE CADA MENSAJE INDIVIDUALMENTE — no resumas por bloques, procesa cada línea de la conversación.`);
        parts.push(`2. LOS AUDIOS TRANSCRITOS (marcados con 🎤) tienen EL MISMO PESO que los mensajes de texto. Son transcripciones exactas de lo que dijo la persona.`);
        parts.push(`3. Los mensajes eliminados (🗑️) pueden indicar información sensible o cambios de opinión — mencionarlos si es relevante.`);
        parts.push(`4. Las imágenes (📷), videos (🎬) y documentos (📄) son referenciados pero no visibles — infiere su contexto por los mensajes que los rodean.`);
        parts.push(`5. Presta especial atención a la LÍNEA TEMPORAL: quién respondió a quién, cuánto tardaron, y las dinámicas de la conversación.`);
        parts.push(``);

        // Participant context
        parts.push(`# PARTICIPANTES (${context.participants.length})`);
        for (const p of context.participants) {
            const audioNote = p.audioCount > 0 ? ` (${p.audioCount} audios transcritos)` : '';
            parts.push(`- ${p.name}: ${p.messageCount} mensajes${audioNote}`);
        }
        parts.push(``);

        // Report sections
        parts.push(`# GENERA EL SIGUIENTE INFORME DETALLADO`);
        parts.push(``);

        if (config.includeExecutiveSummary !== false) {
            parts.push(`## 📌 RESUMEN EJECUTIVO`);
            parts.push(`Un párrafo completo que capture LO MÁS IMPORTANTE de la conversación. Debe incluir: qué se discutió, quiénes participaron activamente, qué se resolvió o quedó pendiente. NO omitas información de los audios — integra su contenido como parte natural del resumen.`);
            parts.push(``);
        }

        if (config.includeTopics !== false) {
            parts.push(`## 📋 TEMAS DISCUTIDOS`);
            parts.push(`Lista DETALLADA de cada tema con:`);
            parts.push(`- Qué se habló específicamente`);
            parts.push(`- Quién lo inició y quiénes participaron`);
            parts.push(`- Cómo evolucionó la discusión (si hubo desacuerdos, si se resolvió, etc.)`);
            parts.push(`- Incluí textualmente frases clave o citas importantes entre comillas`);
            parts.push(``);
        }

        if (config.includeDecisions !== false) {
            parts.push(`## ✅ DECISIONES Y ACUERDOS`);
            parts.push(`Cada decisión tomada con: qué se decidió, quién lo propuso, y si hubo consenso.`);
            parts.push(``);
        }

        if (config.includeTasks !== false) {
            parts.push(`## 📝 TAREAS PENDIENTES`);
            parts.push(`Con responsable asignado y deadline si se mencionó.`);
            parts.push(``);
        }

        if (config.includeImportantData !== false) {
            parts.push(`## 📊 DATOS IMPORTANTES`);
            parts.push(`Fechas, números, links, precios, cantidades, nombres de empresas/personas externas, o cualquier dato concreto mencionado. INCLUIR datos mencionados en audios.`);
            parts.push(``);
        }

        if (config.includeSentiment !== false) {
            parts.push(`## 🧠 ANÁLISIS DE SENTIMIENTO Y DINÁMICAS`);
            parts.push(`- Tono general (formal, informal, tenso, relajado)`);
            parts.push(`- Quién lideró la conversación, quién fue más pasivo`);
            parts.push(`- Momentos de tensión, humor o desacuerdo`);
            parts.push(`- Relaciones entre participantes (alianzas, conflictos visibles)`);
            parts.push(``);
        }

        if (config.includeSuggestions !== false) {
            parts.push(`## 💡 SUGERENCIAS DE RESPUESTA`);
            parts.push(`Basándote en TODO el contexto, sugiere 2-3 mensajes exactos que el usuario podría enviar al grupo. Para cada uno:`);
            parts.push(`1. El mensaje textual sugerido (entre comillas)`);
            parts.push(`2. Por qué ese mensaje es apropiado dado el contexto`);
            parts.push(`3. El tono recomendado`);
            parts.push(``);
        }

        parts.push(`# CONVERSACIÓN COMPLETA A ANALIZAR`);
        parts.push(``);
        parts.push(document);

        return parts.join('\n');
    }

    /**
     * Check if the document needs chunking (for very large conversations).
     * If it exceeds MAX_CONTEXT_CHARS, split into overlapping chunks.
     */
    needsChunking(document: string): boolean {
        return document.length > MAX_CONTEXT_CHARS;
    }

    /**
     * Split a large document into overlapping chunks for multi-pass processing.
     * Each chunk includes enough overlap to maintain context between segments.
     */
    chunkDocument(document: string, maxChars: number = MAX_CONTEXT_CHARS): string[] {
        if (document.length <= maxChars) return [document];

        const overlap = 2000; // 2k char overlap between chunks
        const chunks: string[] = [];
        let start = 0;

        while (start < document.length) {
            let end = start + maxChars;
            if (end >= document.length) {
                chunks.push(document.substring(start));
                break;
            }

            // Find the last newline before end to avoid splitting mid-message
            const lastNewline = document.lastIndexOf('\n', end);
            if (lastNewline > start + maxChars * 0.5) {
                end = lastNewline;
            }

            chunks.push(document.substring(start, end));
            start = end - overlap;
        }

        return chunks;
    }

    /**
     * Build a merge prompt for combining multiple chunked summaries into one.
     */
    buildMergePrompt(partialSummaries: string[], context: ConversationContext): string {
        const parts: string[] = [];
        parts.push(`# TAREA: COMBINAR RESÚMENES PARCIALES`);
        parts.push(``);
        parts.push(`Se analizó una conversación larga del grupo "${context.source}" en ${partialSummaries.length} partes.`);
        parts.push(`A continuación tenés los resúmenes parciales. Tu tarea es COMBINARLOS en un único informe coherente, completo, y sin repeticiones.`);
        parts.push(`Mantené el mismo formato de secciones que los resúmenes parciales.`);
        parts.push(``);

        for (let i = 0; i < partialSummaries.length; i++) {
            parts.push(`=== RESUMEN PARTE ${i + 1}/${partialSummaries.length} ===`);
            parts.push(partialSummaries[i]);
            parts.push(``);
        }

        parts.push(`=== FIN DE RESÚMENES PARCIALES ===`);
        parts.push(``);
        parts.push(`Generá el INFORME FINAL UNIFICADO:`);

        return parts.join('\n');
    }
}

// Singleton
export const contextExtractor = new ContextExtractorService();
