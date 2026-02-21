const axios = require('axios');
const cheerio = require('cheerio');

async function test(url) {
    try {
        let finalUrl = url;
        if (!finalUrl.startsWith('http')) finalUrl = `https://${finalUrl}`;
        const response = await axios.get(finalUrl, { timeout: 4000 });
        const html = response.data;
        const $ = cheerio.load(html);
        
        let extractedLogoUrl = '';
        extractedLogoUrl = $('meta[property="og:image"]').attr('content') || '';
        if (!extractedLogoUrl) extractedLogoUrl = $('link[rel="apple-touch-icon"]').attr('href') || '';
        if (!extractedLogoUrl) extractedLogoUrl = $('link[rel="icon"][sizes="512x512"], link[rel="icon"][sizes="192x192"]').attr('href') || '';
        if (!extractedLogoUrl) extractedLogoUrl = $('link[rel="icon"], link[rel="shortcut icon"]').attr('href') || '';

        if (extractedLogoUrl) {
            if (extractedLogoUrl.startsWith('//')) {
                extractedLogoUrl = `https:${extractedLogoUrl}`;
            } else if (extractedLogoUrl.startsWith('/')) {
                const urlObj = new URL(finalUrl);
                extractedLogoUrl = `${urlObj.origin}${extractedLogoUrl}`;
            } else if (!extractedLogoUrl.startsWith('http')) {
                const urlObj = new URL(finalUrl);
                extractedLogoUrl = `${urlObj.origin}/${extractedLogoUrl}`;
            }
        }
        console.log("Found logo:", extractedLogoUrl);
    } catch(e) {
        console.error("Error:", e.message);
    }
}
test('https://tostadocafeclub.com/');
