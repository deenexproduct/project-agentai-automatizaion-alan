// server/src/services/deep-linkedin-scraper.service.ts
// Deep LinkedIn profile scraper — extracts experience, education, skills, about, posts

import { Page } from 'puppeteer';

// ── Types ────────────────────────────────────────────────────

export interface DeepExperience {
    company: string;
    position: string;
    duration?: string;
    description?: string;
    location?: string;
    logoUrl?: string;
    isCurrent?: boolean;
}

export interface DeepEducation {
    institution: string;
    degree?: string;
    fieldOfStudy?: string;
    years?: string;
    logoUrl?: string;
}

export interface DeepPost {
    text: string;
    date?: string;
    likes?: number;
    comments?: number;
}

export interface DeepLinkedInData {
    experienceHistory: DeepExperience[];
    educationHistory: DeepEducation[];
    skillsList: string[];
    about?: string;
    recentPosts: DeepPost[];
    followersCount?: string;
    connectionsCount?: string;
    profilePhotoUrl?: string;
    _debug?: {
        sectionsFound: string[];
        errors: string[];
        durationMs: number;
    };
}

// ── Helper: random delay ─────────────────────────────────────

function delay(min: number, max: number): Promise<void> {
    return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
}

// ── Service ──────────────────────────────────────────────────

export class DeepLinkedInScraper {
    private static readonly SECTION_TIMEOUT_MS = 10_000;

    /**
     * Deep scrape a LinkedIn profile for experience, education, skills, about, posts.
     * 
     * IMPORTANT:
     * - The page should already be navigated to the profile URL
     * - Uses position-based extraction (CSS classes change frequently)
     * - Each section is independent — if one fails, others continue
     * - Adds human-like delays between actions
     */
    async scrapeDeep(page: Page, profileUrl: string): Promise<DeepLinkedInData> {
        const startTime = Date.now();
        const debug = { sectionsFound: [] as string[], errors: [] as string[], durationMs: 0 };
        const result: DeepLinkedInData = {
            experienceHistory: [],
            educationHistory: [],
            skillsList: [],
            recentPosts: [],
            _debug: debug,
        };

        try {
            // Ensure we're on the profile page
            const currentUrl = page.url();
            const normalizedProfile = profileUrl.replace(/\/$/, '');
            if (!currentUrl.includes(normalizedProfile.split('/in/')[1]?.split('/')[0] || '___')) {
                console.log(`  🔍 [DeepScrape] Navigating to profile: ${profileUrl}`);
                await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 15000 });
                await delay(1000, 2000);
            }

            // ── 0. Profile Photo ─────────────────────────────
            try {
                result.profilePhotoUrl = await page.evaluate(() => {
                    const imgs = document.querySelectorAll('img');
                    let bestPhoto: string | undefined = undefined;
                    let bestSize = 0;
                    for (let i = 0; i < imgs.length; i++) {
                        const src = imgs[i].src || '';
                        if (src.indexOf('profile-displayphoto') !== -1 || src.indexOf('profile-framedphoto') !== -1) {
                            const rect = imgs[i].getBoundingClientRect();
                            const size = rect.width * rect.height;
                            // Only large images in profile card area (skip 32px nav avatar)
                            if (rect.width >= 100 && rect.height >= 100 && rect.top < 600 && size > bestSize) {
                                bestPhoto = src;
                                bestSize = size;
                            }
                        }
                    }
                    return bestPhoto;
                });
                if (result.profilePhotoUrl) debug.sectionsFound.push('photo');
            } catch (e: any) {
                debug.errors.push(`photo: ${e.message?.substring(0, 80)}`);
            }

            // ── 1. About / Bio ───────────────────────────────
            try {
                result.about = await this.scrapeAbout(page);
                if (result.about) debug.sectionsFound.push('about');
            } catch (e: any) {
                debug.errors.push(`about: ${e.message?.substring(0, 80)}`);
            }

