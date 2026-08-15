/**
 * Cuántas manos están esperando respuesta.
 *
 * El portal ya deja que un partner se ofrezca por una marca. Pero del lado
 * nuestro esa mano cae en una pantalla que hay que ir a abrir a propósito, y
 * hace 96 días que nadie abre el CRM. El partner se ofrece, no le contestamos,
 * y deja de entrar al portal: la feature se muere sola.
 *
 * Esto es el número que hace falta para ponerlo en el menú. Dos decisiones:
 *
 * 1. Cuenta MANOS, no marcas: dos partners ofreciéndose por Havanna son dos
 *    conversaciones pendientes, no una.
 * 2. Se limpia cuando ACTUÁS (aceptás o descartás), no cuando mirás. Un badge
 *    que se apaga con solo abrir la pantalla te deja igual de desinformado que
 *    antes, pero convencido de que ya lo viste.
 */

jest.mock('../../services/linkedin.service', () => ({
    linkedinService: { getTenant: () => null },
}));

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import marcasRoutes from '../../routes/marcas-buscadas.routes';
import { MarcaBuscada } from '../../models/marca-buscada.model';
import '../../models/user.model';
import '../../models/partner.model';

let mongo: MongoMemoryServer;
let app: express.Express;
const USER = new mongoose.Types.ObjectId();
const PARTNER_A = new mongoose.Types.ObjectId();
const PARTNER_B = new mongoose.Types.ObjectId();

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    app = express();
    app.use(express.json());
    app.use('/api/marcas-buscadas', (req: Request, _res: Response, next: NextFunction) => {
        (req as any).user = { _id: USER };
        next();
    }, marcasRoutes);
});
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
afterEach(async () => {
    for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({});
});

const mano = (partnerId: any, estado = 'ofrecida', nombre = 'Juani') =>
    ({ partnerId, partnerNombre: nombre, estado, levantadaEn: new Date() });

const marca = (nombre: string, extra: object = {}) => MarcaBuscada.create({
    nombre, nombreNormalizado: nombre.toLowerCase(), estado: 'con_manos', userId: USER, ...extra,
});

const pendientes = async () => {
    const res = await request(app).get('/api/marcas-buscadas/pendientes');
    expect(res.status).toBe(200);
    return res.body;
};

describe('el contador de manos esperando', () => {
    it('cuenta una mano ofrecida', async () => {
        await marca('Havanna', { manos: [mano(PARTNER_A)] });

        expect((await pendientes()).manos).toBe(1);
    });

    it('cuenta MANOS, no marcas: dos partners por la misma marca son dos', async () => {
        await marca('Havanna', { manos: [mano(PARTNER_A, 'ofrecida', 'Juani'), mano(PARTNER_B, 'ofrecida', 'Marcos')] });

        expect((await pendientes()).manos).toBe(2);
    });

    it('no cuenta las descartadas ni las aceptadas: ya las resolviste', async () => {
        await marca('Havanna', { manos: [mano(PARTNER_A, 'descartada'), mano(PARTNER_B, 'aceptada')] });

        expect((await pendientes()).manos).toBe(0);
    });

    it('en un documento con manos mezcladas cuenta solo las ofrecidas', async () => {
        await marca('Havanna', {
            manos: [mano(PARTNER_A, 'ofrecida'), mano(PARTNER_B, 'descartada')],
        });

        expect((await pendientes()).manos).toBe(1);
    });

    it('no cuenta las de una marca archivada: la sacaste de la lista a propósito', async () => {
        await marca('Guardada', { estado: 'archivada', manos: [mano(PARTNER_A)] });

        expect((await pendientes()).manos).toBe(0);
    });

    it('tampoco las de una que ya ascendió: esa conversación siguió en el pipeline', async () => {
        await marca('Grido', { estado: 'ascendida', manos: [mano(PARTNER_A)] });

        expect((await pendientes()).manos).toBe(0);
    });

    it('sin nada pendiente devuelve cero, no rompe', async () => {
        expect(await pendientes()).toEqual({ manos: 0, propuestas: 0 });
    });
});

describe('las marcas que propuso un partner', () => {
    it('se cuentan aparte: no es lo mismo ofrecerse que traer una marca nueva', async () => {
        await marca('Rapanui', { origen: 'partner', propuestaPor: PARTNER_A, manos: [mano(PARTNER_A)] });

        const p = await pendientes();

        expect(p.propuestas).toBe(1);
        // La propuesta guarda la mano adentro, así que sin separarlas el mismo
        // hecho se contaría dos veces.
        expect(p.manos).toBe(0);
    });

    it('una marca nuestra con mano cuenta como mano, no como propuesta', async () => {
        await marca('Havanna', { manos: [mano(PARTNER_A)] });

        const p = await pendientes();

        expect(p.manos).toBe(1);
        expect(p.propuestas).toBe(0);
    });
});

describe('de quién son las manos que cuento', () => {
    it('no cuenta las marcas de otro equipo', async () => {
        await MarcaBuscada.create({
            nombre: 'Ajena', nombreNormalizado: 'ajena', estado: 'con_manos',
            userId: new mongoose.Types.ObjectId(), manos: [mano(PARTNER_A)],
        });

        expect((await pendientes()).manos).toBe(0);
    });
});
