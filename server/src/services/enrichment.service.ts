// server/src/services/enrichment.service.ts
// Contact enrichment service: AI research + .md dossier generation

import fs from 'fs';
import path from 'path';
import { LinkedInContact, type ILinkedInContact, type IEnrichmentData } from '../models/linkedin-contact.model';
import { openRouterService } from './openrouter.service';
import { enrichmentValidator } from './enrichment-validator.service';
import { webSearchService } from './web-search.service';
import { googleMapsService } from './google-maps.service';
import { instagramScraper } from './instagram-scraper.service';
import { websiteScraper } from './website-scraper.service';
import { deepLinkedInScraper } from './deep-linkedin-scraper.service';

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
Sos un analista de inteligencia comercial B2B experto. Tu trabajo es organizar y sintetizar datos reales de múltiples fuentes para generar un dossier de venta accionable.

## REGLAS CRÍTICAS

1. **SOLO usá datos proporcionados en el mensaje** — LinkedIn, búsqueda web, website, Google Maps, Instagram
2. **Si un dato NO está disponible**, poné "No verificado" — NUNCA inventes
3. **NUNCA inventes URLs, noticias, nombres de medios, ni datos de empresas**
4. **Indicá la fuente** de cada dato: "LinkedIn", "Búsqueda web", "Website", "Google Maps", "Instagram", o "No verificado"

## FORMATO JSON REQUERIDO

Respondé EXACTAMENTE con este JSON (sin texto antes ni después):

{
  "personProfile": {
    "verifiedPosition": "cargo o No verificado",
    "positionSource": "LinkedIn / No verificado",
    "verifiedCompany": "empresa o No verificado",
    "companySource": "LinkedIn / No verificado",
    "summary": "resumen profesional o No verificado",
    "summarySource": "LinkedIn / No verificado"
  },
  "personNews": [],
  "company": {
    "name": "nombre o No verificado",
    "nameSource": "LinkedIn / Búsqueda web / No verificado",
    "description": "descripción o No verificado",
    "descriptionSource": "Búsqueda web / Website / No verificado",
    "website": "URL real o No verificado",
    "websiteSource": "Búsqueda web / No verificado",
    "category": "Categoría o No verificado",
    "categorySource": "Google Maps / Inferido / No verificado",
    "sector": "sector o No verificado",
    "sectorSource": "Búsqueda web / Inferido / No verificado",
    "locationsCount": "cant de sucursales o No verificado",
    "locationsCountSource": "Google Maps / No verificado",
    "socialMedia": {
      "instagram": "@handle o No verificado",
      "twitter": "@handle o No verificado"
    },
    "socialMediaSource": "Website / Instagram / No verificado"
  },
  "companyNews": [],

  "experienceSummary": "Career path de la persona en 2-3 líneas basado en su historial laboral",
  "educationSummary": "Formación académica en 1 línea",
  "skillsHighlight": ["skill1", "skill2", "skill3"],

  "commercialScore": 50,
  "commercialScoreBreakdown": {
    "companySize": 10,
    "digitalPresence": 10,
    "growthSignals": 10,
    "decisionPower": 10,
    "approachability": 10
  },

  "personalizedPitch": "Pitch personalizado de 2-3 oraciones usando datos REALES del contacto",

  "painPoints": [
    "Pain point detectado del sector/empresa basado en datos reales"
  ],

  "talkingPoints": [
    "Tema de conversación basado en datos reales del contacto"
  ],

  "bestApproachChannel": "LinkedIn / WhatsApp / Email",

  "keyInsights": [
    {
      "text": "insight basado SOLO en datos proporcionados",
      "source": "LinkedIn / Búsqueda web / Website / Google Maps / Instagram",
      "confidence": "high / medium / low"
    }
  ],
  "buyingSignals": [
    {
      "text": "señal de compra",
      "source": "fuente",
      "evidence": "dato específico",
      "confidence": "high / medium / low"
    }
  ],

  "confidenceScore": 50,
  "dataQuality": "verified / partial / insufficient"
}

## NOTICIAS
- SOLO incluí noticias de los resultados de búsqueda web proporcionados
- Si NO hay resultados, dejá arrays vacíos []
- NUNCA inventes noticias ni URLs

## COMMERCIAL SCORE (0-100)
- companySize (0-20): cantidad de empleados, sucursales, escala
- digitalPresence (0-20): website, social media, actividad online
- growthSignals (0-20): expansión, contrataciones, nuevos productos
- decisionPower (0-20): cargo de la persona (CEO/Fundador = 18-20, Gerente = 12-15)
- approachability (0-20): facilidad de contacto, actividad en LinkedIn

