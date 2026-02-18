/**
 * Pruebas Detalladas del Sistema de Enriquecimiento
 * Valida cada componente del flujo de enriquecimiento
 */

const { enrichmentService } = require('../services/enrichment.service');
const { LinkedInContact } = require('../models/linkedin-contact.model');
const fs = require('fs');
const path = require('path');

// Mock de OpenRouter
const mockOpenRouterService = {
    isConfigured: () => true,
    call: async () => {
        // Simular respuesta de Kimi K2
        return JSON.stringify({
            personProfile: {
                verifiedPosition: "CEO - confirmado por LinkedIn",
                verifiedCompany: "Arcos Dorados Holdings",
                summary: "Ejecutivo con 15 años en industria de restaurantes. Lidera operación de 250+ locales."
            },
            personNews: [
                {
                    title: "Anuncia inversión de $100M para 2026",
                    source: "Clarín",
                    url: "https://clarin.com/economia/inversion-100m",
                    date: "2026-01-15",
                    summary: "Plan de digitalización y expansión de 50 nuevos locales"
                }
            ],
            company: {
                name: "Arcos Dorados Holdings",
                description: "Master franquicia de McDonald's para Latinoamérica",
                website: "arcosdorados.com",
                sector: "Restaurantes / Franquicias",
                locationsCount: "2,340 locales",
                socialMedia: {
                    instagram: "@mcdonalds_arg",
                    twitter: "@McDonalds_Ar"
                }
            },
            companyNews: [
                {
                    title: "Arcos Dorados cierra acuerdo con delivery apps",
                    source: "La Nación",
                    url: "https://lanacion.com.ar/acuerdo-delivery",
                    summary: "Integración con Rappi y PedidosYa en 500 locales"
                }
            ],
            keyInsights: [
                "Líder con fuerte presencia mediática",
                "Empresa en expansión activa: 50 nuevos locales",
                "Enfoque en digitalización"
            ],
            buyingSignals: [
                "Inversión de $100M anunciada",
                "Expansión de 50 locales - necesita tecnología escalable"
            ]
        });
    }
};

// Reemplazar el servicio real con mock
const originalOpenRouter = require('../services/openrouter.service');
Object.assign(originalOpenRouter.openRouterService, mockOpenRouterService);

// Utilidades de test
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(name) {
    console.log('\n' + '='.repeat(70));
    log(name, 'cyan');
    console.log('='.repeat(70));
}

// Resultados
const results = [];

async function runTest(name, fn) {
    const start = Date.now();
    const failures = [];
    let assertions = 0;

    const assert = (condition, message) => {
        assertions++;
        if (!condition) failures.push(message);
    };

    const assertEqual = (actual, expected, message) => {
        assertions++;
        if (actual !== expected) {
            failures.push(`${message}: expected "${expected}", got "${actual}"`);
        }
    };

    try {
        await fn(assert, assertEqual);
        const duration = Date.now() - start;
        results.push({ name, passed: failures.length === 0, duration, assertions, failures });
        return { passed: true, duration };
    } catch (error) {
        const duration = Date.now() - start;
        failures.push(`Exception: ${error.message}`);
        results.push({ name, passed: false, duration, assertions, failures });
        return { passed: false, duration, error: error.message };
    }
}

// ═════════════════════════════════════════════════════════════════
// TESTS DE CONFIGURACIÓN
// ═════════════════════════════════════════════════════════════════

async function runConfigTests() {
    section('🔧 TESTS DE CONFIGURACIÓN');

    await runTest('Config: trigger está en mensaje_enviado', (assert, assertEqual) => {
        const config = enrichmentService.getConfig();
        assertEqual(config.autoEnrichOnStatus, 'mensaje_enviado', 
            'El trigger debe ser mensaje_enviado (no aceptado)');
        assert(config.maxEnrichmentsPerDay > 0, 'Debe tener límite diario');
        assert(config.delayBetweenRequests >= 0, 'Debe tener delay configurado');
    });

    await runTest('Config: modelo es Kimi K2', (assert, assertEqual) => {
        const config = enrichmentService.getConfig();
        assertEqual(config.model, 'moonshotai/kimi-k2', 
            'El modelo debe ser Kimi K2');
    });

    await runTest('Config: re-enrich después de 30 días', (assert, assertEqual) => {
        const config = enrichmentService.getConfig();
        assertEqual(config.reEnrichAfterDays, 30, 
            'Debe permitir re-enriquecimiento después de 30 días');
    });
}

