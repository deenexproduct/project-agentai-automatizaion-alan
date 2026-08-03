/**
 * Tasa de cumplimiento semanal: UNA sola definición para todo el sistema.
 *
 * Antes convivían tres cálculos distintos con el mismo nombre. El que se
 * persistía en el reporte semanal dividía las tareas completadas ESA SEMANA por
 * "completadas + todo el backlog histórico pendiente", así que la tasa colapsaba
 * a medida que se acumulaba trabajo viejo, sin importar cómo hubiera ido la
 * semana. Medido contra los datos reales: una semana en la que se completó el
 * 100% de lo que vencía puntuaba 9%.
 *
 * La definición correcta compara la MISMA población en numerador y denominador:
 * de las tareas que vencían en la ventana, cuántas se completaron.
 */

export interface TareaParaTasa {
    status?: string;
    dueDate?: Date | string | null;
}

/**
 * Devuelve un entero 0-100. Si no venció nada en la ventana devuelve 0:
 * no hubo compromiso que medir.
 */
export function calcularTasaSemanal(
    tareas: TareaParaTasa[],
    inicio: Date,
    fin: Date
): number {
    const vencianEnLaVentana = tareas.filter((t) => {
        if (!t.dueDate) return false;
        const vence = new Date(t.dueDate).getTime();
        return vence >= inicio.getTime() && vence <= fin.getTime();
    });

    if (vencianEnLaVentana.length === 0) return 0;

    const completadas = vencianEnLaVentana.filter((t) => t.status === 'completed').length;
    const tasa = Math.round((completadas / vencianEnLaVentana.length) * 100);

    // Clamp explícito: el resultado se renderiza como barra de progreso.
    return Math.max(0, Math.min(100, tasa));
}
