# Mapa de Locales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una pestaña "Mapa de Locales" (`/ops/locations`) al dashboard de Ops con un mapa Leaflet que muestra los locales de producción coloreados por marca.

**Architecture:** Un endpoint nuevo de solo-lectura en el server (Bcakend) lee la colección `locales` de la DB secundaria (Palta prod) y resuelve el nombre de marca; el front consume ese endpoint y lo pinta con react-leaflet (CircleMarkers color-por-marca, popup por local, leyenda-filtro, toggle de inactivos). Sigue el patrón de la tab existente "Métricas App".

**Tech Stack:** Express + TypeScript + Mongoose (server); React + Vite + TypeScript + Tailwind (client); **react-leaflet + leaflet** (nuevo); OpenStreetMap tiles.

## Global Constraints

- **DB secundaria read-only:** `locales`/`brands` viven en `DEENEX_MONGODB_URI` (Palta prod). SOLO lectura. Modelos: `getDeenexLocalModel()` → `locales`, `getDeenexBrandModel()` → `brands` (`server/src/models/deenex-models/index.ts`, `strict:false`).
- **GOTCHA idMarca:** `locales.idMarca` es String; matchea `String(brands._id)`. NO filtrar por idMarca vía el modelo Mongoose (castea a ObjectId y no matchea). El endpoint del mapa lee TODOS los locales (sin filtro por marca), así que `Local.find({}).lean()` es seguro.
- **Auth:** el router `deenex-monitoring` ya aplica `authMiddleware` + `requireDeenexDB` a todas sus rutas (`router.use(...)` al tope del archivo). No agregar auth por ruta.
- **Sin framework de tests en el repo:** el cliente solo tiene `tsc -b && vite build` + `eslint`. La verificación es: typecheck (`npx tsc -b`), probe contra prod para el backend, y carga visual en `/ops/locations`. NO instalar vitest/jest.
- **Errores del router:** patrón `try/catch → console.error('[DEENEX-MONITOR] <X> error:', error.message) → res.status(500).json({ error: 'Internal server error' })`.
- **Deploy:** Bcakend + Deenex Comercial (proyecto Railway "CRM"), ambos con `railway up` **desde `main`** (quien deploya último gana → siempre main). No toca el microservicio `deenex-data`.
- **Package manager cliente:** npm (`client/package-lock.json`).
- **Datos verificados (2026-07-26):** 140 locales, 131 activos, los 140 con `geoLocation.{latitude,longitude}` válidas, 15 marcas.

---

## File Structure

- **Modify** `server/src/routes/deenex-monitoring.routes.ts` — agregar `GET /locations` (cerca de `/locations/leaderboard`, ~línea 653).
- **Modify** `client/package.json` — agregar deps `react-leaflet`, `leaflet`, `@types/leaflet`.
- **Modify** `client/src/services/deenex-monitoring.service.ts` — agregar `getDeenexLocations()`.
- **Create** `client/src/components/monitoring/LocationsMap.tsx` — el componente de la pestaña.
- **Modify** `client/src/components/ops/OpsApp.tsx` — registrar la tab (`OpsTab`, `opsGroup`, `TAB_TITLES`, import, render).

---

## Task 1: Backend — endpoint `GET /deenex-monitoring/locations`

**Files:**
- Modify: `server/src/routes/deenex-monitoring.routes.ts` (agregar handler antes del bloque `/locations/leaderboard`, ~línea 652)
- Verify: `/tmp/locations_probe.mjs` (script temporal de verificación contra prod)

**Interfaces:**
- Produces: `GET /api/deenex-monitoring/locations` → `Array<{ id: string; nombre: string; direccion: string; idMarca: string; marca: string; activo: boolean; lat: number; lng: number }>`

- [ ] **Step 1: Escribir el probe de verificación (replica la lógica del endpoint contra prod)**

Crear `/tmp/locations_probe.mjs`:

