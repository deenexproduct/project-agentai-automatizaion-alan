/**
 * Seed Script — Deenex Data
 *
 * Pre-loads the Deenex client profile and 5 content pillars into MongoDB.
 * Run once: npx ts-node src/scripts/seed-deenex-data.ts
 *
 * Idempotent: uses upsert to avoid duplicates.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../db';
import { ClientProfile } from '../models/client-profile.model';
import { ContentPilar } from '../models/content-pilar.model';

const WORKSPACE_ID = process.env.DEFAULT_WORKSPACE_ID || 'default';

// ── Deenex Client Profile ─────────────────────────────────────

const DEENEX_PROFILE = {
    workspaceId: WORKSPACE_ID,
    identidad: {
        nombre: 'Alan',
        empresa: 'Deenex',
        rol: 'CEO',
        propuestaValor: 'Plataforma para cadenas multisucursal: app web propia + fidelización + datos propios. Sin comisiones de intermediarios.',
    },
    audiencia: {
        personaPrimaria: 'Dueños y gerentes de cadenas multisucursal (gastro, retail, farmacias, dietéticas)',
        personaSecundaria: 'Directores de marketing de franquicias',
        region: 'LATAM',
        industrias: ['gastronomía', 'retail', 'farmacias', 'dietéticas', 'franquicias'],
        dolores: [
            'Pagan 20-35% comisión a apps de delivery',
            'No tienen datos propios de sus clientes',
            'No pueden activar recurrencia ni fidelización',
            'Pierden control del canal de venta',
            'Dependen de intermediarios para llegar a sus clientes',
        ],
    },
    tono: {
        adjetivos: ['directo', 'seguro', 'práctico', 'conversacional', 'empático'],
        prohibiciones: ['sinergia', 'disruptivo', 'paradigma', 'revolucionario', 'game-changer'],
        referentes: [],
    },
    calendario: {
        frecuencia: '4-5 posts/semana',
        anticipacionRevision: '12h',
        formatosPreferidos: {
            text: 40,
            carousel: 25,
            image: 20,
            poll: 15,
        },
        zonaHoraria: 'America/Argentina/Buenos_Aires',
        horarioBase: '08:00',
    },
    visual: {
        coloresPrimarios: ['#1E1B4B', '#7C3AED', '#A855F7'],
        tipografia: 'Inter',
        estilosPreferidos: ['dark', 'modern', 'tech', 'clean'],
        estilosProhibidos: ['childish', 'handwritten', 'vintage'],
    },
    negocio: {
        productoFeatures: [
            'App Web con marca propia',
            'Base de datos propia accionable',
            'Programa de fidelización y puntos',
            'Clearing de pagos',
            'Dashboard multisucursal',
            'Campañas de activación push/email',
        ],
        eventosProximos: [],
        fuentesIndustria: [
            'Nation\'s Restaurant News',
            'Restaurant Business Online',
            'QSR Magazine',
            'RetailDive',
        ],
        casosExito: [
            'Coquitos — 100 locales',
            'La Fábrica — 70 locales',
            'Quem — 24 locales',
            'Somos Palta — 15 locales',
            'Monti — 10 locales',
        ],
    },
    nivelAutonomia: 'low' as const,
};

// ── Deenex Content Pillars (from estrategia.md) ───────────────

const DEENEX_PILARES = [
    {
        workspaceId: WORKSPACE_ID,
        nombre: 'Canal propio vs intermediarios',
        descripcion: 'Por qué las marcas deben ser dueñas de su canal de venta digital. El costo real de depender de marketplaces. Comparaciones concretas.',
        keywords: ['canal propio', 'comisiones', 'marketplace', 'delivery', 'independencia'],
        frecuenciaSemanal: 1,
        formatoPreferido: 'text',
        diasPreferidos: ['martes'],
        ejemplos: [
            'Pagás 25% de comisión en cada pedido. Con canal propio, ese margen es tuyo.',
        ],
    },
    {
        workspaceId: WORKSPACE_ID,
        nombre: 'Datos propios como ventaja competitiva',
        descripcion: 'El valor de tener base de datos accionable. Cómo activar clientes con datos propios. Data-driven decisions.',
        keywords: ['datos propios', 'base de datos', 'CRM', 'activación', 'data'],
        frecuenciaSemanal: 1,
        formatoPreferido: 'carousel',
        diasPreferidos: ['miércoles'],
        ejemplos: [
            '¿Sabés quién es tu mejor cliente? Si vendés por un intermediario, la respuesta es no.',
        ],
    },
    {
        workspaceId: WORKSPACE_ID,
        nombre: 'Caso de éxito / social proof',
        descripcion: 'Historias reales de clientes Deenex. Resultados concretos. Antes/después.',
        keywords: ['caso de éxito', 'resultados', 'ROI', 'clientes', 'testimonio'],
        frecuenciaSemanal: 1,
        formatoPreferido: 'image',
        diasPreferidos: ['jueves'],
        ejemplos: [
            'Coquitos pasó de 0 a canal propio en 100 locales con Deenex. Sin depender de nadie.',
        ],
    },
    {
        workspaceId: WORKSPACE_ID,
        nombre: 'Tendencia de la industria (hot take)',
        descripcion: 'Comentar noticias del sector con opinión propia. Posicionarse como thought leader. Generar debate.',
        keywords: ['tendencia', 'industria', 'opinión', 'futuro', 'hot take'],
        frecuenciaSemanal: 1,
        formatoPreferido: 'text',
        diasPreferidos: ['lunes'],
        ejemplos: [
            'Los marketplaces subieron comisiones otra vez. ¿Hasta cuándo las marcas van a regalar su margen?',
        ],
    },
    {
        workspaceId: WORKSPACE_ID,
        nombre: 'Fidelización y recurrencia',
        descripcion: 'Cómo lograr que los clientes vuelvan. Tácticas de retención. Programas de puntos. Engagement post-venta.',
        keywords: ['fidelización', 'recurrencia', 'retención', 'lealtad', 'puntos'],
        frecuenciaSemanal: 1,
        formatoPreferido: 'carousel',
        diasPreferidos: ['viernes'],
        ejemplos: [
            'Adquirir un cliente nuevo cuesta 5x más que retener uno existente. ¿Estás invirtiendo en retención?',
        ],
    },
];

// ── Main ──────────────────────────────────────────────────────

async function seed() {
    console.log('[Seed] Connecting to MongoDB...');
    await connectDB();

    // Upsert client profile
    console.log('[Seed] Upserting Deenex client profile...');
    await ClientProfile.findOneAndUpdate(
        { workspaceId: WORKSPACE_ID },
        DEENEX_PROFILE,
        { upsert: true, new: true }
    );
    console.log('[Seed] ✅ Client profile ready');

    // Upsert content pillars
    console.log('[Seed] Upserting content pillars...');
    for (const pilar of DEENEX_PILARES) {
        await ContentPilar.findOneAndUpdate(
            { workspaceId: pilar.workspaceId, nombre: pilar.nombre },
            pilar,
            { upsert: true, new: true }
        );
        console.log(`[Seed]   ✅ ${pilar.nombre}`);
    }

    console.log(`[Seed] 🎉 Done: 1 profile + ${DEENEX_PILARES.length} pillars seeded for workspace "${WORKSPACE_ID}"`);
    await mongoose.disconnect();
}

seed().catch((err) => {
    console.error('[Seed] ❌ Failed:', err);
    process.exit(1);
});
