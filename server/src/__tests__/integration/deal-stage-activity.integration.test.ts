/**
 * Mover un deal de etapa tiene que quedar registrado en el timeline.
 *
 * El movimiento se guarda en `statusHistory`, pero la línea de tiempo del deal
 * se arma con las Activities: mostraba llamadas, mails y notas, y no mostraba
 * "pasó de Reuniones a Negociación". El dato existía y no se veía en ningún lado.
 */

jest.mock('../../services/linkedin.service', () => ({
    linkedinService: { getTenant: () => null },
}));

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import crmRoutes from '../../routes/crm.routes';
import { Deal } from '../../models/deal.model';
import { Company } from '../../models/company.model';
import { Activity } from '../../models/activity.model';
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

async function dealEnLead() {
    const empresa = await Company.create({ name: 'Empresa Timeline', userId: USER_ID, assignedTo: USER_ID });
    return Deal.create({
        title: 'Deal Timeline', status: 'lead', company: empresa._id,
        userId: USER_ID, assignedTo: USER_ID,
    });
}

describe('mover un deal de etapa', () => {
    it('deja una actividad en el timeline', async () => {
        const deal = await dealEnLead();

        await request(app).patch(`/api/crm/deals/${deal._id}`).send({ status: 'negociacion' });

        const acts = await Activity.find({ deal: deal._id });
        expect(acts).toHaveLength(1);
        expect(acts[0].type).toBe('stage_change');
    });

    it('la actividad dice de dónde a dónde, con las etiquetas visibles', async () => {
        const deal = await dealEnLead();

        await request(app).patch(`/api/crm/deals/${deal._id}`).send({ status: 'negociacion' });

        const act = await Activity.findOne({ deal: deal._id });
        expect(act!.description).toMatch(/Lead Potencial/i);
        expect(act!.description).toMatch(/Negociación/i);
    });

    it('registra quién lo movió', async () => {
        const deal = await dealEnLead();

        await request(app).patch(`/api/crm/deals/${deal._id}`).send({ status: 'contactado' });

        const act = await Activity.findOne({ deal: deal._id });
        expect(String(act!.createdBy)).toBe(String(USER_ID));
        expect(String((act as any).company)).toBeTruthy();
    });

    it('editar el deal SIN cambiar de etapa no genera actividad', async () => {
        const deal = await dealEnLead();

        await request(app).patch(`/api/crm/deals/${deal._id}`).send({ title: 'Otro título' });

        expect(await Activity.countDocuments({ deal: deal._id })).toBe(0);
    });

    it('mandar la misma etapa que ya tenía no genera actividad', async () => {
        const deal = await dealEnLead();

        await request(app).patch(`/api/crm/deals/${deal._id}`).send({ status: 'lead' });

        expect(await Activity.countDocuments({ deal: deal._id })).toBe(0);
    });

    it('dos movimientos dejan dos actividades', async () => {
        const deal = await dealEnLead();

        await request(app).patch(`/api/crm/deals/${deal._id}`).send({ status: 'contactado' });
        await request(app).patch(`/api/crm/deals/${deal._id}`).send({ status: 'negociacion' });

        expect(await Activity.countDocuments({ deal: deal._id })).toBe(2);
    });
});
