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
import {
  getDeenexLocations,
  type LocationDTO,
  type BrandRef,
} from "../../services/deenex-monitoring.service";

// Un local se considera ACTIVO si superó este umbral de pedidos (venta real, all-time).
const UMBRAL_PEDIDOS_ACTIVO = 20;

// Paleta curada de 16 colores categóricos visualmente distintos (índice = posición de la marca por count desc).
const PALETTE = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2",
  "#db2777", "#65a30d", "#ea580c", "#4f46e5", "#0d9488", "#c026d3",
  "#ca8a04", "#e11d48", "#059669", "#9333ea",
];
const GRIS = "#94a3b8";

interface BrandInfo {
  idMarca: string;
  marca: string;
  count: number; // locales ACTIVOS (>20 pedidos)
  color: string;
}

const esActivo = (l: LocationDTO) => l.pedidos > UMBRAL_PEDIDOS_ACTIVO;

const fmtMoney = (n: number) =>
  `$${Math.round(n).toLocaleString("es-AR")}`;

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [points, map]);
  return null;
}

export default function LocationsMap() {
  const [locations, setLocations] = useState<LocationDTO[]>([]);
  const [allBrands, setAllBrands] = useState<BrandRef[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hiddenBrands, setHiddenBrands] = useState<Set<string>>(new Set());
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setIsLoading(true);
        const data = await getDeenexLocations();
        if (!alive) return;
        setLocations(data.locations || []);
        setAllBrands(data.brands || []);
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

  // Todas las marcas en la leyenda: las que tienen locales activos con color; las que no, en gris con 0.
  const brands = useMemo<BrandInfo[]>(() => {
    const activosPorMarca = new Map<string, number>();
    for (const l of locations) {
      if (!esActivo(l)) continue;
      activosPorMarca.set(l.idMarca, (activosPorMarca.get(l.idMarca) || 0) + 1);
    }

    // Base: todas las marcas del backend + cualquier idMarca presente en locales (defensivo).
    const byId = new Map<string, string>();
    allBrands.forEach((b) => byId.set(b.idMarca, b.marca));
    locations.forEach((l) => {
      if (!byId.has(l.idMarca)) byId.set(l.idMarca, l.marca);
    });

    const list: BrandInfo[] = Array.from(byId.entries()).map(([idMarca, marca]) => ({
      idMarca,
      marca,
      count: activosPorMarca.get(idMarca) || 0,
      color: GRIS,
    }));

    // Orden: primero las que tienen locales activos (desc), después las de 0 (alfabético).
    list.sort((a, b) => b.count - a.count || a.marca.localeCompare(b.marca));

    // Color solo para las que tienen locales activos; las de 0 quedan en gris.
    let i = 0;
    for (const b of list) {
      if (b.count > 0 && b.marca !== "—") b.color = PALETTE[i++ % PALETTE.length];
    }
    return list;
  }, [locations, allBrands]);

  const colorByBrand = useMemo(() => {
    const m = new Map<string, string>();
    brands.forEach((b) => m.set(b.idMarca, b.color));
    return m;
  }, [brands]);

  const visible = useMemo(
    () =>
      locations.filter(
        (l) => (esActivo(l) || showInactive) && !hiddenBrands.has(l.idMarca),
      ),
    [locations, showInactive, hiddenBrands],
  );

  const points = useMemo<[number, number][]>(
    () => visible.map((l) => [l.lat, l.lng]),
    [visible],
  );

  const totalActivos = useMemo(
    () => locations.filter(esActivo).length,
    [locations],
  );

  if (isLoading)
    return <div className="p-8 text-slate-500">Cargando mapa…</div>;
  if (error) return <div className="p-8 text-red-500">{error}</div>;

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
        {visible.map((l) => {
          const activo = esActivo(l);
          const color = colorByBrand.get(l.idMarca) || GRIS;
          return (
            <CircleMarker
              key={l.id}
              center={[l.lat, l.lng]}
              radius={activo ? 7 : 5}
              pathOptions={
                activo
                  ? { color, fillColor: color, fillOpacity: 0.85, weight: 1 }
                  : { color: GRIS, fillOpacity: 0, weight: 2, dashArray: "3" }
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
                        activo
                          ? "text-emerald-600 font-semibold"
                          : "text-slate-400 font-semibold"
                      }
                    >
                      {activo
                        ? "Local activo"
                        : `Sin actividad (≤${UMBRAL_PEDIDOS_ACTIVO} pedidos)`}
                    </span>
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {/* Leyenda-filtro por marca */}
      <div className="absolute top-3 right-3 z-[1000] w-60 max-h-[70%] overflow-y-auto bg-white/95 backdrop-blur rounded-xl border border-slate-200 shadow-lg p-3 text-[13px]">
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-slate-700">Marcas</span>
          <div className="flex gap-2 text-[11px]">
            <button
              className="text-indigo-600 hover:underline"
              onClick={() => setHiddenBrands(new Set())}
            >
              Todas
            </button>
            <button
              className="text-slate-400 hover:underline"
              onClick={() =>
                setHiddenBrands(new Set(brands.map((b) => b.idMarca)))
              }
            >
              Ninguna
            </button>
          </div>
        </div>
        <div className="text-[11px] text-slate-400 mb-2">
          {totalActivos} locales activos (&gt;{UMBRAL_PEDIDOS_ACTIVO} pedidos)
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

        <label className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Mostrar locales sin actividad
        </label>
      </div>
    </div>
  );
}
