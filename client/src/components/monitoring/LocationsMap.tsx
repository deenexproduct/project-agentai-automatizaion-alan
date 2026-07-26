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
} from "../../services/deenex-monitoring.service";

// Paleta curada de 16 colores categóricos visualmente distintos (índice = posición de la marca por count desc).
const PALETTE = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2",
  "#db2777", "#65a30d", "#ea580c", "#4f46e5", "#0d9488", "#c026d3",
  "#ca8a04", "#e11d48", "#059669", "#9333ea",
];
const FALLBACK_COLOR = "#94a3b8";

interface BrandInfo {
  idMarca: string;
  marca: string;
  count: number;
  color: string;
}

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
        if (alive) setLocations(data);
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

  // Marcas ordenadas por count desc → color estable por marca.
  const brands = useMemo<BrandInfo[]>(() => {
    const byId = new Map<string, BrandInfo>();
    for (const l of locations) {
      const cur = byId.get(l.idMarca);
      if (cur) cur.count++;
      else
        byId.set(l.idMarca, {
          idMarca: l.idMarca,
          marca: l.marca,
          count: 1,
          color: FALLBACK_COLOR,
        });
    }
    const list = Array.from(byId.values()).sort((a, b) => b.count - a.count);
    list.forEach((b, i) => {
      b.color = b.marca === "—" ? FALLBACK_COLOR : PALETTE[i % PALETTE.length];
    });
    return list;
  }, [locations]);

  const colorByBrand = useMemo(() => {
    const m = new Map<string, string>();
    brands.forEach((b) => m.set(b.idMarca, b.color));
    return m;
  }, [brands]);

  const visible = useMemo(
    () =>
      locations.filter(
        (l) => (l.activo || showInactive) && !hiddenBrands.has(l.idMarca),
      ),
    [locations, showInactive, hiddenBrands],
  );

  const points = useMemo<[number, number][]>(
    () => visible.map((l) => [l.lat, l.lng]),
    [visible],
  );

  const totalActivos = useMemo(
    () => locations.filter((l) => l.activo).length,
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
        {visible.map((l) => (
          <CircleMarker
            key={l.id}
            center={[l.lat, l.lng]}
            radius={7}
            pathOptions={
              l.activo
                ? {
                    color: colorByBrand.get(l.idMarca) || FALLBACK_COLOR,
                    fillColor: colorByBrand.get(l.idMarca) || FALLBACK_COLOR,
                    fillOpacity: 0.85,
                    weight: 1,
                  }
                : {
                    color: colorByBrand.get(l.idMarca) || FALLBACK_COLOR,
                    fillOpacity: 0,
                    weight: 2,
                    dashArray: "3",
                  }
            }
          >
            <Tooltip>{l.nombre}</Tooltip>
            <Popup>
              <div className="text-[13px] leading-snug">
                <div className="font-semibold">{l.nombre}</div>
                <div className="text-slate-500">{l.direccion}</div>
                <div className="mt-1">
                  Marca: <b>{l.marca}</b>
                </div>
                <div>
                  Estado:{" "}
                  <b className={l.activo ? "text-emerald-600" : "text-slate-400"}>
                    {l.activo ? "Activo" : "Inactivo"}
                  </b>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* Leyenda-filtro por marca */}
      <div className="absolute top-3 right-3 z-[1000] w-56 max-h-[70%] overflow-y-auto bg-white/95 backdrop-blur rounded-xl border border-slate-200 shadow-lg p-3 text-[13px]">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-slate-700">
            Marcas · {visible.length}/{showInactive ? locations.length : totalActivos}
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
              <span className="flex-1 truncate text-slate-600">{b.marca}</span>
              <span className="text-slate-400">{b.count}</span>
            </button>
          );
        })}
        <label className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Mostrar inactivos
        </label>
      </div>
    </div>
  );
}
