/**
 * Guarda de la configuración del pipeline.
 *
 * `PUT /pipeline/config` reemplaza el array de etapas entero sin mirar si hay
 * deals parados en las que se desactivan o se sacan. El tablero arma las
 * columnas SOLO con las etapas activas, así que esos deals desaparecen de la
 * vista sin ningún aviso: siguen existiendo, siguen valiendo plata y siguen
 * contando en las métricas, pero el equipo no los ve más en el Kanban.
 *
 * Reproducido contra la API real: desactivar "seguimiento" con 2 deals adentro
 * devolvió 200 y el tablero pasó de 18 a 16 deals visibles, sin advertencia.
 */

jest.mock('../../services/linkedin.service', () => ({
    linkedinService: { getTenant: () => null },
}));

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import crmRoutes from '../../routes/crm.routes';
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
    app.use('/api/crm', crmRoutes);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
});

afterEach(async () => {
    for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({});
});

/** Deja un deal parado en la etapa indicada. */
async function dealEn(stageKey: string) {
    const empresa = await Company.create({ name: 'Empresa Test', userId: USER_ID, assignedTo: USER_ID });
    return Deal.create({
        title: 'Deal Test', status: stageKey, company: empresa._id,
        userId: USER_ID, assignedTo: USER_ID,
    });
}

/** Las etapas tal como las recibe y reenvía el cliente: JSON plano. */
const etapasPlanas = async (): Promise<any[]> => {
    const res = await request(app).get('/api/crm/pipeline/config');
    return res.body.stages;
};

const etapasActuales = async () => (await PipelineConfig.getOrCreate(USER_ID.toString())).stages;

describe('PUT /api/crm/pipeline/config', () => {
    it('rechaza desactivar una etapa que tiene deals, y dice cuántos', async () => {
        await dealEn('seguimiento');
        const stages = (await etapasPlanas()).map(s =>
            s.key === 'seguimiento' ? { ...s, isActive: false } : s
        );

        const res = await request(app).put('/api/crm/pipeline/config').send({ stages });

        expect(res.status).toBe(400);
        expect(String(res.body.error)).toMatch(/seguimiento/i);
        expect(String(res.body.error)).toMatch(/1/);
    });

    it('no aplica NINGÚN cambio si la guarda salta', async () => {
        await dealEn('seguimiento');
        const stages = (await etapasPlanas()).map(s =>
            s.key === 'seguimiento' ? { ...s, isActive: false } : s
        );

        await request(app).put('/api/crm/pipeline/config').send({ stages });

        const despues = await etapasActuales();
        expect(despues.find(s => s.key === 'seguimiento')!.isActive).toBe(true);
    });

    it('rechaza sacar del array una etapa que tiene deals', async () => {
        await dealEn('negociacion');
        const stages = (await etapasPlanas()).filter(s => s.key !== 'negociacion');

        const res = await request(app).put('/api/crm/pipeline/config').send({ stages });

        expect(res.status).toBe(400);
        expect(String(res.body.error)).toMatch(/negociacion/i);
    });

    it('deja desactivar una etapa vacía', async () => {
        const stages = (await etapasPlanas()).map(s =>
            s.key === 'pausado' ? { ...s, isActive: false } : s
        );

        const res = await request(app).put('/api/crm/pipeline/config').send({ stages });

        expect(res.status).toBe(200);
        const despues = await etapasActuales();
        expect(despues.find(s => s.key === 'pausado')!.isActive).toBe(false);
    });

    it('deja renombrar la etiqueta sin tocar la key, aunque tenga deals', async () => {
        await dealEn('lead');
        const stages = (await etapasPlanas()).map(s =>
            s.key === 'lead' ? { ...s, label: 'Oportunidad Inicial' } : s
        );

        const res = await request(app).put('/api/crm/pipeline/config').send({ stages });

        expect(res.status).toBe(200);
        const despues = await etapasActuales();
        expect(despues.find(s => s.key === 'lead')!.label).toBe('Oportunidad Inicial');
    });

    it('ningún deal queda fuera de las columnas activas después de guardar', async () => {
        await dealEn('lead');
        await dealEn('coordinando');
        const stages = await etapasPlanas();

        await request(app).put('/api/crm/pipeline/config').send({ stages });

        const activas = (await etapasActuales()).filter(s => s.isActive).map(s => s.key);
        const huerfanos = await Deal.countDocuments({ userId: USER_ID, status: { $nin: activas } });
        expect(huerfanos).toBe(0);
    });
});
