/**
 * Qué le contamos al partner después de que se ofreció.
 *
 * Hoy el portal le miente por omisión en los dos desenlaces posibles:
 *
 * 1. Si le ACEPTAMOS la mano, ve exactamente lo mismo que cuando estaba
 *    esperando: "Levantaste la mano · Te escribimos para coordinar". Le dijimos
 *    que sí y no se enteró.
 *
 * 2. Si se la DESCARTAMOS, su mano desaparece del portal y la tarjeta vuelve a
 *    preguntarle "¿Llegás a esta?" como si nunca hubiera contestado. Se ofreció,
 *    lo ignoramos, y encima le volvemos a preguntar lo mismo.
 *
 * Un partner al que no le cerramos el ciclo deja de responder. Es la forma más
 * barata de matar el programa entero.
 *
 * Hay dos motivos distintos por los que una mano queda descartada, y al partner
 * le importan cosas distintas en cada uno: que le ganaron de mano (la marca
 * ascendió con otro) o que pasamos de su ofrecimiento (la marca sigue en la
 * lista). El portal tiene que poder distinguirlos.
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
const TOKEN = 'tok-ciclo';

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

const crearPartner = (comision = 0) => Partner.create({
    name: 'Juani', userId: USER, assignedTo: USER,
    accessToken: TOKEN, accessTokenActivo: true, commissionPercentage: comision,
});

const mano = (partnerId: any, estado: string, nombre = 'Juani') =>
    ({ partnerId, partnerNombre: nombre, estado, levantadaEn: new Date(), comentario: 'Conozco al gerente' });

/** Una marca ascendida a empresa del CRM, con su deal en una etapa. */
async function ascendida(nombre: string, manos: object[]) {
    const empresa = await Company.create({ name: nombre, userId: USER, assignedTo: USER });
    await Deal.create({
        title: nombre, company: empresa._id, status: 'negociacion', userId: USER, assignedTo: USER,
    });
    return MarcaBuscada.create({
        nombre, nombreNormalizado: nombre.toLowerCase(), estado: 'ascendida',
        companyId: empresa._id, userId: USER, manos,
    });
}

const primeraMarca = async () => {
    const res = await request(app).get(`/api/portal/${TOKEN}`);
    expect(res.status).toBe(200);
    return res.body.marcas[0];
};

describe('cuando le decimos que sí', () => {
    it('el portal lo dice: la mano viaja como aceptada, no como pendiente', async () => {
        const p = await crearPartner();
        await ascendida('Bonafide', [mano(p._id, 'aceptada')]);

        const m = await primeraMarca();

        expect(m.miMano.estado).toBe('aceptada');
    });

    it('y sigue viendo en qué etapa va la empresa que ayudó a abrir', async () => {
        const p = await crearPartner();
        await ascendida('Bonafide', [mano(p._id, 'aceptada')]);

        const m = await primeraMarca();

        expect(m.situacion.tipo).toBe('en_pipeline');
        expect(m.situacion.etiqueta).toBe('Negociación');
    });
});

