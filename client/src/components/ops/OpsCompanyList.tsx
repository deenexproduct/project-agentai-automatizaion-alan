import { useState, useEffect } from 'react';
import { getOpsCompanies } from '../../services/ops.service';
import { Building2, MapPin, DollarSign, Search, ChevronRight } from 'lucide-react';

interface OpsCompany {
    _id: string;
    name: string;
    logo?: string;
    sector?: string;
    localesCount?: number;
    franchiseCount?: number;
    ownedCount?: number;
    website?: string;
    assignedTo?: { name: string; profilePhotoUrl?: string };
    opsDealsCount: number;
    opsStatuses: string[];
    opsTotalValue: number;
}

const STAGE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
    anticipo: { label: 'Anticipo', emoji: '🚀', color: '#f59e0b' },
    'go-live': { label: 'Go-Live', emoji: '🏪', color: '#3b82f6' },
    'ola-1': { label: 'Ola 1', emoji: '🌊', color: '#8b5cf6' },
    'cadena-completa': { label: 'Cadena Completa', emoji: '🏁', color: '#22c55e' },
};

export default function OpsCompanyList() {
    const [companies, setCompanies] = useState<OpsCompany[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadCompanies();
    }, []);

    const loadCompanies = async () => {
        setIsLoading(true);
        try {
            const data = await getOpsCompanies();
            setCompanies(data);
        } catch (error) {
            console.error('Failed to load ops companies:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const filtered = companies.filter(c => {
        if (!searchQuery) return true;
        return c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.sector?.toLowerCase().includes(searchQuery.toLowerCase());
    });

    const formatCurrency = (value: number) => {
        if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
        if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
        return `$${value.toLocaleString()}`;
    };

    return (
        <div className="space-y-4 py-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">Empresas en Operaciones</h2>
                    <p className="text-sm text-slate-500">{companies.length} empresas con proyectos activos</p>
                </div>
                <div className="relative w-full md:w-72">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar empresa..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none w-full transition-all"
                    />
                </div>
            </div>

            {/* Loading */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin"></div>
                </div>
            ) : filtered.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                    <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">
                        {companies.length === 0
                            ? 'No hay empresas en el pipeline de operaciones todavía'
                            : 'No se encontraron resultados'}
                    </p>
                    {companies.length === 0 && (
                        <p className="text-sm text-slate-400 mt-1">
                            Los deals marcados como "Ganado" en el CRM Comercial aparecerán aquí automáticamente
                        </p>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filtered.map((company) => (
                        <div
                            key={company._id}
                            className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg hover:border-sky-200 transition-all duration-200 group cursor-pointer"
                        >
                            <div className="flex items-start gap-3 mb-4">
                                {company.logo ? (
                                    <img
                                        src={company.logo}
                                        alt={company.name}
                                        className="w-12 h-12 rounded-xl object-cover border border-slate-100"
                                    />
                                ) : (
                                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-100 to-blue-100 flex items-center justify-center border border-sky-200/50">
                                        <Building2 className="w-6 h-6 text-sky-600" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-slate-800 truncate group-hover:text-sky-700 transition-colors">
                                        {company.name}
                                    </h3>
                                    {company.sector && (
                                        <p className="text-xs text-slate-500 truncate">{company.sector}</p>
                                    )}
                                </div>
                                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-sky-500 transition-colors shrink-0 mt-1" />
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-2 mb-3">
                                {company.localesCount != null && (
                                    <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                                        <span>{company.localesCount} locales</span>
                                    </div>
                                )}
                                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                    <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                                    <span>{formatCurrency(company.opsTotalValue)}</span>
                                </div>
                            </div>

                            {/* Stage badges */}
                            <div className="flex flex-wrap gap-1.5">
                                {company.opsStatuses.map((status) => {
                                    const cfg = STAGE_LABELS[status] || { label: status, emoji: '📋', color: '#64748b' };
                                    return (
                                        <span
                                            key={status}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                                            style={{
                                                background: cfg.color + '15',
                                                color: cfg.color,
                                                border: `1px solid ${cfg.color}30`,
                                            }}
                                        >
                                            {cfg.emoji} {cfg.label}
                                        </span>
                                    );
                                })}
                                {company.opsDealsCount > 1 && (
                                    <span className="text-xs text-slate-400 self-center ml-1">
                                        ({company.opsDealsCount} deals)
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
