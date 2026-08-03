import { duracionesCerradas, promedioDiasPorEtapa } from '../utils/stage-duration';

const dia = (n: number) => new Date(2026, 0, n).toISOString();

describe('duracionesCerradas', () => {
    it('mide el tramo entre entrar y salir de cada etapa', () => {
        const d = duracionesCerradas(dia(1), [
            { from: 'lead', to: 'contactado', changedAt: dia(6) },      // 5 días en lead
            { from: 'contactado', to: 'negociacion', changedAt: dia(9) }, // 3 en contactado
        ]);

        expect(d.lead).toBe(5);
        expect(d.contactado).toBe(3);
    });

    it('NO cuenta la etapa actual: su tramo sigue abierto', () => {
        const d = duracionesCerradas(dia(1), [
            { from: 'lead', to: 'negociacion', changedAt: dia(4) },
        ]);

        expect(d.lead).toBe(3);
        expect(d.negociacion).toBeUndefined();
    });

    it('un deal que nunca se movió no aporta ninguna duración', () => {
        expect(duracionesCerradas(dia(1), [])).toEqual({});
    });

    it('suma los tramos si el deal pasó dos veces por la misma etapa', () => {
        const d = duracionesCerradas(dia(1), [
            { from: 'lead', to: 'contactado', changedAt: dia(3) },   // 2 en lead
            { from: 'contactado', to: 'lead', changedAt: dia(5) },   // 2 en contactado
            { from: 'lead', to: 'ganado', changedAt: dia(9) },       // 4 más en lead
        ]);

        expect(d.lead).toBe(6);
        expect(d.contactado).toBe(2);
    });

    it('ordena el historial aunque venga desordenado', () => {
        const d = duracionesCerradas(dia(1), [
            { from: 'contactado', to: 'ganado', changedAt: dia(10) },
            { from: 'lead', to: 'contactado', changedAt: dia(4) },
        ]);

        expect(d.lead).toBe(3);
        expect(d.contactado).toBe(6);
    });
});

describe('promedioDiasPorEtapa', () => {
    it('promedia sobre los deals que YA pasaron por la etapa', () => {
        const r = promedioDiasPorEtapa([
            { entrada: dia(1), historial: [{ from: 'lead', to: 'ganado', changedAt: dia(5) }] },   // 4
            { entrada: dia(1), historial: [{ from: 'lead', to: 'ganado', changedAt: dia(11) }] },  // 10
        ]);

        expect(r.lead).toEqual({ dias: 7, muestras: 2 });
    });

    it('un deal olvidado hace 200 días en una etapa NO infla el promedio de esa etapa', () => {
        const r = promedioDiasPorEtapa([
            // tres pasaron rápido por negociacion
            { entrada: dia(1), historial: [{ from: 'negociacion', to: 'ganado', changedAt: dia(3) }] },
            { entrada: dia(1), historial: [{ from: 'negociacion', to: 'ganado', changedAt: dia(4) }] },
            { entrada: dia(1), historial: [{ from: 'negociacion', to: 'ganado', changedAt: dia(3) }] },
            // éste está sentado ahí desde hace años y todavía no salió
            { entrada: dia(1), historial: [{ from: 'lead', to: 'negociacion', changedAt: dia(2) }] },
        ]);

        expect(r.negociacion.dias).toBeLessThanOrEqual(3);
        expect(r.negociacion.muestras).toBe(3);
    });

    it('expone cuántas observaciones respaldan cada promedio', () => {
        const r = promedioDiasPorEtapa([
            { entrada: dia(1), historial: [{ from: 'lead', to: 'ganado', changedAt: dia(5) }] },
        ]);

        expect(r.lead.muestras).toBe(1);
    });

    it('sin historial en ningún deal devuelve vacío, no ceros inventados', () => {
        expect(promedioDiasPorEtapa([{ entrada: dia(1) }, { entrada: dia(2), historial: [] }])).toEqual({});
    });
});