```js
// Replica la query del endpoint /locations contra la MISMA DB prod y valida el shape/conteos.
import { connectDb, getDb, closeDb } from '/Users/alannaimtapia/dev/deenex-data/src/db.js';
await connectDb(); const db = getDb();
const [brands, locals] = await Promise.all([
  db.collection('brands').find().project({ appName: 1, domain: 1 }).toArray(),
  db.collection('locales').find().project({ nameLocal: 1, addressLocal: 1, statusLocal: 1, idMarca: 1, geoLocation: 1 }).toArray(),
]);
const brandName = new Map(brands.map((b) => [String(b._id), b.appName || b.domain || '—']));
const out = locals
  .map((l) => ({ l, lat: Number(l.geoLocation?.latitude), lng: Number(l.geoLocation?.longitude) }))
  .filter(({ lat, lng }) => Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0)
  .map(({ l, lat, lng }) => ({
    id: String(l._id), nombre: l.nameLocal || 'Sin nombre', direccion: l.addressLocal || '',
    idMarca: String(l.idMarca ?? ''), marca: brandName.get(String(l.idMarca ?? '')) || '—',
    activo: l.statusLocal === true, lat, lng,
  }));
const activos = out.filter((x) => x.activo).length;
const sinMarca = out.filter((x) => x.marca === '—').length;
console.log(`total=${out.length} activos=${activos} sinMarca=${sinMarca}`);
console.log('sample:', JSON.stringify(out[0]));
if (out.length < 130 || activos < 125) throw new Error('conteos inesperados');
if (!out.every((x) => typeof x.lat === 'number' && typeof x.lng === 'number')) throw new Error('coords no numéricas');
console.log('OK ✓');
await closeDb();
```

- [ ] **Step 2: Correr el probe y ver que FALLA/aprueba la lógica esperada**

Run: `cd ~/dev/deenex-data && railway run -s deenex-data node /tmp/locations_probe.mjs`
Expected: imprime `total=140 activos=131 sinMarca=<n>` + `OK ✓`. (Esto valida la lógica del endpoint ANTES de escribirla en TS.)

- [ ] **Step 3: Agregar el handler `GET /locations` en el router**

En `server/src/routes/deenex-monitoring.routes.ts`, insertar ANTES del comentario `// GET /locations/leaderboard` (~línea 652):

```ts
// ══════════════════════════════════════════════════════════════
// GET /locations — Locales con coordenadas para el mapa
// ══════════════════════════════════════════════════════════════
router.get('/locations', async (_req: Request, res: Response) => {
    try {
        const Brand = getDeenexBrandModel();
        const Local = getDeenexLocalModel();

        const [brands, locals] = await Promise.all([
            Brand.find().select('appName domain').lean(),
            Local.find().select('nameLocal addressLocal statusLocal idMarca geoLocation').lean(),
        ]);

        const brandName = new Map<string, string>(
            brands.map((b: any) => [String(b._id), b.appName || b.domain || '—'])
        );

        const locations = locals
            .map((l: any) => {
                const geo = l.geoLocation || {};
                return { l, lat: Number(geo.latitude), lng: Number(geo.longitude) };
            })
            .filter(({ lat, lng }) => Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0)
            .map(({ l, lat, lng }) => ({
                id: String(l._id),
                nombre: l.nameLocal || 'Sin nombre',
                direccion: l.addressLocal || '',
                idMarca: String(l.idMarca ?? ''),
                marca: brandName.get(String(l.idMarca ?? '')) || '—',
                activo: l.statusLocal === true,
                lat,
                lng,
            }));

        return res.json(locations);
    } catch (error: any) {
        console.error('[DEENEX-MONITOR] Locations error:', error.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
```

(`getDeenexBrandModel` y `getDeenexLocalModel` ya están importados en este archivo — usados por `/brands` y `/locations/leaderboard`. Verificar que estén en el import del tope; si falta alguno, agregarlo.)

- [ ] **Step 4: Transpile-check del archivo (el repo no tiene tsc del server instalado localmente)**

Run: `cd ~/dev/project-agentai-automatizaion-alan && ~/dev/palta-app-admin-frontend/node_modules/.bin/esbuild server/src/routes/deenex-monitoring.routes.ts --outfile=/tmp/routes.js`
Expected: compila sin error (imprime el tamaño del output). Confirma que la sintaxis TS es válida.

- [ ] **Step 5: Commit**

```bash
cd ~/dev/project-agentai-automatizaion-alan
git add server/src/routes/deenex-monitoring.routes.ts
git commit -m "feat(ops-locations): endpoint GET /deenex-monitoring/locations (locales + marca para el mapa)"
```

---

## Task 2: Frontend — dependencia leaflet + service `getDeenexLocations`

**Files:**
- Modify: `client/package.json` (deps)
- Modify: `client/src/services/deenex-monitoring.service.ts` (agregar función)

**Interfaces:**
- Consumes: `GET /deenex-monitoring/locations` (Task 1)
- Produces: `getDeenexLocations(): Promise<LocationDTO[]>` donde `LocationDTO = { id: string; nombre: string; direccion: string; idMarca: string; marca: string; activo: boolean; lat: number; lng: number }`

