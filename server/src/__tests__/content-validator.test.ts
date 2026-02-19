/**
 * Unit Tests — Content Validator Service
 *
 * Tests security guardrails: blocked delivery apps, pricing patterns,
 * unapproved clients, character limits, and readability warnings.
 *
 * Run with: npx jest src/__tests__/content-validator.test.ts --verbose
 */

import { contentValidator, type PostDraft } from '../services/linkedin/content-validator.service';

// ── Helpers ──────────────────────────────────────────────────

function makeDraft(overrides: Partial<PostDraft> = {}): PostDraft {
    return {
        texto: 'Test post about canal propio, una reflexión sobre nuestro trabajo.',
        hashtags: ['#CanalPropio', '#Deenex', '#LATAM'],
        formato_sugerido: 'text',
        hook_type: 'dato_impactante',
        prompt_imagen: 'data card showing metrics',
        carousel_slides: [],
        pregunta_engagement: '¿Qué opinás?',
        prediccion_engagement: 'medio',
        razon_prediccion: 'Tema relevante',
        ...overrides,
    };
}

// ── Tests ────────────────────────────────────────────────────

describe('ContentValidatorService', () => {

    // ── Valid Content ────────────────────────────────────────

    describe('Valid Content', () => {
        it('should pass clean content', () => {
            const result = contentValidator.validate(makeDraft());
            expect(result.valid).toBe(true);
            expect(result.issues.filter(i => i.type === 'critical')).toHaveLength(0);
        });

        it('should pass with approved client names', () => {
            const result = contentValidator.validate(makeDraft({
                texto: 'Coquitos pasó de 50 a 100 sucursales este año. Increíble.',
            }));
            expect(result.valid).toBe(true);
        });
    });

    // ── Critical: Blocked Delivery Apps ──────────────────────

    describe('Blocked Delivery Apps', () => {
        it('should flag mentions of Rappi', () => {
            const result = contentValidator.validate(makeDraft({
                texto: 'Rappi cobra comisiones altísimas a los restaurantes.',
            }));
            const critical = result.issues.filter(i => i.type === 'critical');
            expect(critical.length).toBeGreaterThan(0);
            expect(critical.some(i => i.detail.toLowerCase().includes('rappi'))).toBe(true);
        });

        it('should flag mentions of PedidosYa', () => {
            const result = contentValidator.validate(makeDraft({
                texto: 'PedidosYa se lleva el 30% del ticket promedio.',
            }));
            expect(result.valid).toBe(false);
        });

        it('should flag mentions of Uber Eats', () => {
            const result = contentValidator.validate(makeDraft({
                texto: 'Con Uber Eats perdés margen cada día.',
            }));
            expect(result.valid).toBe(false);
        });
    });

    // ── Critical: Pricing Patterns ──────────────────────────

    describe('Pricing Patterns', () => {
        it('should flag USD pricing', () => {
            const result = contentValidator.validate(makeDraft({
                texto: 'Nuestro plan cuesta USD 200 por mes.',
            }));
            expect(result.valid).toBe(false);
        });

        it('should flag dollar sign pricing', () => {
            const result = contentValidator.validate(makeDraft({
                texto: 'Por solo $99 podés comenzar con Deenex.',
            }));
            expect(result.valid).toBe(false);
        });
    });

    // ── Critical: Unapproved Client Mentions ────────────────

    describe('Unapproved Clients', () => {
        it('should flag unapproved client names', () => {
            const result = contentValidator.validate(makeDraft({
                texto: 'Trabajamos con la cadena como Burgerton para su canal propio.',
            }));
            const critical = result.issues.filter(i => i.type === 'critical');
            expect(critical.some(i => i.rule === 'unapproved_client')).toBe(true);
        });
    });

    // ── Warnings ─────────────────────────────────────────────

    describe('Warnings', () => {
        it('should warn about too many hashtags', () => {
            const result = contentValidator.validate(makeDraft({
                hashtags: ['#a', '#b', '#c', '#d', '#e', '#f', '#g'],
            }));
            const warnings = result.issues.filter(i => i.type === 'warning');
            expect(warnings.some(i => i.rule === 'max_hashtags')).toBe(true);
        });

        it('should warn about post length exceeding limit', () => {
            const result = contentValidator.validate(makeDraft({
                texto: 'x'.repeat(3500),
            }));
            const warnings = result.issues.filter(i => i.type === 'warning');
            expect(warnings.some(i => i.rule === 'max_length')).toBe(true);
        });

        it('should warn about prohibited vocabulary', () => {
            const result = contentValidator.validate(makeDraft({
                texto: 'Nuestra sinergia con el ecosistema es disruptivo.',
            }));
            const warnings = result.issues.filter(i => i.type === 'warning');
            expect(warnings.some(i => i.rule === 'prohibited_word')).toBe(true);
        });
    });

    // ── Edge Cases ──────────────────────────────────────────

    describe('Edge Cases', () => {
        it('should handle empty text', () => {
            const result = contentValidator.validate(makeDraft({ texto: '' }));
            // Should not crash
            expect(result).toBeDefined();
        });

        it('should handle no hashtags', () => {
            const result = contentValidator.validate(makeDraft({ hashtags: [] }));
            expect(result).toBeDefined();
        });

        it('should be case-insensitive for delivery app detection', () => {
            const result = contentValidator.validate(makeDraft({
                texto: 'rappi es tremendamente caro para cadenas.',
            }));
            expect(result.valid).toBe(false);
        });
    });
});
