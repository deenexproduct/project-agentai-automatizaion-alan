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
                <div className="animate-spin w-8 h-8 rounded-full" style={{ border: '3px solid rgba(139,92,246,0.2)', borderTopColor: '#8b5cf6' }}></div>
            </div>
        )
    }

    if (messages.length === 0) {
        return (
            <div className="text-center py-16 bg-white/40 backdrop-blur-md rounded-[24px] border border-white/60 shadow-[0_8px_32px_rgba(30,27,75,0.05)]">
                <div className="w-16 h-16 bg-slate-100/50 rounded-[20px] shadow-inner flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">📭</span>
                </div>
                <p className="text-slate-600 font-bold text-[15px]">No hay mensajes pendientes</p>
                <p className="text-[13px] text-slate-500 mt-1 font-medium">Programá un mensaje desde la pestaña "Programar"</p>
            </div>
        )
    }

    const pendingCount = messages.filter(m => m.status === 'pending').length
    const failedCount = messages.filter(m => m.status === 'failed').length

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                    {pendingCount > 0 && (
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-full shadow-sm">
                            <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                            <span className="text-[12px] font-bold text-slate-600 uppercase tracking-widest">
                                {pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}
                            </span>
                        </div>
                    )}
                    {failedCount > 0 && (
                        <div className="flex items-center gap-2 bg-red-50 border border-red-200 px-3 py-1.5 rounded-full shadow-sm">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            <span className="text-[12px] font-bold text-red-600 uppercase tracking-widest">
                                {failedCount} fallido{failedCount !== 1 ? 's' : ''}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid gap-4">
                {messages.map(msg => {
                    const isFailed = msg.status === 'failed'
                    const isRetrying = retrying === msg._id

                    return (
                        <div
                            key={msg._id}
                            className={`group relative overflow-hidden rounded-[20px] transition-all duration-300 animate-[fadeInSlideDown_0.3s_ease-out] ${isFailed
                                ? 'bg-red-50/40 border border-red-200/60 shadow-[0_8px_24px_rgba(239,68,68,0.08)]'
                                : 'bg-white/60 border border-white/80 shadow-[0_8px_32px_rgba(30,27,75,0.03)] backdrop-blur-md hover:shadow-[0_12px_40px_rgba(30,27,75,0.08)] hover:-translate-y-0.5'
                                }`}
                        >
                            {!isFailed && (
                                <div className="absolute inset-0 bg-gradient-to-r from-violet-500/0 to-fuchsia-500/0 group-hover:from-violet-500/5 group-hover:to-fuchsia-500/5 transition-colors pointer-events-none" />
                            )}

                            <div className="p-5 relative z-10">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-4 min-w-0 flex-1">
                                        <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center flex-shrink-0 shadow-inner ${isFailed ? 'bg-red-100/80 text-red-600' : 'bg-violet-100/80 text-violet-600'
                                            }`}>
                                            <span className="text-xl">{msg.isGroup ? '👥' : '👤'}</span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <p className="font-bold text-[15px] text-slate-800 truncate">{msg.chatName}</p>
                                                <span className="text-sm bg-white/50 px-2 py-0.5 rounded-md shadow-sm border border-slate-100">{getTypeIcon(msg.messageType)}</span>
                                                {isFailed && (
                                                    <span className="text-[10px] uppercase tracking-wider font-bold bg-gradient-to-r from-red-500 to-rose-500 text-white px-2 py-0.5 rounded-full shadow-sm">
                                                        Fallido
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[12px] opacity-70">🕜</span>
                                                <p className={`text-[13px] font-bold ${isFailed ? 'text-red-500' : 'text-violet-600'}`}>
                                                    {formatDate(msg.scheduledAt)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {!isFailed && (
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => retryMessage(msg._id)}
                                                disabled={isRetrying}
                                                className={`text-[12px] py-2 px-4 rounded-[12px] font-bold transition-all duration-300 ${isRetrying
                                                    ? 'bg-green-300 text-white cursor-not-allowed'
                                                    : 'bg-green-500 hover:bg-green-600 text-white shadow-[0_4px_12px_rgba(34,197,94,0.3)] hover:-translate-y-0.5'
                                                    }`}
                                                title="Enviar ahora"
                                            >
                                                {isRetrying ? '⏳...' : '▶️ Enviar ya'}
                                            </button>
                                            <button
                                                onClick={() => cancelMessage(msg._id)}
                                                className="text-[12px] py-2 px-3 rounded-[12px] font-bold bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all duration-300 shadow-sm"
                                                title="Cancelar envío"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Message preview */}
                                <div className="mt-4 pl-[64px]">
                                    {msg.textContent && (
                                        <div className="bg-white/50 p-3 rounded-[12px] border border-white/60 shadow-inner">
                                            <p className="text-[13px] text-slate-700 line-clamp-2 leading-relaxed">{msg.textContent}</p>
                                        </div>
                                    )}
                                    {msg.fileName && (
                                        <div className="flex items-center gap-2 mt-2 bg-white/50 p-2.5 rounded-[12px] border border-white/60 shadow-inner w-fit">
                                            <span className="text-lg">{getTypeIcon(msg.messageType)}</span>
                                            <p className="text-[13px] font-medium text-slate-700 truncate max-w-[200px]">{msg.fileName}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Recurring badge */}
                                {msg.isRecurring && (
                                    <div className="mt-3 ml-[64px]">
                                        <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider bg-violet-100 text-violet-700 px-3 py-1 rounded-full font-bold shadow-sm border border-violet-200">
                                            <span>🔁</span> {msg.recurringLabel || 'Recurrente'}
                                        </span>
                                    </div>
                                )}

                                {/* Error details + Retry */}
                                {isFailed && (
                                    <div className="mt-4 ml-[64px] space-y-3">
                                        <div className="bg-white/60 border border-red-100 rounded-[12px] p-4 shadow-inner">
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <span className="text-red-500 text-sm">❌</span>
                                                <p className="text-[12px] font-bold text-red-600 uppercase tracking-wider">Detalle del Error</p>
                                            </div>
                                            <p className="text-[13px] font-medium text-red-500/90 pl-6">{msg.error || 'Error desconocido'}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => retryMessage(msg._id)}
                                                disabled={isRetrying}
                                                className={`flex-1 py-2.5 px-4 rounded-[12px] text-[13px] font-bold transition-all duration-300 ${isRetrying
                                                    ? 'bg-violet-300 text-white cursor-not-allowed'
                                                    : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:shadow-[0_4px_16px_rgba(139,92,246,0.3)] hover:-translate-y-0.5'
                                                    }`}
                                            >
                                                {isRetrying ? '⏳ Reintentando...' : '🔄 Reintentar Ahora'}
                                            </button>
                                            <button
                                                onClick={() => cancelMessage(msg._id)}
                                                className="py-2.5 px-4 rounded-[12px] text-[13px] font-bold bg-white/50 border border-white/80 text-slate-600 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all duration-300 shadow-sm"
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

            <style>{`
                @keyframes fadeInSlideDown {
                    from { opacity: 0; transform: translateY(-8px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    )
}
