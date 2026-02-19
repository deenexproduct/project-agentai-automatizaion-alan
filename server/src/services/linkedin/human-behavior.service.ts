/**
 * Human Behavior Service
 * Simula comportamiento humano real en el navegador
 * - Scroll con aceleración/desaceleración
 * - Movimientos de mouse con curvas de Bézier
 * - Tiempos de espera variables
 * - Patrones de "lectura"
 */

import { Page } from 'puppeteer';

interface Point {
    x: number;
    y: number;
}

interface ScrollOptions {
    minScrolls?: number;
    maxScrolls?: number;
    minDistance?: number;
    maxDistance?: number;
    minDuration?: number;
    maxDuration?: number;
    readPauseChance?: number;
}

interface MouseMoveOptions {
    steps?: number;
    duration?: number;
    variance?: number;
}

export class HumanBehaviorService {
    private lastMousePosition: Point = { x: 0, y: 0 };
    private readonly DEFAULT_VIEWPORT = { width: 1366, height: 768 };

    /**
     * Genera un delay aleatorio con variación no uniforme
     */
    getRandomDelay(baseMin: number, baseMax: number, variance: number = 0.2): number {
        const base = Math.random() * (baseMax - baseMin) + baseMin;
        const variation = base * variance * (Math.random() - 0.5);
        return Math.max(100, Math.round(base + variation));
    }

    /**
     * Delay simple
     */
    async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Scroll humanizado con aceleración/desaceleración
     * NOTA: Se usa scroll simple para evitar problemas con tsx/esbuild y __name
     */
    async humanScroll(page: Page, options: ScrollOptions = {}): Promise<void> {
        const {
            minScrolls = 2,
            maxScrolls = 5,
            minDistance = 100,
            maxDistance = 400,
            readPauseChance = 0.2
        } = options;

        const scrolls = this.getRandomInt(minScrolls, maxScrolls);
        
        for (let i = 0; i < scrolls; i++) {
            const distance = this.getRandomInt(minDistance, maxDistance);
            const steps = this.getRandomInt(5, 15);
            const stepDelay = this.getRandomInt(30, 80);
            
            // Scroll simple paso a paso (evita funciones anidadas en page.evaluate)
            for (let step = 0; step < steps; step++) {
                await page.evaluate((d) => {
                    window.scrollBy(0, d);
                }, Math.round(distance / steps));
                await this.delay(stepDelay);
            }

            // Pausa variable entre scrolls
            const pauseDelay = this.getRandomDelay(500, 2000);
            await this.delay(pauseDelay);

            // Chance de "leer" (pausa larga)
            if (Math.random() < readPauseChance) {
                const readTime = this.getRandomDelay(2000, 6000);
                await this.delay(readTime);
            }
        }
    }

    /**
     * Scroll rápido para navegación
     * NOTA: Se usa scroll simple para evitar problemas con tsx/esbuild y __name
     */
    async quickScroll(page: Page, direction: 'up' | 'down' = 'down'): Promise<void> {
        const distance = direction === 'down' ? 300 : -300;
        const steps = this.getRandomInt(3, 6);
        const stepDelay = this.getRandomInt(50, 100);
        
        // Scroll simple paso a paso (evita funciones anidadas en page.evaluate)
        for (let step = 0; step < steps; step++) {
            await page.evaluate((d) => {
                window.scrollBy(0, d);
            }, Math.round(distance / steps));
            await this.delay(stepDelay);
        }
        
        await this.delay(this.getRandomDelay(200, 500));
    }

    /**
     * Movimiento de mouse humanizado con curva de Bézier
     */
    async humanMouseMove(
        page: Page, 
        targetX: number, 
        targetY: number, 
        options: MouseMoveOptions = {}
    ): Promise<void> {
        const {
            steps = this.getRandomInt(10, 25),
            duration = this.getRandomInt(300, 800),
            variance = 0.3
        } = options;

        // Obtener posición actual
        const start = await this.getCurrentMousePosition(page);
        
        // Generar puntos de control para curva de Bézier
        const controlPoints = this.generateBezierControlPoints(
            start.x, start.y, targetX, targetY, variance
        );

        // Mover a través de la curva
        const stepDelay = duration / steps;
        
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const point = this.getBezierPoint(t, controlPoints);
            
            // Agregar pequeña variación aleatoria
            const jitterX = (Math.random() - 0.5) * 2;
            const jitterY = (Math.random() - 0.5) * 2;
            
            await page.mouse.move(point.x + jitterX, point.y + jitterY);
            
            // Delay variable entre pasos
            const variableDelay = stepDelay * (0.8 + Math.random() * 0.4);
            await this.delay(variableDelay);
        }

