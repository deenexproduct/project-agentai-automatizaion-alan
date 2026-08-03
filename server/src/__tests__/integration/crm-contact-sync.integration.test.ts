/**
 * Sincronización de los campos duplicados de CrmContact.
 *
 * El modelo mantiene DOS campos para la misma relación (`company` singular y
 * `companies[]`) y dos para el mismo cargo (`position` string y `positions[]`).
 * Los mantiene alineados un hook `pre('save')`.
 *
 * Mongoose NO dispara `pre('save')` en `findOneAndUpdate` / `updateOne` /
 * `updateMany`: eso es query middleware, no document middleware. Y el PATCH de
 * contactos —y otros 5 caminos de escritura— usan justamente esos métodos.
 *
 * Consecuencia reproducida: al mover un contacto de la empresa A a la B,
 * `companies[]` queda en B pero `company` sigue en A. Como todas las lecturas
 * hacen `$or: [{company}, {companies}]`, el contacto aparece en la ficha de
 * LAS DOS empresas para siempre.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { CrmContact } from '../../models/crm-contact.model';

let mongo: MongoMemoryServer;
const USER_ID = new mongoose.Types.ObjectId();
const EMPRESA_A = new mongoose.Types.ObjectId();
const EMPRESA_B = new mongoose.Types.ObjectId();

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
});

afterEach(async () => {
    await CrmContact.deleteMany({});
});

const crearContacto = () =>
    CrmContact.create({
        fullName: 'Juan Pérez',
        companies: [EMPRESA_A],
        userId: USER_ID,
        assignedTo: USER_ID,
    });

describe('CrmContact — sincronización al crear (pre save)', () => {
    it('al crear con companies[] llena company', async () => {
        const k = await crearContacto();
        expect(String(k.company)).toBe(String(EMPRESA_A));
    });
});

describe('CrmContact — sincronización al actualizar por query', () => {
    it('findOneAndUpdate de companies[] mueve también company', async () => {
        const k = await crearContacto();

        await CrmContact.findOneAndUpdate({ _id: k._id }, { $set: { companies: [EMPRESA_B] } });

        const despues = await CrmContact.findById(k._id);
        expect(despues!.companies.map(String)).toEqual([String(EMPRESA_B)]);
        expect(String(despues!.company)).toBe(String(EMPRESA_B));
    });

    it('el contacto movido NO queda colgando de la empresa vieja', async () => {
        const k = await crearContacto();
        await CrmContact.findOneAndUpdate({ _id: k._id }, { $set: { companies: [EMPRESA_B] } });

        // Es la query real que usan los listados y la ficha de empresa
        const enA = await CrmContact.countDocuments({
            $or: [{ company: EMPRESA_A }, { companies: EMPRESA_A }],
        });
        const enB = await CrmContact.countDocuments({
            $or: [{ company: EMPRESA_B }, { companies: EMPRESA_B }],
        });

        expect(enA).toBe(0);
        expect(enB).toBe(1);
    });

    it('vaciar companies[] deja company en null', async () => {
        const k = await crearContacto();
        await CrmContact.findOneAndUpdate({ _id: k._id }, { $set: { companies: [] } });

        const despues = await CrmContact.findById(k._id);
        expect(despues!.company ?? null).toBeNull();
    });

    it('mandar solo company (legacy) llena companies[]', async () => {
        const k = await crearContacto();
        await CrmContact.findOneAndUpdate({ _id: k._id }, { $set: { company: EMPRESA_B } });

        const despues = await CrmContact.findById(k._id);
        expect(despues!.companies.map(String)).toEqual([String(EMPRESA_B)]);
    });

    it('findOneAndUpdate de positions[] actualiza position, que alimenta la búsqueda', async () => {
        const k = await crearContacto();
        await CrmContact.findOneAndUpdate({ _id: k._id }, { $set: { positions: ['CTO', 'Socio'] } });

        const despues = await CrmContact.findById(k._id);
        expect(despues!.position).toBe('CTO, Socio');
    });

    it('updateOne sincroniza igual que findOneAndUpdate (mismo bug, otro camino)', async () => {
        const k = await crearContacto();
        await CrmContact.updateOne({ _id: k._id }, { $set: { companies: [EMPRESA_B] } });

        const despues = await CrmContact.findById(k._id);
        expect(String(despues!.company)).toBe(String(EMPRESA_B));
    });

    it('un update que no toca los campos duplicados no los rompe', async () => {
        const k = await crearContacto();
        await CrmContact.findOneAndUpdate({ _id: k._id }, { $set: { phone: '+54 9 11 1234-5678' } });

        const despues = await CrmContact.findById(k._id);
        expect(String(despues!.company)).toBe(String(EMPRESA_A));
        expect(despues!.companies.map(String)).toEqual([String(EMPRESA_A)]);
    });
});
