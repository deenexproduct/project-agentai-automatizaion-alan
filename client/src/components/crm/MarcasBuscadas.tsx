import { useEffect, useState } from 'react';
import { Plus, Hand, Check, X } from 'lucide-react';
import {
    getMarcasBuscadas, crearMarcaBuscada, archivarMarca, aceptarMano, descartarMano,
    MarcaBuscadaData,
} from '../../services/marcas-buscadas.service';
import { mensajeDeError } from '../../lib/apiError';

export default function MarcasBuscadas() {
    const [marcas, setMarcas] = useState<MarcaBuscadaData[]>([]);
    const [cargando, setCargando] = useState(true);
    const [nombre, setNombre] = useState('');
    const [porQue, setPorQue] = useState('');

    const cargar = async () => {
        setCargando(true);
        try { setMarcas((await getMarcasBuscadas()).marcas); }
        finally { setCargando(false); }
    };
    useEffect(() => { cargar(); }, []);

    const agregar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nombre.trim()) return;
        try {
            await crearMarcaBuscada({ nombre: nombre.trim(), porQue: porQue.trim() || undefined });
            setNombre(''); setPorQue('');
            await cargar();
        } catch (err) { alert(mensajeDeError(err, 'No se pudo agregar la marca')); }
    };

    const accion = async (fn: () => Promise<unknown>, fallback: string) => {
        try { await fn(); await cargar(); }
        catch (err) { alert(mensajeDeError(err, fallback)); }
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
                                {m.porQue && <p className="text-sm text-slate-500 mt-1">{m.porQue}</p>}
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
                                                onClick={() => accion(() => aceptarMano(m._id, mano._id), 'No se pudo aceptar')}
                                                className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700"><Check size={14} /></button>
                                            <button title="Descartar"
                                                onClick={() => accion(() => descartarMano(m._id, mano._id), 'No se pudo descartar')}
                                                className="p-1.5 rounded-lg bg-slate-50 text-slate-500"><X size={14} /></button>
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
