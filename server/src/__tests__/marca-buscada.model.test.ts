import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { MarcaBuscada, normalizarNombre } from '../models/marca-buscada.model';

let mongo: MongoMemoryServer;
const USER_ID = new mongoose.Types.ObjectId();

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await MarcaBuscada.syncIndexes();
});
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
afterEach(async () => { await MarcaBuscada.deleteMany({}); });

const crear = (nombre: string) =>
    MarcaBuscada.create({ nombre, porQue: '180 locales', userId: USER_ID });

describe('normalizarNombre', () => {
    it('saca acentos, espacios de más y mayúsculas', () => {
        expect(normalizarNombre('  Café  Martínez ')).toBe('cafe martinez');
    });
});

describe('MarcaBuscada', () => {
    it('arranca en estado buscando y sin manos', async () => {
        const m = await crear('Havanna');
        expect(m.estado).toBe('buscando');
        expect(m.manos).toHaveLength(0);
    });

    it('deriva nombreNormalizado al guardar', async () => {
        const m = await crear('  Grido  ');
        expect(m.nombreNormalizado).toBe('grido');
    });

    it('no permite dos marcas con el mismo nombre para el mismo dueño', async () => {
        await crear('Havanna');
        await expect(crear('  havanna ')).rejects.toThrow();
    });

    it('otro dueño sí puede tener la misma marca', async () => {
        await crear('Havanna');
        const otra = MarcaBuscada.create({
            nombre: 'Havanna', porQue: 'x', userId: new mongoose.Types.ObjectId(),
        });
        await expect(otra).resolves.toBeTruthy();
    });

    it('rechaza un estado inventado', async () => {
        await expect(MarcaBuscada.create({
            nombre: 'X', userId: USER_ID, estado: 'raro',
        } as any)).rejects.toThrow();
    });

    it('guarda la mano con su fecha y estado inicial', async () => {
        const m = await crear('Havanna');
        m.manos.push({
            partnerId: new mongoose.Types.ObjectId(),
            partnerNombre: 'Marcos',
            comentario: 'mi cuñado es gerente de expansión',
            levantadaEn: new Date(),
        } as any);
        await m.save();

        const leida = await MarcaBuscada.findById(m._id);
        expect(leida!.manos[0].estado).toBe('ofrecida');
        expect(leida!.manos[0].levantadaEn).toBeInstanceOf(Date);
    });
});
