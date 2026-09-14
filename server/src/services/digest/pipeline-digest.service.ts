import mongoose from 'mongoose';
import { Company } from '../../models/company.model';
import { Deal } from '../../models/deal.model';
import { Task } from '../../models/task.model';

/**
 * Digest del pipeline: qué se está enfriando y qué compromisos vencieron.
 *
 * Nace de un dato incómodo: hace meses que nadie abre el CRM, pero el CRM ya
 * sabe qué se está muriendo. Le falta voz, no datos. Esto es la voz.
 */

/** Etapas donde el deal ya no está en juego. */
const CERRADAS = ['ganado', 'perdido', 'pausado'];
/** Días sin movimiento a partir de los cuales un deal cuenta como enfriándose. */
const DIAS_QUIETO = 14;
/** Cuántos ítems se listan. El mensaje tiene que leerse en 15 segundos. */
const TOP = 3;

export interface DealFrio {
    dealId: string;
    empresa: string;
    etapa: string;
    valor: number;
    moneda: string;
    diasQuieto: number;
}

export interface CompromisoVencido {
    taskId: string;
    empresa: string;
    titulo: string;
    diasVencido: number;
}

export interface Digest {
    enfriandose: DealFrio[];
    compromisos: CompromisoVencido[];
    totales: { dealsFrios: number; usdCongelado: number; compromisosVencidos: number };
}

const diasEntre = (desde: Date | string, hasta: Date) =>
    Math.round((hasta.getTime() - new Date(desde).getTime()) / 864e5);

/**
 * Los dueños de todo lo que hay en el pipeline, sacados del pipeline mismo.
 *
 * La lista NO sale de la colección `users`: 81 de los 180 deals de producción
 * tienen un `userId` que ahí no existe (entraron por la importación con IA).
 * Armando la lista desde `users`, el digest cubría poco más de la mitad del
 * pipeline y lo informaba con el tono de ser el total — un resumen que subcuenta
 * en silencio es peor que no mandar nada, porque se decide sobre él creyendo
 * que está completo.
 */
export async function userIdsDelPipeline(): Promise<string[]> {
    const [deDeals, deTareas] = await Promise.all([
        Deal.distinct('userId'),
        Task.distinct('userId'),
    ]);
    return [...new Set([...deDeals, ...deTareas].filter(Boolean).map(String))];
}

/**
 * @param userIds uno o varios dueños. La data del CRM está repartida entre
 * miembros del equipo (Thainá tiene 53 tareas que nadie más ve), así que un
 * digest de un solo usuario muestra media película.
 */
export async function calcularDigest(
    userIds: string | string[],
    ahora: Date,
    opciones: { top?: number; diasQuieto?: number } = {}
): Promise<Digest> {
    const top = opciones.top ?? TOP;
    const umbral = opciones.diasQuieto ?? DIAS_QUIETO;
    const uids = (Array.isArray(userIds) ? userIds : [userIds]).map(id => new mongoose.Types.ObjectId(id));

    const [deals, tareas] = await Promise.all([
        Deal.find({ userId: { $in: uids }, status: { $nin: CERRADAS } }).lean(),
        Task.find({ userId: { $in: uids }, status: { $in: ['pending', 'in_progress'] }, dueDate: { $lt: ahora } }).lean(),
    ]);

    // Las empresas se buscan por los ids REFERENCIADOS, no por dueño: hay deals
    // que apuntan a empresas cargadas por otro miembro del equipo, y filtrando
    // por userId el nombre no aparecía y caía al título crudo del deal.
    const idsEmpresa = [...new Set([...deals, ...tareas].map(x => x.company).filter(Boolean).map(String))];
    const empresas = await Company.find({ _id: { $in: idsEmpresa } }, { name: 1 }).lean();

    const nombre = new Map(empresas.map(e => [String(e._id), e.name]));

    // Sólo los que AVANZARON alguna vez: statusHistory arranca vacío, así que
    // una entrada ya significa que se movió de etapa. Un lead que nunca se
    // movió es frío de nacimiento, no una oportunidad enfriándose — mezclarlos
    // convierte el mensaje en una lista inútil de 123.
    const frios: DealFrio[] = deals
        .filter(d => (d.statusHistory || []).length >= 1)
        .map(d => {
            const ultimo = d.statusHistory![d.statusHistory!.length - 1];
            return {
                dealId: String(d._id),
                empresa: nombre.get(String(d.company)) || d.title,
                etapa: d.status,
                valor: d.value || 0,
                moneda: d.currency || 'USD',
                diasQuieto: diasEntre(ultimo.changedAt || (d as any).updatedAt, ahora),
            };
        })
        .filter(d => d.diasQuieto > umbral);

    const compromisos: CompromisoVencido[] = tareas
        .filter(t => t.company)
        .map(t => ({
            taskId: String(t._id),
            empresa: nombre.get(String(t.company)) || '—',
            titulo: t.title,
            diasVencido: diasEntre(t.dueDate!, ahora),
        }))
        .sort((a, b) => b.diasVencido - a.diasVencido);

    return {
        // Se listan los más caros, pero los totales cuentan TODOS: así sabés
        // que hay más sin que el mensaje sea una pared.
        enfriandose: [...frios].sort((a, b) => b.valor - a.valor || b.diasQuieto - a.diasQuieto).slice(0, top),
        compromisos: compromisos.slice(0, top),
        totales: {
            dealsFrios: frios.length,
            usdCongelado: frios.reduce((a, d) => a + d.valor, 0),
            compromisosVencidos: compromisos.length,
        },
    };
}
