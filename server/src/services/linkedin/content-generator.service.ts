/**
 * ContentGeneratorService
 *
 * The core of the LinkedIn Publishing Engine.
 * Receives an idea from the CEO → loads system prompt → calls OpenRouter (free models) →
 * parses JSON output → validates → returns a PostDraft ready for approval.
 *
 * AI Provider: OpenRouter (free-tier models, $0/month)
 * System prompt loaded from: server/data/prompts/linkedin-publisher.txt
 */

import fs from 'fs';
import path from 'path';
import { openRouterService } from '../openrouter.service';
import { OPENROUTER_PUBLISHING_CONFIG } from '../../config/ai.config';
import { contentValidator, type PostDraft, type ValidationResult } from './content-validator.service';
import { ClientProfile, type IClientProfile } from '../../models/client-profile.model';
import { ScheduledPost } from '../../models/scheduled-post.model';
import type { ITrendSignal } from '../../models/trend-signal.model';

// ── Types ─────────────────────────────────────────────────────

export interface GeneratePostInput {
    idea: string;
    context?: string;
    pilar: string;
    formato: string;
    trendSignals?: ITrendSignal[];
    userId: string;
}

export interface GeneratePostResult {
    draft: PostDraft;
    validation: ValidationResult;
    generationTimeMs: number;
    model: string;
    promptUsed: string;
}

// ── Service ───────────────────────────────────────────────────

class ContentGeneratorService {
    private systemPromptCache: string | null = null;
    private systemPromptPath: string;

    constructor() {
        this.systemPromptPath = path.resolve(
            __dirname, '..', '..', '..', 'data', 'prompts', 'linkedin-publisher.txt'
        );
    }

    // ── Generate Post ─────────────────────────────────────────

    async generatePost(input: GeneratePostInput): Promise<GeneratePostResult> {
        const startTime = Date.now();

        // 1. Load system prompt
        const systemPrompt = this.loadSystemPrompt();

        // 2. Build user prompt
        const userPrompt = await this.buildUserPrompt(input);

        // 3. Call OpenRouter (free model)
        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ];

        const model = OPENROUTER_PUBLISHING_CONFIG.model;
        const responseContent = await openRouterService.call(messages, {
            model,
            temperature: OPENROUTER_PUBLISHING_CONFIG.temperature,
            max_tokens: OPENROUTER_PUBLISHING_CONFIG.maxTokens,
        });

        // 4. Parse JSON response
        let draft = this.parseResponse(responseContent);

        // 5. If parse failed, retry with explicit instruction
        if (!draft) {
            console.warn('[ContentGenerator] First parse failed, retrying with explicit JSON instruction...');
            messages.push({ role: 'assistant', content: responseContent });
            messages.push({
                role: 'user',
                content: 'Tu respuesta anterior no fue JSON válido. Respondé SOLO con el JSON del formato especificado. Nada más. Sin explicaciones, sin markdown, solo el JSON.',
            });

            const retryContent = await openRouterService.call(messages, {
                model,
                temperature: OPENROUTER_PUBLISHING_CONFIG.temperature,
                max_tokens: OPENROUTER_PUBLISHING_CONFIG.maxTokens,
            });
            draft = this.parseResponse(retryContent);

            if (!draft) {
                // Last resort: construct a minimal draft from raw text
                draft = this.constructFallbackDraft(responseContent, input);
            }
        }

        // 6. Validate
        const validation = contentValidator.validate(draft);

        // Apply auto-fixes
        if (validation.sanitizedHashtags) {
            draft.hashtags = validation.sanitizedHashtags;
        }

        const generationTimeMs = Date.now() - startTime;

        console.log(
            `[ContentGenerator] Post generated: pilar=${input.pilar}, format=${draft.formato_sugerido}, ` +
            `engagement=${draft.prediccion_engagement}, valid=${validation.valid}, time=${generationTimeMs}ms`
        );

