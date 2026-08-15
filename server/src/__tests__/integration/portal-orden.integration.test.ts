/**
 * En qué orden le mostramos las marcas al partner.
 *
 * Con una o dos marcas el orden no importa. Con diez sí: el portal se vuelve
 * una lista larga de botones iguales, y el partner responde las primeras tres.
 * Si las primeras tres son las que menos falta hacen, desperdiciamos su
 * atención — que es lo único que nos está dando gratis.
 *
 * El criterio es uno solo y honesto: **hace cuánto que no pasa nada**. Un deal
 * frenado ocho meses en Lead es donde una presentación cambia el resultado; uno
 * que se movió anteayer no lo necesita. Y una marca que todavía buscamos hace
 * meses es un caso donde no tenemos ninguna puerta: también arriba.
 *
 * Lo que el partner ya respondió baja al fondo, siempre.
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
import { Company } from '../../models/company.model';
import { Deal } from '../../models/deal.model';
import '../../models/user.model';

let mongo: MongoMemoryServer;
let app: express.Express;
const USER = new mongoose.Types.ObjectId();
const TOKEN = 'tok-orden';
const hace = (dias: number) => new Date(Date.now() - dias * 864e5);

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
    name: 'Juani', userId: USER, assignedTo: USER, accessToken: TOKEN, accessTokenActivo: true,
});

/** Una marca ya en el pipeline, frenada hace `quietoHace` días. */
async function enPipeline(nombre: string, quietoHace: number, partnerId: any, extra: object = {}) {
    const empresa = await Company.create({ name: nombre, userId: USER, assignedTo: USER });
    await Deal.create({
        title: nombre, company: empresa._id, status: 'contactado', userId: USER, assignedTo: USER,
        statusHistory: [{ from: 'lead', to: 'contactado', changedAt: hace(quietoHace), changedBy: USER }],
    });
    return MarcaBuscada.create({
        nombre, nombreNormalizado: nombre.toLowerCase(), estado: 'ascendida',
        companyId: empresa._id, partners: [partnerId], userId: USER, ...extra,
    });
}

/** Una marca que todavía buscamos, cargada hace `cargadaHace` días. */
const buscando = (nombre: string, cargadaHace: number, partnerId: any, extra: object = {}) =>
    MarcaBuscada.create({
        nombre, nombreNormalizado: nombre.toLowerCase(), estado: 'buscando',
        partners: [partnerId], userId: USER, createdAt: hace(cargadaHace), ...extra,
    });

/** Los nombres, en el orden en que le llegan al partner. */
async function ordenDelPortal(): Promise<string[]> {
    const res = await request(app).get(`/api/portal/${TOKEN}`);
    expect(res.status).toBe(200);
    return res.body.marcas.map((m: any) => m.nombre);
}

describe('primero donde más falta una mano', () => {
    it('lo más frenado va arriba', async () => {
        const p = await crearPartner();
        await enPipeline('Recién movido', 2, p._id);
        await enPipeline('Frenado ocho meses', 240, p._id);
        await enPipeline('Frenado dos meses', 64, p._id);

        expect(await ordenDelPortal()).toEqual([
            'Frenado ocho meses', 'Frenado dos meses', 'Recién movido',
        ]);
    });

    it('una marca que buscamos hace rato compite con los deals frenados', async () => {
        const p = await crearPartner();
        await enPipeline('Frenado un mes', 30, p._id);
        await buscando('Buscada hace un año', 365, p._id);
        await enPipeline('Frenado tres días', 3, p._id);

        expect(await ordenDelPortal()).toEqual([
            'Buscada hace un año', 'Frenado un mes', 'Frenado tres días',
        ]);
    });

    it('no rompe si el deal no existe: la marca no se pierde', async () => {
        const p = await crearPartner();
        await enPipeline('Con deal', 10, p._id);
        const empresa = await Company.create({ name: 'Sin deal', userId: USER, assignedTo: USER });
        await MarcaBuscada.create({
            nombre: 'Sin deal', nombreNormalizado: 'sin deal', estado: 'ascendida',
            companyId: empresa._id, partners: [p._id], userId: USER,
        });

        expect(await ordenDelPortal()).toHaveLength(2);
    });
});

describe('lo que ya respondió baja al fondo', () => {
    it('una en la que levantó la mano va abajo, por más frenada que esté', async () => {
        const p = await crearPartner();
        await enPipeline('Frenado un año, ya respondida', 365, p._id, {
            manos: [{ partnerId: p._id, partnerNombre: 'Juani', estado: 'ofrecida', levantadaEn: new Date() }],
        });
        await enPipeline('Frenado una semana, sin responder', 7, p._id);

        expect(await ordenDelPortal()).toEqual([
            'Frenado una semana, sin responder', 'Frenado un año, ya respondida',
        ]);
    });

    it('una que dijo que no llega también va abajo', async () => {
        const p = await crearPartner();
        await enPipeline('No llego, muy frenada', 300, p._id, { sinLlegada: [p._id] });
        await enPipeline('Sin responder', 5, p._id);

        expect(await ordenDelPortal()).toEqual(['Sin responder', 'No llego, muy frenada']);
    });

    it('la mano de OTRO partner no la baja: para éste sigue sin responder', async () => {
        const p = await crearPartner();
        await enPipeline('Otro levantó la mano', 300, p._id, {
            manos: [{ partnerId: new mongoose.Types.ObjectId(), partnerNombre: 'Marcos', estado: 'ofrecida', levantadaEn: new Date() }],
        });
        await enPipeline('Sin responder', 5, p._id);

        expect(await ordenDelPortal()).toEqual(['Otro levantó la mano', 'Sin responder']);
    });
});

describe('cuál mano es la suya', () => {
    it('viene marcada aparte, no hay que adivinarla por el nombre', async () => {
        const p = await crearPartner();
        await enPipeline('Havanna', 10, p._id, {
            manos: [{ partnerId: p._id, partnerNombre: 'Juani', estado: 'ofrecida', levantadaEn: new Date(), comentario: 'Conozco al gerente' }],
        });

        const res = await request(app).get(`/api/portal/${TOKEN}`);

        expect(res.body.marcas[0].miMano.comentario).toBe('Conozco al gerente');
        expect(res.body.marcas[0].otrasManos).toBe(0);
    });

    it('la de otro partner con MI MISMO nombre no se confunde con la mía', async () => {
        const p = await crearPartner();
        const tocayo = new mongoose.Types.ObjectId();
        await enPipeline('Havanna', 10, p._id, {
            manos: [{ partnerId: tocayo, partnerNombre: 'Juani', estado: 'ofrecida', levantadaEn: new Date() }],
        });

        const res = await request(app).get(`/api/portal/${TOKEN}`);

        expect(res.body.marcas[0].miMano).toBeNull();
        expect(res.body.marcas[0].otrasManos).toBe(1);
    });

    it('una mano descartada no la cuenta como respondida: vuelve a pedirle', async () => {
        const p = await crearPartner();
        await enPipeline('Descartada, muy frenada', 300, p._id, {
            manos: [{ partnerId: p._id, partnerNombre: 'Juani', estado: 'descartada', levantadaEn: new Date() }],
        });
        await enPipeline('Sin responder', 5, p._id);

        expect(await ordenDelPortal()).toEqual(['Descartada, muy frenada', 'Sin responder']);
    });
});
