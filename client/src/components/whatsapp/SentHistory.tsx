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
                <div className="animate-spin w-8 h-8 border-3 border-violet-600 border-t-transparent rounded-full" style={{ borderWidth: '3px' }}></div>
            </div>
        )
    }

    if (messages.length === 0) {
        return (
            <div className="text-center py-16">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">📬</span>
                </div>
                <p className="text-slate-500 font-medium">No hay mensajes enviados</p>
                <p className="text-sm text-slate-400 mt-1">Los mensajes enviados aparecerán aquí</p>
            </div>
        )
    }

    return (
        <div className="space-y-3">
            <p className="text-sm text-slate-500 mb-2">{messages.length} mensaje{messages.length !== 1 ? 's' : ''}</p>

            {messages.map(msg => (
                <div key={msg._id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div className="p-4">
                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${msg.status === 'sent' ? 'bg-green-100' : 'bg-red-100'
                                    }`}>
                                    <span className="text-lg">{msg.status === 'sent' ? '✅' : '❌'}</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <p className="font-medium text-slate-800 truncate">{msg.chatName}</p>
                                        <span className="text-sm">{getTypeIcon(msg.messageType)}</span>
                                        {msg.isGroup && (
                                            <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">Grupo</span>
                                        )}
                                    </div>
                                    <p className="text-sm text-slate-500">
                                        {msg.status === 'sent' ? `Enviado ${formatDate(msg.sentAt)}` : `Falló ${formatDate(msg.scheduledAt)}`}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Message content */}
                        <div className="mt-3 pl-[52px]">
                            {msg.textContent && (
                                <p className="text-sm text-slate-600 line-clamp-2">{msg.textContent}</p>
                            )}
                            {msg.fileName && (
                                <p className="text-sm text-slate-500 flex items-center gap-1">
                                    {getTypeIcon(msg.messageType)} {msg.fileName}
                                </p>
                            )}
                            {msg.status === 'failed' && msg.error && (
                                <p className="text-sm text-red-500 mt-1 flex items-center gap-1">
                                    ⚠️ {msg.error}
                                </p>
                            )}
                        </div>

                        {/* Recurring badge */}
                        {msg.isRecurring && (
                            <div className="mt-2 pl-[52px]">
                                <span className="inline-flex items-center gap-1 text-xs bg-violet-50 text-violet-600 px-2.5 py-1 rounded-full font-medium">
                                    🔁 Recurrente
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}
