import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Hand, Check, X } from 'lucide-react';
import { getTablero, levantarMano, TableroPublico, MarcaPublica } from '../../services/portal.service';

export default function PortalPartner() {
    const { token } = useParams<{ token: string }>();
    const [tablero, setTablero] = useState<TableroPublico | null>(null);
    const [error, setError] = useState(false);
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

    const enviar = async (marcaId: string, comentario: string) => {
        setEnviandoId(marcaId);
        setErroresMarca(prev => ({ ...prev, [marcaId]: '' }));
        try {
            await levantarMano(token!, marcaId, comentario);
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

    const yo = tablero?.partner.nombre ?? '';

    // Primero lo que falta responder. Al confirmar, la tarjeta se pone en verde
    // y baja: se ve que quedó hecha y la lista de pendientes se acorta sola.
    const ordenadas = useMemo(() => {
        if (!tablero) return [];
        const respondida = (m: MarcaPublica) => m.manos.some(x => x.partnerNombre === yo);
        return [...tablero.marcas].sort((a, b) => Number(respondida(a)) - Number(respondida(b)));
    }, [tablero, yo]);

    const pendientes = ordenadas.filter(m => !m.manos.some(x => x.partnerNombre === yo)).length;

    if (error) {
        return (
            <Fondo>
                <div className="max-w-md mx-auto mt-20 bg-white/80 backdrop-blur-xl rounded-[2rem] border border-slate-200/60 shadow-xl shadow-slate-200/50 p-10 text-center">
                    <h1 className="text-xl font-bold text-slate-800">Este link no es válido</h1>
                    <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                        Puede haber sido reemplazado por uno nuevo. Pedinos que te lo mandemos otra vez.
                    </p>
                </div>
            </Fondo>
        );
    }

    if (!tablero) {
        return (
            <Fondo>
                <div className="max-w-2xl mx-auto flex flex-col gap-4 pt-4" aria-busy="true" aria-label="Cargando">
                    <div className="h-12 w-12 bg-slate-200/70 rounded-2xl animate-pulse" />
                    <div className="h-8 w-56 bg-slate-200/70 rounded-lg animate-pulse" />
                    <div className="h-4 w-80 max-w-full bg-slate-200/50 rounded animate-pulse" />
                    {[0, 1].map(i => (
                        <div key={i} className="h-36 bg-white/60 rounded-[1.75rem] border border-slate-200/60 animate-pulse" />
                    ))}
                </div>
            </Fondo>
        );
    }

    return (
        <Fondo>
            <div className="max-w-2xl mx-auto flex flex-col gap-4">
                <header className="pt-1">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 shadow-lg shadow-violet-500/20 flex items-center justify-center mb-5">
                        <img src="/isotipo.png" alt="Deenex" className="w-7 h-7 object-contain" />
                    </div>

                    <h1 className="text-[28px] leading-tight font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600">
                        Hola, {primerNombre(tablero.partner.nombre)}
                    </h1>
                    <p className="text-slate-500 text-[15px] mt-2 max-w-lg leading-relaxed">
                        Estas son las marcas a las que queremos llegar. Si tenés cómo acercarte a alguna,
                        levantá la mano y te escribimos.
                    </p>

                    {ordenadas.length > 0 && (
                        <p className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-violet-700 bg-violet-50 border border-violet-100 px-3 py-1.5 rounded-full">
                            {pendientes === 0
                                ? '¡Listo! Respondiste todas'
                                : `${pendientes} sin responder de ${ordenadas.length}`}
                        </p>
                    )}
                </header>

                {ordenadas.length === 0 ? (
                    <div className="bg-white/70 backdrop-blur-xl rounded-[1.75rem] border border-slate-200/60 p-10 text-center mt-2">
                        <p className="text-slate-500 text-sm">Por ahora no hay marcas cargadas.</p>
                        <p className="text-slate-400 text-xs mt-1">Te avisamos cuando sumemos las primeras.</p>
                    </div>
                ) : (
                    ordenadas.map(m => (
                        <TarjetaMarca
                            key={m._id}
                            marca={m}
                            yo={yo}
                            onEnviar={comentario => enviar(m._id, comentario)}
                            enviando={enviandoId === m._id}
                            error={erroresMarca[m._id]}
                        />
                    ))
                )}

                <p className="text-center text-[11px] text-slate-400 pt-4 pb-8">Deenex</p>
            </div>
        </Fondo>
    );
}

/** "Gabriel Francisco Chayle" → "Gabriel". Un saludo, no un encabezado de factura. */
function primerNombre(nombre: string): string {
    return (nombre || '').trim().split(/\s+/)[0] || nombre;
}

/** Fondo compartido por los tres estados, para que no cambie el clima al cargar o fallar. */
function Fondo({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50 px-4 py-8 sm:px-6 sm:py-12">
            {children}
        </div>
    );
}

function TarjetaMarca({ marca, yo, onEnviar, enviando, error }: {
    marca: MarcaPublica;
    yo: string;
    onEnviar: (comentario: string) => void;
    enviando: boolean;
    error?: string;
}) {
    // El campo aparece recién al tocar el botón. Con varias marcas en pantalla,
    // un input abierto en cada tarjeta es ruido: lo que importa es la decisión.
    const [abierta, setAbierta] = useState(false);
    const [comentario, setComentario] = useState('');

    const miMano = marca.manos.find(x => x.partnerNombre === yo);
    const otros = marca.manos.filter(x => x.partnerNombre !== yo);

    return (
        <article className={`backdrop-blur-xl rounded-[1.75rem] border p-5 sm:p-6 transition-colors duration-300 ${miMano
            ? 'bg-emerald-50/40 border-emerald-200/70'
            : 'bg-white/80 border-slate-200/60 shadow-sm shadow-slate-200/50'}`}>

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
                <div className="flex items-center gap-2 mt-3.5">
                    <div className="flex -space-x-1.5">
                        {otros.slice(0, 4).map((x, i) => (
                            <span key={i}
                                title={x.partnerNombre}
                                className="w-6 h-6 rounded-full bg-slate-200 border-2 border-white text-[10px] font-bold text-slate-600 flex items-center justify-center">
                                {(x.partnerNombre || '?').trim().charAt(0).toUpperCase()}
                            </span>
                        ))}
                    </div>
                    <p className="text-xs text-slate-400">
                        {otros.length === 1 ? 'ya levantó la mano' : 'ya levantaron la mano'}
                    </p>
                </div>
            )}

            {miMano ? (
                <div className="mt-4 flex items-start gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 mt-0.5">
                        <Check size={12} className="text-white" strokeWidth={3} />
                    </span>
                    <div>
                        <p className="text-sm font-semibold text-emerald-800">Levantaste la mano</p>
                        {miMano.comentario && <p className="text-xs text-emerald-700/80 mt-0.5">“{miMano.comentario}”</p>}
                        <p className="text-[11px] text-emerald-600/70 mt-0.5">Te escribimos para coordinar.</p>
                    </div>
                </div>
            ) : abierta ? (
                <div className="mt-4 flex flex-col gap-2.5">
                    <input
                        autoFocus
                        value={comentario}
                        onChange={e => setComentario(e.target.value)}
                        placeholder="¿Cómo llegás? (opcional)"
                        className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                    />
                    <div className="flex gap-2">
                        <button
                            onClick={() => onEnviar(comentario)}
                            disabled={enviando}
                            className="flex-1 min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20 transition-all hover:shadow-violet-500/30 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
                        >
                            <Hand size={15} /> {enviando ? 'Enviando…' : 'Confirmar'}
                        </button>
                        <button
                            onClick={() => { setAbierta(false); setComentario(''); }}
                            disabled={enviando}
                            aria-label="Cancelar"
                            className="min-h-[44px] px-4 rounded-xl border border-slate-200 text-slate-500 text-sm font-medium transition-colors hover:bg-slate-50 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setAbierta(true)}
                    className="mt-4 w-full sm:w-auto min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20 transition-all hover:shadow-violet-500/30 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
                >
                    <Hand size={15} /> Llego a esta
                </button>
            )}

            {error && <p className="text-xs text-red-600 mt-2.5">{error}</p>}
        </article>
    );
}
