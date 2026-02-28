import { Briefcase, ChevronDown, Check, Plus, Search, X } from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';

interface PositionSelectProps {
    value: string[];
    onChange: (positions: string[]) => void;
    positions: string[];
    onAddNew: (suggestedName?: string) => void;
    className?: string;
}

export default function PositionSelect({ value, onChange, positions, onAddNew, className }: PositionSelectProps) {
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
            setSearchQuery('');
        }
    }, [isOpen]);

    const filteredPositions = useMemo(() => {
        if (!searchQuery.trim()) return positions;
        const normalizedQuery = searchQuery.toLowerCase().trim();
        return positions.filter(p => p.toLowerCase().includes(normalizedQuery));
    }, [positions, searchQuery]);

    const handleToggle = (pos: string) => {
        if (value.includes(pos)) {
            onChange(value.filter(p => p !== pos));
        } else {
            onChange([...value, pos]);
        }
    };

    const handleRemove = (pos: string) => {
        onChange(value.filter(p => p !== pos));
    };

    return (
        <div className="space-y-2 relative" ref={dropdownRef}>
            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                <Briefcase size={14} className="text-amber-500" />
                Cargo
            </label>

            {/* Selected pills */}
            {value.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {value.map(pos => (
                        <span
                            key={pos}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 border border-amber-200/60 text-amber-700 rounded-[8px] text-[12px] font-bold shadow-sm"
                        >
                            {pos}
                            <button
                                type="button"
                                onClick={() => handleRemove(pos)}
                                className="ml-0.5 text-amber-400 hover:text-red-500 transition-colors"
                            >
                                <X size={12} />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            <div className="relative">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className={`w-full flex items-center justify-between px-4 py-3 bg-white/60 backdrop-blur-sm border ${isOpen ? 'border-amber-300 ring-4 ring-amber-500/10' : 'border-slate-200'} rounded-[14px] transition-all shadow-inner text-left cursor-pointer ${className || ''}`}
                >
                    <span className="text-[14px] text-slate-400 font-medium">
                        {value.length === 0 ? 'Seleccionar cargos...' : 'Agregar otro cargo...'}
                    </span>
                    <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                    <div className="absolute z-50 w-full mt-2 bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-[14px] shadow-[0_8px_30px_rgba(0,0,0,0.12)] max-h-[320px] flex flex-col overflow-hidden animate-[fadeIn_0.15s_ease-out]">

                        {/* Search Input */}
                        <div className="p-2 border-b border-slate-100 shrink-0">
                            <div className="relative flex items-center">
                                <Search size={14} className="absolute left-3 text-amber-400 z-10 pointer-events-none" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Buscar cargo..."
                                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-[10px] focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-300 transition-all text-[13px] font-medium text-slate-700 placeholder:text-slate-400"
                                />
                            </div>
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-1.5">
                            {filteredPositions.length > 0 ? (
                                filteredPositions.map((pos) => {
                                    const isSelected = value.includes(pos);
                                    return (
                                        <button
                                            key={pos}
                                            type="button"
                                            onClick={() => handleToggle(pos)}
                                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-[10px] text-left transition-colors ${isSelected ? 'bg-amber-50/80 text-amber-700' : 'hover:bg-slate-50 text-slate-700'}`}
                                        >
                                            <span className={`text-[13px] ${isSelected ? 'font-bold' : 'font-medium'}`}>
                                                {pos}
                                            </span>
                                            {isSelected && (
                                                <Check size={14} className="text-amber-500" />
                                            )}
                                        </button>
                                    );
                                })
                            ) : (
                                <div className="px-3 py-4 text-center">
                                    <p className="text-[13px] text-slate-500 font-medium mb-1">No se encontró "{searchQuery}"</p>
                                    <p className="text-[12px] text-slate-400">Podés crearlo a continuación</p>
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
                                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-[10px] text-left transition-colors hover:bg-amber-50 text-amber-600 font-bold"
                            >
                                <Plus size={14} className="text-amber-500" />
                                <span className="text-[13px]">
                                    {searchQuery.trim() ? `Crear "${searchQuery.trim()}"...` : 'Crear nuevo cargo...'}
                                </span>
                            </button>
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
