/**
 * Connection Verifier Service
 * Sistema robusto de verificación multi-método para confirmar conexiones
 */

import { Page } from 'puppeteer';

export interface VerificationResult {
    success: boolean;
    connected: boolean;
    confidence: 'high' | 'medium' | 'low';
    method: string;
    evidence: string[];
    timestamp: Date;
}

interface VerificationMethod {
    name: string;
    execute: (page: Page) => Promise<VerificationResult | null>;
    weight: number;
}

export class ConnectionVerifier {
    private readonly MIN_CONFIDENCE_THRESHOLD = 0.6;
    
    private methods: VerificationMethod[] = [
        { name: 'button_state', execute: this.verifyByButtonState.bind(this), weight: 0.3 },
        { name: 'connection_degree', execute: this.verifyByConnectionDegree.bind(this), weight: 0.25 },
        { name: 'messaging_ability', execute: this.verifyByMessagingAbility.bind(this), weight: 0.25 },
        { name: 'network_page', execute: this.verifyByNetworkPage.bind(this), weight: 0.2 },
    ];

    /**
     * Verifica si una conexión fue enviada usando múltiples métodos
     */
    async verify(page: Page, profileUrl: string, maxRetries: number = 2): Promise<VerificationResult> {
        const attempts: VerificationResult[] = [];
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            if (attempt > 0) {
                console.log(`[ConnectionVerifier] 🔄 Retry attempt ${attempt}/${maxRetries}`);
                await this.delay(2000 * attempt);
                await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
                await this.delay(1500);
            }

            // Ejecutar todos los métodos de verificación
            const results = await this.runAllMethods(page);
            
            // Calcular resultado agregado
            const aggregated = this.aggregateResults(results);
            attempts.push(aggregated);

            // Si tenemos alta confianza de éxito o fallo, retornar
            if (aggregated.confidence === 'high') {
                return aggregated;
            }

            // Si es medium pero tenemos suficiente evidencia
            if (aggregated.confidence === 'medium' && aggregated.evidence.length >= 2) {
                return aggregated;
            }
        }

