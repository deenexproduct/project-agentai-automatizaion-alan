/**
 * ContentValidatorService
 *
 * Security guardrails for AI-generated LinkedIn content.
 * Validates posts against Deenex's content rules BEFORE saving to database.
 *
 * Returns { valid, issues[] } — critical issues block the post,
 * warnings are logged but the CEO can still approve.
 */

import { CONTENT_RULES } from '../../config/ai.config';

// ── Types ─────────────────────────────────────────────────────

export interface ValidationIssue {
    type: 'critical' | 'warning';
    rule: string;
    detail: string;
}

export interface ValidationResult {
    valid: boolean;
    issues: ValidationIssue[];
    sanitizedHashtags?: string[];
}

export interface PostDraft {
    texto: string;
    hashtags: string[];
    formato_sugerido: 'text' | 'carousel' | 'image' | 'poll';
    hook_type: string;
    prompt_imagen: string;
    carousel_slides: string[];
    pregunta_engagement: string;
    prediccion_engagement: 'bajo' | 'medio' | 'alto';
    razon_prediccion: string;
}

// ── Service ───────────────────────────────────────────────────

class ContentValidatorService {
    /**
     * Validate a post draft against all content rules.
     * Critical issues → post should be blocked.
     * Warning issues → post can proceed but CEO should review.
     */
    validate(draft: PostDraft): ValidationResult {
        const issues: ValidationIssue[] = [];

        // 1. Character limit
        if (draft.texto.length > CONTENT_RULES.maxPostLength) {
            issues.push({
                type: 'warning',
                rule: 'max_length',
                detail: `Post tiene ${draft.texto.length} caracteres (máx ${CONTENT_RULES.maxPostLength})`,
            });
        }

        // 2. Hashtag limit (auto-fix: trim to 5)
        let sanitizedHashtags = [...draft.hashtags];
        if (sanitizedHashtags.length > CONTENT_RULES.maxHashtags) {
            sanitizedHashtags = sanitizedHashtags.slice(0, CONTENT_RULES.maxHashtags);
            issues.push({
                type: 'warning',
                rule: 'max_hashtags',
                detail: `Recortado de ${draft.hashtags.length} a ${CONTENT_RULES.maxHashtags} hashtags`,
            });
        }

        // 3. Delivery app names (CRITICAL)
        this.checkBlockedDeliveryApps(draft.texto, issues);

        // 4. Pricing patterns (CRITICAL)
        this.checkPricingPatterns(draft.texto, issues);

        // 5. Unapproved client names (CRITICAL)
        this.checkUnapprovedClients(draft.texto, issues);

        // 6. Prohibited vocabulary
        this.checkProhibitedWords(draft.texto, issues);

        // 7. Readability: linebreaks
        this.checkReadability(draft.texto, issues);

        // 8. Ends with question or CTA
        this.checkEndsWithEngagement(draft.texto, issues);

        const hasCritical = issues.some((i) => i.type === 'critical');

        return {
            valid: !hasCritical,
            issues,
            sanitizedHashtags,
        };
    }

    // ── Private Checks ────────────────────────────────────────

    private checkBlockedDeliveryApps(text: string, issues: ValidationIssue[]): void {
        for (const app of CONTENT_RULES.blockedDeliveryApps) {
            const regex = new RegExp(`\\b${this.escapeRegex(app)}\\b`, 'i');
            if (regex.test(text)) {
                issues.push({
                    type: 'critical',
                    rule: 'blocked_delivery_app',
                    detail: `Menciona app de delivery "${app}" por nombre. Reemplazá por "apps de delivery" o "intermediarios".`,
                });
            }
        }
    }

    private checkPricingPatterns(text: string, issues: ValidationIssue[]): void {
        for (const pattern of CONTENT_RULES.pricingPatterns) {
            const match = text.match(pattern);
            if (match) {
                issues.push({
                    type: 'critical',
                    rule: 'pricing_revealed',
                    detail: `Revela pricing: "${match[0]}". Removelo del post.`,
                });
            }
        }
    }

    private checkUnapprovedClients(text: string, issues: ValidationIssue[]): void {
        // Detect company-like names (capitalized words) that aren't approved
        const approvedLower = CONTENT_RULES.approvedClients.map((c) => c.toLowerCase());
        const approvedPattern = CONTENT_RULES.approvedClients.join('|');

        // Check for patterns like "en [CompanyName]" or "con [CompanyName]" that suggest client mention
        const clientMentionPattern = /(?:cliente|cadena|marca|partner)\s+(?:como\s+)?([A-ZÁÉÍÓÚ][a-záéíóú]+(?:\s+[A-ZÁÉÍÓÚ][a-záéíóú]+)*)/g;
        let match: RegExpExecArray | null;

        while ((match = clientMentionPattern.exec(text)) !== null) {
            const mentioned = match[1].trim();
            if (!approvedLower.includes(mentioned.toLowerCase())) {
                // Check if it's actually an approved client with different casing
                const isApproved = CONTENT_RULES.approvedClients.some(
                    (c) => c.toLowerCase() === mentioned.toLowerCase()
                );
                if (!isApproved) {
                    issues.push({
                        type: 'critical',
                        rule: 'unapproved_client',
                        detail: `Menciona cliente "${mentioned}" que no está aprobado. Clientes aprobados: ${CONTENT_RULES.approvedClients.join(', ')}.`,
                    });
                }
            }
        }
    }

    private checkProhibitedWords(text: string, issues: ValidationIssue[]): void {
        for (const word of CONTENT_RULES.prohibitedWords) {
            const regex = new RegExp(`\\b${this.escapeRegex(word)}\\b`, 'i');
            if (regex.test(text)) {
                issues.push({
                    type: 'warning',
                    rule: 'prohibited_word',
                    detail: `Usa vocabulario prohibido: "${word}". Reemplazá por algo más concreto.`,
                });
            }
        }
    }

    private checkReadability(text: string, issues: ValidationIssue[]): void {
        // Check if there's at least 1 linebreak every ~4 sentences
        const lines = text.split('\n').filter((l) => l.trim().length > 0);
        if (lines.length < 3 && text.length > 200) {
            issues.push({
                type: 'warning',
                rule: 'readability',
                detail: 'El post es un bloque de texto sin saltos de línea. LinkedIn favorece párrafos cortos.',
            });
        }
    }

    private checkEndsWithEngagement(text: string, issues: ValidationIssue[]): void {
        const trimmed = text.trim();
        const lastLine = trimmed.split('\n').pop()?.trim() || '';

        // Check for question mark or common CTA patterns
        const endsWithQuestion = lastLine.includes('?');
        const hasCTA = /(?:comentá|contame|decime|👇|⬇️|dejá|compartí)/i.test(lastLine);

        if (!endsWithQuestion && !hasCTA) {
            issues.push({
                type: 'warning',
                rule: 'no_engagement_close',
                detail: 'El post no termina con una pregunta o CTA. Los comentarios multiplican el alcance en LinkedIn.',
            });
        }
    }

    // ── Helpers ────────────────────────────────────────────────

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

// ── Singleton ─────────────────────────────────────────────────

export const contentValidator = new ContentValidatorService();
