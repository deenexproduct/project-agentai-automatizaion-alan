/**
 * Qué NO le mandamos al partner.
 *
 * El portal es público —el token de la URL es toda la credencial— y el partner
 * es alguien de afuera. Peor: los partners compiten entre sí por la misma
 * comisión.
 *
 * Y hasta acá le mandábamos, de las manos de los OTROS: el nombre completo y el
 * comentario textual. La pantalla dibuja una inicial en un círculo, pero el
 * nombre sale en el `title` al pasar el mouse y el comentario viaja en el JSON
 * igual, a un click de las herramientas del navegador. O sea que Juani podía
 * leer "le vendo hace 8 años al gerente de compras de Bonafide — Marcos".
 *
 * Lo único que le sirve saber es que no está solo. Eso es un número.
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
const TOKEN = 'tok-privacidad';

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

const manoAjena = (nombre: string, comentario: string, estado = 'ofrecida') => ({
    partnerId: new mongoose.Types.ObjectId(), partnerNombre: nombre,
    comentario, estado, levantadaEn: new Date(),
});

const crudo = async () => JSON.stringify((await request(app).get(`/api/portal/${TOKEN}`)).body);

describe('lo que sabe de sus competidores', () => {
    it('no le llega el nombre del otro partner, ni escondido en el JSON', async () => {
        await crearPartner();
        await MarcaBuscada.create({
            nombre: 'Bonafide', nombreNormalizado: 'bonafide', estado: 'con_manos', userId: USER,
            manos: [manoAjena('Marcos Aldazabal', 'Le vendo hace 8 años al gerente de compras')],
        });

        const texto = await crudo();

        expect(texto).not.toContain('Marcos Aldazabal');
        expect(texto).not.toContain('gerente de compras');
    });

    it('sí le decimos CUÁNTOS más se ofrecieron: eso no lo delata a nadie', async () => {
        await crearPartner();
        await MarcaBuscada.create({
            nombre: 'Bonafide', nombreNormalizado: 'bonafide', estado: 'con_manos', userId: USER,
            manos: [manoAjena('Marcos', 'x'), manoAjena('Sofía', 'y')],
        });

        const res = await request(app).get(`/api/portal/${TOKEN}`);

        expect(res.body.marcas[0].otrasManos).toBe(2);
    });

    it('las descartadas de otros no se cuentan: esa oferta ya no existe', async () => {
        await crearPartner();
        await MarcaBuscada.create({
            nombre: 'Bonafide', nombreNormalizado: 'bonafide', estado: 'con_manos', userId: USER,
            manos: [manoAjena('Marcos', 'x'), manoAjena('Sofía', 'y', 'descartada')],
        });

        const res = await request(app).get(`/api/portal/${TOKEN}`);

        expect(res.body.marcas[0].otrasManos).toBe(1);
    });

    it('su propia mano no se cuenta como ajena', async () => {
        const p = await crearPartner();
        await MarcaBuscada.create({
            nombre: 'Bonafide', nombreNormalizado: 'bonafide', estado: 'con_manos', userId: USER,
            manos: [{ partnerId: p._id, partnerNombre: 'Juani', estado: 'ofrecida', levantadaEn: new Date() }],
        });

        const res = await request(app).get(`/api/portal/${TOKEN}`);

        expect(res.body.marcas[0].otrasManos).toBe(0);
        expect(res.body.marcas[0].miMano.estado).toBe('ofrecida');
    });

    it('el comentario PROPIO sí le vuelve: es lo que él escribió', async () => {
        const p = await crearPartner();
        await MarcaBuscada.create({
            nombre: 'Bonafide', nombreNormalizado: 'bonafide', estado: 'con_manos', userId: USER,
            manos: [{ partnerId: p._id, partnerNombre: 'Juani', comentario: 'Conozco al dueño', estado: 'ofrecida', levantadaEn: new Date() }],
        });

        expect(await crudo()).toContain('Conozco al dueño');
    });
});

describe('la puerta y la cerradura tienen que medir lo mismo', () => {
    it('si ve una marca ascendida por haber puesto la mano, puede ofrecerse de nuevo', async () => {
        // El listado la muestra por `manos.partnerId`, pero la acción exigía
        // estar en `partners`: veía la tarjeta y al tocar el botón comía un 404
        // en rojo. Es el mismo bug de siempre — si el listado lo muestra, el
        // detalle tiene que abrirlo.
        const p = await crearPartner();
        const empresa = await Company.create({ name: 'Bonafide', userId: USER, assignedTo: USER });
        await Deal.create({ title: 'Bonafide', company: empresa._id, status: 'coordinando', userId: USER, assignedTo: USER });
        const marca = await MarcaBuscada.create({
            nombre: 'Bonafide', nombreNormalizado: 'bonafide', estado: 'ascendida',
            companyId: empresa._id, userId: USER,
            manos: [{ partnerId: p._id, partnerNombre: 'Juani', estado: 'descartada', levantadaEn: new Date() }],
        });

        // La ve en el portal…
        const tablero = await request(app).get(`/api/portal/${TOKEN}`);
        expect(tablero.body.marcas.map((m: any) => m.nombre)).toContain('Bonafide');

        // …y puede tocarla.
        const res = await request(app).post(`/api/portal/${TOKEN}/marcas/${marca._id}/mano`)
            .send({ comentario: 'Sigo teniendo llegada' });

        expect(res.status).toBe(200);
    });

    it('pero sigue sin poder tocar una que nunca vio', async () => {
        await crearPartner();
        const ajena = await MarcaBuscada.create({
            nombre: 'Ajena', nombreNormalizado: 'ajena', estado: 'buscando',
            userId: USER, partners: [new mongoose.Types.ObjectId()],
        });

        const res = await request(app).post(`/api/portal/${TOKEN}/marcas/${ajena._id}/mano`).send({});

        expect(res.status).toBe(404);
    });
});