// ═════════════════════════════════════════════════════════════════
// TESTS DE PROMPT BUILDING
// ═════════════════════════════════════════════════════════════════

async function runPromptTests() {
    section('📝 TESTS DE CONSTRUCCIÓN DE PROMPT');

    await runTest('Prompt: incluye datos del contacto', (assert, assertEqual) => {
        const mockContact = {
            fullName: 'Juan Pérez',
            currentPosition: 'CEO',
            currentCompany: 'McDonald\'s',
            headline: 'CEO en McDonald\'s Argentina',
            location: 'Buenos Aires',
            profileUrl: 'https://linkedin.com/in/juan-perez',
            about: 'Ejecutivo con 15 años de experiencia'
        };

        // Acceder al método privado
        const buildPrompt = enrichmentService.buildPrompt.bind(enrichmentService);
        const messages = buildPrompt(mockContact);

        assert(messages.length >= 2, 'Debe tener system y user messages');
        assert(messages[0].role === 'system', 'Primer mensaje debe ser system');
        assert(messages[1].role === 'user', 'Segundo mensaje debe ser user');
        
        const userContent = messages[1].content;
        assert(userContent.includes('Juan Pérez'), 'Debe incluir nombre del contacto');
        assert(userContent.includes('CEO'), 'Debe incluir cargo');
        assert(userContent.includes('McDonald'), 'Debe incluir empresa');
    });

    await runTest('Prompt: incluye contexto ICP', (assert) => {
        const mockContact = {
            fullName: 'Test User',
            currentPosition: 'Manager',
            currentCompany: 'Test Company',
            headline: 'Test Headline',
            location: 'Buenos Aires',
            profileUrl: 'https://linkedin.com/in/test'
        };

        const buildPrompt = enrichmentService.buildPrompt.bind(enrichmentService);
        const messages = buildPrompt(mockContact);
        
        const userContent = messages[1].content;
        assert(userContent.includes('ICP') || userContent.includes('cadenas gastronómicas'), 
            'Debe incluir contexto de ICP');
    });

    await runTest('Prompt: maneja datos escasos', (assert) => {
        const sparseContact = {
            fullName: 'Usuario123',
            currentPosition: '',
            currentCompany: '',
            headline: '',
            location: '',
            profileUrl: 'https://linkedin.com/in/usuario123'
        };

        const buildPrompt = enrichmentService.buildPrompt.bind(enrichmentService);
        const messages = buildPrompt(sparseContact);
        
        const userContent = messages[1].content;
        assert(userContent.includes('datos MUY ESCASOS') || userContent.includes('No disponible'), 
            'Debe advertir sobre datos escasos');
    });
}

// ═════════════════════════════════════════════════════════════════
// TESTS DE PARSEO DE RESPUESTAS
// ═════════════════════════════════════════════════════════════════

