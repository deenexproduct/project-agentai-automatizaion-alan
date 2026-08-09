import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import marcasRoutes from '../../routes/marcas-buscadas.routes';
import { MarcaBuscada } from '../../models/marca-buscada.model';
import { Company } from '../../models/company.model';
import { Deal } from '../../models/deal.model';

let mongo: MongoMemoryServer;
let app: express.Express;
const USER_ID = new mongoose.Types.ObjectId();
const PARTNER_A = new mongoose.Types.ObjectId();
const PARTNER_B = new mongoose.Types.ObjectId();

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    app = express();
    app.use(express.json());
    app.use((req: Request, _res: Response, next: NextFunction) => {
        (req as any).user = { _id: USER_ID };
        next();
    });
    app.use('/api/marcas-buscadas', marcasRoutes);
});
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
afterEach(async () => {
    for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({});
});

async function marcaConDosManos() {
    return MarcaBuscada.create({
        nombre: 'Havanna', porQue: '180 locales', userId: USER_ID, estado: 'con_manos',
        manos: [
            { partnerId: PARTNER_A, partnerNombre: 'Marcos', levantadaEn: new Date('2026-01-10'), estado: 'ofrecida' },
            { partnerId: PARTNER_B, partnerNombre: 'Gabriel', levantadaEn: new Date('2026-01-12'), estado: 'ofrecida' },
        ],
    } as any);
}

describe('aceptar una mano', () => {
    it('crea la empresa en el CRM con su deal', async () => {
        const m = await marcaConDosManos();
        const manoId = m.manos[0]._id;

        const res = await request(app).post(`/api/marcas-buscadas/${m._id}/manos/${manoId}/aceptar`);

        expect(res.status).toBe(200);
        const empresa = await Company.findOne({ name: /havanna/i });
        expect(empresa).toBeTruthy();
        expect(await Deal.countDocuments({ company: empresa!._id })).toBe(1);
    });

    it('deja al partner asignado en la empresa', async () => {
        const m = await marcaConDosManos();
        await request(app).post(`/api/marcas-buscadas/${m._id}/manos/${m.manos[0]._id}/aceptar`);

        const empresa = await Company.findOne({ name: /havanna/i });
        expect(String(empresa!.partner)).toBe(String(PARTNER_A));
    });

    it('la marca queda ascendida y apuntando a la empresa', async () => {
        const m = await marcaConDosManos();
        await request(app).post(`/api/marcas-buscadas/${m._id}/manos/${m.manos[0]._id}/aceptar`);

        const leida = await MarcaBuscada.findById(m._id);
        const empresa = await Company.findOne({ name: /havanna/i });
        expect(leida!.estado).toBe('ascendida');
        expect(String(leida!.companyId)).toBe(String(empresa!._id));
    });

    it('las otras manos quedan descartadas PERO conservan su fecha', async () => {
        const m = await marcaConDosManos();
        await request(app).post(`/api/marcas-buscadas/${m._id}/manos/${m.manos[0]._id}/aceptar`);

        const leida = await MarcaBuscada.findById(m._id);
        const otra = leida!.manos.find((x) => String(x.partnerId) === String(PARTNER_B))!;
        expect(otra.estado).toBe('descartada');
        expect(new Date(otra.levantadaEn).toISOString()).toBe(new Date('2026-01-12').toISOString());
    });

    it('aceptar dos veces devuelve 409 y no duplica la empresa', async () => {
        const m = await marcaConDosManos();
        const manoId = m.manos[0]._id;
        await request(app).post(`/api/marcas-buscadas/${m._id}/manos/${manoId}/aceptar`);
        const segunda = await request(app).post(`/api/marcas-buscadas/${m._id}/manos/${manoId}/aceptar`);

        expect(segunda.status).toBe(409);
        expect(await Company.countDocuments({ name: /havanna/i })).toBe(1);
    });

    it('si la empresa YA existe en el CRM devuelve 409 con su id', async () => {
        await Company.create({ name: 'Havanna', userId: USER_ID, assignedTo: USER_ID });
        const m = await marcaConDosManos();

        const res = await request(app).post(`/api/marcas-buscadas/${m._id}/manos/${m.manos[0]._id}/aceptar`);

        expect(res.status).toBe(409);
        expect(res.body.existingId).toBeTruthy();
        expect((await MarcaBuscada.findById(m._id))!.estado).toBe('con_manos');
    });
});

describe('descartar una mano', () => {
    it('la marca vuelve a buscando si no quedan manos ofrecidas', async () => {
        const m = await MarcaBuscada.create({
            nombre: 'Sola', userId: USER_ID, estado: 'con_manos',
            manos: [{ partnerId: PARTNER_A, partnerNombre: 'Marcos', levantadaEn: new Date(), estado: 'ofrecida' }],
        } as any);

        await request(app).post(`/api/marcas-buscadas/${m._id}/manos/${m.manos[0]._id}/descartar`);

        const leida = await MarcaBuscada.findById(m._id);
        expect(leida!.estado).toBe('buscando');
        expect(leida!.manos[0].estado).toBe('descartada');
        expect(leida!.manos[0].levantadaEn).toBeInstanceOf(Date);
    });
});
