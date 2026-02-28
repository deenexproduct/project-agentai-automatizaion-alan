import { Globe, ChevronDown, Check, X, Search } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export interface CountryOption {
    code: string;
    name: string;
    flag: string;
}

export const ALL_COUNTRIES: CountryOption[] = [
    // LATAM
    { code: 'AR', name: 'Argentina', flag: '🇦🇷' },
    { code: 'BO', name: 'Bolivia', flag: '🇧🇴' },
    { code: 'BR', name: 'Brasil', flag: '🇧🇷' },
    { code: 'BZ', name: 'Belice', flag: '🇧🇿' },
    { code: 'CL', name: 'Chile', flag: '🇨🇱' },
    { code: 'CO', name: 'Colombia', flag: '🇨🇴' },
    { code: 'CR', name: 'Costa Rica', flag: '🇨🇷' },
    { code: 'CU', name: 'Cuba', flag: '🇨🇺' },
    { code: 'DO', name: 'República Dominicana', flag: '🇩🇴' },
    { code: 'EC', name: 'Ecuador', flag: '🇪🇨' },
    { code: 'GT', name: 'Guatemala', flag: '🇬🇹' },
    { code: 'GY', name: 'Guyana', flag: '🇬🇾' },
    { code: 'HN', name: 'Honduras', flag: '🇭🇳' },
    { code: 'HT', name: 'Haití', flag: '🇭🇹' },
    { code: 'JM', name: 'Jamaica', flag: '🇯🇲' },
    { code: 'MX', name: 'México', flag: '🇲🇽' },
    { code: 'NI', name: 'Nicaragua', flag: '🇳🇮' },
    { code: 'PA', name: 'Panamá', flag: '🇵🇦' },
    { code: 'PE', name: 'Perú', flag: '🇵🇪' },
    { code: 'PR', name: 'Puerto Rico', flag: '🇵🇷' },
    { code: 'PY', name: 'Paraguay', flag: '🇵🇾' },
    { code: 'SR', name: 'Surinam', flag: '🇸🇷' },
    { code: 'SV', name: 'El Salvador', flag: '🇸🇻' },
    { code: 'TT', name: 'Trinidad y Tobago', flag: '🇹🇹' },
    { code: 'US', name: 'Estados Unidos', flag: '🇺🇸' },
    { code: 'UY', name: 'Uruguay', flag: '🇺🇾' },
    { code: 'VE', name: 'Venezuela', flag: '🇻🇪' },

    // Europe Additions
    { code: 'ES', name: 'España', flag: '🇪🇸' },
    { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
    { code: 'IT', name: 'Italia', flag: '🇮🇹' },
    { code: 'FR', name: 'Francia', flag: '🇫🇷' },
];

interface MultiCountrySelectProps {
    value: string[];
    onChange: (codes: string[]) => void;
    className?: string;
}

export default function MultiCountrySelect({ value, onChange, className }: MultiCountrySelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearchQuery('');
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleCountry = (code: string) => {
        if (value.includes(code)) {
            onChange(value.filter(c => c !== code));
        } else {
            onChange([...value, code]);
        }
        if (searchInputRef.current) {
            searchInputRef.current.focus();
        }
    };

    const selectedCountries = ALL_COUNTRIES.filter(c => value.includes(c.code));

    const filteredCountries = ALL_COUNTRIES.filter(country =>
        country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        country.code.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-2" ref={dropdownRef}>
            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                <Globe size={14} className="text-sky-500" />
                Presencia (Países)
            </label>
            <div className="relative">
                <div
                    onClick={() => setIsOpen(!isOpen)}
                    className={`w-full min-h-[48px] flex flex-wrap items-center gap-2 pl-4 pr-10 py-2.5 bg-white/60 backdrop-blur-sm border ${isOpen ? 'border-sky-300 ring-4 ring-sky-500/10' : 'border-slate-200'} rounded-[14px] transition-all shadow-inner text-left cursor-pointer ${className || ''}`}
                >
                    {selectedCountries.length === 0 ? (
                        <span className="text-[14px] font-medium text-slate-400 select-none py-0.5">
                            Seleccionar países...
                        </span>
                    ) : (
                        selectedCountries.map(country => (
                            <div
                                key={country.code}
                                onClick={(e) => { e.stopPropagation(); toggleCountry(country.code); }}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-sky-50 hover:bg-red-50 hover:text-red-600 hover:border-red-200 border border-sky-200 text-sky-700 rounded-[8px] text-[12px] font-bold shadow-sm transition-colors group z-10"
                            >
                                <span className="text-[14px] leading-none">{country.flag}</span>
                                {country.name}
                                <button
                                    type="button"
                                    className="ml-0.5 text-sky-400 group-hover:text-red-500 p-0.5 transition-colors"
                                >
                                    <X size={12} />
                                </button>
                            </div>
                        ))
                    )}
                    <ChevronDown size={16} className={`absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-transform duration-200 pointer-events-none ${isOpen ? 'rotate-180' : ''}`} />
                </div>

                {isOpen && (
                    <div className="absolute z-50 w-full mt-2 bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-[14px] shadow-[0_8px_30px_rgba(0,0,0,0.12)] p-1.5 animate-[fadeIn_0.15s_ease-out]">

                        {/* Search Bar */}
                        <div className="px-2 pb-2 pt-1">
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    placeholder="Buscar país..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-[10px] text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-300 transition-all font-medium"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <div className="max-h-[240px] overflow-y-auto custom-scrollbar overflow-x-hidden">
                            {filteredCountries.length === 0 ? (
                                <div className="py-6 text-center text-[13px] font-medium text-slate-500">
                                    No se encontraron países
                                </div>
                            ) : (
                                filteredCountries.map((country) => {
                                    const isSelected = value.includes(country.code);
                                    return (
                                        <button
                                            key={country.code}
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                toggleCountry(country.code);
                                            }}
                                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-[10px] text-left transition-colors ${isSelected ? 'bg-sky-50/80 text-sky-700' : 'hover:bg-slate-50 text-slate-700'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="text-[18px] leading-none">{country.flag}</span>
                                                <span className={`text-[13px] ${isSelected ? 'font-bold' : 'font-medium'}`}>
                                                    {country.name}
                                                </span>
                                            </div>
                                            <div className={`w-5 h-5 rounded-[6px] border flex items-center justify-center transition-colors ${isSelected ? 'bg-sky-500 border-sky-500' : 'bg-white border-slate-300'}`}>
                                                {isSelected && <Check size={12} className="text-white" strokeWidth={3} />}
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </div>
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}</style>
        </div>
    );
}