- [ ] **Step 1: Instalar las dependencias de mapa**

Run: `cd ~/dev/project-agentai-automatizaion-alan/client && npm install react-leaflet leaflet && npm install -D @types/leaflet`
Expected: se agregan a `package.json` y `package-lock.json` sin errores de peer-deps que rompan el build.

- [ ] **Step 2: Agregar `getDeenexLocations` al service**

En `client/src/services/deenex-monitoring.service.ts`, agregar (después de `getDeenexBrands`, ~línea 35):

```ts
export interface LocationDTO {
    id: string;
    nombre: string;
    direccion: string;
    idMarca: string;
    marca: string;
    activo: boolean;
    lat: number;
    lng: number;
}

export const getDeenexLocations = async (): Promise<LocationDTO[]> => {
    const { data } = await api.get('/deenex-monitoring/locations');
    return data;
};
```

- [ ] **Step 3: Typecheck**

Run: `cd ~/dev/project-agentai-automatizaion-alan/client && npx tsc -b`
Expected: sin errores de tipos.

- [ ] **Step 4: Commit**

```bash
cd ~/dev/project-agentai-automatizaion-alan
git add client/package.json client/package-lock.json client/src/services/deenex-monitoring.service.ts
git commit -m "feat(ops-locations): dep leaflet + service getDeenexLocations"
```

---

## Task 3: Frontend — componente `LocationsMap` (mapa + markers + popup + auto-zoom)

**Files:**
- Create: `client/src/components/monitoring/LocationsMap.tsx`

**Interfaces:**
- Consumes: `getDeenexLocations`, `LocationDTO` (Task 2)
- Produces: `export default function LocationsMap()` — componente React sin props.

Esta task deja el mapa funcionando mostrando SOLO los locales activos, coloreados por marca, con popup y auto-zoom. El filtro/leyenda/inactivos se agregan en Task 4.

- [ ] **Step 1: Crear el componente con mapa base, markers por marca, popup y fit-bounds**

Crear `client/src/components/monitoring/LocationsMap.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getDeenexLocations, type LocationDTO } from "../../services/deenex-monitoring.service";

// Paleta curada de 16 colores categóricos visualmente distintos (índice = posición de la marca por count desc).
const PALETTE = [
  "#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2",
  "#db2777", "#65a30d", "#ea580c", "#4f46e5", "#0d9488", "#c026d3",
  "#ca8a04", "#e11d48", "#059669", "#9333ea",
];
const FALLBACK_COLOR = "#94a3b8";

interface BrandInfo { idMarca: string; marca: string; count: number; color: string; }

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
    return () => { alive = false; };
  }, []);

  // Marcas ordenadas por count desc → color estable por marca.
  const brands = useMemo<BrandInfo[]>(() => {
    const byId = new Map<string, BrandInfo>();
    for (const l of locations) {
      const cur = byId.get(l.idMarca);
      if (cur) cur.count++;
      else byId.set(l.idMarca, { idMarca: l.idMarca, marca: l.marca, count: 1, color: FALLBACK_COLOR });
    }
    const list = Array.from(byId.values()).sort((a, b) => b.count - a.count);
    list.forEach((b, i) => { b.color = b.marca === "—" ? FALLBACK_COLOR : PALETTE[i % PALETTE.length]; });
    return list;
  }, [locations]);

  const colorByBrand = useMemo(() => {
    const m = new Map<string, string>();
    brands.forEach((b) => m.set(b.idMarca, b.color));
    return m;
  }, [brands]);

  // Task 3: solo activos. (El toggle de inactivos llega en Task 4.)
  const visible = useMemo(() => locations.filter((l) => l.activo), [locations]);
  const points = useMemo<[number, number][]>(() => visible.map((l) => [l.lat, l.lng]), [visible]);

  if (isLoading) return <div className="p-8 text-slate-500">Cargando mapa…</div>;
  if (error) return <div className="p-8 text-red-500">{error}</div>;

  return (
    <div className="relative h-[calc(100vh-160px)] w-full rounded-xl overflow-hidden border border-slate-200">
      <MapContainer center={[-38.4, -63.6]} zoom={4} className="h-full w-full" scrollWheelZoom>
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
            pathOptions={{
              color: colorByBrand.get(l.idMarca) || FALLBACK_COLOR,
              fillColor: colorByBrand.get(l.idMarca) || FALLBACK_COLOR,
              fillOpacity: 0.85,
              weight: 1,
            }}
          >
            <Tooltip>{l.nombre}</Tooltip>
            <Popup>
              <div className="text-[13px] leading-snug">
                <div className="font-semibold">{l.nombre}</div>
                <div className="text-slate-500">{l.direccion}</div>
                <div className="mt-1">Marca: <b>{l.marca}</b></div>
                <div>Estado: {l.activo ? "Activo" : "Inactivo"}</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd ~/dev/project-agentai-automatizaion-alan/client && npx tsc -b`
