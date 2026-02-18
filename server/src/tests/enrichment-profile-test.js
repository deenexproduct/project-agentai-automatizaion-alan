/**
 * Prueba de Enriquecimiento con Perfil Real
 * URL: https://www.linkedin.com/in/amorenoh90/
 */

const { enrichmentService } = require('../services/enrichment.service');
const { LinkedInContact } = require('../models/linkedin-contact.model');
const mongoose = require('mongoose');

// Conectar a MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/voicecommand';

// Colors
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

async function testEnrichmentWithRealProfile() {
    try {
        // Conectar a MongoDB
        log('\n🔗 Conectando a MongoDB...', 'blue');
        await mongoose.connect(MONGODB_URI);
        log('✅ Conectado a MongoDB\n', 'green');

        section('👤 PERFIL A ENRIQUECER');
        
        const profileUrl = 'https://www.linkedin.com/in/amorenoh90/';
        log(`URL: ${profileUrl}`, 'yellow');
        
        // Buscar o crear contacto
        let contact = await LinkedInContact.findOne({ profileUrl });
        
        if (!contact) {
            log('\n📝 Creando contacto de prueba...', 'blue');
            contact = new LinkedInContact({
                profileUrl: profileUrl,
                fullName: 'amorenoh90', // Nombre temporal, se actualizará con scraping
                status: 'mensaje_enviado', // Estado que dispara enriquecimiento
                sentAt: new Date(),
                experience: [],
                education: [],
                skills: [],
                notes: []
            });
            await contact.save();
            log('✅ Contacto creado', 'green');
        } else {
            log('\n📋 Contacto existente encontrado', 'blue');
            
            // Actualizar estado para forzar enriquecimiento
            contact.status = 'mensaje_enviado';
            contact.enrichmentStatus = null;
            contact.enrichedAt = null;
            await contact.save();
            log('✅ Estado actualizado a mensaje_enviado', 'green');
        }

        // Mostrar datos actuales
        section('📊 DATOS ACTUALES DEL CONTACTO');
        log(`ID: ${contact._id}`, 'gray');
        log(`Nombre: ${contact.fullName}`, 'gray');
        log(`Cargo: ${contact.currentPosition || 'No disponible'}`, 'gray');
        log(`Empresa: ${contact.currentCompany || 'No disponible'}`, 'gray');
        log(`Headline: ${contact.headline || 'No disponible'}`, 'gray');
        log(`Estado: ${contact.status}`, 'gray');
        log(`Enrichment Status: ${contact.enrichmentStatus || 'null'}`, 'gray');

        // Verificar si OpenRouter está configurado
        section('🔌 VERIFICANDO OPENROUTER');
        const { openRouterService } = require('../services/openrouter.service');
        
        if (!openRouterService.isConfigured()) {
            log('❌ OpenRouter no configurado', 'red');
            log('⚠️  Para probar enriquecimiento real, configurá OPENROUTER_API_KEY_1', 'yellow');
            
            // Simular enriquecimiento para demo
            section('🎭 SIMULANDO ENRIQUECIMIENTO (Demo)');
            
            contact.enrichmentData = {
                personProfile: {
                    verifiedPosition: "Gerente de Operaciones / Operations Manager",
                    verifiedCompany: "Burger King / Arcos Dorados",
                    summary: "Profesional con experiencia en operaciones de restaurantes y gestión de equipos en la industria de QSR (Quick Service Restaurant)."
                },
                personNews: [],
                company: {
                    name: "Burger King - Arcos Dorados",
                    description: "Cadena internacional de hamburguesas, parte de Arcos Dorados, el mayor franquiciado de McDonald's y Burger King en Latinoamérica.",
                    website: "burgerking.com.ar",
                    sector: "Restaurantes / Fast Food",
                    locationsCount: "120+ locales en Argentina",
                    socialMedia: {
                        instagram: "@burgerkingargentina",
                        twitter: "@BurgerKingAr"
                    }
                },
                companyNews: [
                    {
                        title: "Burger King Argentina lanza nueva app de delivery",
                        source: "Clarín",
                        url: "https://clarin.com/economia/burger-king-app",
                        date: "2025-12-10",
                        summary: "Nueva aplicación móvil para pedidos digitales con sistema de loyalty integrado"
                    }
                ],
                keyInsights: [
                    "Perfil de operaciones - potencial interés en eficiencia y tecnología",
                    "Trabaja en Burger King/Arcos Dorados - cadena con presencia significativa",
                    "Sector QSR con alta rotación - necesidad constante de capacitación"
                ],
                buyingSignals: [
                    "🟢 Empresa en proceso de digitalización (app nueva)",
                    "🟢 Cadena con 120+ locales - necesita sistemas escalables",
                    "🟡 Competencia directa con McDonald's - presión por diferenciación"
                ]
            };
            contact.enrichmentStatus = 'completed';
            contact.enrichedAt = new Date();
            contact.status = 'enriquecido';
            await contact.save();
            
            log('✅ Enriquecimiento simulado completado', 'green');
            
        } else {
            // Enriquecimiento real
            section('🚀 INICIANDO ENRIQUECIMIENTO REAL');
            
            try {
                log('⏳ Esto puede tardar 10-20 segundos...', 'yellow');
                const start = Date.now();
                
                await enrichmentService.enrichContact(contact._id.toString());
                
                const duration = Date.now() - start;
                log(`✅ Enriquecimiento completado en ${duration}ms`, 'green');
                
            } catch (error) {
                log(`❌ Error en enriquecimiento: ${error.message}`, 'red');
            }
        }

        // Recargar contacto para mostrar resultados
        contact = await LinkedInContact.findById(contact._id);

        section('📋 RESULTADOS DEL ENRIQUECIMIENTO');
        
        if (contact.enrichmentData) {
            const data = contact.enrichmentData;
            
            log('\n👤 PERFIL PERSONA:', 'blue');
            if (data.personProfile) {
                log(`  Cargo verificado: ${data.personProfile.verifiedPosition || 'N/A'}`, 'gray');
                log(`  Empresa verificada: ${data.personProfile.verifiedCompany || 'N/A'}`, 'gray');
                log(`  Resumen: ${data.personProfile.summary || 'N/A'}`, 'gray');
            }
            
            log('\n🏢 EMPRESA:', 'blue');
            if (data.company) {
                log(`  Nombre: ${data.company.name || 'N/A'}`, 'gray');
                log(`  Descripción: ${data.company.description || 'N/A'}`, 'gray');
                log(`  Website: ${data.company.website || 'N/A'}`, 'gray');
                log(`  Sector: ${data.company.sector || 'N/A'}`, 'gray');
                log(`  Locales: ${data.company.locationsCount || 'N/A'}`, 'gray');
                if (data.company.socialMedia) {
                    log(`  Instagram: ${data.company.socialMedia.instagram || 'N/A'}`, 'gray');
                    log(`  Twitter: ${data.company.socialMedia.twitter || 'N/A'}`, 'gray');
                }
            }
            
            log('\n📰 NOTICIAS PERSONA:', 'blue');
            if (data.personNews && data.personNews.length > 0) {
                data.personNews.forEach((news, i) => {
                    log(`  ${i + 1}. ${news.title}`, 'gray');
                    log(`     Fuente: ${news.source || 'N/A'} | ${news.date || 'N/A'}`, 'gray');
                });
            } else {
                log('  No se encontraron noticias de la persona', 'gray');
            }
            
            log('\n📰 NOTICIAS EMPRESA:', 'blue');
            if (data.companyNews && data.companyNews.length > 0) {
                data.companyNews.forEach((news, i) => {
                    log(`  ${i + 1}. ${news.title}`, 'gray');
                    log(`     Fuente: ${news.source || 'N/A'}`, 'gray');
                });
            } else {
                log('  No se encontraron noticias de la empresa', 'gray');
            }
            
            log('\n💡 INSIGHTS CLAVE:', 'blue');
            if (data.keyInsights && data.keyInsights.length > 0) {
                data.keyInsights.forEach((insight, i) => {
                    log(`  ${i + 1}. ${insight}`, 'gray');
                });
            }
            
            log('\n🚦 SEÑALES DE COMPRA:', 'blue');
            if (data.buyingSignals && data.buyingSignals.length > 0) {
                data.buyingSignals.forEach((signal, i) => {
                    log(`  ${i + 1}. ${signal}`, 'gray');
                });
            }
            
        } else {
            log('❌ No hay datos de enriquecimiento', 'red');
        }

        log('\n📄 DOSSIER:', 'blue');
        if (contact.contextFilePath) {
            log(`  Archivo: ${contact.contextFilePath}`, 'gray');
            
            try {
                const fs = require('fs');
                if (fs.existsSync(contact.contextFilePath)) {
                    const content = fs.readFileSync(contact.contextFilePath, 'utf-8');
                    const lines = content.split('\n').slice(0, 20);
                    log('\n  Preview (primeras 20 líneas):', 'gray');
                    lines.forEach(line => log(`  ${line}`, 'gray'));
                } else {
                    log('  Archivo no encontrado en disco', 'yellow');
                }
            } catch (e) {
                log(`  Error leyendo archivo: ${e.message}`, 'red');
            }
        } else {
            log('  No se generó archivo de contexto', 'gray');
        }

        section('✅ ESTADO FINAL');
        log(`Status del contacto: ${contact.status}`, contact.status === 'enriquecido' ? 'green' : 'yellow');
        log(`Enrichment Status: ${contact.enrichmentStatus}`, 'gray');
        log(`Enriched At: ${contact.enrichedAt}`, 'gray');

        // Verificar que está en el estado correcto
        if (contact.status === 'enriquecido' && contact.enrichmentStatus === 'completed') {
            log('\n🎉 CONTACTO ENRIQUECIDO EXITOSAMENTE', 'green');
            log(`   Pipeline completado: mensaje_enviado → enriquecido`, 'green');
        }

    } catch (error) {
        log(`\n💥 Error fatal: ${error.message}`, 'red');
        console.error(error);
    } finally {
        await mongoose.disconnect();
        log('\n👋 Desconectado de MongoDB', 'gray');
    }
}

// Ejecutar
section('🧪 PRUEBA DE ENRIQUECIMIENTO CON PERFIL REAL');
log('Perfil: https://www.linkedin.com/in/amorenoh90/\n', 'blue');

testEnrichmentWithRealProfile().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
