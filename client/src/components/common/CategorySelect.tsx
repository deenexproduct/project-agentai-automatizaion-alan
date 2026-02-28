import { Briefcase, ChevronDown, Check, Plus, Search } from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';

interface CategorySelectProps {
    value: string;
    onChange: (category: string) => void;
    categories: string[];
    onAddNew: (suggestedName?: string) => void;
    className?: string;
}

export default function CategorySelect({ value, onChange, categories, onAddNew, className }: CategorySelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

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

    // Focus input when opening
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        } else if (!isOpen) {
            setSearchQuery(''); // Reset search when closing
        }
    }, [isOpen]);

    const filteredCategories = useMemo(() => {
        if (!searchQuery.trim()) return categories;
        const normalizedQuery = searchQuery.toLowerCase().trim();
        return categories.filter(c => c.toLowerCase().includes(normalizedQuery));
    }, [categories, searchQuery]);

    return (
        <div className="space-y-2 relative" ref={dropdownRef}>
            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                <Briefcase size={14} className="text-indigo-500" />
                Categoría ICP
            </label>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className={`w-full flex items-center justify-between px-4 py-3 bg-white/60 backdrop-blur-sm border ${isOpen ? 'border-indigo-300 ring-4 ring-indigo-500/10' : 'border-slate-200'} rounded-[14px] transition-all shadow-inner text-left cursor-pointer ${className || ''}`}
                >
                    <span className={`text-[14px] ${value ? 'font-medium text-slate-700' : 'text-slate-400 font-medium'}`}>
                        {value || 'Seleccionar Categoría...'}
                    </span>
                    <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                    <div className="absolute z-50 w-full mt-2 bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-[14px] shadow-[0_8px_30px_rgba(0,0,0,0.12)] max-h-[320px] flex flex-col overflow-hidden animate-[fadeIn_0.15s_ease-out]">

                        {/* Search Input */}
                        <div className="p-2 border-b border-slate-100 shrink-0">
                            <div className="relative flex items-center">
                                <Search size={14} className="absolute left-3 text-indigo-400 z-10 pointer-events-none" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Buscar categoría..."
                                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-[10px] focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all text-[13px] font-medium text-slate-700 placeholder:text-slate-400"
                                />
                            </div>
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-1.5">
                            {filteredCategories.length > 0 ? (
                                filteredCategories.map((category) => (
                                    <button
                                        key={category}
                                        type="button"
                                        onClick={() => {
                                            onChange(category);
                                            setIsOpen(false);
                                        }}
                                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-[10px] text-left transition-colors ${value === category ? 'bg-indigo-50/80 text-indigo-700' : 'hover:bg-slate-50 text-slate-700'}`}
                                    >
                                        <span className={`text-[13px] ${value === category ? 'font-bold' : 'font-medium'}`}>
                                            {category}
                                        </span>
                                        {value === category && (
                                            <Check size={14} className="text-indigo-500" />
                                        )}
                                    </button>
                                ))
                            ) : (
                                <div className="px-3 py-4 text-center">
                                    <p className="text-[13px] text-slate-500 font-medium mb-1">No se encontró "{searchQuery}"</p>
                                    <p className="text-[12px] text-slate-400">Podés crearla a continuación</p>
                                </div>
                            )}
                        </div>

                        {/* Footer / Create */}
                        <div className="p-1.5 shrink-0 bg-slate-50/50 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => {
                                    onAddNew(searchQuery.trim() || undefined);
                                    setIsOpen(false);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-[10px] text-left transition-colors hover:bg-indigo-50 text-indigo-600 font-bold"
                            >
                                <Plus size={14} className="text-indigo-500" />
                                <span className="text-[13px]">
                                    {searchQuery.trim() ? `Crear "${searchQuery.trim()}"...` : 'Crear nueva categoría...'}
                                </span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
            {/* Same scrollbar styles as CountrySelect */}
            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}</style>
        </div>
    );
}
