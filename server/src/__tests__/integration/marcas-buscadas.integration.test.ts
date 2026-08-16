import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import marcasRoutes from '../../routes/marcas-buscadas.routes';
import { MarcaBuscada } from '../../models/marca-buscada.model';

let mongo: MongoMemoryServer;
let app: express.Express;
const USER_ID = new mongoose.Types.ObjectId();
const OTRO_USER = new mongoose.Types.ObjectId();

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await MarcaBuscada.syncIndexes();
    app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as any).user = { _id: USER_ID };
        next();
    });
    app.use('/api/marcas-buscadas', marcasRoutes);
});
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
afterEach(async () => { await MarcaBuscada.deleteMany({}); });

describe('API privada de marcas buscadas', () => {
    it('crea una marca con lo mínimo: nombre y por qué', async () => {
        const res = await request(app).post('/api/marcas-buscadas')
            .send({ nombre: 'Havanna', porQue: '180 locales' });

        expect(res.status).toBe(201);
        expect(res.body.nombre).toBe('Havanna');
        expect(res.body.estado).toBe('buscando');
    });

    it('responde 400 (no 500) si falta el nombre', async () => {
        const res = await request(app).post('/api/marcas-buscadas').send({ porQue: 'x' });
        expect(res.status).toBe(400);
    });

    it('rechaza una marca repetida con 409 y dice cuál es', async () => {
        await request(app).post('/api/marcas-buscadas').send({ nombre: 'Havanna' });
        const res = await request(app).post('/api/marcas-buscadas').send({ nombre: ' havanna ' });

        expect(res.status).toBe(409);
        expect(String(res.body.error)).toMatch(/havanna/i);
    });

    it('lista sólo las marcas del dueño', async () => {
        await MarcaBuscada.create({ nombre: 'Mía', userId: USER_ID });
        await MarcaBuscada.create({ nombre: 'Ajena', userId: OTRO_USER });

        const res = await request(app).get('/api/marcas-buscadas');

        expect(res.body.marcas).toHaveLength(1);
        expect(res.body.marcas[0].nombre).toBe('Mía');
    });

    it('no deja editar la marca de otro dueño', async () => {
        const ajena = await MarcaBuscada.create({ nombre: 'Ajena', userId: OTRO_USER });
        const res = await request(app).patch(`/api/marcas-buscadas/${ajena._id}`)
            .send({ notaInterna: 'me la afano' });

        expect(res.status).toBe(404);
        const sinTocar = await MarcaBuscada.findById(ajena._id);
        expect(sinTocar!.notaInterna).toBeUndefined();
    });

    it('no deja borrar la marca de otro dueño', async () => {
        const ajena = await MarcaBuscada.create({ nombre: 'Ajena', userId: OTRO_USER });
        const res = await request(app).delete(`/api/marcas-buscadas/${ajena._id}`);

        expect(res.status).toBe(404);
        expect(await MarcaBuscada.countDocuments({ _id: ajena._id })).toBe(1);
    });

    it('archivar es un PATCH de estado', async () => {
        const m = await MarcaBuscada.create({ nombre: 'Vieja', userId: USER_ID });
        const res = await request(app).patch(`/api/marcas-buscadas/${m._id}`)
            .send({ estado: 'archivada' });

        expect(res.status).toBe(200);
        expect((await MarcaBuscada.findById(m._id))!.estado).toBe('archivada');
    });
});
