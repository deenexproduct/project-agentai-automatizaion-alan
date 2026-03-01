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

1. **Corregir ortografía y gramática de forma profesional**, manteniendo la fluidez natural.
2. **Analizar y mejorar vocabulario**: Si existen palabras que cambiándolas (sin sonar robótico) se pueden hacer sonar más profesional o con una amabilidad profesional acorde a ventas, **CÁMBIALAS** para lograr el éxito.
3. **MANTENER** la calidez original del mensaje, la personalidad del autor (amigable y profesional).
4. **NO usar signos de apertura** (ni ¡ ni ¿). USAR SÓLO los de cierre (! y ?). Esto lo hace más amigable.
5. **Reemplazar lunfardo/jerga** (como "copado", "che", "qué onda") por expresiones más universales, profesionales y cordiales.
6. **Preservar emojis, links y formato** exactamente como están.
7. Si el mensaje ya está bien escrito y cumple las reglas, devolverlo **SIN cambios**.

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

    let optimized = completion.choices[0]?.message?.content?.trim() || text;

    // Force strict compliance for Spanish opening marks removal (¡ and ¿)
    optimized = optimized.replace(/[¡¿]/g, '');

    return { optimized };
}

export function readPersonality(): string {
    return getPersonality();
}

export function writePersonality(content: string): void {
    updatePersonality(content);
}
