import { useState, useEffect } from 'react';
import { Edit2, Trash2, Swords, Globe, Building2, User, ExternalLink } from 'lucide-react';
import { CompetitorData, getCompetitors, deleteCompetitor } from '../../services/crm.service';
import CompetitorFormDrawer from './CompetitorFormDrawer';
import PremiumHeader from './PremiumHeader';

const STRENGTH_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    fuerte: { label: 'Fuerte', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200/60' },
    moderada: { label: 'Moderada', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200/60' },
    debil: { label: 'Débil', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200/60' },
};

export default function CompetitorList() {
    const [competitors, setCompetitors] = useState<CompetitorData[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    // Drawer state
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [editingCompetitor, setEditingCompetitor] = useState<CompetitorData | null>(null);

    const loadCompetitors = async () => {
        try {
            setLoading(true);
            const res = await getCompetitors();
            setCompetitors(res.competitors);
        } catch (error) {
            console.error('Error loading competitors', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadCompetitors();
    }, []);

    const openCreateDrawer = () => {
        setEditingCompetitor(null);
        setIsDrawerOpen(true);
    };

    const openEditDrawer = (c: CompetitorData) => {
        setEditingCompetitor(c);
        setIsDrawerOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro de que deseas eliminar este competidor?')) return;
        try {
            await deleteCompetitor(id);
            loadCompetitors();
        } catch (error) {
            console.error('Error deleting competitor', error);
            alert('Error al eliminar');
        }
    };

    const filteredCompetitors = competitors.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] min-h-[500px] relative mt-4 pb-20 md:pb-0">
            {/* Premium Header Reutilizable */}
            <div className="shrink-0 z-10 bg-white/40 backdrop-blur-2xl rounded-[24px] overflow-hidden mb-4 border border-white/60 shadow-[0_8px_32px_rgba(30,27,75,0.05)]">
                <PremiumHeader
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder="Buscar competidor por nombre..."
                    onAdd={openCreateDrawer}
                    addLabel="Nuevo Competidor"
                    containerClassName="px-5 py-2.5 !border-none !shadow-none bg-transparent"
                />
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center bg-white/30 backdrop-blur-xl rounded-[24px] border border-slate-100 shadow-sm">
                    <div className="relative">
                        <div className="absolute inset-0 bg-red-500/20 rounded-full blur-xl animate-pulse" />
                        <div className="animate-spin w-10 h-10 border-4 border-red-200 border-t-red-600 rounded-full relative z-10" />
                    </div>
                </div>
            ) : filteredCompetitors.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-20 bg-white/40 backdrop-blur-xl rounded-[24px] border border-slate-100 shadow-sm">
                    <div className="w-20 h-20 bg-red-50 rounded-[20px] flex items-center justify-center mb-4 border border-red-100 shadow-sm">
                        <Swords size={32} className="text-red-500" />
                    </div>
                    <h3 className="text-[17px] font-bold text-slate-700">Aún no hay Competidores</h3>
                    <p className="text-[15px] font-medium text-slate-500 mt-1">Registrá tus competidores para hacer análisis competitivo.</p>
                </div>
            ) : (
                <div className="bg-white/70 backdrop-blur-2xl rounded-[24px] border border-slate-200/50 shadow-[0_8px_32px_rgba(30,27,75,0.02)] overflow-hidden flex-1 flex flex-col relative pb-4">
                    <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1 relative rounded-[24px]">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                            <thead className="sticky top-0 z-10 bg-white/90 backdrop-blur-xl shadow-sm border-b border-slate-200/60">
                                <tr>
                                    <th className="px-6 py-4 text-[12px] font-bold text-slate-400 uppercase tracking-widest">Competidor</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-slate-400 uppercase tracking-widest">Sitio Web</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-slate-400 uppercase tracking-widest">CEO</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-slate-400 uppercase tracking-widest">Locales Est.</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-slate-400 uppercase tracking-widest">Locales CRM</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-slate-400 uppercase tracking-widest">Nivel</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-slate-400 uppercase tracking-widest">Empresas</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-slate-400 uppercase tracking-widest w-[120px] text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100/60">
                                {filteredCompetitors.map(competitor => {
                                    const strengthInfo = STRENGTH_CONFIG[competitor.strength || 'moderada'] || STRENGTH_CONFIG.moderada;
                                    return (
                                        <tr key={competitor._id} className="hover:bg-red-50/30 transition-colors duration-200">
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-11 h-11 rounded-[12px] bg-gradient-to-br from-red-100 to-amber-100 flex items-center justify-center border border-red-200/50 shadow-sm shrink-0 overflow-hidden">
                                                        {competitor.logo ? (
                                                            <img src={competitor.logo} alt={competitor.name} className="w-full h-full object-contain p-1" />
                                                        ) : (
                                                            <Swords size={18} className="text-red-600" />
                                                        )}
                                                    </div>
                                                    <div className="font-extrabold text-[15px] text-slate-800 tracking-tight">{competitor.name}</div>
                                                </div>
                                            </td>

                                            <td className="px-6 py-5">
                                                {competitor.url ? (
                                                    <a
                                                        href={competitor.url.startsWith('http') ? competitor.url : `https://${competitor.url}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[12px] font-bold rounded-[10px] transition-colors border border-blue-200/50 shadow-sm max-w-[160px] truncate"
                                                    >
                                                        <ExternalLink size={13} /> <span className="truncate">{competitor.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                                                    </a>
                                                ) : (
                                                    <span className="text-[12px] font-medium text-slate-400 bg-slate-50 px-3 py-1.5 rounded-[10px] border border-slate-100">Sin URL</span>
                                                )}
                                            </td>

                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-1.5">
                                                    {competitor.ceo ? (
                                                        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
                                                            <User size={14} className="text-slate-400" /> {competitor.ceo}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[12px] font-medium text-slate-400">—</span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="px-6 py-5">
                                                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-amber-50/80 border border-amber-200/60 shadow-sm" title="Locales estimados (proyectados)">
                                                    <span className="font-black text-amber-600 text-[13px]">
                                                        {competitor.localesCount || 0}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-amber-500">est.</span>
                                                </div>
                                            </td>

                                            <td className="px-6 py-5">
                                                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-red-50/80 border border-red-200/60 shadow-sm" title="Locales reales vinculados en el CRM (suma de locales de las empresas asociadas)">
                                                    <span className="font-black text-red-600 text-[13px]">
                                                        {competitor.linkedLocalesCount || 0}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-red-500">CRM</span>
                                                </div>
                                            </td>

                                            <td className="px-6 py-5">
                                                <span className={`inline-flex items-center px-3 py-1.5 rounded-[10px] border shadow-sm text-[12px] font-bold ${strengthInfo.bg} ${strengthInfo.border} ${strengthInfo.color}`}>
                                                    {strengthInfo.label}
                                                </span>
                                            </td>

                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-[8px] border border-slate-200/60 text-slate-600 text-[12px] font-bold shadow-sm w-fit" title={`${competitor.companiesCount || 0} Empresas vinculadas`}>
                                                    <Building2 size={13} className="text-red-500" /> {competitor.companiesCount || 0} <span className="text-slate-400 font-medium text-[11px] ml-1">Empresas</span>
                                                </div>
                                            </td>

                                            <td className="px-6 py-5 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button onClick={() => openEditDrawer(competitor)} className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-red-600 bg-white hover:bg-red-50 rounded-[10px] border border-slate-200 hover:border-red-200 transition-all shadow-sm">
                                                        <Edit2 size={15} />
                                                    </button>
                                                    <button onClick={() => handleDelete(competitor._id)} className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-red-500 bg-white hover:bg-red-50 rounded-[10px] border border-slate-200 hover:border-red-200 transition-all shadow-sm">
                                                        <Trash2 size={15} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <CompetitorFormDrawer
                open={isDrawerOpen}
                competitor={editingCompetitor}
                onClose={() => setIsDrawerOpen(false)}
                onSaved={loadCompetitors}
            />

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px;}
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(239, 68, 68, 0.2); border-radius: 10px; }
                .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: rgba(239, 68, 68, 0.4); }
            `}</style>
        </div>
    );
}
