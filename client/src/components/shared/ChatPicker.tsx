import { useState, useEffect, useRef, useCallback } from 'react'
import { API_BASE } from '../../config'

const API_URL = `${API_BASE}/api/whatsapp`

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
    const [showDropdown, setShowDropdown] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Default placeholder based on filter
    const defaultPlaceholder = filter === 'groups'
        ? '🔍 Buscar grupo...'
        : filter === 'contacts'
            ? '🔍 Buscar contacto...'
            : '🔍 Buscar contacto o grupo...'

    const loadChats = useCallback(async (forceRefresh = false) => {
        setLoading(true)
        try {
            const url = forceRefresh
                ? `${API_URL}/chats?refresh=true`
                : `${API_URL}/chats`
            const res = await fetch(url)
            const data: ChatItem[] = await res.json()
            setChats(data)
        } catch {
            setChats([])
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadChats()
    }, [loadChats])

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

    // Filter chats by type and search
    const filteredChats = chats
        .filter(c => {
            if (filter === 'groups') return c.isGroup
            if (filter === 'contacts') return !c.isGroup
            return true
        })
        .filter(c =>
            c.name.toLowerCase().includes(search.toLowerCase())
        )

    const handleClear = () => {
        onSelect(null)
        setSearch('')
    }

    return (
        <div ref={dropdownRef}>
            <div className="flex justify-between items-center mb-1.5">
                <label className="block text-sm font-semibold text-slate-700">{label}</label>
                <button
                    onClick={() => { setLoading(true); loadChats(true); }}
                    className="text-xs text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1"
                    title="Recargar contactos"
                    disabled={disabled}
                >
                    🔄 Actualizar
                </button>
            </div>
            <div className="relative">
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
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition-all outline-none"
                    disabled={loading || disabled}
                />
                {selected && (
                    <button
                        onClick={handleClear}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >✕</button>
                )}

                {showDropdown && !selected && (
                    <div className="absolute z-10 w-full mt-1 bg-white rounded-xl shadow-lg border border-slate-200 max-h-60 overflow-y-auto">
                        {/* Filter tabs when showing all */}
                        {filter === 'all' && chats.length > 0 && (
                            <div className="flex border-b border-slate-100 px-2 pt-2 pb-1 gap-1">
                                {[
                                    { key: 'all', label: 'Todos', icon: '📋' },
                                    { key: 'groups', label: 'Grupos', icon: '👥' },
                                    { key: 'contacts', label: 'Contactos', icon: '👤' },
                                ].map(tab => {
                                    // We use data-attribute for inline filtering without extra state
                                    return (
                                        <button
                                            key={tab.key}
                                            className="text-xs px-2.5 py-1 rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-600 transition-colors"
                                            onClick={() => {
                                                // Quick in-place filter by scrolling to section
                                            }}
                                        >
                                            {tab.icon} {tab.label}
                                        </button>
                                    )
                                })}
                            </div>
                        )}

                        {filteredChats.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-slate-400">
                                {search ? 'No se encontraron resultados' : 'No hay chats disponibles'}
                            </div>
                        ) : (
                            filteredChats.map(chat => (
                                <button
                                    key={chat.id}
                                    onClick={() => {
                                        onSelect(chat)
                                        setSearch('')
                                        setShowDropdown(false)
                                    }}
                                    className="w-full px-4 py-2.5 text-left hover:bg-violet-50 flex items-center gap-2 transition-colors"
                                >
                                    <span className="text-lg">{chat.isGroup ? '👥' : '👤'}</span>
                                    <span className="text-slate-700">{chat.name}</span>
                                    {chat.isGroup && (
                                        <span className="ml-auto text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Grupo</span>
                                    )}
                                </button>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