            // ── 2. Experience ────────────────────────────────
            await delay(500, 1000);
            try {
                result.experienceHistory = await this.scrapeExperience(page);
                if (result.experienceHistory.length > 0) debug.sectionsFound.push(`experience(${result.experienceHistory.length})`);
            } catch (e: any) {
                debug.errors.push(`experience: ${e.message?.substring(0, 80)}`);
            }

            // ── 3. Education ─────────────────────────────────
            await delay(500, 1000);
            try {
                result.educationHistory = await this.scrapeEducation(page);
                if (result.educationHistory.length > 0) debug.sectionsFound.push(`education(${result.educationHistory.length})`);
            } catch (e: any) {
                debug.errors.push(`education: ${e.message?.substring(0, 80)}`);
            }

            // ── 4. Skills ────────────────────────────────────
            await delay(300, 600);
            try {
                result.skillsList = await this.scrapeSkills(page);
                if (result.skillsList.length > 0) debug.sectionsFound.push(`skills(${result.skillsList.length})`);
            } catch (e: any) {
                debug.errors.push(`skills: ${e.message?.substring(0, 80)}`);
            }

            // ── 5. Followers / Connections ────────────────────
            try {
                const counts = await this.scrapeCounts(page);
                result.followersCount = counts.followers;
                result.connectionsCount = counts.connections;
            } catch (e: any) {
                debug.errors.push(`counts: ${e.message?.substring(0, 80)}`);
            }

