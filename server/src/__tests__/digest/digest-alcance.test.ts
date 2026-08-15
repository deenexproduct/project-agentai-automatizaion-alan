/**
 * A quién le pertenece el pipeline que resume el digest.
 *
 * `calcularDigest` recibe una lista de userIds y filtra por ella. El único que
 * la arma hoy es el dry-run, y la saca de `UserModel.find({})`: los usuarios que
 * existen en la colección `users`.
 *
 * El problema es que **81 de los 180 deals de producción tienen un `userId` que
 * no existe en `users`** — son los que entraron por la importación con IA. Con
 * ese criterio el digest cubre poco más de la mitad del pipeline y no lo dice:
 * manda "29 deals frenados" con el tono de ser el total.
 *
 * Un resumen que subcuenta en silencio es peor que no mandar nada: se toman
 * decisiones sobre él creyendo que está completo.
 *
 * Estos tests fijan que el digest cubre TODO el pipeline del equipo, venga el
 * deal de un usuario registrado o de la importación.
 */

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { calcularDigest, userIdsDelPipeline } from '../../services/digest/pipeline-digest.service';
import { Company } from '../../models/company.model';
import { Deal } from '../../models/deal.model';
import { Task } from '../../models/task.model';
import { UserModel } from '../../models/user.model';

let mongo: MongoMemoryServer;
const REGISTRADO = new mongoose.Types.ObjectId();
const HUERFANO = new mongoose.Types.ObjectId(); // dueño que NO está en `users`
const AHORA = new Date('2026-08-15T12:00:00Z');
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 864e5);

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
});
afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });
afterEach(async () => {
    for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({});
});

/** Un deal frenado hace 30 días, de quien se le diga. */
async function dealFrenado(nombre: string, dueño: mongoose.Types.ObjectId, valor = 1000) {
    const emp = await Company.create({ name: nombre, userId: dueño, assignedTo: dueño });
    return Deal.create({
        title: nombre, company: emp._id, value: valor, currency: 'USD', status: 'seguimiento',
        statusHistory: [
            { from: 'lead', to: 'contactado', changedAt: hace(70), changedBy: dueño },
            { from: 'contactado', to: 'seguimiento', changedAt: hace(30), changedBy: dueño },
        ],
        userId: dueño, assignedTo: dueño,
    });
}

describe('de dónde salen los dueños del pipeline', () => {
    it('incluye a los dueños que NO están en la colección users', async () => {
        await UserModel.create({ name: 'Alan', email: 'a@deenex.tech', password: 'x', _id: REGISTRADO });
        await dealFrenado('De un usuario registrado', REGISTRADO);
        await dealFrenado('De la importación con IA', HUERFANO);

        const ids = await userIdsDelPipeline();

        expect(ids.map(String).sort()).toEqual([String(REGISTRADO), String(HUERFANO)].sort());
    });

    it('no repite un dueño que aparece en muchos deals', async () => {
        await dealFrenado('Uno', HUERFANO);
        await dealFrenado('Dos', HUERFANO);
        await dealFrenado('Tres', HUERFANO);

        expect(await userIdsDelPipeline()).toHaveLength(1);
    });

    it('también toma los dueños que solo tienen tareas, sin deals', async () => {
        const soloTareas = new mongoose.Types.ObjectId();
        const emp = await Company.create({ name: 'Havanna', userId: soloTareas, assignedTo: soloTareas });
        await Task.create({
            title: 'Mandar propuesta', company: emp._id, status: 'pending',
            dueDate: hace(10), userId: soloTareas, assignedTo: soloTareas,
        });

        expect((await userIdsDelPipeline()).map(String)).toContain(String(soloTareas));
    });

    it('con la base vacía devuelve lista vacía, no explota', async () => {
        expect(await userIdsDelPipeline()).toEqual([]);
    });
});

describe('el digest cubre el pipeline entero', () => {
    it('cuenta los deals de la importación, no solo los de usuarios registrados', async () => {
        await UserModel.create({ name: 'Alan', email: 'a@deenex.tech', password: 'x', _id: REGISTRADO });
        await dealFrenado('Bonafide', REGISTRADO, 9800);
        await dealFrenado('Freddo', HUERFANO, 7350);

        const d = await calcularDigest(await userIdsDelPipeline(), AHORA);

        expect(d.totales.dealsFrios).toBe(2);
        expect(d.totales.usdCongelado).toBe(17150);
        expect(d.enfriandose.map(x => x.empresa)).toEqual(['Bonafide', 'Freddo']);
    });

    it('así se ve el bug si se arranca desde users: media película', async () => {
        // Este test documenta el comportamiento VIEJO a propósito, para que si
        // alguien vuelve a armar la lista desde `users` quede claro qué se pierde.
        await UserModel.create({ name: 'Alan', email: 'a@deenex.tech', password: 'x', _id: REGISTRADO });
        await dealFrenado('Bonafide', REGISTRADO, 9800);
        await dealFrenado('Freddo', HUERFANO, 7350);

        const soloRegistrados = (await UserModel.find({}, { _id: 1 }).lean()).map(u => String(u._id));
        const d = await calcularDigest(soloRegistrados, AHORA);

        expect(d.totales.dealsFrios).toBe(1);          // ← se pierde Freddo
        expect(d.totales.usdCongelado).toBe(9800);     // ← y sus USD 7.350
    });
});
