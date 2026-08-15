# Tablero de partners: marcas que quiero alcanzar

**Fecha:** 2026-08-03 · **Estado:** diseño para revisión

## 1. El problema

Alan quiere trabajar con sus partners comerciales sobre marcas a las que le gustaría llegar y no tiene cómo. Hoy no existe ninguna superficie compartida: los partners son fichas en el CRM (nombre, email, comisión) sin acceso a nada.

El pedido original mezclaba cuatro cosas —marcas que trabaja, marcas en contacto caliente, marcas que le gustarían, y marcas donde ve match sin llegada—. Al conversarlo quedó claro que **sólo la última genera acción del partner**. Las otras tres son contexto, y mostrarlas tiene un costo (§7).

**Lo que el tablero resuelve:** que un partner mire una lista y diga *"a esa marca llego yo"*.

## 2. Qué se midió antes de diseñar

| Dato | Valor | Consecuencia |
|---|---|---|
| Partners cargados | **3** (dos con 10% de comisión) | No se justifica construir cuentas, roles ni reservas con vencimiento |
| Empresas con partner asignado | **1 de 96** | El vínculo existe en el modelo y no se usa; este flujo es el que lo va a llenar |
| Empresas sin contacto ni actividad | 14 | **No sirven** como proxy de "no tengo llegada": 3 están en *ganado* y 4 en *seguimiento*. La lista hay que armarla explícitamente |

**Hipótesis descartada:** que el CRM ya supiera a qué marcas no se llega. No lo sabe. "Sin contacto cargado" significa que nadie cargó el contacto, no que no haya llegada.

## 3. Decisiones tomadas

| # | Decisión | Por qué |
|---|---|---|
| 1 | El tablero es **pedir llegada**, no mostrar estado | Es lo único que genera acción del partner |
| 2 | **Marcas concretas**, no perfiles de marca | Es lo que Alan ya tiene en la cabeza y se carga en segundos. Los perfiles ("cadenas de café de 20+ locales") se evaluarán si la v1 funciona |
| 3 | Las marcas viven en una **entidad liviana propia**, y **ascienden** al CRM cuando se abre la puerta | Ver §4 |
| 4 | Levantar la mano es **una señal**, no una reserva | Con 3 partners la coordinación real es por WhatsApp; el sistema sólo tiene que evitar trabajo duplicado mostrando quién ya levantó |
| 5 | Acceso por **link secreto por partner**, sin login | Fricción cero para una herramienta que se abre una vez por semana |
| 6 | v1: los partners **no cargan marcas propias** | Recorte deliberado. Se evalúa después de ver si el flujo básico se usa |
| 7 | v1: los partners **no ven nada** del pipeline real | Ver §7 |

## 4. Por qué las marcas NO son empresas del CRM

Crear una empresa en este CRM **auto-crea un deal en la primera etapa**. Cargar 40 marcas deseadas metería 40 oportunidades falsas en el pipeline y volvería a distorsionar las conversiones y la proyección — exactamente el problema que se acaba de resolver borrando las 81 fichas de una importación con IA.

Por eso las marcas buscadas nacen en su propia colección, liviana, invisible para las métricas. **Ascienden a empresa del CRM solo cuando un partner abre la puerta y Alan acepta**: ahí dejan de ser un deseo y pasan a ser una oportunidad real, con su deal y su partner asignado.

## 5. Modelo de datos

### `marcas_buscadas` (colección nueva)

| campo | tipo | notas |
|---|---|---|
| `nombre` | String required trim | "Havanna" |
| `nombreNormalizado` | String index | derivado, para dedup — mismo criterio que Company |
| `porQue` | String | *"180 locales, delivery tercerizado"*. Es lo que hace que el partner entienda de qué va |
| `categoria` | String | agrupación libre |
| `estado` | enum `buscando` · `con_manos` · `ascendida` · `archivada` | default `buscando`. **Derivado, no manual:** pasa a `con_manos` sola cuando entra la primera mano `ofrecida`, y vuelve a `buscando` si todas quedan `descartada`. `ascendida` la setea el flujo de §8. `archivada` es la única que Alan cambia a mano |
| `manos` | array de `Mano` | ver abajo |
| `companyId` | ObjectId ref Company, default null | se llena **al ascender**; es el puente al CRM |
| `userId` | ObjectId required index | dueño |

Índice único `{ userId, nombreNormalizado }` — sin esto se repiten las marcas, que es exactamente lo que pasó con las empresas ("tres Zamp en producción").

### `Mano` (subdocumento embebido)

| campo | notas |
|---|---|
| `partnerId` | ref Partner |
| `partnerNombre` | denormalizado, para mostrar sin populate |
| `comentario` | *"mi cuñado es gerente de expansión"* |
| `levantadaEn` | Date required |
| `estado` | enum `ofrecida` · `aceptada` · `descartada` |

**`levantadaEn` no se borra nunca**, ni cuando la mano se descarta. Es la única prueba disponible el día que haya una discusión por una comisión. Descartar cambia el `estado`, no elimina el registro.

Se embebe (y no es colección aparte) porque está acotado por la cantidad de partners: no puede crecer sin límite.

### `Partner` (modelo existente, se le agrega)

| campo | notas |
|---|---|
| `accessToken` | String, único, índice. Generado con `crypto.randomBytes(24).toString('hex')` |
| `accessTokenActivo` | Boolean default true — para revocar un link sin borrar el partner |
| `ultimoAccesoEn` | Date — para saber si lo están usando |

