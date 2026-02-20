import { useState, useEffect } from 'react'

import api from '../../lib/axios';

const API_URL = '/whatsapp';

interface ScheduledMsg {
    _id: string
    chatName: string
    isGroup: boolean
    messageType: string
    textContent?: string
    fileName?: string
    scheduledAt: string
    isRecurring: boolean
    recurringLabel?: string
    status: string
    error?: string
    retryCount?: number
}

export default function ScheduledList() {
    const [messages, setMessages] = useState<ScheduledMsg[]>([])
    const [loading, setLoading] = useState(true)
    const [retrying, setRetrying] = useState<string | null>(null)

    useEffect(() => {
        loadScheduled()
        const interval = setInterval(loadScheduled, 10000)
        return () => clearInterval(interval)
    }, [])

    const loadScheduled = async () => {
        try {
            const res = await api.get(`${API_URL}/scheduled`)
            setMessages(res.data)
        } catch {
            console.error('Error loading scheduled messages')
        } finally {
            setLoading(false)
        }
    }

    const cancelMessage = async (id: string) => {
        try {
            const res = await api.delete(`${API_URL}/scheduled/${id}`)
            if (res.data.success) {
                setMessages(prev => prev.filter(m => m._id !== id))
            }
        } catch {
            console.error('Error cancelling message')
        }
    }

    const retryMessage = async (id: string) => {
        setRetrying(id)
        try {
            const res = await api.post(`${API_URL}/retry/${id}`)
            if (res.data.success) {
                // Remove from list (it's now sent)
                setMessages(prev => prev.filter(m => m._id !== id))
            } else {
                // Refresh to show updated error
                await loadScheduled()
            }
        } catch {
            console.error('Error retrying message')
        } finally {
            setRetrying(null)
        }
    }

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr)
        const now = new Date()
        const tomorrow = new Date(now)
        tomorrow.setDate(tomorrow.getDate() + 1)

        const timeStr = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })

        if (d.toDateString() === now.toDateString()) return `Hoy ${timeStr}`
        if (d.toDateString() === tomorrow.toDateString()) return `Mañana ${timeStr}`
        return `${d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} ${timeStr}`
    }

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'text': return '💬'
            case 'audio': return '🎵'
            case 'file': return '📎'
            default: return '📨'
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <div className="animate-spin w-8 h-8 border-3 border-violet-600 border-t-transparent rounded-full" style={{ borderWidth: '3px' }}></div>
            </div>
        )
    }

    if (messages.length === 0) {
        return (
            <div className="text-center py-16">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">📭</span>
                </div>
                <p className="text-slate-500 font-medium">No hay mensajes pendientes</p>
                <p className="text-sm text-slate-400 mt-1">Programá un mensaje desde la pestaña "Programar"</p>
            </div>
        )
    }

    const pendingCount = messages.filter(m => m.status === 'pending').length
    const failedCount = messages.filter(m => m.status === 'failed').length

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                    {pendingCount > 0 && (
                        <span className="text-sm text-slate-500">
                            {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
                        </span>
                    )}
                    {failedCount > 0 && (
                        <span className="text-sm text-red-500 font-medium">
                            ⚠️ {failedCount} fallido{failedCount !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>
            </div>

            {messages.map(msg => {
                const isFailed = msg.status === 'failed'
                const isRetrying = retrying === msg._id

                return (
                    <div
                        key={msg._id}
                        className={`group bg-white rounded-xl shadow-sm border overflow-hidden transition-all hover:shadow-md ${isFailed
                            ? 'border-red-200 bg-red-50/30'
                            : 'border-slate-200'
                            }`}
                    >
                        <div className="p-4">
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isFailed ? 'bg-red-100' : 'bg-violet-100'
                                        }`}>
                                        <span className="text-lg">{msg.isGroup ? '👥' : '👤'}</span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium text-slate-800 truncate">{msg.chatName}</p>
                                            <span className="text-sm">{getTypeIcon(msg.messageType)}</span>
                                            {isFailed && (
                                                <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">
                                                    Fallido
                                                </span>
                                            )}
                                        </div>
                                        <p className={`text-sm font-medium ${isFailed ? 'text-red-500' : 'text-violet-600'}`}>
                                            {formatDate(msg.scheduledAt)}
                                        </p>
                                    </div>
                                </div>

                                {!isFailed && (
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={() => retryMessage(msg._id)}
                                            disabled={isRetrying}
                                            className={`text-xs py-1.5 px-3 rounded-lg font-semibold transition-all ${isRetrying
                                                ? 'bg-green-300 text-white cursor-not-allowed'
                                                : 'bg-green-500 text-white hover:bg-green-600 shadow-sm'
                                                }`}
                                            title="Enviar ahora"
                                        >
                                            {isRetrying ? '⏳ Enviando...' : '▶️ Enviar'}
                                        </button>
                                        <button
                                            onClick={() => cancelMessage(msg._id)}
                                            className="text-xs py-1.5 px-3 rounded-lg font-medium border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-all"
                                            title="Cancelar envío"
                                        >
                                            🗑️ Cancelar
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Message preview */}
                            <div className="mt-3 pl-[52px]">
                                {msg.textContent && (
                                    <p className="text-sm text-slate-600 line-clamp-2">{msg.textContent}</p>
                                )}
                                {msg.fileName && (
                                    <p className="text-sm text-slate-500 flex items-center gap-1">
                                        {getTypeIcon(msg.messageType)} {msg.fileName}
                                    </p>
                                )}
                            </div>

                            {/* Recurring badge */}
                            {msg.isRecurring && (
                                <div className="mt-2 ml-[52px]">
                                    <span className="inline-flex items-center gap-1 text-xs bg-violet-50 text-violet-600 px-2.5 py-1 rounded-full font-medium">
                                        🔁 {msg.recurringLabel || 'Recurrente'}
                                    </span>
                                </div>
                            )}

                            {/* Error details + Retry */}
                            {isFailed && (
                                <div className="mt-3 ml-[52px] space-y-2">
                                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                        <p className="text-xs font-semibold text-red-600 mb-1">❌ Error:</p>
                                        <p className="text-xs text-red-500">{msg.error || 'Error desconocido'}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => retryMessage(msg._id)}
                                            disabled={isRetrying}
                                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${isRetrying
                                                ? 'bg-violet-300 text-white cursor-not-allowed'
                                                : 'bg-violet-600 text-white hover:bg-violet-700 shadow-md shadow-violet-600/20'
                                                }`}
                                        >
                                            {isRetrying ? '⏳ Reintentando...' : '🔄 Reintentar Ahora'}
                                        </button>
                                        <button
                                            onClick={() => cancelMessage(msg._id)}
                                            className="py-2 px-3 rounded-lg text-sm font-medium border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-500 transition-all"
                                        >
                                            🗑️ Descartar
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
