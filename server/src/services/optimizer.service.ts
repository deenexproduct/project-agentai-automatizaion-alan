import fs from 'fs';
import path from 'path';
import Groq from 'groq-sdk';

const PERSONALITY_PATH = path.join(__dirname, '../../data/personality.md');

// Cache for personality to avoid reading file on every request
let cachedPersonality: string | null = null;

function getPersonality(): string {
    if (!cachedPersonality) {
        try {
            cachedPersonality = fs.readFileSync(PERSONALITY_PATH, 'utf-8');
        } catch {
            cachedPersonality = 'No personality profile configured.';
        }
    }
    return cachedPersonality;
}

function updatePersonality(content: string): void {
    const dir = path.dirname(PERSONALITY_PATH);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PERSONALITY_PATH, content, 'utf-8');
    cachedPersonality = null; // Invalidate cache
}

function buildSystemPrompt(personality: string): string {
    return `# Tu perfil de escritura
${personality}

# Instrucciones de optimización
Sos un corrector de texto. Tu ÚNICO trabajo es:

1. **Corregir errores de ortografía y gramática** — tildes, letras faltantes, concordancia
2. **Eliminar palabras innecesarias** — ser más conciso sin perder significado
3. **MANTENER** el tono, la calidez y la personalidad del autor — esto es CRÍTICO
4. **NO cambiar el significado** del mensaje bajo ninguna circunstancia
5. **NO agregar contenido** que no estaba en el original
6. **Preservar emojis, links y formato** exactamente como están
7. **Respetar argentinismos** y expresiones coloquiales del perfil
8. Si el mensaje ya está bien escrito, devolverlo **SIN cambios**

IMPORTANTE: Devolvé SOLAMENTE el texto corregido. Sin explicaciones, sin comillas, sin prefijos. Solo el texto.`;
}

export async function optimizeText(text: string): Promise<{ optimized: string }> {
    const personality = getPersonality();
    const systemPrompt = buildSystemPrompt(personality);

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new Error('GROQ_API_KEY no está configurada');
    }

    const groq = new Groq({ apiKey });

    const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: text },
        ],
        temperature: 0.3,
        max_tokens: 2048,
    });

    const optimized = completion.choices[0]?.message?.content?.trim() || text;

    return { optimized };
}

export function readPersonality(): string {
    return getPersonality();
}

export function writePersonality(content: string): void {
    updatePersonality(content);
}