describe('cuando no seguimos con su ofrecimiento', () => {
    it('no lo borramos del portal: la mano descartada le llega igual', async () => {
        const p = await crearPartner();
        await MarcaBuscada.create({
            nombre: 'Havanna', nombreNormalizado: 'havanna', estado: 'buscando',
            userId: USER, manos: [mano(p._id, 'descartada')],
        });

        const m = await primeraMarca();

        // Antes esto era null y la tarjeta le volvía a preguntar de cero.
        expect(m.miMano).not.toBeNull();
        expect(m.miMano.estado).toBe('descartada');
    });

    it('distingue "pasamos de tu ofrecimiento" de "te ganaron de mano"', async () => {
        const p = await crearPartner();
        // Marca que sigue en la lista: pasamos de SU ofrecimiento.
        await MarcaBuscada.create({
            nombre: 'Havanna', nombreNormalizado: 'havanna', estado: 'buscando',
            userId: USER, manos: [mano(p._id, 'descartada')],
        });
        // Marca que ascendió con OTRO partner: le ganaron de mano.
        await ascendida('Bonafide', [
            mano(p._id, 'descartada'),
            mano(new mongoose.Types.ObjectId(), 'aceptada', 'Marcos'),
        ]);

        const res = await request(app).get(`/api/portal/${TOKEN}`);
        const porNombre = Object.fromEntries(res.body.marcas.map((m: any) => [m.nombre, m]));

        expect(porNombre['Havanna'].situacion.tipo).toBe('buscando');
        expect(porNombre['Bonafide'].situacion.tipo).toBe('en_pipeline');
    });

    it('igual puede volver a ofrecerse: capaz ahora sí llega', async () => {
        const p = await crearPartner();
        const marca = await MarcaBuscada.create({
            nombre: 'Havanna', nombreNormalizado: 'havanna', estado: 'buscando',
            userId: USER, manos: [mano(p._id, 'descartada')],
        });

        const res = await request(app).post(`/api/portal/${TOKEN}/marcas/${marca._id}/mano`)
            .send({ comentario: 'Ahora sí tengo cómo' });

        expect(res.status).toBe(200);
        const guardada = await MarcaBuscada.findById(marca._id);
        expect(guardada!.manos.filter(x => x.estado === 'ofrecida')).toHaveLength(1);
    });

    it('la mano descartada de OTRO partner no se le muestra', async () => {
        await crearPartner();
        await MarcaBuscada.create({
            nombre: 'Havanna', nombreNormalizado: 'havanna', estado: 'buscando', userId: USER,
            manos: [mano(new mongoose.Types.ObjectId(), 'descartada', 'Marcos')],
        });

        const m = await primeraMarca();

        // Lo que hicimos con la oferta de otro no es asunto suyo.
        expect(m.otrasManos).toBe(0);
    });
});

describe('qué gana por ayudarnos', () => {
    it('si tiene comisión pactada, el portal se la muestra', async () => {
        await crearPartner(10);
        await MarcaBuscada.create({
            nombre: 'Havanna', nombreNormalizado: 'havanna', estado: 'buscando', userId: USER,
        });

        const res = await request(app).get(`/api/portal/${TOKEN}`);

        expect(res.body.partner.comision).toBe(10);
    });

    it('si no hay comisión pactada no inventa un número', async () => {
        await crearPartner(0);
        await MarcaBuscada.create({
            nombre: 'Havanna', nombreNormalizado: 'havanna', estado: 'buscando', userId: USER,
        });

        const res = await request(app).get(`/api/portal/${TOKEN}`);

        expect(res.body.partner.comision).toBeUndefined();
    });
});

describe('qué cuenta como pendiente para él', () => {
    it('si le ganaron de mano, la marca NO le queda pendiente: no hay nada que pueda hacer', async () => {
        const p = await crearPartner();
        // Ascendida con otro: su mano quedó descartada y la tarjeta solo le
        // informa. Dejarla arriba, en el grupo de "sin responder", le pide una
        // acción que no existe.
        await ascendida('Freddo', [
            mano(p._id, 'descartada'),
            mano(new mongoose.Types.ObjectId(), 'aceptada', 'Marcos'),
        ]);
        await MarcaBuscada.create({
            nombre: 'Rapanui', nombreNormalizado: 'rapanui', estado: 'buscando', userId: USER,
        });

        const res = await request(app).get(`/api/portal/${TOKEN}`);

        expect(res.body.marcas.map((m: any) => m.nombre)).toEqual(['Rapanui', 'Freddo']);
    });

    it('en cambio si pasamos de su ofrecimiento y la marca sigue viva, sí puede volver', async () => {
        const p = await crearPartner();
        await MarcaBuscada.create({
            nombre: 'Havanna', nombreNormalizado: 'havanna', estado: 'buscando',
            userId: USER, manos: [mano(p._id, 'descartada')],
            createdAt: new Date(Date.now() - 90 * 864e5),
        });
        await MarcaBuscada.create({
            nombre: 'Rapanui', nombreNormalizado: 'rapanui', estado: 'buscando', userId: USER,
        });

        const res = await request(app).get(`/api/portal/${TOKEN}`);

        // Havanna primero: hace 90 días que no pasa nada y todavía puede ayudar.
        expect(res.body.marcas.map((m: any) => m.nombre)).toEqual(['Havanna', 'Rapanui']);
    });
});
