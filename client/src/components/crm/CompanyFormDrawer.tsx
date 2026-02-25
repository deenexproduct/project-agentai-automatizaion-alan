import { useState, useEffect, useRef } from 'react';
import { X, Save, Building2, AlignLeft, Globe, Briefcase, Hash, User, Phone, Mail, Loader2, AlertTriangle, GitBranch, DollarSign, Clock, Calendar, CheckSquare, TrendingUp, History, Camera, ImagePlus, Trash2 } from 'lucide-react';
import { CompanyData, createCompany, updateCompany, deleteCompany, getSystemConfig, getPartners, SystemConfig, PartnerData, addCompanyCategory, getContacts, ContactData, extractLogo, getCompany, DealData, PipelineStage, getPipelineConfig, getTeamUsers, TeamUser } from '../../services/crm.service';
import { useAuth } from '../../contexts/AuthContext';
import OwnerAvatar from '../common/OwnerAvatar';

interface Props {
    company?: CompanyData | null;
    open: boolean;
    onClose: () => void;
    onSaved: (company: CompanyData) => void;
}

export default function CompanyFormDrawer({ company, open, onClose, onSaved }: Props) {
    const { user } = useAuth();
    const [formData, setFormData] = useState<Partial<CompanyData>>({
        name: '',
        website: '',
        logo: '',
        description: '',
        localesCount: 1,
        costPerLocation: 0,
        category: '',
        partner: undefined,
    });
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState<SystemConfig | null>(null);
    const [partners, setPartners] = useState<PartnerData[]>([]);
    const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
    const [companyContacts, setCompanyContacts] = useState<ContactData[]>([]);
    const [loadingContacts, setLoadingContacts] = useState(false);
    const [activeTab, setActiveTab] = useState<'info' | 'contacts' | 'trazabilidad'>('info');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [companyDeals, setCompanyDeals] = useState<DealData[]>([]);
    const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
    const [loadingDeals, setLoadingDeals] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [hasManuallyUploadedLogo, setHasManuallyUploadedLogo] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const drawerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const [cfg, parts, users] = await Promise.all([
                    getSystemConfig(),
                    getPartners(),
                    getTeamUsers()
                ]);
                setConfig(cfg);
                setPartners(parts.partners);
                setTeamUsers(users);
            } catch (error) {
                console.error("Failed to load options", error);
            }
        };
        loadInitialData();
    }, []);

    useEffect(() => {
        if (open && company) {
            setActiveTab('info');
            setShowDeleteConfirm(false);
            setHasManuallyUploadedLogo(false);
            lastFetchedWebsite.current = company.website || '';
            setFormData({
                name: company.name || '',
                website: company.website || '',
                logo: company.logo || '',
                description: company.description || '',
                localesCount: company.localesCount || 1,
                costPerLocation: company.costPerLocation || 0,
                category: company.category || '',
                partner: company.partner || undefined,
                assignedTo: (company as any).assignedTo,
            });
            // Fetch contacts for this company
            if (company._id) {
                setLoadingContacts(true);
                getContacts({ company: company._id, limit: 100 })
                    .then(res => setCompanyContacts(res.contacts))
                    .catch(err => console.error("Error loading company contacts", err))
                    .finally(() => setLoadingContacts(false));
                // Load deals for this company
                setLoadingDeals(true);
                getCompany(company._id)
                    .then(res => setCompanyDeals((res as any).deals || []))
                    .catch(err => console.error('Error loading company deals', err))
                    .finally(() => setLoadingDeals(false));
                // Load pipeline stages for label/color mapping
                getPipelineConfig()
                    .then(config => setPipelineStages(config.stages || []))
                    .catch(() => { });
            }
        } else if (open && !company) {
            setActiveTab('info');
            setShowDeleteConfirm(false);
            setHasManuallyUploadedLogo(false);
            lastFetchedWebsite.current = '';
            setCompanyContacts([]);
            setCompanyDeals([]);
            setFormData({
                name: '',
                website: '',
                logo: '',
                description: '',
                localesCount: 1,
                costPerLocation: 0,
                category: '',
                partner: undefined,
                assignedTo: user?._id as any,
            });
            setIsDirty(false);
        }
    }, [open, company, user?._id]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleAttemptClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, isDirty]);

    const handleAttemptClose = () => {
        if (isDirty) {
            setShowUnsavedConfirm(true);
        } else {
            onClose();
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
            handleAttemptClose();
        }
    };

    // Track form dirtiness on any field change
    const updateField = (updates: Partial<CompanyData>) => {
        setFormData(prev => ({ ...prev, ...updates }));
        setIsDirty(true);
    };

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
            setUploadingLogo(true);
            const compressed = await compressImage(file);
            setFormData(prev => ({ ...prev, logo: compressed }));
            setHasManuallyUploadedLogo(true);
        } catch (err) {
            console.error('Error compressing photo:', err);
        } finally {
            setUploadingLogo(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const file = e.dataTransfer.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;

        try {
            setUploadingLogo(true);
            const compressed = await compressImage(file);
            setFormData(prev => ({ ...prev, logo: compressed }));
            setHasManuallyUploadedLogo(true);
        } catch (err) {
            console.error('Error compressing dragged photo:', err);
        } finally {
            setUploadingLogo(false);
        }
    };

    const [isExtractingLogo, setIsExtractingLogo] = useState(false);
    const lastFetchedWebsite = useRef<string>(company?.website || '');

    const handleWebsiteBlur = async () => {
        if (formData.website && !hasManuallyUploadedLogo && (formData.website !== lastFetchedWebsite.current || !formData.logo)) {
            setIsExtractingLogo(true);
            try {
                // Call our new reliable backend scraper
                const { logo } = await extractLogo(formData.website);
                if (logo) {
                    setFormData(prev => ({ ...prev, logo }));
                    lastFetchedWebsite.current = formData.website;
                }
            } catch (error) {
                console.warn('Error extracting logo:', error);
                // The backend handles fallbacks so if it gets here, it's a network error
            } finally {
                setIsExtractingLogo(false);
            }
        }
    };


    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            // Auto-create category if new
            if (formData.category && config && !config.companyCategories.includes(formData.category)) {
                await addCompanyCategory(formData.category);
            }

            let currentLogo = formData.logo;

            // Enforce Logo Scraping on Submit if not triggered by blur
            if (formData.website && !hasManuallyUploadedLogo && (formData.website !== lastFetchedWebsite.current || !currentLogo)) {
                setIsExtractingLogo(true);
                try {
                    const { logo } = await extractLogo(formData.website);
                    if (logo) {
                        currentLogo = logo;
                        setFormData(prev => ({ ...prev, logo }));
                        lastFetchedWebsite.current = formData.website;
                    }
                } catch (error) {
                    console.warn('Error extracting logo on submit:', error);
                } finally {
                    setIsExtractingLogo(false);
                }
            }

            // Cleanup partner field if empty so we don't send string 'undefined'
            const payload: any = { ...formData, logo: currentLogo };
            if (payload.partner === '') payload.partner = undefined;
            if (payload.partner && typeof payload.partner === 'object' && '_id' in payload.partner) {
                payload.partner = (payload.partner as any)._id; // Just send the ID if it was an object
            }
            if (payload.assignedTo) {
                if (typeof payload.assignedTo === 'object' && '_id' in payload.assignedTo) {
                    payload.assignedTo = payload.assignedTo._id;
                }
            } else {
                payload.assignedTo = null;
            }

            let result;
            if (company?._id) {
                result = await updateCompany(company._id, payload);
            } else {
                result = await createCompany(payload);
            }
            onSaved(result);
            onClose();
        } catch (error) {
            console.error('Error saving company:', error);
            alert('Error al guardar la empresa');
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
                <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-blue-500/50 via-violet-500/50 to-transparent" />

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-200/50 bg-white/50 backdrop-blur-md sticky top-0 z-20">
                    <div>
                        <h2 className="text-[20px] font-bold text-slate-800 tracking-tight flex items-center gap-3">
                            <div className="relative w-10 h-10 shrink-0">
                                <div className={`absolute inset-0 rounded-[12px] bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-sm ${(formData.logo || isExtractingLogo) ? 'hidden' : ''} fallback-icon`}>
                                    <Building2 size={20} className="text-white" />
                                </div>
                                {isExtractingLogo && (
                                    <div className="absolute inset-0 rounded-[12px] bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                                        <Loader2 size={18} className="text-violet-500 animate-spin" />
                                    </div>
                                )}
                                {formData.logo && !isExtractingLogo && (
                                    <img
                                        src={formData.logo}
                                        alt="Logo"
                                        className="absolute inset-0 w-10 h-10 rounded-[12px] object-contain p-1 shadow-sm border border-slate-100 relative z-10"
                                        style={{ backgroundColor: formData.themeColor || 'white' }}
                                        onError={(e) => {
                                            e.currentTarget.style.display = 'none';
                                            const fallback = e.currentTarget.parentElement?.querySelector('.fallback-icon');
                                            if (fallback) fallback.classList.remove('hidden');
                                        }}
                                    />
                                )}
                            </div>
                            {company ? `Editar ${formData.name || 'Empresa'}` : 'Nueva Empresa'}
                        </h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleAttemptClose}
                            className="w-8 h-8 rounded-[10px] flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700 bg-white border border-slate-200 shadow-sm"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                {company && (
                    <div className="flex items-center gap-1 px-6 py-2 border-b border-white/50 bg-slate-50/50 backdrop-blur-md sticky top-[80px] z-10">
                        <button
                            type="button"
                            onClick={() => setActiveTab('info')}
                            className={`flex-1 py-2 text-[13px] font-bold rounded-[10px] transition-all flex items-center justify-center gap-2 ${activeTab === 'info' ? 'bg-white text-blue-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:bg-white/50 hover:text-slate-700'}`}
                        >
                            <AlignLeft size={16} /> Información
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('contacts')}
                            className={`flex-1 py-2 text-[13px] font-bold rounded-[10px] transition-all flex items-center justify-center gap-2 ${activeTab === 'contacts' ? 'bg-white text-fuchsia-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:bg-white/50 hover:text-slate-700'}`}
                        >
                            <User size={16} /> Contactos
                            {!loadingContacts && companyContacts.length > 0 && (
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === 'contacts' ? 'bg-fuchsia-100' : 'bg-slate-200'}`}>
                                    {companyContacts.length}
                                </span>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('trazabilidad')}
                            className={`flex-1 py-2 text-[13px] font-bold rounded-[10px] transition-all flex items-center justify-center gap-2 ${activeTab === 'trazabilidad' ? 'bg-white text-blue-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:bg-white/50 hover:text-slate-700'}`}
                        >
                            <GitBranch size={16} /> Traza
                            {companyDeals.length > 0 && (
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${activeTab === 'trazabilidad' ? 'bg-blue-100' : 'bg-slate-200'}`}>
                                    {companyDeals.length}
                                </span>
                            )}
                        </button>
                    </div>
                )}

                {/* Content */}
                <div className="p-6 flex-1 flex flex-col gap-6 overflow-y-auto hidden-scrollbar">
                    {activeTab === 'info' && (
                        <form id="company-form" onSubmit={handleSubmit} onChange={() => setIsDirty(true)} className="flex flex-col gap-6">

                            {/* Foto de Perfil Upload */}
                            <div className="flex items-center gap-5">
                                <div
                                    className={`relative group rounded-[16px] transition-all ${isDragging ? 'ring-4 ring-blue-500/30 scale-105' : ''}`}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/png,image/jpeg,image/jpg,image/webp"
                                        onChange={handlePhotoUpload}
                                        className="hidden"
                                    />
                                    {formData.logo ? (
                                        <div className="relative">
                                            <img
                                                src={formData.logo}
                                                alt="Logo de la empresa"
                                                className="w-20 h-20 rounded-[16px] object-contain bg-white border-2 border-slate-200 shadow-lg p-1"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setFormData(prev => ({ ...prev, logo: '' }))}
                                                className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={uploadingLogo || isExtractingLogo}
                                            className={`w-20 h-20 rounded-[16px] bg-gradient-to-br ${isExtractingLogo ? 'from-blue-50 to-indigo-50 border-blue-300' : 'from-slate-100 to-slate-50 border-slate-300 hover:border-blue-400 hover:from-blue-50 hover:to-indigo-50'} border-2 ${isDragging ? 'border-blue-500 border-solid' : 'border-dashed'} transition-all flex flex-col items-center justify-center gap-1 cursor-pointer group/btn shadow-inner`}
                                        >
                                            {(uploadingLogo || isExtractingLogo) ? (
                                                <div className="flex flex-col items-center gap-1">
                                                    <Loader2 size={20} className={`${isExtractingLogo ? 'text-blue-500' : 'text-blue-400'} animate-spin`} />
                                                    <span className="text-[8px] font-bold text-blue-500 uppercase">{isExtractingLogo ? 'Web' : 'Subiendo'}</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <Camera size={20} className="text-slate-400 group-hover/btn:text-blue-500 transition-colors" />
                                                    <span className="text-[9px] font-bold text-slate-400 group-hover/btn:text-blue-500 uppercase">Logo</span>
                                                </>
                                            )}
                                        </button>
                                    )}
                                </div>
                                <div className="flex-1 space-y-1">
                                    <p className="text-[13px] font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                                        <ImagePlus size={14} className="text-blue-500" />
                                        Logo de la Empresa
                                    </p>
                                    <p className="text-[11px] text-slate-400 leading-snug">Sube una imagen o ingresa el sitio web abajo para extraer el logo automáticamente.</p>
                                    {!formData.logo && (
                                        <button
                                            type="button"
                                            onClick={() => fileInputRef.current?.click()}
                                            className="mt-1.5 text-[12px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
                                        >
                                            <Camera size={12} /> Seleccionar archivo
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2 pt-6 border-t border-slate-200/50">
                                <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                    <Building2 size={14} className="text-blue-500" />
                                    Nombre de la Empresa *
                                </label>
                                <input
                                    required
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Ej. Acme Corp"
                                    className="w-full px-4 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner"
                                />
                            </div>



                            <div className="space-y-2 relative group">
                                <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                    <Briefcase size={14} className="text-indigo-500" />
                                    Categoría ICP
                                </label>
                                <input
                                    type="text"
                                    list="company-categories"
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                    placeholder="Ej. Gastronomía & Fast Food"
                                    className="w-full px-4 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner"
                                />
                                <datalist id="company-categories">
                                    {config?.companyCategories.map((c) => (
                                        <option key={c} value={c} />
                                    ))}
                                </datalist>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                    <Globe size={14} className="text-emerald-500" />
                                    Sitio Web
                                </label>
                                <input
                                    type="url"
                                    value={formData.website}
                                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                                    onBlur={handleWebsiteBlur}
                                    placeholder="https://tostadocafeclub.com/"
                                    className="w-full px-4 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner"
                                />
                            </div>



                            {/* Responsable Selector */}
                            <div className="space-y-2 mt-2 pt-6 border-t border-slate-200/50">
                                <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                    <User size={14} className="text-fuchsia-500" />
                                    Responsable
                                </label>
                                <div className="relative w-full">
                                    <select
                                        value={(formData as any).assignedTo?._id || (formData as any).assignedTo || ''}
                                        onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value as any })}
                                        className="w-full pl-12 pr-10 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-fuchsia-500/10 focus:border-fuchsia-300 transition-all text-[14px] font-bold text-slate-700 shadow-inner appearance-none cursor-pointer"
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

                            <div className="space-y-2 mt-2 pt-6 border-t border-slate-200/50">
                                <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                    <Hash size={14} className="text-amber-500" />
                                    Dimensión del Negocio
                                </label>
                                <div className="flex items-center gap-4">
                                    <div className="flex-1 relative group/input">
                                        <input
                                            type="number"
                                            min="0"
                                            value={formData.localesCount || ''}
                                            onChange={(e) => setFormData({ ...formData, localesCount: parseInt(e.target.value) || 0 })}
                                            placeholder="Cant. locales"
                                            className="w-full pl-4 pr-20 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 group-focus-within/input:text-amber-500 transition-colors">
                                            LOCALES
                                        </span>
                                    </div>
                                    <div className="flex-1 relative group/input">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold group-focus-within/input:text-emerald-500 transition-colors">$</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={formData.costPerLocation || ''}
                                            onChange={(e) => setFormData({ ...formData, costPerLocation: parseFloat(e.target.value) || 0 })}
                                            placeholder="Costo por local"
                                            className="w-full pl-8 pr-24 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400 group-focus-within/input:text-emerald-500 transition-colors">
                                            CADA UNO
                                        </span>
                                    </div>
                                </div>
                                {formData.localesCount && formData.costPerLocation ? (
                                    <div className="bg-emerald-50/80 backdrop-blur-md border border-emerald-100 rounded-[12px] px-4 py-3 mt-3 flex items-center justify-between shadow-sm">
                                        <span className="text-[12px] font-bold text-emerald-700">Valor Estimado Total</span>
                                        <span className="text-[15px] font-black text-emerald-600 bg-white px-3 py-1 rounded-[8px] shadow-sm border border-emerald-100/50">
                                            ${((formData.localesCount || 0) * (formData.costPerLocation || 0)).toLocaleString()}
                                        </span>
                                    </div>
                                ) : null}
                            </div>

                            <div className="space-y-2 mt-2 pt-6 border-t border-slate-200/50">
                                <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                    <Briefcase size={14} className="text-fuchsia-500" />
                                    Partner (Origen)
                                </label>
                                <select
                                    value={(formData.partner as any)?._id || formData.partner || ''}
                                    onChange={(e) => setFormData({ ...formData, partner: e.target.value as any })}
                                    className="w-full px-4 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-300 transition-all text-[14px] font-medium text-slate-700 shadow-inner appearance-none cursor-pointer"
                                >
                                    <option value="">Ninguno (Venta directa)</option>
                                    {partners.map(p => (
                                        <option key={p._id} value={p._id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2 mt-2 pt-6 border-t border-slate-200/50">
                                <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                    <AlignLeft size={14} className="text-slate-500" />
                                    Descripción
                                </label>
                                <textarea
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Añade detalles sobre esta empresa..."
                                    rows={4}
                                    className="w-full px-4 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-slate-500/10 focus:border-slate-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 resize-none shadow-inner custom-scrollbar"
                                />
                            </div>
                        </form>
                    )}

                    {activeTab === 'contacts' && (
                        <div className="flex flex-col gap-4 animate-[fadeIn_0.3s_ease-out]">
                            {loadingContacts ? (
                                <div className="flex flex-col gap-3">
                                    {[1, 2, 3].map(i => <div key={i} className="h-20 bg-white/40 border border-white/60 rounded-[16px] animate-pulse" />)}
                                </div>
                            ) : companyContacts.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center opacity-70 bg-white/30 rounded-[20px] border border-white/50">
                                    <div className="w-16 h-16 bg-fuchsia-50/80 rounded-[20px] flex items-center justify-center mb-4 border border-fuchsia-100/50 shadow-inner">
                                        <User size={24} className="text-fuchsia-400" />
                                    </div>
                                    <h3 className="text-[15px] font-bold text-slate-700">Sin contactos</h3>
                                    <p className="text-slate-500 text-[13px] font-medium max-w-[200px] mt-1">Acá verás todos los contactos asociados a esta empresa.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-3">
                                    {companyContacts.map(contact => (
                                        <div key={contact._id} className="bg-white/70 backdrop-blur-md rounded-[16px] p-4 border border-slate-200/60 shadow-sm flex flex-col gap-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-fuchsia-100 to-pink-100 border border-fuchsia-200/50 flex flex-col items-center justify-center shadow-sm shrink-0 overflow-hidden">
                                                        {contact.profilePhotoUrl ? (
                                                            <img src={contact.profilePhotoUrl} alt={contact.fullName} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <span className="font-bold text-[13px] text-fuchsia-700">{contact.fullName.charAt(0).toUpperCase()}</span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-[14px] text-slate-800 tracking-tight">{contact.fullName}</h4>
                                                        {contact.position && <span className="text-[12px] font-medium text-slate-500">{contact.position}</span>}
                                                    </div>
                                                </div>
                                                {contact.linkedInProfileUrl && (
                                                    <a href={contact.linkedInProfileUrl} target="_blank" rel="noreferrer" className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center hover:bg-blue-100 transition-colors shrink-0" title="Perfil de LinkedIn">
                                                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" /></svg>
                                                    </a>
                                                )}
                                            </div>
                                            {(contact.email || contact.phone) && (
                                                <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200/50">
                                                    {contact.email && (
                                                        <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 bg-slate-50 px-2 py-1 rounded-[6px] border border-slate-100 hover:text-blue-600 hover:border-blue-200 transition-colors">
                                                            <Mail size={12} /> {contact.email}
                                                        </a>
                                                    )}
                                                    {contact.phone && (
                                                        <a href={`https://wa.me/${contact.phone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-[6px] border border-emerald-100 hover:bg-emerald-100 transition-colors">
                                                            <Phone size={12} /> WhatsApp
                                                        </a>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'trazabilidad' && (
                        <div className="flex flex-col gap-4 animate-[fadeIn_0.3s_ease-out]">
                            {loadingDeals ? (
                                <div className="flex flex-col items-center justify-center py-16">
                                    <Loader2 size={28} className="animate-spin text-violet-400" />
                                    <p className="text-[13px] text-slate-400 mt-3 font-medium">Cargando oportunidades...</p>
                                </div>
                            ) : companyDeals.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center opacity-70 bg-white/30 rounded-[20px] border border-white/50">
                                    <div className="w-16 h-16 bg-blue-50/80 rounded-[20px] flex items-center justify-center mb-4 border border-blue-100/50 shadow-inner">
                                        <TrendingUp size={24} className="text-blue-400" />
                                    </div>
                                    <h3 className="text-[15px] font-bold text-slate-700">Sin oportunidades</h3>
                                    <p className="text-slate-500 text-[13px] font-medium max-w-[200px] mt-1">Esta empresa no tiene deals en el pipeline.</p>
                                </div>
                            ) : (
                                <>
                                    {/* Summary bar */}
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-xl text-[11px] font-bold text-emerald-700">
                                            <DollarSign size={12} className="text-emerald-500" />
                                            {companyDeals.reduce((s, d) => s + (d.value || 0), 0).toLocaleString()}
                                            <span className="text-emerald-500/70 font-medium">total</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 border border-violet-100 rounded-xl text-[11px] font-bold text-violet-700">
                                            <Briefcase size={12} className="text-violet-500" />
                                            {companyDeals.length}
                                            <span className="text-violet-500/70 font-medium">{companyDeals.length === 1 ? 'deal' : 'deals'}</span>
                                        </div>
                                    </div>

                                    {/* Deal cards */}
                                    {companyDeals.map(deal => {
                                        const stage = pipelineStages.find(s => s.key === deal.status);
                                        const stageLabel = stage?.label || deal.status;
                                        const stageColor = stage?.color || '#8b5cf6';

                                        return (
                                            <div
                                                key={deal._id}
                                                className="bg-white/70 backdrop-blur-md rounded-[16px] border border-slate-200/60 shadow-sm overflow-hidden"
                                            >
                                                <div className="h-1.5 w-full" style={{ background: `linear-gradient(90deg, ${stageColor}, ${stageColor}90)` }} />
                                                <div className="p-4">
                                                    {/* Stage + Value */}
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span
                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border"
                                                            style={{ color: stageColor, borderColor: stageColor + '30', background: stageColor + '10' }}
                                                        >
                                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stageColor }} />
                                                            {stageLabel}
                                                        </span>
                                                        <span className="text-[16px] font-extrabold text-emerald-600 font-mono tracking-tight">
                                                            ${deal.value?.toLocaleString() || 0}
                                                        </span>
                                                    </div>

                                                    {/* Title + Contact */}
                                                    <h4 className="text-[14px] font-bold text-slate-800 truncate leading-snug mb-1">
                                                        {deal.title}
                                                    </h4>
                                                    {deal.primaryContact?.fullName && (
                                                        <p className="text-[11px] text-slate-400 font-medium truncate mb-3 flex items-center gap-1">
                                                            <User size={10} />
                                                            {deal.primaryContact.fullName}
                                                            {deal.primaryContact.position && ` · ${deal.primaryContact.position}`}
                                                        </p>
                                                    )}

                                                    {/* Meta badges */}
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200/80 text-[10px] font-bold text-slate-500">
                                                            <Clock size={9} />
                                                            {(deal as any).daysInStatus || 0}d en etapa
                                                        </span>
                                                        {deal.expectedCloseDate && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200/80 text-[10px] font-bold text-slate-500">
                                                                <Calendar size={9} />
                                                                {new Date(deal.expectedCloseDate).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                                                            </span>
                                                        )}
                                                        {(deal as any).pendingTasks > 0 && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200/60 text-[10px] font-bold text-amber-600">
                                                                <CheckSquare size={9} />
                                                                {(deal as any).pendingTasks} tarea{(deal as any).pendingTasks !== 1 && 's'}
                                                            </span>
                                                        )}
                                                        <span className="text-[9px] text-slate-300 font-medium ml-auto">
                                                            Creado {new Date(deal.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                                                        </span>
                                                    </div>

                                                    {/* Owner */}
                                                    {deal.assignedTo && (
                                                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                                                            <OwnerAvatar name={deal.assignedTo.name} profilePhotoUrl={deal.assignedTo.profilePhotoUrl} size="xs" />
                                                            <span className="text-[11px] text-slate-500 font-medium">{deal.assignedTo.name}</span>
                                                        </div>
                                                    )}

                                                    {/* Status History Timeline */}
                                                    {((deal as any).statusHistory?.length > 0 || deal.createdAt) && (
                                                        <div className="mt-3 pt-3 border-t border-slate-100">
                                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                                                <History size={10} /> Recorrido en Pipeline
                                                            </div>
                                                            <div className="relative ml-1.5">
                                                                <div className="absolute left-[4.5px] top-1 bottom-1 w-px bg-slate-200" />
                                                                {/* Creation entry */}
                                                                <div className="relative flex items-start gap-2.5 pb-2">
                                                                    <div className="w-2.5 h-2.5 rounded-full bg-violet-400 border-2 border-white shadow-sm shrink-0 mt-0.5 z-10" />
                                                                    <div className="flex-1 flex items-baseline justify-between gap-2">
                                                                        <span className="text-[10px] font-bold text-slate-600">Creación</span>
                                                                        <span className="text-[9px] text-slate-400 font-medium shrink-0">
                                                                            {new Date(deal.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} {new Date(deal.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                {/* Status changes */}
                                                                {((deal as any).statusHistory || []).map((h: any, idx: number) => {
                                                                    const toStage = pipelineStages.find(s => s.key === h.to);
                                                                    const toLabel = toStage?.label || h.to;
                                                                    const toColor = toStage?.color || '#64748b';
                                                                    const isLast = idx === ((deal as any).statusHistory || []).length - 1;
                                                                    return (
                                                                        <div key={idx} className={`relative flex items-start gap-2.5 ${isLast ? '' : 'pb-2'}`}>
                                                                            <div className="w-2.5 h-2.5 rounded-full border-2 border-white shadow-sm shrink-0 mt-0.5 z-10" style={{ backgroundColor: toColor }} />
                                                                            <div className="flex-1 flex items-baseline justify-between gap-2">
                                                                                <span className="text-[10px] font-bold" style={{ color: toColor }}>{toLabel}</span>
                                                                                <span className="text-[9px] text-slate-400 font-medium shrink-0">
                                                                                    {new Date(h.changedAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} {new Date(h.changedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div className="pt-4 border-t border-slate-200/50 flex gap-3 bg-white/50 backdrop-blur-md sticky bottom-0 px-6 pb-4 z-20">
                    {company && activeTab === 'info' && (
                        <button
                            type="button"
                            onClick={() => setShowDeleteConfirm(true)}
                            className="flex-none px-3 py-2 bg-white border border-red-100 text-red-500 rounded-[10px] hover:bg-red-50 hover:border-red-200 transition-all shadow-sm flex items-center justify-center group"
                            title="Eliminar Empresa"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:scale-110 transition-transform"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleAttemptClose}
                        className="flex-1 px-4 py-2 bg-white border border-slate-200/80 text-slate-600 rounded-[10px] text-[13px] font-bold hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
                    >
                        {activeTab === 'contacts' || activeTab === 'trazabilidad' ? 'Cerrar' : 'Cancelar'}
                    </button>
                    {activeTab === 'info' && (
                        <button
                            type="submit"
                            form="company-form"
                            disabled={saving || !formData.name}
                            className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-violet-600 text-white rounded-[10px] text-[13px] font-bold hover:shadow-[0_8px_24px_rgba(59,130,246,0.4)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(59,130,246,0.3)]"
                        >
                            {saving ? 'Guardando...' : <><Save size={16} /> Guardar Empresa</>}
                        </button>
                    )}
                </div>
            </div >

            {/* Modal de confirmación de eliminación */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
                    <div className="bg-white rounded-[24px] p-6 max-w-sm w-full shadow-[0_20px_60px_rgba(0,0,0,0.1)] animate-[slideUp_0.3s_ease-out] border border-slate-100" onClick={e => e.stopPropagation()}>
                        <div className="w-14 h-14 bg-red-50 text-red-500 rounded-[16px] flex items-center justify-center mb-5 border border-red-100 shadow-inner">
                            <AlertTriangle size={28} />
                        </div>
                        <h3 className="text-[20px] font-bold text-slate-800 mb-2 tracking-tight">¿Eliminar Empresa?</h3>
                        <div className="text-slate-500 text-[14px] mb-6 leading-relaxed">
                            Estás a punto de eliminar <strong>{company?.name}</strong>. Esta acción no se puede deshacer.
                            {companyContacts.length > 0 && (
                                <div className="mt-4 p-3.5 bg-red-50 text-red-700 text-[13px] rounded-[12px] font-medium border border-red-100 flex items-start gap-2.5 shadow-sm">
                                    <AlertTriangle size={18} className="shrink-0 mt-0.5 text-red-500" />
                                    <span>
                                        Esta empresa tiene <strong>{companyContacts.length}</strong> contacto(s) vinculado(s). Eliminarla podría afectar la agenda.
                                    </span>
                                </div>
                            )}
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
                                        await deleteCompany(company!._id);
                                        onSaved({ ...company, _deleted: true } as any);
                                        setShowDeleteConfirm(false);
                                        onClose();
                                    } catch (error) {
                                        console.error('Error al eliminar empresa:', error);
                                        alert('Ha ocurrido un error al intentar eliminar la empresa.');
                                    }
                                }}
                                className="flex-1 py-3 px-4 bg-red-500 text-white font-bold rounded-[14px] hover:bg-red-600 transition-colors shadow-sm shadow-red-500/30 text-[14px]"
                            >
                                {companyContacts.length > 0 ? 'Eliminar igual' : 'Sí, eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showUnsavedConfirm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
                    <div className="bg-white rounded-[24px] p-6 max-w-sm w-full shadow-[0_20px_60px_rgba(0,0,0,0.1)] animate-[slideUp_0.3s_ease-out] border border-slate-100" onClick={e => e.stopPropagation()}>
                        <div className="w-14 h-14 bg-amber-50 text-amber-500 rounded-[16px] flex items-center justify-center mb-5 border border-amber-100 shadow-inner">
                            <AlertTriangle size={28} />
                        </div>
                        <h3 className="text-[20px] font-bold text-slate-800 mb-2 tracking-tight">¿Salir sin guardar?</h3>
                        <p className="text-slate-500 text-[14px] mb-6 leading-relaxed">
                            Tenés cambios sin guardar. ¿Querés guardarlos antes de salir?
                        </p>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => { setShowUnsavedConfirm(false); setIsDirty(false); onClose(); }}
                                className="flex-1 py-3 px-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-[14px] hover:bg-slate-50 transition-colors shadow-sm text-[14px]"
                            >
                                No, salir
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowUnsavedConfirm(false);
                                    const form = document.getElementById('company-form') as HTMLFormElement;
                                    if (form) form.requestSubmit();
                                }}
                                className="flex-1 py-3 px-4 bg-gradient-to-r from-blue-600 to-violet-600 text-white font-bold rounded-[14px] hover:shadow-md transition-all shadow-sm text-[14px]"
                            >
                                Sí, guardar
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
        </div >
    );
}
