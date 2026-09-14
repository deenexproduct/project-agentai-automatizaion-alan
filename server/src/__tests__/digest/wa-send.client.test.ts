/**
 * El cliente de wa-send.
 *
 * Lo que se prueba acá no es "sabe hacer un POST": es que **no confunda un
 * fracaso con un éxito**. wa-send tiene tres formas distintas de fallar y las
 * tres devuelven cuerpos parecidos:
 *
 *   503 → no hay sesión de WhatsApp vinculada
 *   422 → el número no tiene WhatsApp
 *   429 → se pasó del rate limit (20/min)
 *
 * Mirar solo `res.ok` o solo `body.ok` deja pasar la mitad. Y un digest que
 * "se mandó" y no llegó es exactamente el falso verde que hace que uno confíe
 * en un canal muerto.
 */

import { enviarPorWhatsApp, listarGrupos, estadoWhatsApp } from '../../services/digest/wa-send.client';

const fetchMock = jest.fn();
(global as any).fetch = fetchMock;

/** Arma una respuesta como las que devuelve wa-send. */
const respuesta = (status: number, cuerpo: any) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => cuerpo,
});

beforeEach(() => {
    fetchMock.mockReset();
    process.env.WA_SEND_TOKEN = 'token-de-prueba';
    delete process.env.WA_SEND_URL;
});
afterAll(() => { delete process.env.WA_SEND_TOKEN; });

describe('mandar un mensaje', () => {
    it('pega en /send con el token y el cuerpo que espera wa-send', async () => {
        fetchMock.mockResolvedValue(respuesta(200, { ok: true, id: 'ABC', to: 'x@g.us', chatJid: 'x@g.us' }));

        await enviarPorWhatsApp('120363430384293563@g.us', 'hola');

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('http://127.0.0.1:3131/send');
        expect(init.method).toBe('POST');
        expect((init.headers as any).Authorization).toBe('Bearer token-de-prueba');
        expect(JSON.parse(init.body)).toEqual({ to: '120363430384293563@g.us', text: 'hola' });
    });

    it('devuelve el chatJid REAL, que puede no ser el que pedimos', async () => {
        // WhatsApp puede entregar a un @lid o a un jid con sufijo de dispositivo.
        fetchMock.mockResolvedValue(respuesta(200, { ok: true, id: 'ABC', to: '549115@s.whatsapp.net', chatJid: '99887@lid' }));

        const r = await enviarPorWhatsApp('5491154596266', 'hola');

        expect(r.chatJid).toBe('99887@lid');
        expect(r.id).toBe('ABC');
    });

    it('no manda el texto partido ni recortado: va tal cual', async () => {
        fetchMock.mockResolvedValue(respuesta(200, { ok: true, id: 'A', chatJid: 'x@g.us' }));
        const largo = Array.from({ length: 40 }, (_, i) => `linea ${i}`).join('\n');

        await enviarPorWhatsApp('x@g.us', largo);

        expect(JSON.parse(fetchMock.mock.calls[0][1].body).text).toBe(largo);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe('las tres formas de fallar', () => {
    it('sin sesión de WhatsApp (503) tira error, no devuelve como si hubiera mandado', async () => {
        fetchMock.mockResolvedValue(respuesta(503, { ok: false, error: 'WhatsApp no conectado (vinculá el QR primero)' }));

        await expect(enviarPorWhatsApp('x@g.us', 'hola')).rejects.toThrow(/503.*no conectado/i);
    });

    it('número sin WhatsApp (422) tira error con el motivo', async () => {
        fetchMock.mockResolvedValue(respuesta(422, { ok: false, error: 'ese número no tiene WhatsApp' }));

        await expect(enviarPorWhatsApp('5491100000000', 'hola')).rejects.toThrow(/422.*no tiene WhatsApp/i);
    });

    it('rate limit (429) tira error', async () => {
        fetchMock.mockResolvedValue(respuesta(429, { ok: false, error: 'rate limit: máx 20/min' }));

        await expect(enviarPorWhatsApp('x@g.us', 'hola')).rejects.toThrow(/429/);
    });

    it('un 200 con ok:false TAMBIÉN es un fracaso', async () => {
        // El caso que se escapa si uno mira solo el status.
        fetchMock.mockResolvedValue(respuesta(200, { ok: false, error: 'algo raro' }));

        await expect(enviarPorWhatsApp('x@g.us', 'hola')).rejects.toThrow(/algo raro/);
    });

    it('si wa-send no está levantado, el error dice cómo levantarlo', async () => {
        fetchMock.mockRejectedValue(Object.assign(new Error('fetch failed'), { code: 'ECONNREFUSED' }));

        await expect(enviarPorWhatsApp('x@g.us', 'hola')).rejects.toThrow(/wa-send/);
    });

    it('si se cuelga, corta en vez de esperar para siempre', async () => {
        fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

        await expect(enviarPorWhatsApp('x@g.us', 'hola')).rejects.toThrow(/no contestó/);
    });
});

describe('lo que ni se intenta mandar', () => {
    it('un texto vacío no sale', async () => {
        await expect(enviarPorWhatsApp('x@g.us', '   ')).rejects.toThrow(/vacío/);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('sin destino tampoco', async () => {
        await expect(enviarPorWhatsApp('', 'hola')).rejects.toThrow(/destino/);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe('elegir el destino sin hardcodear un JID', () => {
    it('lista los grupos filtrando por nombre', async () => {
        fetchMock.mockResolvedValue(respuesta(200, {
            ok: true, groups: [{ jid: '123@g.us', subject: 'Deenex', messages: 4 }],
        }));

        const gs = await listarGrupos('deenex');

        expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:3131/groups?q=deenex');
        expect(gs).toEqual([{ jid: '123@g.us', subject: 'Deenex' }]);
    });
});

describe('estado de la sesión', () => {
    it('dice si está conectada y con qué número', async () => {
        fetchMock.mockResolvedValue(respuesta(200, { ok: true, connected: true, me: '5491154596266:33@s.whatsapp.net' }));

        expect(await estadoWhatsApp()).toEqual({ conectado: true, me: '5491154596266:33@s.whatsapp.net' });
    });

    it('si el servicio no está, contesta "no conectado" en vez de explotar', async () => {
        fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

        expect(await estadoWhatsApp()).toEqual({ conectado: false });
    });
});
