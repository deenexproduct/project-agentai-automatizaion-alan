/**
 * El digest semanal: qué se está enfriando y qué compromisos vencieron.
 *
 * La regla que importa: un deal "se enfría" si AVANZÓ alguna vez y después se
 * quedó quieto. Un lead que nunca se movió no es una oportunidad enfriándose,
 * es un lead frío — mezclarlos convierte el mensaje en una lista inútil de 123.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { calcularDigest } from '../../services/digest/pipeline-digest.service';
import { Company } from '../../models/company.model';
import { Deal } from '../../models/deal.model';
import { Task } from '../../models/task.model';

let mongo: MongoMemoryServer;
const USER = new mongoose.Types.ObjectId();
const AHORA = new Date('2026-08-03T12:00:00Z');
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 864e5);

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
});
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
afterEach(async () => {
    for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({});
});

async function empresa(name: string) {
    return Company.create({ name, userId: USER, assignedTo: USER });
}

async function deal(opts: {
    empresa: any; valor?: number; status?: string; avanzo?: boolean; quietoHace?: number;
}) {
    const { empresa, valor = 1000, status = 'seguimiento', avanzo = true, quietoHace = 30 } = opts;
    const historia = avanzo
        ? [{ from: 'lead', to: 'contactado', changedAt: hace(quietoHace + 40), changedBy: USER },
           { from: 'contactado', to: status, changedAt: hace(quietoHace), changedBy: USER }]
        : [];
    return Deal.create({
        title: empresa.name, company: empresa._id, value: valor, currency: 'USD',
        status, statusHistory: historia, userId: USER, assignedTo: USER,
    });
}

describe('calcularDigest — deals enfriándose', () => {
    it('incluye un deal que avanzó y hace más de 14 días que no se mueve', async () => {
        const e = await empresa('Bonafide');
        await deal({ empresa: e, valor: 9800, quietoHace: 128 });

        const d = await calcularDigest(String(USER), AHORA);

        expect(d.enfriandose).toHaveLength(1);
        expect(d.enfriandose[0].empresa).toBe('Bonafide');
        expect(d.enfriandose[0].diasQuieto).toBe(128);
        expect(d.enfriandose[0].valor).toBe(9800);
    });

    it('NO incluye un deal que se movió hace poco', async () => {
        const e = await empresa('Recién Movida');
        await deal({ empresa: e, quietoHace: 3 });

        const d = await calcularDigest(String(USER), AHORA);
        expect(d.enfriandose).toHaveLength(0);
    });

    it('NO incluye un lead que nunca avanzó — es frío, no se está enfriando', async () => {
        const e = await empresa('Nunca Avanzó');
        await deal({ empresa: e, status: 'lead', avanzo: false, quietoHace: 200 });

        const d = await calcularDigest(String(USER), AHORA);
        expect(d.enfriandose).toHaveLength(0);
    });

    it.each(['ganado', 'perdido', 'pausado'])('NO incluye los deals en "%s"', async (status) => {
        const e = await empresa(`Cerrada ${status}`);
        await deal({ empresa: e, status, quietoHace: 100 });

        const d = await calcularDigest(String(USER), AHORA);
        expect(d.enfriandose).toHaveLength(0);
    });

    it('ordena por valor y corta en el top, pero los totales cuentan TODOS', async () => {
        for (const [nombre, valor] of [['Chica', 500], ['Grande', 9000], ['Media', 3000], ['Mini', 100]] as const) {
            await deal({ empresa: await empresa(nombre), valor, quietoHace: 60 });
        }

        const d = await calcularDigest(String(USER), AHORA, { top: 2 });

        expect(d.enfriandose.map(x => x.empresa)).toEqual(['Grande', 'Media']);
        expect(d.totales.dealsFrios).toBe(4);
        expect(d.totales.usdCongelado).toBe(12600);
    });
});

describe('calcularDigest — compromisos vencidos', () => {
    it('incluye las tareas vencidas y no las cumplidas ni las canceladas', async () => {
        const e = await empresa('Lucciano\'s');
        await Task.create({ title: 'Seguimiento a Christian', company: e._id, status: 'pending',
            dueDate: hace(151), userId: USER, assignedTo: USER });
        await Task.create({ title: 'Ya la hice', company: e._id, status: 'completed',
            dueDate: hace(90), userId: USER, assignedTo: USER });
        await Task.create({ title: 'Cancelada', company: e._id, status: 'cancelled',
            dueDate: hace(90), userId: USER, assignedTo: USER });
        await Task.create({ title: 'Vence la semana que viene', company: e._id, status: 'pending',
            dueDate: new Date(AHORA.getTime() + 7 * 864e5), userId: USER, assignedTo: USER });

        const d = await calcularDigest(String(USER), AHORA);

        expect(d.compromisos).toHaveLength(1);
        expect(d.compromisos[0].titulo).toBe('Seguimiento a Christian');
        expect(d.compromisos[0].diasVencido).toBe(151);
        expect(d.compromisos[0].empresa).toBe('Lucciano\'s');
    });

    it('muestra primero las más viejas', async () => {
        const e = await empresa('Glout');
        await Task.create({ title: 'Nueva', company: e._id, status: 'pending', dueDate: hace(10), userId: USER, assignedTo: USER });
        await Task.create({ title: 'Vieja', company: e._id, status: 'pending', dueDate: hace(153), userId: USER, assignedTo: USER });

        const d = await calcularDigest(String(USER), AHORA);
        expect(d.compromisos.map(x => x.titulo)).toEqual(['Vieja', 'Nueva']);
    });
});

describe('calcularDigest — sin novedades', () => {
    it('devuelve listas vacías y totales en cero cuando no hay nada que avisar', async () => {
        const d = await calcularDigest(String(USER), AHORA);
        expect(d.enfriandose).toEqual([]);
        expect(d.compromisos).toEqual([]);
        expect(d.totales).toEqual({ dealsFrios: 0, usdCongelado: 0, compromisosVencidos: 0 });
    });
});

describe('calcularDigest — alcance de equipo', () => {
    it('junta los deals de varios miembros, no solo los de uno', async () => {
        const OTRO = new mongoose.Types.ObjectId();
        const mia = await Company.create({ name: 'Mía', userId: USER, assignedTo: USER });
        const suya = await Company.create({ name: 'Suya', userId: OTRO, assignedTo: OTRO });
        await Deal.create({ title: 'Mía', company: mia._id, value: 100, currency: 'USD', status: 'seguimiento',
            statusHistory: [{ from: 'lead', to: 'seguimiento', changedAt: hace(60), changedBy: USER }], userId: USER, assignedTo: USER });
        await Deal.create({ title: 'Suya', company: suya._id, value: 200, currency: 'USD', status: 'seguimiento',
            statusHistory: [{ from: 'lead', to: 'seguimiento', changedAt: hace(60), changedBy: OTRO }], userId: OTRO, assignedTo: OTRO });

        const solo = await calcularDigest(String(USER), AHORA);
        expect(solo.totales.dealsFrios).toBe(1);

        const equipo = await calcularDigest([String(USER), String(OTRO)], AHORA);
        expect(equipo.totales.dealsFrios).toBe(2);
        expect(equipo.totales.usdCongelado).toBe(300);
    });

    it('resuelve el nombre de una empresa cargada por otro miembro', async () => {
        const OTRO = new mongoose.Types.ObjectId();
        const suya = await Company.create({ name: 'Cargada Por Otro', userId: OTRO, assignedTo: OTRO });
        await Deal.create({ title: 'Titulo Feo - 26 feb 2026', company: suya._id, value: 500, currency: 'USD',
            status: 'seguimiento', statusHistory: [{ from: 'lead', to: 'seguimiento', changedAt: hace(60), changedBy: USER }],
            userId: USER, assignedTo: USER });

        const d = await calcularDigest(String(USER), AHORA);
        expect(d.enfriandose[0].empresa).toBe('Cargada Por Otro');
    });
});
