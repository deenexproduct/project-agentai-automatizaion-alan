import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  Tooltip,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import {
  getDeenexLocations,
  getDeenexDeliveryHeatmap,
  type LocationDTO,
  type BrandRef,
  type HeatPoint,
} from "../../services/deenex-monitoring.service";

// Paleta curada de 16 colores categóricos visualmente distintos (índice = posición de la marca por total de locales desc → color estable por marca).
const PALETTE = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2",
  "#db2777", "#65a30d", "#ea580c", "#4f46e5", "#0d9488", "#c026d3",
  "#ca8a04", "#e11d48", "#059669", "#9333ea",
];
const GRIS = "#94a3b8";

// Marcas fantasma a OCULTAR del mapa hasta que se limpien de la DB de raíz (2026-07-26, pedido del usuario).
// No son clientes reales/activos. Se filtran por nombre normalizado (sin acentos, minúsculas).
const normMarca = (s: string) =>
  (s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const MARCAS_OCULTAS = new Set(
  [
    "Café Martínez",
    "Cafeses de Especialidad",
    "Coquitos",
    "Glorias",
    "Havanna",
    "Pandanés",
    "The Coffee Shop",
    "UTE",
    "—", // locales sin marca resuelta
  ].map(normMarca),
);
const marcaVisible = (marca: string) => !MARCAS_OCULTAS.has(normMarca(marca));

// Modos de filtro del mapa.
type FilterMode = "activos" | "todos" | "min";

interface BrandInfo {
  idMarca: string;
  marca: string;
  total: number; // total de locales de la marca (para color estable)
  count: number; // locales que pasan el filtro actual
  color: string;
}

const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [points, map]);
  return null;
}

// Escala de calor (frío → caliente). Se usa tanto en la capa como en la leyenda de rango.
const HEAT_GRADIENT: Record<number, string> = {
  0.0: "#3b82f6", // azul  — poca densidad
  0.4: "#22c55e", // verde
  0.65: "#facc15", // amarillo
  0.85: "#f97316", // naranja
  1.0: "#dc2626", // rojo  — mayor concentración
};

// Misma escala, en CSS, para la barra de rango de la leyenda.
const HEAT_CSS_GRADIENT = `linear-gradient(to right, ${Object.entries(HEAT_GRADIENT)
  .map(([stop, color]) => `${color} ${Number(stop) * 100}%`)
  .join(", ")})`;

// Config de la capa de calor. `max` NO se fija acá: se recalcula por vista (ver HeatLayer).
const HEAT_RADIUS = 25;
const HEAT_BLUR = 18;
const HEAT_MAXZOOM = 14;
// Piso de normalización: con menos entregas que esto en la celda pico, no se pinta "zona caliente"
// (evita que una entrega suelta se vea igual de roja que un foco real).
const HEAT_PICO_MINIMO = 3;

// Las 3 lecturas del mismo set de entregas. Cambian el PESO de cada punto (y en "lejanas", el filtro),
// no los datos: una sola llamada al backend alimenta las tres.
//   entregas    → dónde se pide más seguido
//   facturación → dónde está la plata (una zona puede pedir poco y facturar mucho)
//   lejanas     → entregas fuera del radio sano = dónde faltaría un local
type HeatMode = "off" | "entregas" | "facturacion" | "lejanas" | "ticket";

// ── Capa "ticket mediano por zona" ────────────────────────────────────────────────────────────────────────
// NO se dibuja como mapa de calor a propósito: leaflet.heat SUMA los pesos de los puntos que caen en
// la misma celda, y un promedio no se suma. Al alejarse, dos zonas vecinas de $40.000 se fusionarían
// en una de $80.000 — el mapa mostraría un valor inventado. Se dibuja como círculos por zona:
// color = ticket mediano, tamaño = cantidad de entregas (o sea, cuánta confianza tiene el número).
const TICKET_CELDA_GRADOS = 0.01; // ~1 km, mismo corte que usa el backend para la densidad
const TICKET_MIN_ENTREGAS = 3;    // con menos entregas el número es una anécdota, no una zona

