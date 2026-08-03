/**
 * Tasas de conversión del embudo.
 *
 * El cálculo determina "hasta dónde llegó" un deal tomando el `order` MÁS ALTO
 * entre todas las etapas que tocó. El problema es que las etapas terminales
 * están al final del orden: perdido(9) y pausado(10) quedan POR ENCIMA de
 * coordinando(3), reuniones(5) y negociacion(6).
 *
 * Consecuencia: un deal que nunca salió de "lead" y se perdió cuenta como si
 * hubiera recorrido el embudo entero. Las conversiones SUBEN cuanto peor le va
 * al equipo — que es exactamente al revés de para qué sirve la métrica.
 */

jest.mock('../../services/linkedin.service', () => ({
    linkedinService: { getTenant: () => null },
}));

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import dashboardRoutes from '../../routes/dashboard.routes';
import { PipelineConfig } from '../../models/pipeline-config.model';
import { Deal } from '../../models/deal.model';
import { Company } from '../../models/company.model';
import '../../models/user.model';

let mongo: MongoMemoryServer;
let app: express.Express;
const USER_ID = new mongoose.Types.ObjectId();

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as any).user = { _id: USER_ID };
        next();
    });
    app.use('/api/dashboard', dashboardRoutes);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
});

afterEach(async () => {
    for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({});
});

/** Un deal que pasó de `lead` directo a la etapa final indicada. */
async function dealPerdidoDesdeLead(estadoFinal: string) {
    const empresa = await Company.create({ name: `E${Math.random()}`, userId: USER_ID, assignedTo: USER_ID });
    return Deal.create({
        title: 'Deal', status: estadoFinal, company: empresa._id,
        userId: USER_ID, assignedTo: USER_ID,
        statusHistory: [{ from: 'lead', to: estadoFinal, changedAt: new Date(), changedBy: USER_ID }],
    });
}

const conversiones = async () => {
    await PipelineConfig.getOrCreate(USER_ID.toString());
    const res = await request(app).get('/api/dashboard/metrics');
    return res.body.conversion;
};

describe('conversión del embudo', () => {
    it('deals que se perdieron sin salir de lead NO cuentan como avanzados', async () => {
        await dealPerdidoDesdeLead('perdido');
        await dealPerdidoDesdeLead('perdido');

        const c = await conversiones();

        expect(c.leadToCoordinando).toBe(0);
        expect(c.coordinandoToReunion).toBe(0);
        expect(c.reunionToNegociacion).toBe(0);
    });

    it('pausar un deal en lead tampoco lo hace avanzar', async () => {
        await dealPerdidoDesdeLead('pausado');

        const c = await conversiones();

        expect(c.leadToCoordinando).toBe(0);
    });

    it('perder un deal DESPUÉS de negociar sí conserva el avance real', async () => {
        const empresa = await Company.create({ name: 'Avanzada', userId: USER_ID, assignedTo: USER_ID });
        await Deal.create({
            title: 'Deal', status: 'perdido', company: empresa._id,
            userId: USER_ID, assignedTo: USER_ID,
            statusHistory: [
                { from: 'lead', to: 'coordinando', changedAt: new Date(), changedBy: USER_ID },
                { from: 'coordinando', to: 'reuniones', changedAt: new Date(), changedBy: USER_ID },
                { from: 'reuniones', to: 'negociacion', changedAt: new Date(), changedBy: USER_ID },
                { from: 'negociacion', to: 'perdido', changedAt: new Date(), changedBy: USER_ID },
            ],
        });

        const c = await conversiones();

        expect(c.leadToCoordinando).toBe(100);
        expect(c.coordinandoToReunion).toBe(100);
        expect(c.reunionToNegociacion).toBe(100);
    });

    it('un deal ganado cuenta como que recorrió todo el embudo', async () => {
        const empresa = await Company.create({ name: 'Ganada', userId: USER_ID, assignedTo: USER_ID });
        await Deal.create({
            title: 'Deal', status: 'ganado', company: empresa._id,
            userId: USER_ID, assignedTo: USER_ID,
            statusHistory: [
                { from: 'lead', to: 'negociacion', changedAt: new Date(), changedBy: USER_ID },
                { from: 'negociacion', to: 'ganado', changedAt: new Date(), changedBy: USER_ID },
            ],
        });

        const c = await conversiones();

        expect(c.leadToCoordinando).toBe(100);
        expect(c.reunionToNegociacion).toBe(100);
    });

    it('mezcla realista: 3 perdidos en lead y 1 que negoció → 25%, no 100%', async () => {
        await dealPerdidoDesdeLead('perdido');
        await dealPerdidoDesdeLead('perdido');
        await dealPerdidoDesdeLead('pausado');
        const empresa = await Company.create({ name: 'Sola', userId: USER_ID, assignedTo: USER_ID });
        await Deal.create({
            title: 'Deal', status: 'negociacion', company: empresa._id,
            userId: USER_ID, assignedTo: USER_ID,
            statusHistory: [{ from: 'lead', to: 'negociacion', changedAt: new Date(), changedBy: USER_ID }],
        });

        const c = await conversiones();

        expect(Math.round(c.leadToCoordinando)).toBe(25);
    });
});
