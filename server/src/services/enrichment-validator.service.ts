// server/src/services/enrichment-validator.service.ts
// Validates enrichment data quality to detect mock/hallucinated data

import type { IEnrichmentData } from '../models/linkedin-contact.model';

export interface ValidationResult {
    isValid: boolean;
    score: number; // 0-100
    warnings: string[];
    errors: string[];
}

export class EnrichmentValidator {
    // Patrones que indican datos falsos/hardcodeados
    private readonly MOCK_PATTERNS = [
        'burger king',
        'arcos dorados',
        'mcdonald',
        'wendy\'s',
        'kfc',
        'starbucks',
        'pepsico',
        'coca-cola',
    ];

    // Patrones que indican datos genéricos/vacíos
    private readonly GENERIC_PATTERNS = [
        /^operations manager$/i,
        /^project manager$/i,
        /^area manager$/i,
        /^business manager$/i,
        /^consultor$/i,
        /^independiente$/i,
        /^freelance$/i,
    ];

    /**
     * Valida los datos de enriquecimiento
     */
    validate(data: IEnrichmentData, currentCompany?: string): ValidationResult {
        const warnings: string[] = [];
        const errors: string[] = [];
        let score = 100;

        // 1. Detectar datos mock/hardcodeados
        const mockDetected = this.detectMockData(data);
        if (mockDetected.length > 0) {
            errors.push(`Datos mock detectados: ${mockDetected.join(', ')}`);
            score -= 50;
        }

        // 2. Validar que la empresa coincida con LinkedIn
        if (currentCompany) {
            const companyMatch = this.validateCompanyMatch(data, currentCompany);
            if (!companyMatch) {
                warnings.push(`Empresa diferente a LinkedIn: "${currentCompany}" vs "${data.company?.name}"`);
                score -= 15;
            }
        }

        // 3. Validar especificidad de la posición
        const positionCheck = this.validatePosition(data);
        if (!positionCheck.isSpecific) {
            warnings.push(`Posición genérica: "${positionCheck.position}"`);
            score -= 10;
        }

        // 4. Validar fuentes verificables
        const sourcesCheck = this.validateSources(data);
        if (sourcesCheck.errors.length > 0) {
            warnings.push(...sourcesCheck.errors);
            score -= sourcesCheck.errors.length * 5;
        }
        // Penalizar URLs sospechosas (posiblemente inventadas)
        if (sourcesCheck.suspiciousPatterns.length > 0) {
            warnings.push(...sourcesCheck.suspiciousPatterns);
            warnings.push('⚠️ URLs sospechosas detectadas - posibles noticias inventadas por AI');
            score -= sourcesCheck.suspiciousPatterns.length * 15; // Penalización fuerte
        }

        // 5. Validar noticias reales
        const newsCheck = this.validateNews(data);
        if (!newsCheck.hasRealNews) {
            warnings.push('Sin noticias reales verificables');
            score -= 10;
        }

        // Ajustar score final
        score = Math.max(0, Math.min(100, score));

        // Determinar validez
        const isValid = score >= 60 && errors.length === 0;

        return {
            isValid,
            score,
            warnings,
            errors
        };
    }

    /**
     * Detecta patrones de datos mock/hardcodeados
     */
    private detectMockData(data: IEnrichmentData): string[] {
        const detected: string[] = [];
        const textToCheck = [
            data.company?.name,
            data.company?.description,
            data.personProfile?.verifiedPosition,
        ].join(' ').toLowerCase();

        for (const pattern of this.MOCK_PATTERNS) {
            if (textToCheck.includes(pattern)) {
                detected.push(pattern);
            }
        }

        return detected;
    }

    /**
     * Valida que la empresa coincida con LinkedIn
     */
    private validateCompanyMatch(data: IEnrichmentData, linkedInCompany: string): boolean {
        if (!data.company?.name) return false;

        const enrichmentName = this.normalizeCompanyName(data.company.name);
        const linkedInName = this.normalizeCompanyName(linkedInCompany);

        // Coincidencia exacta o parcial
        return enrichmentName.includes(linkedInName) || 
               linkedInName.includes(enrichmentName) ||
               this.similarity(enrichmentName, linkedInName) > 0.6;
    }

    /**
     * Valida especificidad de la posición
     */
    private validatePosition(data: IEnrichmentData): { isSpecific: boolean; position: string } {
        const position = data.personProfile?.verifiedPosition || '';
        
        // Verificar si es un patrón genérico
        for (const pattern of this.GENERIC_PATTERNS) {
            if (pattern.test(position)) {
                return { isSpecific: false, position };
            }
        }

        // Verificar longitud mínima para especificidad
        if (position.length < 10) {
            return { isSpecific: false, position };
        }

        return { isSpecific: true, position };
    }

    /**
     * Valida fuentes verificables
     */
    private validateSources(data: IEnrichmentData): { errors: string[]; suspiciousPatterns: string[] } {
        const errors: string[] = [];
        const suspiciousPatterns: string[] = [];

        // Verificar URLs en personNews
        if (data.personNews && Array.isArray(data.personNews)) {
            for (const news of data.personNews) {
                if (news.url) {
                    const urlValid = this.isValidUrl(news.url);
                    if (!urlValid) {
                        errors.push(`URL inválida en personNews: ${news.url}`);
                    }
                    // Detectar patrones sospechosos de URLs inventadas
                    if (this.isSuspiciousUrl(news.url)) {
                        suspiciousPatterns.push(`URL sospechosa: ${news.source || 'desconocida'}`);
                    }
                }
            }
        }

        // Verificar URLs en companyNews
        if (data.companyNews && Array.isArray(data.companyNews)) {
            for (const news of data.companyNews) {
                if (news.url) {
                    const urlValid = this.isValidUrl(news.url);
                    if (!urlValid) {
                        errors.push(`URL inválida en companyNews: ${news.url}`);
                    }
                    // Detectar patrones sospechosos de URLs inventadas
                    if (this.isSuspiciousUrl(news.url)) {
                        suspiciousPatterns.push(`URL sospechosa: ${news.source || 'desconocida'}`);
                    }
                }
            }
        }

        return { errors, suspiciousPatterns };
    }

