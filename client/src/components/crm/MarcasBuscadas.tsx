import { useEffect, useState } from 'react';
import { Plus, Hand, Check, X, Users } from 'lucide-react';
import {
    getMarcasBuscadas, crearMarcaBuscada, archivarMarca, aceptarMano, descartarMano,
    dirigirMarca, MarcaBuscadaData,
} from '../../services/marcas-buscadas.service';
import { getPartners, PartnerData } from '../../services/crm.service';
import { mensajeDeError } from '../../lib/apiError';

export default function MarcasBuscadas() {
    const [marcas, setMarcas] = useState<MarcaBuscadaData[]>([]);
    const [cargando, setCargando] = useState(true);
    const [nombre, setNombre] = useState('');
    const [porQue, setPorQue] = useState('');
    const [manoEnCurso, setManoEnCurso] = useState<string | null>(null);
    const [partners, setPartners] = useState<PartnerData[]>([]);
    // A quién se le va a mostrar la marca que estoy por agregar.
    const [dirigidaA, setDirigidaA] = useState<string[]>([]);

    const cargar = async () => {
        setCargando(true);
        try {
            const [m, p] = await Promise.all([getMarcasBuscadas(), getPartners()]);
            setMarcas(m.marcas);
            setPartners(p.partners);
        } finally { setCargando(false); }
    };

    const alternarDestino = async (marca: MarcaBuscadaData, partnerId: string) => {
        const actuales = (marca.partners || []).map(x => x._id);
        const nuevos = actuales.includes(partnerId)
            ? actuales.filter(x => x !== partnerId)
            : [...actuales, partnerId];
        try {
            await dirigirMarca(marca._id, nuevos);
            await cargar();
        } catch (e) {
            alert(mensajeDeError(e, 'No se pudo cambiar a quién se le muestra'));
        }
    };
    useEffect(() => { cargar(); }, []);

    const agregar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nombre.trim()) return;
        try {
            await crearMarcaBuscada({
                nombre: nombre.trim(),
                porQue: porQue.trim() || undefined,
                partners: dirigidaA.length ? dirigidaA : undefined,
            });
            setDirigidaA([]);
            setNombre(''); setPorQue('');
            await cargar();
        } catch (err) { alert(mensajeDeError(err, 'No se pudo agregar la marca')); }
    };

    const accion = async (fn: () => Promise<unknown>, fallback: string) => {
        try { await fn(); await cargar(); }
        catch (err) { alert(mensajeDeError(err, fallback)); }
    };

    // Un click en Aceptar dispara la creación de una empresa en el CRM (chequear-y-después-crear
    // sobre un índice no único): un segundo click mientras el primero sigue en vuelo puede crear
    // dos empresas y dos oportunidades duplicadas para la misma marca. Se deshabilitan ambos
    // botones de la fila mientras la petición está pendiente, y se libera siempre en `finally`
    // (incluso si falla) para no dejar la fila trabada.
    const accionMano = async (manoId: string, fn: () => Promise<unknown>, fallback: string) => {
        setManoEnCurso(manoId);
        try { await fn(); await cargar(); }
        catch (err) { alert(mensajeDeError(err, fallback)); }
        finally { setManoEnCurso(null); }
    };

    const visibles = marcas.filter(m => m.estado === 'buscando' || m.estado === 'con_manos');

    return (
        <div className="p-4 flex flex-col gap-5">
            <form onSubmit={agregar} className="bg-white rounded-[20px] p-5 border border-slate-100 flex flex-col gap-3">
                <h2 className="font-bold text-slate-800">Agregar una marca que querés alcanzar</h2>
                <div className="flex flex-col sm:flex-row gap-2">
                    <input value={nombre} onChange={e => setNombre(e.target.value)}
                        placeholder="Havanna"
                        className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm" />
                    <input value={porQue} onChange={e => setPorQue(e.target.value)}
                        placeholder="Por qué la querés: 180 locales, delivery tercerizado"
                        className="flex-[2] px-4 py-2.5 rounded-xl border border-slate-200 text-sm" />
                    <button type="submit"
                        className="px-4 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold flex items-center gap-2">
                        <Plus size={16} /> Agregar
                    </button>
                </div>

                {partners.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-xs text-slate-400 flex items-center gap-1.5">
                            <Users size={13} /> ¿A quién se la mostramos?
                        </span>
                        {partners.map(p => (
                            <ChipPartner
                                key={p._id}
                                nombre={p.name}
                                activo={dirigidaA.includes(p._id)}
                                onClick={() => setDirigidaA(prev =>
                                    prev.includes(p._id) ? prev.filter(x => x !== p._id) : [...prev, p._id])}
                            />
                        ))}
                        <span className="text-[11px] text-slate-400">
                            {dirigidaA.length === 0 ? 'Sin elegir ninguno, la ven todos.' : `Sólo ${dirigidaA.length} de ${partners.length}.`}
                        </span>
                    </div>
                )}
            </form>

            {cargando ? (
                <p className="text-slate-400 text-sm">Cargando…</p>
            ) : visibles.length === 0 ? (
                <p className="text-slate-400 text-sm">
                    Todavía no cargaste ninguna marca. Agregá la primera y compartí el link con tus partners.
                </p>
            ) : visibles.map(m => {
                const manos = m.manos.filter(x => x.estado === 'ofrecida');
                return (
                    <div key={m._id} className="bg-white rounded-[20px] p-5 border border-slate-100">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="font-bold text-slate-800">{m.nombre}</h3>
                                {m.origen === 'partner' && (
                                    <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full mt-2">
                                        Te la propuso {m.propuestaPor?.name ?? 'un partner'}
                                    </p>
                                )}
                                {m.porQue && <p className="text-sm text-slate-500 mt-1">{m.porQue}</p>}
                                {partners.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-1.5 mt-3">
                                        <span className="text-[11px] text-slate-400 mr-0.5">
                                            {(m.partners?.length || 0) === 0 ? 'La ven todos:' : 'Se la mostramos a:'}
                                        </span>
                                        {partners.map(p => (
                                            <ChipPartner
                                                key={p._id}
                                                nombre={p.name}
                                                activo={(m.partners || []).some(x => x._id === p._id)}
                                                onClick={() => alternarDestino(m, p._id)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button onClick={() => accion(() => archivarMarca(m._id), 'No se pudo archivar')}
                                className="text-xs text-slate-400 hover:text-slate-600">Archivar</button>
                        </div>

                        {manos.length > 0 && (
                            <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4">
                                {manos.map(mano => (
                                    <div key={mano._id} className="flex items-start justify-between gap-3 text-sm">
                                        <div className="flex items-start gap-2">
                                            <Hand size={15} className="text-sky-500 mt-0.5 shrink-0" />
                                            <span>
                                                <strong>{mano.partnerNombre}</strong>
                                                {mano.comentario && <em className="text-slate-500"> — “{mano.comentario}”</em>}
                                                <span className="block text-[11px] text-slate-400">
                                                    {new Date(mano.levantadaEn).toLocaleDateString('es-AR')}
                                                </span>
                                            </span>
                                        </div>
                                        <div className="flex gap-1 shrink-0">
                                            <button title="Aceptar y pasar al CRM"
                                                disabled={manoEnCurso === mano._id}
                                                onClick={() => accionMano(mano._id, () => aceptarMano(m._id, mano._id), 'No se pudo aceptar')}
                                                className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed"><Check size={14} /></button>
                                            <button title="Descartar"
                                                disabled={manoEnCurso === mano._id}
                                                onClick={() => accionMano(mano._id, () => descartarMano(m._id, mano._id), 'No se pudo descartar')}
                                                className="p-1.5 rounded-lg bg-slate-50 text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed"><X size={14} /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

/** Chip para elegir a qué partner se le muestra una marca. */
function ChipPartner({ nombre, activo, onClick }: { nombre: string; activo: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${activo
                ? 'bg-violet-600 text-white border-violet-600 shadow-sm shadow-violet-500/20'
                : 'bg-white text-slate-500 border-slate-200 hover:border-violet-300 hover:text-violet-600'}`}
        >
            {nombre}
        </button>
    );
}
