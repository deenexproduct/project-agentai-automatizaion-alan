import { Digest } from './pipeline-digest.service';

/**
 * Arma el mensaje del digest.
 *
 * Dos reglas que lo hacen sobrevivir: si no hay nada, no manda nada (un digest
 * que llega vacío todas las semanas se silencia solo), y no supera las 12
 * líneas — una pared de 47 pendientes no es información, es culpa.
 */

const plata = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 0 });

export function formatearDigest(d: Digest, opciones: { urlBase?: string } = {}): string | null {
    const { dealsFrios, usdCongelado, compromisosVencidos } = d.totales;
    if (!dealsFrios && !compromisosVencidos) return null;

    const lineas: string[] = [];

    if (dealsFrios) {
        lineas.push(`🔻 *Se te están enfriando ${dealsFrios} deals* — USD ${plata(usdCongelado)} frenados`);
        for (const x of d.enfriandose) {
            lineas.push(`   • ${x.empresa} · ${x.etapa} · ${x.moneda} ${plata(x.valor)} · quieto ${x.diasQuieto} días`);
        }
        const resto = dealsFrios - d.enfriandose.length;
        if (resto > 0) lineas.push(`   _(y ${resto} más)_`);
    }

    if (compromisosVencidos) {
        if (lineas.length) lineas.push('');
        lineas.push(`⏰ *${compromisosVencidos} compromisos vencidos*`);
        for (const c of d.compromisos) {
            lineas.push(`   • ${c.empresa} — "${c.titulo}" (${c.diasVencido} días)`);
        }
    }

    if (opciones.urlBase) {
        lineas.push('');
        lineas.push(`${opciones.urlBase}/linkedin/pipeline`);
    }

    return lineas.join('\n');
}
