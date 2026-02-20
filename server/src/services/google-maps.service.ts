// server/src/services/google-maps.service.ts
// Google Maps business search via SerpAPI

import { getJson } from 'serpapi';

// ── Types ────────────────────────────────────────────────────

export interface GoogleMapsData {
    found: boolean;
    name?: string;
    rating?: number;
    reviewCount?: number;
    address?: string;
    phone?: string;
    website?: string;
    category?: string;
    hours?: string[];
    photos?: string[];
    locationCount?: number;
    priceLevel?: string;
    description?: string;
}

// ── Service ──────────────────────────────────────────────────

export class GoogleMapsService {
    private getApiKey(): string | undefined {
        return process.env.SERPAPI_KEY;
    }

    isAvailable(): boolean {
        return !!this.getApiKey();
    }

    /**
     * Search for a business on Google Maps via SerpAPI.
     * Returns rating, reviews, address, category, etc.
     */
    async searchBusiness(companyName: string, location?: string): Promise<GoogleMapsData> {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            console.log('⚠️ [GoogleMaps] SerpAPI no configurado, saltando');
            return { found: false };
        }

        try {
            console.log(`📍 [GoogleMaps] Buscando: "${companyName}"`);

            // Build query — add location context for better results
            const query = location
                ? `${companyName} ${location}`
                : companyName;

            const results = await getJson({
                engine: 'google_maps',
                q: query,
                api_key: apiKey,
                hl: 'es',
                ll: '@-34.6037,-58.3816,15.1z', // Default: Buenos Aires area
            });

            // Try place_results first (single place), then local_results (list)
            const place = results.place_results || results.local_results?.[0];
            if (!place) {
                console.log('📍 [GoogleMaps] No se encontró el negocio');
                return { found: false };
            }

            // Count locations if there are multiple local results
            const locationCount = results.local_results?.length || 1;

            const data: GoogleMapsData = {
                found: true,
                name: place.title || place.name,
                rating: place.rating,
                reviewCount: place.reviews || place.user_ratings_total,
                address: place.address || place.formatted_address,
                phone: place.phone,
                website: place.website,
                category: place.type || place.types?.[0],
                hours: this.extractHours(place),
                photos: this.extractPhotos(place, results),
                locationCount,
                priceLevel: place.price,
                description: place.description || place.editorial_summary?.overview,
            };

            console.log(`✅ [GoogleMaps] Encontrado: ${data.name} — ${data.rating}★ (${data.reviewCount} reviews), ${locationCount} ubicación(es)`);
            return data;

        } catch (error: any) {
            console.error(`❌ [GoogleMaps] Error: ${error.message}`);
            return { found: false };
        }
    }

    /**
     * Search for branch count specifically.
     * Does a second search to find how many locations a business has.
     */
    async searchBranches(companyName: string): Promise<number> {
        const apiKey = this.getApiKey();
        if (!apiKey) return 0;

        try {
            const results = await getJson({
                engine: 'google_maps',
                q: `${companyName} sucursales`,
                api_key: apiKey,
                hl: 'es',
                ll: '@-34.6037,-58.3816,15.1z',
            });

            return results.local_results?.length || 0;
        } catch {
            return 0;
        }
    }

    private extractHours(place: any): string[] {
        if (!place.hours) return [];
        if (Array.isArray(place.hours)) return place.hours;
        if (place.operating_hours?.wednesday) {
            return Object.entries(place.operating_hours).map(
                ([day, hours]) => `${day}: ${hours}`
            );
        }
        return [];
    }

    private extractPhotos(place: any, results: any): string[] {
        const photos: string[] = [];
        if (place.thumbnail) photos.push(place.thumbnail);
        if (place.images) {
            place.images.slice(0, 3).forEach((img: any) => {
                if (img.thumbnail) photos.push(img.thumbnail);
            });
        }
        if (results.photos) {
            results.photos.slice(0, 3).forEach((p: any) => {
                if (p.image) photos.push(p.image);
            });
        }
        return photos.slice(0, 5);
    }
}

export const googleMapsService = new GoogleMapsService();
