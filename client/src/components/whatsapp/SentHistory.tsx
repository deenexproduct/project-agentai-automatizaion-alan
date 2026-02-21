import { useState, useEffect } from 'react'

import api from '../../lib/axios';

const API_URL = '/whatsapp';

interface SentMsg {
    _id: string
    chatName: string
    isGroup: boolean
    messageType: string
    textContent?: string
    fileName?: string
    scheduledAt: string
    sentAt?: string
    status: string
    error?: string
    isRecurring: boolean
}

export default function SentHistory() {
    const [messages, setMessages] = useState<SentMsg[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadHistory()
    }, [])

    const loadHistory = async () => {
        try {
            const res = await api.get(`${API_URL}/history`)
            setMessages(res.data)
        } catch {
            console.error('Error loading history')
        } finally {
            setLoading(false)
        }
    }

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '—'
        const d = new Date(dateStr)
        return `${d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}`
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
                    <span className="text-3xl">📬</span>
                </div>
                <p className="text-slate-600 font-bold text-[15px]">No hay mensajes enviados</p>
                <p className="text-[13px] text-slate-500 mt-1 font-medium">Los mensajes enviados aparecerán aquí</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <p className="text-[13px] font-bold text-slate-500 mb-2 uppercase tracking-wide px-2">
                {messages.length} mensaje{messages.length !== 1 ? 's' : ''}
            </p>

            <div className="grid gap-4">
                {messages.map(msg => {
                    const isSuccess = msg.status === 'sent'

                    return (
                        <div
                            key={msg._id}
                            className={`group relative overflow-hidden rounded-[20px] transition-all duration-300 animate-[fadeInSlideDown_0.3s_ease-out] ${isSuccess
                                ? 'bg-white/60 border border-white/80 shadow-[0_8px_32px_rgba(30,27,75,0.03)] backdrop-blur-md hover:shadow-[0_12px_40px_rgba(30,27,75,0.08)] hover:-translate-y-0.5'
                                : 'bg-red-50/40 border border-red-200/60 shadow-[0_8px_24px_rgba(239,68,68,0.08)]'
                                }`}
                        >
                            {isSuccess && (
                                <div className="absolute inset-0 bg-gradient-to-r from-green-500/0 to-emerald-500/0 group-hover:from-green-500/5 group-hover:to-emerald-500/5 transition-colors pointer-events-none" />
                            )}

                            <div className="p-5 relative z-10">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-4 min-w-0 flex-1">
                                        <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center flex-shrink-0 shadow-inner ${isSuccess ? 'bg-green-100/80 text-green-600' : 'bg-red-100/80 text-red-600'
                                            }`}>
                                            <span className="text-xl">{isSuccess ? '✅' : '❌'}</span>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <p className="font-bold text-[15px] text-slate-800 truncate">{msg.chatName}</p>
                                                <span className="text-sm bg-white/50 px-2 py-0.5 rounded-md shadow-sm border border-slate-100">{getTypeIcon(msg.messageType)}</span>
                                                {msg.isGroup && (
                                                    <span className="text-[10px] uppercase tracking-wider font-bold bg-slate-200/50 text-slate-500 px-2 py-1 rounded-[8px]">
                                                        Grupo
                                                    </span>
                                                )}
                                            </div>
                                            <p className={`text-[12px] font-bold ${isSuccess ? 'text-green-600' : 'text-red-500'}`}>
                                                {isSuccess ? `Enviado ${formatDate(msg.sentAt)}` : `Falló ${formatDate(msg.scheduledAt)}`}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Message content */}
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
                                    {!isSuccess && msg.error && (
                                        <div className="mt-2 bg-white/60 border border-red-100 rounded-[12px] p-3 shadow-inner">
                                            <p className="text-[12px] font-bold text-red-600 flex items-center gap-1.5">
                                                <span>⚠️</span> {msg.error}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Recurring badge */}
                                {msg.isRecurring && (
                                    <div className="mt-3 ml-[64px]">
                                        <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider bg-violet-100 text-violet-700 px-3 py-1 rounded-full font-bold shadow-sm border border-violet-200">
                                            <span>🔁</span> Recurrente
                                        </span>
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