Expected: sin errores de tipos.

- [ ] **Step 3: Commit**

```bash
cd ~/dev/project-agentai-automatizaion-alan
git add client/src/components/monitoring/LocationsMap.tsx
git commit -m "feat(ops-locations): componente LocationsMap (mapa + markers por marca + popup + auto-zoom)"
```

---

## Task 4: Frontend — leyenda-filtro + toggle de inactivos

**Files:**
- Modify: `client/src/components/monitoring/LocationsMap.tsx`

**Interfaces:**
- Consumes: `brands`, `colorByBrand`, `locations` (Task 3, mismo archivo)
- Produces: filtro por marca (`hiddenBrands`) + toggle `showInactive`, ambos afectan `visible`.

- [ ] **Step 1: Agregar estado de filtro y actualizar `visible`**

En `LocationsMap.tsx`, después de `const [error, setError] = useState<string | null>(null);`, agregar:

```tsx
  const [hiddenBrands, setHiddenBrands] = useState<Set<string>>(new Set());
  const [showInactive, setShowInactive] = useState(false);
```

Reemplazar la línea `const visible = useMemo(() => locations.filter((l) => l.activo), [locations]);` por:

```tsx
  const visible = useMemo(
    () => locations.filter((l) => (l.activo || showInactive) && !hiddenBrands.has(l.idMarca)),
    [locations, showInactive, hiddenBrands]
  );
```

- [ ] **Step 2: Diferenciar los markers inactivos (círculo hueco)**

Reemplazar el bloque `pathOptions={{ ... }}` del `CircleMarker` por:

```tsx
            pathOptions={
              l.activo
                ? { color: colorByBrand.get(l.idMarca) || FALLBACK_COLOR, fillColor: colorByBrand.get(l.idMarca) || FALLBACK_COLOR, fillOpacity: 0.85, weight: 1 }
                : { color: colorByBrand.get(l.idMarca) || FALLBACK_COLOR, fillOpacity: 0, weight: 2, dashArray: "3" }
            }
```

Y en el `<Popup>`, la línea de estado, envolver el texto para que se note:

```tsx
                <div>Estado: <b className={l.activo ? "text-emerald-600" : "text-slate-400"}>{l.activo ? "Activo" : "Inactivo"}</b></div>
```

- [ ] **Step 3: Agregar el panel de leyenda-filtro sobre el mapa**

Dentro del `<div className="relative ...">`, DESPUÉS del `</MapContainer>` de cierre, agregar el panel (el `z-[1000]` lo pone sobre los tiles de Leaflet):

```tsx
        <div className="absolute top-3 right-3 z-[1000] w-56 max-h-[70%] overflow-y-auto bg-white/95 backdrop-blur rounded-xl border border-slate-200 shadow-lg p-3 text-[13px]">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-slate-700">Marcas</span>
            <div className="flex gap-2 text-[11px]">
              <button className="text-indigo-600 hover:underline" onClick={() => setHiddenBrands(new Set())}>Todas</button>
              <button className="text-slate-400 hover:underline" onClick={() => setHiddenBrands(new Set(brands.map((b) => b.idMarca)))}>Ninguna</button>
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
                    next.has(b.idMarca) ? next.delete(b.idMarca) : next.add(b.idMarca);
                    return next;
                  })
                }
                className={`flex items-center gap-2 w-full py-1 text-left hover:bg-slate-50 rounded px-1 ${hidden ? "opacity-40" : ""}`}
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                <span className="flex-1 truncate text-slate-600">{b.marca}</span>
                <span className="text-slate-400">{b.count}</span>
              </button>
            );
          })}
          <label className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 text-slate-600 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Mostrar inactivos
          </label>
        </div>
```

- [ ] **Step 4: Typecheck**

Run: `cd ~/dev/project-agentai-automatizaion-alan/client && npx tsc -b`
Expected: sin errores de tipos.

- [ ] **Step 5: Commit**

```bash
cd ~/dev/project-agentai-automatizaion-alan
git add client/src/components/monitoring/LocationsMap.tsx
git commit -m "feat(ops-locations): leyenda-filtro por marca + toggle de inactivos"
```

---

