/**
 * A qué partners se le muestra cada marca.
 *
 * Hasta acá el portal filtraba sólo por `userId` y estado: todos los partners
 * con link veían todas las marcas. Ahora cada marca puede dirigirse a algunos.
 *
 * La regla que evita el pozo: **lista vacía = la ven todos**. Así las marcas ya
 * cargadas no desaparecen al agregar el campo, y olvidarse de asignar no deja
 * una marca que no ve nadie.
 */

jest.mock('../../services/linkedin.service', () => ({
    linkedinService: { getTenant: () => null },
}));

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import marcasRoutes from '../../routes/marcas-buscadas.routes';
import portalRoutes from '../../routes/partner-portal.routes';
import { MarcaBuscada } from '../../models/marca-buscada.model';
import { Partner } from '../../models/partner.model';
import '../../models/user.model';

let mongo: MongoMemoryServer;
let app: express.Express;
const USER = new mongoose.Types.ObjectId();

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    app = express();
    app.use(express.json());
    app.use('/api/portal', portalRoutes);
    app.use('/api/marcas-buscadas', (req: Request, _res: Response, next: NextFunction) => {
        (req as any).user = { _id: USER };
        next();
    }, marcasRoutes);
});
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
afterEach(async () => {
    for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({});
});

async function partnerCon(nombre: string, token: string) {
    return Partner.create({
        name: nombre, userId: USER, assignedTo: USER,
        accessToken: token, accessTokenActivo: true,
    });
}

/** Nombres de las marcas que ese partner ve en su portal. */
async function loQueVe(token: string): Promise<string[]> {
    const res = await request(app).get(`/api/portal/${token}`);
    expect(res.status).toBe(200);
    return res.body.marcas.map((m: any) => m.nombre);
}

describe('marca dirigida a algunos partners', () => {
    it('sólo la ven los asignados', async () => {
        const juani = await partnerCon('Juani', 'tok-juani');
        await partnerCon('Marcos', 'tok-marcos');

        await request(app).post('/api/marcas-buscadas')
            .send({ nombre: 'Havanna', partners: [String(juani._id)] });

        expect(await loQueVe('tok-juani')).toEqual(['Havanna']);
        expect(await loQueVe('tok-marcos')).toEqual([]);
    });

    it('se le puede dirigir a varios a la vez', async () => {
        const juani = await partnerCon('Juani', 'tok-juani');
        const marcos = await partnerCon('Marcos', 'tok-marcos');
        await partnerCon('Gabriel', 'tok-gabriel');

        await request(app).post('/api/marcas-buscadas')
            .send({ nombre: 'Grido', partners: [String(juani._id), String(marcos._id)] });

        expect(await loQueVe('tok-juani')).toEqual(['Grido']);
        expect(await loQueVe('tok-marcos')).toEqual(['Grido']);
        expect(await loQueVe('tok-gabriel')).toEqual([]);
    });
});

describe('la regla que evita el pozo: vacío = todos', () => {
    it('una marca sin partners asignados la ven todos', async () => {
        await partnerCon('Juani', 'tok-juani');
        await partnerCon('Marcos', 'tok-marcos');

        await request(app).post('/api/marcas-buscadas').send({ nombre: 'Para Todos' });

        expect(await loQueVe('tok-juani')).toEqual(['Para Todos']);
        expect(await loQueVe('tok-marcos')).toEqual(['Para Todos']);
    });

    it('las marcas cargadas ANTES del cambio siguen viéndose', async () => {
        await partnerCon('Juani', 'tok-juani');
        // Sin el campo `partners`, como quedaron las que ya existían.
        await MarcaBuscada.create({
            nombre: 'Vieja', nombreNormalizado: 'vieja', estado: 'buscando', userId: USER,
        });

        expect(await loQueVe('tok-juani')).toEqual(['Vieja']);
    });
});

describe('cambiar a quién se le muestra', () => {
    it('reasignar saca la marca del portal del anterior', async () => {
        const juani = await partnerCon('Juani', 'tok-juani');
        const marcos = await partnerCon('Marcos', 'tok-marcos');
        const { body } = await request(app).post('/api/marcas-buscadas')
            .send({ nombre: 'Rotativa', partners: [String(juani._id)] });

        await request(app).patch(`/api/marcas-buscadas/${body._id}`)
            .send({ partners: [String(marcos._id)] });

        expect(await loQueVe('tok-juani')).toEqual([]);
        expect(await loQueVe('tok-marcos')).toEqual(['Rotativa']);
    });

    it('vaciar la lista la vuelve visible para todos', async () => {
        const juani = await partnerCon('Juani', 'tok-juani');
        await partnerCon('Marcos', 'tok-marcos');
        const { body } = await request(app).post('/api/marcas-buscadas')
            .send({ nombre: 'Abierta', partners: [String(juani._id)] });

        await request(app).patch(`/api/marcas-buscadas/${body._id}`).send({ partners: [] });

        expect(await loQueVe('tok-marcos')).toEqual(['Abierta']);
    });
});

describe('el listado interno muestra a quién se le dirigió', () => {
    it('devuelve los partners asignados de cada marca', async () => {
        const juani = await partnerCon('Juani', 'tok-juani');
        await request(app).post('/api/marcas-buscadas')
            .send({ nombre: 'Havanna', partners: [String(juani._id)] });

        const res = await request(app).get('/api/marcas-buscadas');
        const marca = (res.body.marcas ?? res.body).find((m: any) => m.nombre === 'Havanna');

        expect(marca.partners).toHaveLength(1);
        expect(String(marca.partners[0]._id ?? marca.partners[0])).toBe(String(juani._id));
    });
});

describe('el partner cargado por otro miembro del equipo', () => {
    it('ve la marca que le asignaron, aunque lo haya cargado otro', async () => {
        const OTRO_MIEMBRO = new mongoose.Types.ObjectId();
        // Así están los partners reales: cada uno lo cargó quien lo trajo.
        const juani = await Partner.create({
            name: 'Juani', userId: OTRO_MIEMBRO, assignedTo: OTRO_MIEMBRO,
            accessToken: 'tok-juani-ajeno', accessTokenActivo: true,
        });

        await request(app).post('/api/marcas-buscadas')
            .send({ nombre: 'Havanna', partners: [String(juani._id)] });

        expect(await loQueVe('tok-juani-ajeno')).toEqual(['Havanna']);
    });
});
