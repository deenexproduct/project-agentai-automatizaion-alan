import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express from 'express';
import portalRoutes from '../../routes/partner-portal.routes';
import { MarcaBuscada } from '../../models/marca-buscada.model';
import { Partner } from '../../models/partner.model';

let mongo: MongoMemoryServer;
let app: express.Express;
const USER_ID = new mongoose.Types.ObjectId();
const OTRO_USER = new mongoose.Types.ObjectId();

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    app = express();
    app.use(express.json());
    // Se monta SIN authMiddleware, igual que en index.ts.
    app.use('/api/portal', portalRoutes);
});
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
afterEach(async () => {
    await MarcaBuscada.deleteMany({});
    await Partner.deleteMany({});
});

const crearPartner = (token: string, userId = USER_ID, activo = true) =>
    Partner.create({ name: 'Marcos', accessToken: token, accessTokenActivo: activo, userId });

describe('portal del partner', () => {
    it('responde SIN credenciales de ningún tipo', async () => {
        await crearPartner('tok-123');
        await MarcaBuscada.create({ nombre: 'Havanna', porQue: '180 locales', userId: USER_ID });

        // Ni Authorization, ni cookie, ni nada.
        const res = await request(app).get('/api/portal/tok-123');

        expect(res.status).toBe(200);
        expect(res.body.partner.nombre).toBe('Marcos');
        expect(res.body.marcas).toHaveLength(1);
    });

    it('sólo muestra las marcas del dueño de ese partner', async () => {
        await crearPartner('tok-123');
        await MarcaBuscada.create({ nombre: 'Mía', userId: USER_ID });
        await MarcaBuscada.create({ nombre: 'Ajena', userId: OTRO_USER });

        const res = await request(app).get('/api/portal/tok-123');

        expect(res.body.marcas.map((m: any) => m.nombre)).toEqual(['Mía']);
    });

    it('no muestra las archivadas ni las ya ascendidas', async () => {
        await crearPartner('tok-123');
        await MarcaBuscada.create({ nombre: 'Activa', userId: USER_ID });
        await MarcaBuscada.create({ nombre: 'Guardada', userId: USER_ID, estado: 'archivada' });
        await MarcaBuscada.create({ nombre: 'Ya abrió', userId: USER_ID, estado: 'ascendida' });

        const res = await request(app).get('/api/portal/tok-123');

        expect(res.body.marcas.map((m: any) => m.nombre)).toEqual(['Activa']);
    });

    it('un token inexistente devuelve 404, sin decir por qué', async () => {
        const res = await request(app).get('/api/portal/no-existe');
        expect(res.status).toBe(404);
        expect(JSON.stringify(res.body)).not.toMatch(/revocad|inactiv|expirad/i);
    });

    it('un token revocado devuelve el MISMO 404 que uno inexistente', async () => {
        await crearPartner('tok-muerto', USER_ID, false);
        const res = await request(app).get('/api/portal/tok-muerto');
        expect(res.status).toBe(404);
    });

    it('levantar la mano la deja registrada con fecha', async () => {
        await crearPartner('tok-123');
        const m = await MarcaBuscada.create({ nombre: 'Havanna', userId: USER_ID });

        const res = await request(app)
            .post(`/api/portal/tok-123/marcas/${m._id}/mano`)
            .send({ comentario: 'mi cuñado es gerente' });

        expect(res.status).toBe(200);
        const leida = await MarcaBuscada.findById(m._id);
        expect(leida!.manos).toHaveLength(1);
        expect(leida!.manos[0].partnerNombre).toBe('Marcos');
        expect(leida!.manos[0].comentario).toBe('mi cuñado es gerente');
        expect(leida!.manos[0].levantadaEn).toBeInstanceOf(Date);
        expect(leida!.estado).toBe('con_manos');
    });

    it('levantar la mano dos veces actualiza el comentario, no duplica', async () => {
        await crearPartner('tok-123');
        const m = await MarcaBuscada.create({ nombre: 'Havanna', userId: USER_ID });

        await request(app).post(`/api/portal/tok-123/marcas/${m._id}/mano`).send({ comentario: 'uno' });
        await request(app).post(`/api/portal/tok-123/marcas/${m._id}/mano`).send({ comentario: 'dos' });

        const leida = await MarcaBuscada.findById(m._id);
        expect(leida!.manos).toHaveLength(1);
        expect(leida!.manos[0].comentario).toBe('dos');
    });

    it('un token NO puede levantar la mano en la marca de otro dueño', async () => {
        await crearPartner('tok-123');
        const ajena = await MarcaBuscada.create({ nombre: 'Ajena', userId: OTRO_USER });

        const res = await request(app)
            .post(`/api/portal/tok-123/marcas/${ajena._id}/mano`).send({});

        expect(res.status).toBe(404);
        expect((await MarcaBuscada.findById(ajena._id))!.manos).toHaveLength(0);
    });

    it('dice CUÁNTOS más levantaron la mano, pero no quiénes', async () => {
        // Antes este test pedía lo contrario: que viajara `partnerNombre`. Se
        // dio vuelta a propósito. Los partners compiten entre sí por la misma
        // comisión, así que el nombre y el comentario del otro no son asunto
        // suyo; que no está solo, sí le sirve saberlo.
        await crearPartner('tok-123');
        const m = await MarcaBuscada.create({
            nombre: 'Havanna', userId: USER_ID,
            manos: [{
                partnerId: new mongoose.Types.ObjectId(), partnerNombre: 'Gabriel',
                comentario: 'Le vendo hace años', levantadaEn: new Date(), estado: 'ofrecida',
            }],
        } as any);

        const res = await request(app).get('/api/portal/tok-123');

        const marca = res.body.marcas.find((x: any) => String(x._id) === String(m._id));
        expect(marca.otrasManos).toBe(1);
        expect(JSON.stringify(res.body)).not.toContain('Gabriel');
        expect(JSON.stringify(res.body)).not.toContain('Le vendo hace años');
    });
});
