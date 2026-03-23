import { useState, useEffect, useRef } from 'react';
import { getCompanyLogos } from '../services/crm.service';

const CACHE_KEY = 'crm_company_logos';

type CachedLogo = { logo: string; themeColor?: string; updatedAt?: string };
type LogoCache = Record<string, CachedLogo>;

function readCache(): LogoCache {
    try {
        return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    } catch {
        return {};
    }
}

function writeCache(cache: LogoCache) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
        // localStorage full — evict oldest entries
        const entries = Object.entries(cache);
        if (entries.length > 50) {
            const trimmed = Object.fromEntries(entries.slice(-50));
            try { localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed)); } catch { /* give up */ }
        }
    }
}

/**
 * Loads company logos from localStorage cache first, then fetches missing ones
 * from the API in the background. Returns a map of companyId → { logo, themeColor }.
 */
export function useCompanyLogos(companyIds: string[]) {
    const [logos, setLogos] = useState<LogoCache>(() => {
        // Immediately return cached logos
        const cache = readCache();
        const result: LogoCache = {};
        for (const id of companyIds) {
            if (cache[id]) result[id] = cache[id];
        }
        return result;
    });

    const prevIdsRef = useRef<string>('');

    useEffect(() => {
        const idsKey = companyIds.sort().join(',');
        if (!idsKey || idsKey === prevIdsRef.current) return;
        prevIdsRef.current = idsKey;

        const cache = readCache();

        // Return cached logos immediately
        const cached: LogoCache = {};
        const missing: string[] = [];
        for (const id of companyIds) {
            if (cache[id]) {
                cached[id] = cache[id];
            } else {
                missing.push(id);
            }
        }

        setLogos(cached);

        // Fetch missing logos in background
        if (missing.length === 0) return;

        // Batch in chunks of 30 to avoid URL length limits
        const chunks: string[][] = [];
        for (let i = 0; i < missing.length; i += 30) {
            chunks.push(missing.slice(i, i + 30));
        }

        Promise.all(chunks.map(chunk => getCompanyLogos(chunk)))
            .then(results => {
                const fetched: LogoCache = {};
                for (const result of results) {
                    Object.assign(fetched, result);
                }

                // Update cache
                const updatedCache = { ...cache, ...fetched };
                writeCache(updatedCache);

                // Merge with state
                setLogos(prev => ({ ...prev, ...fetched }));
            })
            .catch(err => {
                console.error('Failed to fetch company logos:', err);
            });
    }, [companyIds.length, companyIds.join(',')]);

    return logos;
}
