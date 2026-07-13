// Cliente del microservicio de estadísticas `deenex-data` (el MISMO que alimenta los admins de cada marca).
// El dashboard interno de Ops consume estas métricas canónicas en vez de reimplementarlas → una sola fuente
// de verdad. Config por entorno:
//   DEENEX_DATA_URL  base del microservicio (default: prod en Railway)
//   DEENEX_DATA_KEY  clave x-stats-key (o STATS_API_KEY). Debe setearse en el entorno de Ops.
import { format as formatDate } from 'date-fns';

const BASE_URL = (process.env.DEENEX_DATA_URL
  || 'https://deenex-data-produccion-or-palta-app.up.railway.app').replace(/\/+$/, '');
const API_KEY = process.env.DEENEX_DATA_KEY || process.env.STATS_API_KEY || '';

/** brandIds del front → scope de marca del microservicio: [] → 'all' (portfolio); ['a','b'] → 'a,b'. */
export function marcaScope(brandIds?: string[]): string {
  const ids = (brandIds || []).map((s) => String(s).trim()).filter(Boolean);
  return ids.length ? ids.join(',') : 'all';
}

const ymd = (d: Date) => formatDate(d, 'yyyy-MM-dd');

export interface PanelOpsWindow {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
}

/**
 * GET /stats/:scope/panel-ops → las 24 métricas de la pestaña "Métricas App" para la ventana dada.
 * Devuelve el objeto `datos` (mismo shape que MetricsResult.metrics).
 */
export async function fetchPanelOps(scope: string, w: PanelOpsWindow): Promise<any> {
  const qs = new URLSearchParams({
    from: ymd(w.start),
    to: ymd(w.end),
    prevFrom: ymd(w.prevStart),
    prevTo: ymd(w.prevEnd),
  }).toString();
  const url = `${BASE_URL}/stats/${encodeURIComponent(scope)}/panel-ops?${qs}`;

  let res: Response;
  try {
    res = await fetch(url, { headers: API_KEY ? { 'x-stats-key': API_KEY } : {} });
  } catch (e: any) {
    throw new Error(`No se pudo contactar deenex-data (${BASE_URL}): ${e?.message || e}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`deenex-data panel-ops HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const json: any = await res.json();
  if (!json?.exito) throw new Error(`deenex-data panel-ops: ${json?.error || 'respuesta sin éxito'}`);
  return json.datos;
}
