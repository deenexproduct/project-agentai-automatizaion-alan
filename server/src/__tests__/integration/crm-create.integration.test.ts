/**
 * Altas del CRM — empresa, contacto y deal.
 *
 * Cubre los agujeros encontrados en la cacería del 02/08/2026: las tres altas
 * hacían `Model.create({ ...req.body })` sin validar nada, así que entraban
 * duplicados, referencias a empresas inexistentes y números fuera de rango —
 * y cualquier error de validación salía como 500 genérico en vez de 400.
 *
 * El caso más caro: una empresa con localesCount negativo se creaba con 201
 * pero su deal automático moría por `value: min 0` dentro de un try/catch
 * mudo, y la empresa quedaba INVISIBLE en el pipeline.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';

// El router importa linkedinService, que arrastra puppeteer y las sesiones de
// LinkedIn: sin mockearlo el test se come 2GB de heap y muere por OOM.
jest.mock('../../services/linkedin.service', () => ({
    linkedinService: { getTenant: () => null },
}));

import crmRoutes from '../../routes/crm.routes';
import { Company } from '../../models/company.model';
import { Deal } from '../../models/deal.model';
// El alta de contacto hace populate('assignedTo'): sin registrar el modelo User
// el handler falla por otro motivo y el test dejaría de probar lo que dice probar.
import '../../models/user.model';

let mongo: MongoMemoryServer;
let app: express.Express;
const USER_ID = new mongoose.Types.ObjectId();
const ID_INEXISTENTE = '000000000000000000000000';

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
    const { collections } = mongoose.connection;
    for (const key of Object.keys(collections)) await collections[key].deleteMany({});
});

describe('POST /api/crm/companies', () => {
    it('crea la empresa y su deal automático en la primera etapa', async () => {
        const res = await request(app)
            .post('/api/crm/companies')
            .send({ name: 'Panadería Test', localesCount: 10, costPerLocation: 5 });

        expect(res.status).toBe(201);
        const deals = await Deal.find({ company: res.body._id });
        expect(deals).toHaveLength(1);
        expect(deals[0].value).toBe(50);
    });

    it('rechaza una empresa con nombre duplicado en vez de crear un clon', async () => {
        await request(app).post('/api/crm/companies').send({ name: 'Duplicada SA' });
        const segunda = await request(app).post('/api/crm/companies').send({ name: 'Duplicada SA' });

        expect(segunda.status).toBe(409);
        expect(await Company.countDocuments({ name: /duplicada sa/i })).toBe(1);
    });

    it('responde 400 (no 500) cuando falta el nombre', async () => {
        const res = await request(app).post('/api/crm/companies').send({ website: 'https://x.com' });

        expect(res.status).toBe(400);
        expect(String(res.body.error)).toMatch(/name|nombre/i);
    });

    it('rechaza localesCount negativo y NO deja una empresa sin deal (invisible en el pipeline)', async () => {
        const res = await request(app)
            .post('/api/crm/companies')
            .send({ name: 'Negativa SA', localesCount: -5, costPerLocation: 10 });

        expect(res.status).toBe(400);
        expect(await Company.countDocuments({ name: /negativa/i })).toBe(0);
    });

    it('ninguna empresa creada queda fuera del pipeline', async () => {
        await request(app).post('/api/crm/companies').send({ name: 'Con Deal SA', localesCount: 3, costPerLocation: 7 });

        const empresas = await Company.find({});
        for (const empresa of empresas) {
            expect(await Deal.countDocuments({ company: empresa._id })).toBeGreaterThan(0);
        }
    });
});

describe('POST /api/crm/contacts', () => {
    it('rechaza un contacto que apunta a una empresa inexistente', async () => {
        const res = await request(app)
            .post('/api/crm/contacts')
            .send({ fullName: 'Fantasma Pérez', company: ID_INEXISTENTE });

        expect(res.status).toBe(400);
    });

    it('responde 400 (no 500) cuando falta el nombre', async () => {
        const res = await request(app).post('/api/crm/contacts').send({ email: 'a@b.com' });
        expect(res.status).toBe(400);
    });
});

describe('POST /api/crm/deals', () => {
    it('rechaza un deal que apunta a una empresa inexistente', async () => {
        const res = await request(app)
            .post('/api/crm/deals')
            .send({ title: 'Deal Fantasma', company: ID_INEXISTENTE });

        expect(res.status).toBe(400);
    });

    it('rechaza un deal sin empresa', async () => {
        const res = await request(app).post('/api/crm/deals').send({ title: 'Deal Suelto' });
        expect(res.status).toBe(400);
    });

    it('responde 400 (no 500) cuando el valor es negativo', async () => {
        const empresa = await Company.create({ name: 'Valores SA', userId: USER_ID, assignedTo: USER_ID });
        const res = await request(app)
            .post('/api/crm/deals')
            .send({ title: 'Deal Negativo', company: empresa._id, value: -100 });

        expect(res.status).toBe(400);
    });
});
