/** @type {import('tailwindcss').Config} */
import branding from '../branding.json' assert { type: 'json' };

export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
            colors: {
                primary: branding.colors.primary,
            },
        },
    },
    plugins: [],
}
