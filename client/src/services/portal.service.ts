// Servicio del portal público del partner: usa fetch directo, no la instancia
// de axios del cliente. Esa instancia adjunta el Bearer de sesión del CRM y,
// ante un 401, desloguea al usuario y lo manda al login. En el portal no hay
// sesión que desloguear y el partner no es un usuario del CRM.
//
// `API_BASE` (definido en config.ts a partir de VITE_API_URL) es el origen
// pelado, sin `/api`: así lo usan también axios.ts y PublicReport.tsx. Un
// `BASE` armado directo con `VITE_API_URL` sin el `/api` pega 404 siempre,
// tanto en local como en producción (Dockerfile fija VITE_API_URL al origen
// de Railway sin `/api`).
import { API_BASE } from '../config';

const BASE = `${API_BASE}/api`;

export interface ManoPublica {
    partnerNombre: string;
    comentario?: string;
    levantadaEn: string;
    estado: string;
}
export interface SituacionMarca {
    /** `buscando` = todavía se busca llegada; `en_pipeline` = ya es una empresa del CRM. */
    tipo: 'buscando' | 'en_pipeline';
    /** Texto listo para mostrar: "Buscando llegada" o la etapa real ("Coordinando"). */
    etiqueta: string;
    /** Días sin movimiento del deal. Es lo que le dice al partner si hace falta empujar. */
    diasQuieto?: number;
}

export interface MarcaPublica {
    _id: string;
    nombre: string;
    porQue?: string;
    categoria?: string;
    situacion?: SituacionMarca;
    /** El partner ya dijo que no llega a esta. */
    noLlego?: boolean;
    /** La mano de ESTE partner, si se ofreció. La resuelve el servidor por id:
     *  deducirla acá comparando nombres se rompe con dos partners homónimos. */
    miMano?: ManoPublica | null;
    /** Cuántos OTROS partners se ofrecieron. Solo el número: son competidores
     *  entre sí, y el nombre y el comentario del rival no son asunto suyo. */
    otrasManos: number;
}
export interface TableroPublico {
    partner: {
        nombre: string;
        /** Comisión pactada, en %. Sólo viaja si hay una acordada. */
        comision?: number;
    };
    marcas: MarcaPublica[];
}

/**
 * Extrae el mensaje de error real que manda el servidor (`{ error: string }`,
 * ver partner-portal.routes.ts) para no perderlo detrás de un texto fijo. El
 * body de una respuesta fallida no siempre es JSON válido (puede ser un 502
 * de un proxy, por ejemplo), así que el parseo va en su propio try/catch: si
 * falla, caemos al `fallback`.
 */
async function mensajeDeError(res: Response, fallback: string): Promise<string> {
    try {
        const data = await res.json();
        if (data && typeof data.error === 'string' && data.error.trim()) return data.error;
    } catch {
        // Body no-JSON: nos quedamos con el fallback.
    }
    return fallback;
}

export async function getTablero(token: string): Promise<TableroPublico> {
    const res = await fetch(`${BASE}/portal/${token}`);
    if (!res.ok) throw new Error(await mensajeDeError(res, 'No encontrado'));
    return res.json();
}

export async function levantarMano(token: string, marcaId: string, comentario: string) {
    const res = await fetch(`${BASE}/portal/${token}/marcas/${marcaId}/mano`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comentario }),
    });
    if (!res.ok) throw new Error(await mensajeDeError(res, 'No se pudo registrar'));
    return res.json();
}

/** El partner propone una marca suya. Si ya la teníamos, queda como mano levantada. */
export async function proponerMarca(token: string, nombre: string, porQue: string): Promise<void> {
    const res = await fetch(`${BASE}/portal/${token}/marcas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, porQue }),
    });
    if (!res.ok) throw new Error(await mensajeDeError(res, 'No se pudo proponer la marca'));
}

/** El partner avisa que no tiene llegada. Se puede revertir ofreciéndose después. */
export async function marcarSinLlegada(token: string, marcaId: string): Promise<void> {
    const res = await fetch(`${BASE}/portal/${token}/marcas/${marcaId}/no-llego`, { method: 'POST' });
    if (!res.ok) throw new Error(await mensajeDeError(res, 'No se pudo registrar'));
}
