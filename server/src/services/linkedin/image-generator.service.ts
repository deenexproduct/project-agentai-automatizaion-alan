/**
 * ImageGeneratorService
 *
 * Generates images for LinkedIn posts using local AI.
 * Strategy pattern: IImageGenerator interface allows swapping backends
 * (Ollama → ComfyUI → Gemini) without touching other code.
 *
 * Current implementation: Ollama image generation (z-image-turbo model).
 */

import fs from 'fs';
import path from 'path';
import { IMAGE_CONFIG, OLLAMA_CONFIG } from '../../config/ai.config';

// ── Types ─────────────────────────────────────────────────────

export type ImageFormat = 'square' | 'landscape' | 'carousel';

export interface GeneratedImage {
    buffer: Buffer;
    path: string;
    width: number;
    height: number;
    prompt: string;
    generationTimeMs: number;
}

export interface IImageGenerator {
    generate(prompt: string, format: ImageFormat): Promise<GeneratedImage>;
    isAvailable(): Promise<boolean>;
}

// ── Brand Templates ───────────────────────────────────────────

const BRAND_BASE = 'professional, dark navy background #1E1B4B, purple accent #7C3AED, modern tech SaaS style, clean minimal, high quality';

export const imageTemplates = {
    dataCard: (metric: string, value: string): string =>
        `${BRAND_BASE}, data visualization card showing ${value} for ${metric}, large bold numbers, subtle gradient, infographic style`,

    comparison: (left: string, right: string): string =>
        `${BRAND_BASE}, split screen comparison, left side "${left}" in red/grey, right side "${right}" in green/purple, versus layout, modern design`,

    carouselCover: (title: string): string =>
        `${BRAND_BASE}, carousel cover slide, bold title "${title}", eye-catching hero image, swipe indicator, 1080x1350`,

    carouselSlide: (number: number, title: string): string =>
        `${BRAND_BASE}, carousel slide ${number}, heading "${title}", numbered step visual, consistent layout, 1080x1350`,

    quote: (text: string, author: string): string =>
        `${BRAND_BASE}, quote card, large quotation marks, text "${text}", attribution "${author}", elegant typography`,

    infographic: (title: string, points: string[]): string =>
        `${BRAND_BASE}, infographic, title "${title}", ${points.length} bullet points with icons, vertical layout, data-driven`,

    beforeAfter: (before: string, after: string): string =>
        `${BRAND_BASE}, before and after comparison, left BEFORE "${before}" faded, right AFTER "${after}" vibrant, arrow between`,

    /** Auto-select template based on draft content */
    selectTemplate: (formato: string, hookType: string, pilar: string): string => {
        if (formato === 'carousel') {
            return imageTemplates.carouselCover(pilar);
        }
        if (hookType === 'dato_impactante') {
            return imageTemplates.dataCard(pilar, 'key metric');
        }
        if (hookType === 'caso_real') {
            return imageTemplates.beforeAfter('Sin canal propio', 'Con Deenex');
        }
        // Default: clean branded image
        return `${BRAND_BASE}, abstract geometric shapes representing ${pilar}, subtle tech pattern, no text, clean background, 1080x1080`;
    },
};

// ── Ollama Image Generator ────────────────────────────────────

class OllamaImageGenerator implements IImageGenerator {
    async isAvailable(): Promise<boolean> {
        try {
            const res = await fetch(`${OLLAMA_CONFIG.baseUrl}/api/tags`, {
                signal: AbortSignal.timeout(5000),
            });
            if (!res.ok) return false;
            const data = await res.json();
            const models = (data.models || []).map((m: any) => m.name);
            return models.some((m: string) => m.includes(IMAGE_CONFIG.ollama.model));
        } catch {
            return false;
        }
    }

