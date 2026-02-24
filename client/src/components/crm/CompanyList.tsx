import { useState, useEffect } from 'react';
import { getCompanies, CompanyData } from '../../services/crm.service';
import { Search, MapPin, Globe, Users, Briefcase, Plus, Filter } from 'lucide-react';
import CompanyFormDrawer from './CompanyFormDrawer';
import PremiumHeader from './PremiumHeader';
import OwnerAvatar from '../common/OwnerAvatar';

export default function CompanyList({ onSelectCompany }: { onSelectCompany?: (id: string) => void }) {
    const [companies, setCompanies] = useState<CompanyData[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [editingCompany, setEditingCompany] = useState<CompanyData | null>(null);

    const loadCompanies = async () => {
        setLoading(true);
        try {
            const res = await getCompanies({ search, limit: 100 });
            setCompanies(res.companies);
        } catch (error) {
            console.error("Failed to load companies", error);
        } finally {
            setLoading(false);
        }
    };

    // Debounced search
    useEffect(() => {
        const timeout = setTimeout(() => {
            loadCompanies();
        }, 300);
        return () => clearTimeout(timeout);
    }, [search]);

    const handleEdit = (company: CompanyData, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingCompany(company);
        setIsDrawerOpen(true);
    };

    const handleAdd = () => {
        setEditingCompany(null);
        setIsDrawerOpen(true);
    };

    const handleSaved = (savedCompany: CompanyData & { _deleted?: boolean }) => {
        if (savedCompany._deleted) {
            setCompanies(prev => prev.filter(c => c._id !== savedCompany._id));
            return;
        }
        if (editingCompany) {
            setCompanies(prev => prev.map(c => c._id === savedCompany._id ? savedCompany : c));
        } else {
            setCompanies(prev => [savedCompany, ...prev]);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] min-h-[500px] relative mt-4 pb-20 md:pb-0">
            {/* Premium Header Reutilizable */}
            <div className="shrink-0 z-10 bg-white/40 backdrop-blur-2xl rounded-[24px] overflow-hidden mb-4 border border-white/60 shadow-[0_8px_32px_rgba(30,27,75,0.05)]">
                <PremiumHeader
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder="Buscar empresas, sectores..."
                    onAdd={handleAdd}
                    addLabel="Nueva Empresa"
                    onFilter={() => { }} // No implementation for filters in CompanyList yet, but button exists
                    showFilters={false}
                    containerClassName="px-5 py-2.5 !border-none !shadow-none bg-transparent"
                />
            </div>

            {/* List */}
            <div className="flex-1 bg-white/40 backdrop-blur-2xl rounded-[32px] shadow-[0_8px_32px_rgba(30,27,75,0.05)] border border-white/60 overflow-hidden relative flex flex-col">
                <div className="flex-1 overflow-y-auto p-3 md:p-6 hidden-scrollbar bg-white/20">
                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {[4, 5, 6].map(i => (
                                <div key={i} className="bg-white/40 backdrop-blur-md rounded-[24px] p-6 border border-white/60 shadow-sm animate-pulse h-48" />
                            ))}
                        </div>
                    ) : companies.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center opacity-70">
                            <div className="w-20 h-20 bg-violet-50/80 rounded-[24px] flex items-center justify-center mb-5 border border-violet-100/50 shadow-inner">
                                <span className="text-4xl opacity-50 drop-shadow-sm">🏢</span>
                            </div>
                            <h3 className="text-[16px] font-bold text-slate-700">Sin empresas</h3>
                            <p className="text-slate-500 text-[14px] font-medium max-w-sm mt-1">No encontramos empresas que coincidan con tu búsqueda.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {companies.map(company => (
                                <button
                                    key={company._id}
                                    onClick={(e) => {
                                        if (onSelectCompany) {
                                            onSelectCompany(company._id);
                                        } else {
                                            handleEdit(company, e);
                                        }
                                    }}
                                    className="group bg-white/80 backdrop-blur-xl rounded-[24px] p-5 border border-white/90 shadow-[0_4px_16px_rgba(30,27,75,0.03)] hover:shadow-[0_12px_32px_rgba(139,92,246,0.08)] hover:border-violet-200/50 hover:bg-white/95 transition-all duration-300 text-left flex flex-col items-start gap-4 relative overflow-hidden hover:-translate-y-1"
                                >
                                    {/* Decorative Gradient */}
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 opacity-0 group-hover:opacity-100 rounded-bl-full transition-opacity duration-500 -z-0 blur-xl" />

                                    <div className="relative z-10 flex w-full gap-4">
                                        <div className="w-14 h-14 rounded-[16px] border border-white/80 bg-white/80 flex items-center justify-center shadow-sm shrink-0 overflow-hidden backdrop-blur-md group-hover:shadow-[0_4px_12px_rgba(139,92,246,0.15)] transition-all relative">
                                            {company.logo ? (
                                                <img
                                                    src={company.logo}
                                                    alt={company.name}
                                                    className="w-full h-full object-contain p-1 absolute inset-0 z-10"
                                                    style={{ backgroundColor: company.themeColor || 'rgba(255, 255, 255, 0.5)' }}
                                                    onError={(e) => {
                                                        e.currentTarget.style.display = 'none';
                                                        const spanFallback = e.currentTarget.parentElement?.querySelector('span');
                                                        if (spanFallback) spanFallback.style.display = 'block';
                                                    }}
                                                />
                                            ) : null}
                                            <span
                                                className="font-black text-violet-500 text-xl tracking-tight relative z-0"
                                                style={{ display: company.logo ? 'none' : 'block' }}
                                            >
                                                {company.name.substring(0, 2).toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0 pt-1">
                                            <h3 className="font-bold text-slate-800 truncate text-[15px] group-hover:text-violet-700 transition-colors">
                                                {company.name}
                                            </h3>
                                            <p className="text-[13px] font-bold text-slate-500 truncate mt-0.5">
                                                {company.category || 'Categoría no definida'}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="w-full border-t border-slate-200/50 mt-1 mb-1 relative z-10" />

                                    {/* Bottom Row: Status & Actions */}
                                    <div className="relative z-10 w-full flex items-center gap-2 mt-auto">
                                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 bg-white/50 px-2.5 py-1.5 rounded-[8px] border border-slate-100 shadow-sm">
                                            <Users size={14} className="text-blue-500" />
                                            {company.contactsCount || 0} Contacto{(company.contactsCount !== 1) && 's'}
                                        </span>
                                        <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 bg-white/50 px-2.5 py-1.5 rounded-[8px] border border-slate-100 shadow-sm">
                                            <Briefcase size={14} className="text-emerald-500" />
                                            {company.dealsCount || 0} Deal{(company.dealsCount !== 1) && 's'}
                                        </span>

                                        <div className="ml-auto flex items-center gap-1.5">
                                            <OwnerAvatar name={company.assignedTo?.name} profilePhotoUrl={company.assignedTo?.profilePhotoUrl} size="xs" />
                                            {company.website && (
                                                <a
                                                    href={company.website.startsWith('http') ? company.website : `https://${company.website}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-8 h-8 rounded-[8px] bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:border-blue-200 hover:bg-blue-50 transition-all shadow-sm"
                                                >
                                                    <Globe size={14} />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <style>{`
                .hidden-scrollbar::-webkit-scrollbar { display: none; }
                .hidden-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>
            </div>

            <CompanyFormDrawer
                open={isDrawerOpen}
                company={editingCompany}
                onClose={() => setIsDrawerOpen(false)}
                onSaved={handleSaved}
            />
        </div>
    );
}
