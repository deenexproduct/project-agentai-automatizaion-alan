import { useState, useEffect, useRef } from 'react';
import { X, Save, User, Building2, Briefcase, Mail, Phone, Tag, AlertTriangle, Loader2, Camera, ImagePlus, Trash2 } from 'lucide-react';
import { ContactData, createContact, updateContact, deleteContact, getCompanies, CompanyData, getSystemConfig, getPartners, SystemConfig, PartnerData, addContactRole, addContactPosition } from '../../services/crm.service';
import api from '../../lib/axios';
import AutocompleteInput from '../common/AutocompleteInput';
import CreatableAutocompleteInput from '../common/CreatableAutocompleteInput';

interface Props {
    contact?: ContactData | null;
    open: boolean;
    onClose: () => void;
    onSaved: (contact: ContactData) => void;
}

export default function ContactFormDrawer({ contact, open, onClose, onSaved }: Props) {
    const [formData, setFormData] = useState<Partial<ContactData>>({
        fullName: '',
        position: '',
        role: '',
        channel: 'linkedin',
        email: '',
        phone: '',
        linkedInProfileUrl: '',
        company: undefined,
        tags: [],
        profilePhotoUrl: '',
    });
    const [companies, setCompanies] = useState<CompanyData[]>([]);
    const [companySearch, setCompanySearch] = useState('');
    const [saving, setSaving] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [extractingPhoto, setExtractingPhoto] = useState(false);
    const [config, setConfig] = useState<SystemConfig | null>(null);
    const [partners, setPartners] = useState<PartnerData[]>([]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const drawerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch config and partners
    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const [cfg, parts] = await Promise.all([
                    getSystemConfig(),
                    getPartners()
                ]);
                setConfig(cfg);
                setPartners(parts.partners);
            } catch (error) {
                console.error("Failed to load options", error);
            }
        };
        loadInitialData();
    }, []);

    // Load initial data
    useEffect(() => {
        if (open && contact) {
            setShowDeleteConfirm(false);
            setFormData({
                fullName: contact.fullName || '',
                position: contact.position || '',
                role: contact.role || '',
                channel: contact.channel || 'linkedin',
                email: contact.email || '',
                phone: contact.phone || '',
                linkedInProfileUrl: contact.linkedInProfileUrl || '',
                profilePhotoUrl: contact.profilePhotoUrl || '',
                company: contact.company || undefined,
                tags: contact.tags || [],
            });
            if (contact.company) {
                setCompanySearch(contact.company.name);
            } else {
                setCompanySearch('');
            }
        } else if (open && !contact) {
            setShowDeleteConfirm(false);
            setFormData({
                fullName: '',
                position: '',
                role: '',
                channel: '',
                email: '',
                phone: '',
                linkedInProfileUrl: '',
                profilePhotoUrl: '',
                company: undefined,
                tags: [],
            });
            setCompanySearch('');
        }
    }, [open, contact]);

    // Load companies for autocomplete
    useEffect(() => {
        if (!open) return;
        const fetchComps = async () => {
            try {
                const res = await getCompanies({ search: companySearch, limit: 10 });
                setCompanies(res.companies);
            } catch { /* ignore */ }
        };
        const timeoutId = setTimeout(fetchComps, 300);
        return () => clearTimeout(timeoutId);
    }, [companySearch, open]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, onClose]);

    // Compress and convert image to base64 data URL
    const compressImage = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_SIZE = 200;
                    let w = img.width;
                    let h = img.height;
                    // Scale down to MAX_SIZE keeping aspect ratio
                    if (w > h) { h = (h / w) * MAX_SIZE; w = MAX_SIZE; }
                    else { w = (w / h) * MAX_SIZE; h = MAX_SIZE; }
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d')!;
                    ctx.drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/webp', 0.8));
                };
                img.onerror = reject;
                img.src = e.target?.result as string;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setUploadingPhoto(true);
            const compressed = await compressImage(file);
            setFormData(prev => ({ ...prev, profilePhotoUrl: compressed }));
        } catch (err) {
            console.error('Error compressing photo:', err);
        } finally {
            setUploadingPhoto(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Auto-extract profile photo from LinkedIn URL
    useEffect(() => {
        const linkedInUrl = formData.linkedInProfileUrl;
        if (!linkedInUrl || !linkedInUrl.includes('linkedin.com/in/') || formData.profilePhotoUrl) {
            return;
        }
        const fetchPhoto = async () => {
            try {
                setExtractingPhoto(true);
                const res = await api.get('/linkedin/scrape-profile', { params: { url: linkedInUrl } });
                if (res.data?.profilePhotoUrl) {
                    setFormData(prev => {
                        if (prev.profilePhotoUrl) return prev; // Don't overwrite if user already uploaded
                        return { ...prev, profilePhotoUrl: res.data.profilePhotoUrl };
                    });
                }
            } catch (err: any) {
                console.warn('Could not extract LinkedIn photo:', err?.response?.data?.error || err.message);
            } finally {
                setExtractingPhoto(false);
            }
        };
        const timeoutId = setTimeout(fetchPhoto, 1500);
        return () => clearTimeout(timeoutId);
    }, [formData.linkedInProfileUrl]);

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
            onClose();
        }
    };

    const handleSelectCompany = (comp: CompanyData) => {
        setFormData({ ...formData, company: { _id: comp._id, name: comp.name } as any });
        setCompanySearch(comp.name);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            // Auto-create role if new
            if (formData.role && config && !config.contactRoles.includes(formData.role)) {
                await addContactRole(formData.role);
            }

            // Send company ID (handle both object with _id and direct string ID)
            const companyId = formData.company?._id || formData.company;
            const payload: any = { ...formData, company: companyId || undefined };

            // Cleanup partner 
            if (payload.partner === '' || payload.channel !== 'partners') payload.partner = undefined;
            if (payload.partner && typeof payload.partner === 'object' && '_id' in payload.partner) {
                payload.partner = (payload.partner as any)._id;
            }

            let result;
            if (contact?._id) {
                result = await updateContact(contact._id, payload);
            } else {
                result = await createContact(payload);
            }
            onSaved(result);
            onClose();
        } catch (error) {
            console.error('Error saving contact:', error);
            alert('Error al guardar el contacto');
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    return (
        <div
            onClick={handleBackdropClick}
            className="fixed inset-0 z-[100] flex justify-end"
            style={{
                background: 'rgba(15, 23, 42, 0.4)', // Darker, moodier slate backdrop
                backdropFilter: 'blur(8px)',
                animation: 'fadeIn 0.3s ease-out',
            }}
        >
            <div
                ref={drawerRef}
                className="h-full overflow-y-auto w-[460px] max-w-[100vw] bg-white/90 backdrop-blur-2xl border-l border-white/60 flex flex-col shadow-[-20px_0_40px_rgba(30,27,75,0.1)] relative"
                style={{
                    animation: 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
            >
                {/* Decorative Edge Highlight */}
                <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-fuchsia-500/50 via-violet-500/50 to-transparent" />

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-200/50 bg-white/50 backdrop-blur-md sticky top-0 z-20">
                    <div>
                        <h2 className="text-[20px] font-bold text-slate-800 tracking-tight flex items-center gap-2">
                            {formData.profilePhotoUrl ? (
                                <img src={formData.profilePhotoUrl} alt="Profile" className="w-8 h-8 rounded-[10px] object-cover shadow-sm border border-slate-200" />
                            ) : (
                                <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center shadow-sm">
                                    <User size={16} className="text-white" />
                                </div>
                            )}
                            {contact ? `Editar ${formData.fullName || 'Contacto'}` : 'Nuevo Contacto'}
                        </h2>
                        <p className="text-[13px] font-medium text-slate-500 mt-1 ml-10">
                            {contact ? 'Modifica los datos del contacto.' : 'Ingresa los datos para registrar un contacto.'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-[10px] flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700 bg-white border border-slate-200 shadow-sm"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 flex-1 flex flex-col gap-6">

                    {/* Foto de Perfil Upload */}
                    <div className="flex items-center gap-5">
                        <div className="relative group">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/jpg,image/webp"
                                onChange={handlePhotoUpload}
                                className="hidden"
                            />
                            {formData.profilePhotoUrl ? (
                                <div className="relative">
                                    <img
                                        src={formData.profilePhotoUrl}
                                        alt="Foto de perfil"
                                        className="w-20 h-20 rounded-[16px] object-cover border-2 border-white shadow-lg ring-2 ring-fuchsia-200"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, profilePhotoUrl: '' }))}
                                        className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploadingPhoto || extractingPhoto}
                                    className={`w-20 h-20 rounded-[16px] bg-gradient-to-br ${extractingPhoto ? 'from-blue-50 to-indigo-50 border-blue-300' : 'from-slate-100 to-slate-50 border-slate-300 hover:border-fuchsia-400 hover:from-fuchsia-50 hover:to-violet-50'} border-2 border-dashed transition-all flex flex-col items-center justify-center gap-1 cursor-pointer group/btn shadow-inner`}
                                >
                                    {(uploadingPhoto || extractingPhoto) ? (
                                        <div className="flex flex-col items-center gap-1">
                                            <Loader2 size={20} className={`${extractingPhoto ? 'text-blue-500' : 'text-fuchsia-400'} animate-spin`} />
                                            <span className="text-[8px] font-bold text-blue-500 uppercase">{extractingPhoto ? 'LinkedIn' : 'Subiendo'}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <Camera size={20} className="text-slate-400 group-hover/btn:text-fuchsia-500 transition-colors" />
                                            <span className="text-[9px] font-bold text-slate-400 group-hover/btn:text-fuchsia-500 uppercase">Foto</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                        <div className="flex-1 space-y-1">
                            <p className="text-[13px] font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                                <ImagePlus size={14} className="text-fuchsia-500" />
                                Foto de Perfil
                            </p>
                            <p className="text-[11px] text-slate-400 leading-snug">Subí una imagen o pegá el link de LinkedIn abajo para extraerla automáticamente.</p>
                            {!formData.profilePhotoUrl && (
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="mt-1.5 text-[12px] font-bold text-fuchsia-600 hover:text-fuchsia-700 flex items-center gap-1 transition-colors"
                                >
                                    <Camera size={12} /> Seleccionar archivo
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                            <User size={14} className="text-fuchsia-500" />
                            Nombre Completo *
                        </label>
                        <input
                            required
                            type="text"
                            value={formData.fullName}
                            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                            placeholder="Ej. Juan Pérez"
                            className="w-full px-4 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-fuchsia-500/10 focus:border-fuchsia-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner"
                        />
                    </div>

                    <div className="space-y-2">
                        <CreatableAutocompleteInput
                            label="Cargo"
                            icon={<Briefcase size={14} className="text-amber-500" />}
                            placeholder="Ej. Gerente de Ventas"
                            value={formData.position || ''}
                            onChangeSearch={(val) => setFormData(prev => ({ ...prev, position: val }))}
                            options={config?.contactPositions?.map(p => ({ id: p, title: p })) || []}
                            onSelect={(opt) => setFormData(prev => ({ ...prev, position: opt.title }))}
                            onCreate={async (newTitle) => {
                                await addContactPosition(newTitle);
                                setConfig(prev => prev ? { ...prev, contactPositions: [...prev.contactPositions, newTitle] } : null);
                            }}
                            colorTheme="amber"
                        />
                    </div>

                    {/* Company Autocomplete */}
                    <div className="mt-2 pt-6 border-t border-slate-200/50">
                        <AutocompleteInput
                            label="Empresa"
                            icon={<Building2 size={14} className="text-blue-500" />}
                            placeholder="Buscar y seleccionar empresa..."
                            value={companySearch}
                            onChangeSearch={(val) => {
                                setCompanySearch(val);
                                setFormData({ ...formData, company: undefined }); // Clear selection if typing
                            }}
                            options={companies.map(c => ({ _id: c._id, title: c.name, subtitle: c.sector || c.website, data: c }))}
                            onSelect={(opt) => handleSelectCompany(opt.data)}
                            colorTheme="indigo"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-2">
                            <CreatableAutocompleteInput
                                label="Rol de Compra"
                                icon={<Tag size={14} className="text-slate-500" />}
                                placeholder="Ej. Decisor / Ejecutivo"
                                value={formData.role || ''}
                                onChangeSearch={(val) => setFormData(prev => ({ ...prev, role: val }))}
                                options={config?.contactRoles?.map(r => ({ id: r, title: r })) || []}
                                onSelect={(opt) => setFormData(prev => ({ ...prev, role: opt.title }))}
                                onCreate={async (newTitle) => {
                                    await addContactRole(newTitle);
                                    setConfig(prev => prev ? { ...prev, contactRoles: [...prev.contactRoles, newTitle] } : null);
                                }}
                                colorTheme="violet"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                Canal de Origen
                            </label>
                            <select
                                value={formData.channel}
                                onChange={(e) => setFormData({ ...formData, channel: e.target.value })}
                                className="w-full px-4 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-300 transition-all text-[14px] font-medium text-slate-700 shadow-inner appearance-none cursor-pointer"
                            >
                                <option value="linkedin">LinkedIn</option>
                                <option value="whatsapp">WhatsApp</option>
                                <option value="email">Email</option>
                                <option value="phone">Teléfono</option>
                                <option value="partners">Partners</option>
                                <option value="other">Otro</option>
                            </select>
                        </div>
                    </div>

                    {formData.channel === 'partners' && (
                        <div className="space-y-2 bg-emerald-50/50 p-4 rounded-[16px] border border-emerald-100 backdrop-blur-sm">
                            <label className="text-[13px] font-bold text-emerald-800 flex items-center gap-1.5 uppercase tracking-wide">
                                <Building2 size={14} />
                                Seleccionar Partner
                            </label>
                            <select
                                value={(formData.partner as any)?._id || formData.partner || ''}
                                onChange={(e) => setFormData({ ...formData, partner: e.target.value as any })}
                                className="w-full px-4 py-3 bg-white/60 backdrop-blur-sm border border-emerald-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-300 transition-all text-[14px] font-medium text-slate-700 shadow-inner appearance-none cursor-pointer"
                            >
                                <option value="">Seleccione un Partner...</option>
                                {partners.map(p => (
                                    <option key={p._id} value={p._id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* LinkedIn Profile URL */}
                    <div className="space-y-2">
                        <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg>
                            Perfil de LinkedIn
                        </label>
                        <input
                            type="url"
                            value={formData.linkedInProfileUrl}
                            onChange={(e) => setFormData({ ...formData, linkedInProfileUrl: e.target.value })}
                            placeholder="https://www.linkedin.com/in/..."
                            className="w-full px-4 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-2">
                        <div className="space-y-2">
                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                <Mail size={14} className="text-teal-500" />
                                Email
                            </label>
                            <input
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                placeholder="ejemplo@acme.com"
                                className="w-full px-4 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                <Phone size={14} className="text-green-500" />
                                WhatsApp
                            </label>
                            <input
                                type="tel"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                placeholder="+54 9 11 ..."
                                className="w-full px-4 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-green-500/10 focus:border-green-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner"
                            />
                        </div>
                    </div>

                    <div className="mt-auto pt-4 border-t border-slate-200/50 flex gap-3 bg-white/50 backdrop-blur-md sticky bottom-0 -mx-6 px-6 pb-4">
                        {contact && (
                            <button
                                type="button"
                                onClick={() => setShowDeleteConfirm(true)}
                                className="flex-none px-3 py-2 bg-white border border-red-100 text-red-500 rounded-[10px] hover:bg-red-50 hover:border-red-200 transition-all shadow-sm flex items-center justify-center group"
                                title="Eliminar Contacto"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:scale-110 transition-transform"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 bg-white border border-slate-200/80 text-slate-600 rounded-[10px] text-[13px] font-bold hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || !formData.fullName}
                            className="flex-1 px-4 py-2 bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white rounded-[10px] text-[13px] font-bold hover:shadow-[0_8px_24px_rgba(217,70,239,0.4)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(217,70,239,0.3)]"
                        >
                            {saving ? 'Guardando...' : <><Save size={16} /> Guardar Contacto</>}
                        </button>
                    </div>
                </form>
            </div>

            {/* Modal de confirmación de eliminación */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
                    <div className="bg-white rounded-[24px] p-6 max-w-sm w-full shadow-[0_20px_60px_rgba(0,0,0,0.1)] animate-[slideUp_0.3s_ease-out] border border-slate-100" onClick={e => e.stopPropagation()}>
                        <div className="w-14 h-14 bg-red-50 text-red-500 rounded-[16px] flex items-center justify-center mb-5 border border-red-100 shadow-inner">
                            <AlertTriangle size={28} />
                        </div>
                        <h3 className="text-[20px] font-bold text-slate-800 mb-2 tracking-tight">¿Eliminar Contacto?</h3>
                        <div className="text-slate-500 text-[14px] mb-6 leading-relaxed">
                            Estás a punto de eliminar a <strong>{contact?.fullName}</strong>. Esta acción no se puede deshacer.
                        </div>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setShowDeleteConfirm(false)}
                                className="flex-1 py-3 px-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-[14px] hover:bg-slate-50 transition-colors shadow-sm text-[14px]"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    try {
                                        await deleteContact(contact!._id);
                                        onSaved({ ...contact, _deleted: true } as any);
                                        setShowDeleteConfirm(false);
                                        onClose();
                                    } catch (error) {
                                        console.error('Error al eliminar contacto:', error);
                                        alert('Ha ocurrido un error al intentar eliminar el contacto.');
                                    }
                                }}
                                className="flex-1 py-3 px-4 bg-red-500 text-white font-bold rounded-[14px] hover:bg-red-600 transition-colors shadow-sm shadow-red-500/30 text-[14px]"
                            >
                                Sí, eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
                @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            `}</style>
        </div>
    );
}
