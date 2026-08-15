/**
 * De qué dominio cuelga el link que se le manda al partner.
 *
 * El link se armaba con `process.env.FRONTEND_URL || 'http://localhost:5250'`.
 * Esa variable no está en ningún `.env.example`, así que en producción lo más
 * probable es que no exista — y entonces a Juani le copiás, sin ningún aviso,
 * un `http://localhost:5250/partners/<token>` que no le abre a nadie. La feature
 * queda muerta y todo parece haber funcionado.
 *
 * Un link roto tiene que ser un error ruidoso, no un default silencioso. En
 * desarrollo el default sigue estando, porque ahí localhost ES la respuesta
 * correcta y no queremos pedirle a nadie que configure nada para levantar el
 * proyecto.
 *
 * (El default además apuntaba al puerto 5250 mientras el front local corre en
 * el 5260: ni en desarrollo el fallback daba un link que abriera.)
 */

jest.mock('../../services/linkedin.service', () => ({
    linkedinService: { getTenant: () => null },
}));

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import partnerRoutes from '../../routes/partner.routes';
import { Partner } from '../../models/partner.model';
import '../../models/user.model';

let mongo: MongoMemoryServer;
let app: express.Express;
const USER = new mongoose.Types.ObjectId();

const ENV_ORIGINAL = { ...process.env };

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    app = express();
    app.use(express.json());
    app.use('/api/partners', (req: Request, _res: Response, next: NextFunction) => {
        (req as any).user = { _id: USER };
        next();
    }, partnerRoutes);
});
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
afterEach(async () => {
    for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({});
    process.env = { ...ENV_ORIGINAL };
});

const crearPartner = () =>
    Partner.create({ name: 'Juani', commissionPercentage: 10, userId: USER, assignedTo: USER });

/** Genera el link y devuelve la respuesta cruda. */
const generarLink = async (id: any) =>
    request(app).post(`/api/partners/${id}/access-link`);

describe('el dominio del link', () => {
    it('usa FRONTEND_URL cuando está configurada', async () => {
        process.env.FRONTEND_URL = 'https://crm.deenex.tech';
        const p = await crearPartner();

        const res = await generarLink(p._id);

        expect(res.status).toBe(200);
        expect(res.body.url).toMatch(/^https:\/\/crm\.deenex\.tech\/partners\/.+/);
    });

    it('le saca la barra final, para no armar un link con doble barra', async () => {
        process.env.FRONTEND_URL = 'https://crm.deenex.tech///';
        const p = await crearPartner();

        const res = await generarLink(p._id);

        expect(res.body.url).not.toContain('//partners');
        expect(res.body.url).toMatch(/^https:\/\/crm\.deenex\.tech\/partners\//);
    });

    it('la lee en cada pedido, no una sola vez al arrancar', async () => {
        // Antes era un `const` a nivel de módulo: el valor quedaba clavado al
        // importar la ruta, así que la config no se podía cambiar ni testear.
        process.env.FRONTEND_URL = 'https://uno.example';
        const a = await crearPartner();
        const primera = await generarLink(a._id);

        process.env.FRONTEND_URL = 'https://dos.example';
        const segunda = await generarLink(a._id);

        expect(primera.body.url).toContain('uno.example');
        expect(segunda.body.url).toContain('dos.example');
    });
});

describe('cuando FRONTEND_URL no está', () => {
    it('en producción NO devuelve un link a localhost: falla y lo dice', async () => {
        process.env.NODE_ENV = 'production';
        delete process.env.FRONTEND_URL;
        const p = await crearPartner();

        const res = await generarLink(p._id);

        expect(res.status).toBe(500);
        // El mensaje nombra la variable que falta: quien lo lea tiene que poder
        // arreglarlo sin ir a los logs. Puede mencionar localhost al explicar
        // el problema; lo que no puede es DEVOLVER un link a localhost.
        expect(res.body.error).toMatch(/FRONTEND_URL/);
        expect(res.body.url).toBeUndefined();
    });

    it('en producción tampoco deja el token generado a medias', async () => {
        process.env.NODE_ENV = 'production';
        delete process.env.FRONTEND_URL;
        const p = await crearPartner();

        await generarLink(p._id);

        // Si fallamos DESPUÉS de escribir el token, el partner queda con un
        // link activo que nadie vio nunca: imposible de mandar, imposible de
        // revocar desde la pantalla.
        const guardado = await Partner.findById(p._id);
        expect(guardado!.accessToken).toBeFalsy();
    });

    it('en desarrollo sigue andando con localhost, sin configurar nada', async () => {
        process.env.NODE_ENV = 'development';
        delete process.env.FRONTEND_URL;
        const p = await crearPartner();

        const res = await generarLink(p._id);

        expect(res.status).toBe(200);
        expect(res.body.url).toContain('localhost');
    });
});
