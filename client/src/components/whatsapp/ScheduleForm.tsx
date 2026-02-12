import { useState, useEffect, useRef } from 'react'
import AudioRecorder from './AudioRecorder'

import { API_BASE } from '../../config';

const API_URL = `${API_BASE}/api/whatsapp`;

interface Chat {
    id: string
    name: string
    isGroup: boolean
}

const RECURRENCE_OPTIONS = [
    { label: 'Sin repetición', value: '' },
    { label: 'Todos los días', value: 'daily', cron: '0 9 * * *' },
    { label: 'Todos los lunes', value: 'mon', cron: '0 9 * * 1' },
    { label: 'Todos los martes', value: 'tue', cron: '0 9 * * 2' },
    { label: 'Todos los miércoles', value: 'wed', cron: '0 9 * * 3' },
    { label: 'Todos los jueves', value: 'thu', cron: '0 9 * * 4' },
    { label: 'Todos los viernes', value: 'fri', cron: '0 9 * * 5' },
    { label: 'Todos los sábados', value: 'sat', cron: '0 9 * * 6' },
    { label: 'Todos los domingos', value: 'sun', cron: '0 9 * * 0' },
]

export default function ScheduleForm() {
    const [chats, setChats] = useState<Chat[]>([])
    const [loadingChats, setLoadingChats] = useState(true)
    const [searchChat, setSearchChat] = useState('')
    const [selectedChat, setSelectedChat] = useState<Chat | null>(null)
    const [showChatDropdown, setShowChatDropdown] = useState(false)
    const [messageType, setMessageType] = useState<'text' | 'audio' | 'file'>('text')
    const [audioMode, setAudioMode] = useState<'record' | 'upload'>('record')
    const [textContent, setTextContent] = useState('')
    const [file, setFile] = useState<File | null>(null)
    // Helper to get local date (YYYY-MM-DD)
    const getTodayDate = () => {
        const d = new Date()
        const year = d.getFullYear()
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
    }

    // Helper to get current time + 2 minutes (HH:mm)
    const getFutureTime = () => {
        const d = new Date()
        d.setMinutes(d.getMinutes() + 2)
        const hours = String(d.getHours()).padStart(2, '0')
        const minutes = String(d.getMinutes()).padStart(2, '0')
        return `${hours}:${minutes}`
    }

    const [scheduledDate, setScheduledDate] = useState(getTodayDate())
    const [scheduledTime, setScheduledTime] = useState(getFutureTime())
    const [recurrence, setRecurrence] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const dropdownRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        loadChats()
    }, [])

    // Close dropdown on outside click
    useEffect(() => {
        const handle = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowChatDropdown(false)
            }
        }
        document.addEventListener('mousedown', handle)
        return () => document.removeEventListener('mousedown', handle)
    }, [])

    const loadChats = async () => {
        try {
            const res = await fetch(`${API_URL}/chats`)
            const data = await res.json()
            setChats(data)
        } catch {
            setError('Error al cargar contactos')
        } finally {
            setLoadingChats(false)
        }
    }

    const filteredChats = chats.filter(c =>
        c.name.toLowerCase().includes(searchChat.toLowerCase())
    )

    const handleSubmit = async () => {
        if (!selectedChat) {
            setError('Seleccioná un contacto o grupo')
            return
        }
        if (messageType === 'text' && !textContent.trim()) {
            setError('Escribí un mensaje')
            return
        }
        if ((messageType === 'audio' || messageType === 'file') && !file) {
            setError('Seleccioná un archivo')
            return
        }
        if (!scheduledDate || !scheduledTime) {
            setError('Seleccioná fecha y hora')
            return
        }

        setSubmitting(true)
        setError(null)

        try {
            const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`)
            const recurrenceOption = RECURRENCE_OPTIONS.find(r => r.value === recurrence)

            const formData = new FormData()
            formData.append('chatId', selectedChat.id)
            formData.append('chatName', selectedChat.name)
            formData.append('isGroup', String(selectedChat.isGroup))
            formData.append('messageType', messageType)
            formData.append('scheduledAt', scheduledAt.toISOString())

            if (messageType === 'text') {
                formData.append('textContent', textContent)
            }
            if (file) {
                formData.append('file', file)
                if (messageType === 'text') {
                    formData.append('textContent', textContent) // caption for file
                }
            }
            if (recurrence && recurrenceOption?.cron) {
                formData.append('isRecurring', 'true')
                // Replace the hour/minute in the cron with the user's selected time
                const [hour, minute] = scheduledTime.split(':')
                const cronParts = recurrenceOption.cron.split(' ')
                cronParts[0] = minute
                cronParts[1] = hour
                formData.append('cronPattern', cronParts.join(' '))
                formData.append('recurringLabel', recurrenceOption.label)
            }

            const res = await fetch(`${API_URL}/schedule`, {
                method: 'POST',
                body: formData,
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Error al programar')
            }

            setSuccess(true)
            setTextContent('')
            setFile(null)
            setAudioMode('record')
            setScheduledDate(getTodayDate())
            setScheduledTime(getFutureTime())
            setRecurrence('')
            setSelectedChat(null)
            setSearchChat('')

            setTimeout(() => setSuccess(false), 3000)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="space-y-5">
            {/* Success Banner */}
            {success && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 flex items-center gap-2 animate-in">
                    <span className="text-xl">✅</span>
                    <span className="font-medium">¡Mensaje programado exitosamente!</span>
                </div>
            )}

            {/* Error Banner */}
            {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 flex items-center gap-2">
                    <span className="text-xl">⚠️</span>
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">✕</button>
                </div>
            )}

            {/* Contact/Group Selector */}
            <div ref={dropdownRef}>
                <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-sm font-medium text-slate-700">Contacto o Grupo</label>
                    <button
                        onClick={() => { setLoadingChats(true); loadChats(); }}
                        className="text-xs text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1"
                        title="Recargar contactos"
                    >
                        🔄 Actualizar
                    </button>
                </div>
                <div className="relative">
                    <input
                        type="text"
                        placeholder={loadingChats ? 'Cargando contactos...' : '🔍 Buscar contacto o grupo...'}
                        value={selectedChat ? selectedChat.name : searchChat}
                        onChange={(e) => {
                            setSearchChat(e.target.value)
                            setSelectedChat(null)
                            setShowChatDropdown(true)
                        }}
                        onFocus={() => setShowChatDropdown(true)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition-all outline-none"
                        disabled={loadingChats}
                    />
                    {selectedChat && (
                        <button
                            onClick={() => { setSelectedChat(null); setSearchChat(''); }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >✕</button>
                    )}

                    {showChatDropdown && !selectedChat && (
                        <div className="absolute z-10 w-full mt-1 bg-white rounded-xl shadow-lg border border-slate-200 max-h-60 overflow-y-auto">
                            {filteredChats.length === 0 ? (
                                <div className="px-4 py-3 text-sm text-slate-400">
                                    {searchChat ? 'No se encontraron resultados' : 'No hay chats disponibles'}
                                </div>
                            ) : (
                                filteredChats.map(chat => (
                                    <button
                                        key={chat.id}
                                        onClick={() => {
                                            setSelectedChat(chat)
                                            setSearchChat('')
                                            setShowChatDropdown(false)
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

            {/* Message Type */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Tipo de mensaje</label>
                <div className="flex gap-2">
                    {[
                        { type: 'text' as const, icon: '💬', label: 'Texto' },
                        { type: 'audio' as const, icon: '🎵', label: 'Audio' },
                        { type: 'file' as const, icon: '📎', label: 'Archivo' },
                    ].map(({ type, icon, label }) => (
                        <button
                            key={type}
                            onClick={() => { setMessageType(type); setFile(null); }}
                            className={`flex-1 py-2.5 px-4 rounded-xl border-2 transition-all font-medium text-sm ${messageType === type
                                ? 'border-violet-500 bg-violet-50 text-violet-700'
                                : 'border-slate-200 text-slate-500 hover:border-slate-300'
                                }`}
                        >
                            {icon} {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Text Content */}
            {messageType === 'text' && (
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Mensaje</label>
                    <textarea
                        value={textContent}
                        onChange={(e) => setTextContent(e.target.value)}
                        placeholder="Escribí tu mensaje..."
                        rows={4}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition-all outline-none resize-none"
                    />
                </div>
            )}

            {/* Audio Section */}
            {messageType === 'audio' && (
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Audio</label>

                    {/* Record / Upload toggle */}
                    {!file && (
                        <div className="flex gap-2 mb-3">
                            <button
                                onClick={() => setAudioMode('record')}
                                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${audioMode === 'record'
                                    ? 'bg-red-500 text-white shadow-md shadow-red-500/20'
                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                    }`}
                            >
                                🎙️ Grabar
                            </button>
                            <button
                                onClick={() => setAudioMode('upload')}
                                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${audioMode === 'upload'
                                    ? 'bg-violet-500 text-white shadow-md shadow-violet-500/20'
                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                    }`}
                            >
                                📁 Subir archivo
                            </button>
                        </div>
                    )}

                    {file ? (
                        <div className="flex items-center gap-3 p-3 bg-violet-50 rounded-xl border border-violet-200">
                            <span className="text-2xl">🎵</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                                <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                            <button onClick={() => setFile(null)} className="text-slate-400 hover:text-red-500">🗑️</button>
                        </div>
                    ) : audioMode === 'record' ? (
                        <AudioRecorder onAudioReady={(f) => setFile(f)} />
                    ) : (
                        <>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="audio/*"
                                onChange={(e) => setFile(e.target.files?.[0] || null)}
                                className="hidden"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full py-8 border-2 border-dashed border-slate-300 rounded-xl hover:border-violet-400 hover:bg-violet-50 transition-all"
                            >
                                <div className="text-center">
                                    <span className="text-3xl block mb-2">🎵</span>
                                    <p className="text-sm text-slate-500">Click para seleccionar archivo de audio</p>
                                </div>
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* File Upload (non-audio) */}
            {messageType === 'file' && (
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Archivo adjunto</label>
                    <input
                        ref={fileInputRef}
                        type="file"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        className="hidden"
                    />
                    {file ? (
                        <div className="flex items-center gap-3 p-3 bg-violet-50 rounded-xl border border-violet-200">
                            <span className="text-2xl">📄</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                                <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                            <button onClick={() => setFile(null)} className="text-slate-400 hover:text-red-500">🗑️</button>
                        </div>
                    ) : (
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full py-8 border-2 border-dashed border-slate-300 rounded-xl hover:border-violet-400 hover:bg-violet-50 transition-all"
                        >
                            <div className="text-center">
                                <span className="text-3xl block mb-2">📎</span>
                                <p className="text-sm text-slate-500">Click para seleccionar archivo</p>
                            </div>
                        </button>
                    )}

                    {/* Caption for file */}
                    {file && (
                        <div className="mt-3">
                            <label className="block text-sm font-medium text-slate-700 mb-1.5">Caption (opcional)</label>
                            <input
                                type="text"
                                value={textContent}
                                onChange={(e) => setTextContent(e.target.value)}
                                placeholder="Agregar un texto al archivo..."
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition-all outline-none"
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">📅 Fecha</label>
                    <input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => setScheduledDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition-all outline-none"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">🕐 Hora</label>
                    <input
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => setScheduledTime(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition-all outline-none"
                    />
                </div>
            </div>

            {/* Recurrence */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">🔁 Repetición</label>
                <select
                    value={recurrence}
                    onChange={(e) => setRecurrence(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition-all outline-none bg-white"
                >
                    {RECURRENCE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            </div>

            {/* Submit */}
            <button
                onClick={handleSubmit}
                disabled={submitting}
                className={`w-full py-3.5 rounded-xl font-semibold text-white transition-all ${submitting
                    ? 'bg-violet-400 cursor-not-allowed'
                    : 'bg-violet-600 hover:bg-violet-700 shadow-lg shadow-violet-600/20 hover:shadow-violet-600/30'
                    }`}
            >
                {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                        <span className="animate-spin">⏳</span> Programando...
                    </span>
                ) : (
                    '📅 Programar Mensaje'
                )}
            </button>
        </div>
    )
}
