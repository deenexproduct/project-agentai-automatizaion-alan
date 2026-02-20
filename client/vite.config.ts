
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import branding from '../branding.json'

// Custom plugin to inject branding data into index.html dynamically
const brandingHtmlPlugin = () => {
    return {
        name: 'html-transform',
        transformIndexHtml(html: string) {
            return html
                .replace(
                    /<title>(.*?)<\/title>/,
                    `<title>${branding.projectName}</title>`
                )
                .replace(
                    /<\/head>/,
                    `  <link rel="icon" type="image/png" href="${branding.assets.faviconUrl}" />\n  </head>`
                )
        }
    }
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react(), brandingHtmlPlugin()],
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    define: {
        'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || 'http://localhost:3000'),
    },
})
