import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Hand } from 'lucide-react';
import { getTablero, levantarMano, TableroPublico } from '../../services/portal.service';

export default function PortalPartner() {
    const { token } = useParams<{ token: string }>();
    const [tablero, setTablero] = useState<TableroPublico | null>(null);
    const [error, setError] = useState(false);
    const [comentarios, setComentarios] = useState<Record<string, string>>({});
    const [erroresMarca, setErroresMarca] = useState<Record<string, string>>({});
    const [enviandoId, setEnviandoId] = useState<string | null>(null);

    // Carga inicial: acá sí corresponde tratar cualquier falla como "el link
    // no es válido", porque todavía no sabemos si el token es correcto.
    const cargarInicial = async () => {
        try { setTablero(await getTablero(token!)); }
        catch { setError(true); }
    };
    useEffect(() => { cargarInicial(); }, [token]);

    // Recarga después de levantar la mano: el token ya se probó válido (la
    // mano se registró), así que un blip de red acá NO debe pisar la
    // pantalla con "Este link no es válido." Si falla, dejamos el tablero
    // como estaba y avisamos en la tarjeta de la marca en cuestión.
    const recargar = async (marcaId: string) => {
        try {
            setTablero(await getTablero(token!));
        } catch {
            setErroresMarca(prev => ({
                ...prev,
                [marcaId]: 'Tu mano quedó registrada, pero no pudimos actualizar la lista. Recargá la página para verla.',
            }));
        }
    };

    const enviar = async (marcaId: string) => {
        setEnviandoId(marcaId);
        setErroresMarca(prev => ({ ...prev, [marcaId]: '' }));
        try {
            await levantarMano(token!, marcaId, comentarios[marcaId] || '');
            setComentarios(prev => ({ ...prev, [marcaId]: '' }));
            await recargar(marcaId);
        } catch (err) {
            setErroresMarca(prev => ({
                ...prev,
                [marcaId]: err instanceof Error ? err.message : 'No se pudo registrar. Probá de nuevo.',
            }));
        } finally {
            setEnviandoId(null);
        }
    };

    if (error) return <div className="p-10 text-center text-slate-500">Este link no es válido.</div>;
    if (!tablero) return <div className="p-10 text-center text-slate-400">Cargando…</div>;

    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
            <div className="max-w-2xl mx-auto flex flex-col gap-5">
                <header>
                    <h1 className="text-2xl font-bold text-slate-800">Hola, {tablero.partner.nombre}</h1>
                    <p className="text-slate-500 text-sm mt-1">
                        Estas son las marcas a las que queremos llegar. Si tenés cómo acercarte a alguna,
                        levantá la mano y te escribimos.
                    </p>
                </header>

                {tablero.marcas.length === 0 && (
                    <p className="text-slate-400 text-sm">Por ahora no hay marcas cargadas.</p>
                )}

                {tablero.marcas.map(m => (
                    <div key={m._id} className="bg-white rounded-2xl p-5 border border-slate-200">
                        <h2 className="font-bold text-slate-800">{m.nombre}</h2>
                        {m.porQue && <p className="text-sm text-slate-500 mt-1">{m.porQue}</p>}

                        {m.manos.length > 0 && (
                            <p className="text-xs text-slate-400 mt-3">
                                Ya levantaron la mano: {m.manos.map(x => x.partnerNombre).join(', ')}
                            </p>
                        )}

                        <div className="mt-4 flex flex-col sm:flex-row gap-2">
                            <input
                                value={comentarios[m._id] || ''}
                                onChange={e => setComentarios(p => ({ ...p, [m._id]: e.target.value }))}
                                placeholder="¿Cómo llegás? (opcional)"
                                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                            <button onClick={() => enviar(m._id)}
                                disabled={enviandoId === m._id}
                                className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                                <Hand size={15} /> Llego a esta
                            </button>
                        </div>
                        {erroresMarca[m._id] && (
                            <p className="text-xs text-red-600 mt-2">{erroresMarca[m._id]}</p>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