## PITCH PERSONALIZADO
- Usá el nombre de pila del contacto
- Mencioná algo específico de SU empresa o trayectoria
- Máximo 2-3 oraciones cortas y directas
- Ejemplo: "Dario, vi que Trigal lleva +20 años liderando congelados. Tu historia de emprendimiento es increíble."

## PAIN POINTS
- Detectá 2-4 problemas potenciales basados en el sector, tamaño de empresa, y datos disponibles
- Ejemplo: "Logística de cadena de frío" para empresa de congelados

## TALKING POINTS
- 2-4 temas de conversación para romper el hielo
- Basados en datos REALES: posts, trayectoria, historia de la empresa
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
            // ═══ DEEP ENRICHMENT 2.0: Multi-source intelligence ═══
            const rawIntel: any = {};

            // 4a. SerpAPI Web Search (existing)
            if (webSearchService.isAvailable() && contact.currentCompany) {
                console.log(`🔍 [Enrichment] Buscando información web...`);
                rawIntel.webSearch = await webSearchService.searchCompany(contact.currentCompany);
                console.log(`   → Encontrado: ${rawIntel.webSearch.website ? 'Website ✓' : ''} ${rawIntel.webSearch.news.length} noticias`);
            }

            // 4b. Deep LinkedIn Scrape (NEW)
            try {
                // Import linkedInService lazily to avoid circular dependency
                const { linkedinService } = await import('./linkedin.service');
                const activePage = linkedinService.getActivePageFromAny();
                if (activePage) {
                    console.log(`🔍 [Enrichment] LinkedIn deep scrape...`);
                    rawIntel.deepLinkedIn = await deepLinkedInScraper.scrapeDeep(activePage, contact.profileUrl);
                    const dli = rawIntel.deepLinkedIn;
                    console.log(`   → Deep: ${dli.experienceHistory?.length || 0} exp, ${dli.educationHistory?.length || 0} edu, ${dli.skillsList?.length || 0} skills, ${dli.about ? 'about ✓' : ''} ${dli.recentPosts?.length || 0} posts`);
                } else {
                    console.log(`⚠️ [Enrichment] LinkedIn browser no disponible para deep scrape`);
                }
            } catch (e: any) { console.log(`⚠️ [Enrichment] Deep LinkedIn scrape failed: ${e.message?.substring(0, 60)}`); }

            // 4c. Website Scrape (NEW)
            const websiteUrl = rawIntel.webSearch?.website;
            if (websiteUrl) {
                try {
                    console.log(`🌐 [Enrichment] Scraping website: ${websiteUrl}`);
                    rawIntel.website = await websiteScraper.scrapeWebsite(websiteUrl);
                    const ws = rawIntel.website;
                    console.log(`   → Website: ${ws.homepage?.title ? 'homepage ✓' : ''} ${ws.about ? 'about ✓' : ''} ${ws.team?.members?.length ? ws.team.members.length + ' team' : ''} ${Object.keys(ws.socialLinks || {}).length} social`);
                } catch (e: any) { console.log(`⚠️ [Enrichment] Website scrape failed: ${e.message?.substring(0, 60)}`); }
            }

            // 4d. Google Maps (NEW)
            if (contact.currentCompany) {
                try {
                    console.log(`📍 [Enrichment] Buscando en Google Maps...`);
                    rawIntel.googleMaps = await googleMapsService.searchBusiness(contact.currentCompany, contact.location || undefined);
                    if (rawIntel.googleMaps.found) {
                        console.log(`   → Maps: ${rawIntel.googleMaps.rating}★ (${rawIntel.googleMaps.reviewCount} reviews), ${rawIntel.googleMaps.locationCount} ubicación(es)`);
                    }
                } catch (e: any) { console.log(`⚠️ [Enrichment] Google Maps failed: ${e.message?.substring(0, 60)}`); }
            }

            // 4e. Instagram (NEW)
            if (contact.currentCompany) {
                try {
                    console.log(`📸 [Enrichment] Buscando Instagram...`);
                    rawIntel.instagram = await instagramScraper.searchProfile(contact.currentCompany);
                    if (rawIntel.instagram.found) {
                        console.log(`   → Instagram: @${rawIntel.instagram.handle} — ${rawIntel.instagram.followers ? rawIntel.instagram.followers + ' followers' : 'followers?'}`);
                    }
                } catch (e: any) { console.log(`⚠️ [Enrichment] Instagram failed: ${e.message?.substring(0, 60)}`); }
            }

            const searchResults = rawIntel.webSearch || null;

            // 5. Build prompt con resultados de búsqueda
            const messages = this.buildPrompt(contact, searchResults, rawIntel);

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

            // 7. Merge raw intel data into enrichment data (preserve scraped data)
            if (rawIntel.deepLinkedIn) {
                enrichmentData.deepLinkedIn = {
                    experienceHistory: rawIntel.deepLinkedIn.experienceHistory || [],
                    educationHistory: rawIntel.deepLinkedIn.educationHistory || [],
                    skillsList: rawIntel.deepLinkedIn.skillsList || [],
                    about: rawIntel.deepLinkedIn.about,
                    recentPosts: rawIntel.deepLinkedIn.recentPosts || [],
                    followersCount: rawIntel.deepLinkedIn.followersCount,
                    connectionsCount: rawIntel.deepLinkedIn.connectionsCount,
                };
            }
            if (rawIntel.website) {
                enrichmentData.companyWebsite = {
                    slogan: rawIntel.website.homepage?.slogan,
                    founders: rawIntel.website.about?.founders,
                    history: rawIntel.website.about?.history,
                    mission: rawIntel.website.about?.mission,
                    yearFounded: rawIntel.website.about?.yearFounded,
                    products: rawIntel.website.products?.items,
                    techStack: rawIntel.website.homepage?.techStack,
                    socialLinks: rawIntel.website.socialLinks,
                    contactInfo: rawIntel.website.contactInfo,
                };
            }
            if (rawIntel.googleMaps?.found) {
                enrichmentData.googleMaps = {
                    rating: rawIntel.googleMaps.rating,
                    reviewCount: rawIntel.googleMaps.reviewCount,
                    address: rawIntel.googleMaps.address,
                    locationCount: rawIntel.googleMaps.locationCount,
                    category: rawIntel.googleMaps.category,
                    phone: rawIntel.googleMaps.phone,
                    priceLevel: rawIntel.googleMaps.priceLevel,
                };
            }
            if (rawIntel.instagram?.found) {
                enrichmentData.instagram = {
                    handle: rawIntel.instagram.handle,
                    url: rawIntel.instagram.url,
                    followers: rawIntel.instagram.followers,
                    bio: rawIntel.instagram.bio,
                };
            }

            // 7b. Save enrichment data to MongoDB
            contact.enrichmentData = enrichmentData;
            contact.enrichmentStatus = 'completed';
            contact.enrichedAt = new Date();

            // 7c. Propagate profile photo from deep scrape if we don't already have one
            if (rawIntel.deepLinkedIn?.profilePhotoUrl && !contact.profilePhotoUrl) {
                contact.profilePhotoUrl = rawIntel.deepLinkedIn.profilePhotoUrl;
                console.log(`   📸 Profile photo captured from deep scrape`);
            }

            // 7d. Back-fill position/company from AI-enriched data if scraper didn't capture them
            const pp = enrichmentData.personProfile;
            if (pp) {
                if (!contact.currentPosition && pp.verifiedPosition && pp.verifiedPosition !== 'No verificado') {
                    contact.currentPosition = pp.verifiedPosition;
                    console.log(`   📋 Position back-filled from enrichment: ${pp.verifiedPosition}`);
                }
                if (!contact.currentCompany && pp.verifiedCompany && pp.verifiedCompany !== 'No verificado') {
                    contact.currentCompany = pp.verifiedCompany;
                    console.log(`   🏢 Company back-filled from enrichment: ${pp.verifiedCompany}`);
                }
            }

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
    private buildPrompt(contact: ILinkedInContact, searchResults: any = null, rawIntel: any = {}): any[] {
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
            ? `\n\n⚠️ ATENCIÓN: Este contacto tiene datos MUY ESCASOS. Usá lo que haya disponible. Si NO encontrás nada verificable, respondé con "No verificado" en la mayoría de campos. NO inventes datos.\n`
            : '';

        const company = contact.currentCompany || 'No disponible';
        const hasValidCompany = hasCompany && company !== 'No disponible';

        // ── Build deep enrichment sections ────────────────────
        let deepLinkedInSection = '';
        if (rawIntel.deepLinkedIn) {
            const dl = rawIntel.deepLinkedIn;
            deepLinkedInSection = `\n═══════════════════════════════════════
🔍 LINKEDIN DEEP DATA
═══════════════════════════════════════\n`;

            if (dl.about) deepLinkedInSection += `**About/Bio:** ${dl.about.substring(0, 800)}\n\n`;

            if (dl.experienceHistory?.length > 0) {
                deepLinkedInSection += `**Historial de Experiencia:**\n`;
                dl.experienceHistory.slice(0, 8).forEach((exp: any, i: number) => {
                    deepLinkedInSection += `${i + 1}. **${exp.position}** en ${exp.company}${exp.duration ? ` (${exp.duration})` : ''}${exp.isCurrent ? ' ← ACTUAL' : ''}\n`;
                    if (exp.description) deepLinkedInSection += `   ${exp.description.substring(0, 150)}\n`;
                });
                deepLinkedInSection += '\n';
            }

            if (dl.educationHistory?.length > 0) {
                deepLinkedInSection += `**Educación:**\n`;
                dl.educationHistory.slice(0, 5).forEach((edu: any, i: number) => {
                    deepLinkedInSection += `${i + 1}. ${edu.institution}${edu.degree ? ` — ${edu.degree}` : ''}${edu.years ? ` (${edu.years})` : ''}\n`;
                });
                deepLinkedInSection += '\n';
            }

            if (dl.skillsList?.length > 0) {
                deepLinkedInSection += `**Skills:** ${dl.skillsList.slice(0, 10).join(', ')}\n\n`;
            }

            if (dl.recentPosts?.length > 0) {
                deepLinkedInSection += `**Posts recientes:**\n`;
                dl.recentPosts.slice(0, 3).forEach((post: any, i: number) => {
                    deepLinkedInSection += `${i + 1}. "${post.text.substring(0, 200)}..." ${post.date ? `(${post.date})` : ''} ${post.likes ? `— ${post.likes} likes` : ''}\n`;
                });
                deepLinkedInSection += '\n';
            }

            if (dl.followersCount) deepLinkedInSection += `**Seguidores:** ${dl.followersCount}\n`;
            if (dl.connectionsCount) deepLinkedInSection += `**Conexiones:** ${dl.connectionsCount}\n`;
        }

        let websiteSection = '';
        if (rawIntel.website) {
            const ws = rawIntel.website;
            websiteSection = `\n═══════════════════════════════════════
🌐 DATOS DEL WEBSITE CORPORATIVO
═══════════════════════════════════════\n`;

            if (ws.homepage?.title) websiteSection += `**Título:** ${ws.homepage.title}\n`;
            if (ws.homepage?.description) websiteSection += `**Meta descripción:** ${ws.homepage.description.substring(0, 300)}\n`;
            if (ws.homepage?.slogan) websiteSection += `**Slogan/Hero:** ${ws.homepage.slogan}\n`;
            if (ws.homepage?.techStack?.length > 0) websiteSection += `**Tech Stack:** ${ws.homepage.techStack.join(', ')}\n`;

            if (ws.about?.text) websiteSection += `\n**Página "Nosotros":** ${ws.about.text.substring(0, 500)}\n`;
            if (ws.about?.founders?.length > 0) websiteSection += `**Fundadores mencionados:** ${ws.about.founders.join(', ')}\n`;
            if (ws.about?.history) websiteSection += `**Historia:** ${ws.about.history.substring(0, 300)}\n`;
            if (ws.about?.mission) websiteSection += `**Misión:** ${ws.about.mission.substring(0, 200)}\n`;
            if (ws.about?.yearFounded) websiteSection += `**Año fundación:** ${ws.about.yearFounded}\n`;

            if (ws.team?.members?.length > 0) {
                websiteSection += `\n**Equipo:**\n`;
                ws.team.members.slice(0, 5).forEach((m: any) => {
                    websiteSection += `- ${m.name} — ${m.role}\n`;
                });
            }

            if (ws.products?.items?.length > 0) {
                websiteSection += `\n**Productos/Servicios:**\n`;
                ws.products.items.slice(0, 5).forEach((p: any) => {
                    websiteSection += `- ${p.name}${p.description ? `: ${p.description.substring(0, 100)}` : ''}\n`;
                });
            }

            const socialLinks = Object.entries(ws.socialLinks || {}).filter(([, v]) => v);
            if (socialLinks.length > 0) {
                websiteSection += `\n**Redes sociales (del website):**\n`;
                socialLinks.forEach(([network, url]) => {
                    websiteSection += `- ${network}: ${url}\n`;
                });
            }

            if (ws.contactInfo) {
                websiteSection += '\n';
                if (ws.contactInfo.email) websiteSection += `**Email:** ${ws.contactInfo.email}\n`;
                if (ws.contactInfo.phone) websiteSection += `**Teléfono:** ${ws.contactInfo.phone}\n`;
                if (ws.contactInfo.address) websiteSection += `**Dirección:** ${ws.contactInfo.address}\n`;
            }
        }

        let googleMapsSection = '';
        if (rawIntel.googleMaps?.found) {
            const gm = rawIntel.googleMaps;
            googleMapsSection = `\n═══════════════════════════════════════
📍 DATOS DE GOOGLE MAPS
═══════════════════════════════════════
**Nombre:** ${gm.name || 'N/A'}
${gm.rating ? `**Rating:** ${gm.rating}★ (${gm.reviewCount || 0} reviews)` : ''}
${gm.address ? `**Dirección:** ${gm.address}` : ''}
${gm.category ? `**Categoría GMB:** ${gm.category}` : ''}
${gm.phone ? `**Teléfono:** ${gm.phone}` : ''}
${gm.locationCount ? `**Ubicaciones encontradas:** ${gm.locationCount}` : ''}
${gm.priceLevel ? `**Nivel de precio:** ${gm.priceLevel}` : ''}
${gm.description ? `**Descripción:** ${gm.description}` : ''}
`;
        }

        let instagramSection = '';
        if (rawIntel.instagram?.found) {
            const ig = rawIntel.instagram;
            instagramSection = `\n═══════════════════════════════════════
📸 DATOS DE INSTAGRAM
═══════════════════════════════════════
**Handle:** @${ig.handle || 'desconocido'}
**URL:** ${ig.url || 'N/A'}
${ig.followers ? `**Seguidores:** ${ig.followers.toLocaleString()}` : ''}
${ig.bio ? `**Bio:** ${ig.bio.substring(0, 300)}` : ''}
`;
        }

        const userMessage = `
Analizá a esta persona y su empresa con TODA la información proporcionada abajo. Generá un dossier comercial completo.

═══════════════════════════════════════
📋 DATOS DEL CONTACTO (LINKEDIN)
═══════════════════════════════════════
**Nombre:** ${contact.fullName}
**Cargo:** ${contact.currentPosition || 'No disponible'}
**Empresa:** ${company}
**Headline:** ${contact.headline || 'No disponible'}
**Ubicación:** ${contact.location || 'No disponible'}
**LinkedIn:** ${contact.profileUrl}

${contact.about ? `**Bio LinkedIn:** ${contact.about.substring(0, 500)}` : ''}
${sparseWarning}
${deepLinkedInSection}
${searchResults ? `═══════════════════════════════════════
🔍 RESULTADOS DE BÚSQUEDA WEB (SERPAPI)
═══════════════════════════════════════
${searchResults.website ? `**Website encontrado:** ${searchResults.website}` : '**Website:** No encontrado'}
${searchResults.description ? `\n**Descripción encontrada:** ${searchResults.description.substring(0, 300)}` : ''}
${searchResults.news.length > 0 ? `\n**Noticias encontradas:**\n${searchResults.news.map((n: any, i: number) => `${i + 1}. "${n.title}" - ${n.source}\n   URL: ${n.link}\n   Resumen: ${n.snippet?.substring(0, 150)}...`).join('\n')}` : '**Noticias:** No se encontraron noticias'}
` : '**⚠️ Búsqueda web no disponible**'}
${websiteSection}
${googleMapsSection}
${instagramSection}

═══════════════════════════════════════
🎯 CONTEXTO DEL CLIENTE IDEAL (ICP)
═══════════════════════════════════════
${icpContext.substring(0, 1000)}

${deenexContext ? `═══════════════════════════════════════\n📦 CONTEXTO DEL PRODUCTO (Deenex)\n═══════════════════════════════════════\n${deenexContext.substring(0, 2000)}` : ''}

═══════════════════════════════════════
⚠️ INSTRUCCIONES
═══════════════════════════════════════

${hasValidCompany
                ? `Organizá TODOS los datos de "${contact.fullName}" y "${company}" de las ${Object.keys(rawIntel).filter(k => rawIntel[k]).length + 1} fuentes disponibles en el formato JSON solicitado.`
                : `⚠️ NO HAY EMPRESA IDENTIFICADA — el enriquecimiento será limitado. Solo organizá los datos disponibles.`}

**REGLAS:**
1. SOLO usá datos proporcionados arriba — LinkedIn, búsqueda web, website, Google Maps, Instagram
2. Si NO hay resultados de búsqueda web, dejá companyNews y personNews como arrays vacíos []
3. NUNCA inventes URLs, noticias, ni datos que no estén en la información proporcionada
4. Si un dato no está disponible, poné "No verificado"
5. Generá un personalizedPitch usando el NOMBRE DE PILA y datos REALES
6. Detectá painPoints basados en el sector y los datos disponibles
7. Generá talkingPoints basados en su trayectoria, posts, o historia de la empresa
8. Calculá el commercialScore con el breakdown de 5 categorías (0-20 cada una)
9. Respondé SOLO con el JSON, sin texto antes ni después
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

            // Deep Enrichment 2.0 fields (pass through from AI)
            experienceSummary: data.experienceSummary,
            educationSummary: data.educationSummary,
            skillsHighlight: data.skillsHighlight,
            commercialScore: data.commercialScore,
            commercialScoreBreakdown: data.commercialScoreBreakdown,
            personalizedPitch: data.personalizedPitch,
            painPoints: data.painPoints,
            talkingPoints: data.talkingPoints,
            bestApproachChannel: data.bestApproachChannel,
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

        let md = `# 📇 ${contact.fullName} — Dossier Comercial\n\n`;
        md += `**Generado:** ${now} | **Modelo:** Kimi K2 via OpenRouter | **Versión:** Enrichment 2.0\n`;
        md += `**Calidad de datos:** ${data.dataQuality || 'unknown'} | **Confianza:** ${getConfEmoji(confScore)} ${confScore}/100\n`;

        // Commercial score header
        if (data.commercialScore) {
            const csEmoji = data.commercialScore >= 70 ? '🟢' : data.commercialScore >= 50 ? '🟡' : '🔴';
            md += `**Score Comercial:** ${csEmoji} ${data.commercialScore}/100\n`;
        }
        md += `\n---\n\n`;

        // ── Personalized Pitch (most important section) ──────
        if (data.personalizedPitch) {
            md += `## 🎯 Pitch Personalizado\n\n`;
            md += `> ${data.personalizedPitch}\n\n`;
            if (data.bestApproachChannel) {
                md += `**Canal recomendado:** ${data.bestApproachChannel}\n\n`;
            }
            md += `---\n\n`;
        }

        // ── Profile section ─────────────────────────────────
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
        if (data.deepLinkedIn?.followersCount) md += `- **Seguidores:** ${data.deepLinkedIn.followersCount}\n`;
        md += `\n`;

        if (data.personProfile?.summary && data.personProfile.summary !== 'No verificado') {
            md += `### Bio\n${data.personProfile.summary}\n`;
            if (data.personProfile.summarySource && data.personProfile.summarySource !== 'No verificado') {
                md += `*Fuente: ${data.personProfile.summarySource}*\n`;
            }
            md += `\n`;
        } else if (data.deepLinkedIn?.about) {
            md += `### Bio (LinkedIn About)\n${data.deepLinkedIn.about}\n\n`;
        } else if (contact.about) {
            md += `### Bio\n${contact.about}\n\n`;
        }

        // AI summaries
        if (data.experienceSummary) {
            md += `### Resumen de Carrera\n${data.experienceSummary}\n\n`;
        }
        if (data.educationSummary) {
            md += `### Formación\n${data.educationSummary}\n\n`;
        }
        if (data.skillsHighlight && data.skillsHighlight.length > 0) {
            md += `### Skills Destacados\n${data.skillsHighlight.join(' • ')}\n\n`;
        }

        // Deep LinkedIn: Experience timeline
        if (data.deepLinkedIn?.experienceHistory && data.deepLinkedIn.experienceHistory.length > 0) {
            md += `### 📋 Historial Profesional\n`;
            data.deepLinkedIn.experienceHistory.slice(0, 8).forEach((exp, i) => {
                const current = exp.isCurrent ? ' ← **ACTUAL**' : '';
                md += `${i + 1}. **${exp.position}** — ${exp.company}${exp.duration ? ` (${exp.duration})` : ''}${current}\n`;
                if (exp.description) md += `   ${exp.description.substring(0, 200)}\n`;
            });
            md += `\n`;
        } else if (contact.experience && contact.experience.length > 0) {
            md += `### Experiencia\n`;
            contact.experience.slice(0, 3).forEach((exp, i) => {
                md += `${i + 1}. **${exp.position}** — ${exp.company}${exp.duration ? ` (${exp.duration})` : ''}\n`;
            });
            md += `\n`;
        }

        // Deep LinkedIn: Education
        if (data.deepLinkedIn?.educationHistory && data.deepLinkedIn.educationHistory.length > 0) {
            md += `### 🎓 Educación\n`;
            data.deepLinkedIn.educationHistory.slice(0, 5).forEach((edu, i) => {
                md += `${i + 1}. **${edu.institution}**${edu.degree ? ` — ${edu.degree}` : ''}${edu.years ? ` (${edu.years})` : ''}\n`;
            });
            md += `\n`;
        } else if (contact.education && contact.education.length > 0) {
            md += `### Educación\n`;
            contact.education.slice(0, 2).forEach((edu, i) => {
                md += `${i + 1}. **${edu.degree || 'N/A'}** — ${edu.institution}${edu.years ? ` (${edu.years})` : ''}\n`;
            });
            md += `\n`;
        }

        // Deep LinkedIn: Skills
        if (data.deepLinkedIn?.skillsList && data.deepLinkedIn.skillsList.length > 0) {
            md += `### 🛠️ Skills\n${data.deepLinkedIn.skillsList.slice(0, 12).join(' • ')}\n\n`;
        }

        // Deep LinkedIn: Recent Posts
        if (data.deepLinkedIn?.recentPosts && data.deepLinkedIn.recentPosts.length > 0) {
            md += `### 📝 Posts Recientes\n`;
            data.deepLinkedIn.recentPosts.slice(0, 3).forEach((post, i) => {
                md += `${i + 1}. "${post.text.substring(0, 150)}..."${post.date ? ` (${post.date})` : ''}${post.likes ? ` — ${post.likes} likes` : ''}\n`;
            });
            md += `\n`;
        }

        md += `---\n\n`;

        // ── Company section ─────────────────────────────────
        if (data.company) {
            md += `## 🏢 Empresa: ${data.company.name || contact.currentCompany || 'No disponible'}\n`;
            if (data.company.nameSource && data.company.nameSource !== 'No verificado') {
                md += `*Fuente nombre: ${data.company.nameSource}*\n`;
            }
            md += `\n`;

            if (data.company.description && data.company.description !== 'No verificado') {
                md += `### Descripción\n${data.company.description}\n`;
                if (data.company.descriptionSource && data.company.descriptionSource !== 'No verificado') {
                    md += `*Fuente: ${data.company.descriptionSource}*\n`;
                }
                md += `\n`;
            }

            md += `### Datos Clave\n`;
            if (data.company.category && data.company.category !== 'No verificado') md += `- **Categoría:** ${data.company.category}\n`;
            if (data.company.sector && data.company.sector !== 'No verificado') md += `- **Sector:** ${data.company.sector}\n`;
            if (data.company.locationsCount && data.company.locationsCount !== 'No verificado') md += `- **Locales:** ${data.company.locationsCount}\n`;
            if (data.company.website && data.company.website !== 'No verificado') md += `- **Website:** [${data.company.website}](${data.company.website})\n`;
            if (data.company.socialMedia?.instagram && data.company.socialMedia.instagram !== 'No verificado') md += `- **Instagram:** ${data.company.socialMedia.instagram}\n`;
            if (data.company.socialMedia?.twitter && data.company.socialMedia.twitter !== 'No verificado') md += `- **Twitter:** ${data.company.socialMedia.twitter}\n`;
            md += `\n`;
        }

        // ── Website insights ────────────────────────────────
        if (data.companyWebsite) {
            md += `### 🌐 Website\n`;
            if (data.companyWebsite.slogan) md += `- **Slogan:** ${data.companyWebsite.slogan}\n`;
            if (data.companyWebsite.yearFounded) md += `- **Año fundación:** ${data.companyWebsite.yearFounded}\n`;
            if (data.companyWebsite.founders && data.companyWebsite.founders.length > 0) md += `- **Fundadores:** ${data.companyWebsite.founders.join(', ')}\n`;
            if (data.companyWebsite.history) md += `- **Historia:** ${data.companyWebsite.history.substring(0, 200)}\n`;
            if (data.companyWebsite.mission) md += `- **Misión:** ${data.companyWebsite.mission.substring(0, 200)}\n`;
            if (data.companyWebsite.techStack && data.companyWebsite.techStack.length > 0) md += `- **Tech stack:** ${data.companyWebsite.techStack.join(', ')}\n`;
            if (data.companyWebsite.products && data.companyWebsite.products.length > 0) {
                md += `- **Productos/Servicios:** ${data.companyWebsite.products.map(p => p.name).join(', ')}\n`;
            }
            md += `\n`;
        }

        // ── Google Maps ─────────────────────────────────────
        if (data.googleMaps) {
            md += `### 📍 Google Maps\n`;
            if (data.googleMaps.rating) md += `- **Rating:** ${data.googleMaps.rating}★ (${data.googleMaps.reviewCount || 0} reviews)\n`;
            if (data.googleMaps.address) md += `- **Dirección:** ${data.googleMaps.address}\n`;
            if (data.googleMaps.category) md += `- **Categoría:** ${data.googleMaps.category}\n`;
            if (data.googleMaps.locationCount && data.googleMaps.locationCount > 1) md += `- **Sucursales:** ${data.googleMaps.locationCount}\n`;
            if (data.googleMaps.phone) md += `- **Teléfono:** ${data.googleMaps.phone}\n`;
            md += `\n`;
        }

        // ── Instagram ───────────────────────────────────────
        if (data.instagram) {
            md += `### 📸 Instagram\n`;
            if (data.instagram.handle) md += `- **Handle:** @${data.instagram.handle}\n`;
            if (data.instagram.followers) md += `- **Seguidores:** ${data.instagram.followers.toLocaleString()}\n`;
            if (data.instagram.bio) md += `- **Bio:** ${data.instagram.bio.substring(0, 200)}\n`;
            md += `\n`;
        }

        md += `---\n\n`;

        // ── Commercial Intelligence ─────────────────────────
        if (data.commercialScore || data.painPoints || data.talkingPoints) {
            md += `## ⭐ Inteligencia Comercial\n\n`;

            if (data.commercialScore && data.commercialScoreBreakdown) {
                const csb = data.commercialScoreBreakdown;
                md += `### Score: ${data.commercialScore}/100\n\n`;
                md += `| Criterio | Puntos |\n|----------|--------|\n`;
                if (csb.companySize !== undefined) md += `| Tamaño de empresa | ${csb.companySize}/20 |\n`;
                if (csb.digitalPresence !== undefined) md += `| Presencia digital | ${csb.digitalPresence}/20 |\n`;
                if (csb.growthSignals !== undefined) md += `| Señales de crecimiento | ${csb.growthSignals}/20 |\n`;
                if (csb.decisionPower !== undefined) md += `| Poder de decisión | ${csb.decisionPower}/20 |\n`;
                if (csb.approachability !== undefined) md += `| Accesibilidad | ${csb.approachability}/20 |\n`;
                md += `\n`;
            }

            if (data.painPoints && data.painPoints.length > 0) {
                md += `### 💢 Pain Points\n`;
                data.painPoints.forEach((pp, i) => {
                    md += `${i + 1}. ${pp}\n`;
                });
                md += `\n`;
            }

            if (data.talkingPoints && data.talkingPoints.length > 0) {
                md += `### 💬 Talking Points\n`;
                data.talkingPoints.forEach((tp, i) => {
                    md += `${i + 1}. ${tp}\n`;
                });
                md += `\n`;
            }

            md += `---\n\n`;
        }

        // ── News ────────────────────────────────────────────
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
        }

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

        // ── Insights & Signals ──────────────────────────────
        if (data.keyInsights && data.keyInsights.length > 0) {
            md += `## 💡 Insights Clave\n\n`;
            data.keyInsights.forEach((insight, i) => {
                const text = typeof insight === 'string' ? insight : insight.text;
                const source = typeof insight === 'object' ? insight.source : null;
                const confidence = typeof insight === 'object' ? insight.confidence : null;
                const confEmoji = confidence === 'high' ? '🟢' : confidence === 'medium' ? '🟡' : '🔴';
                md += `${i + 1}. ${text}\n`;
                if (source && source !== 'No verificado') md += `   ${confEmoji} *Fuente: ${source}*\n`;
            });
            md += `\n`;
        }

        if (data.buyingSignals && data.buyingSignals.length > 0) {
            md += `## 🚦 Señales de Compra\n\n`;
            data.buyingSignals.forEach((signal, i) => {
                const text = typeof signal === 'string' ? signal : signal.text;
                const source = typeof signal === 'object' ? signal.source : null;
                const evidence = typeof signal === 'object' ? signal.evidence : null;
                const confidence = typeof signal === 'object' ? signal.confidence : null;
                const confEmoji = confidence === 'high' ? '🟢' : confidence === 'medium' ? '🟡' : '🔴';
                md += `${i + 1}. ${text}\n`;
                if (source && source !== 'No verificado') md += `   ${confEmoji} *Fuente: ${source}*\n`;
                if (evidence && evidence !== 'No verificado') md += `   📋 *Evidencia: ${evidence}*\n`;
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
