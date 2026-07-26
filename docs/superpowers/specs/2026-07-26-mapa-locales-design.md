# Spec: Pestaña "Mapa de Locales" — Dashboard de Ops

**Fecha:** 2026-07-26
**Repo:** `deenexproduct/project-agentai-automatizaion-alan`
**Rama:** `feat/mapa-locales`

## Objetivo

Nueva pestaña en el dashboard interno de Ops (`/ops/locations`) con un mapa que muestra
todos los locales en producción que cuentan con el sistema Deenex, coloreados por marca,
para visualizar de un vistazo la cobertura geográfica del producto.

## Contexto de datos (verificado contra prod, 2026-07-26)

- Colección `locales` (DB secundaria `DEENEX_MONGODB_URI` = Palta prod, read-only): **140 locales, 131 activos** (`statusLocal:true`).
- **Los 140 tienen coordenadas válidas** en `geoLocation: { latitude, longitude }`.
- Distribuidos en **15 marcas** (`idMarca`, String). La marca dominante (Palta) tiene ~75 locales.
- Join local→marca: `locales.idMarca` (String) == `String(brands._id)` (ObjectId). Verificado (`67bd1fe3d54edccd0f634f9f` → "Palta").
- **GOTCHA:** `idMarca` es String pero los modelos Mongoose lo declaran ObjectId → toda query a estas colecciones va por `.collection` (driver crudo), nunca por el modelo.

## Decisiones de producto (aprobadas)

| Tema | Decisión |
|---|---|
| Representación | Color por marca (15 colores) + leyenda con conteo por marca |
| Interacción | Click en pin → popup (nombre, dirección, marca, estado); hover → tooltip (nombre) |
| Filtro | Leyenda clickeable: toggle mostrar/ocultar cada marca + botón "Todas / Ninguna" |
| Motor de mapa | Leaflet + OpenStreetMap (gratis, sin API key ni cuenta externa) |
| Inactivos | Default muestra solo los 131 activos; toggle "mostrar inactivos" suma los 9, dibujados con círculo hueco/punteado para distinguirlos |
| Clustering | Ninguno en v1 (140 puntos los maneja Leaflet sin problema) |

## Arquitectura

Sigue el patrón existente de la tab "Métricas App":
`LocationsMap.tsx` (front) → `getDeenexLocations()` (service) → `GET /api/deenex-monitoring/locations` (back) → colección `locales` + `brands` (DB secundaria).

### 1. Backend — endpoint nuevo

**`GET /api/deenex-monitoring/locations`** en `server/src/routes/deenex-monitoring.routes.ts`
(mismo router: `authMiddleware` + `requireDeenexDB`). Sigue el patrón de `/locations/leaderboard` (línea ~653) pero más liviano (sin ventas).

Lógica:
1. `getDeenexBrandModel()` → `.collection` → traer todas las marcas, armar `Map<String(brand._id), brandName>` (`appName || domain`).
2. `getDeenexLocalModel()` → `.collection.find(...)` → todos los locales con `geoLocation.latitude` y `longitude` no nulos/0.
3. Mapear a la respuesta y devolver el array.

Respuesta (array, ~140 items):
```ts
{
  id: string;          // String(local._id)
  nombre: string;      // nameLocal
  direccion: string;   // addressLocal
  idMarca: string;     // para colorear/filtrar en el front
  marca: string;       // nombre resuelto (appName||domain) o "—" si no matchea
  activo: boolean;     // statusLocal
  lat: number;         // geoLocation.latitude
  lng: number;         // geoLocation.longitude
}
```
- Descarta locales sin coords válidas (defensivo).
- El **color NO viaja del backend**: el front asigna color por `idMarca` con una paleta determinística (separación de responsabilidades; el back solo da datos).
- Errores: try/catch → 500 `{ error: 'Internal server error' }`, log `[DEENEX-MONITOR] Locations error:` (igual que el resto del router).

### 2. Frontend — service

`getDeenexLocations()` en `client/src/services/deenex-monitoring.service.ts`:
```ts
export const getDeenexLocations = async () => {
  const { data } = await api.get('/deenex-monitoring/locations');
  return data;
};
```

### 3. Frontend — componente `LocationsMap.tsx`

`client/src/components/monitoring/LocationsMap.tsx`. Usa **react-leaflet**.

Estado:
- `locations: Location[]`, `isLoading`, `error`.
- `hiddenBrands: Set<string>` (idMarca ocultas por el filtro de leyenda).
- `showInactive: boolean` (default `false`).

