import React, { useState, useRef, useEffect } from 'react';
import { Plus } from 'lucide-react';

export interface CreatableAutocompleteOption {
    id: string; // The literal string value
    title: string;
}

interface Props {
    label: string;
    icon: React.ReactNode;
    placeholder: string;
    value: string;
    onChangeSearch: (val: string) => void;
    options: CreatableAutocompleteOption[];
    onSelect: (option: CreatableAutocompleteOption) => void;
    onCreate: (newTitle: string) => Promise<void>;
    colorTheme?: 'indigo' | 'emerald' | 'amber' | 'violet';
}

export default function CreatableAutocompleteInput({
    label,
    icon,
    placeholder,
    value,
    onChangeSearch,
    options,
    onSelect,
    onCreate,
    colorTheme = 'violet'
}: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Color theme classes mapping
    const themeClasses = {
        indigo: { ring: 'focus:ring-indigo-500/10 focus:border-indigo-300', hoverBg: 'hover:bg-indigo-50', textHover: 'hover:text-indigo-700' },
        emerald: { ring: 'focus:ring-emerald-500/10 focus:border-emerald-300', hoverBg: 'hover:bg-emerald-50', textHover: 'hover:text-emerald-700' },
        amber: { ring: 'focus:ring-amber-500/10 focus:border-amber-300', hoverBg: 'hover:bg-amber-50', textHover: 'hover:text-amber-700' },
        violet: { ring: 'focus:ring-violet-500/10 focus:border-violet-300', hoverBg: 'hover:bg-violet-50', textHover: 'hover:text-violet-700' },
    };
    const theme = themeClasses[colorTheme];

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

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChangeSearch(e.target.value);
        setIsOpen(true);
    };

    const handleSelectOption = (option: CreatableAutocompleteOption) => {
        onChangeSearch(option.title);
        onSelect(option);
        setIsOpen(false);
    };

    const handleCreate = async () => {
        if (!value.trim()) return;
        setIsCreating(true);
        try {
            await onCreate(value.trim());
            // Update local search text to match the new item
            onChangeSearch(value.trim());
            onSelect({ id: value.trim(), title: value.trim() });
            setIsOpen(false);
        } catch (error) {
            console.error('Error creating option', error);
        } finally {
            setIsCreating(false);
        }
    };

    // Determine if the exact query exists in the options
    const exactMatchExists = options.some(opt => opt.title.toLowerCase() === value.trim().toLowerCase());

    // Filter options based on query
    const filteredOptions = value ? options.filter(opt => opt.title.toLowerCase().includes(value.toLowerCase())) : options;
    const shouldShowCreate = value.trim().length > 0 && !exactMatchExists;

    return (
        <div className="space-y-2 relative group" ref={wrapperRef}>
            <label className="text-[13px] font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wide">
                {icon}
                {label}
            </label>
            <input
                type="text"
                value={value}
                onChange={handleChange}
                onFocus={() => setIsOpen(true)}
                placeholder={placeholder}
                className={`w-full px-4 py-3 bg-white/60 backdrop-blur-sm shadow-inner border border-slate-200 rounded-[14px] focus:outline-none focus:ring-4 transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 ${theme.ring}`}
            />

            {isOpen && (filteredOptions.length > 0 || shouldShowCreate) && (
                <div className="absolute z-[100] w-full mt-2 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-[16px] shadow-[0_8px_32px_rgba(0,0,0,0.12)] max-h-56 overflow-y-auto p-1.5 flex flex-col gap-0.5">

                    {shouldShowCreate && (
                        <button
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); handleCreate(); }}
                            disabled={isCreating}
                            className={`w-full text-left px-3 py-2.5 text-[13px] rounded-[10px] transition-all bg-slate-50 border border-dashed border-slate-300 ${theme.textHover} hover:border-solid flex items-center gap-2 group/create disabled:opacity-50`}
                        >
                            <div className="w-6 h-6 rounded-full bg-slate-200 group-hover/create:bg-white flex items-center justify-center transition-colors">
                                {isCreating ? (
                                    <div className="w-3 h-3 rounded-full border-2 border-slate-400 border-t-transparent animate-spin" />
                                ) : (
                                    <Plus size={14} className="text-slate-500" />
                                )}
                            </div>
                            <span>Crear <b>"{value}"</b></span>
                        </button>
                    )}

                    {filteredOptions.map(opt => (
                        <button
                            key={opt.id}
                            type="button"
                            onMouseDown={(e) => { e.preventDefault(); handleSelectOption(opt); }}
                            className={`w-full text-left px-4 py-2.5 text-[13px] text-slate-700 ${theme.hoverBg} ${theme.textHover} rounded-[10px] transition-colors`}
                        >
                            <div className="font-bold">{opt.title}</div>
                        </button>
                    ))}

                </div>
            )}
        </div>
    );
}
