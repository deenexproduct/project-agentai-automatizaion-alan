import { useState, useEffect, useCallback, useRef } from 'react';
import { Calendar, Clock, Send, CheckCircle2, XCircle, RefreshCw, Loader2, BarChart3, Trash2, Zap, MessageCircle } from 'lucide-react';
import { formatToLocalDateInput } from '../../utils/date';
import QRLogin from '../whatsapp/QRLogin';
import AudioRecorder from '../whatsapp/AudioRecorder';
import ChatPicker, { ChatItem } from '../shared/ChatPicker';
import api from '../../lib/axios';

const API_URL = '/whatsapp';

// ── Types ────────────────────────────────────────
interface ScheduledMsg {
    _id: string;
    chatName: string;
    isGroup: boolean;
    messageType: string;
    textContent?: string;
    fileName?: string;
    scheduledAt: string;
    isRecurring: boolean;
    recurringLabel?: string;
    status: string;
    error?: string;
    retryCount?: number;
}

interface SentMsg {
    _id: string;
    chatName: string;
    isGroup: boolean;
    messageType: string;
    textContent?: string;
    fileName?: string;
    scheduledAt: string;
    sentAt?: string;
    status: string;
    error?: string;
    isRecurring: boolean;
}

interface Stats {
    totalSent: number;
    totalFailed: number;
    totalPending: number;
    successRate: number;
    topContacts: { name: string; count: number }[];
    weekActivity: number[];
}

type SubTab = 'schedule' | 'queue' | 'dashboard';

const RECURRENCE_OPTIONS = [
    { label: 'Sin repetición', value: '', cron: '' },
    { label: 'Todos los días', value: 'daily', cron: '0 9 * * *' },
    { label: 'Lunes', value: 'mon', cron: '0 9 * * 1' },
    { label: 'Martes', value: 'tue', cron: '0 9 * * 2' },
    { label: 'Miércoles', value: 'wed', cron: '0 9 * * 3' },
    { label: 'Jueves', value: 'thu', cron: '0 9 * * 4' },
    { label: 'Viernes', value: 'fri', cron: '0 9 * * 5' },
    { label: 'Sábado', value: 'sat', cron: '0 9 * * 6' },
    { label: 'Domingo', value: 'sun', cron: '0 9 * * 0' },
];

const QUICK_SLOTS = [
    { label: 'Ahora +5min', minutes: 5 },
    { label: 'En 15min', minutes: 15 },
    { label: 'En 30min', minutes: 30 },
    { label: 'En 1 hora', minutes: 60 },
    { label: 'Mañana 9am', minutes: -1 }, // special
];