        // Guardar posición final
        this.lastMousePosition = { x: targetX, y: targetY };
        await this.updateMousePosition(page, targetX, targetY);
    }

    /**
     * Click humanizado con movimiento previo
     */
    async humanClick(page: Page, element: any, clickDelay: boolean = true): Promise<void> {
        const box = await element.boundingBox();
        if (!box) {
            // Fallback a click directo si no hay bounding box
            await element.click();
            return;
        }

        // Calcular punto objetivo con variación aleatoria
        const variance = 0.15; // 15% de variación desde el centro
        const offsetX = (Math.random() - 0.5) * 2 * (box.width * variance);
        const offsetY = (Math.random() - 0.5) * 2 * (box.height * variance);
        
        const targetX = box.x + box.width / 2 + offsetX;
        const targetY = box.y + box.height / 2 + offsetY;

        // Mover mouse de forma humana
        await this.humanMouseMove(page, targetX, targetY, {
            steps: this.getRandomInt(8, 20),
            duration: this.getRandomInt(200, 600)
        });

        // Pausa antes de clickear (simula decisión)
        if (clickDelay) {
            await this.delay(this.getRandomDelay(80, 250));
        }

        // Click
        await page.mouse.click(targetX, targetY);

        // Guardar posición
        this.lastMousePosition = { x: targetX, y: targetY };
        await this.updateMousePosition(page, targetX, targetY);
    }

    /**
     * Simula lectura de contenido (pausa variable)
     */
    async simulateReading(minMs: number = 1500, maxMs: number = 5000): Promise<void> {
        const readTime = this.getRandomDelay(minMs, maxMs);
        await this.delay(readTime);
    }

    /**
     * Pausa de "pensamiento" antes de acción importante
     */
    async thinkPause(minMs: number = 800, maxMs: number = 2000): Promise<void> {
        await this.delay(this.getRandomDelay(minMs, maxMs));
    }

    /**
     * Movimiento aleatorio del mouse (simula indecisión/movimiento natural)
     */
    async randomMouseWander(page: Page, intensity: 'low' | 'medium' | 'high' = 'low'): Promise<void> {
        const moves = {
            low: { min: 1, max: 3, radius: 100 },
            medium: { min: 2, max: 5, radius: 200 },
            high: { min: 3, max: 7, radius: 300 }
        };

        const config = moves[intensity];
        const numMoves = this.getRandomInt(config.min, config.max);

        for (let i = 0; i < numMoves; i++) {
            const current = await this.getCurrentMousePosition(page);
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * config.radius;
            
            const targetX = Math.max(50, Math.min(1300, current.x + Math.cos(angle) * distance));
            const targetY = Math.max(50, Math.min(700, current.y + Math.sin(angle) * distance));

            await this.humanMouseMove(page, targetX, targetY, {
                steps: this.getRandomInt(5, 12),
                duration: this.getRandomInt(150, 400)
            });

            await this.delay(this.getRandomDelay(200, 800));
        }
    }

    /**
     * Secuencia completa de interacción humana con un elemento
     */
    async humanInteraction(
        page: Page, 
        element: any, 
        options: {
            scrollBefore?: boolean;
            hoverTime?: number;
            scrollAfter?: boolean;
        } = {}
    ): Promise<void> {
        const { scrollBefore = true, hoverTime = 500, scrollAfter = false } = options;

        if (scrollBefore) {
            await this.quickScroll(page, 'down');
        }

        // Mover hacia el elemento (hover)
        const box = await element.boundingBox();
        if (box) {
            await this.humanMouseMove(page, box.x + box.width / 2, box.y + box.height / 2);
            await this.delay(hoverTime);
        }

        // Click
        await this.humanClick(page, element, false);

        if (scrollAfter) {
            await this.delay(this.getRandomDelay(500, 1000));
            await this.quickScroll(page, 'down');
        }
    }

    // ─── Private helpers ─────────────────────────────────────────

    private getRandomInt(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    private async getCurrentMousePosition(page: Page): Promise<Point> {
        try {
            const pos = await page.evaluate(() => {
                return {
                    x: (window as any).lastMouseX || 100,
                    y: (window as any).lastMouseY || 100
                };
            });
            return pos;
        } catch {
            return this.lastMousePosition;
        }
    }

    private async updateMousePosition(page: Page, x: number, y: number): Promise<void> {
        await page.evaluate(({ x, y }) => {
            (window as any).lastMouseX = x;
            (window as any).lastMouseY = y;
        }, { x, y });
    }

    private generateBezierControlPoints(
        x1: number, y1: number, x2: number, y2: number, variance: number
    ): Point[] {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        
        // Generar puntos de control con variación perpendicular a la línea
        const perpX = -(y2 - y1) / distance;
        const perpY = (x2 - x1) / distance;
        
        const var1 = (Math.random() - 0.5) * distance * variance;
        const var2 = (Math.random() - 0.5) * distance * variance;

        return [
            { x: x1, y: y1 },
            { x: midX + perpX * var1, y: midY + perpY * var1 },
            { x: midX + perpX * var2, y: midY + perpY * var2 },
            { x: x2, y: y2 }
        ];
    }

    private getBezierPoint(t: number, points: Point[]): Point {
        // Curva de Bézier cúbica
        const [p0, p1, p2, p3] = points;
        const cX = 3 * (p1.x - p0.x);
        const bX = 3 * (p2.x - p1.x) - cX;
        const aX = p3.x - p0.x - cX - bX;
        
        const cY = 3 * (p1.y - p0.y);
        const bY = 3 * (p2.y - p1.y) - cY;
        const aY = p3.y - p0.y - cY - bY;
        
        const x = aX * Math.pow(t, 3) + bX * Math.pow(t, 2) + cX * t + p0.x;
        const y = aY * Math.pow(t, 3) + bY * Math.pow(t, 2) + cY * t + p0.y;
        
        return { x, y };
    }
}

// Singleton instance
export const humanBehavior = new HumanBehaviorService();
