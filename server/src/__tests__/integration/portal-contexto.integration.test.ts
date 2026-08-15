/**
 * Que el partner entienda qué le estamos pidiendo, y pueda decir que no.
 *
 * Dos agujeros que se ven al abrir el portal de un partner real:
 *
 * 1. La etapa sola no le dice nada. "Contactado" es jerga de NUESTRO pipeline:
 *    el partner no sabe si eso va bien o está muerto hace meses. Lo que lo mueve
 *    a ayudar es el tiempo sin movimiento.
 * 2. No podía decir "a esta no llego". Sin eso, "no hacer nada" es ambiguo: no
 *    se distingue al que no entró del que miró y no puede.
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
const TOKEN = 'tok-contexto';
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

async function dealCompartido(nombre: string, etapa: string, quietoHace: number, partnerId: any) {
    const empresa = await Company.create({ name: nombre, userId: USER, assignedTo: USER });
    await Deal.create({
        title: nombre, company: empresa._id, status: etapa, userId: USER, assignedTo: USER,
        statusHistory: [{ from: 'lead', to: etapa, changedAt: hace(quietoHace), changedBy: USER }],
    });
    return MarcaBuscada.create({
        nombre, nombreNormalizado: nombre.toLowerCase(), estado: 'ascendida',
        companyId: empresa._id, partners: [partnerId], userId: USER,
    });
}

const primeraMarca = async () => {
    const res = await request(app).get(`/api/portal/${TOKEN}`);
    expect(res.status).toBe(200);
    return res.body.marcas[0];
};

describe('cuánto hace que no se mueve', () => {
    it('un deal frenado lo dice, para que el partner entienda que hace falta', async () => {
        const p = await crearPartner();
        await dealCompartido('Bonafide', 'contactado', 128, p._id);

        const m = await primeraMarca();

        expect(m.situacion.diasQuieto).toBe(128);
    });

    it('uno que se movió recién no muestra alarma', async () => {
        const p = await crearPartner();
        await dealCompartido('Freddo', 'negociacion', 3, p._id);

        const m = await primeraMarca();

        expect(m.situacion.diasQuieto).toBe(3);
    });

    it('una marca que todavía se busca no tiene días quieto', async () => {
        await crearPartner();
        await MarcaBuscada.create({ nombre: 'Havanna', nombreNormalizado: 'havanna', estado: 'buscando', userId: USER });

        const m = await primeraMarca();

        expect(m.situacion.tipo).toBe('buscando');
        expect(m.situacion.diasQuieto).toBeUndefined();
    });
});

describe('decir que no llego', () => {
    it('queda registrado y el portal lo devuelve', async () => {
        const p = await crearPartner();
        const marca = await dealCompartido('Bonafide', 'contactado', 100, p._id);

        const res = await request(app).post(`/api/portal/${TOKEN}/marcas/${marca._id}/no-llego`);

        expect(res.status).toBe(200);
        expect((await primeraMarca()).noLlego).toBe(true);
    });

    it('no cuenta como mano levantada: no es una oferta', async () => {
        const p = await crearPartner();
        const marca = await dealCompartido('Bonafide', 'contactado', 100, p._id);

        await request(app).post(`/api/portal/${TOKEN}/marcas/${marca._id}/no-llego`);

        const guardada = await MarcaBuscada.findById(marca._id);
        expect(guardada!.manos).toHaveLength(0);
        expect(guardada!.sinLlegada.map(String)).toContain(String(p._id));
    });

    it('se puede volver atrás: si después llega, levanta la mano', async () => {
        const p = await crearPartner();
        const marca = await dealCompartido('Bonafide', 'contactado', 100, p._id);
        await request(app).post(`/api/portal/${TOKEN}/marcas/${marca._id}/no-llego`);

        const res = await request(app).post(`/api/portal/${TOKEN}/marcas/${marca._id}/mano`)
            .send({ comentario: 'Me acordé de alguien' });

        expect(res.status).toBe(200);
        const guardada = await MarcaBuscada.findById(marca._id);
        expect(guardada!.manos).toHaveLength(1);
        // Al ofrecerse deja de estar en "no llego": no puede ser las dos cosas.
        expect(guardada!.sinLlegada.map(String)).not.toContain(String(p._id));
    });

    it('decirlo dos veces no rompe ni duplica', async () => {
        const p = await crearPartner();
        const marca = await dealCompartido('Bonafide', 'contactado', 100, p._id);

        await request(app).post(`/api/portal/${TOKEN}/marcas/${marca._id}/no-llego`);
        await request(app).post(`/api/portal/${TOKEN}/marcas/${marca._id}/no-llego`);

        const guardada = await MarcaBuscada.findById(marca._id);
        expect(guardada!.sinLlegada).toHaveLength(1);
    });

    it('un token revocado no puede marcar nada', async () => {
        const p = await crearPartner();
        const marca = await dealCompartido('Bonafide', 'contactado', 100, p._id);
        await Partner.updateOne({ _id: p._id }, { $set: { accessTokenActivo: false } });

        const res = await request(app).post(`/api/portal/${TOKEN}/marcas/${marca._id}/no-llego`);

        expect(res.status).toBe(404);
        expect((await MarcaBuscada.findById(marca._id))!.sinLlegada).toHaveLength(0);
    });
});

describe('un partner cargado por otro miembro del equipo', () => {
    const OTRO = new mongoose.Types.ObjectId();
    const TOKEN_AJENO = 'tok-ajeno';

    const partnerAjeno = () => Partner.create({
        name: 'Juani', userId: OTRO, assignedTo: OTRO,
        accessToken: TOKEN_AJENO, accessTokenActivo: true,
    });

    it('puede levantar la mano en un deal que le compartimos', async () => {
        const p = await partnerAjeno();
        const marca = await dealCompartido('Bonafide', 'contactado', 100, p._id);

        const res = await request(app).post(`/api/portal/${TOKEN_AJENO}/marcas/${marca._id}/mano`)
            .send({ comentario: 'Conozco al gerente' });

        expect(res.status).toBe(200);
        expect((await MarcaBuscada.findById(marca._id))!.manos).toHaveLength(1);
    });

    it('puede decir que no llega', async () => {
        const p = await partnerAjeno();
        const marca = await dealCompartido('Bonafide', 'contactado', 100, p._id);

        const res = await request(app).post(`/api/portal/${TOKEN_AJENO}/marcas/${marca._id}/no-llego`);

        expect(res.status).toBe(200);
        expect((await MarcaBuscada.findById(marca._id))!.sinLlegada).toHaveLength(1);
    });

    it('pero NO puede tocar una marca que no le compartimos', async () => {
        await partnerAjeno();
        const otra = await MarcaBuscada.create({
            nombre: 'Ajena', nombreNormalizado: 'ajena', estado: 'buscando', userId: USER,
            partners: [new mongoose.Types.ObjectId()],
        });

        const res = await request(app).post(`/api/portal/${TOKEN_AJENO}/marcas/${otra._id}/no-llego`);

        expect(res.status).toBe(404);
    });
});
