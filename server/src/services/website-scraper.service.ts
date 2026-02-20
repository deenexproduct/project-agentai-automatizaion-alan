// server/src/services/website-scraper.service.ts
// Corporate website scraper — extracts about, team, products, social links, Schema.org

import puppeteer, { Browser, Page } from 'puppeteer';

// ── Types ────────────────────────────────────────────────────

export interface WebsiteTeamMember {
    name: string;
    role: string;
    photo?: string;
    linkedIn?: string;
}

export interface WebsiteProduct {
    name: string;
    description?: string;
}

export interface WebsiteSocialLinks {
    instagram?: string;
    twitter?: string;
    facebook?: string;
    linkedin?: string;
    youtube?: string;
    tiktok?: string;
}

export interface WebsiteContactInfo {
    email?: string;
    phone?: string;
    address?: string;
}

export interface WebsiteScrapedData {
    url: string;
    scrapedAt: Date;
    homepage: {
        title?: string;
        description?: string;
        ogImage?: string;
        slogan?: string;
        schemaOrg?: any[];
        techStack?: string[];
    };
    about?: {
        text?: string;
        founders?: string[];
        history?: string;
        mission?: string;
        yearFounded?: string;
    };
    team?: {
        members: WebsiteTeamMember[];
    };
    products?: {
        items: WebsiteProduct[];
    };
    socialLinks: WebsiteSocialLinks;
    contactInfo?: WebsiteContactInfo;
    _debug?: {
        pagesVisited: string[];
        errors: string[];
        durationMs: number;
    };
}

// ── Internal page discovery ──────────────────────────────────

interface DiscoveredPage {
    url: string;
    type: 'about' | 'team' | 'products' | 'contact';
    text: string;
}

// ── Page patterns (ES + EN) ──────────────────────────────────

const PAGE_PATTERNS: Record<string, RegExp> = {
    about: /about|nosotros|quienes[\s-]?somos|acerca|quien[\s-]?es|nuestra[\s-]?historia|sobre/i,
    team: /team|equipo|nuestro[\s-]?equipo|staff|directorio|liderazgo|leadership/i,
    products: /product|servicio|solucion|catalogo|portfolio|lo[\s-]?que[\s-]?hacemos|nuestros[\s-]?servicios/i,
    contact: /contact|contacto|ubicacion|sucursal|locales/i,
};

// ── Service ──────────────────────────────────────────────────

export class WebsiteScraper {
    private static readonly GLOBAL_TIMEOUT_MS = 60_000;
    private static readonly PAGE_TIMEOUT_MS = 15_000;

    /**
     * Scrape a corporate website for business intelligence.
     * 
     * Opens a NEW headless browser (doesn't reuse LinkedIn's).
     * Visits homepage → discovers internal pages → scrapes each.
     * Each step is independent — partial data is returned on failure.
     * Global timeout: 60 seconds.
     */
    async scrapeWebsite(url: string): Promise<WebsiteScrapedData> {
        const startTime = Date.now();
        const debug = { pagesVisited: [] as string[], errors: [] as string[], durationMs: 0 };
        const result: WebsiteScrapedData = {
            url,
            scrapedAt: new Date(),
            homepage: {},
            socialLinks: {},
            _debug: debug,
        };

        let browser: Browser | null = null;

        try {
            // Launch headless browser
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
            });

            const page = await browser.newPage();
            await page.setUserAgent(
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            );
            await page.setViewport({ width: 1440, height: 900 });

            // ── 1. Homepage ──────────────────────────────────────
            console.log(`🌐 [WebScraper] Visitando: ${url}`);
            try {
                await page.goto(url, {
                    waitUntil: 'networkidle2',
                    timeout: WebsiteScraper.PAGE_TIMEOUT_MS,
                });
                debug.pagesVisited.push(url);

                result.homepage = await this.scrapeHomepage(page);
                result.socialLinks = await this.scrapeSocialLinks(page);
                result.contactInfo = await this.scrapeContactInfo(page);
            } catch (e: any) {
                debug.errors.push(`homepage: ${e.message?.substring(0, 100)}`);
            }

            // ── 2. Discover internal pages ───────────────────────
            let discoveredPages: DiscoveredPage[] = [];
            try {
                discoveredPages = await this.discoverPages(page, url);
                console.log(`🌐 [WebScraper] Páginas descubiertas: ${discoveredPages.map(p => p.type).join(', ') || 'ninguna'}`);
            } catch (e: any) {
                debug.errors.push(`discover: ${e.message?.substring(0, 100)}`);
            }