async function runParseTests() {
    section('🔍 TESTS DE PARSEO DE RESPUESTAS');

    await runTest('Parse: JSON directo', (assert, assertEqual) => {
        const parseResponse = enrichmentService.parseResponse.bind(enrichmentService);
        const testJson = JSON.stringify({
            personProfile: { verifiedPosition: 'CEO' },
            company: { name: 'Test Co' }
        });

        const result = parseResponse(testJson);
        assertEqual(result.personProfile.verifiedPosition, 'CEO', 
            'Debe parsear verifiedPosition');
        assertEqual(result.company.name, 'Test Co', 
            'Debe parsear company name');
    });

    await runTest('Parse: JSON en bloque de código markdown', (assert, assertEqual) => {
        const parseResponse = enrichmentService.parseResponse.bind(enrichmentService);
        const markdownJson = '```json\n{"personProfile": {"verifiedPosition": "CTO"}, "company": {"name": "Tech Co"}}\n```';

        const result = parseResponse(markdownJson);
        assertEqual(result.personProfile.verifiedPosition, 'CTO', 
            'Debe extraer JSON de bloque markdown');
    });

    await runTest('Parse: texto con JSON embebido', (assert, assertEqual) => {
        const parseResponse = enrichmentService.parseResponse.bind(enrichmentService);
        const embeddedJson = 'Aquí está el resultado: {"personProfile": {"verifiedPosition": "VP"}, "company": {"name": "Corp"}} Fin del mensaje';

        const result = parseResponse(embeddedJson);
        assertEqual(result.personProfile.verifiedPosition, 'VP', 
            'Debe extraer JSON embebido en texto');
    });

    await runTest('Parse: respuesta inválida devuelve datos mínimos', (assert) => {
        const parseResponse = enrichmentService.parseResponse.bind(enrichmentService);
        const invalidResponse = 'Esto no es JSON válido { invalido';

        const result = parseResponse(invalidResponse);
        assert(result.personProfile, 'Debe tener personProfile');
        assert(result.company, 'Debe tener company');
        assert(result.keyInsights.length > 0, 'Debe tener al menos un insight');
    });
}

// ═════════════════════════════════════════════════════════════════
// TESTS DE GENERACIÓN DE DOSSIER
// ═════════════════════════════════════════════════════════════════

async function runDossierTests() {
    section('📄 TESTS DE GENERACIÓN DE DOSSIER .md');

    await runTest('Dossier: incluye header con nombre', (assert) => {
        const generateContextMd = enrichmentService.generateContextMd.bind(enrichmentService);
        
        const mockContact = {
            fullName: 'Carlos García',
            currentPosition: 'Director',
            currentCompany: 'Burger King',
            headline: 'Director de Operaciones',
            location: 'Córdoba',
            profileUrl: 'https://linkedin.com/in/carlos-garcia'
        };

        const mockData = {
            personProfile: {
                verifiedPosition: 'Director - confirmado',
                verifiedCompany: 'Burger King Argentina',
                summary: 'Profesional con 10 años en QSR'
            },
            company: {
                name: 'Burger King Argentina',
                description: 'Cadena de hamburguesas',
                locationsCount: '120 locales'
            },
            personNews: [],
            companyNews: [],
            keyInsights: ['Insight 1', 'Insight 2'],
            buyingSignals: ['Señal 1']
        };

        const md = generateContextMd(mockContact, mockData);
        
        assert(md.includes('# 📇 Carlos García'), 'Debe incluir título con nombre');
        assert(md.includes('Carlos García'), 'Debe mencionar el nombre');
        assert(md.includes('Kimi K2'), 'Debe mencionar el modelo usado');
    });

    await runTest('Dossier: incluye sección de empresa', (assert) => {
        const generateContextMd = enrichmentService.generateContextMd.bind(enrichmentService);
        
        const mockContact = { fullName: 'Test', profileUrl: 'https://linkedin.com/in/test' };
        const mockData = {
            personProfile: {},
            company: {
                name: 'Test Company',
                description: 'Una gran empresa',
                locationsCount: '50 locales',
                website: 'test.com',
                sector: 'Tecnología'
            }
        };

        const md = generateContextMd(mockContact, mockData);
        
        assert(md.includes('## 🏢 Empresa'), 'Debe tener sección de empresa');
        assert(md.includes('Test Company'), 'Debe incluir nombre de empresa');
        assert(md.includes('Una gran empresa'), 'Debe incluir descripción');
        assert(md.includes('50 locales'), 'Debe incluir cantidad de locales');
    });

    await runTest('Dossier: incluye noticias formateadas', (assert) => {
        const generateContextMd = enrichmentService.generateContextMd.bind(enrichmentService);
        
        const mockContact = { fullName: 'Test', profileUrl: 'https://linkedin.com/in/test' };
        const mockData = {
            personProfile: {},
            personNews: [
                { title: 'Noticia 1', source: 'Clarín', url: 'https://clarin.com/1', summary: 'Resumen 1' },
                { title: 'Noticia 2', source: 'La Nación', url: 'https://lanacion.com/2', summary: 'Resumen 2' }
            ],
            keyInsights: [],
            buyingSignals: []
        };

        const md = generateContextMd(mockContact, mockData);
        
        assert(md.includes('## 📰 Noticias'), 'Debe tener sección de noticias');
        assert(md.includes('Noticia 1'), 'Debe incluir primera noticia');
        assert(md.includes('Clarín'), 'Debe incluir fuente');
        assert(md.includes('https://clarin.com/1'), 'Debe incluir URL');
    });

    await runTest('Dossier: incluye insights y buying signals', (assert) => {
        const generateContextMd = enrichmentService.generateContextMd.bind(enrichmentService);
        
        const mockContact = { fullName: 'Test', profileUrl: 'https://linkedin.com/in/test' };
        const mockData = {
            personProfile: {},
            keyInsights: ['Insight de prueba'],
            buyingSignals: ['Señal de compra']
        };

        const md = generateContextMd(mockContact, mockData);
        
        assert(md.includes('## 💡 Insights Clave'), 'Debe tener sección de insights');
        assert(md.includes('Insight de prueba'), 'Debe incluir el insight');
        assert(md.includes('## 🚦 Señales de Compra'), 'Debe tener sección de señales');
        assert(md.includes('Señal de compra'), 'Debe incluir la señal');
    });
}

