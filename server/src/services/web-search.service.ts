// server/src/services/web-search.service.ts
// Simple web search service using SerpAPI

import { getJson } from 'serpapi';



export interface SearchResult {
    title: string;
    link: string;
    snippet: string;
    source?: string;
}

export class WebSearchService {
    /**
     * Read API key lazily from process.env so dotenv can load first
     */
    private getApiKey(): string | undefined {
        return process.env.SERPAPI_KEY;
    }

    constructor() {
        // Log initial status (may change after dotenv loads)
        if (this.getApiKey()) {
            console.log('🔍 [WebSearch] SerpAPI configurado');
        } else {
            console.log('⚠️ [WebSearch] SerpAPI no configurado (SERPAPI_KEY faltante)');
        }
    }

    /**
     * Search for company information
     */
    async searchCompany(companyName: string): Promise<{
        website?: string;
        description?: string;
        news: SearchResult[];
        knowledgeGraph?: any;
    }> {
        if (!this.getApiKey()) {
            console.log('⚠️ [WebSearch] No configurado, saltando búsqueda');
            return { news: [] };
        }

        try {
            console.log(`🔍 [WebSearch] Buscando: "${companyName}"`);
            const apiKey = this.getApiKey();

            // Search 1: General info
            const generalResults = await getJson({
                engine: 'google',
                q: `${companyName} empresa sitio web oficial`,
                api_key: apiKey,
                hl: 'es',
                gl: 'ar',
            });

            // Search 2: News
            const newsResults = await getJson({
                engine: 'google',
                q: `${companyName} noticias 2024 2025`,
                api_key: apiKey,
                hl: 'es',
                gl: 'ar',
                tbm: 'nws',
            });

            const website = this.extractWebsite(generalResults);
            const description = this.extractDescription(generalResults);
            const news = this.extractNews(newsResults);

            console.log(`✅ [WebSearch] Encontrado: ${website ? 'website ✓' : ''} ${news.length} noticias`);

            return { website, description, news, knowledgeGraph: generalResults.knowledge_graph };

        } catch (error: any) {
            console.error(`❌ [WebSearch] Error: ${error.message}`);
            return { news: [] };
        }
    }

    /**
     * Search for person information
     */
    async searchPerson(fullName: string, companyName?: string): Promise<{
        linkedInUrl?: string;
        position?: string;
        news: SearchResult[];
    }> {
        if (!this.getApiKey()) {
            return { news: [] };
        }

        try {
            const query = companyName
                ? `${fullName} ${companyName} LinkedIn`
                : `${fullName} LinkedIn`;

            const results = await getJson({
                engine: 'google',
                q: query,
                api_key: this.getApiKey(),
                hl: 'es',
                gl: 'ar',
            });

            const linkedInUrl = this.extractLinkedInUrl(results);
            const news = this.extractNews(results);

            return { linkedInUrl, news };

        } catch (error: any) {
            console.error(`❌ [WebSearch] Error: ${error.message}`);
            return { news: [] };
        }
    }

    private extractWebsite(results: any): string | undefined {
        const organic = results.organic_results || [];
        const firstResult = organic[0];
        if (firstResult?.link) {
            return firstResult.link;
        }
        return undefined;
    }

    private extractDescription(results: any): string | undefined {
        // Try knowledge graph first
        const kg = results.knowledge_graph;
        if (kg?.description) {
            return kg.description;
        }

        // Fallback to first organic result snippet
        const organic = results.organic_results || [];
        const firstResult = organic[0];
        if (firstResult?.snippet) {
            return firstResult.snippet;
        }

        return undefined;
    }

    private extractNews(results: any): SearchResult[] {
        const newsResults = results.news_results || [];
        return newsResults.slice(0, 3).map((n: any) => ({
            title: n.title,
            link: n.link,
            snippet: n.snippet,
            source: n.source,
        }));
    }

    private extractLinkedInUrl(results: any): string | undefined {
        const organic = results.organic_results || [];
        const linkedInResult = organic.find((r: any) =>
            r.link?.includes('linkedin.com/in/')
        );
        return linkedInResult?.link;
    }

    isAvailable(): boolean {
        return !!this.getApiKey();
    }
}

export const webSearchService = new WebSearchService();