            // ── 3. Scrape about page ─────────────────────────────
            const aboutPage = discoveredPages.find(p => p.type === 'about');
            if (aboutPage) {
                try {
                    await page.goto(aboutPage.url, {
                        waitUntil: 'networkidle2',
                        timeout: WebsiteScraper.PAGE_TIMEOUT_MS,
                    });
                    debug.pagesVisited.push(aboutPage.url);
                    result.about = await this.scrapeAboutPage(page);
                } catch (e: any) {
                    debug.errors.push(`about: ${e.message?.substring(0, 100)}`);
                }
            }

            // Check global timeout
            if (Date.now() - startTime > WebsiteScraper.GLOBAL_TIMEOUT_MS) {
                debug.errors.push('global timeout reached');
                debug.durationMs = Date.now() - startTime;
                return result;
            }

            // ── 4. Scrape team page ──────────────────────────────
            const teamPage = discoveredPages.find(p => p.type === 'team');
            if (teamPage) {
                try {
                    await page.goto(teamPage.url, {
                        waitUntil: 'networkidle2',
                        timeout: WebsiteScraper.PAGE_TIMEOUT_MS,
                    });
                    debug.pagesVisited.push(teamPage.url);
                    result.team = await this.scrapeTeamPage(page);
                } catch (e: any) {
                    debug.errors.push(`team: ${e.message?.substring(0, 100)}`);
                }
            }

