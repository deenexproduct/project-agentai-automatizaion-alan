import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Loader2, UploadCloud, Copy, Trash2, Clock, CheckCircle2, FileAudio, Play } from 'lucide-react';
import api from '../../lib/axios';
import { useAuth } from '../../contexts/AuthContext';

// ── Types ────────────────────────────────────────────────────

interface Transcription {
    id: number;
    text: string;
    source: string;
    createdAt: string;
}

type TabMode = 'dictate' | 'upload' | 'history';

// ── Component ────────────────────────────────────────────────

export default function VoiceCommandPage() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<TabMode>('dictate');

    // Recording state
    const [isRecording, setIsRecording] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [copiedStates, setCopiedStates] = useState<Record<string, boolean>>({});

    // Upload state
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    // History state
    const [history, setHistory] = useState<Transcription[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const dropZoneRef = useRef<HTMLDivElement | null>(null);

    // ── Load History ───────────────────────────────────────────

    useEffect(() => {
        if (activeTab === 'history') {
            loadHistory();
        }
    }, [activeTab]);

    const loadHistory = async () => {
        setIsLoadingHistory(true);
        setError(null);
        try {
            const res = await api.get('/history');
            setHistory(res.data);
        } catch (err) {
            console.error(err);
            setError('Error al cargar el historial');
        } finally {
            setIsLoadingHistory(false);
        }
    };

    const deleteHistoryItem = async (id: number) => {
        try {
            await api.delete(`/history/${id}`);
            setHistory(prev => prev.filter(item => item.id !== id));
        } catch (err) {
            console.error(err);
            setError('Error al eliminar el item');
        }
    };

    // ── Recording Logic ────────────────────────────────────────

    const toggleRecording = async () => {
        if (isRecording) {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
            }
            setIsRecording(false);
        } else {
            setTranscript('');
            setError(null);
            chunksRef.current = [];

            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
                mediaRecorderRef.current = mediaRecorder;

                mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) chunksRef.current.push(e.data);
                };

                mediaRecorder.onstop = async () => {
                    stream.getTracks().forEach(track => track.stop());
                    if (chunksRef.current.length > 0) {
                        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
                        await transcribeAudio(audioBlob);
                    }
                };

                mediaRecorder.start();
                setIsRecording(true);
            } catch (err: any) {
                console.error('Error starting recording:', err);
                setError('Error al acceder al micrófono. Por favor permite el acceso en tu navegador.');
            }
        }
    };

    const transcribeAudio = async (audioBlob: Blob) => {
        setError(null);
        setTranscript('Transcribiendo audio avanzado...');
        setIsTranscribing(true);

        try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');
            const res = await api.post('/transcribe/blob', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setTranscript(res.data.text || 'No se detectó texto en el audio.');
        } catch (err) {
            console.error('Transcription error:', err);
            setError('Error al transcribir. Intenta de nuevo.');
            setTranscript('');
        } finally {
            setIsTranscribing(false);
        }
    };

    // ── File Upload Logic ──────────────────────────────────────

    const transcribeFiles = useCallback(async (files: File[]) => {
        const audioFiles = files.filter(f =>
            f.type.startsWith('audio/') ||
            /\.(opus|ogg|m4a|mp3|wav|webm)$/i.test(f.name)
        );

        if (audioFiles.length === 0) {
            setError('Solo se permiten archivos de audio válidos (.opus, .m4a, .mp3, .wav)');
            return;
        }

        setIsTranscribing(true);
        setTranscript('');
        setError(null);
        setActiveTab('dictate'); // Switch to dictate view to show result

        try {
            const formData = new FormData();
            audioFiles.forEach(file => formData.append('files', file));

            const res = await api.post('/transcribe/file', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            const texts = res.data.map((item: any) => item.text).join('\n\n');
            setTranscript(texts || 'No se detectó texto en los archivos subidos.');
        } catch (err) {
            console.error('Transcription error:', err);
            setError('Error al procesar el archivo. ¿El archivo es muy pesado?');
        } finally {
            setIsTranscribing(false);
        }
    }, []);

    // Drag events
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };
    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) transcribeFiles(files);
    };
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) transcribeFiles(files);
    };

    // Global Paste Listener (Ctrl+V)
    useEffect(() => {
        const handlePaste = async (e: ClipboardEvent) => {
            if (activeTab === 'history') return;
            const items = e.clipboardData?.items;
            if (!items) return;
            const files: File[] = [];
            for (let i = 0; i < items.length; i++) {
                if (items[i].kind === 'file') {
                    const file = items[i].getAsFile();
                    if (file) files.push(file);
                }
            }
            if (files.length > 0) {
                e.preventDefault();
                transcribeFiles(files);
            }
        };
        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [activeTab, transcribeFiles]);

    // ── Utilities ──────────────────────────────────────────────

    const handleCopy = (text: string, id: string) => {
        if (!text || text.includes('Transcribiendo')) return;
        navigator.clipboard.writeText(text);
        setCopiedStates(prev => ({ ...prev, [id]: true }));
        setTimeout(() => {
            setCopiedStates(prev => ({ ...prev, [id]: false }));
        }, 2000);
    };

    const filteredHistory = history.filter(item =>
        item.text.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // ── Render Helpers ─────────────────────────────────────────

    const renderFloatingTabs = () => (
        <div className="flex justify-center mb-8 relative z-10 w-full animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="relative flex bg-white/70 backdrop-blur-xl p-1.5 rounded-full border border-white/40 shadow-[0_8px_32px_rgba(124,58,237,0.08)]">
                {/* Active Indicator Backdrop */}
                <div
                    className="absolute top-1.5 bottom-1.5 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 transition-all duration-300 ease-out shadow-md"
                    style={{
                        width: 'calc(33.33% - 4px)',
                        left: activeTab === 'dictate' ? '6px' : activeTab === 'upload' ? 'calc(33.33% + 2px)' : 'calc(66.66% - 2px)'
                    }}
                />

                <button
                    onClick={() => setActiveTab('dictate')}
                    className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 md:gap-2 py-2.5 px-3 md:px-6 rounded-full text-xs md:text-sm font-semibold transition-colors duration-300 ${activeTab === 'dictate' ? 'text-white' : 'text-slate-500 hover:text-slate-800'}`}
                >
                    <Mic size={16} /> Grabar
                </button>
                <button
                    onClick={() => setActiveTab('upload')}
                    className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 md:gap-2 py-2.5 px-3 md:px-6 rounded-full text-xs md:text-sm font-semibold transition-colors duration-300 ${activeTab === 'upload' ? 'text-white' : 'text-slate-500 hover:text-slate-800'}`}
                >
                    <UploadCloud size={16} /> Subir
                </button>
                <button
                    onClick={() => setActiveTab('history')}
                    className={`relative z-10 flex-1 flex items-center justify-center gap-1.5 md:gap-2 py-2.5 px-3 md:px-6 rounded-full text-xs md:text-sm font-semibold transition-colors duration-300 ${activeTab === 'history' ? 'text-white' : 'text-slate-500 hover:text-slate-800'}`}
                >
                    <Clock size={16} /> Historial
                </button>
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-transparent overflow-hidden relative pb-20 md:pb-0">

            {/* Ambient Background Glows */}
            <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-violet-400/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
            <div className="absolute bottom-0 left-0 w-[40rem] h-[40rem] bg-fuchsia-400/10 rounded-full blur-[100px] translate-y-1/3 -translate-x-1/3 pointer-events-none"></div>

            {/* Error Toast */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
                {error && (
                    <div className="p-4 rounded-2xl bg-red-50/90 backdrop-blur-md border border-red-200/50 text-red-600 text-sm font-medium shadow-xl shadow-red-500/10 flex justify-between items-center animate-in slide-in-from-top-6 fade-in duration-300">
                        {error}
                        <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 p-1 bg-white/50 rounded-lg transition-colors">✕</button>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto w-full px-4 sm:px-8 py-8 relative z-10">
                <div className="max-w-3xl mx-auto">

                    {renderFloatingTabs()}

                    {/* --- DICTATE VIEW --- */}
                    {activeTab === 'dictate' && (
                        <div className="flex flex-col items-center justify-center pt-10 pb-16 animate-in fade-in zoom-in-95 duration-500">

                            {/* Recording Widget */}
                            <div className="relative group perspective-1000">
                                {/* Animated Outer Rings */}
                                {isRecording && (
                                    <>
                                        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-rose-400 to-fuchsia-500 opacity-20 animate-ping border border-rose-300 mix-blend-multiply" style={{ animationDuration: '2.5s', transform: 'scale(1.5)' }}></div>
                                        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-fuchsia-400 to-violet-500 opacity-20 animate-ping border border-violet-300 mix-blend-multiply" style={{ animationDuration: '2.5s', animationDelay: '1.25s', transform: 'scale(1.2)' }}></div>
                                    </>
                                )}

                                {/* Main Orb Button */}
                                <button
                                    onClick={toggleRecording}
                                    disabled={isTranscribing}
                                    className={`relative w-48 h-48 rounded-full flex flex-col items-center justify-center transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] overflow-hidden focus:outline-none focus:ring-4 focus:ring-violet-200/50 focus:ring-offset-4 focus:ring-offset-transparent
                                        ${isTranscribing ? 'bg-white/50 backdrop-blur-sm border border-slate-200/50 cursor-not-allowed scale-95 opacity-80' :
                                            isRecording ? 'bg-gradient-to-br from-rose-50 to-rose-100/50 border border-rose-200 shadow-[0_0_60px_rgba(244,63,94,0.3)] scale-105' :
                                                'bg-white/80 backdrop-blur-xl border border-white/60 hover:bg-white shadow-[0_20px_40px_rgba(124,58,237,0.05)] hover:shadow-[0_20px_60px_rgba(124,58,237,0.15)] hover:scale-105 hover:border-violet-100'
                                        }`}
                                >
                                    {isTranscribing ? (
                                        <div className="flex flex-col items-center gap-3">
                                            <Loader2 className="w-12 h-12 text-violet-400 animate-spin" strokeWidth={2} />
                                            <span className="text-xs font-bold text-violet-600 uppercase tracking-widest animate-pulse">Procesando</span>
                                        </div>
                                    ) : (
                                        <Mic className={`w-16 h-16 transition-all duration-500 ${isRecording ? 'text-rose-500 scale-110' : 'text-violet-600'}`} strokeWidth={1.5} />
                                    )}
                                </button>
                            </div>

                            <div className="mt-10 text-center space-y-2 max-w-sm">
                                <h3 className={`text-xl font-bold transition-colors duration-300 ${isRecording ? 'text-rose-500' : 'text-slate-800'}`}>
                                    {isTranscribing ? 'Transcripción en progreso' : isRecording ? 'Grabando Audio...' : 'Toca para Iniciar'}
                                </h3>
                                <p className="text-slate-500 text-sm font-medium">
                                    {isTranscribing ? 'Nuestra IA está decodificando tu mensaje en texto limpio y perfecto.' :
                                        isRecording ? 'Habla claramente. Haz clic en el orbe para detener.' :
                                            'Dictado libre sin límites de longitud con precisión experta.'}
                                </p>
                            </div>

                            {/* Transcript Result Box - Premium Style */}
                            {transcript && (
                                <div className="mt-12 w-full bg-white/60 backdrop-blur-2xl rounded-[2rem] p-8 shadow-[0_8px_32px_rgba(0,0,0,0.04)] border border-white/80 animate-in slide-in-from-bottom-8 fade-in duration-700 ease-out">
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                                                <CheckCircle2 className="text-white w-5 h-5" />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-slate-800 text-base">Resultado Formateado</h4>
                                                <p className="text-xs text-slate-500 tracking-wide uppercase">Generado por IA</p>
                                            </div>
                                        </div>
                                        {!isTranscribing && (
                                            <button
                                                onClick={() => handleCopy(transcript, 'main')}
                                                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-semibold text-sm border shadow-sm
                                                    ${copiedStates['main']
                                                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200 shadow-emerald-500/10'
                                                        : 'bg-white text-slate-600 border-slate-200/60 hover:border-violet-200 hover:text-violet-600 hover:shadow-violet-500/10 hover:-translate-y-0.5'
                                                    }`}
                                            >
                                                {copiedStates['main'] ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                                                {copiedStates['main'] ? 'Copiado' : 'Copiar Texto'}
                                            </button>
                                        )}
                                    </div>
                                    <div className={`p-6 rounded-2xl bg-white/50 text-slate-700 text-lg leading-relaxed border border-white/60 min-h-[120px] whitespace-pre-wrap transition-opacity shadow-inner ${isTranscribing ? 'opacity-40 filter blur-sm' : 'opacity-100'}`}>
                                        {transcript}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- UPLOAD VIEW --- */}
                    {activeTab === 'upload' && (
                        <div className="pt-8 pb-16 animate-in fade-in slide-in-from-right-8 duration-500">
                            <div
                                ref={dropZoneRef}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                className={`relative rounded-[1.5rem] md:rounded-[2.5rem] p-8 md:p-20 text-center transition-all duration-500 ease-out overflow-hidden
                                    ${isDragging
                                        ? 'border-2 border-violet-400 bg-violet-50/50 shadow-[0_20px_60px_rgba(124,58,237,0.15)] scale-[1.02] backdrop-blur-xl'
                                        : 'border-2 border-dashed border-slate-300 bg-white/40 backdrop-blur-md hover:border-violet-300 hover:bg-white/60 hover:shadow-[0_20px_40px_rgba(0,0,0,0.03)]'
                                    }`
                                }
                            >
                                <div className="flex flex-col items-center gap-6 relative z-10">
                                    <div className={`w-24 h-24 rounded-3xl flex items-center justify-center transition-all duration-500 shadow-lg ${isDragging ? 'bg-gradient-to-br from-violet-500 to-fuchsia-600 shadow-violet-500/30 scale-110 mb-2' : 'bg-white shadow-[0_8px_24px_rgba(0,0,0,0.06)]'}`}>
                                        <UploadCloud className={`w-10 h-10 transition-colors duration-500 ${isDragging ? 'text-white' : 'text-violet-500'}`} strokeWidth={isDragging ? 2 : 1.5} />
                                    </div>

                                    <div>
                                        <h3 className="text-2xl font-black text-slate-800 tracking-tight mb-2">Sube o Arrasta tus Archivos</h3>
                                        <p className="text-slate-500">O usa <kbd className="px-2.5 py-1 bg-white shadow-sm text-slate-600 rounded-lg text-xs font-bold border border-slate-200/60 mx-1">Ctrl+V</kbd> para archivos en portapapeles</p>
                                    </div>

                                    <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                                        {['MP3', 'M4A', 'WAV', 'OGG'].map(ext => (
                                            <span key={ext} className="px-3 py-1.5 text-xs font-bold text-slate-500 bg-white/80 backdrop-blur-sm border border-slate-200/50 rounded-lg shadow-sm">{ext}</span>
                                        ))}
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
                                        className="mt-6 px-10 py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-violet-600 hover:shadow-[0_8px_30px_rgba(124,58,237,0.3)] transition-all duration-300 hover:-translate-y-1"
                                    >
                                        Explorar Archivos
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- HISTORY VIEW --- */}
                    {activeTab === 'history' && (
                        <div className="pb-16 pt-4 animate-in fade-in slide-in-from-right-8 duration-500">

                            {/* Search Glass Input */}
                            <div className="relative mb-8 group">
                                <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
                                    <Clock className="w-5 h-5 text-slate-400 group-focus-within:text-violet-500 transition-colors" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Buscar transcripciones..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full bg-white/70 backdrop-blur-xl border border-white focus:border-violet-300 pl-14 pr-6 py-4 rounded-[1.5rem] shadow-[0_8px_30px_rgba(0,0,0,0.04)] focus:shadow-[0_8px_30px_rgba(124,58,237,0.1)] outline-none text-slate-700 font-medium transition-all"
                                />
                            </div>

                            {isLoadingHistory ? (
                                <div className="flex flex-col items-center justify-center py-20">
                                    <div className="relative w-16 h-16 mb-4">
                                        <div className="absolute inset-0 rounded-full border-4 border-violet-100"></div>
                                        <div className="absolute inset-0 rounded-full border-4 border-violet-500 border-t-transparent animate-spin"></div>
                                    </div>
                                    <p className="text-slate-500 font-medium">Recuperando registros...</p>
                                </div>
                            ) : filteredHistory.length === 0 ? (
                                <div className="text-center py-24 bg-white/40 backdrop-blur-sm rounded-[2.5rem] border-2 border-slate-200/50 border-dashed">
                                    <div className="w-20 h-20 bg-white shadow-sm rounded-3xl flex items-center justify-center mx-auto mb-6 rotate-3">
                                        <FileAudio className="w-8 h-8 text-slate-300" />
                                    </div>
                                    <h4 className="text-xl font-bold text-slate-800 mb-2">Sin registros aún</h4>
                                    <p className="text-slate-500 max-w-sm mx-auto">Cuando transcribas audios o grabaciones, quedarán guardados aquí automáticamente.</p>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    {filteredHistory.map((item, i) => (
                                        <div
                                            key={item.id}
                                            className="group relative bg-white/60 backdrop-blur-lg rounded-[1.5rem] overflow-hidden border border-white hover:border-violet-200 shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_12px_40px_rgba(124,58,237,0.08)] transition-all duration-300 hover:-translate-y-1"
                                            style={{ animationDelay: `${i * 30}ms` }}
                                        >
                                            {/* Decorative side accent */}
                                            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-violet-400 to-fuchsia-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                                            <div className="p-6 flex flex-col sm:flex-row gap-5">
                                                <div className="shrink-0">
                                                    <div className="w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center border border-slate-100 text-violet-500 group-hover:bg-violet-500 group-hover:text-white transition-colors duration-300">
                                                        {item.source === 'blob' ? <Mic size={20} /> : <FileAudio size={20} />}
                                                    </div>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-3">
                                                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 text-xs font-bold tracking-widest uppercase group-hover:bg-violet-50 group-hover:text-violet-600 transition-colors">
                                                            {new Date(item.createdAt).toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })}
                                                        </span>
                                                        <div className="flex items-center gap-2 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => handleCopy(item.text, `hist-${item.id}`)}
                                                                className={`flex items-center justify-center w-8 h-8 rounded-xl transition-colors
                                                                    ${copiedStates[`hist-${item.id}`] ? 'bg-emerald-100 text-emerald-600' : 'bg-white border border-slate-200 text-slate-500 hover:text-violet-600 hover:border-violet-200'}`}
                                                                title="Copiar transcripción"
                                                            >
                                                                {copiedStates[`hist-${item.id}`] ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                                                            </button>
                                                            <button
                                                                onClick={() => deleteHistoryItem(item.id)}
                                                                className="flex items-center justify-center w-8 h-8 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 transition-colors"
                                                                title="Eliminar registro"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <p className="text-slate-700 text-[15px] leading-relaxed whitespace-pre-wrap">{item.text}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