Derivados (memoizados):
- `brands`: lista única de `{ idMarca, marca, count, color }` a partir de `locations`, **ordenada por count desc** (para leyenda estable y determinística). El `color` sale de una **paleta curada de 16 colores categóricos visualmente distintos** (definida como constante en el componente, ej. base tipo d3 `schemeCategory10` + 6 colores extra bien separados en hue), indexada por la posición en esta lista ordenada → color estable por marca entre renders. Si algún día hay >16 marcas, la paleta cicla (aceptable). La marca sin match usa gris de fallback fuera de la paleta.
- `visible`: locales filtrados por `!hiddenBrands.has(idMarca)` y (`activo || showInactive`).

Render:
- `<MapContainer>` con `<TileLayer>` de OSM (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`, con `attribution`).
- Un `<CircleMarker>` por local en `visible`:
  - Activo: relleno del color de su marca.
  - Inactivo (cuando `showInactive`): círculo **hueco** (relleno transparente, borde punteado/dashArray) del color de la marca.
  - `<Tooltip>` (hover) con el nombre.
  - `<Popup>` (click) con nombre, dirección, marca, estado (badge activo/inactivo).
- **`FitBounds`**: subcomponente que hace `map.fitBounds(bounds)` con los puntos visibles al cargar (auto-zoom para ver todos). Recentra cuando cambia el set visible.
- **Leyenda-filtro** (panel sobre el mapa, esquina): por cada marca un item con swatch de color + `nombre · count`, clickeable para toggle en `hiddenBrands` (item atenuado cuando está oculto). Header con "Todas / Ninguna". Abajo, checkbox "Mostrar inactivos".
- Estados: loading (spinner), error (mensaje + retry), vacío (mensaje).

Estilo acorde al resto del dashboard (Tailwind, mismos tokens que `MetricsDashboard`).

### 4. Dependencias nuevas (client)

`react-leaflet`, `leaflet`, y `@types/leaflet` (dev). Importar `leaflet/dist/leaflet.css` en el componente o en el entrypoint. (Se usan `CircleMarker`, no los pin-icons default, así que **no** hace falta el workaround del marker-icon roto de webpack/vite.)

### 5. Registro de la pestaña — `client/src/components/ops/OpsApp.tsx`

- Agregar `"locations"` al union `OpsTab`.
- Importar `MapPin` de `lucide-react` y `LocationsMap`.
- Agregar al array de tabs: `{ id: "locations", Icon: MapPin, label: "Mapa de Locales" }` (posición: después de "metrics").
- Agregar al title map: `locations: "Mapa de Locales"`.
- Agregar el render: `{activeTab === "locations" && <LocationsMap />}`.
- Ruta resultante: `/ops/locations` (ya cubierta por el `useParams`/routing existente).

## Casos borde

- Local sin coords válidas → excluido en el backend (no rompe el mapa).
- `idMarca` sin match en `brands` → `marca: "—"`, color de fallback (gris), agrupado como "Sin marca".
- Todas las marcas ocultas → mapa vacío con mensaje "Ninguna marca seleccionada"; el fit-bounds no corre.
- Marca con muchos locales en el mismo punto (CABA) → pueden solaparse; aceptable en v1 (clustering queda para v2 si molesta).

## Testing / verificación

- **Backend:** pegar a `/api/deenex-monitoring/locations` con token → confirmar ~140 items, cada uno con `lat/lng` numéricos, `marca` resuelta y `activo` boolean; contar `activo:true` == 131.
- **Frontend:** cargar `/ops/locations` → verificar: mapa renderiza puntos coloreados por marca, la leyenda lista 15 marcas con conteos, toggles de leyenda ocultan/muestran, "mostrar inactivos" suma 9 huecos, popup muestra info correcta, fit-bounds encuadra todo.
- **No-regresión:** las demás tabs siguen andando (no tocamos su código).

## Deploy

- **Bcakend** (endpoint) + **Deenex Comercial** (frontend), ambos **desde `main`** (deenex-data/Bcakend/Comercial se deployan por `railway up` manual y quien deploya último gana → siempre desde main para no pisar trabajo ajeno).
- No toca `deenex-data` (el microservicio de métricas): el mapa lee la DB secundaria directo desde Bcakend, igual que la tab Monitoreo y el selector de marcas.

## Fuera de alcance (v2, si se pide)

- Clustering/spiderfy en zonas densas.
- Buscador por nombre + panel lista lateral (directorio).
- Métricas por local en el popup (ventas, pedidos) — reusar `/locations/leaderboard`.
- Export / compartir el mapa para pitch externo.
