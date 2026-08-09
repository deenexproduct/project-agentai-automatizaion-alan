import { Company } from '../models/company.model';
import { Deal } from '../models/deal.model';
import { PipelineConfig } from '../models/pipeline-config.model';

export interface ResultadoAlta {
    empresa: any;
    dealId?: string;
    duplicada?: { _id: string; name: string };
}

/** Escapa un texto para usarlo dentro de un RegExp sin que rompa la búsqueda. */
function escaparRegex(texto: string): string {
    return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Alta de empresa con su oportunidad automática.
 *
 * Es la ÚNICA puerta para crear empresas: la usan el alta manual del CRM y el
 * ascenso de una marca buscada. Si se duplica esta lógica, los dos caminos
 * divergen y uno de los dos se queda sin el dedup.
 */
export async function crearEmpresaConDeal(
    datos: Record<string, any>,
    userId: string
): Promise<ResultadoAlta> {
    const nombre = typeof datos?.name === 'string' ? datos.name.trim() : '';

    if (nombre) {
        const yaExiste = await Company.findOne({
            userId,
            name: new RegExp(`^${escaparRegex(nombre)}$`, 'i'),
        }).lean();
        if (yaExiste) {
            return {
                empresa: yaExiste,
                duplicada: { _id: String((yaExiste as any)._id), name: (yaExiste as any).name },
            };
        }
    }

    const empresa = await Company.create({
        ...datos,
        assignedTo: datos.assignedTo || userId,
        userId,
    });

    let dealId: string | undefined;
    try {
        const validKeys = await PipelineConfig.getStageKeys(userId.toString());
        const firstStage = validKeys[0] || 'lead';
        // Nunca negativo: el Deal exige `value >= 0` y si falla acá la empresa
        // queda creada pero SIN deal, o sea invisible en el pipeline.
        const dealValue = (empresa.localesCount && empresa.costPerLocation)
            ? Math.max(0, Math.round((empresa.localesCount * empresa.costPerLocation) * 100) / 100)
            : 0;

        const deal = await Deal.create({
            title: empresa.name,
            status: firstStage,
            company: empresa._id,
            value: dealValue,
            currency: 'USD',
            assignedTo: empresa.assignedTo || userId,
            userId,
        });
        dealId = String(deal._id);
    } catch (dealErr: any) {
        console.error(`⚠️ Auto-create Deal failed for company ${empresa._id}:`, dealErr.message);
    }

    return { empresa, dealId };
}