/** Color del gradiente de calor para un valor normalizado [0,1] (interpola entre los stops). */
function colorDelGradiente(t: number): string {
  const stops = Object.entries(HEAT_GRADIENT)
    .map(([k, v]) => [Number(k), v] as [number, string])
    .sort((a, b) => a[0] - b[0]);
  const x = Math.max(0, Math.min(1, t));
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (x >= stops[i][0] && x <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
  }
  const span = hi[0] - lo[0];
  const r = span === 0 ? 0 : (x - lo[0]) / span;
  const mix = (a: string, b: string) => {
    const n = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [ar, ag, ab] = n(a), [br, bg, bb] = n(b);
    const c = (u: number, v: number) => Math.round(u + (v - u) * r).toString(16).padStart(2, "0");
    return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
  };
  return mix(lo[1], hi[1]);
}

/**
 * Capa de mapa de calor (leaflet.heat). Se monta/desmonta según el filtro activo.
 *
 * NORMALIZACIÓN POR VISTA: leaflet.heat usa `max` (default 1) como tope de intensidad y le aplica a
 * cada punto un factor de zoom `f = 1/2^(maxZoom-zoom)`. Con max=1 y peso 1 por entrega, cualquier
 * celda con una entrega ya satura → el mapa se pinta todo rojo y NO distingue densidad (verificado
 * visualmente con los datos reales). Solución: recalcular `max` con la celda más densa de lo que se
 * está viendo, así el gradiente siempre usa todo su rango y los focos se leen a cualquier zoom.
 * El pico se reporta al padre para que la leyenda diga la verdad.
 */
function HeatLayer({
  points,
  onPeak,
  picoMinimo = HEAT_PICO_MINIMO,
}: {
  /** [lat, lng, peso]. El peso es 1 para "entregas" y la facturación del pedido para "facturación". */
  points: [number, number, number][];
  onPeak?: (peak: number) => void;
  /** Piso de normalización, en unidades del peso (entregas o pesos $). */
  picoMinimo?: number;
}) {
  const map = useMap();
  const peakRef = useRef(onPeak);
  peakRef.current = onPeak;

  useEffect(() => {
    if (points.length === 0) return;
    const layer = (L as any)
      .heatLayer(
        points.map(([lat, lng, w]) => [lat, lng, w]),
        {
          radius: HEAT_RADIUS,
          blur: HEAT_BLUR,
          maxZoom: HEAT_MAXZOOM,
          minOpacity: 0.12,
          gradient: HEAT_GRADIENT,
        },
      )
      .addTo(map);

    const tune = () => {
      // getBounds() explota si el mapa todavía no tiene centro/zoom.
      if (!(map as any)._loaded) return;
      const z = map.getZoom();
      const f = 1 / Math.pow(2, Math.max(0, Math.min(HEAT_MAXZOOM - z, 12)));
      const g = (HEAT_RADIUS + HEAT_BLUR) / 2; // celda interna de leaflet.heat, en px
      const bounds = map.getBounds().pad(0.15);
      const celdas = new Map<string, number>();
      let peak = 0;
      for (const [lat, lng, w] of points) {
        if (!bounds.contains([lat, lng] as any)) continue;
        const p = map.project([lat, lng] as any, z);
        const k = `${Math.floor(p.x / g)}:${Math.floor(p.y / g)}`;
        // Se ACUMULA el peso, no se cuentan puntos: en la capa de facturación el pico es en $.
        const n = (celdas.get(k) || 0) + w;
        celdas.set(k, n);
        if (n > peak) peak = n;
      }
      const efectivo = Math.max(peak, picoMinimo);
      layer.setOptions({ max: Math.max(efectivo * f, 0.05) });
      peakRef.current?.(peak);
    };

    // Ojo: setView/fitBounds son animados → hay que tunear en los eventos, no sincrónicamente.
    map.on("zoomend", tune);
    map.on("moveend", tune);
    tune();

    return () => {
      map.off("zoomend", tune);
      map.off("moveend", tune);
      map.removeLayer(layer);
    };
  }, [points, map]);

  return null;
}

