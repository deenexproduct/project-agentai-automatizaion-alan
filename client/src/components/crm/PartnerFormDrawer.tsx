import { useState, useEffect } from 'react';
import { X, Save, User, Mail, Phone, Percent, FileText, Handshake } from 'lucide-react';
import { PartnerData, createPartner, updatePartner, getTeamUsers, TeamUser } from '../../services/crm.service';
import OwnerAvatar from '../common/OwnerAvatar';

interface Props {
    partner?: PartnerData | null;
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
}

export default function PartnerFormDrawer({ partner, open, onClose, onSaved }: Props) {
    const [formData, setFormData] = useState<Partial<PartnerData>>({
        name: '',
        email: '',
        phone: '',
        commissionPercentage: 0,
        notes: ''
    });

    const [saving, setSaving] = useState(false);
    const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);

    // Initial data
    useEffect(() => {
        if (open && partner) {
            setFormData({
                name: partner.name || '',
                email: partner.email || '',
                phone: partner.phone || '',
                commissionPercentage: partner.commissionPercentage || 0,
                notes: partner.notes || '',
                assignedTo: (partner as any).assignedTo,
            });
        } else if (open && !partner) {
            setFormData({
                name: '',
                email: '',
                phone: '',
                commissionPercentage: 0,
                notes: '',
                assignedTo: undefined,
            });
        }
    }, [open, partner]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, onClose]);

    // Load team users
    useEffect(() => {
        if (!open) return;
        getTeamUsers().then(setTeamUsers).catch(console.error);
    }, [open]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = {
                ...formData,
                assignedTo: (formData as any).assignedTo ? (formData as any).assignedTo._id || (formData as any).assignedTo : null,
            };

            if (partner?._id) {
                await updatePartner(partner._id, payload);
            } else {
                await createPartner(payload);
            }
            onSaved();
            onClose();
        } catch (error) {
            console.error('Error saving partner:', error);
            alert('Error al guardar partner');
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex justify-end"
            style={{
                background: 'rgba(15, 23, 42, 0.4)',
                backdropFilter: 'blur(8px)',
                animation: 'fadeIn 0.3s ease-out',
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="h-full overflow-y-auto w-[460px] max-w-[100vw] bg-white/95 backdrop-blur-2xl border-l border-white/60 flex flex-col shadow-[-20px_0_40px_rgba(30,27,75,0.1)] relative"
                style={{
                    animation: 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
            >
                {/* Decorative Edge Highlight */}
                <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-violet-500/50 via-fuchsia-500/50 to-transparent" />

                {/* Header */}
                <div className="flex flex-col p-6 border-b border-slate-200/50 bg-white/50 backdrop-blur-md sticky top-0 z-20 shrink-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-[20px] font-bold text-slate-800 tracking-tight flex items-center gap-2">
                                <div className="w-9 h-9 rounded-[12px] bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-sm">
                                    <Handshake size={18} className="text-white" />
                                </div>
                                {partner?._id ? `Editar ${formData.name || 'Partner'}` : 'Nuevo Partner'}
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-9 h-9 rounded-[10px] flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700 bg-white border border-slate-200 shadow-sm"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 flex-1 flex flex-col gap-6 custom-scrollbar drawer-form">

                    {/* Basic Info */}
                    <div className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                <User size={15} className="text-blue-500" />
                                1. Nombre Comercial *
                            </label>
                            <input
                                required
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Ej. Agencia Growth"
                                className="w-full px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                    <Phone size={15} className="text-emerald-500" />
                                    2. WhatsApp
                                </label>
                                <input
                                    type="tel"
                                    value={formData.phone}
                                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    placeholder="+54 9 11..."
                                    className="w-full px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                    <Mail size={15} className="text-fuchsia-500" />
                                    3. Email
                                </label>
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    placeholder="contacto@..."
                                    className="w-full px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-fuchsia-500/10 focus:border-fuchsia-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner"
                                />
                            </div>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-slate-200/50">
                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                <Percent size={15} className="text-amber-500" />
                                4. Comisión (%)
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="100"
                                value={formData.commissionPercentage || ''}
                                onChange={(e) => setFormData({ ...formData, commissionPercentage: Number(e.target.value) || 0 })}
                                placeholder="Ej. 15"
                                className="w-full px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-300 transition-all text-[14px] font-bold text-slate-700 placeholder:text-slate-400 shadow-inner max-w-[200px]"
                            />
                        </div>

                        {/* Responsable Selector */}
                        <div className="space-y-2 pt-2 border-t border-slate-200/50">
                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                <User size={15} className="text-fuchsia-500" />
                                Responsable
                            </label>
                            <div className="relative w-full">
                                <select
                                    value={(formData as any).assignedTo?._id || (formData as any).assignedTo || ''}
                                    onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value as any })}
                                    className="w-full pl-12 pr-10 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-fuchsia-500/10 focus:border-fuchsia-300 transition-all text-[14px] font-bold text-slate-700 shadow-inner appearance-none cursor-pointer"
                                >
                                    <option value="">Sin asignar</option>
                                    {teamUsers.map(u => (
                                        <option key={u._id} value={u._id}>{u.name || u.email}</option>
                                    ))}
                                </select>
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                    <OwnerAvatar
                                        name={teamUsers.find(u => u._id === ((formData as any).assignedTo?._id || (formData as any).assignedTo))?.name || ''}
                                        profilePhotoUrl={teamUsers.find(u => u._id === ((formData as any).assignedTo?._id || (formData as any).assignedTo))?.profilePhotoUrl}
                                        size="sm"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-slate-200/50 flex-1 flex flex-col">
                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                <FileText size={15} className="text-slate-500" />
                                5. Notas / Acuerdos Internos
                            </label>
                            <textarea
                                value={formData.notes || ''}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                placeholder="Escribe aquí los acuerdos específicos, método de pago, cuenta bancaria..."
                                className="w-full flex-1 min-h-[120px] px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-slate-500/10 focus:border-slate-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner custom-scrollbar resize-none"
                            />
                        </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-slate-200/50 flex gap-4 bg-white/50 backdrop-blur-md sticky bottom-0 -mx-6 px-6 pb-6 shadow-[0_-10px_20px_rgba(255,255,255,0.8)]">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-5 py-3.5 bg-white border border-slate-200/80 text-slate-600 rounded-[14px] font-bold hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || !formData.name}
                            className="flex-1 px-5 py-3.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-[14px] font-bold hover:shadow-[0_8px_24px_rgba(139,92,246,0.3)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(139,92,246,0.2)]"
                        >
                            {saving ? 'Guardando...' : <><Save size={18} /> {partner?._id ? 'Guardar Cambios' : 'Crear Partner'}</>}
                        </button>
                    </div>
                </form>
            </div>

            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
                .drawer-form .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .drawer-form .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .drawer-form .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(139, 92, 246, 0.2); border-radius: 10px; }
                .drawer-form .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: rgba(139, 92, 246, 0.4); }
            `}</style>
        </div>
    );
}
