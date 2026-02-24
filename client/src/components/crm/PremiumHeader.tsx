import { Search, Filter, Plus } from 'lucide-react';
import React from 'react';

interface PremiumHeaderProps {
    search: string;
    onSearchChange: (value: string) => void;
    searchPlaceholder?: string;
    onAdd: () => void;
    addLabel: string;
    onFilter?: () => void;
    showFilters?: boolean;
    children?: React.ReactNode;
    containerClassName?: string;
}

export default function PremiumHeader({
    search,
    onSearchChange,
    searchPlaceholder = "Buscar...",
    onAdd,
    addLabel,
    onFilter,
    showFilters = false,
    children,
    containerClassName
}: PremiumHeaderProps) {
    return (
        <div className={`flex flex-col gap-3 bg-white/80 backdrop-blur-2xl shrink-0 relative z-10 border-b border-white/50 shadow-[0_4px_20px_rgba(30,27,75,0.03)] ${containerClassName || 'px-6 py-4'}`}>
            {/* Row 1: Search + Add (always same line) */}
            <div className="flex items-center gap-2 md:gap-3 w-full">
                {/* Search Bar */}
                <div className="relative group/search flex-1 min-w-0">
                    <div className="absolute inset-x-4 -bottom-px h-px bg-gradient-to-r from-transparent via-violet-400 to-transparent opacity-0 group-focus-within/search:opacity-100 transition-opacity duration-500" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder={searchPlaceholder}
                        className="w-full pl-11 pr-12 py-2.5 bg-slate-50/50 hover:bg-white focus:bg-white border border-slate-200/60 focus:border-violet-300 rounded-[14px] text-[13.5px] font-medium text-slate-700 placeholder:text-slate-400 focus:ring-[4px] focus:ring-violet-500/10 transition-all outline-none shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] max-h-[42px]"
                    />
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/search:text-violet-500 transition-colors duration-300" size={16} />

                    {search && (
                        <button
                            onClick={() => onSearchChange('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-all scale-95 hover:scale-100 active:scale-90"
                        >
                            <span className="text-xs font-bold leading-none mb-[2px]">×</span>
                        </button>
                    )}
                </div>

                {/* Filter button (inline on mobile too) */}
                {onFilter && (
                    <button
                        onClick={onFilter}
                        className={`group relative flex items-center justify-center h-[42px] w-[42px] shrink-0 rounded-[14px] transition-all duration-300 border overflow-hidden ${showFilters ? 'bg-violet-50 border-violet-200 text-violet-600 shadow-[inset_0_2px_4px_rgba(139,92,246,0.1)]' : 'bg-white border-slate-200/60 text-slate-500 hover:text-violet-600 shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-[0_8px_20px_rgba(139,92,246,0.08)] hover:-translate-y-0.5 hover:border-violet-200'}`}
                        title="Filtros"
                    >
                        <Filter size={18} className="relative z-10 transition-transform duration-300 group-hover:scale-110 group-active:scale-95" />
                    </button>
                )}

                {/* Add button: icon-only on mobile, full on desktop */}
                <button
                    onClick={onAdd}
                    className="group relative flex items-center justify-center gap-2.5 h-[42px] w-[42px] md:w-auto md:px-5 shrink-0 bg-[linear-gradient(110deg,#7c3aed,45%,#c026d3,55%,#7c3aed)] bg-[length:250%_100%] hover:bg-[right_center] text-white font-bold text-[13.5px] tracking-wide rounded-[14px] transition-all duration-500 shadow-[0_6px_16px_rgba(139,92,246,0.3)] hover:shadow-[0_8px_24px_rgba(139,92,246,0.5)] hover:-translate-y-0.5 border border-white/20 overflow-hidden active:scale-[0.98] active:translate-y-0"
                >
                    <div className="relative z-10 flex items-center justify-center w-6 h-6 rounded-full bg-white/20 backdrop-blur-md md:-ml-1 shadow-[inset_0_1px_2px_rgba(255,255,255,0.3)]">
                        <Plus size={14} strokeWidth={3} className="text-white drop-shadow-sm" />
                    </div>
                    <span className="relative z-10 drop-shadow-sm hidden md:inline">{addLabel}</span>
                </button>
            </div>

            {/* Row 2: Custom Content (e.g. Metrics) - only if children exist */}
            {children && (
                <div className="flex items-center gap-2 shrink-0">
                    {children}
                </div>
            )}
        </div>
    );
}
