import { useState, useEffect, useRef } from 'react'
import AudioRecorder from './AudioRecorder'
import ChatPicker, { ChatItem } from '../shared/ChatPicker'
import { formatToLocalDateInput } from '../../utils/date';

import api from '../../lib/axios';

const API_URL = '/whatsapp';



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
    const [selectedChat, setSelectedChat] = useState<ChatItem | null>(null)
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

            const res = await api.post(`${API_URL}/schedule`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })

            // axios automatically throws on non-2xx Status

            setSuccess(true)
            setTextContent('')
            setFile(null)
            setAudioMode('record')
            setScheduledDate(getTodayDate())
            setScheduledTime(getFutureTime())
            setRecurrence('')
            setSelectedChat(null)

            setTimeout(() => setSuccess(false), 3000)
        } catch (err: any) {
            setError(err.message)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Success Banner */}
            {success && (
                <div className="p-4 rounded-[16px] flex items-center gap-3 animate-[fadeInSlideDown_0.4s_ease-out]"
                    style={{
                        background: 'linear-gradient(135deg, rgba(34,197,94,0.1), rgba(16,185,129,0.1))',
                        border: '1px solid rgba(34,197,94,0.2)',
                        boxShadow: '0 4px 12px rgba(34,197,94,0.05)',
                    }}>
                    <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                        <span className="text-xl">✅</span>
                    </div>
                    <span className="font-bold text-green-700 text-[14px]">¡Mensaje programado exitosamente!</span>
                </div>
            )}

            {/* Error Banner */}
            {error && (
                <div className="p-4 rounded-[16px] flex items-center gap-3 animate-[fadeInSlideDown_0.4s_ease-out]"
                    style={{
                        background: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(220,38,38,0.1))',
                        border: '1px solid rgba(239,68,68,0.2)',
                        boxShadow: '0 4px 12px rgba(239,68,68,0.05)',
                    }}>
                    <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                        <span className="text-xl">⚠️</span>
                    </div>
                    <span className="font-bold text-red-600 text-[14px] flex-1">{error}</span>
                    <button onClick={() => setError(null)} className="w-8 h-8 rounded-full hover:bg-red-500/10 flex items-center justify-center text-red-500 transition-colors">✕</button>
                </div>
            )}

            <div className="rounded-[24px] p-6 sm:p-8 bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_32px_rgba(30,27,75,0.05)]">

                <div className="space-y-6">
                    {/* Contact/Group Selector — shared ChatPicker */}
                    <ChatPicker
                        selected={selectedChat}
                        onSelect={setSelectedChat}
                        filter="all"
                        label="Contacto o Grupo"
                        disabled={submitting}
                    />

                    {/* Message Type */}
                    <div>
                        <label className="block text-[13px] font-bold text-slate-700 mb-2 uppercase tracking-wide">Tipo de mensaje</label>
                        <div className="flex gap-2 p-1.5 bg-white/50 rounded-[16px] border border-white/60 shadow-inner">
                            {[
                                { type: 'text' as const, icon: '💬', label: 'Texto' },
                                { type: 'audio' as const, icon: '🎵', label: 'Audio' },
                                { type: 'file' as const, icon: '📎', label: 'Archivo' },
                            ].map(({ type, icon, label }) => (
                                <button
                                    key={type}
                                    onClick={() => { setMessageType(type); setFile(null); }}
                                    className={`flex-1 py-2.5 px-4 rounded-[12px] font-bold text-[13px] transition-all duration-300 ${messageType === type
                                        ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-[0_4px_12px_rgba(139,92,246,0.2)]'
                                        : 'text-slate-600 hover:bg-white/60 hover:text-violet-600'
                                        }`}
                                >
                                    {icon} {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Text Content */}
                    {messageType === 'text' && (
                        <div className="animate-[fadeInSlideDown_0.3s_ease]">
                            <label className="block text-[13px] font-bold text-slate-700 mb-2 uppercase tracking-wide">Mensaje</label>
                            <div className="relative group/textarea">
                                <textarea
                                    value={textContent}
                                    onChange={(e) => setTextContent(e.target.value)}
                                    placeholder="Escribí tu mensaje..."
                                    rows={4}
                                    className="w-full rounded-[16px] p-5 text-[14px] resize-none transition-all outline-none text-slate-700 placeholder-slate-400"
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.6)',
                                        border: '1px solid rgba(255, 255, 255, 0.8)',
                                        boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.02)',
                                    }}
                                />
                                <div className="absolute inset-0 rounded-[16px] pointer-events-none border-2 border-transparent group-focus-within/textarea:border-violet-400 transition-colors" />
                            </div>
                        </div>
                    )}

                    {/* Audio Section */}
                    {messageType === 'audio' && (
                        <div className="animate-[fadeInSlideDown_0.3s_ease]">
                            <label className="block text-[13px] font-bold text-slate-700 mb-2 uppercase tracking-wide">Audio</label>

                            {/* Record / Upload toggle */}
                            {!file && (
                                <div className="flex gap-2 mb-4">
                                    <button
                                        onClick={() => setAudioMode('record')}
                                        className={`flex-1 py-2.5 px-4 rounded-[12px] text-[13px] font-bold transition-all duration-300 ${audioMode === 'record'
                                            ? 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-[0_4px_12px_rgba(239,68,68,0.2)]'
                                            : 'bg-white/50 text-slate-600 border border-white/60 hover:bg-white/80'
                                            }`}
                                    >
                                        🎙️ Grabar
                                    </button>
                                    <button
                                        onClick={() => setAudioMode('upload')}
                                        className={`flex-1 py-2.5 px-4 rounded-[12px] text-[13px] font-bold transition-all duration-300 ${audioMode === 'upload'
                                            ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-[0_4px_12px_rgba(139,92,246,0.2)]'
                                            : 'bg-white/50 text-slate-600 border border-white/60 hover:bg-white/80'
                                            }`}
                                    >
                                        📁 Subir archivo
                                    </button>
                                </div>
                            )}

                            {file ? (
                                <div className="flex items-center gap-4 p-4 rounded-[16px] bg-white/60 border border-white/80 shadow-sm relative overflow-hidden group">
                                    <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 to-fuchsia-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <div className="w-10 h-10 rounded-[12px] bg-violet-100 text-violet-600 flex items-center justify-center text-xl relative z-10">🎵</div>
                                    <div className="flex-1 min-w-0 relative z-10">
                                        <p className="text-[14px] font-bold text-slate-800 truncate">{file.name}</p>
                                        <p className="text-[12px] font-medium text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                                    </div>
                                    <button onClick={() => setFile(null)} className="w-8 h-8 rounded-full hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors relative z-10">
                                        🗑️
                                    </button>
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
                                        className="w-full py-10 rounded-[20px] transition-all duration-300 group hover:-translate-y-1 relative overflow-hidden text-center"
                                        style={{
                                            background: 'rgba(255,255,255,0.4)',
                                            border: '2px dashed rgba(139,92,246,0.3)',
                                        }}
                                    >
                                        <div className="absolute inset-0 bg-gradient-to-tr from-violet-500/0 to-fuchsia-500/0 group-hover:from-violet-500/5 group-hover:to-fuchsia-500/5 transition-colors" />
                                        <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-3 shadow-inner group-hover:scale-110 transition-transform">
                                            <span className="text-2xl block relative z-10">🎵</span>
                                        </div>
                                        <p className="text-[14px] font-bold text-slate-600 relative z-10">Click para seleccionar audio</p>
                                        <p className="text-[12px] text-slate-400 mt-1 relative z-10">MP3, WAV, OGG</p>
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {/* File Upload (non-audio) */}
                    {messageType === 'file' && (
                        <div className="animate-[fadeInSlideDown_0.3s_ease]">
                            <label className="block text-[13px] font-bold text-slate-700 mb-2 uppercase tracking-wide">Archivo adjunto</label>
                            <input
                                ref={fileInputRef}
                                type="file"
                                onChange={(e) => setFile(e.target.files?.[0] || null)}
                                className="hidden"
                            />
                            {file ? (
                                <div className="flex items-center gap-4 p-4 rounded-[16px] bg-white/60 border border-white/80 shadow-sm relative overflow-hidden group">
                                    <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 to-fuchsia-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <div className="w-10 h-10 rounded-[12px] bg-blue-100 text-blue-600 flex items-center justify-center text-xl relative z-10">📄</div>
                                    <div className="flex-1 min-w-0 relative z-10">
                                        <p className="text-[14px] font-bold text-slate-800 truncate">{file.name}</p>
                                        <p className="text-[12px] font-medium text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                                    </div>
                                    <button onClick={() => setFile(null)} className="w-8 h-8 rounded-full hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors relative z-10">
                                        🗑️
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full py-10 rounded-[20px] transition-all duration-300 group hover:-translate-y-1 relative overflow-hidden text-center"
                                    style={{
                                        background: 'rgba(255,255,255,0.4)',
                                        border: '2px dashed rgba(139,92,246,0.3)',
                                    }}
                                >
                                    <div className="absolute inset-0 bg-gradient-to-tr from-violet-500/0 to-fuchsia-500/0 group-hover:from-violet-500/5 group-hover:to-fuchsia-500/5 transition-colors" />
                                    <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center mx-auto mb-3 shadow-inner group-hover:scale-110 transition-transform">
                                        <span className="text-2xl block relative z-10">📎</span>
                                    </div>
                                    <p className="text-[14px] font-bold text-slate-600 relative z-10">Click para seleccionar archivo</p>
                                    <p className="text-[12px] text-slate-400 mt-1 relative z-10">Cualquier formato admitido por WhatsApp</p>
                                </button>
                            )}

                            {/* Caption for file */}
                            {file && (
                                <div className="mt-4 animate-[fadeInSlideDown_0.3s_ease]">
                                    <label className="block text-[13px] font-bold text-slate-700 mb-2 uppercase tracking-wide">Caption (opcional)</label>
                                    <div className="relative group/caption">
                                        <input
                                            type="text"
                                            value={textContent}
                                            onChange={(e) => setTextContent(e.target.value)}
                                            placeholder="Agregar un texto al archivo..."
                                            className="w-full rounded-[16px] p-4 text-[14px] transition-all outline-none text-slate-700 placeholder-slate-400"
                                            style={{
                                                background: 'rgba(255, 255, 255, 0.6)',
                                                border: '1px solid rgba(255, 255, 255, 0.8)',
                                                boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.02)',
                                            }}
                                        />
                                        <div className="absolute inset-0 rounded-[16px] pointer-events-none border-2 border-transparent group-focus-within/caption:border-violet-400 transition-colors" />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Date & Time */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[13px] font-bold text-slate-700 mb-2 uppercase tracking-wide">📅 Fecha</label>
                            <div className="relative group/date">
                                <input
                                    type="date"
                                    value={scheduledDate}
                                    onChange={(e) => setScheduledDate(e.target.value)}
                                    min={formatToLocalDateInput(new Date())}
                                    className="w-full rounded-[16px] p-4 text-[14px] transition-all outline-none text-slate-700"
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.6)',
                                        border: '1px solid rgba(255, 255, 255, 0.8)',
                                        boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.02)',
                                    }}
                                />
                                <div className="absolute inset-0 rounded-[16px] pointer-events-none border-2 border-transparent group-focus-within/date:border-violet-400 transition-colors" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-[13px] font-bold text-slate-700 mb-2 uppercase tracking-wide">🕐 Hora</label>
                            <div className="relative group/time">
                                <input
                                    type="time"
                                    value={scheduledTime}
                                    onChange={(e) => setScheduledTime(e.target.value)}
                                    className="w-full rounded-[16px] p-4 text-[14px] transition-all outline-none text-slate-700"
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.6)',
                                        border: '1px solid rgba(255, 255, 255, 0.8)',
                                        boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.02)',
                                    }}
                                />
                                <div className="absolute inset-0 rounded-[16px] pointer-events-none border-2 border-transparent group-focus-within/time:border-violet-400 transition-colors" />
                            </div>
                        </div>
                    </div>

                    {/* Recurrence */}
                    <div>
                        <label className="block text-[13px] font-bold text-slate-700 mb-2 uppercase tracking-wide">🔁 Repetición</label>
                        <div className="relative group/recurrence">
                            <select
                                value={recurrence}
                                onChange={(e) => setRecurrence(e.target.value)}
                                className="w-full rounded-[16px] p-4 text-[14px] transition-all outline-none text-slate-700 appearance-none"
                                style={{
                                    background: 'rgba(255, 255, 255, 0.6)',
                                    border: '1px solid rgba(255, 255, 255, 0.8)',
                                    boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.02)',
                                }}
                            >
                                {RECURRENCE_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                            <div className="absolute inset-0 rounded-[16px] pointer-events-none border-2 border-transparent group-focus-within/recurrence:border-violet-400 transition-colors" />
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                ▼
                            </div>
                        </div>
                    </div>
                </div>

                {/* Submit */}
                <div className="mt-8 pt-6 border-t border-slate-200/50">
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="w-full py-4 rounded-[16px] text-white font-bold text-[15px] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-1 relative overflow-hidden group/submit"
                        style={{
                            background: submitting ? 'rgba(139,92,246,0.6)' : 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                            boxShadow: submitting ? 'none' : '0 8px 24px -6px rgba(124,58,237,0.5)',
                        }}
                    >
                        {!submitting && <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/submit:translate-y-0 transition-transform duration-300" />}
                        <span className="relative flex justify-center items-center gap-2">
                            {submitting ? (
                                <>
                                    <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                    <span>Programando...</span>
                                </>
                            ) : (
                                '📅 Programar Mensaje'
                            )}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    )
}
