/**
 * La nota interna no sale al portal.
 *
 * `porQue` era un solo campo con dos dueños: lo escribíamos nosotros desde el
 * CRM ("están peleados con el proveedor actual", "el dueño está por vender")
 * y se renderizaba TAL CUAL en la pantalla pública del partner.
 *
 * Nadie decidió eso: el campo nació para el CRM y alguien lo mandó al portal
 * porque estaba a mano. Es la forma clásica de filtrar — un campo interno que
 * se vuelve público sin que cambie su nombre ni su formulario.
 *
 * Ahora son dos campos con nombres que no se confunden:
 *   `notaInterna`          — para nosotros. NUNCA sale del CRM.
 *   `contextoParaPartner`  — escrito a propósito para que lo lea el partner.
 *
 * El rename es parte del arreglo: mientras se llamara `porQue`, el próximo que
 * arme un endpoint lo va a volver a mandar sin pensarlo.
 */

jest.mock('../../services/linkedin.service', () => ({
    linkedinService: { getTenant: () => null },
}));

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import portalRoutes from '../../routes/partner-portal.routes';
import marcasRoutes from '../../routes/marcas-buscadas.routes';
import { MarcaBuscada } from '../../models/marca-buscada.model';
import { Partner } from '../../models/partner.model';
import '../../models/user.model';

let mongo: MongoMemoryServer;
let app: express.Express;
const USER = new mongoose.Types.ObjectId();
const TOKEN = 'tok-nota';
const SECRETO = 'Están peleados con el proveedor actual, entrar por ahí';

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

const crearPartner = () => Partner.create({
    name: 'Juani', userId: USER, assignedTo: USER, accessToken: TOKEN, accessTokenActivo: true,
});

const portalCrudo = async () =>
    JSON.stringify((await request(app).get(`/api/portal/${TOKEN}`)).body);

describe('lo que escribimos para nosotros', () => {
    it('la nota interna NO viaja al portal, ni en un campo con otro nombre', async () => {
        await crearPartner();
        await MarcaBuscada.create({
            nombre: 'Bonafide', nombreNormalizado: 'bonafide', estado: 'buscando',
            userId: USER, notaInterna: SECRETO,
        });

        expect(await portalCrudo()).not.toContain('peleados');
    });

    it('el contexto escrito PARA el partner sí le llega', async () => {
        await crearPartner();
        await MarcaBuscada.create({
            nombre: 'Bonafide', nombreNormalizado: 'bonafide', estado: 'buscando', userId: USER,
            notaInterna: SECRETO,
            contextoParaPartner: '180 locales, el delivery lo tercerizan',
        });

        const res = await request(app).get(`/api/portal/${TOKEN}`);

        expect(res.body.marcas[0].contexto).toBe('180 locales, el delivery lo tercerizan');
        expect(JSON.stringify(res.body)).not.toContain('peleados');
    });

    it('una marca sin contexto público no muestra nada, no cae en la nota interna', async () => {
        await crearPartner();
        await MarcaBuscada.create({
            nombre: 'Bonafide', nombreNormalizado: 'bonafide', estado: 'buscando',
            userId: USER, notaInterna: SECRETO,
        });

        const res = await request(app).get(`/api/portal/${TOKEN}`);

        expect(res.body.marcas[0].contexto).toBeUndefined();
    });
});

describe('desde el CRM se pueden escribir los dos', () => {
    it('guarda la nota interna y el contexto público por separado', async () => {
        const res = await request(app).post('/api/marcas-buscadas').send({
            nombre: 'Havanna',
            notaInterna: SECRETO,
            contextoParaPartner: '180 locales',
        });

        expect(res.status).toBe(201);
        const m = await MarcaBuscada.findOne({ nombreNormalizado: 'havanna' });
        expect(m!.notaInterna).toBe(SECRETO);
        expect(m!.contextoParaPartner).toBe('180 locales');
    });

    it('se pueden editar los dos por PATCH', async () => {
        const m = await MarcaBuscada.create({
            nombre: 'Havanna', nombreNormalizado: 'havanna', estado: 'buscando', userId: USER,
        });

        await request(app).patch(`/api/marcas-buscadas/${m._id}`)
            .send({ notaInterna: 'ojo con el socio', contextoParaPartner: 'buscan crecer' });

        const leida = await MarcaBuscada.findById(m._id);
        expect(leida!.notaInterna).toBe('ojo con el socio');
        expect(leida!.contextoParaPartner).toBe('buscan crecer');
    });
});

describe('cuando la marca la propone el partner', () => {
    it('lo que él escribe NO cae en la nota interna: no es nuestra', async () => {
        await crearPartner();

        await request(app).post(`/api/portal/${TOKEN}/marcas`)
            .send({ nombre: 'Rapanui', porQue: 'El dueño es cliente mío hace años' });

        const m = await MarcaBuscada.findOne({ nombreNormalizado: 'rapanui' });
        // Su explicación es de él y ya vive en su mano. Meterla en un campo que
        // se llama "nota interna" mezcla lo que dijo un tercero con lo que
        // anotamos nosotros, y ahí es donde después uno se confunde.
        expect(m!.notaInterna).toBeUndefined();
        expect(m!.manos[0].comentario).toBe('El dueño es cliente mío hace años');
    });

    it('y él sigue viendo su propio comentario', async () => {
        await crearPartner();

        await request(app).post(`/api/portal/${TOKEN}/marcas`)
            .send({ nombre: 'Rapanui', porQue: 'El dueño es cliente mío hace años' });

        const res = await request(app).get(`/api/portal/${TOKEN}`);

        expect(res.body.marcas[0].miMano.comentario).toBe('El dueño es cliente mío hace años');
    });
});