## 6. Las dos vistas

### Lado Alan (dentro del CRM, con su login)

- Alta rápida: **nombre + por qué**, nada más obligatorio.
- Lista de marcas con la cantidad de manos levantadas y quiénes.
- Por cada mano: aceptar (dispara el ascenso, §8) o descartar.
- Copiar el link de cada partner.

### Lado partner (`/partners/:token`, sin login)

- Ve la lista de marcas buscadas: nombre, por qué, categoría.
- Ve **quién más levantó la mano** en cada marca. Esto es lo que evita trabajo duplicado, y reemplaza a la reserva.
- Levanta la suya con un comentario.
- No ve nada más: ni empresas, ni deals, ni contactos, ni métricas.

## 7. Lo que el partner NO ve, y por qué

Dos de los tres partners cobran 10% de comisión. Mostrarles las marcas que Alan está trabajando en caliente crea un incentivo para acercarse por su cuenta a una operación ya avanzada.

**Decisión: en la v1 el partner ve únicamente la lista de marcas buscadas.** No es una limitación técnica, es una decisión de negocio, y queda escrita para que si algún día se abre sea a conciencia.

## 8. El ascenso

Cuando Alan acepta una mano:

1. Se crea la **empresa en el CRM** por la API existente (`POST /api/crm/companies`), heredando su dedup y validaciones. Si ya existe con ese nombre, devuelve 409 y la UI ofrece vincular en vez de crear.
2. Esa alta **auto-crea el deal** en la primera etapa del pipeline, que es el comportamiento normal del CRM.
3. Se setea `Company.partner` con el partner de la mano aceptada.
4. La marca queda `estado: 'ascendida'` con su `companyId`, y **no se borra**: es el historial de dónde salió esa oportunidad.
5. Las otras manos de esa marca pasan a `descartada`, conservando su `levantadaEn`.

## 9. Rutas

**Router público** (`partner-portal.routes.ts`), montado **antes de cualquier authMiddleware**:

- `GET /api/portal/:token` → `{ partner: {nombre}, marcas: [...] }`
- `POST /api/portal/:token/marcas/:id/mano` → `{ comentario }`

**El token define el alcance.** Del `Partner` se saca su `userId`, y se devuelven **sólo las marcas de ese dueño** y en estado `buscando` o `con_manos`. Un token nunca puede leer ni escribir marcas de otro usuario, ni ver las archivadas o ya ascendidas. El `:id` de la marca se valida contra ese mismo `userId` antes de aceptar la mano — si no, el token de un partner podría levantar la mano en la marca de cualquier otro conociendo su ObjectId.

**Router privado** (`marcas-buscadas.routes.ts`), bajo el auth normal:

- `GET|POST /api/marcas-buscadas`
- `PATCH|DELETE /api/marcas-buscadas/:id`
- `POST /api/marcas-buscadas/:id/manos/:manoId/aceptar` → dispara el ascenso
- `POST /api/marcas-buscadas/:id/manos/:manoId/descartar`

🔴 **El error a no repetir:** este repo ya tiene una ruta declarada como *"public, no auth required"* (`GET /api/ops/reports/public/:token`, ops.routes.ts:1885) que está **debajo** de `router.use(authMiddleware)` en la línea 28. Verificado contra producción: devuelve **401**. La función de compartir el reporte semanal con un cliente **nunca funcionó**, y el token da la falsa sensación de que sí.

## 10. Manejo de errores

| Caso | Comportamiento |
|---|---|
| Token inexistente o revocado | 404 genérico. **No** distinguir "no existe" de "revocado": no hay que confirmarle a nadie que un token fue válido |
| Marca duplicada al cargarla | 409 con el nombre de la existente |
| Partner levanta la mano dos veces en la misma marca | Actualiza su comentario, no crea una segunda mano |
| Aceptar una mano cuya empresa ya existe en el CRM | 409 desde la API de empresas; la UI ofrece vincular a la existente |
| Aceptar una mano en una marca ya ascendida | 409 "esta marca ya fue ascendida" |

## 11. Testing

- **Ruta pública sin credenciales**: un test que haga `GET /api/portal/:token` **sin ningún header de auth** y espere 200. Es el test que hoy no existe y por eso el reporte semanal está roto.
- **Aislamiento**: con el token del partner A no se puede levantar la mano en nombre de B, ni ver marcas de otro `userId`.
- **Ascenso**: aceptar una mano crea empresa + deal + setea `Company.partner`, y aplicarlo dos veces no duplica.
- **Trazabilidad**: descartar una mano conserva `levantadaEn`.
- **Dedup**: cargar dos veces la misma marca devuelve 409.

## 12. Orden de construcción

1. Modelo `marcas_buscadas` + `accessToken` en Partner.
2. Router privado + pantalla de Alan (cargar y listar). **Acá ya sirve aunque nadie más entre.**
3. Router público + pantalla del partner. **Acá empieza a tener sentido compartirlo.**
4. Flujo de ascenso.

## 13. Fuera de alcance

- Perfiles de marca ("cadenas de café de 20+ locales").
- Reservas con vencimiento o exclusividad.
- Cuentas y roles para partners.
- Que los partners carguen marcas propias.
- Notificaciones automáticas (mail o WhatsApp) al levantar una mano.
- Cálculo o liquidación de comisiones.
