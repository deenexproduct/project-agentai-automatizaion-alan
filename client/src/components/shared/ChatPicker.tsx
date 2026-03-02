import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../../lib/axios'

const API_URL = '/whatsapp'

export interface ChatItem {
    id: string
    name: string
    isGroup: boolean
}

interface ChatPickerProps {
    /** Currently selected chat */
    selected: ChatItem | null
    /** Callback when user selects a chat */
    onSelect: (chat: ChatItem | null) => void
    /** Filter: 'all' | 'groups' | 'contacts' */
    filter?: 'all' | 'groups' | 'contacts'
    /** Label shown above the picker */
    label?: string
    /** Placeholder text */
    placeholder?: string
    /** Whether the picker is disabled */
    disabled?: boolean
}

export default function ChatPicker({
    selected,
    onSelect,
    filter = 'all',
    label = 'Contacto o Grupo',
    placeholder,
    disabled = false,
}: ChatPickerProps) {
    const [chats, setChats] = useState<ChatItem[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [showDropdown, setShowDropdown] = useState(false)
    const [localFilter, setLocalFilter] = useState<'all' | 'groups' | 'contacts'>(filter)
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Default placeholder based on filter
    const defaultPlaceholder = filter === 'groups'
        ? '🔍 Buscar grupo...'
        : filter === 'contacts'
            ? '🔍 Buscar contacto...'
            : '🔍 Buscar contacto o grupo...'

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(search)
        }, 300)
        return () => clearTimeout(timer)
    }, [search])

    const loadChats = useCallback(async (searchTerm: string, forceRefresh = false) => {
        setLoading(true)
        try {
            const params = new URLSearchParams()
            if (forceRefresh) params.append('refresh', 'true')
            if (searchTerm) {
                params.append('search', searchTerm)
                params.append('limit', '150')
            } else {
                params.append('limit', '100')
            }

            const res = await api.get(`${API_URL}/chats?${params.toString()}`)
            setChats(res.data)
        } catch {
            setChats([])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadChats(debouncedSearch)
    }, [debouncedSearch, loadChats])

    // Close dropdown on outside click
    useEffect(() => {
        const handle = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false)
            }
        }
        document.addEventListener('mousedown', handle)
        return () => document.removeEventListener('mousedown', handle)
    }, [])

    // Filter chats by type (groups/contacts) locally using localFilter, but the text search is remote
    const activeFilter = filter !== 'all' ? filter : localFilter
    const filteredChats = chats.filter(c => {
        if (activeFilter === 'groups') return c.isGroup
        if (activeFilter === 'contacts') return !c.isGroup
        return true
    })

    const handleClear = () => {
        onSelect(null)
        setSearch('')
        setDebouncedSearch('')
    }

    return (
        <div ref={dropdownRef} className="relative z-50">
            <div className="flex justify-between items-center mb-2">
                <label className="block text-[13px] font-bold text-slate-700 uppercase tracking-wide">{label}</label>
                <button
                    onClick={() => { setLoading(true); loadChats(debouncedSearch, true); }}
                    className="text-[12px] font-bold text-violet-500 hover:text-violet-700 flex items-center gap-1.5 transition-colors bg-violet-50/50 px-2 py-0.5 rounded-full"
                    title="Recargar contactos"
                    disabled={disabled}
                >
                    🔄 <span className="hidden sm:inline">Actualizar</span>
                </button>
            </div>

            <div className="relative group/picker">
                <input
                    type="text"
                    placeholder={loading ? 'Cargando...' : (placeholder || defaultPlaceholder)}
                    value={selected ? selected.name : search}
                    onChange={(e) => {
                        setSearch(e.target.value)
                        onSelect(null)
                        setShowDropdown(true)
                    }}
                    onFocus={() => setShowDropdown(true)}
                    className="w-full rounded-[16px] p-4 text-[14px] transition-all outline-none text-slate-700 placeholder-slate-400"
                    style={{
                        background: 'rgba(255, 255, 255, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.8)',
                        boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.02)',
                    }}
                    disabled={loading || disabled}
                />
                <div className="absolute inset-0 rounded-[16px] pointer-events-none border-2 border-transparent group-focus-within/picker:border-violet-400 transition-colors" />

                {selected && (
                    <button
                        onClick={handleClear}
                        className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-red-500 flex items-center justify-center transition-colors"
                    >✕</button>
                )}

                {showDropdown && !selected && (
                    <div className="absolute z-[100] w-full mt-2 rounded-[20px] overflow-hidden animate-[fadeInSlideDown_0.2s_ease-out]"
                        style={{
                            background: 'rgba(255, 255, 255, 0.85)',
                            backdropFilter: 'blur(24px)',
                            WebkitBackdropFilter: 'blur(24px)',
                            border: '1px solid rgba(255, 255, 255, 0.6)',
                            boxShadow: '0 12px 40px rgba(30, 27, 75, 0.08)',
                        }}
                    >
                        {/* Filter tabs when showing all */}
                        {filter === 'all' && chats.length > 0 && (
                            <div className="flex px-2 pt-2 pb-2 gap-1 bg-slate-50/50 backdrop-blur-md border-b border-slate-200/50">
                                {[
                                    { key: 'all' as const, label: 'Todos', icon: '📋' },
                                    { key: 'groups' as const, label: 'Grupos', icon: '👥' },
                                    { key: 'contacts' as const, label: 'Contactos', icon: '👤' },
                                ].map(tab => (
                                    <button
                                        key={tab.key}
                                        onClick={() => setLocalFilter(tab.key)}
                                        className={`flex-1 text-[12px] font-bold px-3 py-1.5 rounded-[12px] transition-all ${localFilter === tab.key
                                                ? 'bg-white text-violet-600 shadow-sm'
                                                : 'text-slate-500 hover:bg-white hover:text-violet-600 hover:shadow-sm'
                                            }`}
                                    >
                                        <span className="mr-1">{tab.icon}</span> {tab.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="max-h-64 overflow-y-auto custom-chat-scroll p-1">
                            {filteredChats.length === 0 ? (
                                <div className="px-4 py-8 text-center">
                                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2 text-xl">🔍</div>
                                    <p className="text-[13px] font-medium text-slate-500">
                                        {search ? 'No se encontraron resultados' : 'No hay contactos o grupos disponibles'}
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {filteredChats.slice(0, 100).map(chat => (
                                        <button
                                            key={chat.id}
                                            onClick={() => {
                                                onSelect(chat)
                                                setSearch('')
                                                setShowDropdown(false)
                                            }}
                                            className="w-full px-4 py-3 text-left hover:bg-violet-50/80 rounded-[12px] flex items-center gap-3 transition-colors group/item"
                                        >
                                            <div className="w-10 h-10 rounded-[12px] bg-slate-100 group-hover/item:bg-violet-100 flex items-center justify-center text-lg transition-colors">
                                                {chat.isGroup ? '👥' : '👤'}
                                            </div>
                                            <span className="text-[14px] font-bold text-slate-700 group-hover/item:text-violet-700 transition-colors flex-1 truncate">
                                                {chat.name}
                                            </span>
                                            {chat.isGroup && (
                                                <span className="text-[10px] uppercase tracking-wider font-bold bg-slate-200/50 text-slate-500 px-2 py-1 rounded-[8px]">
                                                    Grupo
                                                </span>
                                            )}
                                        </button>
                                    ))}
                                    {filteredChats.length > 100 && (
                                        <div className="px-4 py-3 text-center text-[12px] font-medium text-slate-400 bg-slate-50/50 mt-1 rounded-[12px]">
                                            + {filteredChats.length - 100} más. Usá el buscador para encontrarlos.
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                .custom-chat-scroll::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-chat-scroll::-webkit-scrollbar-track {
                    background: transparent;
                    margin: 4px;
                }
                .custom-chat-scroll::-webkit-scrollbar-thumb {
                    background: rgba(139, 92, 246, 0.2);
                    border-radius: 10px;
                }
                .custom-chat-scroll:hover::-webkit-scrollbar-thumb {
                    background: rgba(139, 92, 246, 0.4);
                }
            `}</style>
        </div>
    )
}
