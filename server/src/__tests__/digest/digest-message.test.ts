import { formatearDigest } from '../../services/digest/digest-message';
import { Digest } from '../../services/digest/pipeline-digest.service';

const vacio: Digest = {
    enfriandose: [], compromisos: [],
    totales: { dealsFrios: 0, usdCongelado: 0, compromisosVencidos: 0 },
};

const conDatos: Digest = {
    enfriandose: [
        { dealId: 'd1', empresa: 'Bonafide', etapa: 'contactado', valor: 9800, moneda: 'USD', diasQuieto: 128 },
        { dealId: 'd2', empresa: 'Freddo', etapa: 'seguimiento', valor: 7350, moneda: 'USD', diasQuieto: 79 },
    ],
    compromisos: [
        { taskId: 't1', empresa: 'Lucciano\'s', titulo: 'Seguimiento a Christian Otero', diasVencido: 151 },
    ],
    totales: { dealsFrios: 38, usdCongelado: 84500, compromisosVencidos: 47 },
};

describe('formatearDigest', () => {
    it('no manda nada cuando no hay nada que avisar', () => {
        expect(formatearDigest(vacio)).toBeNull();
    });

    it('pone adelante la plata congelada', () => {
        const m = formatearDigest(conDatos)!;
        expect(m).toContain('84.500');
        expect(m.split('\n')[0]).toMatch(/enfri/i);
    });

    it('lista cada deal con etapa, valor y días quieto', () => {
        const m = formatearDigest(conDatos)!;
        expect(m).toContain('Bonafide');
        expect(m).toContain('contactado');
        expect(m).toContain('9.800');
        expect(m).toContain('128 días');
    });

    it('avisa cuántos quedaron sin listar, para no esconder el resto', () => {
        const m = formatearDigest(conDatos)!;
        expect(m).toMatch(/38/);
        expect(m).toMatch(/47/);
    });

    it('incluye los compromisos vencidos con la empresa', () => {
        const m = formatearDigest(conDatos)!;
        expect(m).toContain('Lucciano\'s');
        expect(m).toContain('Seguimiento a Christian Otero');
    });

    it('omite la sección de compromisos si no hay ninguno vencido', () => {
        const soloDeals = { ...conDatos, compromisos: [], totales: { ...conDatos.totales, compromisosVencidos: 0 } };
        const m = formatearDigest(soloDeals)!;
        expect(m).not.toMatch(/compromiso/i);
        expect(m).toContain('Bonafide');
    });

    it('entra en pantalla: no más de 12 líneas', () => {
        const m = formatearDigest(conDatos)!;
        expect(m.split('\n').length).toBeLessThanOrEqual(12);
    });
});