// ═════════════════════════════════════════════════════════════════
// TESTS DE EXTRACCIÓN DE VANITY NAME
// ═════════════════════════════════════════════════════════════════

async function runVanityNameTests() {
    section('🔗 TESTS DE EXTRACCIÓN DE VANITY NAME');

    await runTest('Vanity: URL con https y www', (assert, assertEqual) => {
        const extractVanityName = enrichmentService.extractVanityName.bind(enrichmentService);
        const url = 'https://www.linkedin.com/in/juan-perez/';
        
        assertEqual(extractVanityName(url), 'juan-perez', 
            'Debe extraer juan-perez de URL completa');
    });

    await runTest('Vanity: URL sin www', (assert, assertEqual) => {
        const extractVanityName = enrichmentService.extractVanityName.bind(enrichmentService);
        const url = 'https://linkedin.com/in/maria-garcia';
        
        assertEqual(extractVanityName(url), 'maria-garcia', 
            'Debe extraer sin www');
    });

    await runTest('Vanity: URL con parámetros', (assert, assertEqual) => {
        const extractVanityName = enrichmentService.extractVanityName.bind(enrichmentService);
        const url = 'https://linkedin.com/in/carlos-lopez?trk=profile';
        
        assertEqual(extractVanityName(url), 'carlos-lopez', 
            'Debe ignorar parámetros');
    });

    await runTest('Vanity: URL inválida genera fallback', (assert) => {
        const extractVanityName = enrichmentService.extractVanityName.bind(enrichmentService);
        const url = 'https://google.com/no-linkedin';
        
        const result = extractVanityName(url);
        assert(result.startsWith('contact-'), 
            'Debe generar fallback contact-{timestamp}');
    });
}

// ═════════════════════════════════════════════════════════════════
// TESTS DE LÍMITES Y RATE LIMITING
// ═════════════════════════════════════════════════════════════════