    /**
     * Detecta URLs sospechosas que parecen inventadas por AI
     */
    private isSuspiciousUrl(url: string): boolean {
        // Patrones típicos de URLs inventadas:
        // - IDs numéricos muy específicos (ej: nid24032024)
        // - Fechas exactas en URL que parecen inventadas
        // - Slugs demasiado perfectos
        
        const suspiciousPatterns = [
            /nid\d{6,}/i,  // IDs tipo nid24032024
            /\d{8}/,       // Fechas corridas tipo 20240315
            /-\d{4}-\d{2}-\d{2}-/, // Fechas en slug
        ];

        return suspiciousPatterns.some(pattern => pattern.test(url));
    }

    /**
     * Valida URLs HTTP asíncronamente (verifica si existen realmente)
     * NOTA: Esto es lento, usar solo para validación post-enriquecimiento
     */
    async validateUrlsHttp(data: IEnrichmentData): Promise<{brokenUrls: string[], warnings: string[]}> {
        const brokenUrls: string[] = [];
        const warnings: string[] = [];
        
        const allUrls: {url: string, source: string, type: string}[] = [];
        
        // Recolectar URLs
        if (data.personNews) {
            for (const news of data.personNews) {
                if (news.url) allUrls.push({url: news.url, source: news.source || 'desconocida', type: 'personNews'});
            }
        }
        if (data.companyNews) {
            for (const news of data.companyNews) {
                if (news.url) allUrls.push({url: news.url, source: news.source || 'desconocida', type: 'companyNews'});
            }
        }

        // Verificar URLs (con timeout)
        for (const {url, source, type} of allUrls) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
                
                const response = await fetch(url, {
                    method: 'HEAD',
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                
                clearTimeout(timeout);
                
                if (response.status === 404) {
                    brokenUrls.push(`${source}: ${url}`);
                    warnings.push(`❌ URL no existe (404): ${source}`);
                } else if (response.status >= 400) {
                    warnings.push(`⚠️ URL con error ${response.status}: ${source}`);
                }
            } catch (error: any) {
                if (error.name === 'AbortError') {
                    warnings.push(`⏱️ Timeout verificando: ${source}`);
                } else {
                    warnings.push(`⚠️ Error verificando ${source}: ${error.message}`);
                }
            }
        }

        return { brokenUrls, warnings };
    }

    /**
     * Valida que haya noticias reales
     */
    private validateNews(data: IEnrichmentData): { hasRealNews: boolean } {
        const allNews = [
            ...(data.personNews || []),
            ...(data.companyNews || [])
        ];

        if (allNews.length === 0) {
            return { hasRealNews: false };
        }

        // Al menos una noticia con título y fecha
        const hasValidNews = allNews.some(news => 
            news.title && 
            news.title.length > 10 &&
            news.title.toLowerCase() !== 'no news found' &&
            !news.title.includes('No se encontraron')
        );

        return { hasRealNews: hasValidNews };
    }

    /**
     * Normaliza nombre de empresa para comparación
     */
    private normalizeCompanyName(name: string): string {
        return name
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\bs\.?a\.?\b/g, '')
            .replace(/\bs\.?r\.?l\.?\b/g, '')
            .replace(/\bltd\.?\b/g, '')
            .replace(/\binc\.?\b/g, '');
    }

    /**
     * Calcula similitud simple entre strings
     */
    private similarity(a: string, b: string): number {
        if (a === b) return 1;
        if (a.length === 0 || b.length === 0) return 0;

        const longer = a.length > b.length ? a : b;
        const shorter = a.length > b.length ? b : a;
        
        const longerLength = longer.length;
        if (longerLength === 0) return 1;

        const distance = this.levenshteinDistance(longer, shorter);
        return (longerLength - distance) / longerLength;
    }

    /**
     * Distancia de Levenshtein
     */
    private levenshteinDistance(a: string, b: string): number {
        const matrix: number[][] = [];

        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }

    /**
     * Valida formato de URL
     */
    private isValidUrl(url: string): boolean {
        try {
            const urlObj = new URL(url);
            return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
        } catch {
            return false;
        }
    }

    /**
     * Genera reporte de validación
     */
    generateReport(result: ValidationResult): string {
        const lines = [
            `\n📋 [Validation] Score: ${result.score}/100`,
            `   Estado: ${result.isValid ? '✅ Válido' : '⚠️ Revisar'}`,
        ];

        if (result.errors.length > 0) {
            lines.push(`   ❌ Errores: ${result.errors.join('; ')}`);
        }

        if (result.warnings.length > 0) {
            lines.push(`   ⚠️ Advertencias (${result.warnings.length}):`);
            result.warnings.slice(0, 3).forEach(w => lines.push(`      - ${w}`));
        }

        return lines.join('\n');
    }
}

// Singleton export
export const enrichmentValidator = new EnrichmentValidator();
