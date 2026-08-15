/**
 * Que el partner entienda en qué está cada marca.
 *
 * Hasta acá el portal sólo listaba las marcas en `buscando` y `con_manos`: en
 * cuanto una ascendía a empresa del CRM, desaparecía del portal. El partner que
 * la trajo nunca se enteraba de qué pasó después — ni si se había avanzado, ni
 * si estaba frenada.
 *
 * Ahora cada marca viaja con su situación, y las ascendidas siguen visibles
 * para quien puso la mano, mostrando la etapa real del pipeline.
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
const TOKEN = 'tok-situacion';

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

async function partner(nombre = 'Gabriel') {
    return Partner.create({ name: nombre, userId: USER, assignedTo: USER, accessToken: TOKEN, accessTokenActivo: true });
}

/** Devuelve las marcas del portal indexadas por nombre. */
async function tablero(): Promise<Record<string, any>> {
    const res = await request(app).get(`/api/portal/${TOKEN}`);
    expect(res.status).toBe(200);
    return Object.fromEntries(res.body.marcas.map((m: any) => [m.nombre, m]));
}

describe('la situación de cada marca', () => {
    it('una marca que todavía se está buscando lo dice', async () => {
        await partner();
        await MarcaBuscada.create({ nombre: 'Havanna', nombreNormalizado: 'havanna', estado: 'buscando', userId: USER });

        const m = (await tablero())['Havanna'];

        expect(m.situacion.tipo).toBe('buscando');
        expect(m.situacion.etiqueta).toMatch(/busc/i);
    });

    it('una marca ascendida muestra la ETAPA real del pipeline', async () => {
        const p = await partner();
        const empresa = await Company.create({ name: 'Grido', userId: USER, assignedTo: USER });
        await Deal.create({ title: 'Grido', company: empresa._id, status: 'coordinando', userId: USER, assignedTo: USER });
        await MarcaBuscada.create({
            nombre: 'Grido', nombreNormalizado: 'grido', estado: 'ascendida', companyId: empresa._id, userId: USER,
            manos: [{ partnerId: p._id, partnerNombre: 'Gabriel', estado: 'aceptada', levantadaEn: new Date() }],
        });

        const m = (await tablero())['Grido'];

        expect(m.situacion.tipo).toBe('en_pipeline');
        expect(m.situacion.etiqueta).toBe('Coordinando');
    });

    it('la ascendida sigue visible para quien puso la mano', async () => {
        const p = await partner();
        const empresa = await Company.create({ name: 'Bonafide', userId: USER, assignedTo: USER });
        await Deal.create({ title: 'Bonafide', company: empresa._id, status: 'ganado', userId: USER, assignedTo: USER });
        await MarcaBuscada.create({
            nombre: 'Bonafide', nombreNormalizado: 'bonafide', estado: 'ascendida', companyId: empresa._id, userId: USER,
            manos: [{ partnerId: p._id, partnerNombre: 'Gabriel', estado: 'aceptada', levantadaEn: new Date() }],
        });

        expect(Object.keys(await tablero())).toContain('Bonafide');
    });

    it('una ascendida en la que NO puso la mano no le aparece', async () => {
        await partner();
        const empresa = await Company.create({ name: 'Ajena', userId: USER, assignedTo: USER });
        await Deal.create({ title: 'Ajena', company: empresa._id, status: 'lead', userId: USER, assignedTo: USER });
        await MarcaBuscada.create({
            nombre: 'Ajena', nombreNormalizado: 'ajena', estado: 'ascendida', companyId: empresa._id, userId: USER,
            manos: [{ partnerId: new mongoose.Types.ObjectId(), partnerNombre: 'Otro', estado: 'aceptada', levantadaEn: new Date() }],
        });

        expect(Object.keys(await tablero())).not.toContain('Ajena');
    });

    it('las archivadas siguen sin mostrarse', async () => {
        await partner();
        await MarcaBuscada.create({ nombre: 'Guardada', nombreNormalizado: 'guardada', estado: 'archivada', userId: USER });

        expect(Object.keys(await tablero())).not.toContain('Guardada');
    });

    it('si ascendió pero no encuentra el deal, no rompe', async () => {
        const p = await partner();
        const empresa = await Company.create({ name: 'Sin Deal', userId: USER, assignedTo: USER });
        await MarcaBuscada.create({
            nombre: 'Sin Deal', nombreNormalizado: 'sin deal', estado: 'ascendida', companyId: empresa._id, userId: USER,
            manos: [{ partnerId: p._id, partnerNombre: 'Gabriel', estado: 'aceptada', levantadaEn: new Date() }],
        });

        const m = (await tablero())['Sin Deal'];
        expect(m.situacion.tipo).toBe('en_pipeline');
        expect(typeof m.situacion.etiqueta).toBe('string');
    });
});
