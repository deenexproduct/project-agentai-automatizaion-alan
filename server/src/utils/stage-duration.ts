/**
 * Cuánto TARDA el proceso en cada etapa, medido sobre tramos cerrados.
 *
 * El cálculo anterior hacía `ahora - fechaDeEntrada` sobre los deals que HOY
 * están parados en cada etapa. Eso no es la duración del proceso: es la
 * antigüedad de lo que está estancado. Una etapa por la que todo fluye rápido
 * casi desaparece del gráfico (los deals ya se fueron y no cuentan), y una con
 * un solo deal olvidado hace 200 días marca 200. Justo al revés de lo que
 * necesitás para saber dónde se traba el pipeline.
 *
 * Acá se mide el tramo CERRADO: desde que el deal entró a una etapa hasta que
 * salió. La etapa actual queda afuera a propósito, porque todavía no terminó.
 */

const MS_POR_DIA = 1000 * 60 * 60 * 24;

export interface CambioDeEtapa {
    from?: string | null;
    to: string;
    changedAt: Date | string;
}

/**
 * Días que un deal pasó en cada etapa de la que YA salió.
 * La etapa en la que está parado hoy no aparece: su tramo sigue abierto.
 */
export function duracionesCerradas(
    entradaInicial: Date | string,
    historial: CambioDeEtapa[] = []
): Record<string, number> {
    const cambios = [...historial]
        .filter((h) => h && h.changedAt)
        .sort((a, b) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());

    const porEtapa: Record<string, number> = {};
    if (cambios.length === 0) return porEtapa;

    let cursor = new Date(entradaInicial).getTime();
    // La etapa en la que arrancó es el `from` del primer cambio registrado.
    let etapaActual: string | null | undefined = cambios[0].from;

    for (const cambio of cambios) {
        const momento = new Date(cambio.changedAt).getTime();
        if (etapaActual && momento >= cursor) {
            const dias = Math.floor((momento - cursor) / MS_POR_DIA);
            porEtapa[etapaActual] = (porEtapa[etapaActual] || 0) + dias;
        }
        cursor = momento;
        etapaActual = cambio.to;
    }

    return porEtapa;
}

/**
 * Promedio de días por etapa across varios deals, contando sólo los tramos
 * cerrados. Devuelve además cuántas observaciones respaldan cada promedio:
 * un promedio calculado sobre un solo deal no se puede leer igual que uno
 * sobre treinta.
 */
export function promedioDiasPorEtapa(
    deals: { entrada: Date | string; historial?: CambioDeEtapa[] }[]
): Record<string, { dias: number; muestras: number }> {
    const acumulado: Record<string, number[]> = {};

    for (const deal of deals) {
        const duraciones = duracionesCerradas(deal.entrada, deal.historial || []);
        for (const [etapa, dias] of Object.entries(duraciones)) {
            if (!acumulado[etapa]) acumulado[etapa] = [];
            acumulado[etapa].push(dias);
        }
    }

    const resultado: Record<string, { dias: number; muestras: number }> = {};
    for (const [etapa, valores] of Object.entries(acumulado)) {
        const suma = valores.reduce((a, b) => a + b, 0);
        resultado[etapa] = {
            dias: Math.round(suma / valores.length),
            muestras: valores.length,
        };
    }
    return resultado;
}
