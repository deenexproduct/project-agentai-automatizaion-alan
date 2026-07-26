import { useEffect, useMemo, useState } from "react";
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
  ["Café Martínez", "Cafeses de Especialidad", "Coquitos", "Glorias", "Havanna", "Pandanés"].map(
    normMarca,
  ),
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

/** Capa de mapa de calor (leaflet.heat). Se monta/desmonta según el filtro activo. */
function HeatLayer({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const layer = (L as any)
      .heatLayer(
        points.map(([lat, lng]) => [lat, lng, 1]),
        { radius: 24, blur: 18, maxZoom: 14, minOpacity: 0.3, gradient: HEAT_GRADIENT },
      )
      .addTo(map);
    return () => {
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

  // ── Mapas de calor (se cargan on-demand la primera vez que se activan) ──
  const [heatDelivery, setHeatDelivery] = useState(false);
  const [heatPoints, setHeatPoints] = useState<HeatPoint[] | null>(null);
  const [heatMaxCelda, setHeatMaxCelda] = useState(0);
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
        setHeatMaxCelda(data.maxCelda || 0);
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

  // Puntos del mapa de calor de delivery, respetando el filtro de marcas de la leyenda.
  const heatVisiblePoints = useMemo<[number, number][]>(() => {
    if (!heatDelivery || !heatPoints) return [];
    return heatPoints
      .filter((p) => !hiddenBrands.has(p.idMarca))
      .map((p) => [p.lat, p.lng] as [number, number]);
  }, [heatDelivery, heatPoints, hiddenBrands]);

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
        {heatDelivery && heatVisiblePoints.length > 0 && (
          <HeatLayer points={heatVisiblePoints} />
        )}
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

          <label className="flex items-center gap-2 text-slate-600 cursor-pointer py-0.5">
            <input
              type="checkbox"
              checked={heatDelivery}
              onChange={(e) => setHeatDelivery(e.target.checked)}
            />
            <span className="flex-1">Delivery</span>
            {heatDelivery && heatLoading && (
              <span className="text-[10px] text-slate-400">cargando…</span>
            )}
            {heatDelivery && !heatLoading && heatPoints && (
              <span className="text-[10px] text-slate-400">
                {heatVisiblePoints.length}
              </span>
            )}
          </label>

          {heatDelivery && !heatLoading && heatPoints && heatPoints.length > 0 && (
            <div className="mt-1.5">
              <div
                className="h-2 rounded-full border border-slate-200"
                style={{ background: HEAT_CSS_GRADIENT }}
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                <span>menos entregas</span>
                <span>más</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-1 leading-snug">
                Zona más caliente: <b className="text-slate-500">{heatMaxCelda}</b>{" "}
                entregas en ~1 km². Total {heatVisiblePoints.length} entregas
                (histórico, pedidos pagados).
              </div>
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
