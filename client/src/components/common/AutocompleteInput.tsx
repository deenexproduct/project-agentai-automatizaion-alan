import React, { useState, useRef, useEffect } from 'react';

export interface AutocompleteOption {
    _id: string;
    title: string;
    subtitle?: string;
    data: any;
}

interface Props {
    label: string;
    icon: React.ReactNode;
    placeholder: string;
    value: string;
    onChangeSearch: (val: string) => void;
    options: AutocompleteOption[];
    onSelect: (option: AutocompleteOption) => void;
    colorTheme?: 'indigo' | 'emerald' | 'amber' | 'fuchsia';
    disabled?: boolean;
}

export default function AutocompleteInput({
    label,
    icon,
    placeholder,
    value,
    onChangeSearch,
    options,
    onSelect,
    colorTheme = 'indigo',
    disabled = false
}: Props) {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Color theme classes mapping
    const themeClasses = {
        indigo: {
            focusRing: 'focus:ring-indigo-500/10',
            focusBorder: 'focus:border-indigo-300',
            hoverBg: 'hover:bg-indigo-50',
            hoverText: 'hover:text-indigo-700'
        },
        emerald: {
            focusRing: 'focus:ring-emerald-500/10',
            focusBorder: 'focus:border-emerald-300',
            hoverBg: 'hover:bg-emerald-50',
            hoverText: 'hover:text-emerald-700'
        },
        amber: {
            focusRing: 'focus:ring-amber-500/10',
            focusBorder: 'focus:border-amber-300',
            hoverBg: 'hover:bg-amber-50',
            hoverText: 'hover:text-amber-700'
        },
        fuchsia: {
            focusRing: 'focus:ring-fuchsia-500/10',
            focusBorder: 'focus:border-fuchsia-300',
            hoverBg: 'hover:bg-fuchsia-50',
            hoverText: 'hover:text-fuchsia-700'
        }
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

    const handleFocus = () => {
        setIsOpen(true);
    };

    const handleSelectOption = (option: AutocompleteOption) => {
        onSelect(option);
        setIsOpen(false);
    };

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
                onFocus={handleFocus}
                placeholder={placeholder}
                disabled={disabled}
                className={`w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-[14px] focus:outline-none transition-all text-[14px] font-medium text-slate-700 placeholder:text-slate-400 ${disabled ? 'opacity-70 bg-slate-100 cursor-not-allowed text-slate-500 font-semibold' : `focus:ring-4 ${theme.focusRing} ${theme.focusBorder}`}`}
            />
            {isOpen && options.length > 0 && (
                <div className="absolute z-10 w-full mt-2 bg-white/90 backdrop-blur-xl border border-slate-200 rounded-[16px] shadow-[0_8px_30px_rgba(0,0,0,0.12)] overflow-hidden max-h-48 overflow-y-auto p-1">
                    {options.slice(0, 5).map(opt => (
                        <button
                            key={opt._id}
                            type="button"
                            onMouseDown={(e) => {
                                // use onMouseDown instead of onClick to prevent onBlur from firing before selection
                                e.preventDefault();
                                handleSelectOption(opt);
                            }}
                            className={`w-full text-left px-4 py-2.5 text-[13px] text-slate-700 ${theme.hoverBg} ${theme.hoverText} rounded-[10px] transition-colors flex flex-col gap-0.5`}
                        >
                            <div className="font-bold">{opt.title}</div>
                            {opt.subtitle && (
                                <div className="text-[11px] font-medium text-slate-500 font-mono">{opt.subtitle}</div>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
