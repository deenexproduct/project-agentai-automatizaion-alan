# 📘 Módulo LinkedIn Automation - Documentación Completa

## 📋 Índice
1. [Visión General](#visión-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Pipeline de Estados](#pipeline-de-estados)
4. [Estructura de Archivos](#estructura-de-archivos)
5. [Backend - Servicios Principales](#backend---servicios-principales)
6. [Frontend - Componentes](#frontend---componentes)
7. [Modelo de Datos](#modelo-de-datos)
8. [API Endpoints](#api-endpoints)
9. [Configuración](#configuración)
10. [Guía de Uso](#guía-de-uso)
11. [Troubleshooting](#troubleshooting)

---

## 🎯 Visión General

El módulo de LinkedIn Automation permite automatizar el proceso de prospección profesional en LinkedIn. Incluye:

- **Prospección automatizada**: Visitar perfiles, enviar solicitudes de conexión, dar like a publicaciones
- **CRM integrado**: Gestión de contactos con pipeline de estados
- **Enriquecimiento con IA**: Investigación automática de contactos usando OpenRouter
- **Sistema de verificación**: Confirmación de que las conexiones fueron enviadas
- **Manejo de sesiones**: Persistencia de cookies para mantener sesión activa
- **Rate limiting**: Protección contra bloqueos de LinkedIn

---

## 🏗️ Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────┐
│                     LINKEDIN AUTOMATION                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │   Frontend   │    │    Backend   │    │   MongoDB    │     │
│  │   (React)    │◄──►│   (Express)  │◄──►│   (CRM)      │     │
│  └──────────────┘    └──────┬───────┘    └──────────────┘     │
│                             │                                   │
│                      ┌──────▼───────┐                          │
│                      │  Puppeteer   │                          │
│                      │   (Bot)      │                          │
│                      └──────┬───────┘                          │
│                             │                                   │
│                      ┌──────▼───────┐                          │
│                      │   LinkedIn   │                          │
│                      │   (Web)      │                          │
│                      └──────────────┘                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Flujo de Datos
```
Usuario → Frontend → API → LinkedInService → Puppeteer → LinkedIn
                            ↓
                     MongoDB (CRM)
                            ↓
                     EnrichmentService → OpenRouter → IA
```

---

## 🔄 Pipeline de Estados

Los contactos pasan por los siguientes estados:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  visitando  │───►│ conectando  │───►│interactuando│───►│enriqueciendo│
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
      🔵                🟣                🟢                🟡
   (navegar           (enviar         (like dado,       (IA investiga
    perfil)           conexión)       esperando          el perfil)
                                       enriquecimiento)
                                                       │
                                                       ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ mensaje_    │◄───│  aceptado   │◄───│esperando_   │
│  enviado    │    │             │    │aceptacion   │
└─────────────┘    └─────────────┘    └─────────────┘
      🔴                🟢                🟡
   (mensaje         (conexión         (invitación
    personalizado   aceptada)         enviada)
    enviado)
```

### Estados del Sistema

| Estado | Descripción | Color |
|--------|-------------|-------|
| `pending` | Pendiente de procesar | Gris |
| `visitando` | Bot navegando el perfil | Azul |
| `conectando` | Enviando solicitud de conexión | Púrpura |
| `interactuando` | Like dado, esperando enriquecimiento | Verde claro |
| `enriqueciendo` | IA investigando el perfil | Amarillo |
| `esperando_aceptacion` | Invitación enviada, esperando respuesta | Naranja |
| `aceptado` | Conexión aceptada | Verde |
| `mensaje_enviado` | Mensaje personalizado enviado | Rojo |

---

## 📁 Estructura de Archivos

### Backend (`/server/src/`)

```
services/
├── linkedin/
│   ├── operation-manager.service.ts    # Control de operaciones concurrentes
│   ├── state-persistence.service.ts    # Persistencia de estado
│   ├── retry.service.ts                # Lógica de reintentos
│   ├── connection-verifier.service.ts  # Verificación de conexiones
│   ├── human-behavior.service.ts       # Simulación comportamiento humano
│   ├── health-monitor.service.ts       # Monitoreo de salud
│   ├── captcha-handler.service.ts      # Manejo de CAPTCHA
│   ├── rate-limit-handler.service.ts   # Rate limiting
│   ├── circuit-breaker.service.ts      # Circuit breaker
│   └── session-manager.service.ts      # Gestión de sesiones/cookies
│
├── linkedin.service.ts                 # Servicio principal de prospección
├── enrichment.service.ts               # Enriquecimiento con IA
└── linkedin/
    ├── linkedin-logger.ts              # Logger especializado
    └── index.ts                        # Exports

models/
├── linkedin-contact.model.ts           # Modelo Contacto CRM
└── linkedin-account.model.ts           # Modelo Cuenta LinkedIn

routes/
├── linkedin.routes.ts                  # Rutas API prospección
└── linkedin-crm.routes.ts              # Rutas API CRM
```

### Frontend (`/client/src/`)

```
components/linkedin/
├── LinkedInApp.tsx                     # App principal LinkedIn
├── ProspectingPage.tsx                 # Página de prospección
├── CRMPage.tsx                         # Dashboard CRM (Kanban)
├── ContactDrawer.tsx / V2              # Drawer de contacto
├── PublicacionesPage.tsx               # Gestión de publicaciones
├── MensajesPage.tsx                    # Gestión de mensajes
├── ConfigPage.tsx                      # Configuración
└── ui/
    ├── StatusIcon.tsx                  # Iconos de estado
    └── Badge.tsx                       # Badges reutilizables

services/
├── linkedin.service.ts                 # API client prospección
└── linkedin-crm.service.ts             # API client CRM

contexts/
└── ToastContext.tsx                    # Notificaciones toast
```

---

## ⚙️ Backend - Servicios Principales

### 1. LinkedInService (`linkedin.service.ts`)

Servicio principal que orquesta la prospección.

#### Métodos Principales

| Método | Descripción |
|--------|-------------|
| `connectProfile(page, url)` | Orquesta el proceso de conexión con un perfil |
| `scrapeProfileData(page)` | Extrae datos del perfil (nombre, empresa, foto, etc.) |
| `likeLatestPost(page, url)` | Da like a la última publicación del perfil |
| `verifyConnectionSent(page, url)` | Verifica que la conexión fue enviada correctamente |

#### Estrategias de Conexión

El servicio intenta conectar en este orden:

1. **Strategy 0**: Buscar `<a>` con href `/preload/custom-invite/...`
2. **Strategy 1**: Buscar botón "Conectar" directo
3. **Strategy 2**: Abrir menú "Más" y buscar "Conectar" dentro
4. **Strategy 3**: Navegar directamente a `/preload/custom-invite/...`

#### Protección Anti-Campaign Manager

Filtros aplicados para evitar clicks en links de Campaign Manager:
```typescript
const BLOCKED_URLS = [
  'campaignmanager',
  'publicidad', 
  '/ads/',
  'linkedin.com/ads'
];
```

### 2. EnrichmentService (`enrichment.service.ts`)

Enriquece perfiles usando IA (OpenRouter).

#### Métodos Principales

| Método | Descripción |
|--------|-------------|
| `enrichContact(contactId)` | Investiga un contacto con IA |
| `triggerAutoEnrichment(contactId, status)` | Dispara enriquecimiento automático |
| `generateDossier(contact)` | Genera archivo .md con investigación |

#### Prompt de Enriquecimiento

El servicio construye un prompt que incluye:
- Datos básicos del contacto (nombre, empresa, cargo)
- Contexto del negocio del usuario
- Instrucciones específicas de investigación
- Formato de salida estructurado (JSON)

#### Variables de Entorno
```env
OPENROUTER_API_KEY_1=sk-or-v1-...
OPENROUTER_MODEL=openai/gpt-4o-mini
```

### 3. ConnectionVerifier (`connection-verifier.service.ts`)

Verifica que las conexiones fueron realmente enviadas.

#### Métodos de Verificación

1. **Button State**: Busca botón "Pendiente" o "Pending"
2. **Connection Degree**: Verifica grado de conexión (1°, 2°, 3°)
3. **Messaging Ability**: Verifica si se puede enviar mensaje
4. **Network Page**: Verifica en página de red

### 4. HumanBehaviorService (`human-behavior.service.ts`)

Simula comportamiento humano para evitar detección.

#### Funcionalidades

| Función | Descripción |
|---------|-------------|
| `humanScroll(page)` | Scroll suave con aceleración/desaceleración |
| `humanClick(page, element)` | Click con movimiento de mouse natural |
| `humanMouseMove(page, x, y)` | Movimiento con curva de Bézier |
| `randomDelay(min, max)` | Delays aleatorios entre acciones |

### 5. CircuitBreaker (`circuit-breaker.service.ts`)

Protege contra fallos repetidos.

#### Estados
- `CLOSED`: Funcionamiento normal
- `OPEN`: Circuito abierto (bloqueando)
- `HALF_OPEN`: Probando recuperación

### 6. RateLimitHandler (`rate-limit-handler.service.ts`)

Gestiona límites de tasa para evitar bloqueos.

#### Configuración
```typescript
DELAYS = {
  betweenProfiles: [45000, 90000],  // 45-90s entre perfiles
  pageLoad: [8000, 15000],          // 8-15s carga página
  afterConnect: [3000, 6000],       // 3-6s después de conectar
  afterLike: [2000, 4000],          // 2-4s después de like
};
```

---

## 🎨 Frontend - Componentes

### ProspectingPage

Página principal de prospección con:
- Input de URLs de LinkedIn
- Botones de control (Iniciar, Pausar, Detener)
- Tabla de progreso en tiempo real
- Panel de estado del navegador

#### Tabla de Progreso

| Columna | Icono | Descripción |
|---------|-------|-------------|
| # | - | Índice del perfil |
| Perfil | - | Nombre o URL del perfil |
| Visita | 👁️ | Estado de visita al perfil |
| Conexión | 🔗 | Estado de solicitud de conexión |
| Like | ❤️ | Estado de like a publicación |
| Enriquecimiento | 🧬 | Estado de enriquecimiento IA |
| Estado | Badge | Estado general del pipeline |

### CRMPage (Kanban)

Dashboard tipo Kanban con columnas por estado:

```
┌───────────┬───────────┬───────────┬───────────┐
│Visitando  │Conectando │Interactu- │Esperando  │
│           │           │ando       │Aceptación │
├───────────┼───────────┼───────────┼───────────┤
│ [Contact] │ [Contact] │ [Contact] │ [Contact] │
│ [Contact] │ [Contact] │ [Contact] │ [Contact] │
└───────────┴───────────┴───────────┴───────────┘
```

### ContactDrawer

Panel lateral con información detallada del contacto:
- Foto y datos básicos
- Pipeline de estados (timeline)
- Sección de Enriquecimiento
- Notas
- Botón "Ver en LinkedIn"

---

## 🗄️ Modelo de Datos

### LinkedInContact

```typescript
interface ILinkedInContact {
  // Identificación
  _id: ObjectId;
  profileUrl: string;           // URL de LinkedIn
  vanityName: string;           // Nombre único del perfil
  
  // Datos personales
  fullName: string;
  firstName: string;
  lastName: string;
  headline: string;             // Título profesional
  location: string;
  profilePhotoUrl: string;
  bannerUrl: string;
  
  // Datos profesionales
  currentCompany: string;
  currentPosition: string;
  companyLogoUrl: string;
  connectionDegree: string;     // 1°, 2°, 3°
  
  // Pipeline
  status: string;               // Estado actual
  sentAt: Date;                 // Fecha envío conexión
  acceptedAt: Date;             // Fecha aceptación
  
  // Enriquecimiento
  enrichmentStatus: string;     // pending, processing, completed, error
  enrichmentData: {
    bio?: string;
    summary?: string;
    personality?: string;
    interests?: string[];
    conversationStarters?: string[];
    context?: string;
    rawResponse?: string;
    generatedAt?: Date;
  };
  
  // Datos estructurados
  experience: Array<{
    position: string;
    company: string;
    duration: string;
  }>;
  education: Array<{
    institution: string;
    degree: string;
  }>;
  skills: string[];
  
  // Metadatos
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 🔌 API Endpoints

### Prospección

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/linkedin/status` | Estado del sistema |
| POST | `/api/linkedin/launch` | Abrir navegador |
| POST | `/api/linkedin/start-prospecting` | Iniciar prospección |
| POST | `/api/linkedin/pause` | Pausar |
| POST | `/api/linkedin/resume` | Reanudar |
| POST | `/api/linkedin/stop` | Detener |
| GET | `/api/linkedin/progress` | Progreso actual |
| GET | `/api/linkedin/progress/stream` | SSE - Stream de progreso |

#### Ejemplo: Iniciar Prospección
```bash
curl -X POST http://localhost:3000/api/linkedin/start-prospecting \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://www.linkedin.com/in/castro-damian-442b8530/"
    ],
    "sendNote": false
  }'
```

### CRM

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/linkedin/crm/contacts` | Listar contactos |
| GET | `/api/linkedin/crm/contacts/counts` | Conteos por estado |
| GET | `/api/linkedin/crm/contacts/:id` | Obtener contacto |
| PUT | `/api/linkedin/crm/contacts/:id` | Actualizar contacto |
| DELETE | `/api/linkedin/crm/contacts/:id` | Eliminar contacto |
| POST | `/api/linkedin/crm/contacts/:id/enrich` | Enriquecer contacto |
| GET | `/api/linkedin/crm/publicaciones` | Listar publicaciones |

#### Ejemplo: Listar Contactos
```bash
curl "http://localhost:3000/api/linkedin/crm/contacts?status=interactuando&page=1&limit=10"
```

---

## ⚙️ Configuración

### Variables de Entorno (.env)

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/voicecommand

# LinkedIn (cookies encriptadas)
LINKEDIN_ENCRYPTION_KEY=tu-clave-de-32-caracteres!!

# OpenRouter (Enriquecimiento IA)
OPENROUTER_API_KEY_1=sk-or-v1-xxxxxxxx
OPENROUTER_MODEL=openai/gpt-4o-mini

# Web Search (opcional - para enriquecimiento)
SERPAPI_KEY=tu-api-key

# Configuración de delays (opcional)
LINKEDIN_DELAY_MIN=45000
LINKEDIN_DELAY_MAX=90000
```

### Configuración de Enriquecimiento

Archivo: Configuración en UI → Pestaña "Enriquecimiento"

| Parámetro | Descripción | Default |
|-----------|-------------|---------|
| Max Daily Enrichments | Límite diario de enriquecimientos | 10 |
| Auto Enrich On Status | Estado que dispara auto-enriquecimiento | interactuando |
| OpenRouter Model | Modelo de IA a usar | openai/gpt-4o-mini |

---

## 📖 Guía de Uso

### 1. Iniciar Prospección

1. Ir a **LinkedIn Automation** en el menú lateral
2. Pegar URLs de LinkedIn (una por línea)
3. Opcional: Activar "Enviar nota al conectar"
4. Click en **"Iniciar Prospección"**
5. Esperar a que el bot procese los perfiles

### 2. Monitorear Progreso

- La tabla muestra progreso en tiempo real
- Iconos: 🕐 (pendiente) → ✅ (completado) → ❌ (error)
- El bot se detiene automáticamente al terminar

### 3. Gestión en CRM

1. Ir a **CRM** en el menú lateral
2. Ver contactos organizados en columnas (Kanban)
3. Click en un contacto para ver detalles
4. En la pestaña "Enriquecimiento":
   - Click en **"Enriquecer"** para investigar con IA
   - Esperar resultados (30-60s)
   - Ver datos enriquecidos (bio, intereses, icebreakers)

### 4. Auto-Enriquecimiento

Para habilitar enriquecimiento automático:
1. Ir a **Configuración** → **Enriquecimiento**
2. Activar "Auto-enrich on status: interactuando"
3. Configurar límite diario
4. Guardar configuración

### 5. Mensajes Personalizados

1. Ir a **Mensajes** en el menú lateral
2. Seleccionar template o escribir mensaje personalizado
3. Variables disponibles: `{nombre}`, `{empresa}`, `{cargo}`, `{industria}`, `{ubicacion}`
4. Enviar mensajes a contactos aceptados

---

## 🔧 Troubleshooting

### Error: "Cannot start prospecting — check session status"

**Causa**: El navegador no está abierto o no hay sesión activa.

**Solución**:
```bash
curl -X POST http://localhost:3000/api/linkedin/launch
```

### Error: "Connection timeout" o "Navigation timeout"

**Causa**: LinkedIn está cargando lentamente o hay problemas de red.

**Solución**:
- El sistema reintenta automáticamente (3 intentos)
- Aumentar timeout en `linkedin.service.ts`:
```typescript
const NAVIGATION_TIMEOUT = 30000; // Aumentar a 40s
```

### Error: "__name is not defined"

**Causa**: Problema con transformación de TypeScript en funciones de `page.evaluate()`.

**Solución aplicada**: Usar `function` en lugar de arrow functions en `page.evaluate()`.

### Error: Campaign Manager redirect

**Causa**: El bot está haciendo click en links de "Publicidad" de LinkedIn.

**Solución aplicada**: Filtros de URLs bloqueadas en estrategias de conexión.

### Error: "Node is not clickable"

**Causa**: El elemento existe en DOM pero no es clickable (oculto, disabled, etc.).

**Solución**:
- El bot hace scroll antes de clickear
- Reintenta con diferentes estrategias

### Contacto no avanza de estado

**Verificación**:
1. Revisar logs en `/server/logs/linkedin/`
2. Verificar estado en MongoDB:
```bash
mongo
use voicecommand
db.linkedincontacts.find({profileUrl: "https://..."}).pretty()
```

### Enriquecimiento no funciona

**Verificación**:
1. Verificar `OPENROUTER_API_KEY_1` en `.env`
2. Verificar límite diario no alcanzado
3. Revisar logs del servidor

### El navegador se cierra solo

**Causa**: Puppeteer puede fallar si hay múltiples instancias.

**Solución**:
```bash
# Matar procesos de Chrome
pkill -f "chrome"
# Reiniciar servidor
npm run dev
```

---

## 📊 Logs y Debugging

### Ubicación de Logs

```
/server/logs/linkedin/
├── [vanity-name]_[timestamp].log     # Log por perfil procesado
└── screenshots/
    └── [vanity-name]_[step]_[timestamp].png
```

### Niveles de Log

- **INFO**: Progreso normal
- **WARNING**: Advertencias (timeouts, reintentos)
- **ERROR**: Errores críticos

### Screenshot Debugging

El bot guarda screenshots en cada paso:
1. `01_after_navigation` - Después de cargar página
2. `02_profile_loaded` - Perfil cargado
3. `03_before_connect` - Antes de clickear conectar
4. `04_before_click_connect` - Antes del click final
5. `05_after_click_connect` - Después del click
6. `06_verification` - Verificación de conexión

---

## 🔒 Seguridad y Buenas Prácticas

### Cookies Encriptadas

Las cookies de LinkedIn se almacenan encriptadas en MongoDB:
- Algoritmo: AES-256-GCM
- Key: `LINKEDIN_ENCRYPTION_KEY` (32 caracteres)

### Rate Limiting

- Máximo: 20 conexiones por hora
- Delay entre perfiles: 45-90 segundos
- LinkedIn puede bloquear cuenta si se exceden límites

### Detección de Bot

El sistema incluye:
- User-agent real de Chrome
- Stealth plugin para Puppeteer
- Comportamiento humano (scroll, clicks, delays)
- Sin headless mode (navegador visible)

---

## 🚀 Mejoras Futuras Sugeridas

1. **Proxy Rotation**: Rotar IPs para evitar bloqueos
2. **ML-based Detection**: Mejorar detección de elementos con ML
3. **Multi-cuenta**: Soporte para múltiples cuentas de LinkedIn
4. **Analytics Dashboard**: Métricas de conversión, tiempos, etc.
5. **Integración Email**: Enviar emails además de mensajes LinkedIn

---

## 📞 Soporte

Para reportar issues o solicitar features:
1. Revisar logs en `/server/logs/linkedin/`
2. Verificar configuración en `.env`
3. Probar con un solo perfil primero
4. Documentar errores con screenshots

---

**Documento generado:** $(date)
**Versión:** 1.0
**Módulo:** LinkedIn Automation
