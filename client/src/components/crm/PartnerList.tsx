import { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, Handshake, Mail, MessageCircle, Building2, User } from 'lucide-react';
import { PartnerData, getPartners, deletePartner } from '../../services/crm.service';
import PartnerFormDrawer from './PartnerFormDrawer';
import PremiumHeader from './PremiumHeader';
import OwnerAvatar from '../common/OwnerAvatar';

export default function PartnerList() {
    const [partners, setPartners] = useState<PartnerData[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    // Drawer state
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [editingPartner, setEditingPartner] = useState<PartnerData | null>(null);

    const loadPartners = async () => {
        try {
            setLoading(true);
            const res = await getPartners();
            setPartners(res.partners);
        } catch (error) {
            console.error('Error loading partners', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPartners();
    }, []);

    const openCreateDrawer = () => {
        setEditingPartner(null);
        setIsDrawerOpen(true);
    };

    const openEditDrawer = (p: PartnerData) => {
        setEditingPartner(p);
        setIsDrawerOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro de que deseas eliminar este partner?')) return;
        try {
            await deletePartner(id);
            loadPartners();
        } catch (error) {
            console.error('Error deleting partner', error);
            alert('Error al eliminar');
        }
    };

    const filteredPartners = partners.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

    const handleCopyEmail = (email: string) => {
        navigator.clipboard.writeText(email);
        alert('Email copiado al portapapeles');
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] min-h-[500px] relative mt-4">
            {/* Premium Header Reutilizable */}
            <div className="shrink-0 z-10 bg-white/40 backdrop-blur-2xl rounded-[24px] overflow-hidden mb-4 border border-white/60 shadow-[0_8px_32px_rgba(30,27,75,0.05)]">
                <PremiumHeader
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder="Buscar partner por nombre..."
                    onAdd={openCreateDrawer}
                    addLabel="Nuevo Partner"
                    containerClassName="px-5 py-2.5 !border-none !shadow-none bg-transparent"
                />
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center bg-white/30 backdrop-blur-xl rounded-[24px] border border-slate-100 shadow-sm">
                    <div className="relative">
                        <div className="absolute inset-0 bg-violet-500/20 rounded-full blur-xl animate-pulse" />
                        <div className="animate-spin w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full relative z-10" />
                    </div>
                </div>
            ) : filteredPartners.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-20 bg-white/40 backdrop-blur-xl rounded-[24px] border border-slate-100 shadow-sm">
                    <div className="w-20 h-20 bg-violet-50 rounded-[20px] flex items-center justify-center mb-4 border border-violet-100 shadow-sm">
                        <Handshake size={32} className="text-violet-500" />
                    </div>
                    <h3 className="text-[17px] font-bold text-slate-700">Aún no hay Partners</h3>
                    <p className="text-[15px] font-medium text-slate-500 mt-1">Crea tu primer partner para empezar a derivar leads.</p>
                </div>
            ) : (
                <div className="bg-white/70 backdrop-blur-2xl rounded-[24px] border border-slate-200/50 shadow-[0_8px_32px_rgba(30,27,75,0.02)] overflow-hidden flex-1 flex flex-col relative pb-4">
                    <div className="overflow-x-auto overflow-y-auto custom-scrollbar flex-1 relative rounded-[24px]">
                        <table className="w-full text-left border-collapse min-w-[800px]">
                            <thead className="sticky top-0 z-10 bg-white/90 backdrop-blur-xl shadow-sm border-b border-slate-200/60">
                                <tr>
                                    <th className="px-6 py-4 text-[12px] font-bold text-slate-400 uppercase tracking-widest">Partner</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-slate-400 uppercase tracking-widest">Contacto Rápido</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-slate-400 uppercase tracking-widest">Gestión / Volumen</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-slate-400 uppercase tracking-widest">Comisión</th>
                                    <th className="px-6 py-4 text-[12px] font-bold text-slate-400 uppercase tracking-widest w-[120px] text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100/60">
                                {filteredPartners.map(partner => (
                                    <tr key={partner._id} className="hover:bg-violet-50/30 transition-colors duration-200">
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-4">
                                                <div className="w-11 h-11 rounded-[12px] bg-gradient-to-br from-violet-100 to-fuchsia-100 flex items-center justify-center border border-violet-200/50 shadow-sm shrink-0">
                                                    <Handshake size={18} className="text-violet-600" />
                                                </div>
                                                <div className="font-extrabold text-[15px] text-slate-800 tracking-tight">{partner.name}</div>
                                                <OwnerAvatar name={partner.assignedTo?.name} profilePhotoUrl={partner.assignedTo?.profilePhotoUrl} size="xs" />
                                            </div>
                                        </td>

                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {partner.phone ? (
                                                    <a
                                                        href={`https://wa.me/${partner.phone.replace(/[^0-9]/g, '')}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[12px] font-bold rounded-[10px] transition-colors border border-emerald-200/50 shadow-sm"
                                                        title={partner.phone}
                                                    >
                                                        <MessageCircle size={14} /> WhatsApp
                                                    </a>
                                                ) : (
                                                    <span className="text-[12px] font-medium text-slate-400 bg-slate-50 px-3 py-1.5 rounded-[10px] border border-slate-100">Sin WA</span>
                                                )}

                                                {partner.email ? (
                                                    <button
                                                        onClick={() => handleCopyEmail(partner.email!)}
                                                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-violet-50 hover:bg-violet-100 text-violet-700 text-[12px] font-bold rounded-[10px] transition-colors border border-violet-200/50 shadow-sm"
                                                        title={`Copiar ${partner.email}`}
                                                    >
                                                        <Mail size={14} /> Email
                                                    </button>
                                                ) : (
                                                    <span className="text-[12px] font-medium text-slate-400 bg-slate-50 px-3 py-1.5 rounded-[10px] border border-slate-100">Sin Email</span>
                                                )}
                                            </div>
                                        </td>

                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-[8px] border border-slate-200/60 text-slate-600 text-[12px] font-bold shadow-sm" title={`${partner.companiesCount || 0} Empresas asignadas`}>
                                                    <Building2 size={13} className="text-violet-500" /> {partner.companiesCount || 0} <span className="text-slate-400 font-medium text-[11px] ml-1">Empresas</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-[8px] border border-slate-200/60 text-slate-600 text-[12px] font-bold shadow-sm" title={`${partner.contactsCount || 0} Contactos asignados`}>
                                                    <User size={13} className="text-fuchsia-500" /> {partner.contactsCount || 0} <span className="text-slate-400 font-medium text-[11px] ml-1">Leads</span>
                                                </div>
                                            </div>
                                        </td>

                                        <td className="px-6 py-5">
                                            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-fuchsia-50/80 border border-fuchsia-200/60 shadow-sm">
                                                <span className="font-black text-fuchsia-600 text-[13px]">
                                                    {partner.commissionPercentage || 0}%
                                                </span>
                                            </div>
                                        </td>

                                        <td className="px-6 py-5 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button onClick={() => openEditDrawer(partner)} className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-violet-600 bg-white hover:bg-violet-50 rounded-[10px] border border-slate-200 hover:border-violet-200 transition-all shadow-sm">
                                                    <Edit2 size={15} />
                                                </button>
                                                <button onClick={() => handleDelete(partner._id)} className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-red-500 bg-white hover:bg-red-50 rounded-[10px] border border-slate-200 hover:border-red-200 transition-all shadow-sm">
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <PartnerFormDrawer
                open={isDrawerOpen}
                partner={editingPartner}
                onClose={() => setIsDrawerOpen(false)}
                onSaved={loadPartners}
            />

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px;}
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(139, 92, 246, 0.2); border-radius: 10px; }
                .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: rgba(139, 92, 246, 0.4); }
            `}</style>
        </div>
    );
}