export default function LocationsMap() {
  const [locations, setLocations] = useState<LocationDTO[]>([]);
  const [allBrands, setAllBrands] = useState<BrandRef[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hiddenBrands, setHiddenBrands] = useState<Set<string>>(new Set());

  // Filtro: por default "activos" (statusLocal, aunque no tengan pedidos).
  const [filterMode, setFilterMode] = useState<FilterMode>("activos");
  const [minPedidos, setMinPedidos] = useState<number>(20);

  // ── Mapas de calor (una sola llamada alimenta las 3 capas; se carga on-demand) ──
  const [heatMode, setHeatMode] = useState<HeatMode>("off");
  const heatDelivery = heatMode !== "off";
  const [heatPoints, setHeatPoints] = useState<HeatPoint[] | null>(null);
  const [heatMeta, setHeatMeta] = useState<{ umbralLejano: number; totalLejanas: number } | null>(null);
  const [heatLoading, setHeatLoading] = useState(false);

  useEffect(() => {
    if (!heatDelivery || heatPoints !== null || heatLoading) return;
    let alive = true;
    (async () => {
      try {
        setHeatLoading(true);
        const data = await getDeenexDeliveryHeatmap();
        if (!alive) return;
        setHeatPoints(data.puntos || []);
        setHeatMeta({ umbralLejano: data.umbralLejano ?? 3, totalLejanas: data.totalLejanas ?? 0 });
      } catch (e) {
        console.error(e);
        if (alive) setHeatPoints([]);
      } finally {
        if (alive) setHeatLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [heatDelivery, heatPoints, heatLoading]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setIsLoading(true);
        const data = await getDeenexLocations();
        if (!alive) return;
        setLocations((data.locations || []).filter((l) => marcaVisible(l.marca)));
        setAllBrands((data.brands || []).filter((b) => marcaVisible(b.marca)));
      } catch (e) {
        console.error(e);
        if (alive) setError("No se pudieron cargar los locales.");
      } finally {
        if (alive) setIsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Predicado del modo activo. "activos" = statusLocal; "todos" = todos; "min" = pedidos >= N.
  const matches = (l: LocationDTO) =>
    filterMode === "activos"
      ? l.statusLocal
      : filterMode === "todos"
        ? true
        : l.pedidos >= minPedidos;

  // Marcas: color estable por total de locales (desc); count = locales que pasan el filtro actual.
  const brands = useMemo<BrandInfo[]>(() => {
    const total = new Map<string, number>();
    const shown = new Map<string, number>();
    const nameById = new Map<string, string>();
    allBrands.forEach((b) => nameById.set(b.idMarca, b.marca));
    for (const l of locations) {
      if (!nameById.has(l.idMarca)) nameById.set(l.idMarca, l.marca);
      total.set(l.idMarca, (total.get(l.idMarca) || 0) + 1);
      if (matches(l)) shown.set(l.idMarca, (shown.get(l.idMarca) || 0) + 1);
    }
    const list: BrandInfo[] = Array.from(nameById.entries()).map(([idMarca, marca]) => ({
      idMarca,
      marca,
      total: total.get(idMarca) || 0,
      count: shown.get(idMarca) || 0,
      color: GRIS,
    }));
    // Color estable: por total de locales desc; solo las que tienen locales reciben color.
    const byTotal = [...list].sort((a, b) => b.total - a.total || a.marca.localeCompare(b.marca));
    let i = 0;
    const colorById = new Map<string, string>();
    for (const b of byTotal) {
      const c = b.total > 0 && b.marca !== "—" ? PALETTE[i++ % PALETTE.length] : GRIS;
      colorById.set(b.idMarca, c);
    }
    list.forEach((b) => (b.color = colorById.get(b.idMarca) || GRIS));
    // Orden de la leyenda: por count del filtro actual (desc), luego alfabético.
    list.sort((a, b) => b.count - a.count || a.marca.localeCompare(b.marca));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locations, allBrands, filterMode, minPedidos]);

  const colorByBrand = useMemo(() => {
    const m = new Map<string, string>();
    brands.forEach((b) => m.set(b.idMarca, b.color));
    return m;
  }, [brands]);

  const visible = useMemo(
    () => locations.filter((l) => matches(l) && !hiddenBrands.has(l.idMarca)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locations, filterMode, minPedidos, hiddenBrands],
  );

  // idMarca que SÍ se muestran: las de la leyenda (ya sin las marcas fantasma de MARCAS_OCULTAS).
  // Los puntos de calor traen solo idMarca, así que este set es la forma de aplicarles la exclusión.
  const visibleBrandIds = useMemo(
    () => new Set(brands.map((b) => b.idMarca)),
    [brands],
  );

  // Entregas que entran al mapa de calor: filtro de leyenda + marcas ocultas, y en "lejanas" solo las
  // que superan el radio sano.
  const heatVisibleRaw = useMemo(() => {
    if (!heatDelivery || !heatPoints) return [];
    const umbral = heatMeta?.umbralLejano ?? 3;
    return heatPoints
      .filter((p) => visibleBrandIds.has(p.idMarca) && !hiddenBrands.has(p.idMarca))
      .filter((p) => (heatMode === "lejanas" ? p.dist != null && p.dist >= umbral : true));
  }, [heatDelivery, heatMode, heatPoints, heatMeta, hiddenBrands, visibleBrandIds]);

  // Zonas de ~1 km con su ticket MEDIANO. Solo se quedan las que tienen suficientes entregas: con 1 o
  // 2 pedidos el "típico" es el ticket de esos pedidos, no el de la zona.
  const zonasTicket = useMemo(() => {
    if (heatMode !== "ticket") return [];
    const celdas = new Map<string, { lat: number; lng: number; tickets: number[] }>();
    for (const p of heatVisibleRaw) {
      // Se excluyen las entregas sin monto: un 0 acá significa "no quedó registrado", no "gratis",
      // y metido en un promedio lo arrastra para abajo (15 de 509 pedidos están en 0).
      if (!(p.facturacion > 0)) continue;
      const k = `${Math.round(p.lat / TICKET_CELDA_GRADOS)}:${Math.round(p.lng / TICKET_CELDA_GRADOS)}`;
      const c = celdas.get(k) || { lat: 0, lng: 0, tickets: [] as number[] };
      // Centroide real de la celda (promedio de las entregas), no el centro de la grilla.
      c.lat += p.lat; c.lng += p.lng; c.tickets.push(p.facturacion);
      celdas.set(k, c);
    }
    return Array.from(celdas.values())
      .filter((c) => c.tickets.length >= TICKET_MIN_ENTREGAS)
      .map((c) => {
        const n = c.tickets.length;
        const orden = [...c.tickets].sort((a, b) => a - b);
        // MEDIANA, no promedio: con zonas de 3-5 entregas, un pedido atípico (hay uno de $3,3M) se
        // lleva el promedio puesto e inventa una "zona cara" que no existe. La mediana aguanta.
        const ticket = orden[Math.floor(n / 2)];
        return {
          lat: c.lat / n,
          lng: c.lng / n,
          entregas: n,
          ticket,
          facturacion: c.tickets.reduce((a, b) => a + b, 0),
        };
      })
      .sort((a, b) => b.ticket - a.ticket);
  }, [heatMode, heatVisibleRaw]);

  // Rango de tickets para colorear. Se usa el p90 como tope (no el máximo) para que una zona cara
  // aislada no deje al resto en el mismo color frío.
  const ticketRango = useMemo(() => {
    if (zonasTicket.length === 0) return { min: 0, max: 0 };
    const vals = zonasTicket.map((z) => z.ticket).sort((a, b) => a - b);
    return { min: vals[0], max: vals[Math.floor(vals.length * 0.9)] || vals[vals.length - 1] };
  }, [zonasTicket]);

  // Total REAL del modo, en sus unidades (entregas o $). Se calcula sobre los valores sin recortar:
  // es lo que se muestra en la leyenda y tiene que ser la suma de verdad.
  const heatTotal = useMemo(
    () =>
      heatMode === "facturacion"
        ? heatVisibleRaw.reduce((a, p) => a + Math.max(p.facturacion, 0), 0)
        : heatVisibleRaw.length,
    [heatMode, heatVisibleRaw],
  );

  // Pesos para el gradiente. En "facturación" se RECORTA cada peso al p99: hay un pedido de $3,3M que
  // solo él es el 10% de toda la facturación de delivery (el siguiente es 7 veces menor), y sin tope
  // ese único punto se lleva todo el rojo y deja el resto del mapa en frío. El recorte afecta SOLO
  // cómo se pinta; el total de la leyenda sigue siendo el real.
  const heatVisiblePoints = useMemo<[number, number, number][]>(() => {
    if (heatMode !== "facturacion") {
      return heatVisibleRaw.map((p) => [p.lat, p.lng, 1] as [number, number, number]);
    }
    const vals = heatVisibleRaw.map((p) => Math.max(p.facturacion, 0)).sort((a, b) => a - b);
    const tope = vals.length ? vals[Math.floor(vals.length * 0.99)] : 0;
    return heatVisibleRaw.map(
      (p) =>
        [p.lat, p.lng, Math.min(Math.max(p.facturacion, 0), tope || Infinity)] as [number, number, number],
    );
  }, [heatMode, heatVisibleRaw]);

  // El piso de normalización va en las MISMAS unidades que el peso: 3 entregas, o el equivalente en
  // plata (3 tickets promedio). Sin esto, en la capa de facturación el piso de "3 pesos" no filtra nada.
  const heatPicoMinimo = useMemo(() => {
    if (heatMode !== "facturacion") return HEAT_PICO_MINIMO;
    const n = heatVisiblePoints.length;
    return n > 0 ? (heatTotal / n) * HEAT_PICO_MINIMO : HEAT_PICO_MINIMO;
  }, [heatMode, heatVisiblePoints, heatTotal]);

  // Pico de la vista actual (entregas en la celda más densa de lo que se ve). Lo reporta HeatLayer,
  // que es quien normaliza el gradiente contra ese mismo valor → la leyenda describe exactamente la
  // escala que se está dibujando (y cambia al hacer zoom/pan o al filtrar marcas).
  const [picoEnVista, setPicoEnVista] = useState(0);

  const points = useMemo<[number, number][]>(
    () => visible.map((l) => [l.lat, l.lng]),
    [visible],
  );

  if (isLoading)
    return <div className="p-8 text-slate-500">Cargando mapa…</div>;
  if (error) return <div className="p-8 text-red-500">{error}</div>;

  const modoLabel =
    filterMode === "activos"
      ? "activos en la plataforma"
      : filterMode === "todos"
        ? "en total"
        : `con ${minPedidos}+ pedidos`;

  return (
    <div className="relative h-[calc(100vh-160px)] w-full rounded-xl overflow-hidden border border-slate-200">
      <MapContainer
        center={[-38.4, -63.6]}
        zoom={4}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds points={points} />
        {heatMode !== "ticket" && heatDelivery && heatVisiblePoints.length > 0 && (
          <HeatLayer points={heatVisiblePoints} onPeak={setPicoEnVista} picoMinimo={heatPicoMinimo} />
        )}

        {/* Ticket promedio: círculos por zona (ver nota en TICKET_CELDA_GRADOS: un promedio no se suma) */}
        {heatMode === "ticket" &&
          zonasTicket.map((z, i) => {
            const span = ticketRango.max - ticketRango.min;
            const t = span > 0 ? (z.ticket - ticketRango.min) / span : 0.5;
            const color = colorDelGradiente(t);
            // El radio comunica cuántas entregas respaldan el promedio (más chico = menos confiable).
            const radio = Math.min(9 + Math.sqrt(z.entregas) * 2.5, 26);
            return (
              <CircleMarker
                key={`zt-${i}`}
                center={[z.lat, z.lng]}
                radius={radio}
                pathOptions={{ color, fillColor: color, fillOpacity: 0.55, weight: 1.5 }}
              >
                <Tooltip>{`${fmtMoney(z.ticket)} · ${z.entregas} entregas`}</Tooltip>
                <Popup>
                  <div className="text-[13px] leading-snug min-w-[170px]">
                    <div className="font-semibold">Zona de ~1 km</div>
                    <div className="mt-1.5 space-y-0.5">
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Ticket mediano</span>
                        <b>{fmtMoney(z.ticket)}</b>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Entregas</span>
                        <b>{z.entregas}</b>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Facturación</span>
                        <b>{fmtMoney(z.facturacion)}</b>
                      </div>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        {visible.map((l) => {
          const color = colorByBrand.get(l.idMarca) || GRIS;
          return (
            <CircleMarker
              key={l.id}
              center={[l.lat, l.lng]}
              radius={l.statusLocal ? 7 : 5}
              pathOptions={
                l.statusLocal
                  ? { color, fillColor: color, fillOpacity: 0.85, weight: 1 }
                  : { color, fillOpacity: 0, weight: 2, dashArray: "3" }
              }
            >
              <Tooltip>{l.nombre}</Tooltip>
              <Popup>
                <div className="text-[13px] leading-snug min-w-[190px]">
                  <div className="font-semibold">{l.nombre}</div>
                  <div className="text-slate-500">{l.direccion}</div>
                  <div className="mt-1">
                    Marca: <b>{l.marca}</b>
                  </div>

                  <div className="mt-2 pt-2 border-t border-slate-200 space-y-0.5">
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Pedidos</span>
                      <b>{l.pedidos.toLocaleString("es-AR")}</b>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Facturación</span>
                      <b>{fmtMoney(l.facturacion)}</b>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-500">Delivery</span>
                      <b>{l.pedidosDelivery.toLocaleString("es-AR")}</b>
                    </div>
                  </div>

                  <div className="mt-2 text-[11px]">
                    <span
                      className={
                        l.statusLocal
                          ? "text-emerald-600 font-semibold"
                          : "text-slate-400 font-semibold"
                      }
                    >
                      {l.statusLocal ? "Activo en la plataforma" : "Inactivo"}
                    </span>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Panel de filtros + leyenda por marca */}
      <div className="absolute top-3 right-3 z-[1000] w-60 max-h-[80%] overflow-y-auto bg-white/95 backdrop-blur rounded-xl border border-slate-200 shadow-lg p-3 text-[13px]">
        {/* Mapas de calor */}
        <div className="mb-2 pb-2 border-b border-slate-100">
          <div className="font-semibold text-slate-700 mb-1">Mapas de calor</div>

          {/* Selector de capa: apagado + las 3 lecturas */}
          <div className="grid grid-cols-2 gap-1">
            {([
              { k: "off", label: "Ninguno" },
              { k: "entregas", label: "Entregas" },
              { k: "facturacion", label: "Facturación" },
              { k: "ticket", label: "Ticket" },
              { k: "lejanas", label: "Lejanas" },
            ] as { k: HeatMode; label: string }[]).map((m) => (
              <button
                key={m.k}
                onClick={() => setHeatMode(m.k)}
                className={`text-[11px] py-1 rounded-md border transition-colors ${
                  heatMode === m.k
                    ? "bg-slate-800 text-white border-slate-800 font-semibold"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {heatDelivery && heatLoading && (
            <div className="text-[10px] text-slate-400 mt-1.5">cargando entregas…</div>
          )}

          {/* Ticket promedio: leyenda propia — es una escala fija de $, no un gradiente por vista */}
          {heatMode === "ticket" && !heatLoading && heatPoints && (
            <div className="mt-1.5">
              {zonasTicket.length > 0 ? (
                <>
                  <div
                    className="h-2 rounded-full border border-slate-200"
                    style={{ background: HEAT_CSS_GRADIENT }}
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                    <span>{fmtMoney(ticketRango.min)}</span>
                    <span>{fmtMoney(ticketRango.max)}+</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 leading-snug">
                    Cada círculo es una zona de ~1 km: el color es el ticket mediano y el tamaño,
                    cuántas entregas lo respaldan. Solo zonas con {TICKET_MIN_ENTREGAS}+ entregas —{" "}
                    {zonasTicket.length} de {heatVisibleRaw.length} entregas agrupadas.
                  </div>
                </>
              ) : (
                <div className="text-[10px] text-slate-400 leading-snug">
                  Ninguna zona llega a {TICKET_MIN_ENTREGAS} entregas con los filtros actuales: no hay
                  promedio que mostrar.
                </div>
              )}
            </div>
          )}

          {heatMode !== "ticket" && heatDelivery && !heatLoading && heatPoints && heatVisiblePoints.length > 0 && (
            <div className="mt-1.5">
              <div
                className="h-2 rounded-full border border-slate-200"
                style={{ background: HEAT_CSS_GRADIENT }}
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                <span>menos</span>
                <span>
                  {picoEnVista > 0
                    ? heatMode === "facturacion"
                      ? fmtMoney(picoEnVista)
                      : `${Math.round(picoEnVista)} entregas`
                    : "más"}
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-1 leading-snug">
                {heatMode === "facturacion" ? (
                  <>
                    El rojo marca dónde se factura más, no dónde se pide más
                    seguido. Total {fmtMoney(heatTotal)} en{" "}
                    {heatVisiblePoints.length} entregas.
                  </>
                ) : heatMode === "lejanas" ? (
                  <>
                    Solo entregas a {heatMeta?.umbralLejano ?? 3}+ km del local:
                    donde se concentran, falta un local cerca.{" "}
                    {heatVisiblePoints.length} de {heatPoints.length} entregas.
                  </>
                ) : (
                  <>
                    El rojo marca la zona con más entregas de esta vista. Total{" "}
                    {heatVisiblePoints.length} entregas (histórico, pedidos
                    pagados).
                  </>
                )}
              </div>
            </div>
          )}

          {heatDelivery && !heatLoading && heatPoints && heatPoints.length > 0 && heatVisiblePoints.length === 0 && (
            <div className="text-[10px] text-slate-400 mt-1.5 leading-snug">
              {heatMode === "lejanas"
                ? `Ninguna entrega supera los ${heatMeta?.umbralLejano ?? 3} km con los filtros actuales.`
                : "Sin entregas con los filtros actuales."}
            </div>
          )}

          {heatDelivery && !heatLoading && heatPoints && heatPoints.length === 0 && (
            <div className="text-[10px] text-slate-400 mt-1">
              Sin datos de entrega con coordenadas.
            </div>
          )}
        </div>

        {/* Modo de filtro */}
        <div className="flex gap-1 mb-2 bg-slate-100 rounded-lg p-0.5">
          {([
            { k: "activos", label: "Activos" },
            { k: "todos", label: "Todos" },
            { k: "min", label: "Pedidos" },
          ] as { k: FilterMode; label: string }[]).map((m) => (
            <button
              key={m.k}
              onClick={() => setFilterMode(m.k)}
              className={`flex-1 text-[11px] py-1 rounded-md transition-colors ${
                filterMode === m.k
                  ? "bg-white shadow-sm text-slate-800 font-semibold"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {filterMode === "min" && (
          <div className="flex items-center gap-2 mb-2 text-[11px] text-slate-500">
            <span>Mínimo</span>
            <input
              type="number"
              min={0}
              value={minPedidos}
              onChange={(e) =>
                setMinPedidos(Math.max(0, Number(e.target.value) || 0))
              }
              className="w-16 border border-slate-200 rounded px-1.5 py-0.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-300"
            />
            <span>pedidos</span>
          </div>
        )}

        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-slate-400">
            {visible.length} locales {modoLabel}
          </span>
          <div className="flex gap-2 text-[11px]">
            <button
              className="text-indigo-600 hover:underline"
              onClick={() => setHiddenBrands(new Set())}
            >
              Todas
            </button>
            <button
              className="text-slate-400 hover:underline"
              onClick={() => setHiddenBrands(new Set(brands.map((b) => b.idMarca)))}
            >
              Ninguna
            </button>
          </div>
        </div>

        {brands.map((b) => {
          const hidden = hiddenBrands.has(b.idMarca);
          const sinLocales = b.count === 0;
          return (
            <button
              key={b.idMarca}
              onClick={() =>
                setHiddenBrands((prev) => {
                  const next = new Set(prev);
                  if (next.has(b.idMarca)) next.delete(b.idMarca);
                  else next.add(b.idMarca);
                  return next;
                })
              }
              className={`flex items-center gap-2 w-full py-1 text-left hover:bg-slate-50 rounded px-1 ${
                hidden ? "opacity-40" : ""
              }`}
            >
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: b.color }}
              />
              <span
                className={`flex-1 truncate ${sinLocales ? "text-slate-400" : "text-slate-600"}`}
              >
                {b.marca}
              </span>
              <span className={sinLocales ? "text-slate-300" : "text-slate-400"}>
                {b.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
