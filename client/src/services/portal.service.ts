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
export interface MarcaPublica {
    _id: string;
    nombre: string;
    porQue?: string;
    categoria?: string;
    manos: ManoPublica[];
}
export interface TableroPublico {
    partner: { nombre: string };
    marcas: MarcaPublica[];
}

export async function getTablero(token: string): Promise<TableroPublico> {
    const res = await fetch(`${BASE}/portal/${token}`);
    if (!res.ok) throw new Error('No encontrado');
    return res.json();
}

export async function levantarMano(token: string, marcaId: string, comentario: string) {
    const res = await fetch(`${BASE}/portal/${token}/marcas/${marcaId}/mano`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comentario }),
    });
    if (!res.ok) throw new Error('No se pudo registrar');
    return res.json();
}