// ══════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════
export default function WhatsAppPage() {
    const [connected, setConnected] = useState(false);
    const [checkingStatus, setCheckingStatus] = useState(true);
    const [activeSubTab, setActiveSubTab] = useState<SubTab>('schedule');

    useEffect(() => {
        checkConnection();
    }, []);

    const checkConnection = async () => {
        try {
            const res = await api.get(`${API_URL}/status`);
            setConnected(res.data.status === 'connected');
        } catch {
            setConnected(false);
        } finally {
            setCheckingStatus(false);
        }
    };

    useEffect(() => {
        if (!connected) return;
        const interval = setInterval(async () => {
            try {
                const res = await api.get(`${API_URL}/status`);
                if (res.data.status !== 'connected') setConnected(false);
            } catch { }
        }, 15000);
        return () => clearInterval(interval);
    }, [connected]);

    const handleConnected = useCallback(() => setConnected(true), []);

    if (checkingStatus) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center">
                    <Loader2 size={40} className="animate-spin mx-auto mb-4" style={{ color: '#25D366' }} />
                    <p className="text-slate-500 font-medium">Conectando con WhatsApp...</p>
                </div>
            </div>
        );
    }

    if (!connected) {
        return <QRLogin onConnected={handleConnected} />;
    }

    const subTabs: { id: SubTab; icon: React.ReactNode; label: string }[] = [
        { id: 'schedule', icon: <Calendar size={16} />, label: 'Programar' },
        { id: 'queue', icon: <Clock size={16} />, label: 'Cola' },
        { id: 'dashboard', icon: <BarChart3 size={16} />, label: 'Dashboard' },
    ];

    return (
        <div className="h-full flex flex-col pb-20 md:pb-0">
            {/* Connection Status + Sub Tabs */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 md:mb-6 gap-3">
                <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: '#25D366' }} />
                    <span className="text-sm font-medium" style={{ color: '#25D366' }}>WhatsApp conectado</span>
                </div>
                <div className="flex gap-1 p-1 rounded-xl w-full md:w-auto" style={{ background: 'rgba(124, 58, 237, 0.06)' }}>
                    {subTabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveSubTab(tab.id)}
                            className="flex-1 md:flex-none flex items-center justify-center gap-1.5 px-3 md:px-4 py-2 rounded-lg text-sm font-medium transition-all"
                            style={{
                                background: activeSubTab === tab.id ? 'white' : 'transparent',
                                color: activeSubTab === tab.id ? '#7c3aed' : '#94a3b8',
                                boxShadow: activeSubTab === tab.id ? '0 2px 8px rgba(124, 58, 237, 0.15)' : 'none',
                            }}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {activeSubTab === 'schedule' && <SchedulerPanel />}
                {activeSubTab === 'queue' && <QueuePanel />}
                {activeSubTab === 'dashboard' && <DashboardPanel />}
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════
// SCHEDULER PANEL
// ══════════════════════════════════════════════════
function SchedulerPanel() {
    const [selectedChat, setSelectedChat] = useState<ChatItem | null>(null);
    const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
    const [messageType, setMessageType] = useState<'text' | 'audio' | 'file'>('text');
    const [audioMode, setAudioMode] = useState<'record' | 'upload'>('record');
    const [textContent, setTextContent] = useState('');
    const [file, setFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (!selectedChat) {
            setProfilePicUrl(null);
            return;
        }
        api.get(`${API_URL}/contact/${selectedChat.id}/profile-pic`)
            .then(res => setProfilePicUrl(res.data.url))
            .catch(() => setProfilePicUrl(null));
    }, [selectedChat]);

    const getTodayDate = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const getFutureTime = (mins = 2) => {
        const d = new Date();
        d.setMinutes(d.getMinutes() + mins);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };

    const [scheduledDate, setScheduledDate] = useState(getTodayDate());
    const [scheduledTime, setScheduledTime] = useState(getFutureTime());
    const [recurrence, setRecurrence] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const applyQuickSlot = (minutes: number) => {
        if (minutes === -1) {
            // Tomorrow 9am
            const d = new Date();
            d.setDate(d.getDate() + 1);
            setScheduledDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
            setScheduledTime('09:00');
        } else {
            setScheduledDate(getTodayDate());
            setScheduledTime(getFutureTime(minutes));
        }
    };

    const handleSubmit = async () => {
        if (!selectedChat) { setError('Seleccioná un contacto o grupo'); return; }
        if (messageType === 'text' && !textContent.trim()) { setError('Escribí un mensaje'); return; }
        if ((messageType === 'audio' || messageType === 'file') && !file) { setError('Seleccioná un archivo'); return; }
        if (!scheduledDate || !scheduledTime) { setError('Seleccioná fecha y hora'); return; }

        setSubmitting(true);
        setError(null);

        try {
            const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`);
            const recurrenceOption = RECURRENCE_OPTIONS.find(r => r.value === recurrence);

            const formData = new FormData();
            formData.append('chatId', selectedChat.id);
            formData.append('chatName', selectedChat.name);
            formData.append('isGroup', String(selectedChat.isGroup));
            formData.append('messageType', messageType);
            formData.append('scheduledAt', scheduledAt.toISOString());

            if (messageType === 'text') formData.append('textContent', textContent);
            if (file) {
                formData.append('file', file);
                if (messageType === 'text') formData.append('textContent', textContent);
            }
            if (recurrence && recurrenceOption?.cron) {
                formData.append('isRecurring', 'true');
                const [hour, minute] = scheduledTime.split(':');
                const cronParts = recurrenceOption.cron.split(' ');
                cronParts[0] = minute;
                cronParts[1] = hour;
                formData.append('cronPattern', cronParts.join(' '));
                formData.append('recurringLabel', recurrenceOption.label);
            }

            await api.post(`${API_URL}/schedule`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            setSuccess(true);
            setTextContent('');
            setFile(null);
            setAudioMode('record');
            setScheduledDate(getTodayDate());
            setScheduledTime(getFutureTime());
            setRecurrence('');
            setSelectedChat(null);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err: any) {
            setError(err.response?.data?.error || err.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Quick Slots */}
            <div className="rounded-2xl p-4" style={{ background: 'rgba(124, 58, 237, 0.04)', border: '1px solid rgba(124, 58, 237, 0.1)' }}>
                <div className="flex items-center gap-2 mb-3">
                    <Zap size={16} className="text-amber-500" />
                    <span className="text-sm font-semibold text-slate-700">Programación Rápida</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {QUICK_SLOTS.map(slot => (
                        <button
                            key={slot.label}
                            onClick={() => applyQuickSlot(slot.minutes)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105"
                            style={{
                                background: 'white',
                                color: '#7c3aed',
                                border: '1px solid rgba(124, 58, 237, 0.2)',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                            }}
                        >
                            ⚡ {slot.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Alerts */}
            {success && (
                <div className="p-4 rounded-xl flex items-center gap-3 animate-in" style={{ background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                    <CheckCircle2 size={20} className="text-green-500 shrink-0" />
                    <span className="text-green-700 font-medium text-sm">¡Mensaje programado exitosamente!</span>
                </div>
            )}
            {error && (
                <div className="p-4 rounded-xl flex items-center gap-3" style={{ background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    <XCircle size={20} className="text-red-500 shrink-0" />
                    <span className="text-red-600 text-sm flex-1">{error}</span>
                    <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-lg">✕</button>
                </div>
            )}

            {/* Main Form & Preview Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-6 items-start">

                {/* Form Card */}
                <div className="rounded-2xl p-6 space-y-5" style={{ background: 'white', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}>
                    {/* Contact Picker */}
                    <ChatPicker
                        selected={selectedChat}
                        onSelect={setSelectedChat}
                        filter="all"
                        label="📱 Destinatario"
                        disabled={submitting}
                    />

                    {/* Message Type */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Tipo de mensaje</label>
                        <div className="flex gap-2">
                            {([
                                { type: 'text' as const, icon: '💬', label: 'Texto' },
                                { type: 'audio' as const, icon: '🎵', label: 'Audio' },
                                { type: 'file' as const, icon: '📎', label: 'Archivo' },
                            ]).map(({ type, icon, label }) => (
                                <button
                                    key={type}
                                    onClick={() => { setMessageType(type); setFile(null); }}
                                    className="flex-1 py-3 px-4 rounded-xl transition-all font-medium text-sm"
                                    style={{
                                        background: messageType === type ? 'rgba(124, 58, 237, 0.08)' : '#f8fafc',
                                        color: messageType === type ? '#7c3aed' : '#64748b',
                                        border: messageType === type ? '2px solid #7c3aed' : '2px solid #e2e8f0',
                                        transform: messageType === type ? 'scale(1.02)' : 'scale(1)',
                                    }}
                                >
                                    {icon} {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Text Content */}
                    {messageType === 'text' && (
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Mensaje</label>
                            <textarea
                                value={textContent}
                                onChange={(e) => setTextContent(e.target.value)}
                                placeholder="Escribí tu mensaje..."
                                rows={5}
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition-all outline-none resize-none text-sm"
                            />
                        </div>
                    )}

                    {/* Audio */}
                    {messageType === 'audio' && (
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Audio</label>
                            {!file && (
                                <div className="flex gap-2 mb-3">
                                    <button onClick={() => setAudioMode('record')} className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${audioMode === 'record' ? 'bg-red-500 text-white shadow-md shadow-red-500/20' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                                        🎙️ Grabar
                                    </button>
                                    <button onClick={() => setAudioMode('upload')} className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${audioMode === 'upload' ? 'bg-violet-500 text-white shadow-md shadow-violet-500/20' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                                        📁 Subir archivo
                                    </button>
                                </div>
                            )}
                            {file ? (
                                <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(124, 58, 237, 0.06)', border: '1px solid rgba(124, 58, 237, 0.15)' }}>
                                    <span className="text-2xl">🎵</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                                        <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                                    </div>
                                    <button onClick={() => setFile(null)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                                </div>
                            ) : audioMode === 'record' ? (
                                <AudioRecorder onAudioReady={(f: File) => setFile(f)} />
                            ) : (
                                <>
                                    <input ref={fileInputRef} type="file" accept="audio/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
                                    <button onClick={() => fileInputRef.current?.click()} className="w-full py-8 border-2 border-dashed border-slate-300 rounded-xl hover:border-violet-400 hover:bg-violet-50/50 transition-all">
                                        <div className="text-center">
                                            <span className="text-3xl block mb-2">🎵</span>
                                            <p className="text-sm text-slate-500">Click para seleccionar archivo de audio</p>
                                        </div>
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {/* File Upload */}
                    {messageType === 'file' && (
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Archivo adjunto</label>
                            <input ref={fileInputRef} type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
                            {file ? (
                                <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(124, 58, 237, 0.06)', border: '1px solid rgba(124, 58, 237, 0.15)' }}>
                                    <span className="text-2xl">📄</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                                        <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(1)} KB</p>
                                    </div>
                                    <button onClick={() => setFile(null)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                                </div>
                            ) : (
                                <button onClick={() => fileInputRef.current?.click()} className="w-full py-8 border-2 border-dashed border-slate-300 rounded-xl hover:border-violet-400 hover:bg-violet-50/50 transition-all">
                                    <div className="text-center">
                                        <span className="text-3xl block mb-2">📎</span>
                                        <p className="text-sm text-slate-500">Click para seleccionar archivo</p>
                                    </div>
                                </button>
                            )}
                            {file && (
                                <div className="mt-3">
                                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Caption (opcional)</label>
                                    <input type="text" value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder="Agregar un texto al archivo..." className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition-all outline-none text-sm" />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Date & Time */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">📅 Fecha</label>
                            <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} min={formatToLocalDateInput(new Date())} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition-all outline-none text-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">🕐 Hora</label>
                            <input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition-all outline-none text-sm" />
                        </div>
                    </div>

                    {/* Recurrence — Chip-style day picker */}
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">🔁 Repetición</label>
                        <div className="flex flex-wrap gap-2">
                            {RECURRENCE_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setRecurrence(recurrence === opt.value ? '' : opt.value)}
                                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                                    style={{
                                        background: recurrence === opt.value ? '#7c3aed' : '#f1f5f9',
                                        color: recurrence === opt.value ? 'white' : '#64748b',
                                        border: recurrence === opt.value ? '1px solid #7c3aed' : '1px solid #e2e8f0',
                                    }}
                                >
                                    {opt.value === '' ? '🚫' : '🔁'} {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Submit */}
                    <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="w-full py-4 rounded-xl font-semibold text-white transition-all flex items-center justify-center gap-2"
                        style={{
                            background: submitting ? '#a78bfa' : 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)',
                            cursor: submitting ? 'not-allowed' : 'pointer',
                            boxShadow: submitting ? 'none' : '0 4px 20px rgba(124, 58, 237, 0.3)',
                            transform: submitting ? 'none' : undefined,
                        }}
                    >
                        {submitting ? (
                            <><Loader2 size={18} className="animate-spin" /> Programando...</>
                        ) : (
                            <><Send size={18} /> Programar Mensaje</>
                        )}
                    </button>
                </div> {/* End Form Card (Left Column) */}

                {/* Right Column: High-Fidelity WhatsApp Preview Pane */}
                <div className="hidden lg:flex rounded-[24px] overflow-hidden flex-col sticky top-6 mt-1.5" style={{ height: '580px', border: '6px solid #f1f5f9', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.1)' }}>
                    {/* Header */}
                    <div className="px-4 py-3 flex items-center gap-3 relative z-10" style={{ background: '#075E54' }}>
                        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0 overflow-hidden shadow-inner">
                            {profilePicUrl ? (
                                <img
                                    src={profilePicUrl}
                                    alt="Avatar"
                                    className="w-full h-full object-cover"
                                    onError={() => setProfilePicUrl(null)}
                                />
                            ) : (
                                <span className="text-xl">{selectedChat ? (selectedChat.isGroup ? '👥' : '👤') : '👤'}</span>
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="text-white font-medium truncate text-[15px] leading-tight mb-0.5">
                                {selectedChat ? selectedChat.name : 'Destinatario'}
                            </h3>
                            <p className="text-white/80 text-[11px] truncate leading-tight">últ. vez hoy a las {scheduledTime || '00:00'}</p>
                        </div>
                        <div className="flex gap-4 text-white/90">
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                        </div>
                    </div>

                    {/* Chat Body */}
                    <div className="p-4 px-3 flex-1 flex flex-col overflow-y-auto w-full relative" style={{ background: '#E5DDD5', backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M54.627 0l.83.828-1.415 1.415L51.8 0h2.827zM5.373 0l-.83.828L5.96 2.243 8.2 0H5.374zM48.97 0l3.657 3.657-1.414 1.414L46.143 0h2.828zM11.03 0L7.372 3.657 8.787 5.07 13.857 0H11.03zm32.284 0L49.8 6.485 48.384 7.9l-7.9-7.9h2.83zM16.686 0L10.2 6.485 11.616 7.9l7.9-7.9h-2.83z\' fill=\'%23d4c9b0\' fill-opacity=\'.06\' fill-rule=\'evenodd\'/%3E%3C/svg%3E")' }}>

                        {/* Date badge */}
                        <div className="flex justify-center mb-6 mt-auto">
                            <span className="bg-[#E1F2FB] text-slate-600 text-[11px] font-medium px-3 py-1.5 rounded-[12px] uppercase tracking-wide" style={{ boxShadow: '0 1px 1.5px rgba(0,0,0,0.06)' }}>
                                {scheduledDate ? new Date(scheduledDate + 'T' + scheduledTime).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' }) : 'Hoy'}
                            </span>
                        </div>

                        {/* Message Bubble */}
                        <div className="relative max-w-[85%] ml-auto mb-2 group">
                            <div className="rounded-[12px] rounded-tr-none relative pt-1.5 pb-1 box-border min-w-[100px]" style={{ background: '#DCF8C6', boxShadow: '0 1px 1.5px rgba(0,0,0,0.12)' }}>
                                {/* Tail SVG */}
                                <svg viewBox="0 0 8 13" width="8" height="13" className="absolute top-0 -right-[8px]" style={{ color: '#DCF8C6' }}>
                                    <path opacity="1" fill="currentColor" d="M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z"></path>
                                </svg>

                                <div className="px-2">
                                    {/* Content based on type */}
                                    {messageType === 'file' && (
                                        <div className="flex items-center gap-3 p-2.5 rounded-[8px] mb-1.5 mt-1" style={{ background: 'rgba(0,0,0,0.04)' }}>
                                            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-[#1FAF38] shrink-0 text-white shadow-sm">
                                                📄
                                            </div>
                                            <div className="min-w-0 flex-1 mr-2">
                                                <p className="text-[14px] font-medium text-slate-800 leading-snug truncate">{file?.name || 'documento.pdf'}</p>
                                                <p className="text-[12px] text-slate-500 mt-0.5">{file ? (file.size / 1024).toFixed(1) : '15.2'} KB</p>
                                            </div>
                                        </div>
                                    )}

                                    {messageType === 'audio' && (
                                        <div className="flex items-center gap-3 p-2 min-w-[200px] mt-1">
                                            <div className="shrink-0 text-[#1FAF38]">
                                                <svg viewBox="0 0 35 35" width="30" height="30"><path fill="currentColor" d="M12.5 25V10l12 7.5-12 7.5z"></path></svg>
                                            </div>
                                            <div className="w-full flex items-center cursor-pointer">
                                                <div className="w-full h-1.5 bg-[#45c259]/30 rounded-full relative">
                                                    <div className="absolute left-0 w-1/3 h-full bg-[#1FAF38] rounded-full"></div>
                                                    <div className="w-3.5 h-3.5 bg-[#1FAF38] rounded-full absolute top-1/2 -translate-y-1/2 left-1/3 shadow border-2 border-white"></div>
                                                </div>
                                            </div>
                                            <div className="text-[11px] text-slate-600 font-medium shrink-0 ml-1">
                                                0:12
                                            </div>
                                        </div>
                                    )}

                                    {(messageType === 'text' || (messageType === 'file' && textContent)) && (
                                        <div className="text-[15px] text-[#111B21] whitespace-pre-wrap break-words mt-0.5 leading-[1.35] tracking-tight pb-[8px] pl-1 pr-6">
                                            {textContent || <span className="text-slate-400 italic">Tu mensaje...</span>}
                                        </div>
                                    )}
                                </div>

                                <div className="flex justify-end items-center gap-[3px] absolute bottom-1 right-2">
                                    <span className="text-[11px] text-slate-500 tracking-tight leading-none mt-px">
                                        {scheduledTime || '00:00'}
                                    </span>
                                    <svg viewBox="0 0 16 15" width="16" height="15" className="mb-px" style={{ color: '#53bdeb' }}>
                                        <path fill="currentColor" d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z"></path>
                                    </svg>
                                </div>
                            </div>
                        </div>

                    </div>
                    {/* Bottom Input mockup */}
                    <div className="px-3 py-2 bg-[#f0f2f5] flex items-center gap-3 z-10">
                        <div className="w-full bg-white rounded-full py-2 px-4 shadow-sm text-[13px] text-slate-400">
                            Escribe un mensaje
                        </div>
                        <div className="w-10 h-10 rounded-full bg-[#00A884] shrink-0 flex items-center justify-center text-white shadow-sm">
                            <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm1-11h-2v4H7v2h4v4h2v-4h4v-2h-4V9z"></path></svg>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════
// QUEUE PANEL — Timeline with countdown
// ══════════════════════════════════════════════════
function QueuePanel() {
    const [messages, setMessages] = useState<ScheduledMsg[]>([]);
    const [loading, setLoading] = useState(true);
    const [retrying, setRetrying] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'today' | 'recurring' | 'failed'>('all');
    const [, setTick] = useState(0);

    useEffect(() => {
        loadScheduled();
        const interval = setInterval(loadScheduled, 10000);
        return () => clearInterval(interval);
    }, []);

    // Countdown ticker — re-render every 30s
    useEffect(() => {
        const t = setInterval(() => setTick(n => n + 1), 30000);
        return () => clearInterval(t);
    }, []);

    const loadScheduled = async () => {
        try {
            const res = await api.get(`${API_URL}/scheduled`);
            setMessages(res.data);
        } catch {
            console.error('Error loading queue');
        } finally {
            setLoading(false);
        }
    };

    const cancelMessage = async (id: string) => {
        try {
            const res = await api.delete(`${API_URL}/scheduled/${id}`);
            if (res.data.success) setMessages(prev => prev.filter(m => m._id !== id));
        } catch { }
    };

    const retryMessage = async (id: string) => {
        setRetrying(id);
        try {
            const res = await api.post(`${API_URL}/retry/${id}`);
            if (res.data.success) {
                setMessages(prev => prev.filter(m => m._id !== id));
            } else {
                await loadScheduled();
            }
        } catch { } finally {
            setRetrying(null);
        }
    };

    const getCountdown = (dateStr: string) => {
        const diff = new Date(dateStr).getTime() - Date.now();
        if (diff <= 0) return 'Enviando...';
        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${mins}min`;
        return `${mins} min`;
    };

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        const now = new Date();
        const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
        const timeStr = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
        if (d.toDateString() === now.toDateString()) return `Hoy ${timeStr}`;
        if (d.toDateString() === tomorrow.toDateString()) return `Mañana ${timeStr}`;
        return `${d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} ${timeStr}`;
    };

    const getTypeIcon = (type: string) => {
        switch (type) { case 'text': return '💬'; case 'audio': return '🎵'; case 'file': return '📎'; default: return '📨'; }
    };

    const filtered = messages.filter(m => {
        if (filter === 'today') return new Date(m.scheduledAt).toDateString() === new Date().toDateString();
        if (filter === 'recurring') return m.isRecurring;
        if (filter === 'failed') return m.status === 'failed';
        return true;
    });

    const pendingCount = messages.filter(m => m.status === 'pending').length;
    const failedCount = messages.filter(m => m.status === 'failed').length;

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 size={32} className="animate-spin text-violet-500" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Stats bar */}
            <div className="flex items-center gap-4 mb-2">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(124, 58, 237, 0.06)' }}>
                    <Clock size={14} className="text-violet-500" />
                    <span className="text-sm font-medium text-violet-700">{pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}</span>
                </div>
                {failedCount > 0 && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(239, 68, 68, 0.06)' }}>
                        <XCircle size={14} className="text-red-500" />
                        <span className="text-sm font-medium text-red-600">{failedCount} fallido{failedCount !== 1 ? 's' : ''}</span>
                    </div>
                )}
            </div>

            {/* Filters */}
            <div className="flex gap-2">
                {([
                    { id: 'all' as const, label: 'Todos' },
                    { id: 'today' as const, label: 'Hoy' },
                    { id: 'recurring' as const, label: '🔁 Recurrentes' },
                    { id: 'failed' as const, label: '⚠️ Fallidos' },
                ]).map(f => (
                    <button
                        key={f.id}
                        onClick={() => setFilter(f.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                        style={{
                            background: filter === f.id ? '#7c3aed' : '#f1f5f9',
                            color: filter === f.id ? 'white' : '#64748b',
                        }}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {filtered.length === 0 ? (
                <div className="text-center py-16">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: '#f1f5f9' }}>
                        <span className="text-3xl">📭</span>
                    </div>
                    <p className="text-slate-500 font-medium">No hay mensajes en cola</p>
                    <p className="text-sm text-slate-400 mt-1">Programá un mensaje desde la pestaña "Programar"</p>
                </div>
            ) : (
                <div className="relative pl-6">
                    {/* Timeline line */}
                    <div className="absolute left-[11px] top-4 bottom-4 w-0.5 rounded-full" style={{ background: 'linear-gradient(180deg, #7c3aed, #e2e8f0)' }} />

                    <div className="space-y-4">
                        {filtered.map(msg => {
                            const isFailed = msg.status === 'failed';
                            const isRetryingThis = retrying === msg._id;

                            return (
                                <div key={msg._id} className="relative">
                                    {/* Timeline dot */}
                                    <div className="absolute -left-6 top-5 w-3 h-3 rounded-full border-2 border-white z-10"
                                        style={{ background: isFailed ? '#ef4444' : '#7c3aed', boxShadow: `0 0 8px ${isFailed ? 'rgba(239,68,68,0.4)' : 'rgba(124,58,237,0.4)'}` }}
                                    />

                                    <div className="rounded-xl p-4 transition-all hover:shadow-md" style={{ background: 'white', border: `1px solid ${isFailed ? 'rgba(239,68,68,0.2)' : 'rgba(0,0,0,0.06)'}` }}>
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isFailed ? 'bg-red-100' : 'bg-violet-100'}`}>
                                                    <span className="text-lg">{msg.isGroup ? '👥' : '👤'}</span>
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-medium text-slate-800 truncate">{msg.chatName}</p>
                                                        <span className="text-sm">{getTypeIcon(msg.messageType)}</span>
                                                        {msg.isRecurring && <span className="text-xs bg-violet-50 text-violet-600 px-2 py-0.5 rounded-full font-medium">🔁 {msg.recurringLabel}</span>}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <p className="text-sm text-violet-600 font-medium">{formatDate(msg.scheduledAt)}</p>
                                                        {!isFailed && (
                                                            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(124,58,237,0.08)', color: '#7c3aed' }}>
                                                                ⏱️ {getCountdown(msg.scheduledAt)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {isFailed ? (
                                                    <button onClick={() => retryMessage(msg._id)} disabled={isRetryingThis} className="text-xs py-1.5 px-3 rounded-lg font-semibold transition-all bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
                                                        {isRetryingThis ? '⏳...' : '🔄 Reintentar'}
                                                    </button>
                                                ) : (
                                                    <button onClick={() => retryMessage(msg._id)} disabled={isRetryingThis} className="text-xs py-1.5 px-3 rounded-lg font-semibold transition-all bg-green-500 text-white hover:bg-green-600 disabled:opacity-50">
                                                        {isRetryingThis ? '⏳...' : '▶️ Enviar'}
                                                    </button>
                                                )}
                                                <button onClick={() => cancelMessage(msg._id)} className="text-xs py-1.5 px-3 rounded-lg font-medium border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-all">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Preview */}
                                        {msg.textContent && (
                                            <p className="text-sm text-slate-500 mt-2 pl-[52px] line-clamp-2">{msg.textContent}</p>
                                        )}
                                        {msg.fileName && (
                                            <p className="text-sm text-slate-500 mt-2 pl-[52px]">{getTypeIcon(msg.messageType)} {msg.fileName}</p>
                                        )}
                                        {isFailed && msg.error && (
                                            <div className="mt-2 ml-[52px] p-2 rounded-lg text-xs text-red-500" style={{ background: 'rgba(239,68,68,0.05)' }}>
                                                ❌ {msg.error}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════
// DASHBOARD PANEL — Analytics + History
// ══════════════════════════════════════════════════
function DashboardPanel() {
    const [sentMessages, setSentMessages] = useState<SentMsg[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const res = await api.get(`${API_URL}/history`);
            setSentMessages(res.data);
        } catch {
            console.error('Error loading dashboard');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 size={32} className="animate-spin text-violet-500" />
            </div>
        );
    }

    // Compute stats
    const totalSent = sentMessages.filter(m => m.status === 'sent').length;
    const totalFailed = sentMessages.filter(m => m.status === 'failed').length;
    const total = totalSent + totalFailed;
    const successRate = total > 0 ? Math.round((totalSent / total) * 100) : 0;

    // Top contacts
    const contactCounts: Record<string, number> = {};
    sentMessages.forEach(m => {
        contactCounts[m.chatName] = (contactCounts[m.chatName] || 0) + 1;
    });
    const topContacts = Object.entries(contactCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

    // Week activity (last 7 days)
    const weekActivity = Array(7).fill(0);
    const now = new Date();
    sentMessages.forEach(m => {
        const d = new Date(m.sentAt || m.scheduledAt);
        const daysAgo = Math.floor((now.getTime() - d.getTime()) / 86400000);
        if (daysAgo >= 0 && daysAgo < 7) weekActivity[6 - daysAgo]++;
    });
    const maxActivity = Math.max(...weekActivity, 1);

    const dayLabels = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const weekDayLabels = Array(7).fill(0).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        return dayLabels[d.getDay()];
    });

    const recentErrors = sentMessages.filter(m => m.status === 'failed').slice(0, 5);

    const getTypeIcon = (type: string) => {
        switch (type) { case 'text': return '💬'; case 'audio': return '🎵'; case 'file': return '📎'; default: return '📨'; }
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return `${d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} ${d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
    };

    return (
        <div className="space-y-6">
            {/* Stat Cards */}
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: 'Enviados', value: totalSent, icon: <CheckCircle2 size={20} />, color: '#22c55e', bg: 'rgba(34, 197, 94, 0.08)' },
                    { label: 'Fallidos', value: totalFailed, icon: <XCircle size={20} />, color: '#ef4444', bg: 'rgba(239, 68, 68, 0.08)' },
                    { label: 'Tasa Éxito', value: `${successRate}%`, icon: <BarChart3 size={20} />, color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.08)' },
                ].map(stat => (
                    <div
                        key={stat.label}
                        className="rounded-2xl p-5 transition-all hover:shadow-md"
                        style={{ background: 'white', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.03)' }}
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: stat.bg, color: stat.color }}>
                                {stat.icon}
                            </div>
                        </div>
                        <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
                        <p className="text-sm text-slate-500 mt-0.5">{stat.label}</p>
                    </div>
                ))}
            </div>

            {/* Activity Chart */}
            <div className="rounded-2xl p-5" style={{ background: 'white', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.03)' }}>
                <h3 className="text-sm font-semibold text-slate-700 mb-4">📊 Actividad semanal</h3>
                <div className="flex items-end gap-3 h-32">
                    {weekActivity.map((count, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-xs font-medium text-slate-500">{count}</span>
                            <div
                                className="w-full rounded-t-lg transition-all duration-500"
                                style={{
                                    height: `${Math.max(8, (count / maxActivity) * 100)}%`,
                                    background: count > 0 ? 'linear-gradient(180deg, #7c3aed, #a855f7)' : '#e2e8f0',
                                    minHeight: 8,
                                }}
                            />
                            <span className="text-xs text-slate-400">{weekDayLabels[i]}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Top Contacts + Recent Errors side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Top Contacts */}
                <div className="rounded-2xl p-5" style={{ background: 'white', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.03)' }}>
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">👥 Top contactos</h3>
                    {topContacts.length === 0 ? (
                        <p className="text-sm text-slate-400 italic">Sin datos aún</p>
                    ) : (
                        <div className="space-y-2">
                            {topContacts.map((c, i) => (
                                <div key={c.name} className="flex items-center gap-3">
                                    <span className="text-sm font-bold w-5 text-center" style={{ color: '#7c3aed' }}>{i + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-slate-700 truncate">{c.name}</p>
                                    </div>
                                    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(124,58,237,0.08)', color: '#7c3aed' }}>
                                        {c.count} msg{c.count !== 1 ? 's' : ''}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Recent Errors */}
                <div className="rounded-2xl p-5" style={{ background: 'white', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.03)' }}>
                    <h3 className="text-sm font-semibold text-slate-700 mb-3">⚠️ Errores recientes</h3>
                    {recentErrors.length === 0 ? (
                        <div className="text-center py-4">
                            <span className="text-2xl">🎉</span>
                            <p className="text-sm text-slate-400 mt-1">Sin errores recientes</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {recentErrors.map(msg => (
                                <div key={msg._id} className="p-2 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)' }}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-medium text-slate-700">{msg.chatName}</span>
                                        <span className="text-slate-400">{formatDate(msg.scheduledAt)}</span>
                                    </div>
                                    <p className="text-red-500 truncate">{msg.error || 'Error desconocido'}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Full Sent History */}
            <div className="rounded-2xl p-5" style={{ background: 'white', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 12px rgba(0,0,0,0.03)' }}>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">📬 Historial de envíos</h3>
                {sentMessages.length === 0 ? (
                    <div className="text-center py-8">
                        <span className="text-3xl">📭</span>
                        <p className="text-sm text-slate-400 mt-2">No hay mensajes enviados aún</p>
                    </div>
                ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {sentMessages.map(msg => (
                            <div key={msg._id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.status === 'sent' ? 'bg-green-100' : 'bg-red-100'}`}>
                                    <span className="text-sm">{msg.status === 'sent' ? '✅' : '❌'}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium text-slate-700 truncate">{msg.chatName}</p>
                                        <span className="text-xs">{getTypeIcon(msg.messageType)}</span>
                                        {msg.isGroup && <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">Grupo</span>}
                                        {msg.isRecurring && <span className="text-[10px] bg-violet-50 text-violet-500 px-1.5 py-0.5 rounded-full">🔁</span>}
                                    </div>
                                    {msg.textContent && <p className="text-xs text-slate-400 truncate mt-0.5">{msg.textContent}</p>}
                                </div>
                                <span className="text-xs text-slate-400 shrink-0">{formatDate(msg.sentAt || msg.scheduledAt)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
