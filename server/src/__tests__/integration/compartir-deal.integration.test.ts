/**
 * Compartir un deal del pipeline con un partner.
 *
 * "Las de mi pipeline que yo marco que vea": Alan abre un deal —pongamos
 * Bonafide, frenado en Contactado hace meses— y marca a qué partners se lo
 * muestra. El partner lo ve en su portal con la etapa real y puede ofrecerse.
 *
 * Se reusa `MarcaBuscada` en vez de inventar otra maquinaria: una marca con
 * `companyId` ya es exactamente "una empresa del CRM que le mostramos a un
 * partner", y el portal ya sabe resolverle la etapa.
 */

jest.mock('../../services/linkedin.service', () => ({
    linkedinService: { getTenant: () => null },
}));

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import crmRoutes from '../../routes/crm.routes';
import portalRoutes from '../../routes/partner-portal.routes';
import { MarcaBuscada } from '../../models/marca-buscada.model';
import { Partner } from '../../models/partner.model';
import { Company } from '../../models/company.model';
import { Deal } from '../../models/deal.model';
import '../../models/user.model';
import '../../models/competitor.model';
import '../../models/pos-system.model';

let mongo: MongoMemoryServer;
let app: express.Express;
const USER = new mongoose.Types.ObjectId();

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    app = express();
    app.use(express.json());
    app.use('/api/portal', portalRoutes);
    app.use('/api/crm', (req: Request, _res: Response, next: NextFunction) => {
        (req as any).user = { _id: USER };
        next();
    }, crmRoutes);
});
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
afterEach(async () => {
    for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({});
});

const partnerCon = (nombre: string, token: string) => Partner.create({
    name: nombre, userId: USER, assignedTo: USER, accessToken: token, accessTokenActivo: true,
});

async function dealEnEtapa(nombreEmpresa: string, etapa: string) {
    const empresa = await Company.create({ name: nombreEmpresa, userId: USER, assignedTo: USER });
    const deal = await Deal.create({
        title: nombreEmpresa, company: empresa._id, status: etapa, userId: USER, assignedTo: USER,
    });
    return { empresa, deal };
}

/** Lo que ve el partner: nombre → etiqueta de etapa. */
async function portalDe(token: string): Promise<Record<string, string>> {
    const res = await request(app).get(`/api/portal/${token}`);
    expect(res.status).toBe(200);
    return Object.fromEntries(res.body.marcas.map((m: any) => [m.nombre, m.situacion?.etiqueta]));
}

describe('marcar un deal para que lo vea un partner', () => {
    it('aparece en su portal con la etapa real', async () => {
        const juani = await partnerCon('Juani', 'tok-juani');
        const { deal } = await dealEnEtapa('Bonafide', 'contactado');

        const res = await request(app).post(`/api/crm/deals/${deal._id}/compartir`)
            .send({ partners: [String(juani._id)] });

        expect(res.status).toBe(200);
        expect(await portalDe('tok-juani')).toEqual({ Bonafide: 'Contactado' });
    });

    it('no lo ve un partner al que no se lo marqué', async () => {
        const juani = await partnerCon('Juani', 'tok-juani');
        await partnerCon('Marcos', 'tok-marcos');
        const { deal } = await dealEnEtapa('Bonafide', 'contactado');

        await request(app).post(`/api/crm/deals/${deal._id}/compartir`)
            .send({ partners: [String(juani._id)] });

        expect(await portalDe('tok-marcos')).toEqual({});
    });

    it('se le puede marcar a varios', async () => {
        const juani = await partnerCon('Juani', 'tok-juani');
        const marcos = await partnerCon('Marcos', 'tok-marcos');
        const { deal } = await dealEnEtapa('Freddo', 'seguimiento');

        await request(app).post(`/api/crm/deals/${deal._id}/compartir`)
            .send({ partners: [String(juani._id), String(marcos._id)] });

        expect(await portalDe('tok-juani')).toEqual({ Freddo: 'Seguimiento' });
        expect(await portalDe('tok-marcos')).toEqual({ Freddo: 'Seguimiento' });
    });

    it('dejar de compartirlo lo saca del portal', async () => {
        const juani = await partnerCon('Juani', 'tok-juani');
        const { deal } = await dealEnEtapa('Bonafide', 'contactado');
        await request(app).post(`/api/crm/deals/${deal._id}/compartir`).send({ partners: [String(juani._id)] });

        await request(app).post(`/api/crm/deals/${deal._id}/compartir`).send({ partners: [] });

        expect(await portalDe('tok-juani')).toEqual({});
    });

    it('compartirlo dos veces no duplica nada', async () => {
        const juani = await partnerCon('Juani', 'tok-juani');
        const { deal, empresa } = await dealEnEtapa('Bonafide', 'contactado');

        await request(app).post(`/api/crm/deals/${deal._id}/compartir`).send({ partners: [String(juani._id)] });
        await request(app).post(`/api/crm/deals/${deal._id}/compartir`).send({ partners: [String(juani._id)] });

        expect(await MarcaBuscada.countDocuments({ companyId: empresa._id })).toBe(1);
    });

    it('la etapa que ve es la de HOY: si el deal avanza, cambia', async () => {
        const juani = await partnerCon('Juani', 'tok-juani');
        const { deal } = await dealEnEtapa('Bonafide', 'contactado');
        await request(app).post(`/api/crm/deals/${deal._id}/compartir`).send({ partners: [String(juani._id)] });

        await Deal.updateOne({ _id: deal._id }, { $set: { status: 'negociacion' } });

        expect(await portalDe('tok-juani')).toEqual({ Bonafide: 'Negociación' });
    });

    it('404 si el deal no existe', async () => {
        await partnerCon('Juani', 'tok-juani');
        const res = await request(app).post('/api/crm/deals/000000000000000000000000/compartir')
            .send({ partners: [] });
        expect(res.status).toBe(404);
    });
});

describe('el partner puede ofrecerse sobre un deal compartido', () => {
    it('levanta la mano y queda registrada', async () => {
        const juani = await partnerCon('Juani', 'tok-juani');
        const { deal } = await dealEnEtapa('Bonafide', 'contactado');
        await request(app).post(`/api/crm/deals/${deal._id}/compartir`).send({ partners: [String(juani._id)] });

        const tablero = await request(app).get('/api/portal/tok-juani');
        const marcaId = tablero.body.marcas[0]._id;
        const res = await request(app).post(`/api/portal/tok-juani/marcas/${marcaId}/mano`)
            .send({ comentario: 'Conozco al gerente' });

        expect(res.status).toBe(200);
        const marca = await MarcaBuscada.findById(marcaId);
        expect(marca!.manos).toHaveLength(1);
        expect(marca!.manos[0].comentario).toBe('Conozco al gerente');
    });
});
