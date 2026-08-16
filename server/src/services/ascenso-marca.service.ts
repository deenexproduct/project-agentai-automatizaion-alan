import { MarcaBuscada } from '../models/marca-buscada.model';
import { crearEmpresaConDeal } from './company-creation.service';

export interface ResultadoAscenso {
    companyId: string;
    dealId?: string;
    duplicada?: { _id: string; name: string };
}

/**
 * Convierte una marca buscada en una oportunidad real del CRM.
 *
 * Es el momento en que la marca deja de ser un deseo: por eso recién acá entra
 * al pipeline y empieza a contar en las métricas.
 */
export async function ascenderMarca(
    marcaId: string, manoId: string, userId: string
): Promise<ResultadoAscenso> {
    const marca = await MarcaBuscada.findOne({ _id: marcaId, userId });
    if (!marca) throw Object.assign(new Error('Marca no encontrada'), { http: 404 });
    if (marca.estado === 'ascendida') {
        throw Object.assign(new Error('Esta marca ya fue ascendida'), { http: 409 });
    }

    const mano = marca.manos.find((m: any) => String(m._id) === String(manoId));
    if (!mano) throw Object.assign(new Error('Mano no encontrada'), { http: 404 });
    if (mano.estado !== 'ofrecida') {
        throw Object.assign(new Error('Esta mano ya fue resuelta'), { http: 409 });
    }

    const { empresa, dealId, duplicada } = await crearEmpresaConDeal(
        { name: marca.nombre, description: marca.notaInterna, partner: mano.partnerId },
        userId
    );

    if (duplicada) {
        // No se toca la marca: el usuario decide si vincula a la existente.
        return { companyId: duplicada._id, duplicada };
    }

    mano.estado = 'aceptada';
    for (const otra of marca.manos) {
        // `levantadaEn` NO se toca: es la prueba ante una discusión por comisiones.
        if (String((otra as any)._id) !== String(manoId) && otra.estado === 'ofrecida') {
            otra.estado = 'descartada';
        }
    }
    marca.estado = 'ascendida';
    marca.companyId = empresa._id;
    try {
        await marca.save();
    } catch (saveErr: any) {
        // La empresa (y su deal) ya quedaron creados en el paso anterior: si el
        // save de acá falla, queda una empresa en el CRM sin su marca ascendida
        // apuntándola. Se deja rastro para poder reconciliar a mano.
        console.error(
            `[ascenso-marca] Empresa ${empresa._id} creada pero la marca ${marcaId} no pudo marcarse como ascendida:`,
            saveErr.message
        );
        throw saveErr;
    }

    return { companyId: String(empresa._id), dealId };
}
