// server/src/services/instagram-scraper.service.ts
// Instagram profile discovery via SerpAPI (no Meta API needed)

import { getJson } from 'serpapi';

// ── Types ────────────────────────────────────────────────────

export interface InstagramData {
    found: boolean;
    handle?: string;
    url?: string;
    followers?: number;
    following?: number;
    postsCount?: number;
    bio?: string;
    fullName?: string;
    isVerified?: boolean;
    profilePic?: string;
    recentPosts?: {
        caption: string;
        likes?: number;
        date?: string;
        url?: string;
    }[];
    engagementRate?: number;
}

// ── Service ──────────────────────────────────────────────────

export class InstagramScraper {
    private getApiKey(): string | undefined {
        return process.env.SERPAPI_KEY;
    }

    isAvailable(): boolean {
        return !!this.getApiKey();
    }

    /**
     * Search for a company's Instagram profile via SerpAPI Google search.
     * 
     * Strategy:
     * 1. Google search: "{company} site:instagram.com"
     * 2. Extract Instagram URL from organic results
     * 3. Parse followers/bio from Google snippet
     * 4. Optionally do a second search for recent posts
     */
    async searchProfile(companyName: string): Promise<InstagramData> {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            console.log('⚠️ [Instagram] SerpAPI no configurado, saltando');
            return { found: false };
        }

        try {
            console.log(`📸 [Instagram] Buscando: "${companyName}"`);

            // Search for the Instagram profile
            const results = await getJson({
                engine: 'google',
                q: `${companyName} site:instagram.com`,
                api_key: apiKey,
                hl: 'es',
                gl: 'ar',
                num: 5,
            });

            const organic = results.organic_results || [];

            // Find the profile page (not a post or reel)
            const igResult = organic.find((r: any) =>
                r.link?.includes('instagram.com/') &&
                !r.link?.includes('/p/') &&
                !r.link?.includes('/reel/') &&
                !r.link?.includes('/stories/')
            );

            if (!igResult) {
                console.log('📸 [Instagram] No se encontró perfil');
                return { found: false };
            }

            // Extract handle from URL
            const handleMatch = igResult.link?.match(/instagram\.com\/([^/?#]+)/);
            const handle = handleMatch ? handleMatch[1] : undefined;

            // Parse snippet for followers, posts, following
            const snippet = igResult.snippet || '';
            const title = igResult.title || '';

            const followers = this.parseMetric(snippet, /(\d[\d,.]*[KkMm]?)\s*(?:seguidores|followers)/i);
            const following = this.parseMetric(snippet, /(\d[\d,.]*[KkMm]?)\s*(?:siguiendo|following)/i);
            const postsCount = this.parseMetric(snippet, /(\d[\d,.]*[KkMm]?)\s*(?:publicaciones|posts)/i);

            // Extract bio — usually in snippet after the metrics
            const bioMatch = snippet.match(/(?:publicaciones|posts|seguidores|followers)[\s\-—·]*(.+)/i);
            const bio = bioMatch ? bioMatch[1].trim().substring(0, 300) : undefined;

            // Extract verified status and full name from title
            const isVerified = title.includes('✓') || title.includes('✔');
            const fullName = title.replace(/[(@✓✔].*/g, '').replace(/Instagram/i, '').trim() || undefined;

            // Extract profile pic from the search result thumbnail
            const profilePic = igResult.thumbnail || undefined;

            const data: InstagramData = {
                found: true,
                handle,
                url: igResult.link,
                followers,
                following,
                postsCount,
                bio,
                fullName,
                isVerified,
                profilePic,
            };

            // Calculate engagement rate if we have followers
            if (data.followers && data.followers > 0) {
                // We'd need post-level likes for real engagement rate
                // For now, estimate from posts frequency
                data.engagementRate = undefined; // Will be calculated when we have post data
            }

            console.log(`✅ [Instagram] Encontrado: @${handle} — ${followers ? this.formatCount(followers) + ' seguidores' : 'seguidores desconocidos'}`);
            return data;

        } catch (error: any) {
            console.error(`❌ [Instagram] Error: ${error.message}`);
            return { found: false };
        }
    }

    /**
     * Search for person's Instagram (not company).
     * Useful for finding the contact's personal IG.
     */
    async searchPersonProfile(fullName: string, companyName?: string): Promise<InstagramData> {
        const apiKey = this.getApiKey();
        if (!apiKey) return { found: false };

        try {
            const query = companyName
                ? `"${fullName}" "${companyName}" site:instagram.com`
                : `"${fullName}" site:instagram.com`;

            const results = await getJson({
                engine: 'google',
                q: query,
                api_key: apiKey,
                hl: 'es',
                gl: 'ar',
                num: 3,
            });

            const organic = results.organic_results || [];
            const igResult = organic.find((r: any) =>
                r.link?.includes('instagram.com/') &&
                !r.link?.includes('/p/')
            );

            if (!igResult) return { found: false };

            const handleMatch = igResult.link?.match(/instagram\.com\/([^/?#]+)/);
            return {
                found: true,
                handle: handleMatch ? handleMatch[1] : undefined,
                url: igResult.link,
                bio: igResult.snippet?.substring(0, 300),
            };
        } catch {
            return { found: false };
        }
    }

    // ── Helpers ──────────────────────────────────────────────

    private parseMetric(text: string, pattern: RegExp): number | undefined {
        const match = text.match(pattern);
        if (!match) return undefined;
        return this.parseCount(match[1]);
    }

    private parseCount(str: string): number {
        const cleaned = str.replace(/[,.\s]/g, '');
        if (/[Kk]$/.test(str)) return Math.round(parseFloat(str.replace(/[Kk]$/, '')) * 1000);
        if (/[Mm]$/.test(str)) return Math.round(parseFloat(str.replace(/[Mm]$/, '')) * 1000000);
        return parseInt(cleaned, 10) || 0;
    }

    private formatCount(n: number): string {
        if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
        if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
        return n.toString();
    }
}

export const instagramScraper = new InstagramScraper();
