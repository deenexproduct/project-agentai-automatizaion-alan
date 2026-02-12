import { useState, useEffect, useRef, useCallback } from 'react'
import WhatsAppTab from './components/whatsapp/WhatsAppTab'
import ResumidorTab from './components/resumidor/ResumidorTab'

import { API_BASE } from './config';

const API_URL = `${API_BASE}/api`;

interface Transcription {
    id: number
    text: string
    source: string
    createdAt: string
}

function App() {
    const [activeTab, setActiveTab] = useState<'dictate' | 'transcribe' | 'history' | 'whatsapp' | 'resumidor'>('dictate')
    const [isRecording, setIsRecording] = useState(false)
    const [transcript, setTranscript] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [history, setHistory] = useState<Transcription[]>([])
    const [isLoadingHistory, setIsLoadingHistory] = useState(false)
    const [isDragging, setIsDragging] = useState(false)
    const [isTranscribing, setIsTranscribing] = useState(false)
    const [transcribeResult, setTranscribeResult] = useState('')
    const [searchTerm, setSearchTerm] = useState('')
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
            const res = await fetch(`${API_URL}/history`)
            if (!res.ok) throw new Error('Error loading history')
            const data = await res.json()
            setHistory(data)
        } catch (err) {
            console.error(err)
            setError('Error al cargar el historial')
        } finally {
            setIsLoadingHistory(false)
        }
    }

    const deleteHistoryItem = async (id: number) => {
        try {
            const res = await fetch(`${API_URL}/history/${id}`, {
                method: 'DELETE'
            })
            if (!res.ok) throw new Error('Error deleting item')
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

            const res = await fetch(`${API_URL}/transcribe/blob`, {
                method: 'POST',
                body: formData
            })

            if (!res.ok) throw new Error('Error transcribing')

            const data = await res.json()
            setTranscript(data.text || 'No se detectó texto')
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

            const res = await fetch(`${API_URL}/transcribe/file`, {
                method: 'POST',
                body: formData
            })

            if (!res.ok) throw new Error('Error transcribing')

            const data = await res.json()
            const texts = data.map((item: any) => item.text).join('\n\n')
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
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center">
                        <span className="text-white text-xl">🎙️</span>
                    </div>
                    <h1 className="text-xl font-semibold text-slate-800">VoiceCommand</h1>
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white border-b border-slate-200">
                <div className="flex gap-8 px-6">
                    <button
                        onClick={() => setActiveTab('dictate')}
                        className={`py-4 px-2 border-b-2 transition-colors ${activeTab === 'dictate'
                            ? 'border-violet-600 text-violet-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        🎙️ Dictar
                    </button>
                    <button
                        onClick={() => setActiveTab('transcribe')}
                        className={`py-4 px-2 border-b-2 transition-colors ${activeTab === 'transcribe'
                            ? 'border-violet-600 text-violet-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        📝 Transcripción
                    </button>
                    <button
                        onClick={() => setActiveTab('whatsapp')}
                        className={`py-4 px-2 border-b-2 transition-colors ${activeTab === 'whatsapp'
                            ? 'border-violet-600 text-violet-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        📱 WhatsApp
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`py-4 px-2 border-b-2 transition-colors ${activeTab === 'history'
                            ? 'border-violet-600 text-violet-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        📋 Historial
                    </button>
                    <button
                        onClick={() => setActiveTab('resumidor')}
                        className={`py-4 px-2 border-b-2 transition-colors ${activeTab === 'resumidor'
                            ? 'border-violet-600 text-violet-600'
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                    >
                        📊 Resumidor
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

                {activeTab === 'dictate' && (
                    <div className="text-center py-12">
                        {/* Mic Button */}
                        <button
                            onClick={toggleRecording}
                            className={`w-32 h-32 rounded-full flex items-center justify-center mx-auto transition-all duration-300 ${isRecording
                                ? 'bg-red-500 animate-pulse shadow-lg shadow-red-500/30'
                                : 'bg-violet-600 hover:bg-violet-700 shadow-lg shadow-violet-600/30'
                                }`}
                        >
                            <span className="text-5xl">{isRecording ? '⏹️' : '🎙️'}</span>
                        </button>

                        <p className="mt-6 text-slate-500">
                            {isRecording ? 'Grabando... Presiona para detener' : 'Presiona para dictar'}
                        </p>

                        {/* Transcript */}
                        {transcript && (
                            <div className="mt-8 p-6 bg-white rounded-xl shadow-sm border border-slate-200 text-left">
                                <p className="text-slate-800 whitespace-pre-wrap">{transcript}</p>
                                {transcript !== 'Transcribiendo...' && (
                                    <div className="mt-4 flex gap-2">
                                        <button
                                            onClick={copyToClipboard}
                                            className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700"
                                        >
                                            📋 Copiar
                                        </button>
                                        <button
                                            onClick={() => setTranscript('')}
                                            className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
                                        >
                                            🗑️ Limpiar
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        <p className="mt-8 text-sm text-slate-400">
                            También puedes usar <kbd className="px-2 py-1 bg-slate-200 rounded">Option+Space</kbd> desde cualquier app
                        </p>
                    </div>
                )}

                {activeTab === 'transcribe' && (
                    <div className="py-8">
                        {/* Drop Zone */}
                        <div
                            ref={dropZoneRef}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all ${isDragging
                                ? 'border-violet-500 bg-violet-50'
                                : 'border-slate-300 hover:border-violet-400 hover:bg-slate-50'
                                }`}
                        >
                            {isTranscribing ? (
                                <div className="flex flex-col items-center gap-4">
                                    <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center animate-pulse">
                                        <span className="text-3xl">⏳</span>
                                    </div>
                                    <p className="text-slate-600 font-medium">Transcribiendo audio...</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-4">
                                    <div className="w-20 h-20 rounded-full bg-violet-100 flex items-center justify-center">
                                        <span className="text-4xl">📎</span>
                                    </div>
                                    <div>
                                        <p className="text-slate-700 font-medium text-lg">
                                            Arrastra un audio aquí o <kbd className="px-2 py-1 bg-slate-200 rounded text-sm">Ctrl+V</kbd> para pegar
                                        </p>
                                        <p className="text-slate-500 mt-2">
                                            Soporta audios de WhatsApp (.opus, .ogg, .m4a, .mp3, .wav)
                                        </p>
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="audio/*,.opus,.ogg,.m4a"
                                        multiple
                                        onChange={handleFileSelect}
                                        className="hidden"
                                    />
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="mt-4 px-6 py-3 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-colors"
                                    >
                                        📂 Seleccionar archivos
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Result */}
                        {transcribeResult && (
                            <div className="mt-6 p-6 bg-white rounded-xl shadow-sm border border-slate-200">
                                <p className="text-slate-800 whitespace-pre-wrap">{transcribeResult}</p>
                                <div className="mt-4 flex gap-2">
                                    <button
                                        onClick={copyTranscribeResult}
                                        className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700"
                                    >
                                        📋 Copiar
                                    </button>
                                    <button
                                        onClick={() => setTranscribeResult('')}
                                        className="px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300"
                                    >
                                        🗑️ Limpiar
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'history' && (
                    <div className="space-y-6">
                        {/* Search Bar */}
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="🔍 Buscar en el historial..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition-all outline-none"
                            />
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                                🔍
                            </div>
                        </div>

                        {isLoadingHistory ? (
                            <div className="text-center py-12 text-slate-500">Cargando...</div>
                        ) : filteredHistory.length === 0 ? (
                            <div className="text-center py-12 text-slate-500">
                                {searchTerm ? 'No se encontraron resultados' : 'No hay transcripciones aún'}
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {filteredHistory.map((item) => (
                                    <div key={item.id} className="group bg-white rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-all overflow-hidden">
                                        {/* Card Header */}
                                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <span title={item.source === 'dictation' ? 'Dictado' : 'Archivo'} className="text-lg">
                                                    {item.source === 'dictation' ? '🎙️' : '📁'}
                                                </span>
                                                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                                                    {new Date(item.createdAt).toLocaleDateString()} • {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(item.text)
                                                        // Optional: Show toast or feedback
                                                    }}
                                                    className="p-1.5 text-slate-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                                                    title="Copiar"
                                                >
                                                    📋
                                                </button>
                                                <button
                                                    onClick={() => deleteHistoryItem(item.id)}
                                                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Eliminar"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </div>

                                        {/* Card Body */}
                                        <div className="p-4">
                                            <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                                                {item.text}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'whatsapp' && (
                    <WhatsAppTab />
                )}

                {activeTab === 'resumidor' && (
                    <ResumidorTab />
                )}
            </div>

            {/* Footer */}
            {/* Footer Removed */}
        </div>
    )
}

export default App
