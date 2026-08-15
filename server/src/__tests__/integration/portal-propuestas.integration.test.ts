/**
 * El partner propone marcas propias.
 *
 * El spec del v1 lo dejó afuera a propósito ("los partners no cargan marcas
 * propias, se evalúa después"). Ahora sí: el partner conoce gente a la que
 * nosotros no llegamos, y esa es justamente la materia prima del acuerdo.
 *
 * La decisión que evita el desastre: si la marca YA está en la lista, la
 * propuesta no crea un duplicado — se convierte en una mano levantada sobre la
 * que ya existe. Un partner no puede saber qué tenemos cargado.
 */

jest.mock('../../services/linkedin.service', () => ({
    linkedinService: { getTenant: () => null },
}));

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express from 'express';
import portalRoutes from '../../routes/partner-portal.routes';
import { MarcaBuscada } from '../../models/marca-buscada.model';
import { Partner } from '../../models/partner.model';
import '../../models/user.model';

let mongo: MongoMemoryServer;
let app: express.Express;
const USER = new mongoose.Types.ObjectId();
const TOKEN = 'tok-propuestas';

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    app = express();
    app.use(express.json());
    app.use('/api/portal', portalRoutes);
});
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
afterEach(async () => {
    for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({});
});

const crearPartner = () => Partner.create({
    name: 'Gabriel Chayle', userId: USER, assignedTo: USER,
    accessToken: TOKEN, accessTokenActivo: true,
});

const proponer = (datos: object) =>
    request(app).post(`/api/portal/${TOKEN}/marcas`).send(datos);

describe('proponer una marca nueva', () => {
    it('la crea marcada como propuesta por ese partner', async () => {
        const p = await crearPartner();

        const res = await proponer({ nombre: 'Rapanui', porQue: 'El dueño es cliente mío hace años' });

        expect(res.status).toBe(201);
        const marca = await MarcaBuscada.findOne({ nombreNormalizado: 'rapanui' });
        expect(marca!.origen).toBe('partner');
        expect(String(marca!.propuestaPor)).toBe(String(p._id));
        expect(marca!.userId.toString()).toBe(USER.toString());
    });

    it('queda con la mano del partner ya levantada: proponerla ES ofrecerse', async () => {
        const p = await crearPartner();

        await proponer({ nombre: 'Rapanui', porQue: 'Conozco al dueño' });

        const marca = await MarcaBuscada.findOne({ nombreNormalizado: 'rapanui' });
        expect(marca!.manos).toHaveLength(1);
        expect(String(marca!.manos[0].partnerId)).toBe(String(p._id));
        expect(marca!.manos[0].comentario).toBe('Conozco al dueño');
    });

    it('aparece en su propio portal enseguida', async () => {
        await crearPartner();

        await proponer({ nombre: 'Rapanui' });

        const tablero = await request(app).get(`/api/portal/${TOKEN}`);
        expect(tablero.body.marcas.map((m: any) => m.nombre)).toContain('Rapanui');
    });
});

describe('si la marca ya la teníamos', () => {
    it('no duplica: levanta la mano sobre la que ya existe', async () => {
        const p = await crearPartner();
        await MarcaBuscada.create({
            nombre: 'Havanna', nombreNormalizado: 'havanna', estado: 'buscando', userId: USER,
        });

        const res = await proponer({ nombre: '  havanna  ', porQue: 'Le vendo hace años' });

        expect(res.status).toBe(200);
        expect(await MarcaBuscada.countDocuments({ nombreNormalizado: 'havanna' })).toBe(1);
        const marca = await MarcaBuscada.findOne({ nombreNormalizado: 'havanna' });
        expect(marca!.manos).toHaveLength(1);
        expect(String(marca!.manos[0].partnerId)).toBe(String(p._id));
        // La marca sigue siendo nuestra: el partner no se la apropia.
        expect(marca!.origen).not.toBe('partner');
    });

    it('no levanta la mano dos veces si ya la había levantado', async () => {
        await crearPartner();
        await proponer({ nombre: 'Rapanui' });

        await proponer({ nombre: 'Rapanui' });

        const marca = await MarcaBuscada.findOne({ nombreNormalizado: 'rapanui' });
        expect(marca!.manos).toHaveLength(1);
    });
});

describe('lo que no se acepta', () => {
    it('sin nombre devuelve 400', async () => {
        await crearPartner();
        const res = await proponer({ porQue: 'sin nombre' });
        expect(res.status).toBe(400);
    });

    it('con un token revocado no crea nada', async () => {
        const p = await crearPartner();
        await Partner.updateOne({ _id: p._id }, { $set: { accessTokenActivo: false } });

        const res = await proponer({ nombre: 'Colada' });

        expect(res.status).toBe(404);
        expect(await MarcaBuscada.countDocuments({})).toBe(0);
    });
});

describe('el CRM distingue lo propuesto de lo propio', () => {
    it('la propuesta viaja con quién la trajo', async () => {
        const p = await crearPartner();
        await proponer({ nombre: 'Rapanui' });

        const marca = await MarcaBuscada.findOne({ nombreNormalizado: 'rapanui' }).lean();

        expect(marca!.origen).toBe('partner');
        expect(String(marca!.propuestaPor)).toBe(String(p._id));
    });
});
