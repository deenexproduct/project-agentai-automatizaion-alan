import { useState, useEffect, useRef } from 'react';
import { X, Save, Swords, Globe, User, Hash, FileText, AlertTriangle, Camera, ImagePlus, Loader2, Trash2, Plus, TrendingUp, TrendingDown, Building2, ExternalLink, Calendar } from 'lucide-react';
import { CompetitorData, createCompetitor, updateCompetitor, extractLogo, getCompetitorCompanies, CompanyData } from '../../services/crm.service';
import MultiCountrySelect from '../common/MultiCountrySelect';

interface Props {
    competitor?: CompetitorData | null;
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
}

const STRENGTH_OPTIONS: { value: 'fuerte' | 'moderada' | 'debil'; label: string; color: string; bg: string }[] = [
    { value: 'fuerte', label: 'Fuerte', color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
    { value: 'moderada', label: 'Moderada', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
    { value: 'debil', label: 'Débil', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
];

export default function CompetitorFormDrawer({ competitor, open, onClose, onSaved }: Props) {
    const [formData, setFormData] = useState<Partial<CompetitorData>>({
        name: '',
        logo: '',
        url: '',
        ceo: '',
        localesCount: 0,
        foundedYear: undefined,
        foundersCount: undefined,
        employeesCount: undefined,
        strength: 'moderada',
        notes: '',
        advantages: [],
        disadvantages: [],
        countries: [],
    });

    const [activeTab, setActiveTab] = useState<'info' | 'ventajas' | 'desventajas' | 'empresas'>('info');
    const [newItemText, setNewItemText] = useState('');
    const [linkedCompanies, setLinkedCompanies] = useState<CompanyData[]>([]);
    const [loadingCompanies, setLoadingCompanies] = useState(false);

    const [saving, setSaving] = useState(false);
    const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const drawerRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isExtractingLogo, setIsExtractingLogo] = useState(false);
    const [hasManuallyUploadedLogo, setHasManuallyUploadedLogo] = useState(false);
    const lastFetchedWebsite = useRef<string>(competitor?.url || '');

    useEffect(() => {
        if (open && competitor) {
            setHasManuallyUploadedLogo(false);
            lastFetchedWebsite.current = competitor.url || '';
            setFormData({
                name: competitor.name || '',
                logo: competitor.logo || '',
                url: competitor.url || '',
                ceo: competitor.ceo || '',
                localesCount: competitor.localesCount || 0,
                foundedYear: competitor.foundedYear || undefined,
                foundersCount: competitor.foundersCount || undefined,
                employeesCount: competitor.employeesCount || undefined,
                strength: competitor.strength || 'moderada',
                notes: competitor.notes || '',
                advantages: competitor.advantages || [],
                disadvantages: competitor.disadvantages || [],
                countries: competitor.countries || [],
            });
        } else if (open && !competitor) {
            setHasManuallyUploadedLogo(false);
            lastFetchedWebsite.current = '';
            setFormData({
                name: '',
                logo: '',
                url: '',
                ceo: '',
                localesCount: 0,
                foundedYear: undefined,
                foundersCount: undefined,
                employeesCount: undefined,
                strength: 'moderada',
                notes: '',
                advantages: [],
                disadvantages: [],
                countries: [],
            });
        }
        setIsDirty(false);
        setActiveTab('info');
        setNewItemText('');
        setLinkedCompanies([]);
    }, [open, competitor]);

    useEffect(() => {
        if (activeTab === 'empresas' && competitor?._id && linkedCompanies.length === 0) {
            setLoadingCompanies(true);
            getCompetitorCompanies(competitor._id)
                .then(res => setLinkedCompanies(res.companies || []))
                .catch(err => console.error('Error fetching competitor companies', err))
                .finally(() => setLoadingCompanies(false));
        }
    }, [activeTab, competitor?._id]);

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
            setIsDirty(true);
        } catch (err) {
            console.error('Error compressing photo:', err);
        } finally {
            setUploadingLogo(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
    const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation(); setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;
        try {
            setUploadingLogo(true);
            const compressed = await compressImage(file);
            setFormData(prev => ({ ...prev, logo: compressed }));
            setHasManuallyUploadedLogo(true);
            setIsDirty(true);
        } catch (err) {
            console.error('Error compressing dragged photo:', err);
        } finally {
            setUploadingLogo(false);
        }
    };

    const handleAddItem = (type: 'advantages' | 'disadvantages') => {
        if (!newItemText.trim()) return;
        setFormData(prev => ({
            ...prev,
            [type]: [...(prev[type] || []), { text: newItemText.trim(), createdAt: new Date().toISOString() }]
        }));
        setNewItemText('');
        setIsDirty(true);
    };

    const handleRemoveItem = (type: 'advantages' | 'disadvantages', index: number) => {
        setFormData(prev => ({
            ...prev,
            [type]: (prev[type] || []).filter((_, i) => i !== index)
        }));
        setIsDirty(true);
    };

    const handleWebsiteBlur = async () => {
        if (formData.url && !hasManuallyUploadedLogo && (formData.url !== lastFetchedWebsite.current || !formData.logo)) {
            setIsExtractingLogo(true);
            try {
                const { logo } = await extractLogo(formData.url);
                if (logo) {
                    setFormData(prev => ({ ...prev, logo }));
                    lastFetchedWebsite.current = formData.url;
                }
            } catch (error) {
                console.warn('Error extracting logo:', error);
            } finally {
                setIsExtractingLogo(false);
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            let currentLogo = formData.logo;

            if (formData.url && !hasManuallyUploadedLogo && (formData.url !== lastFetchedWebsite.current || !currentLogo)) {
                setIsExtractingLogo(true);
                try {
                    const { logo } = await extractLogo(formData.url);
                    if (logo) {
                        currentLogo = logo;
                        setFormData(prev => ({ ...prev, logo }));
                    }
                } catch (error) {
                    console.warn('Error extracting logo on submit:', error);
                } finally {
                    setIsExtractingLogo(false);
                }
            }

            const finalData = { ...formData, logo: currentLogo };

            if (competitor?._id) {
                await updateCompetitor(competitor._id, finalData);
            } else {
                await createCompetitor(finalData);
            }
            onSaved();
            onClose();
        } catch (error) {
            console.error('Error saving competitor:', error);
            alert('Error al guardar competidor');
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
            onClick={handleBackdropClick}
        >
            <div
                ref={drawerRef}
                className="h-full overflow-y-auto w-[460px] max-w-[100vw] bg-white/95 backdrop-blur-2xl border-l border-white/60 flex flex-col shadow-[-20px_0_40px_rgba(30,27,75,0.1)] relative"
                style={{
                    animation: 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
            >
                {/* Decorative Edge Highlight */}
                <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-red-500/50 via-amber-500/50 to-transparent" />

                {/* Header */}
                <div className="flex flex-col p-6 border-b border-slate-200/50 bg-white/50 backdrop-blur-md sticky top-0 z-20 shrink-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-[20px] font-bold text-slate-800 tracking-tight flex items-center gap-2">
                                <div className="w-9 h-9 rounded-[12px] bg-gradient-to-br from-red-500 to-amber-600 flex items-center justify-center shadow-sm">
                                    <Swords size={18} className="text-white" />
                                </div>
                                {competitor?._id ? `Editar ${formData.name || 'Competidor'}` : 'Nuevo Competidor'}
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={handleAttemptClose}
                            className="w-9 h-9 rounded-[10px] flex items-center justify-center hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-700 bg-white border border-slate-200 shadow-sm"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-2 mt-6 p-1 bg-slate-100/50 rounded-[12px] border border-slate-200/50">
                        <button
                            type="button"
                            onClick={() => setActiveTab('info')}
                            className={`flex-1 py-2 px-3 rounded-[8px] text-[13px] font-bold transition-all ${activeTab === 'info' ? 'bg-white text-slate-800 shadow-sm border border-slate-200/60' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
                        >
                            Info General
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('ventajas')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-[8px] text-[13px] font-bold transition-all ${activeTab === 'ventajas' ? 'bg-white text-emerald-700 shadow-sm border border-emerald-100' : 'text-slate-500 hover:text-emerald-700 hover:bg-emerald-50'}`}
                        >
                            <TrendingUp size={14} /> Ventajas
                            {(formData.advantages?.length || 0) > 0 && (
                                <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'ventajas' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                                    {formData.advantages?.length}
                                </span>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('desventajas')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-[8px] text-[13px] font-bold transition-all ${activeTab === 'desventajas' ? 'bg-white text-orange-700 shadow-sm border border-orange-100' : 'text-slate-500 hover:text-orange-700 hover:bg-orange-50'}`}
                        >
                            <TrendingDown size={14} /> <span className="hidden sm:inline">Contras</span>
                            {(formData.disadvantages?.length || 0) > 0 && (
                                <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${activeTab === 'desventajas' ? 'bg-orange-100 text-orange-700' : 'bg-slate-200 text-slate-500'}`}>
                                    {formData.disadvantages?.length}
                                </span>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('empresas')}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-[8px] text-[13px] font-bold transition-all ${activeTab === 'empresas' ? 'bg-white text-blue-700 shadow-sm border border-blue-100' : 'text-slate-500 hover:text-blue-700 hover:bg-blue-50'}`}
                        >
                            <Building2 size={14} /> Empresas
                        </button>
                    </div>
                </div>

                {/* Form */}
                <form id="competitor-form" onSubmit={handleSubmit} onChange={() => setIsDirty(true)} className="p-6 flex-1 flex flex-col gap-6 custom-scrollbar drawer-form">

                    <div className={activeTab === 'info' ? 'flex items-center gap-5' : 'hidden'}>
                        <div
                            className={`relative group rounded-[16px] transition-all ${isDragging ? 'ring-4 ring-red-500/30 scale-105' : ''}`}
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
                                        alt="Logo del competidor"
                                        className="w-20 h-20 rounded-[16px] object-contain bg-white border-2 border-slate-200 shadow-lg p-1"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => { setFormData(prev => ({ ...prev, logo: '' })); setIsDirty(true); }}
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
                                    className={`w-20 h-20 rounded-[16px] bg-gradient-to-br from-slate-100 to-slate-50 border-2 ${isDragging ? 'border-red-500 border-solid' : 'border-dashed border-slate-300 hover:border-red-400 hover:from-red-50 hover:to-amber-50'} transition-all flex flex-col items-center justify-center gap-1 cursor-pointer group/btn shadow-inner`}
                                >
                                    {uploadingLogo || isExtractingLogo ? (
                                        <Loader2 size={20} className="text-red-400 animate-spin" />
                                    ) : (
                                        <>
                                            <Camera size={20} className="text-slate-400 group-hover/btn:text-red-500 transition-colors" />
                                            <span className="text-[9px] font-bold text-slate-400 group-hover/btn:text-red-500 uppercase">Logo</span>
                                        </>
                                    )}
                                </button>
                            )}
                        </div>
                        <div className="flex-1 space-y-1">
                            <p className="text-[13px] font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                                <ImagePlus size={14} className="text-red-500" />
                                Logotipo del Competidor
                            </p>
                            <p className="text-[11px] text-slate-400 leading-snug">Arrastrá o subí una imagen del logo del competidor.</p>
                            {!formData.logo && (
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="mt-1.5 text-[12px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1 transition-colors"
                                >
                                    <Camera size={12} /> Seleccionar archivo
                                </button>
                            )}
                        </div>
                    </div>

                    <div className={activeTab === 'info' ? 'space-y-5' : 'hidden'}>
                        <div className="space-y-2 pt-2 border-t border-slate-200/50">
                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                <Swords size={15} className="text-red-500" />
                                Nombre del Competidor *
                            </label>
                            <input
                                required={activeTab === 'info'}
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="Ej. Competidor XYZ"
                                className="w-full px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-red-500/10 focus:border-red-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                <Globe size={15} className="text-emerald-500" />
                                Sitio Web / URL
                            </label>
                            <input
                                type="url"
                                value={formData.url}
                                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                                onBlur={handleWebsiteBlur}
                                placeholder="https://competidor.com"
                                className="w-full px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                <User size={15} className="text-blue-500" />
                                CEO / Referente
                            </label>
                            <input
                                type="text"
                                value={formData.ceo}
                                onChange={(e) => setFormData({ ...formData, ceo: e.target.value })}
                                placeholder="Ej. Juan Pérez"
                                className="w-full px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200/50">
                            <div className="space-y-2">
                                <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                    <Hash size={15} className="text-amber-500" />
                                    Locales Estimados
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={formData.localesCount || ''}
                                    onChange={(e) => setFormData({ ...formData, localesCount: Number(e.target.value) || 0 })}
                                    placeholder="Ej. 50"
                                    className="w-full px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-300 transition-all text-[14px] font-bold text-slate-700 placeholder:text-slate-400 shadow-inner [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                    <Swords size={15} className="text-red-500" />
                                    Nivel de Competencia
                                </label>
                                <select
                                    value={formData.strength || 'moderada'}
                                    onChange={(e) => setFormData({ ...formData, strength: e.target.value as any })}
                                    className="w-full px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-red-500/10 focus:border-red-300 transition-all text-[14px] font-bold text-slate-700 shadow-inner appearance-none cursor-pointer"
                                >
                                    {STRENGTH_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="pt-2 border-t border-slate-200/50">
                            <MultiCountrySelect
                                value={formData.countries || []}
                                onChange={(val) => setFormData({ ...formData, countries: val })}
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-4 pt-2 border-t border-slate-200/50">
                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                    <Calendar size={13} className="text-indigo-500" />
                                    Año Fundación
                                </label>
                                <input
                                    type="number"
                                    min="1800"
                                    max={new Date().getFullYear()}
                                    value={formData.foundedYear || ''}
                                    onChange={(e) => setFormData({ ...formData, foundedYear: Number(e.target.value) || undefined })}
                                    placeholder="Ej. 2015"
                                    className="w-full px-3 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[12px] focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-300 transition-all text-[13px] font-bold text-slate-700 placeholder:text-slate-400 shadow-inner [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                    <User size={13} className="text-cyan-500" />
                                    Fundadores
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={formData.foundersCount || ''}
                                    onChange={(e) => setFormData({ ...formData, foundersCount: Number(e.target.value) || undefined })}
                                    placeholder="Ej. 2"
                                    className="w-full px-3 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[12px] focus:outline-none focus:ring-4 focus:ring-cyan-500/10 focus:border-cyan-300 transition-all text-[13px] font-bold text-slate-700 placeholder:text-slate-400 shadow-inner [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                    <Building2 size={13} className="text-pink-500" />
                                    Empleados
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    value={formData.employeesCount || ''}
                                    onChange={(e) => setFormData({ ...formData, employeesCount: Number(e.target.value) || undefined })}
                                    placeholder="Ej. 150"
                                    className="w-full px-3 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[12px] focus:outline-none focus:ring-4 focus:ring-pink-500/10 focus:border-pink-300 transition-all text-[13px] font-bold text-slate-700 placeholder:text-slate-400 shadow-inner [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                                />
                            </div>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-slate-200/50 flex-1 flex flex-col">
                            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                                <FileText size={15} className="text-slate-500" />
                                Notas / Observaciones
                            </label>
                            <textarea
                                value={formData.notes || ''}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                placeholder="Información adicional sobre este competidor..."
                                className="w-full flex-1 min-h-[120px] px-4 py-3.5 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-slate-500/10 focus:border-slate-300 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 shadow-inner custom-scrollbar resize-none"
                            />
                        </div>
                    </div>

                    {/* Ventajas Tab */}
                    {activeTab === 'ventajas' && (
                        <div className="flex-1 flex flex-col gap-4 animate-[fadeIn_0.3s_ease-out]">
                            <div className="bg-emerald-50 rounded-[16px] p-5 border border-emerald-100/60 shadow-inner">
                                <label className="text-[13px] font-bold text-emerald-800 flex items-center gap-1.5 uppercase tracking-wide mb-3">
                                    <TrendingUp size={16} className="text-emerald-500" />
                                    Ventajas Competitivas
                                </label>
                                <p className="text-[12px] text-emerald-600/80 mb-4 font-medium leading-relaxed">
                                    Registrá las fortalezas de este competidor o en qué áreas nos superan para analizar oportunidades de mejora.
                                </p>
                                <div className="flex gap-2 relative">
                                    <input
                                        type="text"
                                        value={activeTab === 'ventajas' ? newItemText : ''}
                                        onChange={(e) => setNewItemText(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddItem('advantages'))}
                                        placeholder="Ej. Tienen mayor presencia en el interior del país..."
                                        className="flex-1 px-4 py-3 bg-white border border-emerald-200 rounded-[12px] focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/10 transition-all text-[14px] text-slate-700 placeholder:text-emerald-700/30 shadow-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleAddItem('advantages')}
                                        disabled={!newItemText.trim()}
                                        className="px-4 py-3 bg-emerald-500 text-white rounded-[12px] hover:bg-emerald-600 transition-colors disabled:opacity-50 disabled:hover:bg-emerald-500 shadow-sm flex items-center justify-center font-bold text-[13px] gap-1.5"
                                    >
                                        <Plus size={16} /> Agregar
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 space-y-3">
                                {formData.advantages && formData.advantages.length > 0 ? (
                                    formData.advantages.map((item, idx) => (
                                        <div key={`adv-${idx}`} className="group flex items-start gap-3 p-4 bg-white rounded-[14px] border border-slate-200/60 shadow-sm hover:border-emerald-200 transition-colors">
                                            <div className="w-8 h-8 rounded-[10px] bg-emerald-50 flex items-center justify-center shrink-0 border border-emerald-100">
                                                <TrendingUp size={15} className="text-emerald-500" />
                                            </div>
                                            <div className="flex-1 pt-0.5">
                                                <p className="text-[14px] text-slate-700 font-medium leading-relaxed break-words">{item.text}</p>
                                                {item.createdAt && (
                                                    <span className="text-[11px] text-slate-400 font-medium mt-1.5 block">
                                                        Agregado el {new Date(item.createdAt).toLocaleDateString('es-AR')}
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveItem('advantages', idx)}
                                                className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-[8px] transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                                                title="Eliminar ventaja"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex items-center justify-center h-full min-h-[160px] border-2 border-dashed border-slate-200 rounded-[16px] bg-slate-50/50">
                                        <p className="text-slate-400 text-[13px] font-medium text-center px-4">
                                            No hay ventajas registradas. <br />Añadí la primera arriba.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Desventajas Tab */}
                    {activeTab === 'desventajas' && (
                        <div className="flex-1 flex flex-col gap-4 animate-[fadeIn_0.3s_ease-out]">
                            <div className="bg-orange-50 rounded-[16px] p-5 border border-orange-100/60 shadow-inner">
                                <label className="text-[13px] font-bold text-orange-800 flex items-center gap-1.5 uppercase tracking-wide mb-3">
                                    <TrendingDown size={16} className="text-orange-500" />
                                    Desventajas Competitivas
                                </label>
                                <p className="text-[12px] text-orange-600/80 mb-4 font-medium leading-relaxed">
                                    Registrá las debilidades de este competidor o áreas críticas donde tienen peor desempeño.
                                </p>
                                <div className="flex gap-2 relative">
                                    <input
                                        type="text"
                                        value={activeTab === 'desventajas' ? newItemText : ''}
                                        onChange={(e) => setNewItemText(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddItem('disadvantages'))}
                                        placeholder="Ej. El servicio de entrega es lento..."
                                        className="flex-1 px-4 py-3 bg-white border border-orange-200 rounded-[12px] focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/10 transition-all text-[14px] text-slate-700 placeholder:text-orange-700/30 shadow-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleAddItem('disadvantages')}
                                        disabled={!newItemText.trim()}
                                        className="px-4 py-3 bg-orange-500 text-white rounded-[12px] hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:hover:bg-orange-500 shadow-sm flex items-center justify-center font-bold text-[13px] gap-1.5"
                                    >
                                        <Plus size={16} /> Agregar
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 space-y-3">
                                {formData.disadvantages && formData.disadvantages.length > 0 ? (
                                    formData.disadvantages.map((item, idx) => (
                                        <div key={`disadv-${idx}`} className="group flex items-start gap-3 p-4 bg-white rounded-[14px] border border-slate-200/60 shadow-sm hover:border-orange-200 transition-colors">
                                            <div className="w-8 h-8 rounded-[10px] bg-orange-50 flex items-center justify-center shrink-0 border border-orange-100">
                                                <TrendingDown size={15} className="text-orange-500" />
                                            </div>
                                            <div className="flex-1 pt-0.5">
                                                <p className="text-[14px] text-slate-700 font-medium leading-relaxed break-words">{item.text}</p>
                                                {item.createdAt && (
                                                    <span className="text-[11px] text-slate-400 font-medium mt-1.5 block">
                                                        Agregado el {new Date(item.createdAt).toLocaleDateString('es-AR')}
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleRemoveItem('disadvantages', idx)}
                                                className="w-8 h-8 flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-[8px] transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                                                title="Eliminar desventaja"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex items-center justify-center h-full min-h-[160px] border-2 border-dashed border-slate-200 rounded-[16px] bg-slate-50/50">
                                        <p className="text-slate-400 text-[13px] font-medium text-center px-4">
                                            No hay desventajas registradas. <br />Añadí la primera arriba.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Empresas Tab */}
                    {activeTab === 'empresas' && (
                        <div className="flex-1 flex flex-col gap-4 animate-[fadeIn_0.3s_ease-out]">
                            <div className="bg-blue-50 rounded-[16px] p-5 border border-blue-100/60 shadow-inner mb-2">
                                <label className="text-[13px] font-bold text-blue-800 flex items-center gap-1.5 uppercase tracking-wide mb-2">
                                    <Building2 size={16} className="text-blue-500" />
                                    Empresas Vinculadas
                                </label>
                                <p className="text-[12px] text-blue-600/80 font-medium leading-relaxed">
                                    Lista de empresas en el CRM que seleccionaron a este competidor. Agregá el competidor desde el formulario de la empresa.
                                </p>
                            </div>

                            <div className="flex-1 flex flex-col gap-3 pb-8">
                                {loadingCompanies ? (
                                    <div className="flex items-center justify-center h-full min-h-[160px]">
                                        <Loader2 size={24} className="text-blue-500 animate-spin" />
                                    </div>
                                ) : !competitor?._id ? (
                                    <div className="flex items-center justify-center h-full min-h-[160px] border-2 border-dashed border-slate-200 rounded-[16px] bg-slate-50/50">
                                        <p className="text-slate-400 text-[13px] font-medium text-center px-4">
                                            Guardá el competidor primero para <br />ver las empresas vinculadas.
                                        </p>
                                    </div>
                                ) : linkedCompanies.length > 0 ? (
                                    linkedCompanies.map((c) => (
                                        <div key={c._id} className="group flex flex-col gap-2 p-4 bg-white rounded-[14px] border border-slate-200/60 shadow-sm hover:border-blue-200 transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-[10px] bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center shrink-0 border border-blue-100/50 overflow-hidden">
                                                    {c.logo ? (
                                                        <img src={c.logo} alt={c.name} className="w-full h-full object-contain p-1" />
                                                    ) : (
                                                        <Building2 size={18} className="text-blue-500" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <a href={`/linkedin/companies/${c._id}`} target="_blank" rel="noreferrer" className="text-[14px] font-bold text-slate-800 hover:text-blue-600 transition-colors truncate block flex items-center gap-1.5">
                                                        {c.name} <ExternalLink size={12} className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                    </a>
                                                    {c.sector && <span className="text-[12px] text-slate-500 font-medium">{c.sector}</span>}
                                                </div>
                                                {c.localesCount !== undefined && (
                                                    <div className="shrink-0 bg-blue-50 px-2 py-1 rounded-[8px] border border-blue-100">
                                                        <span className="text-[12px] font-black text-blue-600">{c.localesCount}</span>
                                                        <span className="text-[10px] font-medium text-blue-400 ml-1">locales</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex items-center justify-center h-full min-h-[160px] border-2 border-dashed border-slate-200 rounded-[16px] bg-slate-50/50">
                                        <p className="text-slate-400 text-[13px] font-medium text-center px-4">
                                            No hay empresas vinculadas a <br />este competidor.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="mt-auto pt-4 border-t border-slate-200/50 flex gap-3 bg-white/50 backdrop-blur-md sticky bottom-0 -mx-6 px-6 pb-4">
                        <button
                            type="button"
                            onClick={handleAttemptClose}
                            className="flex-1 px-4 py-2 bg-white border border-slate-200/80 text-slate-600 rounded-[10px] text-[13px] font-bold hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || !formData.name}
                            className="flex-1 px-4 py-2 bg-gradient-to-r from-red-600 to-amber-600 text-white rounded-[10px] text-[13px] font-bold hover:shadow-[0_8px_24px_rgba(239,68,68,0.4)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(239,68,68,0.3)]"
                        >
                            {saving ? 'Guardando...' : <><Save size={16} /> {competitor?._id ? 'Guardar Cambios' : 'Crear Competidor'}</>}
                        </button>
                    </div>
                </form>
            </div>

            {showUnsavedConfirm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" style={{ animation: 'fadeIn 0.2s ease-out' }}>
                    <div className="bg-white rounded-[24px] p-6 max-w-sm w-full shadow-[0_20px_60px_rgba(0,0,0,0.1)] border border-slate-100" onClick={e => e.stopPropagation()}>
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
                                    const form = document.getElementById('competitor-form') as HTMLFormElement;
                                    if (form) form.requestSubmit();
                                }}
                                className="flex-1 py-3 px-4 bg-gradient-to-r from-red-600 to-amber-600 text-white font-bold rounded-[14px] hover:shadow-md transition-all shadow-sm text-[14px]"
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
                .drawer-form .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .drawer-form .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .drawer-form .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(239, 68, 68, 0.2); border-radius: 10px; }
                .drawer-form .custom-scrollbar:hover::-webkit-scrollbar-thumb { background: rgba(239, 68, 68, 0.4); }
            `}</style>
        </div>
    );
}
