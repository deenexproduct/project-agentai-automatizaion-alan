import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Hand } from 'lucide-react';
import { getTablero, levantarMano, TableroPublico } from '../../services/portal.service';

export default function PortalPartner() {
    const { token } = useParams<{ token: string }>();
    const [tablero, setTablero] = useState<TableroPublico | null>(null);
    const [error, setError] = useState(false);
    const [comentarios, setComentarios] = useState<Record<string, string>>({});

    const cargar = async () => {
        try { setTablero(await getTablero(token!)); }
        catch { setError(true); }
    };
    useEffect(() => { cargar(); }, [token]);

    const enviar = async (marcaId: string) => {
        try {
            await levantarMano(token!, marcaId, comentarios[marcaId] || '');
            setComentarios(prev => ({ ...prev, [marcaId]: '' }));
            await cargar();
        } catch { alert('No se pudo registrar. Probá de nuevo.'); }
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
                                className="px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-semibold flex items-center justify-center gap-2">
                                <Hand size={15} /> Llego a esta
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