    async generate(prompt: string, format: ImageFormat): Promise<GeneratedImage> {
        const startTime = Date.now();
        const dimensions = IMAGE_CONFIG.output.formats[format];
        const fullPrompt = `${prompt}, ${dimensions.width}x${dimensions.height}`;

        const res = await fetch(`${OLLAMA_CONFIG.baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: IMAGE_CONFIG.ollama.model,
                prompt: fullPrompt,
                stream: false,
            }),
            signal: AbortSignal.timeout(IMAGE_CONFIG.ollama.timeoutMs),
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            throw new Error(`Image generation failed: HTTP ${res.status} — ${errText}`);
        }

        const data = await res.json();

        // Ollama returns base64 image in response.images array or response field
        let imageBase64: string | null = null;
        if (data.images && data.images.length > 0) {
            imageBase64 = data.images[0];
        }

        if (!imageBase64) {
            throw new Error(
                'Ollama did not return an image. The model may not support image generation. ' +
                `Verificá con: ollama list | grep ${IMAGE_CONFIG.ollama.model}`
            );
        }

        const buffer = Buffer.from(imageBase64, 'base64');
        const imagePath = this.saveImage(buffer, format);

        return {
            buffer,
            path: imagePath,
            width: dimensions.width,
            height: dimensions.height,
            prompt,
            generationTimeMs: Date.now() - startTime,
        };
    }

    private saveImage(buffer: Buffer, format: ImageFormat): string {
        const outputDir = path.resolve(__dirname, '..', '..', '..', IMAGE_CONFIG.output.directory);
        fs.mkdirSync(outputDir, { recursive: true });

        const filename = `${Date.now()}-${format}.png`;
        const filepath = path.join(outputDir, filename);
        fs.writeFileSync(filepath, buffer);

        console.log(`[ImageGenerator] Image saved: ${filepath} (${buffer.length} bytes)`);
        return filepath;
    }
}

// ── Placeholder Generator (fallback when no image AI available) ──

class PlaceholderImageGenerator implements IImageGenerator {
    async isAvailable(): Promise<boolean> {
        return true; // Always available — it just creates a placeholder
    }

    async generate(prompt: string, format: ImageFormat): Promise<GeneratedImage> {
        const dimensions = IMAGE_CONFIG.output.formats[format];

        // Create a minimal SVG placeholder
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}">
            <rect width="100%" height="100%" fill="#1E1B4B"/>
            <text x="50%" y="45%" font-family="Arial" font-size="24" fill="#A855F7" text-anchor="middle">🖼️ Imagen pendiente</text>
            <text x="50%" y="55%" font-family="Arial" font-size="14" fill="#9CA3AF" text-anchor="middle">${prompt.substring(0, 60)}...</text>
        </svg>`;

        const buffer = Buffer.from(svg);
        const outputDir = path.resolve(__dirname, '..', '..', '..', IMAGE_CONFIG.output.directory);
        fs.mkdirSync(outputDir, { recursive: true });

        const filename = `${Date.now()}-${format}-placeholder.svg`;
        const filepath = path.join(outputDir, filename);
        fs.writeFileSync(filepath, buffer);

        console.log(`[ImageGenerator] Placeholder saved: ${filepath}`);

        return {
            buffer,
            path: filepath,
            width: dimensions.width,
            height: dimensions.height,
            prompt,
            generationTimeMs: 0,
        };
    }
}

// ── Factory ───────────────────────────────────────────────────

class ImageGeneratorService {
    private generator: IImageGenerator | null = null;

    async getGenerator(): Promise<IImageGenerator> {
        if (this.generator) return this.generator;

        // Try Ollama image gen first
        if (IMAGE_CONFIG.provider === 'ollama') {
            const ollama = new OllamaImageGenerator();
            if (await ollama.isAvailable()) {
                this.generator = ollama;
                console.log('[ImageGenerator] Using Ollama image generation');
                return this.generator;
            }
            console.warn('[ImageGenerator] Ollama image model not available, falling back to placeholder');
        }

        // Fallback to placeholder
        this.generator = new PlaceholderImageGenerator();
        console.log('[ImageGenerator] Using placeholder image generation');
        return this.generator;
    }

    async generate(prompt: string, format: ImageFormat = 'square'): Promise<GeneratedImage> {
        const gen = await this.getGenerator();
        return gen.generate(prompt, format);
    }

    async isAvailable(): Promise<boolean> {
        const gen = await this.getGenerator();
        return gen.isAvailable();
    }

    /** Force re-detection of available generator */
    reset(): void {
        this.generator = null;
    }
}

// ── Singleton ─────────────────────────────────────────────────

export const imageGenerator = new ImageGeneratorService();
