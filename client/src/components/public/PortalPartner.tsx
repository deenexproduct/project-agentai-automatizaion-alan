import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Hand, Check, Users } from 'lucide-react';
import { getTablero, levantarMano, TableroPublico, MarcaPublica } from '../../services/portal.service';

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

    if (error) {
        return (
            <Fondo>
                <div className="max-w-md mx-auto mt-24 bg-white/80 backdrop-blur-xl rounded-[2rem] border border-slate-200/60 shadow-xl shadow-slate-200/50 p-10 text-center">
                    <h1 className="text-xl font-bold text-slate-800">Este link no es válido</h1>
                    <p className="text-sm text-slate-500 mt-2">
                        Puede haber sido reemplazado por uno nuevo. Pedinos que te lo mandemos otra vez.
                    </p>
                </div>
            </Fondo>
        );
    }

    if (!tablero) {
        return (
            <Fondo>
                <div className="max-w-2xl mx-auto flex flex-col gap-4 pt-4">
                    <div className="h-8 w-56 bg-slate-200/70 rounded-lg animate-pulse" />
                    <div className="h-4 w-80 max-w-full bg-slate-200/50 rounded animate-pulse" />
                    {[0, 1].map(i => (
                        <div key={i} className="h-40 bg-white/60 rounded-[1.75rem] border border-slate-200/60 animate-pulse" />
                    ))}
                </div>
            </Fondo>
        );
    }

    const { marcas } = tablero;

    return (
        <Fondo>
            <div className="max-w-2xl mx-auto flex flex-col gap-5">
                <header className="pt-2">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 shadow-lg shadow-violet-500/20 flex items-center justify-center mb-5">
                        <Hand size={22} className="text-white" />
                    </div>
                    <h1 className="text-[28px] leading-tight font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600">
                        Hola, {tablero.partner.nombre}
                    </h1>
                    <p className="text-slate-500 text-[15px] mt-2 max-w-lg">
                        Estas son las marcas a las que queremos llegar. Si tenés cómo acercarte a alguna,
                        levantá la mano y te escribimos.
                    </p>
                </header>

                {marcas.length === 0 ? (
                    <div className="bg-white/70 backdrop-blur-xl rounded-[1.75rem] border border-slate-200/60 p-10 text-center">
                        <p className="text-slate-500 text-sm">Por ahora no hay marcas cargadas.</p>
                        <p className="text-slate-400 text-xs mt-1">Te avisamos cuando sumemos las primeras.</p>
                    </div>
                ) : (
                    marcas.map(m => (
                        <TarjetaMarca
                            key={m._id}
                            marca={m}
                            yo={tablero.partner.nombre}
                            comentario={comentarios[m._id] || ''}
                            onComentario={v => setComentarios(p => ({ ...p, [m._id]: v }))}
                            onEnviar={() => enviar(m._id)}
                            enviando={enviandoId === m._id}
                            error={erroresMarca[m._id]}
                        />
                    ))
                )}

                <p className="text-center text-[11px] text-slate-400 pt-2 pb-6">Deenex</p>
            </div>
        </Fondo>
    );
}

/** Fondo compartido por los tres estados, para que no cambie el clima al cargar o fallar. */
function Fondo({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50 px-4 py-8 sm:px-6 sm:py-12">
            {children}
        </div>
    );
}

function TarjetaMarca({ marca, yo, comentario, onComentario, onEnviar, enviando, error }: {
    marca: MarcaPublica;
    yo: string;
    comentario: string;
    onComentario: (v: string) => void;
    onEnviar: () => void;
    enviando: boolean;
    error?: string;
}) {
    // El tablero ya trae quién levantó la mano, así que se puede saber si fuiste
    // vos: sin esto la tarjeta te vuelve a invitar a levantarla como si nada.
    const miMano = marca.manos.find(x => x.partnerNombre === yo);
    const otros = marca.manos.filter(x => x.partnerNombre !== yo);

    return (
        <article className="bg-white/80 backdrop-blur-xl rounded-[1.75rem] border border-slate-200/60 shadow-sm shadow-slate-200/50 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-800 leading-snug">{marca.nombre}</h2>
                {marca.categoria && (
                    <span className="shrink-0 text-[11px] font-semibold text-violet-700 bg-violet-50 border border-violet-100 px-2.5 py-1 rounded-full">
                        {marca.categoria}
                    </span>
                )}
            </div>

            {marca.porQue && <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{marca.porQue}</p>}

            {otros.length > 0 && (
                <div className="flex items-center gap-2 mt-4 text-slate-400">
                    <Users size={13} className="shrink-0" />
                    <p className="text-xs">
                        Ya levantaron la mano: <span className="text-slate-500">{otros.map(x => x.partnerNombre).join(', ')}</span>
                    </p>
                </div>
            )}

            {miMano ? (
                <div className="mt-4 flex items-start gap-2.5 bg-emerald-50/70 border border-emerald-100 rounded-2xl px-4 py-3">
                    <Check size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                        <p className="text-sm font-semibold text-emerald-800">Levantaste la mano</p>
                        {miMano.comentario && <p className="text-xs text-emerald-700/80 mt-0.5">“{miMano.comentario}”</p>}
                        <p className="text-[11px] text-emerald-600/70 mt-0.5">Te escribimos para coordinar.</p>
                    </div>
                </div>
            ) : (
                <div className="mt-4 flex flex-col sm:flex-row gap-2">
                    <input
                        value={comentario}
                        onChange={e => onComentario(e.target.value)}
                        placeholder="¿Cómo llegás? (opcional)"
                        className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                    />
                    <button
                        onClick={onEnviar}
                        disabled={enviando}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20 transition-all hover:shadow-violet-500/30 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                    >
                        <Hand size={15} /> {enviando ? 'Enviando…' : 'Llego a esta'}
                    </button>
                </div>
            )}

            {error && <p className="text-xs text-red-600 mt-2.5">{error}</p>}
        </article>
    );
}