        // Retornar el mejor resultado de los intentos
        return this.selectBestResult(attempts);
    }

    /**
     * Verificación rápida (un solo método)
     */
    async verifyQuick(page: Page): Promise<VerificationResult> {
        const result = await this.verifyByButtonState(page);
        return result || {
            success: false,
            connected: false,
            confidence: 'low',
            method: 'quick_check_failed',
            evidence: ['Could not determine connection state'],
            timestamp: new Date()
        };
    }

    private async runAllMethods(page: Page): Promise<VerificationResult[]> {
        const results: VerificationResult[] = [];

        for (const method of this.methods) {
            try {
                const result = await this.runWithTimeout(
                    () => method.execute(page),
                    10000 // 10 segundos timeout por método
                );
                
                if (result) {
                    results.push(result);
                }
            } catch (error) {
                console.warn(`[ConnectionVerifier] ⚠️ Method ${method.name} failed:`, error);
            }
        }

        return results;
    }

    private async verifyByButtonState(page: Page): Promise<VerificationResult | null> {
        const indicators = await page.evaluate(() => {
            const pendingTexts = ['pendiente', 'pending', 'invitation sent', 'invitación enviada'];
            const withdrawTexts = ['retirar', 'withdraw', 'cancelar', 'cancel'];
            const connectTexts = ['conectar', 'connect', 'añadir', 'add'];
            
            const allElements = Array.from(document.querySelectorAll('button, a, span, div'));
            const found: Array<{ text: string; type: 'pending' | 'withdraw' | 'connect' | 'other' }> = [];
            
            for (const el of allElements) {
                const text = (el.textContent || '').toLowerCase().trim();
                const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
                
                if (pendingTexts.some(t => text.includes(t) || ariaLabel.includes(t))) {
                    found.push({ text: el.textContent?.trim() || ariaLabel, type: 'pending' });
                } else if (withdrawTexts.some(t => text.includes(t) || ariaLabel.includes(t))) {
                    found.push({ text: el.textContent?.trim() || ariaLabel, type: 'withdraw' });
                } else if (connectTexts.some(t => text.includes(t) || ariaLabel.includes(t))) {
                    found.push({ text: el.textContent?.trim() || ariaLabel, type: 'connect' });
                }
            }
            
            return found;
        });

        if (indicators.length === 0) {
            return null;
        }

        const pending = indicators.filter(i => i.type === 'pending' || i.type === 'withdraw');
        const connect = indicators.filter(i => i.type === 'connect');

        if (pending.length > 0) {
            return {
                success: true,
                connected: true,
                confidence: 'high',
                method: 'button_state',
                evidence: pending.map(i => `Found indicator: "${i.text}"`),
                timestamp: new Date()
            };
        }

        if (connect.length > 0) {
            return {
                success: true,
                connected: false,
                confidence: 'medium',
                method: 'button_state',
                evidence: connect.map(i => `Connect button still visible: "${i.text}"`),
                timestamp: new Date()
            };
        }

        return {
            success: false,
            connected: false,
            confidence: 'low',
            method: 'button_state',
            evidence: ['No clear indicators found'],
            timestamp: new Date()
        };
    }

    private async verifyByConnectionDegree(page: Page): Promise<VerificationResult | null> {
        const degree = await page.evaluate(() => {
            // Múltiples selectores para el grado de conexión
            const selectors = [
                '.dist-value',
                '.distance-badge',
                '[class*="distance"]',
                '.profile-distance',
                '[data-test-id="distance-value"]'
            ];
            
            for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (el) {
                    return {
                        text: el.textContent?.trim(),
                        isFirstDegree: el.textContent?.includes('1') || 
                                      el.textContent?.toLowerCase().includes('1°')
                    };
                }
            }
            
            return null;
        });

        if (!degree) {
            return null;
        }

        if (degree.isFirstDegree) {
            return {
                success: true,
                connected: true,
                confidence: 'high',
                method: 'connection_degree',
                evidence: [`Connection degree indicates 1st: "${degree.text}"`],
                timestamp: new Date()
            };
        }

        return {
            success: true,
            connected: false,
            confidence: 'medium',
            method: 'connection_degree',
            evidence: [`Connection degree not 1st: "${degree.text}"`],
            timestamp: new Date()
        };
    }

    private async verifyByMessagingAbility(page: Page): Promise<VerificationResult | null> {
        const messaging = await page.evaluate(() => {
            const messageSelectors = [
                'button[aria-label*="Message"]',
                'button[aria-label*="Mensaje"]',
                'a[href*="messaging"]',
                '[data-test-id="message-button"]',
                'button:has-text("Message")',
                'button:has-text("Mensaje")'
            ];
            
            for (const selector of messageSelectors) {
                const el = document.querySelector(selector);
                if (el && (el as HTMLElement).offsetParent !== null) { // Visible
                    return {
                        found: true,
                        text: el.textContent?.trim() || 'Message button found'
                    };
                }
            }
            
            return { found: false };
        });

        if (!messaging.found) {
            return null;
        }

        return {
            success: true,
            connected: true,
            confidence: 'medium',
            method: 'messaging_ability',
            evidence: [`Message button available: "${messaging.text}"`],
            timestamp: new Date()
        };
    }

    private async verifyByNetworkPage(page: Page): Promise<VerificationResult | null> {
        // Este método verificaría navegando a la página de red del perfil
        // Es más lento pero más confiable
        
        try {
            const currentUrl = page.url();
            const networkUrl = currentUrl.replace('/in/', '/in/') + '/network';
            
            // Abrir en nueva pestaña o verificar si ya está en red
            const inNetwork = await page.evaluate(() => {
                // Buscar indicadores de que ya está en la red
                const networkIndicators = document.querySelectorAll(
                    '.network-connect, .connection-indicator, [data-test-id="in-network"]'
                );
                return networkIndicators.length > 0;
            });

            if (inNetwork) {
                return {
                    success: true,
                    connected: true,
                    confidence: 'high',
                    method: 'network_page',
                    evidence: ['Network indicators found on page'],
                    timestamp: new Date()
                };
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    private aggregateResults(results: VerificationResult[]): VerificationResult {
        if (results.length === 0) {
            return {
                success: false,
                connected: false,
                confidence: 'low',
                method: 'no_methods_succeeded',
                evidence: ['All verification methods failed'],
                timestamp: new Date()
            };
        }

        // Contar votos ponderados
        let connectedScore = 0;
        let notConnectedScore = 0;
        const allEvidence: string[] = [];

        for (const result of results) {
            const weight = this.methods.find(m => m.name === result.method)?.weight || 0.2;
            
            if (result.connected) {
                connectedScore += weight;
            } else {
                notConnectedScore += weight;
            }
            
            allEvidence.push(...result.evidence);
        }

        const totalScore = connectedScore + notConnectedScore;
        const connectedRatio = connectedScore / totalScore;

        // Determinar confianza
        let confidence: 'high' | 'medium' | 'low';
        if (results.length >= 3 && (connectedRatio > 0.7 || connectedRatio < 0.3)) {
            confidence = 'high';
        } else if (results.length >= 2 && (connectedRatio > 0.6 || connectedRatio < 0.4)) {
            confidence = 'medium';
        } else {
            confidence = 'low';
        }

        return {
            success: true,
            connected: connectedRatio > 0.5,
            confidence,
            method: 'aggregated',
            evidence: [
                `Connected confidence: ${(connectedRatio * 100).toFixed(1)}%`,
                `Methods used: ${results.length}`,
                ...allEvidence.slice(0, 5) // Limitar evidencia
            ],
            timestamp: new Date()
        };
    }

    private selectBestResult(attempts: VerificationResult[]): VerificationResult {
        // Priorizar resultados con alta confianza
        const highConfidence = attempts.filter(r => r.confidence === 'high');
        if (highConfidence.length > 0) {
            return highConfidence[highConfidence.length - 1];
        }

        // Luego medium
        const mediumConfidence = attempts.filter(r => r.confidence === 'medium');
        if (mediumConfidence.length > 0) {
            return mediumConfidence[mediumConfidence.length - 1];
        }

        // Retornar el último intento
        return attempts[attempts.length - 1];
    }

    private async runWithTimeout<T>(
        fn: () => Promise<T>,
        timeoutMs: number
    ): Promise<T | null> {
        return Promise.race([
            fn(),
            new Promise<null>((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), timeoutMs)
            )
        ]).catch(() => null);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Singleton instance
export const connectionVerifier = new ConnectionVerifier();
