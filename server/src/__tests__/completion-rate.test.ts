import { calcularTasaSemanal, TareaParaTasa } from '../utils/completion-rate';

const LUNES = new Date('2026-03-02T00:00:00');
const DOMINGO = new Date('2026-03-08T23:59:59.999');

const tarea = (dueDate: string | null, status = 'pending'): TareaParaTasa => ({ status, dueDate });

describe('calcularTasaSemanal', () => {
    it('mide sobre lo que vencía en la ventana, no sobre el backlog histórico', () => {
        const tareas = [
            tarea('2026-03-03', 'completed'),
            tarea('2026-03-04', 'completed'),
            // backlog viejo: no debe tocar el resultado
            tarea('2025-11-01'), tarea('2025-12-15'), tarea('2026-01-20'),
        ];

        expect(calcularTasaSemanal(tareas, LUNES, DOMINGO)).toBe(100);
    });

    it('una semana en la que se hizo todo da 100, no un número aplastado', () => {
        const tareas = [
            tarea('2026-03-03', 'completed'),
            tarea('2026-03-05', 'completed'),
            ...Array.from({ length: 85 }, () => tarea('2025-06-01')),
        ];

        expect(calcularTasaSemanal(tareas, LUNES, DOMINGO)).toBe(100);
    });

    it('calcula bien una semana parcial', () => {
        const tareas = [
            tarea('2026-03-03', 'completed'),
            tarea('2026-03-04', 'completed'),
            tarea('2026-03-05', 'completed'),
            tarea('2026-03-06'),
        ];

        expect(calcularTasaSemanal(tareas, LUNES, DOMINGO)).toBe(75);
    });

    it('devuelve 0 si no vencía nada: no hubo compromiso que medir', () => {
        expect(calcularTasaSemanal([tarea('2026-01-01', 'completed')], LUNES, DOMINGO)).toBe(0);
        expect(calcularTasaSemanal([], LUNES, DOMINGO)).toBe(0);
    });

    it('las tareas sin vencimiento no entran en la cuenta', () => {
        const tareas = [tarea('2026-03-03', 'completed'), tarea(null, 'completed'), tarea(null)];

        expect(calcularTasaSemanal(tareas, LUNES, DOMINGO)).toBe(100);
    });

    it('nunca pasa de 100 ni baja de 0', () => {
        const tareas = Array.from({ length: 10 }, () => tarea('2026-03-04', 'completed'));
        const tasa = calcularTasaSemanal(tareas, LUNES, DOMINGO);

        expect(tasa).toBeLessThanOrEqual(100);
        expect(tasa).toBeGreaterThanOrEqual(0);
    });

    it('una tarea cancelada cuenta como no cumplida, no se descarta', () => {
        const tareas = [tarea('2026-03-03', 'completed'), tarea('2026-03-04', 'cancelled')];

        expect(calcularTasaSemanal(tareas, LUNES, DOMINGO)).toBe(50);
    });
});
