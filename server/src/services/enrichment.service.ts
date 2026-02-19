// server/src/services/enrichment.service.ts
// Contact enrichment service: AI research + .md dossier generation

import fs from 'fs';
import path from 'path';
import { LinkedInContact, type ILinkedInContact, type IEnrichmentData } from '../models/linkedin-contact.model';
import { openRouterService } from './openrouter.service';
import { enrichmentValidator } from './enrichment-validator.service';
import { webSearchService } from './web-search.service';

// ── Paths ────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, '../../data');
const CONFIG_PATH = path.join(DATA_DIR, 'enrichment-config.json');
const ICP_PATH = path.join(DATA_DIR, 'cliente-ideal.md');
const DEENEX_PATH = path.join(DATA_DIR, 'deenex.md');
const CONTEXT_DIR = path.join(DATA_DIR, 'contacts-context');

// ── Types ────────────────────────────────────────────────────
interface EnrichmentConfig {
    autoEnrichOnStatus: string;
    maxEnrichmentsPerDay: number;
    delayBetweenRequests: number;
    model: string;
    reEnrichAfterDays: number;
}

// ── System Prompt ────────────────────────────────────────────
const ENRICHMENT_SYSTEM_PROMPT = `
Sos un organizador de datos comerciales B2B. Tu ÚNICA función es ORGANIZAR los datos que te proporciono en formato JSON estructurado.

## REGLAS CRÍTICAS

1. **SOLO usá datos proporcionados en el mensaje** — datos del perfil de LinkedIn y resultados de búsqueda web (si hay)
2. **Si un dato NO está en la información proporcionada**, poné "No verificado" — NUNCA inventes
3. **NUNCA inventes URLs, noticias, nombres de medios, ni datos de empresas**
4. **Indicá la fuente** de cada dato: "LinkedIn", "Búsqueda web", o "No verificado"

## FORMATO JSON REQUERIDO

Respondé EXACTAMENTE con este JSON (sin texto antes ni después):

{
  "personProfile": {
    "verifiedPosition": "cargo del perfil LinkedIn o No verificado",
    "positionSource": "LinkedIn / No verificado",
    "verifiedCompany": "empresa del perfil LinkedIn o No verificado",
    "companySource": "LinkedIn / No verificado",
    "summary": "resumen profesional basado en datos del perfil o No verificado",
    "summarySource": "LinkedIn / No verificado"
  },
  "personNews": [],
  "company": {
    "name": "nombre de la empresa o No verificado",
    "nameSource": "LinkedIn / Búsqueda web / No verificado",
    "description": "descripción de la empresa basada en datos proporcionados o No verificado",
    "descriptionSource": "Búsqueda web / LinkedIn / No verificado",
    "website": "URL real de búsqueda web o No verificado",
    "websiteSource": "Búsqueda web / No verificado",
    "category": "Categoría inferida del nombre si es obvio o No verificado",
    "categorySource": "Inferido del nombre / Búsqueda web / No verificado",
    "sector": "Gastronomía / Retail / Servicios / No verificado",
    "sectorSource": "Búsqueda web / Inferido / No verificado",
    "locationsCount": "No verificado",
    "locationsCountSource": "No verificado",
    "socialMedia": {
      "instagram": "No verificado",
      "twitter": "No verificado"
    },
    "socialMediaSource": "No verificado"
  },
  "companyNews": [],
  "keyInsights": [
    {
      "text": "insight basado SOLO en datos proporcionados",
      "source": "LinkedIn / Búsqueda web",
      "confidence": "high / medium / low"
    }
  ],
  "buyingSignals": [
    {
      "text": "señal de compra basada SOLO en datos proporcionados",
      "source": "LinkedIn / Búsqueda web",
      "evidence": "dato específico del perfil o búsqueda",
      "confidence": "high / medium / low"
    }
  ],
  "confidenceScore": 50,
  "dataQuality": "verified / partial / insufficient"
}

## NOTICIAS

- SOLO incluí noticias que aparezcan en los resultados de búsqueda web proporcionados
- Si NO hay resultados de búsqueda web, dejá companyNews y personNews como arrays vacíos []
- NUNCA inventes noticias ni URLs de medios

## CATEGORÍA

- Inferí la categoría del nombre de empresa si es obvio:
  - "Sushi" → "Restaurante de Sushi"
  - "Burger" → "Hamburguesería"
  - "Café/Coffee" → "Cafetería"
  - Si no es obvio, poné "No verificado"

## PUNTUACIÓN

- confidenceScore: 80-100 = muchos datos reales con fuentes, 50-70 = datos parciales, 0-40 = pocos datos
- dataQuality: "verified" = muchos datos con fuentes reales, "partial" = algunos datos, "insufficient" = muchos vacíos
- Si la mayoría de campos son "No verificado", el score debe ser bajo (0-40)
`;

