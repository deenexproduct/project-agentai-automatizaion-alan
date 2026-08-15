import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/**
 * El único lugar del server que le habla a wa-send.
 *
 * wa-send es un servicio APARTE (no vive en este repo): Baileys detrás de un
 * HTTP mínimo, escuchando en `127.0.0.1:3131`. El "127.0.0.1" no es un detalle
 * de configuración, es una decisión del servicio (`const HOST = "127.0.0.1"`):
 * solo se lo puede llamar desde la misma máquina donde corre. Esto NO funciona
 * desde el contenedor de producción, y por eso el digest se dispara a mano
 * desde la máquina que tiene la sesión de WhatsApp vinculada.
 *
 * Se usa `POST /send` y NO el camino interno `reply.responder()`: ese parte el
 * texto en 3 mensajes de 600 caracteres, le pega "corté acá, era muy largo" y
 * **devuelve ok:true igual**. Un digest cortado que informa éxito es peor que
 * un error. `/send` manda el texto tal cual, sin partir.
 */

const URL_BASE = () => process.env.WA_SEND_URL || 'http://127.0.0.1:3131';

/** Cuánto esperamos a wa-send antes de cortar. Sin esto, un cuelgue no vuelve. */
const TIMEOUT_MS = 20_000;

export interface ResultadoEnvio {
    id: string | null;
    /** El JID al que WhatsApp entregó de verdad. Puede diferir del pedido. */
    chatJid: string;
}

export interface Grupo {
    jid: string;
    subject: string;
}

/**
 * El token lo genera wa-send solo y lo deja en `~/.wa-send/token` con permisos
 * 0600. Se lee en cada llamada y no al importar: si el archivo aparece después
 * de arrancar el proceso, igual funciona.
 */
function token(): string {
    if (process.env.WA_SEND_TOKEN) return process.env.WA_SEND_TOKEN;
    const ruta = join(homedir(), '.wa-send', 'token');
    try {
        return readFileSync(ruta, 'utf8').trim();
    } catch {
        throw new Error(
            `No encontré el token de wa-send. Poné WA_SEND_TOKEN o asegurate de que exista ${ruta}.`,
        );
    }
}

async function pedir(ruta: string, init: RequestInit = {}): Promise<any> {
    const ctrl = new AbortController();
    const reloj = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
        res = await fetch(`${URL_BASE()}${ruta}`, {
            ...init,
            signal: ctrl.signal,
            headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
        });
    } catch (e: any) {
        if (e?.name === 'AbortError') {
            throw new Error(`wa-send no contestó en ${TIMEOUT_MS / 1000}s (${URL_BASE()}).`);
        }
        // ECONNREFUSED es el caso más común y el mensaje crudo no dice qué hacer.
        throw new Error(
            `No pude hablar con wa-send en ${URL_BASE()}: ${e?.message || e}. ` +
            `¿Está corriendo? Se levanta con \`node server.mjs\` en ~/dev/wa-send.`,
        );
    } finally {
        clearTimeout(reloj);
    }

    const cuerpo = await res.json().catch(() => ({}));
    // Los dos, siempre: wa-send devuelve `{ok:false}` con status de error, pero
    // mirar solo uno de los dos deja pasar la mitad de las fallas.
    if (!res.ok || cuerpo?.ok === false) {
        throw new Error(`wa-send ${res.status}: ${cuerpo?.error || 'sin detalle'}`);
    }
    return cuerpo;
}

/**
 * Manda un mensaje. `destino` puede ser un JID ya armado (`...@g.us`,
 * `...@s.whatsapp.net`, `...@lid`) o un número internacional suelto
 * (`5491133334444`), que wa-send normaliza.
 *
 * Preferimos un grupo: los `@g.us` no pasan por el chequeo `onWhatsApp`, así
 * que no hay forma de comerse un 422 por un número mal escrito.
 */
export async function enviarPorWhatsApp(destino: string, texto: string): Promise<ResultadoEnvio> {
    if (!destino?.trim()) throw new Error('Falta el destino del mensaje.');
    if (!texto?.trim()) throw new Error('No mando un mensaje vacío.');

    const r = await pedir('/send', {
        method: 'POST',
        body: JSON.stringify({ to: destino.trim(), text: texto }),
    });
    return { id: r.id ?? null, chatJid: r.chatJid || destino };
}

/** Los grupos donde está la sesión, para elegir destino sin hardcodear un JID. */
export async function listarGrupos(q?: string): Promise<Grupo[]> {
    const r = await pedir(`/groups${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    return (r.groups || []).map((g: any) => ({ jid: g.jid, subject: g.subject }));
}

/** Estado de la sesión. No pide token: sirve para chequear antes de armar nada. */
export async function estadoWhatsApp(): Promise<{ conectado: boolean; me?: string }> {
    try {
        const res = await fetch(`${URL_BASE()}/health`);
        const j: any = await res.json();
        return { conectado: !!j?.connected, me: j?.me };
    } catch {
        return { conectado: false };
    }
}
