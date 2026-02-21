import { Router, Request, Response } from 'express';
import { SystemConfig } from '../models/system-config.model';

const router = Router();

// GET /system-config
router.get('/', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const config = await SystemConfig.getOrCreate(userId);
        res.json(config);
    } catch (err: any) {
        console.error('SystemConfig GET error:', err.message);
        res.status(500).json({ error: 'Failed to fetch system config' });
    }
});

// POST /system-config/categories
router.post('/categories', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const { category } = req.body;
        if (!category) return res.status(400).json({ error: 'Category is required' });

        const config = await SystemConfig.getOrCreate(userId);
        if (!config.companyCategories.includes(category)) {
            config.companyCategories.push(category);
            await config.save();
        }
        res.json(config);
    } catch (err: any) {
        console.error('SystemConfig add category error:', err.message);
        res.status(500).json({ error: 'Failed to add category' });
    }
});

// POST /system-config/roles
router.post('/roles', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const { role } = req.body;
        if (!role) return res.status(400).json({ error: 'Role is required' });

        const config = await SystemConfig.getOrCreate(userId);
        if (!config.contactRoles.includes(role)) {
            config.contactRoles.push(role);
            await config.save();
        }
        res.json(config);
    } catch (err: any) {
        console.error('SystemConfig add role error:', err.message);
        res.status(500).json({ error: 'Failed to add role' });
    }
});

// POST /system-config/positions
router.post('/positions', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id.toString();
        const { position } = req.body;
        if (!position) return res.status(400).json({ error: 'Position is required' });

        const config = await SystemConfig.getOrCreate(userId);
        if (!config.contactPositions.includes(position)) {
            config.contactPositions.push(position);
            await config.save();
        }
        res.json(config);
    } catch (err: any) {
        console.error('SystemConfig add position error:', err.message);
        res.status(500).json({ error: 'Failed to add position' });
    }
});

// GET /system-config/extract-logo
router.get('/extract-logo', async (req: Request, res: Response) => {
    const targetUrl = req.query.url as string;

    if (!targetUrl) {
        return res.status(400).json({ error: 'URL parameter is required' });
    }

    try {
        // Normalize URL
        let finalUrl = targetUrl;
        if (!finalUrl.startsWith('http')) {
            finalUrl = `https://${finalUrl}`;
        }

        const axios = require('axios');
        const cheerio = require('cheerio');

        // Timeout is fundamental to avoid freezing the system if website is unresponsive
        const response = await axios.get(finalUrl, { timeout: 4000 });
        const html = response.data;
        const $ = cheerio.load(html);

        // Extract Theme Color
        let themeColor = $('meta[name="theme-color"]').attr('content') || '';

        // Priority List of images to try (og:image first for the actual logo, touch-icons as fallback)
        const candidates = [
            $('meta[property="og:image"]').attr('content'),
            $('link[rel="apple-touch-icon"]').attr('href'),
            $('link[rel="icon"][sizes="512x512"]').attr('href'),
            $('link[rel="icon"][sizes="192x192"]').attr('href'),
            $('link[rel="icon"]').attr('href'),
            $('link[rel="shortcut icon"]').attr('href')
        ].filter(Boolean) as string[];

        // Normalize URLs
        const validCandidates = candidates.map(url => {
            if (url.startsWith('//')) return `https:${url}`;
            if (url.startsWith('/')) return `${new URL(finalUrl).origin}${url}`;
            if (!url.startsWith('http')) return `${new URL(finalUrl).origin}/${url}`;
            return url;
        });

        // Add Unavatar as a last resort
        const domain = new URL(finalUrl).hostname.replace('www.', '');
        validCandidates.push(`https://unavatar.io/${domain}`);

        // Iterar hasta encontrar una imagen válida y su color
        let finalLogoUrl = validCandidates[0];
        const { getAverageColor } = require('fast-average-color-node');

        for (const url of validCandidates) {
            try {
                // Hacemos el ping a la imagen
                const imgResp = await axios.get(url, { responseType: 'arraybuffer', timeout: 3000 });
                finalLogoUrl = url;

                // Extraer el color dominante usando el Favicon (Unavatar) como referencia base, 
                // ya que las imágenes OG/transparentes suelen ser blancas monocromáticas.
                if (!themeColor) {
                    try {
                        const domain = new URL(finalUrl).hostname.replace('www.', '');
                        const favResp = await axios.get(`https://unavatar.io/${domain}`, { responseType: 'arraybuffer', timeout: 3000 });
                        const colorData = await getAverageColor(favResp.data, { algorithm: 'dominant', ignoredColor: [255, 255, 255, 255, 50] });
                        if (colorData && colorData.hex && colorData.hex !== '#ffffff') {
                            themeColor = colorData.hex;
                        } else {
                            throw new Error('Fallback to current image');
                        }
                    } catch (colorExtractErr) {
                        try {
                            const colorData = await getAverageColor(imgResp.data, { algorithm: 'dominant', ignoredColor: [255, 255, 255, 255, 50] });
                            if (colorData && colorData.hex && colorData.hex !== '#ffffff') {
                                themeColor = colorData.hex;
                            }
                        } catch (e) { }
                    }
                }

                // Si la imagen principal descargó correctamente y tiene sentido, paramos de buscar
                break;
            } catch (err) {
                // Imagen rota (ej. 404 Not Found de la etiqueta og:image de Palta) o Timeout
                console.warn(`[Logo Scraper] Ignorando imagen fallida (${url})`);
                continue; // Pasa a la siguiente URL candidata (ej. el apple-touch-icon en vez del bg)
            }
        }

        return res.json({ logo: finalLogoUrl, themeColor: themeColor || null });

    } catch (error: any) {
        console.warn(`[Logo Scraper] Could not extract from ${targetUrl}:`, error.message);
        // Fallback on error (site blocked us, timeout, invalid domain)
        try {
            const tempUrl = targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`;
            const domain = new URL(tempUrl).hostname.replace('www.', '');
            return res.json({ logo: `https://unavatar.io/${domain}?fallback=false`, themeColor: null });
        } catch {
            return res.json({ logo: '', themeColor: null });
        }
    }
});

export default router;
