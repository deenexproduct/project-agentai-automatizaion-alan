import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ResumidorTab from './components/resumidor/ResumidorTab'
import TeamPermissions from './components/team/TeamPermissions'

import { API_BASE } from './config';
import api from './lib/axios';
import { useAuth } from './contexts/AuthContext';
import { LogOut, User as UserIcon, Calendar as CalendarIcon } from 'lucide-react';
import CalendarPage from './pages/calendar';

const API_URL = `${API_BASE}/api`;

interface Transcription {
    id: number
    text: string
    source: string
    createdAt: string
}

function App() {
    const navigate = useNavigate()
    const { tab } = useParams<{ tab: string }>()
    const activeTab = tab || 'history'
    // Recording state
    const [isRecording, setIsRecording] = useState(false)
    const [transcript, setTranscript] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [history, setHistory] = useState<Transcription[]>([])
    const [isLoadingHistory, setIsLoadingHistory] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [isTranscribing, setIsTranscribing] = useState(false)
    const [transcribeResult, setTranscribeResult] = useState('')
    const [searchTerm, setSearchTerm] = useState('')

    const { user, logout } = useAuth()

    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<Blob[]>([])
    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const dropZoneRef = useRef<HTMLDivElement | null>(null)

    // Load history
    useEffect(() => {
        if (activeTab === 'history') {
            loadHistory()
        }
    }, [activeTab])

    const loadHistory = async () => {
        setIsLoadingHistory(true)
        setError(null)
        try {
            const res = await api.get('/history')
            setHistory(res.data)
        } catch (err) {
            console.error(err)
            setError('Error al cargar el historial')
        } finally {
            setIsLoadingHistory(false)
        }
    }

    const deleteHistoryItem = async (id: number) => {
        try {
            await api.delete(`/history/${id}`)
            setHistory(prev => prev.filter(item => item.id !== id))
        } catch (err) {
            console.error(err)
            setError('Error al eliminar el item')
        }
    }

    const filteredHistory = history.filter(item =>
        item.text.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const toggleRecording = async () => {
        if (isRecording) {
            // Stop recording
            if (mediaRecorderRef.current) {
                mediaRecorderRef.current.stop()
            }
            setIsRecording(false)
        } else {
            // Start recording
            setTranscript('')
            setError(null)
            chunksRef.current = []

            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
                const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
                mediaRecorderRef.current = mediaRecorder

                mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) {
                        chunksRef.current.push(e.data)
                    }
                }

                mediaRecorder.onstop = async () => {
                    stream.getTracks().forEach(track => track.stop())

                    if (chunksRef.current.length > 0) {
                        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })
                        await transcribeAudio(audioBlob)
                    }
                }

                mediaRecorder.start()
                setIsRecording(true)
                console.log('Recording started')
            } catch (err: any) {
                console.error('Error starting recording:', err)
                setError('Error al acceder al micrófono')
            }
        }
    }

    const transcribeAudio = async (audioBlob: Blob) => {
        setError(null)
        setTranscript('Transcribiendo...')

        try {
            const formData = new FormData()
            formData.append('audio', audioBlob, 'recording.webm')

            const res = await api.post('/transcribe/blob', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })

            setTranscript(res.data.text || 'No se detectó texto')
        } catch (err) {
            console.error('Transcription error:', err)
            setError('Error al transcribir. Intenta de nuevo.')
            setTranscript('')
        }
    }

    const copyToClipboard = () => {
        if (transcript && transcript !== 'Transcribiendo...') {
            navigator.clipboard.writeText(transcript)
        }
    }

    const copyTranscribeResult = () => {
        if (transcribeResult) {
            navigator.clipboard.writeText(transcribeResult)
        }
    }

    // Transcribe files (for paste/drop)
    const transcribeFiles = useCallback(async (files: File[]) => {
        const audioFiles = files.filter(f =>
            f.type.startsWith('audio/') ||
            f.name.endsWith('.opus') ||
            f.name.endsWith('.ogg') ||
            f.name.endsWith('.m4a') ||
            f.name.endsWith('.mp3') ||
            f.name.endsWith('.wav') ||
            f.name.endsWith('.webm')
        )

        if (audioFiles.length === 0) {
            setError('No se encontraron archivos de audio válidos')
            return
        }

        setIsTranscribing(true)
        setTranscribeResult('')
        setError(null)

        try {
            const formData = new FormData()
            audioFiles.forEach(file => {
                formData.append('files', file)
            })

            const res = await api.post('/transcribe/file', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })

            const texts = res.data.map((item: any) => item.text).join('\n\n')
            setTranscribeResult(texts || 'No se detectó texto')
        } catch (err) {
            console.error('Transcription error:', err)
            setError('Error al transcribir. Intenta de nuevo.')
        } finally {
            setIsTranscribing(false)
        }
    }, [])

    // Handle paste event
    useEffect(() => {
        const handlePaste = async (e: ClipboardEvent) => {
            if (activeTab !== 'transcribe') return

            const items = e.clipboardData?.items
            if (!items) return

            const files: File[] = []
            for (let i = 0; i < items.length; i++) {
                const item = items[i]
                if (item.kind === 'file') {
                    const file = item.getAsFile()
                    if (file) files.push(file)
                }
            }

            if (files.length > 0) {
                e.preventDefault()
                transcribeFiles(files)
            }
        }

        document.addEventListener('paste', handlePaste)
        return () => document.removeEventListener('paste', handlePaste)
    }, [activeTab, transcribeFiles])

    // Handle drag events
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        setIsDragging(false)

        const files = Array.from(e.dataTransfer.files)
        if (files.length > 0) {
            transcribeFiles(files)
        }
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        if (files.length > 0) {
            transcribeFiles(files)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center">
                            <span className="text-white text-xl">🎙️</span>
                        </div>
                        <h1 className="text-xl font-semibold text-slate-800">VoiceCommand</h1>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
                            <div className="w-6 h-6 bg-violet-100 rounded-full flex items-center justify-center">
                                <UserIcon className="w-4 h-4 text-violet-600" />
                            </div>
                            <span className="text-sm font-medium text-slate-700">{user?.email}</span>
                        </div>
                        <button
                            onClick={logout}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors group"
                            title="Cerrar sesión"
                        >
                            <LogOut className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white border-b border-slate-200">
                <div className="flex gap-8 px-6">
                    <button
                        onClick={() => navigate('/history')}
                        className={`py-4 px-2 border-b-2 transition-colors ${activeTab === 'history'
                            ? 'border-violet-600 text-violet-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        📋 Historial
                    </button>
                    <button
                        onClick={() => navigate('/resumidor')}
                        className={`py-4 px-2 border-b-2 transition-colors ${activeTab === 'resumidor'
                            ? 'border-violet-600 text-violet-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        📊 Resumidor
                    </button>

                    <button
                        onClick={() => navigate('/team')}
                        className={`py-4 px-2 border-b-2 transition-colors ${activeTab === 'team'
                            ? 'border-violet-600 text-violet-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        🛡️ Equipo
                    </button>

                    <button
                        onClick={() => navigate('/linkedin')}
                        className="py-4 px-2 border-b-2 transition-colors border-transparent text-slate-500 hover:text-violet-600 hover:border-violet-300"
                    >
                        🔗 LinkedIn
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-2xl mx-auto p-6">
                {error && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
                        {error}
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-500">
                        <div className="w-20 h-20 bg-violet-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                            <span className="text-4xl">🎙️</span>
                        </div>
                        <h2 className="text-3xl font-bold text-slate-800 mb-3 tracking-tight">VoiceCommand Premium</h2>
                        <p className="text-slate-500 mb-8 max-w-sm mx-auto text-lg leading-relaxed">
                            El Transcriptor Inteligente se ha mudado de casa. Ahora vive dentro de tu entorno principal.
                        </p>
                        <button
                            onClick={() => navigate('/linkedin/voice')}
                            className="bg-slate-800 hover:bg-violet-600 text-white font-semibold px-8 py-3.5 rounded-xl transition-all duration-300 shadow-xl shadow-slate-200 hover:shadow-violet-500/30 hover:-translate-y-0.5"
                        >
                            Abrir Herramienta
                        </button>
                    </div>
                )}

                {/* Fallbacks */}
                {['dictate', 'transcribe', 'whatsapp', 'resumidor'].includes(activeTab) && (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <span className="text-3xl">👋</span>
                        </div>
                        <h2 className="text-xl font-bold text-slate-800 mb-2">Herramienta Migrada</h2>
                        <p className="text-slate-500 mb-6">
                            Esta función ahora es parte del Dashboard Central.
                        </p>
                        <button
                            onClick={() => navigate('/linkedin')}
                            className="bg-white border border-slate-200 text-slate-700 font-medium px-6 py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
                        >
                            Ir al Panel
                        </button>
                    </div>
                )}


                {activeTab === 'resumidor' && (
                    <ResumidorTab />
                )}

                {activeTab === 'team' && (
                    <TeamPermissions />
                )}
            </div>

            {/* Footer */}
            {/* Footer Removed */}
        </div>
    )
}

export default App