## Task 5: Frontend — registrar la pestaña en `OpsApp.tsx`

**Files:**
- Modify: `client/src/components/ops/OpsApp.tsx`

**Interfaces:**
- Consumes: `LocationsMap` (Task 3/4)

- [ ] **Step 1: Importar el ícono y el componente**

En `client/src/components/ops/OpsApp.tsx`:
- Agregar `MapPin,` a la lista de imports de `lucide-react` (líneas 3-18).
- Agregar debajo de `import MetricsDashboard from "../monitoring/MetricsDashboard";` (línea 29):

```tsx
import LocationsMap from "../monitoring/LocationsMap";
```

- [ ] **Step 2: Agregar `"locations"` al union `OpsTab`**

En el `type OpsTab` (líneas 34-46), agregar tras `| "metrics"`:

```tsx
  | "locations"
```

- [ ] **Step 3: Agregar la entrada al sidebar y el título**

En `opsGroup` (líneas 55-70), agregar tras el objeto `metrics` (después de la línea 63):

```tsx
  { id: "locations", Icon: MapPin, label: "Mapa de Locales" },
```

En `TAB_TITLES` (líneas 77-90), agregar tras `metrics: "Métricas de la App",`:

```tsx
  locations: "Mapa de Locales",
```

- [ ] **Step 4: Agregar el render**

En el bloque de render (líneas 210-227), agregar tras `{activeTab === "metrics" && <MetricsDashboard />}` (línea 225):

```tsx
          {activeTab === "locations" && <LocationsMap />}
```

- [ ] **Step 5: Typecheck (TAB_TITLES es `Record<OpsTab, string>` → el compilador exige la key nueva)**

Run: `cd ~/dev/project-agentai-automatizaion-alan/client && npx tsc -b`
Expected: sin errores (si falta la key en `TAB_TITLES`, tsc falla — confirma que la tab quedó completa).

- [ ] **Step 6: Commit**

```bash
cd ~/dev/project-agentai-automatizaion-alan
git add client/src/components/ops/OpsApp.tsx
git commit -m "feat(ops-locations): registrar la pestaña 'Mapa de Locales' en OpsApp"
```

---

## Task 6: Deploy + verificación en vivo

**Files:** (ninguno — deploy)

- [ ] **Step 1: Mergear la rama a main (una vez que las Tasks 1-5 estén aprobadas)**

```bash
cd ~/dev/project-agentai-automatizaion-alan
git checkout main && git merge --ff-only origin/main
git merge feat/mapa-locales --no-edit
git push origin main
```
Expected: merge limpio, main actualizado. (Si main divergió, resolver como merge normal.)

- [ ] **Step 2: Deploy Bcakend (endpoint) desde main**

Run: `cd ~/dev/project-agentai-automatizaion-alan && railway up --service "Bcakend" --detach`
Expected: build SUCCESS. (El `.railwayignore` ya excluye `server/wa-sessions`.)

- [ ] **Step 3: Deploy Deenex Comercial (frontend) desde main**

Run: `railway up --service "Deenex Comercial" --detach`
Expected: build SUCCESS (`tsc -b && vite build` compila).

- [ ] **Step 4: Verificar el endpoint en vivo**

Con la sesión iniciada en el dashboard, abrir DevTools → Network en `/ops/locations` y confirmar que `GET /api/deenex-monitoring/locations` responde **200** con ~140 items, cada uno con `lat`/`lng` numéricos, `marca` resuelta y `activo` boolean. (Alternativa sin browser: `curl` con un token de sesión válido.)

- [ ] **Step 5: Verificación visual**

En `/ops/locations`: el mapa carga y auto-zoomea a Argentina mostrando los 131 puntos activos coloreados por marca; la leyenda lista las 15 marcas con su conteo; clickear una marca la oculta/muestra; "Mostrar inactivos" suma 9 puntos huecos; click en un pin abre el popup con nombre/dirección/marca/estado correctos.

- [ ] **Step 6: Commit de cierre (si hubo ajustes)** — si no hubo cambios extra, este paso se omite.

---

## Notas de implementación

- **react-leaflet v4** requiere React 18. Si el build falla por peer-deps, fijar `react-leaflet@^4` explícito.
- El contenedor del mapa necesita altura explícita (ya resuelto con `h-[calc(100vh-160px)]`); si el layout de Ops usa otra altura de header, ajustar el `160px`.
- Los tiles de OSM se cargan desde `tile.openstreetmap.org` (request externo desde el browser del usuario) — OK para herramienta interna; no aplica el CSP de Artifacts.
