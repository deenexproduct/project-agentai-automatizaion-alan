import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';

export interface SearchableSelectOption {
    value: string;
    label: string;
}

interface SearchableSelectProps {
    options: SearchableSelectOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string; // For overriding the trigger button styles
    containerClassName?: string; // For overriding the wrapper div styles
    disabled?: boolean;
}

export default function SearchableSelect({
    options,
    value,
    onChange,
    placeholder = 'Seleccionar...',
    className = '',
    containerClassName = '',
    disabled = false
}: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filter options based on search
    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(search.toLowerCase())
    );

    const selectedOption = options.find(opt => opt.value === value);

    const defaultClass = "w-full px-4 py-3 bg-white/60 backdrop-blur-sm border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-300 transition-all text-[14px] font-medium text-slate-700 shadow-inner cursor-pointer text-left flex items-center justify-between";

    const finalClassName = className ? className : defaultClass;

    const handleSelectOption = (val: string) => {
        onChange(val);
        setIsOpen(false);
        setSearch(''); // Reset search on select
    };

    return (
        <div className={containerClassName || "relative w-full"} ref={wrapperRef}>
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className={`${finalClassName} ${disabled ? 'opacity-70 cursor-not-allowed bg-slate-100' : ''}`}
            >
                <span className="truncate">
                    {selectedOption ? selectedOption.label : <span className="text-slate-400">{placeholder}</span>}
                </span>
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-50 w-full mt-2 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-[16px] shadow-[0_8px_30px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col">
                    <div className="p-2 border-b border-slate-100 bg-white/50">
                        <div className="relative">
                            <input
                                type="text"
                                autoFocus
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Buscar..."
                                className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-[10px] focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-300 text-[13px] text-slate-700 placeholder:text-slate-400"
                            />
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        </div>
                    </div>
                    {/* Exact height for ~5 items (approx 44px each = 220px) */}
                    <div className="max-h-[220px] overflow-y-auto p-1 custom-scrollbar">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => handleSelectOption(opt.value)}
                                    className={`w-full text-left px-4 py-2.5 text-[13px] rounded-[10px] transition-colors ${value === opt.value
                                        ? 'bg-violet-50 text-violet-700 font-bold'
                                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))
                        ) : (
                            <div className="px-4 py-3 text-[13px] text-slate-400 text-center">
                                No se encontraron resultados
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