            // ── 6. Recent Posts ───────────────────────────────
            await delay(500, 1000);
            try {
                result.recentPosts = await this.scrapeRecentPosts(page, profileUrl);
                if (result.recentPosts.length > 0) debug.sectionsFound.push(`posts(${result.recentPosts.length})`);
            } catch (e: any) {
                debug.errors.push(`posts: ${e.message?.substring(0, 80)}`);
            }

        } catch (error: any) {
            debug.errors.push(`global: ${error.message?.substring(0, 80)}`);
        }

        debug.durationMs = Date.now() - startTime;
        console.log(`  🔍 [DeepScrape] Completado en ${(debug.durationMs / 1000).toFixed(1)}s — secciones: ${debug.sectionsFound.join(', ') || 'ninguna'}`);
        if (debug.errors.length > 0) {
            console.log(`  🔍 [DeepScrape] Errores: ${debug.errors.join(', ')}`);
        }

        return result;
    }

    // ── About ────────────────────────────────────────────────

    private async scrapeAbout(page: Page): Promise<string | undefined> {
        // First try to click "ver más" / "see more" in the about section
        try {
            await page.evaluate(() => {
                // Scroll to about section
                const sections = document.querySelectorAll('section');
                for (let i = 0; i < sections.length; i++) {
                    const heading = sections[i].querySelector('h2, div[id*="about"]');
                    if (heading && /acerca|about/i.test(heading.textContent || '')) {
                        sections[i].scrollIntoView({ behavior: 'smooth' });
                        break;
                    }
                }
            });
            await delay(500, 800);

            // Click "ver más" button if present
            const seeMoreClicked = await page.evaluate(() => {
                const buttons = document.querySelectorAll('button, a');
                for (let i = 0; i < buttons.length; i++) {
                    const btn = buttons[i] as HTMLElement;
                    const text = btn.textContent?.toLowerCase() || '';
                    const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
                    if ((text.includes('ver más') || text.includes('see more') || text.includes('…more') ||
                        ariaLabel.includes('ver más') || ariaLabel.includes('see more')) &&
                        btn.getBoundingClientRect().top > 300 && btn.getBoundingClientRect().top < 800) {
                        btn.click();
                        return true;
                    }
                }
                return false;
            });

            if (seeMoreClicked) await delay(300, 500);
        } catch { /* clicking see more is optional */ }

        // Extract the about text
        return page.evaluate(() => {
            // Strategy 1: Find section with "Acerca de" / "About" heading
            const sections = document.querySelectorAll('section');
            for (let i = 0; i < sections.length; i++) {
                const headings = sections[i].querySelectorAll('h2, [id*="about"]');
                for (let j = 0; j < headings.length; j++) {
                    if (/acerca|about/i.test(headings[j].textContent || '')) {
                        // Find the text content within this section
                        const spans = sections[i].querySelectorAll('span, div, p');
                        let longestText = '';
                        for (let k = 0; k < spans.length; k++) {
                            const t = (spans[k] as HTMLElement).innerText?.trim() || '';
                            if (t.length > longestText.length && t.length > 30 && t.length < 3000 &&
                                !/acerca|about|ver más|see more/i.test(t.substring(0, 20))) {
                                longestText = t;
                            }
                        }
                        if (longestText) return longestText.substring(0, 2000);
                    }
                }
            }

            // Strategy 2: Fall back to finding long text blocks in the profile area
            const allSpans = document.querySelectorAll('span');
            for (let i = 0; i < allSpans.length; i++) {
                const span = allSpans[i] as HTMLElement;
                const rect = span.getBoundingClientRect();
                const text = span.innerText?.trim() || '';
                if (rect.top > 400 && rect.top < 1200 && text.length > 100 && text.length < 2000 &&
                    span.children.length < 3) {
                    return text;
                }
            }

            return undefined;
        });
    }

    // ── Experience ───────────────────────────────────────────

    private async scrapeExperience(page: Page): Promise<DeepExperience[]> {
        // Scroll to experience section
        await page.evaluate(() => {
            const sections = document.querySelectorAll('section');
            for (let i = 0; i < sections.length; i++) {
                const h = sections[i].querySelector('h2');
                if (h && /experiencia|experience/i.test(h.textContent || '')) {
                    sections[i].scrollIntoView({ behavior: 'smooth' });
                    break;
                }
            }
        });
        await delay(500, 800);

        // Try to expand "Show all experiences"
        await page.evaluate(() => {
            const links = document.querySelectorAll('a');
            for (let i = 0; i < links.length; i++) {
                const text = links[i].textContent?.toLowerCase() || '';
                const ariaLabel = links[i].getAttribute('aria-label')?.toLowerCase() || '';
                if ((text.includes('mostrar todas') || text.includes('show all')) &&
                    (text.includes('experiencia') || ariaLabel.includes('experiencia') || ariaLabel.includes('experience'))) {
                    (links[i] as HTMLElement).click();
                    break;
                }
            }
        });
        await delay(800, 1200);

        return page.evaluate(() => {
            const experiences: any[] = [];

            // Find the experience section
            const sections = document.querySelectorAll('section');
            let expSection: Element | null = null;
            for (let i = 0; i < sections.length; i++) {
                const h = sections[i].querySelector('h2');
                if (h && /experiencia|experience/i.test(h.textContent || '')) {
                    expSection = sections[i];
                    break;
                }
            }
            if (!expSection) return experiences;

            // Find list items within the experience section
            const items = expSection.querySelectorAll('li');
            for (let i = 0; i < Math.min(items.length, 15); i++) {
                const item = items[i] as HTMLElement;
                const text = item.innerText?.trim() || '';
                if (text.length < 10) continue;

                // Extract company link
                const companyLink = item.querySelector('a[href*="/company/"]');
                const company = companyLink?.textContent?.trim() ||
                    // Fallback: look for text near a logo image
                    item.querySelector('img')?.alt?.trim() || '';

                // Extract position — usually the first strong/bold text or specific span
                const spans = item.querySelectorAll('span, div');
                let position = '';
                let duration = '';
                let location = '';
                let description = '';

                const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

                if (lines.length >= 2) {
                    // First line is usually position, second is company or duration
                    position = lines[0];

                    // Look for duration patterns (e.g., "ene. 2020 - actualidad · 5 años")
                    for (const line of lines) {
                        if (/\d{4}\s*[-–]\s*(\d{4}|actualidad|present|actual)/i.test(line) ||
                            /\d+\s*(año|mes|year|month)/i.test(line)) {
                            duration = line;
                        }
                        // Location patterns
                        if (/buenos aires|argentina|remoto|remote|híbrido|hybrid|ciudad|capital/i.test(line) && line.length < 80) {
                            location = line;
                        }
                    }

                    // Description — longest line that isn't position/company/duration
                    const descLines = lines.filter(l =>
                        l !== position && l !== company && l !== duration && l !== location &&
                        l.length > 30 && !/mostrar|show|logo|·/i.test(l)
                    );
                    if (descLines.length > 0) {
                        description = descLines.join(' ').substring(0, 500);
                    }
                }

                // Logo
                const img = item.querySelector('img');
                const logoUrl = img?.src || undefined;

                if (position || company) {
                    experiences.push({
                        company: company || 'No especificada',
                        position: position || 'No especificado',
                        duration: duration || undefined,
                        description: description || undefined,
                        location: location || undefined,
                        logoUrl,
                        isCurrent: duration ? /actualidad|present|actual/i.test(duration) : undefined,
                    });
                }
            }

            return experiences;
        });
    }

    // ── Education ────────────────────────────────────────────

    private async scrapeEducation(page: Page): Promise<DeepEducation[]> {
        await page.evaluate(() => {
            const sections = document.querySelectorAll('section');
            for (let i = 0; i < sections.length; i++) {
                const h = sections[i].querySelector('h2');
                if (h && /educación|education/i.test(h.textContent || '')) {
                    sections[i].scrollIntoView({ behavior: 'smooth' });
                    break;
                }
            }
        });
        await delay(400, 700);

        return page.evaluate(() => {
            const education: any[] = [];

            const sections = document.querySelectorAll('section');
            let eduSection: Element | null = null;
            for (let i = 0; i < sections.length; i++) {
                const h = sections[i].querySelector('h2');
                if (h && /educación|education/i.test(h.textContent || '')) {
                    eduSection = sections[i];
                    break;
                }
            }
            if (!eduSection) return education;

            const items = eduSection.querySelectorAll('li');
            for (let i = 0; i < Math.min(items.length, 10); i++) {
                const item = items[i] as HTMLElement;
                const text = item.innerText?.trim() || '';
                if (text.length < 5) continue;

                const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

                let institution = '';
                let degree = '';
                let years = '';

                if (lines.length >= 1) {
                    institution = lines[0];

                    for (const line of lines) {
                        // Year patterns: "2010 - 2015" or "2010 – 2015"
                        if (/\d{4}\s*[-–]\s*\d{4}/.test(line)) {
                            years = line;
                        }
                        // Degree patterns
                        if (/licenciat|ingenier|master|mba|doctor|bachelor|grado|tecnic|diplomad/i.test(line) && line !== institution) {
                            degree = line;
                        }
                    }
                }

                const img = item.querySelector('img');
                const logoUrl = img?.src || undefined;

                if (institution) {
                    education.push({
                        institution,
                        degree: degree || undefined,
                        years: years || undefined,
                        logoUrl,
                    });
                }
            }

            return education;
        });
    }

    // ── Skills ───────────────────────────────────────────────

    private async scrapeSkills(page: Page): Promise<string[]> {
        await page.evaluate(() => {
            const sections = document.querySelectorAll('section');
            for (let i = 0; i < sections.length; i++) {
                const h = sections[i].querySelector('h2');
                if (h && /aptitudes|skills|competencias/i.test(h.textContent || '')) {
                    sections[i].scrollIntoView({ behavior: 'smooth' });
                    break;
                }
            }
        });
        await delay(300, 500);

        return page.evaluate(() => {
            const skills: string[] = [];

            const sections = document.querySelectorAll('section');
            let skillSection: Element | null = null;
            for (let i = 0; i < sections.length; i++) {
                const h = sections[i].querySelector('h2');
                if (h && /aptitudes|skills|competencias/i.test(h.textContent || '')) {
                    skillSection = sections[i];
                    break;
                }
            }
            if (!skillSection) return skills;

            // Skills are typically in list items or spans within the section
            const items = skillSection.querySelectorAll('li, span');
            for (let i = 0; i < items.length; i++) {
                const text = items[i].textContent?.trim() || '';
                // Skills are short text, not numeric, not section titles
                if (text.length > 2 && text.length < 60 &&
                    !/aptitudes|skills|mostrar|show|endorse|\d+ validacion/i.test(text) &&
                    !skills.includes(text)) {
                    skills.push(text);
                }
                if (skills.length >= 15) break;
            }

            return skills;
        });
    }

    // ── Followers / Connections ───────────────────────────────

    private async scrapeCounts(page: Page): Promise<{ followers?: string; connections?: string }> {
        return page.evaluate(() => {
            let followers: string | undefined;
            let connections: string | undefined;

            const allSpans = document.querySelectorAll('span, a');
            for (let i = 0; i < allSpans.length; i++) {
                const text = allSpans[i].textContent?.trim() || '';

                if (!followers && /(\d[\d,.]*)\s*seguidores/i.test(text)) {
                    followers = text.match(/(\d[\d,.]*)\s*seguidores/i)?.[1];
                }
                if (!followers && /(\d[\d,.]*)\s*followers/i.test(text)) {
                    followers = text.match(/(\d[\d,.]*)\s*followers/i)?.[1];
                }
                if (!connections && /(\d[\d,.]+\+?)\s*contactos/i.test(text)) {
                    connections = text.match(/(\d[\d,.]+\+?)\s*contactos/i)?.[1];
                }
                if (!connections && /(\d[\d,.]+\+?)\s*connections/i.test(text)) {
                    connections = text.match(/(\d[\d,.]+\+?)\s*connections/i)?.[1];
                }
            }

            return { followers, connections };
        });
    }

    // ── Recent Posts ─────────────────────────────────────────

    private async scrapeRecentPosts(page: Page, profileUrl: string): Promise<DeepPost[]> {
        const activityUrl = `${profileUrl.replace(/\/$/, '')}/recent-activity/all/`;

        try {
            await page.goto(activityUrl, { waitUntil: 'networkidle2', timeout: 12000 });
            await delay(1500, 2500);
        } catch {
            // Activity page might not load — return empty
            return [];
        }

        const posts = await page.evaluate(() => {
            const results: any[] = [];

            // Posts are typically in feed update containers
            const postContainers = document.querySelectorAll(
                '[data-urn*="activity"], [class*="feed-shared"], [class*="update-components"], article'
            );

            for (let i = 0; i < Math.min(postContainers.length, 5); i++) {
                const container = postContainers[i] as HTMLElement;
                const text = container.innerText?.trim() || '';
                if (text.length < 20) continue;

                // Extract post text — usually the longest paragraph
                const paragraphs = container.querySelectorAll('span, p');
                let postText = '';
                for (let j = 0; j < paragraphs.length; j++) {
                    const p = (paragraphs[j] as HTMLElement).innerText?.trim() || '';
                    if (p.length > postText.length && p.length > 20 && p.length < 2000) {
                        postText = p;
                    }
                }
                if (!postText) continue;

                // Extract date
                const dateEl = container.querySelector('time, [class*="time"], [class*="date"]');
                const date = dateEl?.textContent?.trim() || undefined;

                // Extract likes count
                const likesMatch = text.match(/(\d+)\s*(?:reaccion|reaction|like|me gusta)/i);
                const likes = likesMatch ? parseInt(likesMatch[1]) : undefined;

                // Extract comments count
                const commentsMatch = text.match(/(\d+)\s*(?:comentario|comment)/i);
                const comments = commentsMatch ? parseInt(commentsMatch[1]) : undefined;

                results.push({
                    text: postText.substring(0, 500),
                    date,
                    likes,
                    comments,
                });
            }

            return results;
        });

        // Navigate back to profile
        try {
            await page.goto(profileUrl, { waitUntil: 'networkidle2', timeout: 12000 });
        } catch { /* best effort */ }

        return posts;
    }
}

export const deepLinkedInScraper = new DeepLinkedInScraper();
