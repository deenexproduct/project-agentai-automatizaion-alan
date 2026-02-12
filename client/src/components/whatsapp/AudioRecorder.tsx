import { useState, useRef, useEffect } from 'react'

interface Props {
    onAudioReady: (file: File) => void
}

export default function AudioRecorder({ onAudioReady }: Props) {
    const [state, setState] = useState<'idle' | 'recording' | 'recorded'>('idle')
    const [seconds, setSeconds] = useState(0)
    const [audioUrl, setAudioUrl] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<Blob[]>([])
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const audioBlobRef = useRef<Blob | null>(null)

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopTimer()
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop())
            }
            if (audioUrl) URL.revokeObjectURL(audioUrl)
        }
    }, [audioUrl])

    const startTimer = () => {
        setSeconds(0)
        timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
    }

    const stopTimer = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current)
            timerRef.current = null
        }
    }

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60).toString().padStart(2, '0')
        const s = (secs % 60).toString().padStart(2, '0')
        return `${m}:${s}`
    }

    const startRecording = async () => {
        setError(null)
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            streamRef.current = stream

            // Pick best supported format
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
                    ? 'audio/ogg;codecs=opus'
                    : 'audio/webm'

            const recorder = new MediaRecorder(stream, { mimeType })
            mediaRecorderRef.current = recorder
            chunksRef.current = []

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data)
            }

            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: mimeType })
                audioBlobRef.current = blob
                const url = URL.createObjectURL(blob)
                setAudioUrl(url)
                setState('recorded')
                stopTimer()

                // Stop mic access
                stream.getTracks().forEach(t => t.stop())
            }

            recorder.start(250) // collect data every 250ms
            setState('recording')
            startTimer()
        } catch (err: any) {
            if (err.name === 'NotAllowedError') {
                setError('Permiso de micrófono denegado. Habilitá el acceso en tu navegador.')
            } else {
                setError('Error al acceder al micrófono: ' + err.message)
            }
        }
    }

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop()
        }
    }

    const discardRecording = () => {
        if (audioUrl) URL.revokeObjectURL(audioUrl)
        setAudioUrl(null)
        audioBlobRef.current = null
        setSeconds(0)
        setState('idle')
    }

    const useRecording = () => {
        if (!audioBlobRef.current) return

        const ext = audioBlobRef.current.type.includes('ogg') ? 'ogg' : 'webm'
        const file = new File(
            [audioBlobRef.current],
            `audio-${Date.now()}.${ext}`,
            { type: audioBlobRef.current.type }
        )
        onAudioReady(file)
    }

    // ── Idle State ──
    if (state === 'idle') {
        return (
            <div>
                {error && (
                    <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 flex items-center gap-2">
                        ⚠️ {error}
                    </div>
                )}
                <button
                    onClick={startRecording}
                    className="w-full py-8 border-2 border-dashed border-red-300 rounded-xl hover:border-red-400 hover:bg-red-50 transition-all group"
                >
                    <div className="text-center">
                        <div className="w-14 h-14 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform shadow-lg shadow-red-500/30">
                            <span className="text-2xl text-white">🎙️</span>
                        </div>
                        <p className="text-sm text-slate-600 font-medium">Toca para grabar audio</p>
                    </div>
                </button>
            </div>
        )
    }

    // ── Recording State ──
    if (state === 'recording') {
        return (
            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6">
                <div className="flex flex-col items-center gap-4">
                    {/* Animated waveform */}
                    <div className="flex items-center gap-1 h-10">
                        {Array.from({ length: 12 }).map((_, i) => (
                            <div
                                key={i}
                                className="w-1 bg-red-500 rounded-full"
                                style={{
                                    animation: `wave 0.8s ease-in-out infinite`,
                                    animationDelay: `${i * 0.08}s`,
                                    height: `${12 + Math.random() * 28}px`,
                                }}
                            />
                        ))}
                    </div>

                    {/* Timer */}
                    <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
                        <span className="text-2xl font-mono font-bold text-red-600">{formatTime(seconds)}</span>
                    </div>

                    {/* Stop button */}
                    <button
                        onClick={stopRecording}
                        className="px-8 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold transition-all shadow-lg shadow-red-500/30 flex items-center gap-2"
                    >
                        ⏹️ Detener
                    </button>
                </div>

                {/* CSS animation */}
                <style>{`
                    @keyframes wave {
                        0%, 100% { transform: scaleY(0.4); }
                        50% { transform: scaleY(1); }
                    }
                `}</style>
            </div>
        )
    }

    // ── Recorded State ──
    return (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-3">
            {/* Audio player */}
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-lg text-white">🎵</span>
                </div>
                <div className="flex-1">
                    <audio src={audioUrl!} controls className="w-full h-8" style={{ borderRadius: '8px' }} />
                </div>
            </div>

            {/* Duration */}
            <p className="text-xs text-slate-500 text-center">
                Duración: {formatTime(seconds)} · {audioBlobRef.current ? `${(audioBlobRef.current.size / 1024).toFixed(1)} KB` : ''}
            </p>

            {/* Action buttons */}
            <div className="flex gap-2">
                <button
                    onClick={discardRecording}
                    className="flex-1 py-2.5 px-4 rounded-xl border-2 border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-500 transition-all font-medium text-sm"
                >
                    🗑️ Descartar
                </button>
                <button
                    onClick={useRecording}
                    className="flex-1 py-2.5 px-4 rounded-xl bg-violet-600 text-white hover:bg-violet-700 transition-all font-semibold text-sm shadow-lg shadow-violet-600/20"
                >
                    ✅ Usar este audio
                </button>
            </div>
        </div>
    )
}