            // ── 5. Scrape products page ──────────────────────────
            const productsPage = discoveredPages.find(p => p.type === 'products');
            if (productsPage && Date.now() - startTime < WebsiteScraper.GLOBAL_TIMEOUT_MS) {
                try {
                    await page.goto(productsPage.url, {
                        waitUntil: 'networkidle2',
                        timeout: WebsiteScraper.PAGE_TIMEOUT_MS,
                    });
                    debug.pagesVisited.push(productsPage.url);
                    result.products = await this.scrapeProductsPage(page);
                } catch (e: any) {
                    debug.errors.push(`products: ${e.message?.substring(0, 100)}`);
                }
            }

        } catch (error: any) {
            debug.errors.push(`global: ${error.message?.substring(0, 100)}`);
        } finally {
            if (browser) {
                try { await browser.close(); } catch { /* ignore */ }
            }
            debug.durationMs = Date.now() - startTime;
            console.log(`🌐 [WebScraper] Completado en ${(debug.durationMs / 1000).toFixed(1)}s — ${debug.pagesVisited.length} páginas, ${debug.errors.length} errores`);
        }

        return result;
    }

    // ── Homepage scraping ────────────────────────────────────

    private async scrapeHomepage(page: Page) {
        return page.evaluate(() => {
            // Meta tags
            const title = document.title || undefined;
            const metaDesc = document.querySelector('meta[name="description"]');
            const description = metaDesc?.getAttribute('content') || undefined;
            const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || undefined;

            // Hero text / slogan — first visible h1 or h2
            let slogan: string | undefined;
            const headings = document.querySelectorAll('h1, h2');
            for (let i = 0; i < headings.length; i++) {
                const h = headings[i] as HTMLElement;
                const text = h.innerText?.trim();
                if (text && text.length > 5 && text.length < 200) {
                    slogan = text;
                    break;
                }
            }

            // Schema.org JSON-LD
            const schemaScripts = document.querySelectorAll('script[type="application/ld+json"]');
            const schemaOrg: any[] = [];
            schemaScripts.forEach(s => {
                try {
                    const parsed = JSON.parse(s.textContent || '');
                    schemaOrg.push(parsed);
                } catch { /* skip malformed */ }
            });

            // Tech stack detection
            const html = document.documentElement.outerHTML;
            const techStack: string[] = [];
            if (html.includes('wp-content') || html.includes('wp-includes')) techStack.push('WordPress');
            if (html.includes('cdn.shopify.com') || html.includes('myshopify')) techStack.push('Shopify');
            if (html.includes('wix.com') || html.includes('wixsite')) techStack.push('Wix');
            if (html.includes('squarespace.com')) techStack.push('Squarespace');
            if (html.includes('__next') || html.includes('_next/static')) techStack.push('Next.js');
            if (html.includes('_nuxt')) techStack.push('Nuxt.js');
            if (html.includes('tiendanube') || html.includes('nuvemshop')) techStack.push('Tienda Nube');
            if (html.includes('vtex')) techStack.push('VTEX');
            if (html.includes('mercadoshops')) techStack.push('Mercado Shops');
            if (html.includes('webflow')) techStack.push('Webflow');
            if (document.querySelector('meta[name="generator"]')?.getAttribute('content')?.includes('Hugo')) techStack.push('Hugo');

            return { title, description, ogImage, slogan, schemaOrg: schemaOrg.length > 0 ? schemaOrg : undefined, techStack: techStack.length > 0 ? techStack : undefined };
        });
    }

    // ── Discover internal pages ──────────────────────────────

    private async discoverPages(page: Page, baseUrl: string): Promise<DiscoveredPage[]> {
        const baseOrigin = new URL(baseUrl).origin;

        const links = await page.evaluate((origin) => {
            const allLinks = document.querySelectorAll('nav a, header a, footer a, a');
            const found: { href: string; text: string }[] = [];
            const seen = new Set<string>();

            for (let i = 0; i < allLinks.length; i++) {
                const a = allLinks[i] as HTMLAnchorElement;
                const href = a.href;
                const text = (a.textContent || '').trim().toLowerCase();
                if (!href || seen.has(href) || !href.startsWith(origin)) continue;
                seen.add(href);
                found.push({ href, text });
            }
            return found;
        }, baseOrigin);

        const pages: DiscoveredPage[] = [];
        const seen = new Set<string>();

        for (const link of links) {
            for (const [type, pattern] of Object.entries(PAGE_PATTERNS)) {
                if (seen.has(type)) continue;
                if (pattern.test(link.href) || pattern.test(link.text)) {
                    pages.push({
                        url: link.href,
                        type: type as DiscoveredPage['type'],
                        text: link.text,
                    });
                    seen.add(type);
                    break;
                }
            }
        }

        return pages;
    }

    // ── Social links ─────────────────────────────────────────

    private async scrapeSocialLinks(page: Page): Promise<WebsiteSocialLinks> {
        return page.evaluate(() => {
            const links: WebsiteSocialLinks = {};
            const allAnchors = document.querySelectorAll('a[href]');

            for (let i = 0; i < allAnchors.length; i++) {
                const href = (allAnchors[i] as HTMLAnchorElement).href;
                if (!href) continue;

                if (!links.instagram && href.includes('instagram.com/') && !href.includes('/p/')) {
                    links.instagram = href;
                }
                if (!links.twitter && (href.includes('twitter.com/') || href.includes('x.com/'))) {
                    links.twitter = href;
                }
                if (!links.facebook && href.includes('facebook.com/') && !href.includes('/share')) {
                    links.facebook = href;
                }
                if (!links.linkedin && href.includes('linkedin.com/')) {
                    links.linkedin = href;
                }
                if (!links.youtube && href.includes('youtube.com/')) {
                    links.youtube = href;
                }
                if (!links.tiktok && href.includes('tiktok.com/')) {
                    links.tiktok = href;
                }
            }

            return links;
        });
    }

    // ── Contact info ─────────────────────────────────────────

    private async scrapeContactInfo(page: Page): Promise<WebsiteContactInfo | undefined> {
        return page.evaluate(() => {
            const html = document.body.innerText || '';
            const info: any = {};

            // Email
            const emailMatch = html.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
            if (emailMatch) info.email = emailMatch[0];

            // Phone (AR format or generic)
            const phoneMatch = html.match(/(?:\+54|(?:011|0\d{2,3}))[\s-]?\d{4}[\s-]?\d{4}/);
            if (phoneMatch) info.phone = phoneMatch[0];

            // Address — look for Schema.org or "Dirección:"
            const addressEl = document.querySelector('[itemprop="address"], [class*="address"], [class*="direccion"]');
            if (addressEl) info.address = (addressEl as HTMLElement).innerText?.trim().substring(0, 200);

            return Object.keys(info).length > 0 ? info : undefined;
        });
    }

    // ── About page ───────────────────────────────────────────

    private async scrapeAboutPage(page: Page): Promise<WebsiteScrapedData['about']> {
        return page.evaluate(() => {
            const body = document.body.innerText || '';
            const text = body.substring(0, 3000);

            // Look for founders
            const founders: string[] = [];
            const founderPatterns = [
                /(?:fundad[oa]s?\s+por|creado\s+por|founded\s+by)\s+([A-ZÁÉÍÓÚ][a-záéíóú]+\s+[A-ZÁÉÍÓÚ][a-záéíóú]+)/gi,
                /(?:CEO|Fundador|Director General|Co-?fundador)\s*[:—–-]\s*([A-ZÁÉÍÓÚ][a-záéíóú]+\s+[A-ZÁÉÍÓÚ][a-záéíóú]+)/gi,
            ];
            for (const pattern of founderPatterns) {
                let match;
                while ((match = pattern.exec(body)) !== null) {
                    if (match[1] && !founders.includes(match[1].trim())) {
                        founders.push(match[1].trim());
                    }
                }
            }

            // Look for founding year
            const yearMatch = body.match(/(?:desde|fundad[oa]?\s+en|established\s+in|since)\s+(\d{4})/i);
            const yearFounded = yearMatch ? yearMatch[1] : undefined;

            // History — paragraph with "historia" or timeline keywords
            let history: string | undefined;
            const paragraphs = document.querySelectorAll('p');
            for (let i = 0; i < paragraphs.length; i++) {
                const p = paragraphs[i].innerText?.trim();
                if (p && p.length > 50 && /historia|trayectoria|comienz|nacimos|empez|desde|founded|started|began/i.test(p)) {
                    history = p.substring(0, 500);
                    break;
                }
            }

            // Mission
            let mission: string | undefined;
            const missionHeaders = document.querySelectorAll('h1, h2, h3, h4');
            for (let i = 0; i < missionHeaders.length; i++) {
                const h = missionHeaders[i];
                if (/misi[oó]n|visi[oó]n|purpose|mission/i.test(h.textContent || '')) {
                    const next = h.nextElementSibling;
                    if (next) {
                        mission = (next as HTMLElement).innerText?.trim().substring(0, 300);
                        break;
                    }
                }
            }

            return {
                text: text || undefined,
                founders: founders.length > 0 ? founders : undefined,
                history,
                mission,
                yearFounded,
            };
        });
    }

    // ── Team page ────────────────────────────────────────────

    private async scrapeTeamPage(page: Page): Promise<WebsiteScrapedData['team']> {
        const members = await page.evaluate(() => {
            const results: { name: string; role: string; photo?: string; linkedIn?: string }[] = [];

            // Strategy 1: Look for repeated card-like structures
            // Common patterns: .team-member, .card, article, li within a team section
            const containers = document.querySelectorAll(
                '[class*="team"] > *, [class*="equipo"] > *, ' +
                '[class*="member"], [class*="staff"], ' +
                'article, .card'
            );

            for (let i = 0; i < Math.min(containers.length, 15); i++) {
                const el = containers[i] as HTMLElement;
                const text = el.innerText?.trim() || '';
                if (text.length < 5 || text.length > 500) continue;

                // Extract name — usually in h2, h3, h4, or strong
                const nameEl = el.querySelector('h2, h3, h4, strong, [class*="name"]');
                const name = nameEl?.textContent?.trim();
                if (!name || name.length < 3 || name.length > 60) continue;

                // Extract role — usually in p, span, or subtitle class
                const roleEl = el.querySelector('p, span, [class*="role"], [class*="position"], [class*="cargo"]');
                const role = roleEl?.textContent?.trim() || '';

                // Photo
                const img = el.querySelector('img');
                const photo = img?.src || img?.getAttribute('data-src') || undefined;

                // LinkedIn
                const linkedInLink = el.querySelector('a[href*="linkedin.com"]');
                const linkedIn = linkedInLink?.getAttribute('href') || undefined;

                if (name && name !== role) {
                    results.push({ name, role: role || 'No especificado', photo, linkedIn });
                }
            }

            return results;
        });

        return members.length > 0 ? { members: members.slice(0, 10) } : undefined;
    }

    // ── Products page ────────────────────────────────────────

    private async scrapeProductsPage(page: Page): Promise<WebsiteScrapedData['products']> {
        const items = await page.evaluate(() => {
            const results: { name: string; description?: string }[] = [];

            // Look for product/service cards
            const headings = document.querySelectorAll('h2, h3, h4');
            for (let i = 0; i < Math.min(headings.length, 15); i++) {
                const h = headings[i] as HTMLElement;
                const name = h.innerText?.trim();
                if (!name || name.length < 3 || name.length > 100) continue;

                // Skip navigation headings
                if (/menu|nav|header|footer|contacto|contact/i.test(name)) continue;

                // Get adjacent paragraph as description
                const next = h.nextElementSibling;
                const description = next?.tagName === 'P'
                    ? (next as HTMLElement).innerText?.trim().substring(0, 200)
                    : undefined;

                results.push({ name, description });
            }

            return results;
        });

        return items.length > 0 ? { items: items.slice(0, 10) } : undefined;
    }
}

export const websiteScraper = new WebsiteScraper();