// ── Service ──────────────────────────────────────────────────
class EnrichmentService {
    private enrichmentsToday = 0;
    private lastResetDate = new Date().toDateString();

    /**
     * Read enrichment config from JSON file.
     */
    getConfig(): EnrichmentConfig {
        try {
            const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
            return JSON.parse(raw);
        } catch {
            // Return defaults if file is missing
            // BUG FIX 3: Changed from 'mensaje_enviado' to 'interactuando' to match pipeline
            return {
                autoEnrichOnStatus: 'interactuando', // Trigger when prospecting finishes scraping
                maxEnrichmentsPerDay: 45,
                delayBetweenRequests: 4000,
                model: 'moonshotai/kimi-k2',
                reEnrichAfterDays: 30,
            };
        }
    }

    /**
     * Update enrichment config.
     */
    updateConfig(updates: Partial<EnrichmentConfig>): EnrichmentConfig {
        const current = this.getConfig();
        const updated = { ...current, ...updates };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 4), 'utf-8');
        return updated;
    }

    /**
     * Main enrichment function — enrich a single contact by MongoDB ID.
     */
    async enrichContact(contactId: string): Promise<ILinkedInContact> {
        // 0. Check OpenRouter is configured
        if (!openRouterService.isConfigured()) {
            throw new Error('OpenRouter no está configurado. Revisá OPENROUTER_API_KEY_1 en .env');
        }

        // 1. Find contact
        const contact = await LinkedInContact.findById(contactId);
        if (!contact) {
            throw new Error(`Contacto ${contactId} no encontrado`);
        }

        // 1.5. Validate contact has real data (not just vanity URL name)
        const looksLikeVanity = contact.fullName && !contact.fullName.includes(' ') && contact.fullName.length < 30;
        const hasBasicData = contact.fullName && (contact.headline || contact.currentCompany || contact.currentPosition);
        if (looksLikeVanity && !hasBasicData) {
            throw new Error(`Contacto "${contact.fullName}" no tiene datos scrapeados (solo vanity name). Esperá a que el prospecting complete el scraping.`);
        }

        // 2. Check daily limit
        this.resetDailyCounterIfNeeded();
        const config = this.getConfig();
        if (this.enrichmentsToday >= config.maxEnrichmentsPerDay) {
            throw new Error(`Límite diario alcanzado (${config.maxEnrichmentsPerDay} enriquecimientos/día)`);
        }

        console.log(`🔬 [Enrichment] Enriqueciendo: ${contact.fullName} (${contact.currentCompany || 'sin empresa'})`);

        // 3. Mark as enriching and update status
        contact.enrichmentStatus = 'enriching';
        contact.status = 'enriqueciendo';
        contact.enrichedAt = new Date();
        await contact.save();
        console.log(`   → Estado cambiado a: enriqueciendo`);

        try {
            // 4. Buscar información real en la web (si está disponible)
            let searchResults = null;
            if (webSearchService.isAvailable() && contact.currentCompany) {
                console.log(`🔍 [Enrichment] Buscando información web...`);
                searchResults = await webSearchService.searchCompany(contact.currentCompany);
                console.log(`   → Encontrado: ${searchResults.website ? 'Website ✓' : ''} ${searchResults.news.length} noticias`);
            }

            // 5. Build prompt con resultados de búsqueda
            const messages = this.buildPrompt(contact, searchResults);

            // 6. Call OpenRouter
            const rawResponse = await openRouterService.call(messages, {
                model: config.model,
                temperature: 0.2,
                max_tokens: 4096,
            });

            // 7. Parse JSON response
            const enrichmentData = this.parseResponse(rawResponse);

            // 6.5. VALIDAR que los datos sean reales
            const validation = enrichmentValidator.validate(
                enrichmentData,
                contact.currentCompany || undefined
            );

            console.log(enrichmentValidator.generateReport(validation));

            // 6.6. VALIDACIÓN HTTP de URLs (asíncrona, no bloqueante)
            console.log(`🔍 [Enrichment] Verificando URLs para ${contact.fullName}...`);
            const urlValidation = await enrichmentValidator.validateUrlsHttp(enrichmentData);

            if (urlValidation.brokenUrls.length > 0) {
                console.warn(`❌ [Enrichment] URLs rotas detectadas: ${urlValidation.brokenUrls.length}`);
                validation.warnings.push(...urlValidation.warnings);
                validation.score = Math.max(0, validation.score - urlValidation.brokenUrls.length * 20);
            }

            if (!validation.isValid || urlValidation.brokenUrls.length > 0) {
                console.warn(`⚠️ [Enrichment] Datos de baja calidad para ${contact.fullName} (score: ${validation.score})`);
                // Guardar igual pero marcar como de baja confianza
                contact.notes.push({
                    text: `⚠️ Enriquecimiento de baja calidad (score: ${validation.score}). Errores: ${validation.errors.join(', ')}. URLs rotas: ${urlValidation.brokenUrls.length}`,
                    createdAt: new Date()
                });
            }

            // 7. Save enrichment data to MongoDB
            contact.enrichmentData = enrichmentData;
            contact.enrichmentStatus = 'completed';
            contact.enrichedAt = new Date();

            // 8. Generate .md dossier file
            const vanityName = this.extractVanityName(contact.profileUrl);
            const mdContent = this.generateContextMd(contact, enrichmentData);
            const mdPath = path.join(CONTEXT_DIR, `${vanityName}.md`);

            // Ensure directory exists
            if (!fs.existsSync(CONTEXT_DIR)) {
                fs.mkdirSync(CONTEXT_DIR, { recursive: true });
            }

            fs.writeFileSync(mdPath, mdContent, 'utf-8');
            contact.contextFilePath = mdPath;

            // 9. Final status: esperando_aceptacion (pipeline continues)
            contact.status = 'esperando_aceptacion';
            contact.enrichmentStatus = 'completed';
            await contact.save();
            this.enrichmentsToday++;

            console.log(`✅ [Enrichment] Completado: ${contact.fullName} → ${mdPath}`);
            console.log(`   → Estado cambiado a: esperando_aceptacion`);
            return contact;

        } catch (error: any) {
            console.error(`❌ [Enrichment] Error: ${error.message}`);
            contact.enrichmentStatus = 'failed';
            await contact.save();
            throw error;
        }
    }

    /**
     * Trigger auto-enrichment when contact status changes.
     * Called from the PATCH /contacts/:id/status route.
     * Runs async — does NOT block the status update response.
     */
    async triggerAutoEnrichment(contactId: string, newStatus: string): Promise<void> {
        const config = this.getConfig();

        if (newStatus !== config.autoEnrichOnStatus) {
            return; // Not the trigger status, skip
        }

        // Check if already enriched recently
        const contact = await LinkedInContact.findById(contactId).lean();
        if (!contact) return;

        if (contact.enrichmentStatus === 'completed' && contact.enrichedAt) {
            const daysSinceEnrich = (Date.now() - new Date(contact.enrichedAt).getTime()) / (1000 * 60 * 60 * 24);
            if (daysSinceEnrich < config.reEnrichAfterDays) {
                console.log(`ℹ️ [Enrichment] ${contact.fullName} ya enriquecido hace ${Math.floor(daysSinceEnrich)} días, skip`);
                return;
            }
        }

        if (contact.enrichmentStatus === 'enriching') {
            console.log(`ℹ️ [Enrichment] ${contact.fullName} ya se está enriqueciendo, skip`);
            return;
        }

        // Fire and forget — don't await to avoid blocking status update
        console.log(`🚀 [Enrichment] Auto-trigger para ${contact.fullName} (status → ${newStatus})`);
        this.enrichContact(contactId).catch(err => {
            console.error(`❌ [Enrichment] Auto-enrichment failed for ${contact.fullName}: ${err.message}`);
        });
    }

    // ── Private helpers ──────────────────────────────────────

    /**
     * Build the prompt messages for OpenRouter.
     * Includes web search results if available.
     */
    private buildPrompt(contact: ILinkedInContact, searchResults: any = null): any[] {
        // Try loading ICP context
        let icpContext = '';
        try {
            icpContext = fs.readFileSync(ICP_PATH, 'utf-8');
        } catch {
            icpContext = 'ICP: Cadenas gastronómicas +5 locales, Argentina/LATAM';
        }

        // Try loading Deenex context (product info)
        let deenexContext = '';
        try {
            deenexContext = fs.readFileSync(DEENEX_PATH, 'utf-8');
        } catch {
            // Not critical — continue without product context
        }

        // Warn the AI if contact data is sparse
        const hasCompany = contact.currentCompany && contact.currentCompany !== 'No disponible';
        const hasHeadline = contact.headline && contact.headline !== 'No disponible';
        const sparseWarning = (!hasCompany && !hasHeadline)
            ? `\n\n⚠️ ATENCIÓN: Este contacto tiene datos MUY ESCASOS (sin empresa ni headline). Buscá su nombre en LinkedIn y en Google para encontrar info real. Si NO encontrás nada verificable, respondé con "No verificado" en la mayoría de campos. NO inventes datos.\n`
            : '';

        const company = contact.currentCompany || 'No disponible';
        const hasValidCompany = hasCompany && company !== 'No disponible';

        const userMessage = `
Investigá a esta persona y su empresa usando búsqueda web intensiva:

═══════════════════════════════════════
📋 DATOS DEL CONTACTO
═══════════════════════════════════════
**Nombre:** ${contact.fullName}
**Cargo:** ${contact.currentPosition || 'No disponible'}
**Empresa:** ${company}
**Headline:** ${contact.headline || 'No disponible'}
**Ubicación:** ${contact.location || 'No disponible'}
**LinkedIn:** ${contact.profileUrl}

${contact.about ? `**Bio LinkedIn:** ${contact.about.substring(0, 500)}` : ''}
${sparseWarning}

${searchResults ? `═══════════════════════════════════════
🔍 RESULTADOS DE BÚSQUEDA WEB REALES
═══════════════════════════════════════
${searchResults.website ? `**Website encontrado:** ${searchResults.website}` : '**Website:** No encontrado'}
${searchResults.description ? `\n**Descripción encontrada:** ${searchResults.description.substring(0, 300)}` : ''}
${searchResults.news.length > 0 ? `\n**Noticias encontradas:**\n${searchResults.news.map((n: any, i: number) => `${i + 1}. "${n.title}" - ${n.source}\n   URL: ${n.link}\n   Resumen: ${n.snippet?.substring(0, 150)}...`).join('\n')}` : '**Noticias:** No se encontraron noticias'}
` : '**⚠️ Búsqueda web no disponible - Usar datos del perfil de LinkedIn únicamente**'}

═══════════════════════════════════════
🎯 CONTEXTO DEL CLIENTE IDEAL (ICP)
═══════════════════════════════════════
${icpContext.substring(0, 1000)}

${deenexContext ? `═══════════════════════════════════════\n📦 CONTEXTO DEL PRODUCTO (Deenex)\n═══════════════════════════════════════\n${deenexContext.substring(0, 2000)}` : ''}

═══════════════════════════════════════
⚠️ INSTRUCCIONES
═══════════════════════════════════════

${hasValidCompany
                ? `Organizá los datos proporcionados arriba sobre "${contact.fullName}" y "${company}" en el formato JSON solicitado.`
                : `⚠️ NO HAY EMPRESA IDENTIFICADA — el enriquecimiento será limitado. Solo organizá los datos del perfil.`}

**REGLAS:**
1. SOLO usá datos del perfil de LinkedIn y los resultados de búsqueda web proporcionados arriba
2. Si NO hay resultados de búsqueda web, dejá companyNews y personNews como arrays vacíos []
3. NUNCA inventes URLs, noticias, ni datos que no estén en la información proporcionada
4. Si un dato no está disponible, poné "No verificado"
5. company.category: inferí del nombre si es obvio (ej: "Sushi" → "Restaurante de Sushi"), sino "No verificado"
6. Respondé SOLO con el JSON, sin texto antes ni después
`;

        return [
            { role: 'system' as const, content: ENRICHMENT_SYSTEM_PROMPT.trim() },
            { role: 'user' as const, content: userMessage.trim() },
        ];
    }

    /**
     * Parse OpenRouter response into IEnrichmentData.
     * Handles cases where K2 wraps JSON in markdown code blocks or adds text.
     * Normalizes data to ensure all required fields are present.
     */
    private parseResponse(text: string): IEnrichmentData {
        let parsed: any = null;

        // 1. Direct parse attempt
        try {
            parsed = JSON.parse(text);
        } catch { }

        // 2. Try extracting from markdown code block
        if (!parsed) {
            const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlockMatch) {
                try {
                    parsed = JSON.parse(codeBlockMatch[1].trim());
                } catch { }
            }
        }

        // 3. Try extracting any JSON object from the text
        if (!parsed) {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    parsed = JSON.parse(jsonMatch[0]);
                } catch { }
            }
        }

        // 4. Fallback: return minimal data
        if (!parsed) {
            console.warn('⚠️ [Enrichment] No se pudo parsear JSON, usando datos mínimos');
            console.warn('📝 [Enrichment] Respuesta raw (primeros 500 chars):', text.substring(0, 500));
            parsed = {
                personProfile: {},
                personNews: [],
                company: {},
                companyNews: [],
                keyInsights: [],
                buyingSignals: [],
                confidenceScore: 0,
                dataQuality: 'insufficient',
            };
        }

        // 5. Normalize data — ensure all required fields exist
        return this.normalizeEnrichmentData(parsed);
    }

    /**
     * Normalize enrichment data to ensure all required fields exist.
     * Guarantees exactly 3 company news items and all required fields.
     * Includes source tracking for anti-hallucination.
     */
    private normalizeEnrichmentData(data: any): IEnrichmentData {
        const emptyNewsItem = {
            title: 'No verificado',
            source: 'No verificado',
            url: 'No verificado',
            date: 'No verificado',
            summary: 'No verificado',
        };

        // Only keep real news items — don't pad with empty/fake ones
        let companyNews = (data.companyNews || [])
            .filter((n: any) => n.title && n.title !== 'No verificado')
            .slice(0, 5);

        // Ensure personNews exists
        const personNews = (data.personNews || []).map((n: any) => ({
            title: n.title || 'No verificado',
            source: n.source || 'No verificado',
            url: n.url || 'No verificado',
            date: n.date || 'No verificado',
            summary: n.summary || 'No verificado',
        }));

        // Normalize company data with sources
        const company = data.company || {};
        const pp = data.personProfile || {};

        // Normalize insights with sources
        const keyInsights = (data.keyInsights || []).map((insight: any) => {
            if (typeof insight === 'string') {
                return { text: insight, source: 'No verificado', confidence: 'low' };
            }
            return {
                text: insight.text || insight || 'No verificado',
                source: insight.source || 'No verificado',
                confidence: insight.confidence || 'low',
            };
        });

        // Normalize buying signals with sources
        const buyingSignals = (data.buyingSignals || []).map((signal: any) => {
            if (typeof signal === 'string') {
                return { text: signal, source: 'No verificado', evidence: 'No verificado', confidence: 'low' };
            }
            return {
                text: signal.text || signal || 'No verificado',
                source: signal.source || 'No verificado',
                evidence: signal.evidence || 'No verificado',
                confidence: signal.confidence || 'low',
            };
        });

        return {
            personProfile: {
                verifiedPosition: pp.verifiedPosition || 'No verificado',
                positionSource: pp.positionSource || 'No verificado',
                verifiedCompany: pp.verifiedCompany || 'No verificado',
                companySource: pp.companySource || 'No verificado',
                summary: pp.summary || 'No verificado',
                summarySource: pp.summarySource || 'No verificado',
            },
            personNews,
            company: {
                name: company.name || 'No verificado',
                nameSource: company.nameSource || 'No verificado',
                description: company.description || 'No verificado',
                descriptionSource: company.descriptionSource || 'No verificado',
                website: company.website || 'No verificado',
                websiteSource: company.websiteSource || 'No verificado',
                category: company.category || 'No verificado',
                categorySource: company.categorySource || 'No verificado',
                sector: company.sector || 'No verificado',
                sectorSource: company.sectorSource || 'No verificado',
                locationsCount: company.locationsCount || 'No verificado',
                locationsCountSource: company.locationsCountSource || 'No verificado',
                socialMedia: {
                    instagram: company.socialMedia?.instagram || 'No verificado',
                    twitter: company.socialMedia?.twitter || 'No verificado',
                },
                socialMediaSource: company.socialMediaSource || 'No verificado',
            },
            companyNews: companyNews.map((n: any) => ({
                title: n.title || 'No verificado',
                source: n.source || 'No verificado',
                url: n.url || 'No verificado',
                date: n.date || 'No verificado',
                summary: n.summary || 'No verificado',
            })),
            keyInsights: keyInsights.length > 0 ? keyInsights : [{ text: 'No se encontraron insights verificables', source: 'N/A', confidence: 'low' }],
            buyingSignals: buyingSignals.length > 0 ? buyingSignals : [{ text: 'No se encontraron señales de compra verificables', source: 'N/A', evidence: 'N/A', confidence: 'low' }],
            confidenceScore: data.confidenceScore || 0,
            dataQuality: data.dataQuality || 'insufficient',
        };
    }

    /**
     * Generate the .md dossier file content for a contact.
     * Includes source attribution for anti-hallucination transparency.
     */
    private generateContextMd(contact: ILinkedInContact, data: IEnrichmentData): string {
        const now = new Date().toISOString().split('T')[0];
        const confScore = data.confidenceScore || 0;
        const getConfEmoji = (score: number): string => {
            if (score >= 80) return '🟢';
            if (score >= 60) return '🟡';
            return '🔴';
        };

        let md = `# 📇 ${contact.fullName} — Dossier de Contacto\n\n`;
        md += `**Generado:** ${now} | **Modelo:** Kimi K2 via OpenRouter\n`;
        md += `**Calidad de datos:** ${data.dataQuality || 'unknown'} | **Confianza:** ${getConfEmoji(confScore)} ${confScore}/100\n\n`;
        md += `---\n\n`;

        // Profile section
        md += `## 👤 Perfil LinkedIn\n\n`;
        md += `- **Nombre:** ${contact.fullName}\n`;
        md += `- **Cargo:** ${data.personProfile?.verifiedPosition || contact.currentPosition || 'No disponible'}\n`;
        if (data.personProfile?.positionSource && data.personProfile.positionSource !== 'No verificado') {
            md += `  *Fuente: ${data.personProfile.positionSource}*\n`;
        }
        md += `- **Empresa:** ${data.personProfile?.verifiedCompany || contact.currentCompany || 'No disponible'}\n`;
        if (data.personProfile?.companySource && data.personProfile.companySource !== 'No verificado') {
            md += `  *Fuente: ${data.personProfile.companySource}*\n`;
        }
        md += `- **Headline:** ${contact.headline || 'No disponible'}\n`;
        md += `- **Ubicación:** ${contact.location || 'No disponible'}\n`;
        if (contact.connectionsCount) md += `- **Conexiones:** ${contact.connectionsCount}\n`;
        md += `\n`;

        if (data.personProfile?.summary && data.personProfile.summary !== 'No verificado') {
            md += `### Bio\n${data.personProfile.summary}\n`;
            if (data.personProfile.summarySource && data.personProfile.summarySource !== 'No verificado') {
                md += `*Fuente: ${data.personProfile.summarySource}*\n`;
            }
            md += `\n`;
        } else if (contact.about) {
            md += `### Bio\n${contact.about}\n\n`;
        }

        // Experience
        if (contact.experience && contact.experience.length > 0) {
            md += `### Experiencia\n`;
            contact.experience.slice(0, 3).forEach((exp, i) => {
                md += `${i + 1}. **${exp.position}** — ${exp.company}${exp.duration ? ` (${exp.duration})` : ''}\n`;
            });
            md += `\n`;
        }

        // Education
        if (contact.education && contact.education.length > 0) {
            md += `### Educación\n`;
            contact.education.slice(0, 2).forEach((edu, i) => {
                md += `${i + 1}. **${edu.degree || 'N/A'}** — ${edu.institution}${edu.years ? ` (${edu.years})` : ''}\n`;
            });
            md += `\n`;
        }

        md += `---\n\n`;

        // Company section with sources
        if (data.company) {
            md += `## 🏢 Empresa: ${data.company.name || contact.currentCompany || 'No disponible'}\n`;
            if (data.company.nameSource && data.company.nameSource !== 'No verificado') {
                md += `*Fuente nombre: ${data.company.nameSource}*\n`;
            }
            md += `\n`;

            if (data.company.description && data.company.description !== 'No verificado') {
                md += `### Descripción Completa\n${data.company.description}\n`;
                if (data.company.descriptionSource && data.company.descriptionSource !== 'No verificado') {
                    md += `*Fuente: ${data.company.descriptionSource}*\n`;
                }
                md += `\n`;
            }

            md += `### Datos Clave\n`;
            if (data.company.category && data.company.category !== 'No verificado') {
                md += `- **Categoría:** ${data.company.category}\n`;
                if (data.company.categorySource && data.company.categorySource !== 'No verificado') {
                    md += `  *Fuente: ${data.company.categorySource}*\n`;
                }
            }
            if (data.company.sector && data.company.sector !== 'No verificado') {
                md += `- **Sector:** ${data.company.sector}\n`;
                if (data.company.sectorSource && data.company.sectorSource !== 'No verificado') {
                    md += `  *Fuente: ${data.company.sectorSource}*\n`;
                }
            }
            if (data.company.locationsCount && data.company.locationsCount !== 'No verificado') {
                md += `- **Cantidad de Locales:** ${data.company.locationsCount}\n`;
                if (data.company.locationsCountSource && data.company.locationsCountSource !== 'No verificado') {
                    md += `  *Fuente: ${data.company.locationsCountSource}*\n`;
                }
            }
            if (data.company.website && data.company.website !== 'No verificado') {
                md += `- **Website:** [${data.company.website}](${data.company.website})\n`;
                if (data.company.websiteSource && data.company.websiteSource !== 'No verificado') {
                    md += `  *Fuente: ${data.company.websiteSource}*\n`;
                }
            }

            if (data.company.socialMedia?.instagram || data.company.socialMedia?.twitter) {
                md += `- **Redes Sociales:**`;
                if (data.company.socialMedia?.instagram) md += ` Instagram ${data.company.socialMedia.instagram}`;
                if (data.company.socialMedia?.twitter) md += ` Twitter ${data.company.socialMedia.twitter}`;
                md += `\n`;
                if (data.company.socialMediaSource && data.company.socialMediaSource !== 'No verificado') {
                    md += `  *Fuente: ${data.company.socialMediaSource}*\n`;
                }
            }
            md += `\n---\n\n`;
        }

        // Person news
        if (data.personNews && data.personNews.length > 0) {
            md += `## 📰 Noticias de ${contact.fullName}\n\n`;
            data.personNews.forEach((news, i) => {
                md += `${i + 1}. **"${news.title}"**\n`;
                if (news.source) md += `   - Fuente: ${news.source}\n`;
                if (news.date) md += `   - Fecha: ${news.date}\n`;
                if (news.url) md += `   - URL: ${news.url}\n`;
                if (news.summary) md += `   - Resumen: ${news.summary}\n`;
                md += `\n`;
            });
            md += `---\n\n`;
        }

        // Company news
        if (data.companyNews && data.companyNews.length > 0) {
            md += `## 📰 Noticias de ${data.company?.name || contact.currentCompany || 'la empresa'}\n\n`;
            data.companyNews.forEach((news, i) => {
                md += `${i + 1}. **"${news.title}"**\n`;
                if (news.source) md += `   - Fuente: ${news.source}\n`;
                if (news.url) md += `   - URL: ${news.url}\n`;
                if (news.summary) md += `   - Resumen: ${news.summary}\n`;
                md += `\n`;
            });
            md += `---\n\n`;
        }

        // Key insights with sources
        if (data.keyInsights && data.keyInsights.length > 0) {
            md += `## 💡 Insights Clave\n\n`;
            data.keyInsights.forEach((insight, i) => {
                const text = typeof insight === 'string' ? insight : insight.text;
                const source = typeof insight === 'object' ? insight.source : null;
                const confidence = typeof insight === 'object' ? insight.confidence : null;
                const confEmoji = confidence === 'high' ? '🟢' : confidence === 'medium' ? '🟡' : '🔴';

                md += `${i + 1}. ${text}\n`;
                if (source && source !== 'No verificado') {
                    md += `   ${confEmoji} *Fuente: ${source}*\n`;
                }
            });
            md += `\n`;
        }

        // Buying signals with sources and evidence
        if (data.buyingSignals && data.buyingSignals.length > 0) {
            md += `## 🚦 Señales de Compra\n\n`;
            data.buyingSignals.forEach((signal, i) => {
                const text = typeof signal === 'string' ? signal : signal.text;
                const source = typeof signal === 'object' ? signal.source : null;
                const evidence = typeof signal === 'object' ? signal.evidence : null;
                const confidence = typeof signal === 'object' ? signal.confidence : null;
                const confEmoji = confidence === 'high' ? '🟢' : confidence === 'medium' ? '🟡' : '🔴';

                md += `${i + 1}. ${text}\n`;
                if (source && source !== 'No verificado') {
                    md += `   ${confEmoji} *Fuente: ${source}*\n`;
                }
                if (evidence && evidence !== 'No verificado') {
                    md += `   📋 *Evidencia: ${evidence}*\n`;
                }
            });
            md += `\n`;
        }

        // Data quality disclaimer
        if (confScore < 60) {
            md += `---\n\n`;
            md += `⚠️ **Advertencia de calidad de datos**\n\n`;
            md += `Este dossier contiene datos de baja confianza (${confScore}/100). `;
            md += `Algunos datos pueden estar desactualizados o no estar verificados. `;
            md += `Se recomienda verificar la información crítica antes de usarla en decisiones comerciales.\n`;
        }

        return md;
    }

    /**
     * Extract vanity name from LinkedIn profile URL.
     * e.g., "https://www.linkedin.com/in/carlosjacoste/" → "carlosjacoste"
     */
    private extractVanityName(profileUrl: string): string {
        const match = profileUrl.match(/linkedin\.com\/in\/([^/?]+)/);
        return match ? match[1].replace(/\/$/, '') : `contact-${Date.now()}`;
    }

    /**
     * Reset the daily counter if the date changed.
     */
    private resetDailyCounterIfNeeded(): void {
        const today = new Date().toDateString();
        if (today !== this.lastResetDate) {
            this.enrichmentsToday = 0;
            this.lastResetDate = today;
        }
    }
}

export const enrichmentService = new EnrichmentService();
