/**
 * El link de acceso del partner.
 *
 * El portal ya existía y valida contra `accessToken`, y la pantalla de Marcas
 * Buscadas ya dice "compartí el link con tus partners" — pero nada generaba ese
 * token ni lo mostraba. Los 3 partners de producción tenían 0 links: la feature
 * estaba terminada de las dos puntas y sin el eslabón del medio.
 *
 * El test que importa es el de punta a punta: generar el link y entrar al portal
 * con él. Probar el endpoint solo no prueba que la feature sirva.
 */

jest.mock('../../services/linkedin.service', () => ({
    linkedinService: { getTenant: () => null },
}));

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import partnerRoutes from '../../routes/partner.routes';
import partnerPortalRoutes from '../../routes/partner-portal.routes';
import { Partner } from '../../models/partner.model';
import { Company } from '../../models/company.model';
import { CrmContact } from '../../models/crm-contact.model';
import '../../models/user.model';

let mongo: MongoMemoryServer;
let app: express.Express;
const USER = new mongoose.Types.ObjectId();

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    app = express();
    app.use(express.json());
    // El portal es público a propósito: el token de la URL es la credencial.
    app.use('/api/portal', partnerPortalRoutes);
    app.use('/api/partners', (req: Request, _res: Response, next: NextFunction) => {
        (req as any).user = { _id: USER };
        next();
    }, partnerRoutes);
});
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
afterEach(async () => {
    for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({});
});

const crearPartner = (name = 'Marcos Aldazabal') =>
    Partner.create({ name, commissionPercentage: 10, userId: USER, assignedTo: USER });

describe('generar el link de acceso', () => {
    it('devuelve un link y lo guarda activo en el partner', async () => {
        const p = await crearPartner();

        const res = await request(app).post(`/api/partners/${p._id}/access-link`);

        expect(res.status).toBe(200);
        expect(res.body.url).toContain('/partners/');
        expect(res.body.accessToken).toEqual(expect.any(String));

        const guardado = await Partner.findById(p._id);
        expect(guardado!.accessToken).toBe(res.body.accessToken);
        expect(guardado!.accessTokenActivo).toBe(true);
    });

    it('dos partners nunca comparten token', async () => {
        const a = await crearPartner('Marcos');
        const b = await crearPartner('Gabriel');

        const ra = await request(app).post(`/api/partners/${a._id}/access-link`);
        const rb = await request(app).post(`/api/partners/${b._id}/access-link`);

        expect(ra.body.accessToken).not.toBe(rb.body.accessToken);
    });

    it('regenerar invalida el link anterior', async () => {
        const p = await crearPartner();
        const viejo = (await request(app).post(`/api/partners/${p._id}/access-link`)).body.accessToken;

        const nuevo = (await request(app).post(`/api/partners/${p._id}/access-link`)).body.accessToken;

        expect(nuevo).not.toBe(viejo);
        expect((await request(app).get(`/api/portal/${viejo}`)).status).toBe(404);
        expect((await request(app).get(`/api/portal/${nuevo}`)).status).toBe(200);
    });

    it('404 si el partner no existe', async () => {
        const res = await request(app).post('/api/partners/000000000000000000000000/access-link');
        expect(res.status).toBe(404);
    });
});

describe('EL QUE IMPORTA: el link generado abre el portal', () => {
    it('genero el link y entro al portal con él', async () => {
        const p = await crearPartner();

        const { body } = await request(app).post(`/api/partners/${p._id}/access-link`);
        const token = body.url.split('/partners/')[1];

        const portal = await request(app).get(`/api/portal/${token}`);

        expect(portal.status).toBe(200);
        expect(portal.body.partner.nombre).toBe('Marcos Aldazabal');
    });
});

describe('revocar el link', () => {
    it('después de revocar, el portal deja de abrir', async () => {
        const p = await crearPartner();
        const { body } = await request(app).post(`/api/partners/${p._id}/access-link`);
        expect((await request(app).get(`/api/portal/${body.accessToken}`)).status).toBe(200);

        const res = await request(app).delete(`/api/partners/${p._id}/access-link`);

        expect(res.status).toBe(200);
        expect((await request(app).get(`/api/portal/${body.accessToken}`)).status).toBe(404);
    });

    it('revocar no borra el token, lo desactiva (queda la trazabilidad)', async () => {
        const p = await crearPartner();
        const { body } = await request(app).post(`/api/partners/${p._id}/access-link`);

        await request(app).delete(`/api/partners/${p._id}/access-link`);

        const guardado = await Partner.findById(p._id);
        expect(guardado!.accessToken).toBe(body.accessToken);
        expect(guardado!.accessTokenActivo).toBe(false);
    });
});

describe('el listado dice quién tiene link', () => {
    it('expone si el partner tiene link activo, con su link listo para copiar', async () => {
        const conLink = await crearPartner('Con Link');
        await crearPartner('Sin Link');
        await request(app).post(`/api/partners/${conLink._id}/access-link`);

        const res = await request(app).get('/api/partners');
        const items = res.body.partners ?? res.body;

        const a = items.find((x: any) => x.name === 'Con Link');
        const b = items.find((x: any) => x.name === 'Sin Link');
        expect(a.tieneLink).toBe(true);
        expect(a.linkPortal).toContain('/partners/');
        expect(b.tieneLink).toBe(false);
        expect(b.linkPortal).toBeNull();
    });
});

describe('los contadores del listado cuentan de verdad', () => {
    it('cuenta las empresas y los contactos vinculados al partner', async () => {
        const p = await crearPartner('Con Cartera');
        await Company.create({ name: 'Empresa Del Partner', partner: p._id, userId: USER, assignedTo: USER });
        await Company.create({ name: 'Otra Del Partner', partner: p._id, userId: USER, assignedTo: USER });
        await CrmContact.create({ fullName: 'Lead Del Partner', partner: p._id, userId: USER, assignedTo: USER });
        // Ruido: no son de este partner y no deben contarse.
        await Company.create({ name: 'Ajena', userId: USER, assignedTo: USER });

        const res = await request(app).get('/api/partners');
        const fila = (res.body.partners ?? res.body).find((x: any) => x.name === 'Con Cartera');

        expect(fila.companiesCount).toBe(2);
        expect(fila.contactsCount).toBe(1);
    });
});
