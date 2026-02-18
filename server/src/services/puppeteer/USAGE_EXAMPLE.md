# LinkedIn Browser Service - Usage Example

## Inicialización básica

```typescript
import { linkedInBrowser, STRICT_RETRY_CONFIG } from './linkedin.browser';

// Inicializar navegador con medidas anti-detección
async function init() {
    const session = await linkedInBrowser.initialize(false); // headless = false
    console.log(`Session started: ${session.id}`);
    console.log(`User Agent: ${session.userAgent}`);
    console.log(`Viewport: ${session.viewport.width}x${session.viewport.height}`);
}
```

## Navegación con retry automático

```typescript
// Navegar a LinkedIn con retry automático y detección de bloqueos
async function navigateToProfile(profileUrl: string) {
    const result = await linkedInBrowser.navigate(profileUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
        retryConfig: STRICT_RETRY_CONFIG, // 5 reintentos con backoff exponencial
    });

    if (result.success) {
        console.log(`Loaded: ${result.title}`);
        console.log(`Retries needed: ${result.retryCount}`);
        console.log(`Duration: ${result.durationMs}ms`);
    } else {
        console.error(`Failed: ${result.error}`);
        
        if (result.blockDetected) {
            console.error(`Block type: ${result.blockDetected.name}`);
            console.error(`Severity: ${result.blockDetected.severity}`);
        }
    }
    
    return result;
}
```

## Acciones con comportamiento humano

```typescript
// Click humanizado
async function clickConnectButton() {
    const result = await linkedInBrowser.humanClick('button[aria-label="Connect"]', {
        waitForSelector: true,
        timeout: 10000,
    });
    
    if (result.success) {
        console.log('Connect button clicked');
    }
}

// Type humanizado
async function typeNote(text: string) {
    const result = await linkedInBrowser.humanType('textarea[name="message"]', text, {
        clearFirst: true,
        delayRange: { min: 50, max: 150 }, // ms entre caracteres
    });
    
    if (result.success) {
        console.log('Note typed successfully');
    }
}
```

## Monitoreo y métricas

```typescript
// Obtener métricas de la sesión
function logMetrics() {
    const metrics = linkedInBrowser.getMetrics();
    console.log({
        totalRequests: metrics.totalRequests,
        blockedRequests: metrics.blockedRequests,
        captchasDetected: metrics.captchasDetected,
        rateLimitsHit: metrics.rateLimitsHit,
        averageResponseTime: metrics.averageResponseTime,
        sessionUptime: metrics.sessionUptime,
    });
}
```

## Eventos

```typescript
// Escuchar eventos del navegador
linkedInBrowser.on('captcha', (data) => {
    console.error(`CAPTCHA detected on ${data.url}`);
    // Enviar alerta al usuario
});

linkedInBrowser.on('rateLimit', (data) => {
    console.warn(`Rate limit hit: ${data.status}`);
});

linkedInBrowser.on('blocked', (data) => {
    console.error(`Access blocked: ${data.url}`);
});

linkedInBrowser.on('disconnected', () => {
    console.log('Browser disconnected');
});
```

## Rotación de sesión

```typescript
// Rotar sesión (cambiar User Agent, viewport, etc.)
async function rotateSession() {
    await linkedInBrowser.rotateSession(false);
    console.log('Session rotated successfully');
}
```

## Cierre seguro

```typescript
async function shutdown() {
    await linkedInBrowser.close();
    console.log('Browser closed');
}
```

## Ejemplo completo: Procesar perfil

```typescript
async function processProfile(profileUrl: string) {
    try {
        // 1. Inicializar si es necesario
        if (!linkedInBrowser.isReady()) {
            await linkedInBrowser.initialize(false);
        }

        // 2. Navegar al perfil
        const navResult = await linkedInBrowser.navigate(profileUrl);
        if (!navResult.success) {
            throw new Error(`Navigation failed: ${navResult.error}`);
        }

        // 3. Esperar carga natural
        await linkedInBrowser.humanDelay(2000, 4000);

        // 4. Hacer click en Connect
        const clickResult = await linkedInBrowser.humanClick('button[aria-label="Connect"]');
        if (!clickResult.success) {
            console.log('Connect button not found or not clickable');
        }

        // 5. Agregar nota personalizada (opcional)
        await linkedInBrowser.humanDelay(500, 1000);
        await linkedInBrowser.humanClick('button[aria-label="Add a note"]');
        await linkedInBrowser.humanType('textarea#custom-message', 'Hola, me gustaría conectar...');

        // 6. Enviar invitación
        await linkedInBrowser.humanClick('button[aria-label="Send invitation"]');

        // 7. Log de métricas
        logMetrics();

    } catch (error) {
        console.error('Error processing profile:', error);
        
        // Rotar sesión si hay demasiados errores
        const metrics = linkedInBrowser.getMetrics();
        if (metrics.blockedRequests > 3) {
            await linkedInBrowser.rotateSession(false);
        }
    }
}
```

## Configuraciones de retry

```typescript
import { 
    DEFAULT_RETRY_CONFIG,   // 3 retries, base 2s
    STRICT_RETRY_CONFIG,    // 5 retries, base 5s
    AGGRESSIVE_RETRY_CONFIG // 2 retries, base 1s
} from './linkedin.browser';

// Custom retry config
const customConfig = {
    maxRetries: 4,
    baseDelayMs: 3000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
    retryableErrors: [
        'timeout',
        'net::',
        'Navigation failed',
        // ... add more
    ],
    onRetry: (attempt, error, delay) => {
        console.log(`Retry ${attempt}: ${error.message} (waiting ${delay}ms)`);
    },
};
```
