# 🔧 Guía de Troubleshooting - VoiceCommand

> Guía completa de diagnóstico y resolución de problemas para la plataforma VoiceCommand.

---

## 📋 Índice

1. [Checklist de Diagnóstico Rápido](#-checklist-de-diagnóstico-rápido)
2. [Problemas del Pipeline CRM](#-problemas-del-pipeline-crm)
3. [Problemas de Enriquecimiento AI](#-problemas-de-enriquecimiento-ai)
4. [Problemas de LinkedIn/Puppeteer](#-problemas-de-linkedinpuppeteer)
5. [Problemas de MongoDB](#-problemas-de-mongodb)
6. [Problemas de WhatsApp Web](#-problemas-de-whatsapp-web)
7. [FAQ - Preguntas Frecuentes](#-faq---preguntas-frecuentes)
8. [Comandos de Debugging](#-comandos-de-debugging)

---

## ✅ Checklist de Diagnóstico Rápido

Antes de profundizar, verifica estos puntos básicos:

```bash
# 1. Verificar que los servicios están corriendo
curl http://localhost:3000/api/health

# 2. Verificar conexión a MongoDB
curl http://localhost:3000/api/linkedin/crm/contacts/counts

# 3. Verificar estado de WhatsApp
curl http://localhost:3000/api/whatsapp/status

# 4. Verificar configuración de OpenRouter
grep "OPENROUTER_API_KEY" server/.env

# 5. Verificar logs recientes
tail -100 server/logs/app.log 2>/dev/null || tail -100 /tmp/server.log
```

### Matriz de Síntomas Rápidos

| Síntoma | Posible Causa | Sección |
|---------|---------------|---------|
| Contactos no cambian de estado | Pipeline CRM | [Ver](#crm) |
| Dossiers con score bajo | Enriquecimiento AI | [Ver](#ai) |
| LinkedIn pide CAPTCHA | Puppeteer/Detección | [Ver](#linkedin) |
| Error "MongoNetworkError" | MongoDB | [Ver](#mongodb) |
| QR no aparece o no escanea | WhatsApp | [Ver](#whatsapp) |

---

## 🔄 Problemas del Pipeline CRM

### 1. Los cambios de estado no se guardan

#### Síntomas
- Drag & drop en el Kanban no persiste
- El contacto vuelve a su columna anterior después de refrescar
- Error 500 al llamar `PATCH /contacts/:id/status`

#### Diagnóstico
```bash
# Verificar logs del servidor
tail -f server/logs/app.log | grep -i "status update"

# Verificar estado actual de un contacto
curl http://localhost:3000/api/linkedin/crm/contacts/CONTACT_ID

# Verificar índices de MongoDB
mongosh voicecommand --eval "db.linkedincontacts.getIndexes()"
```

#### Solución
```javascript
// 1. Verificar que el estado es válido
const validStatuses = ['visitando', 'conectando', 'interactuando', 
                       'enriqueciendo', 'esperando_aceptacion', 
                       'aceptado', 'mensaje_enviado'];

// 2. Si hay error de índice, recrearlo
mongosh voicecommand --eval "
  db.linkedincontacts.dropIndex('status_1_updatedAt_-1');
  db.linkedincontacts.createIndex({ status: 1, updatedAt: -1 });
"
```

#### Prevención
- ✅ Validar siempre los estados en el frontend antes de enviar
- ✅ Implementar reintentos automáticos con backoff exponencial
- ✅ Monitorear los logs de MongoDB para errores de índice

---

### 2. Contactos duplicados en el CRM

#### Síntomas
- Mismo perfil de LinkedIn aparece varias veces
- URLs similares pero no idénticas (con/sin trailing slash)

#### Diagnóstico
```bash
# Buscar duplicados por URL
mongosh voicecommand --eval "
  db.linkedincontacts.aggregate([
    { \$group: { _id: '\$profileUrl', count: { \$sum: 1 } } },
    { \$match: { count: { \$gt: 1 } } }
  ]);
"
```

#### Solución
```javascript
// Normalizar URLs duplicadas
mongosh voicecommand --eval "
  db.linkedincontacts.find().forEach(function(doc) {
    var normalized = doc.profileUrl.replace(/\/$/, '').toLowerCase();
    if (normalized !== doc.profileUrl) {
      db.linkedincontacts.updateOne(
        { _id: doc._id },
        { \$set: { profileUrl: normalized } }
      );
    }
  });
"
```

#### Prevención
- ✅ Siempre usar `normalizeUrl()` antes de guardar
- ✅ Usar índice único en `profileUrl`
- ✅ Implementar upserts en lugar de inserts directos

---

### 3. El Kanban no carga o carga muy lento

#### Síntomas
- Timeout al cargar `/api/linkedin/crm/contacts`
- UI con spinner infinito
- Error "Request timeout" después de 30s

#### Diagnóstico
```bash
# Verificar cantidad de contactos
mongosh voicecommand --eval "db.linkedincontacts.countDocuments()"

# Verificar consultas lentas
mongosh voicecommand --eval "
  db.currentOp({ 'secs_running': { \$gt: 5 } });
"

# Verificar tamaño de la colección
mongosh voicecommand --eval "
  db.linkedincontacts.stats().size / 1024 / 1024;
"
```

#### Solución
```javascript
// 1. Agregar índice compuesto para queries de Kanban
mongosh voicecommand --eval "
  db.linkedincontacts.createIndex({ status: 1, updatedAt: -1 });
"

// 2. Implementar paginación más agresiva
// En el frontend: limit=25 en lugar de 50

// 3. Usar projection para reducir datos transferidos
const projection = {
  fullName: 1, currentPosition: 1, currentCompany: 1,
  profilePhotoUrl: 1, status: 1, updatedAt: 1
};
```

#### Prevención
- ✅ Usar proyecciones siempre que sea posible
- ✅ Implementar cursor-based pagination para >10K registros
- ✅ Monitorear `slowms` en MongoDB

---

## 🤖 Problemas de Enriquecimiento AI

### 1. Confidence Score muy bajo (0-40)

#### Síntomas
- Dossiers con 🔴 (score < 60)
- Muchos campos marcados como "No verificado"
- Falta de noticias de empresa

#### Diagnóstico
```bash
# Verificar configuración de SerpAPI
grep "SERPAPI_KEY" server/.env

# Verificar estado de OpenRouter
curl -H "Authorization: Bearer $OPENROUTER_API_KEY_1" \
  https://openrouter.ai/api/v1/auth/key

# Verificar logs de enriquecimiento
tail -f server/logs/app.log | grep -i "enrichment\|web_search"
```

#### Solución
```bash
# 1. Configurar SerpAPI para búsqueda web
export SERPAPI_KEY="tu_api_key_aqui"

# 2. Reiniciar el servidor para cargar nueva config
cd server && npm run dev

# 3. Re-enriquecer contactos con bajo score
node work_agent/re-enrich-contacts.js
```

#### Prevención
- ✅ Configurar SERPAPI_KEY desde el inicio
- ✅ Monitorear uso de cuota de OpenRouter
- ✅ Implementar caché de búsquedas web

---

### 2. Timeouts en enriquecimiento

#### Síntomas
- Error "Request timeout" después de 60s
- Contacto queda en estado "enriching" indefinidamente
- Logs muestran "OpenRouter no responde"

#### Diagnóstico
```bash
# Verificar tiempo de respuesta de OpenRouter
curl -w "@curl-format.txt" -o /dev/null -s \
  -H "Authorization: Bearer $OPENROUTER_API_KEY_1" \
  https://openrouter.ai/api/v1/models

# Verificar contactos atascados
mongosh voicecommand --eval "
  db.linkedincontacts.find({
    enrichmentStatus: 'enriching',
    enrichedAt: { \$lt: new Date(Date.now() - 10*60*1000) }
  });
"
```

#### Solución
```javascript
// 1. Resetear contactos atascados
mongosh voicecommand --eval "
  db.linkedincontacts.updateMany(
    { 
      enrichmentStatus: 'enriching',
      enrichedAt: { \$lt: new Date(Date.now() - 10*60*1000) }
    },
    { 
      \$set: { enrichmentStatus: 'failed' },
      \$push: { 
        notes: { 
          text: 'Timeout - reiniciado manualmente', 
          createdAt: new Date() 
        } 
      }
    }
  );
"

// 2. Aumentar timeout en el servicio
// En enrichment.service.ts:
const TIMEOUT_MS = 120000; // 2 minutos
```

#### Prevención
- ✅ Implementar job queue (Bull/Agenda) para enriquecimiento
- ✅ Agregar timeout explícito en llamadas a OpenRouter
- ✅ Monitor de "enriching" stuck cada 5 minutos

---

### 3. OpenRouter retorna errores 429/402/403

#### Síntomas
- Error "Rate limit exceeded"
- Error "Payment required"
- Error "Invalid API key"

#### Diagnóstico
```bash
# Verificar estado de todas las keys
for i in 1 2 3; do
  key_var="OPENROUTER_API_KEY_$i"
  key_value=$(grep "$key_var" server/.env | cut -d= -f2)
  echo "Key $i: ${key_value:0:20}..."
  curl -s -H "Authorization: Bearer $key_value" \
    https://openrouter.ai/api/v1/auth/key | jq '.data'
done
```

#### Solución
```bash
# 1. Configurar múltiples keys (hasta 3)
export OPENROUTER_API_KEY_1="sk-or-v1-..."
export OPENROUTER_API_KEY_2="sk-or-v1-..."
export OPENROUTER_API_KEY_3="sk-or-v1-..."

# 2. Verificar que el servicio detecta todas
node -e "
  const keys = [
    process.env.OPENROUTER_API_KEY_1,
    process.env.OPENROUTER_API_KEY_2,
    process.env.OPENROUTER_API_KEY_3,
  ].filter(k => k && k.trim().length > 0);
  console.log('Keys configuradas:', keys.length);
"
```

#### Prevención
- ✅ Configurar siempre múltiples keys
- ✅ Monitorear uso de créditos en OpenRouter dashboard
- ✅ Implementar circuit breaker para rate limits

---

### 4. URLs en dossiers son inválidas

#### Síntomas
- Links de noticias retornan 404
- URLs apuntan a dominios inexistentes
- Validación HTTP reporta "brokenUrls"

#### Diagnóstico
```bash
# Ejecutar validación de URLs
node work_agent/validate-enrichment.js

# Verificar URLs específicas de un contacto
mongosh voicecommand --eval "
  var contact = db.linkedincontacts.findOne({ fullName: /Nombre/ });
  contact.enrichmentData.companyNews.forEach(n => print(n.url));
"
```

#### Solución
```bash
# 1. Re-enriquecer contactos con URLs rotas
node work_agent/re-enrich-contacts.js --fix-broken-urls

# 2. Ajustar prompt para enfatizar URLs reales
# En ENRICHMENT_SYSTEM_PROMPT, agregar:
# "SOLO usa URLs de dominios verificados: cronista.com, infobae.com, ..."
```

#### Prevención
- ✅ Validación HTTP automática post-enriquecimiento
- ✅ Whitelist de dominios permitidos en el prompt
- ✅ Score penalty por URLs rotas

---

## 🔗 Problemas de LinkedIn/Puppeteer

### 1. LinkedIn detecta automation (CAPTCHA/bloqueo)

#### Síntomas
- Página roja de CAPTCHA
- Mensaje "Your account has been restricted"
- Redirect a `/checkpoint/challenge`

#### Diagnóstico
```bash
# Verificar si el stealth plugin está activo
grep -n "StealthPlugin" server/src/services/linkedin.service.ts

# Verificar user agent actual
grep -n "userAgent" server/src/services/linkedin.service.ts

# Revisar health monitor
node -e "
  const hm = require('./server/dist/services/linkedin/health-monitor.service');
  console.log(hm.healthMonitor.getHealthStatus());
"
```

#### Solución
```bash
# 1. Pausar prospecting inmediatamente
curl -X POST http://localhost:3000/api/linkedin/pause

# 2. Resolver CAPTCHA manualmente en el navegador visible
# (El browser se abre con headless: false)

# 3. Esperar 24-48 horas antes de reanudar
# 4. Reducir velocidad cuando reanudes
curl -X POST http://localhost:3000/api/linkedin/config \
  -H "Content-Type: application/json" \
  -d '{"delayBetweenProfiles": 120000}'  # 2 minutos entre perfiles
```

#### Prevención
- ✅ Usar siempre puppeteer-extra-plugin-stealth
- ✅ Mantener user agent actualizado (Chrome latest)
- ✅ Implementar delays humanos (45-120s entre perfiles)
- ✅ Pausas largas cada 15-20 perfiles (3-7 min)
- ✅ No exceder 50 conexiones/día

---

### 2. Session expirada / Cookies no persisten

#### Síntomas
- Redirect a `/login` al visitar perfiles
- "Session expired" en logs
- Cookies no se guardan en `linkedin-session/cookies.json`

#### Diagnóstico
```bash
# Verificar directorio de sesión
ls -la server/linkedin-session/

# Verificar contenido de cookies
cat server/linkedin-session/cookies.json | jq '. | length'

# Verificar permisos
ls -ld server/linkedin-session/
```

#### Solución
```bash
# 1. Limpiar sesión corrupta
rm -rf server/linkedin-session/*

# 2. Reiniciar LinkedIn service
curl -X POST http://localhost:3000/api/linkedin/stop
# Reiniciar servidor

# 3. Login manual (se guardará automáticamente)
# Esperar a que aparezca "✅ LinkedIn login detected — cookies saved"
```

#### Prevención
- ✅ No borrar cookies.json manualmente
- ✅ Backup periódico de cookies.json
- ✅ Detectar expiración temprana (check cada 5 min)

---

### 3. Perfiles no se scrapean (datos incompletos)

#### Síntomas
- Contactos guardados con solo URL y nombre de vanity
- Sin headline, company, ni experience
- Error "Page failed to load"

#### Diagnóstico
```bash
# Verificar logs de scraping
tail -f server/logs/linkedin-*.log | grep -E "SCRAPE|ERROR"

# Verificar contactos con datos mínimos
mongosh voicecommand --eval "
  db.linkedincontacts.find({
    headline: { \$exists: false },
    currentCompany: { \$exists: false }
  }).limit(5);
"
```

#### Solución
```bash
# 1. Verificar que LinkedIn no cambió su DOM
# Revisar si los selectores aún funcionan:
# - 'h1' para nombre
# - '.text-body-medium' para headline
# - '[data-field="experience"]'

# 2. Re-scrapear contactos incompletos
mongosh voicecommand --eval "
  var contacts = db.linkedincontacts.find({
    headline: { \$exists: false }
  }).toArray();
  
  contacts.forEach(c => {
    print('Re-scrape needed: ' + c.profileUrl);
    // Agregar a cola de re-scrape
  });
"
```

#### Prevención
- ✅ Implementar selectors fallback (múltiples estrategias)
- ✅ Screenshot automático cuando falla el scrape
- ✅ Validación de datos mínimos antes de guardar

---

### 4. Rate limiting de LinkedIn

#### Síntomas
- Error "You've reached the weekly invitation limit"
- Mensaje "Too many requests"
- Perfiles cargan pero botones están deshabilitados

#### Diagnóstico
```bash
# Verificar rate limit handler
grep -n "rateLimitHandler" server/src/services/linkedin.service.ts

# Revisar métricas de health monitor
node -e "
  const fs = require('fs');
  const logs = fs.readFileSync('server/logs/app.log', 'utf8');
  const matches = logs.match(/RATE LIMIT/g);
  console.log('Rate limits detectados:', matches ? matches.length : 0);
"
```

#### Solución
```bash
# 1. Detener inmediatamente
curl -X POST http://localhost:3000/api/linkedin/stop

# 2. Esperar el tiempo sugerido (generalmente 24h para conexiones)
# 3. Ajustar límites en el código:
# En linkedin.service.ts:
const MAX_CONNECTIONS_PER_DAY = 20;
const DELAYS = {
  betweenProfiles: { min: 60000, max: 180000 }, // 1-3 min
  longPause: { min: 300000, max: 600000 },      // 5-10 min
};
```

#### Prevención
- ✅ Contador diario de conexiones enviadas
- ✅ Backoff exponencial en reintentos
- ✅ Health monitor con alertas tempranas

---

## 🗄️ Problemas de MongoDB

### 1. Error de conexión: MongoNetworkError

#### Síntomas
- Error "failed to connect to server"
- "connection timed out"
- Aplicación no inicia

#### Diagnóstico
```bash
# Verificar si MongoDB está corriendo
mongosh --eval "db.adminCommand('ping')"

# Verificar URI de conexión
grep "MONGODB_URI" server/.env

# Probar conexión manual
mongosh "mongodb://localhost:27017/voicecommand" --eval "db.stats()"
```

#### Solución
```bash
# 1. Iniciar MongoDB (macOS)
brew services start mongodb-community

# 2. Iniciar MongoDB (Linux)
sudo systemctl start mongod

# 3. Verificar puerto
netstat -tlnp | grep 27017

# 4. Si es problema de red, verificar firewall
sudo ufw allow 27017
```

#### Prevención
- ✅ Usar connection string con retryWrites
- ✅ Configurar connection pool (maxPoolSize: 10)
- ✅ Health check de MongoDB cada 30s

---

### 2. Queries lentas (slow queries)

#### Síntomas
- API tarda >5s en responder
- Timeouts en consultas de contactos
- MongoDB usando 100% CPU

#### Diagnóstico
```bash
# Habilitar profiling de queries lentas (>100ms)
mongosh voicecommand --eval "
  db.setProfilingLevel(1, { slowms: 100 });
"

# Ver queries lentas recientes
mongosh voicecommand --eval "
  db.system.profile.find().sort({ ts: -1 }).limit(5);
"

# Explicar plan de ejecución
mongosh voicecommand --eval "
  db.linkedincontacts.find({ status: 'esperando_aceptacion' }).explain('executionStats');
"
```

#### Solución
```javascript
// 1. Crear índices faltantes
mongosh voicecommand --eval "
  // Para queries por status
  db.linkedincontacts.createIndex({ status: 1, updatedAt: -1 });
  
  // Para búsqueda de texto
  db.linkedincontacts.createIndex(
    { fullName: 'text', headline: 'text', currentCompany: 'text' },
    { weights: { fullName: 10, currentCompany: 5, headline: 3 } }
  );
  
  // Para enriquecimiento
  db.linkedincontacts.createIndex({ enrichmentStatus: 1 });
"

// 2. Agregar compound indexes si hay múltiples filtros
// Ejemplo: status + createdAt
```

#### Prevención
- ✅ Crear índices al definir schemas
- ✅ Revisar `explain()` antes de deployar queries nuevas
- ✅ Monitorear `system.profile` semanalmente

---

### 3. Datos corruptos / Schema validation errors

#### Síntomas
- Error "Cast to ObjectId failed"
- Campos con valores nulos inesperados
- "ValidationError" al guardar documentos

#### Diagnóstico
```bash
# Verificar documentos problemáticos
mongosh voicecommand --eval "
  db.linkedincontacts.find({
    \$or: [
      { profileUrl: { \$exists: false } },
      { fullName: { \$type: 'null' } },
      { status: { \$nin: ['visitando', 'conectando', 'interactuando', 
                          'enriqueciendo', 'esperando_aceptacion', 
                          'aceptado', 'mensaje_enviado'] } }
    ]
  }).limit(5);
"
```

#### Solución
```javascript
// 1. Limpiar documentos corruptos
mongosh voicecommand --eval "
  // Remover contactos sin URL
  db.linkedincontacts.deleteMany({ profileUrl: { \$exists: false } });
  
  // Remover contactos sin nombre
  db.linkedincontacts.deleteMany({ 
    \$or: [
      { fullName: { \$exists: false } },
      { fullName: '' },
      { fullName: null }
    ]
  });
  
  // Normalizar estados inválidos
  db.linkedincontacts.updateMany(
    { status: { \$exists: false } },
    { \$set: { status: 'visitando' } }
  );
"
```

#### Prevención
- ✅ Usar Mongoose schemas con validación estricta
- ✅ Implementar migraciones de datos versionadas
- ✅ Backup antes de migraciones

---

### 4. Espacio en disco lleno

#### Síntomas
- Error "No space left on device"
- MongoDB rechaza writes
- Servidor no responde

#### Diagnóstico
```bash
# Verificar espacio en disco
df -h

# Verificar tamaño de MongoDB
sudo du -sh /var/lib/mongodb

# Verificar tamaño de logs
sudo du -sh /var/log/mongodb
```

#### Solución
```bash
# 1. Compactar colección
mongosh voicecommand --eval "db.linkedincontacts.compact()"

# 2. Rotar logs
sudo logrotate -f /etc/logrotate.d/mongod

# 3. Limpiar logs antiguos
find /var/log/mongodb -name "*.log.*" -mtime +7 -delete

# 4. Habilitar TTL para datos temporales
mongosh voicecommand --eval "
  db.sessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 });
"
```

#### Prevención
- ✅ Monitoreo de disco (<80% uso)
- ✅ TTL indexes para datos temporales
- ✅ Rotación automática de logs

---

## 📱 Problemas de WhatsApp Web

### 1. QR Code no aparece o no escanea

#### Síntomas
- Endpoint `/api/whatsapp/status` retorna `qr: null`
- QR aparece pero WhatsApp móvil no lo reconoce
- Error "QR expired" inmediatamente

#### Diagnóstico
```bash
# Verificar estado actual
curl http://localhost:3000/api/whatsapp/status

# Verificar sesión guardada
ls -la server/wa-session/

# Verificar logs
tail -f server/logs/app.log | grep -i "whatsapp\|qr"
```

#### Solución
```bash
# 1. Limpiar sesión anterior
rm -rf server/wa-session/*

# 2. Reiniciar servicio de WhatsApp
# (Reiniciar el servidor Node.js)

# 3. Esperar a que aparezca QR nuevo (puede tomar 10-30s)
curl http://localhost:3000/api/whatsapp/status
# Debería retornar: { "status": "qr", "qr": "data:image/png;base64,..." }

# 4. Si persiste, verificar versión de whatsapp-web.js
npm ls whatsapp-web.js
# Actualizar si es necesario: npm update whatsapp-web.js
```

#### Prevención
- ✅ No escanear QR desde múltiples dispositivos simultáneamente
- ✅ Mantener whatsapp-web.js actualizado
- ✅ Limpiar sesión antes de re-autenticar

---

### 2. WhatsApp se desconecta frecuentemente

#### Síntomas
- Estado cambia entre "connected" y "disconnected"
- Mensajes programados no se envían
- Error "CONFLICT" o "UNPAIRED" en logs

#### Diagnóstico
```bash
# Verificar información de salud
curl http://localhost:3000/api/whatsapp/health

# Verificar logs de desconexión
tail -500 server/logs/app.log | grep -i "disconnected\|reconnect"
```

#### Solución
```bash
# 1. Verificar que el celular tiene conexión estable
# 2. Desactivar suspensión de la app de WhatsApp en el celular
# 3. En Android: WhatsApp > Ajustes > Aplicaciones > Batería > Sin restricciones

# 4. Verificar configuración de puppeteer
# En whatsapp.service.ts, asegurar flags:
# --disable-backgrounding-occluded-windows
# --disable-renderer-backgrounding

# 5. Reiniciar cliente de WhatsApp
curl -X POST http://localhost:3000/api/whatsapp/restart
```

#### Prevención
- ✅ Implementar auto-reconnect con backoff exponencial
- ✅ Keep-alive heartbeat cada 30s
- ✅ Restart preventivo diario (4 AM)

---

### 3. Mensajes programados no se envían

#### Síntomas
- Mensajes quedan en estado "pending"
- Scheduler no procesa mensajes
- Error al enviar manualmente

#### Diagnóstico
```bash
# Verificar mensajes pendientes
mongosh voicecommand --eval "
  db.scheduledmessages.find({ status: 'pending' }).sort({ scheduledAt: 1 });
"

# Verificar si el scheduler está activo
curl http://localhost:3000/api/whatsapp/health | jq '.schedulerActive'

# Verificar logs del scheduler
tail -f server/logs/app.log | grep -i "scheduler\|scheduled"
```

#### Solución
```bash
# 1. Reiniciar scheduler
curl -X POST http://localhost:3000/api/whatsapp/restart-scheduler

# 2. Verificar mensajes expirados
mongosh voicecommand --eval "
  db.scheduledmessages.updateMany(
    { 
      status: 'pending',
      scheduledAt: { \$lt: new Date() },
      retryCount: { \$gte: 3 }
    },
    { 
      \$set: { status: 'failed', error: 'Max retries exceeded' }
    }
  );
"

# 3. Reintentar mensajes fallidos manualmente
# Obtener IDs de mensajes fallidos
mongosh voicecommand --eval "
  db.scheduledmessages.find({ status: 'failed' }).forEach(m => print(m._id));
"
# Reintentar: curl -X POST http://localhost:3000/api/whatsapp/retry/:id
```

#### Prevención
- ✅ Monitorear métricas de mensajes enviados/fallidos
- ✅ Alerta si mensajes pending > 1 hora
- ✅ Retry automático (hasta 3 veces)

---

### 4. Error al enviar audio (formato WebM)

#### Síntomas
- Error "audio/webm not supported"
- Audio no se reproduce en WhatsApp
- Error de conversión ffmpeg

#### Diagnóstico
```bash
# Verificar que ffmpeg está instalado
which ffmpeg
ffmpeg -version | head -1

# Verificar formato del archivo
file uploads/audio.webm

# Verificar logs de conversión
tail -f server/logs/app.log | grep -i "ffmpeg\|convert"
```

#### Solución
```bash
# 1. Instalar ffmpeg si falta
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# 2. Verificar permisos de uploads
chmod 755 server/uploads/

# 3. Probar conversión manual
ffmpeg -i uploads/audio.webm -vn -acodec libopus -b:a 128k \
  -ar 48000 -ac 1 -y uploads/audio.ogg
```

#### Prevención
- ✅ Validar ffmpeg al iniciar el servidor
- ✅ Conversión automática WebM → OGG/Opus
- ✅ Cleanup de archivos temporales

---

## ❓ FAQ - Preguntas Frecuentes

### 1. ¿Cómo reinicio completamente el sistema?

```bash
# Detener todo
pkill -f "node.*server"

# Limpiar sesiones (opcional - requiere re-login)
rm -rf server/linkedin-session/* server/wa-session/*

# Reiniciar MongoDB (si es necesario)
brew services restart mongodb-community  # macOS

# Iniciar servidor
cd server && npm run dev
```

### 2. ¿Cuál es el límite de conexiones de LinkedIn?

- **Conexiones**: ~20-30 por día (recomendado: 20)
- **Perfiles visitados**: ~100 por día
- **Likes**: ~50 por día

El sistema implementa delays automáticos:
- 45-120 segundos entre perfiles
- Pausa de 3-7 minutos cada 15-20 perfiles

### 3. ¿Cómo agrego más cuentas de OpenRouter?

```bash
# Editar server/.env
export OPENROUTER_API_KEY_1="sk-or-v1-..."
export OPENROUTER_API_KEY_2="sk-or-v1-..."
export OPENROUTER_API_KEY_3="sk-or-v1-..."

# Reiniciar servidor
# El servicio detecta automáticamente todas las keys
```

### 4. ¿Dónde se guardan los dossiers generados?

```bash
# Ubicación
server/data/contacts-context/

# Formato
{nombre-vanity}.md

# Ejemplo
ls server/data/contacts-context/
# rodrigo-larrain-6170b710.md
# santiago-magliano-92496b236.md
```

### 5. ¿Cómo cambio el modelo de AI para enriquecimiento?

```bash
# Editar server/data/enrichment-config.json
{
  "model": "anthropic/claude-3.5-sonnet",  # Cambiar modelo
  "maxEnrichmentsPerDay": 45,
  "delayBetweenRequests": 4000
}

# O vía API
curl -X PATCH http://localhost:3000/api/linkedin/crm/enrichment/config \
  -H "Content-Type: application/json" \
  -d '{"model": "anthropic/claude-3.5-sonnet"}'
```

### 6. ¿Qué hacer si LinkedIn bloquea la cuenta?

1. **Detener inmediatamente** todas las operaciones
2. **No intentar login** por 24-48 horas
3. **Resolver CAPTCHA** manualmente si aparece
4. **Contactar soporte** de LinkedIn si es bloqueo permanente
5. **Usar cuenta alternativa** si está disponible

### 7. ¿Cómo hago backup de la base de datos?

```bash
# Backup completo
mongodump --db=voicecommand --out=backup/$(date +%Y%m%d)

# Backup solo contactos
mongodump --db=voicecommand --collection=linkedincontacts \
  --out=backup/$(date +%Y%m%d)

# Restore
mongorestore --db=voicecommand backup/20250217/voicecommand/
```

### 8. ¿Cómo limpio contactos de prueba?

```bash
# Eliminar contactos con nombres de prueba
mongosh voicecommand --eval "
  db.linkedincontacts.deleteMany({
    \$or: [
      { fullName: /test/i },
      { fullName: /prueba/i },
      { fullName: /example/i },
      { profileUrl: /example/i }
    ]
  });
"
```

### 9. ¿Cómo verifico la salud del sistema?

```bash
# Health check completo
node work_agent/platform-health-check.js

# O usar el endpoint
curl http://localhost:3000/api/health

# Verificar componentes individuales
curl http://localhost:3000/api/linkedin/crm/contacts/counts
curl http://localhost:3000/api/whatsapp/health
```

### 10. ¿Cómo cambio los delays del prospecting?

```javascript
// En server/src/services/linkedin.service.ts

const DELAYS = {
  pageLoad: { min: 3000, max: 6000 },
  scroll: { min: 2000, max: 5000 },
  betweenActions: { min: 5000, max: 20000 },
  betweenProfiles: { min: 45000, max: 120000 },  // Ajustar aquí
  longPause: { min: 180000, max: 420000 },       // Y aquí
};
```

Valores recomendados:
- **Conservador** (máxima seguridad): 90-180s entre perfiles
- **Normal** (balance): 45-120s entre perfiles
- **Riesgoso** (solo si es necesario): 20-45s entre perfiles

---

## 🔍 Comandos de Debugging

### Logs en tiempo real

```bash
# Todas las operaciones de LinkedIn
tail -f server/logs/app.log | grep -i "linkedin\|prospecting"

# Enriquecimiento
tail -f server/logs/app.log | grep -i "enrich\|openrouter"

# WhatsApp
tail -f server/logs/app.log | grep -i "whatsapp\|scheduler"

# Errores solo
tail -f server/logs/app.log | grep -i "error\|❌"
```

### Consultas MongoDB útiles

```javascript
// Contactos por estado
mongosh voicecommand --eval "
  db.linkedincontacts.aggregate([
    { \$group: { _id: '\$status', count: { \$sum: 1 } } }
  ]);
"

// Contactos sin enriquecer
mongosh voicecommand --eval "
  db.linkedincontacts.find({
    enrichmentStatus: { \$in: [null, 'pending', 'failed'] }
  }).count();
"

// Últimos contactos creados
mongosh voicecommand --eval "
  db.linkedincontacts.find()
    .sort({ createdAt: -1 })
    .limit(5)
    .forEach(c => print(c.fullName + ' - ' + c.status));
"

// Tamaño de la colección
mongosh voicecommand --eval "
  var stats = db.linkedincontacts.stats();
  print('Documentos: ' + stats.count);
  print('Tamaño: ' + (stats.size / 1024 / 1024).toFixed(2) + ' MB');
  print('Índices: ' + stats.nindexes);
"
```

### Tests de diagnóstico

```bash
# Test completo del pipeline
node work_agent/test-e2e-complete.js

# Test de enriquecimiento
node work_agent/test-enrichment.js

# Health check
node work_agent/platform-health-check.js

# Validación de enriquecimientos existentes
node work_agent/validate-enrichment.js
```

### Información del sistema

```bash
# Versión de Node.js
node --version

# Versiones de dependencias clave
cd server && npm ls puppeteer whatsapp-web.js mongoose

# Espacio en disco
df -h

# Memoria disponible
free -h  # Linux
vm_stat  # macOS

# Procesos de Node.js
ps aux | grep node
```

---

## 📞 Escalación

Si el problema persiste después de seguir esta guía:

1. **Recolectar información**:
   - Logs relevantes (`server/logs/app.log`)
   - Estado de la base de datos
   - Capturas de pantalla de errores

2. **Verificar issues conocidos**:
   - `work_agent/PLATFORM_STATUS_REPORT.md`
   - `work_agent/ENRICHMENT_ANALYSIS_REPORT.md`

3. **Contactar al equipo** con:
   - Descripción del problema
   - Pasos para reproducir
   - Logs relevantes
   - Estado actual del sistema

---

**Última actualización:** 18 de febrero de 2026  
**Versión:** 1.0.0  
**Mantenedor:** VoiceCommand Documentation Team