        return {
            draft,
            validation,
            generationTimeMs,
            model,
            promptUsed: userPrompt,
        };
    }

    // ── Regenerate with Feedback ──────────────────────────────

    async regeneratePost(
        originalDraft: PostDraft,
        feedback: string,
        input: GeneratePostInput
    ): Promise<GeneratePostResult> {
        const startTime = Date.now();

        const systemPrompt = this.loadSystemPrompt();
        const userPrompt = await this.buildUserPrompt(input);

        const model = OPENROUTER_PUBLISHING_CONFIG.model;
        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
            { role: 'assistant', content: JSON.stringify(originalDraft, null, 2) },
            {
                role: 'user',
                content: `El CEO revisó tu post y quiere cambios:\n\n"${feedback}"\n\nRegenerá el post incorporando este feedback. Respondé SOLO con el JSON actualizado.`,
            },
        ];

        const responseContent = await openRouterService.call(messages, {
            model,
            temperature: OPENROUTER_PUBLISHING_CONFIG.temperature,
            max_tokens: OPENROUTER_PUBLISHING_CONFIG.maxTokens,
        });
        let draft = this.parseResponse(responseContent);

        if (!draft) {
            draft = this.constructFallbackDraft(responseContent, input);
        }

        const validation = contentValidator.validate(draft);
        if (validation.sanitizedHashtags) {
            draft.hashtags = validation.sanitizedHashtags;
        }

        const generationTimeMs = Date.now() - startTime;

        return {
            draft,
            validation,
            generationTimeMs,
            model,
            promptUsed: `[REGENERATION with feedback: "${feedback}"]`,
        };
    }

    // ── Private: Load System Prompt ───────────────────────────

    private loadSystemPrompt(): string {
        if (this.systemPromptCache) {
            return this.systemPromptCache;
        }

        try {
            this.systemPromptCache = fs.readFileSync(this.systemPromptPath, 'utf-8');
            console.log('[ContentGenerator] System prompt loaded from disk');
            return this.systemPromptCache;
        } catch (err) {
            console.error(`[ContentGenerator] Failed to load system prompt from ${this.systemPromptPath}:`, err);
            throw new Error(
                `System prompt not found at ${this.systemPromptPath}. ` +
                'Creá el archivo con el contenido del system prompt de Prompt.md.'
            );
        }
    }

    /**
     * Force reload of the system prompt from disk (e.g., after editing).
     */
    reloadSystemPrompt(): void {
        this.systemPromptCache = null;
        console.log('[ContentGenerator] System prompt cache cleared — will reload on next generation');
    }

    // ── Private: Build User Prompt ────────────────────────────

    private async buildUserPrompt(input: GeneratePostInput): Promise<string> {
        const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const today = new Date();
        const dayName = dayNames[today.getDay()];

        let prompt = `PILAR DEL DÍA: ${input.pilar}\n`;
        prompt += `FORMATO PREFERIDO: ${input.formato}\n`;
        prompt += `DÍA DE LA SEMANA: ${dayName}\n\n`;
        prompt += `IDEA/TEMA: ${input.idea}\n`;

        if (input.context) {
            prompt += `CONTEXTO ADICIONAL: ${input.context}\n`;
        }

        // Add trend signals if available
        if (input.trendSignals && input.trendSignals.length > 0) {
            prompt += '\nTENDENCIAS ACTUALES RELEVANTES:\n';
            for (const signal of input.trendSignals) {
                prompt += `- ${signal.title} (relevancia: ${signal.relevanceScore}/100)`;
                if (signal.hotTake) {
                    prompt += `: ${signal.hotTake}`;
                }
                prompt += '\n';
            }
        }

        // Add top performing recent posts
        try {
            const topPosts = await ScheduledPost.find({
                userId: input.userId,
                status: 'published',
                'engagement.engagementRate': { $gte: 3 },
            })
                .sort({ 'engagement.engagementRate': -1 })
                .limit(3)
                .lean()
                .exec();

            if (topPosts.length > 0) {
                prompt += '\nPOSTS ANTERIORES QUE FUNCIONARON BIEN:\n';
                for (const p of topPosts) {
                    const text = p.content.substring(0, 200);
                    prompt += `---\n${text}...\nEngagement: ${p.engagement.engagementRate}%\n---\n`;
                }
            }
        } catch (err) {
            // Don't fail generation if we can't load top posts
            console.warn('[ContentGenerator] Could not load top posts:', err);
        }

        prompt += '\nINSTRUCCIÓN: Generá un post de LinkedIn siguiendo todas las reglas del system prompt. Respondé SOLO con el JSON del formato especificado. Nada más.';

        return prompt;
    }

    // ── Private: Parse Response ───────────────────────────────

    private parseResponse(content: string): PostDraft | null {
        try {
            // Try direct JSON parse
            const parsed = JSON.parse(content);
            return this.validateDraftStructure(parsed);
        } catch {
            // Try extracting JSON from markdown code block
            const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(jsonMatch[1].trim());
                    return this.validateDraftStructure(parsed);
                } catch {
                    // fall through
                }
            }

            // Try finding JSON object in the text
            const braceMatch = content.match(/\{[\s\S]*\}/);
            if (braceMatch) {
                try {
                    const parsed = JSON.parse(braceMatch[0]);
                    return this.validateDraftStructure(parsed);
                } catch {
                    // fall through
                }
            }

            return null;
        }
    }

    private validateDraftStructure(parsed: any): PostDraft | null {
        if (!parsed || typeof parsed !== 'object') return null;
        if (!parsed.texto || typeof parsed.texto !== 'string') return null;

        return {
            texto: parsed.texto,
            hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
            formato_sugerido: parsed.formato_sugerido || 'text',
            hook_type: parsed.hook_type || 'unknown',
            prompt_imagen: parsed.prompt_imagen || '',
            carousel_slides: Array.isArray(parsed.carousel_slides) ? parsed.carousel_slides : [],
            pregunta_engagement: parsed.pregunta_engagement || '',
            prediccion_engagement: parsed.prediccion_engagement || 'medio',
            razon_prediccion: parsed.razon_prediccion || '',
        };
    }

    // ── Private: Fallback Draft ───────────────────────────────

    private constructFallbackDraft(rawText: string, input: GeneratePostInput): PostDraft {
        console.warn('[ContentGenerator] Constructing fallback draft from raw text');
        return {
            texto: rawText.substring(0, 3000),
            hashtags: [],
            formato_sugerido: (input.formato as PostDraft['formato_sugerido']) || 'text',
            hook_type: 'unknown',
            prompt_imagen: `Professional social media post image, dark navy background #1E1B4B, purple accent #7C3AED, modern tech style, about ${input.pilar}, clean minimal design, 1080x1080`,
            carousel_slides: [],
            pregunta_engagement: '',
            prediccion_engagement: 'bajo',
            razon_prediccion: 'Generado como fallback — revisar manualmente',
        };
    }
}

// ── Singleton ─────────────────────────────────────────────────

export const contentGenerator = new ContentGeneratorService();
