import { Globe, ChevronDown, Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export interface CountryOption {
    code: string;
    name: string;
    flag: string;
}

export const AMERICAN_COUNTRIES: CountryOption[] = [
    { code: 'US', name: 'Estados Unidos', flag: '🇺🇸' },
    { code: 'CA', name: 'Canadá', flag: '🇨🇦' },
    { code: 'MX', name: 'México', flag: '🇲🇽' },
    { code: 'GT', name: 'Guatemala', flag: '🇬🇹' },
    { code: 'BZ', name: 'Belice', flag: '🇧🇿' },
    { code: 'HN', name: 'Honduras', flag: '🇭🇳' },
    { code: 'SV', name: 'El Salvador', flag: '🇸🇻' },
    { code: 'NI', name: 'Nicaragua', flag: '🇳🇮' },
    { code: 'CR', name: 'Costa Rica', flag: '🇨🇷' },
    { code: 'PA', name: 'Panamá', flag: '🇵🇦' },
    { code: 'CU', name: 'Cuba', flag: '🇨🇺' },
    { code: 'JM', name: 'Jamaica', flag: '🇯🇲' },
    { code: 'HT', name: 'Haití', flag: '🇭🇹' },
    { code: 'DO', name: 'República Dominicana', flag: '🇩🇴' },
    { code: 'PR', name: 'Puerto Rico', flag: '🇵🇷' },
    { code: 'TT', name: 'Trinidad y Tobago', flag: '🇹🇹' },
    { code: 'CO', name: 'Colombia', flag: '🇨🇴' },
    { code: 'VE', name: 'Venezuela', flag: '🇻🇪' },
    { code: 'GY', name: 'Guyana', flag: '🇬🇾' },
    { code: 'SR', name: 'Surinam', flag: '🇸🇷' },
    { code: 'EC', name: 'Ecuador', flag: '🇪🇨' },
    { code: 'PE', name: 'Perú', flag: '🇵🇪' },
    { code: 'BO', name: 'Bolivia', flag: '🇧🇴' },
    { code: 'BR', name: 'Brasil', flag: '🇧🇷' },
    { code: 'PY', name: 'Paraguay', flag: '🇵🇾' },
    { code: 'UY', name: 'Uruguay', flag: '🇺🇾' },
    { code: 'CL', name: 'Chile', flag: '🇨🇱' },
    { code: 'AR', name: 'Argentina', flag: '🇦🇷' },
];

interface CountrySelectProps {
    value: string;
    onChange: (code: string) => void;
    className?: string;
}

export default function CountrySelect({ value, onChange, className }: CountrySelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const selected = AMERICAN_COUNTRIES.find(c => c.code === value);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="space-y-2" ref={dropdownRef}>
            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                <Globe size={14} className="text-sky-500" />
                País
            </label>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className={`w-full flex items-center justify-between pl-4 pr-4 py-3 bg-white/60 backdrop-blur-sm border ${isOpen ? 'border-sky-300 ring-4 ring-sky-500/10' : 'border-slate-200'} rounded-[14px] transition-all shadow-inner text-left cursor-pointer ${className || ''}`}
                >
                    <div className="flex items-center gap-3">
                        <span className="text-[20px] leading-none drop-shadow-sm">{selected?.flag || '🌎'}</span>
                        <span className="text-[14px] font-medium text-slate-700">
                            {selected?.name || 'Seleccionar país...'}
                        </span>
                    </div>
                    <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                    <div className="absolute z-50 w-full mt-2 bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-[14px] shadow-[0_8px_30px_rgba(0,0,0,0.12)] max-h-[280px] overflow-y-auto custom-scrollbar overflow-x-hidden p-1.5 animate-[fadeIn_0.15s_ease-out]">
                        {AMERICAN_COUNTRIES.map((country) => (
                            <button
                                key={country.code}
                                type="button"
                                onClick={() => {
                                    onChange(country.code);
                                    setIsOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-[10px] text-left transition-colors ${value === country.code ? 'bg-sky-50/80 text-sky-700' : 'hover:bg-slate-50 text-slate-700'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-[18px] leading-none">{country.flag}</span>
                                    <span className={`text-[13px] ${value === country.code ? 'font-bold' : 'font-medium'}`}>
                                        {country.name}
                                    </span>
                                </div>
                                {value === country.code && (
                                    <Check size={14} className="text-sky-500" />
                                )}
                            </button>
                        ))}
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