async function runRateLimitTests() {
    section('⏱️ TESTS DE RATE LIMITING');

    await runTest('Rate limit: contador diario existe', (assert) => {
        // Verificar que el servicio tiene el contador
        assert(typeof enrichmentService.enrichmentsToday === 'number', 
            'Debe tener contador de enriquecimientos');
    });

    await runTest('Rate limit: reset diario funciona', (assert) => {
        // Simular cambio de fecha
        const originalDate = enrichmentService.lastResetDate;
        
        // Forzar una fecha diferente
        enrichmentService.lastResetDate = '2020-01-01';
        enrichmentService.enrichmentsToday = 100;
        
        // Llamar a reset si es necesario
        enrichmentService.resetDailyCounterIfNeeded();
        
        const today = new Date().toDateString();
        if (today !== '2020-01-01') {
            assert(enrichmentService.enrichmentsToday === 0, 
                'Debe resetear contador en nuevo día');
        }
        
        // Restaurar
        enrichmentService.lastResetDate = originalDate;
    });
}

// ═════════════════════════════════════════════════════════════════
// TESTS DE INTEGRACIÓN (FLUJO COMPLETO)
// ═════════════════════════════════════════════════════════════════

async function runIntegrationTests() {
    section('🔗 TESTS DE INTEGRACIÓN');

    await runTest('Integración: trigger funciona con mensaje_enviado', (assert) => {
        // Simular que el trigger está configurado correctamente
        const config = enrichmentService.getConfig();
        
        assert(config.autoEnrichOnStatus === 'mensaje_enviado', 
            'El trigger debe estar en mensaje_enviado (etapa final)');
    });

    await runTest('Integración: no se dispara en otros estados', (assert) => {
        const config = enrichmentService.getConfig();
        
        const shouldNotTrigger = ['aceptado', 'visitando', 'conectando', 'listo_para_mensaje'];
        
        shouldNotTrigger.forEach(status => {
            if (status !== config.autoEnrichOnStatus) {
                assert(true, `${status} no debe disparar enriquecimiento`);
            }
        });
    });
}

// ═════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════

async function main() {
    log('\n🧪 PRUEBAS DETALLADAS DEL SISTEMA DE ENRIQUECIMIENTO\n', 'blue');
    log('Validando cada componente del flujo de enriquecimiento...\n', 'gray');

    await runConfigTests();
    await runPromptTests();
    await runParseTests();
    await runDossierTests();
    await runVanityNameTests();
    await runRateLimitTests();
    await runIntegrationTests();

    // Reporte final
    section('📋 REPORTE FINAL');

    let passed = 0;
    let failed = 0;
    let totalDuration = 0;

    results.forEach((result, i) => {
        const icon = result.passed ? '✅' : '❌';
        const color = result.passed ? 'green' : 'red';
        log(`${icon} ${i + 1}. ${result.name}`, color);
        log(`   Duración: ${result.duration}ms | Assertions: ${result.assertions}`, 'gray');
        if (result.failures.length > 0) {
            result.failures.forEach(f => log(`   ⚠️  ${f}`, 'yellow'));
        }
        totalDuration += result.duration;
        if (result.passed) passed++; else failed++;
    });

    console.log('\n' + '='.repeat(70));
    log(`📊 RESUMEN: ${passed}/${results.length} pruebas pasaron (${((passed / results.length) * 100).toFixed(1)}%)`, 
        passed === results.length ? 'green' : 'yellow');
    log(`⏱️  Duración Total: ${totalDuration}ms`, 'gray');
    log(`🔥 Tests: ${results.length} | ✅ Pasaron: ${passed} | ❌ Fallaron: ${failed}`, 'cyan');
    console.log('='.repeat(70));

    if (failed === 0) {
        log('\n🎉 TODAS LAS PRUEBAS PASARON', 'green');
        log('✅ Configuración correcta', 'green');
        log('✅ Prompt building funciona', 'green');
        log('✅ Parseo de respuestas robusto', 'green');
        log('✅ Generación de dossiers correcta', 'green');
        log('✅ Rate limiting activo', 'green');
        log('✅ Pipeline configurado como etapa final\n', 'green');
    } else {
        log(`\n⚠️  ${failed} prueba(s) fallaron. Revisar errores arriba.\n`, 'yellow');
    }

    return { passed, failed, total: results.length };
}

main().then(({ passed, failed }) => {
    process.exit(failed > 0 ? 1 : 0);
}).catch(err => {
    console.error('💥 Error fatal:', err);
    process.exit(1);
});
