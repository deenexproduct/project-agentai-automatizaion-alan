import { useState, useEffect, useRef, useCallback } from 'react';
import {
    getStatus,
    launchBrowser,
    startProspecting,
    pauseProspecting,
    resumeProspecting,
    stopProspecting,
    createProgressStream,
    type LinkedInStatus,
    type ProfileProgress,
    type ProgressData,
} from '../../services/linkedin.service';

type StepStatus = 'pending' | 'done' | 'skipped' | 'error';

const STEP_ICONS: Record<StepStatus, string> = {
    pending: '🕐',
    done: '✅',
    skipped: '⏭️',
    error: '❌',
};

// Message templates with variables
const MESSAGE_TEMPLATES = [
    {
        label: 'Simple',
        text: 'Hola {nombre}, me interesa conectar contigo.',
    },
    {
        label: 'Profesional',
        text: 'Hola {nombre}, veo que trabajas en {empresa}. Me gustaría conectar para explorar posibles sinergias entre nuestras empresas.',
    },
    {
        label: 'Por cargo',
        text: 'Hola {nombre}, como {cargo} en {empresa}, seguro entiendes los desafíos del sector {industria}. Me gustaría conectar y compartir ideas.',
    },
    {
        label: 'Personalizado',
        text: 'Hola {nombre}, vi tu perfil y me interesa tu experiencia en {empresa}. Me gustaría conectar y aprender más sobre tu trabajo en {industria}.',
    },
];

const AVAILABLE_VARIABLES = ['{nombre}', '{empresa}', '{cargo}', '{industria}', '{ubicacion}'];

export default function ProspectingPage() {
    // ── State ──────────────────────────────────
    const [status, setStatus] = useState<LinkedInStatus | null>(null);
    const [urlText, setUrlText] = useState('');
    const [sendNote, setSendNote] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [profiles, setProfiles] = useState<ProfileProgress[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [totalProfiles, setTotalProfiles] = useState(0);
    const [launching, setLaunching] = useState(false);
    const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

    const progressRef = useRef<HTMLDivElement>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    // ── URL Parsing ────────────────────────────
    const parsedUrls = urlText
        .split('\n')
        .map(u => u.trim())
        .filter(u => u.length > 0 && (u.includes('linkedin.com/in/') || u.includes('linkedin.com/pub/')));

    // ── Fetch Status ───────────────────────────
    const fetchStatus = useCallback(async () => {
        try {
            const s = await getStatus();
            setStatus(s);
            setIsRunning(s.isRunning);
            setIsPaused(s.isPaused);
        } catch {
            // Server not reachable
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 5000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    // ── SSE Connection ─────────────────────────
    useEffect(() => {
        if (!isRunning && !isPaused) {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
            return;
        }

        const es = createProgressStream(
            (data: ProgressData) => {
                if (data.type === 'complete') {
                    setIsRunning(false);
                    setIsPaused(false);
                    showNotification('success', `✅ Completado: ${data.profiles?.filter(p => p.status === 'done').length || 0} perfiles procesados`);
                    return;
                }
                if (data.type === 'captcha') {
                    showNotification('warning', '⚠️ Captcha detectado — resolverlo manualmente en el browser');
                    return;
                }
                if (data.type === 'session-expired') {
                    showNotification('error', '🔒 Sesión expirada — logueate de nuevo en el browser');
                    return;
                }
                if (data.type === 'paused') {
                    setIsPaused(true);
                    return;
                }
                if (data.type === 'resumed') {
                    setIsPaused(false);
                    return;
                }
                if (data.profiles) {
                    setProfiles(data.profiles);
                    setCurrentIndex(data.current);
                    setTotalProfiles(data.total);
                }
            },
            () => {
                // SSE error — auto-reconnects
            }
        );

        eventSourceRef.current = es;

        return () => {
            es.close();
            eventSourceRef.current = null;
        };
    }, [isRunning, isPaused]);

    // ── Auto-scroll to active profile ──────────
    useEffect(() => {
        if (progressRef.current && profiles.length > 0) {
            const activeRow = progressRef.current.querySelector('[data-active="true"]');
            if (activeRow) {
                activeRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [currentIndex, profiles]);

    // ── Notifications ──────────────────────────
    const showNotification = (type: 'success' | 'error' | 'warning', text: string) => {
        setNotification({ type, text });
        setTimeout(() => setNotification(null), 6000);
    };

    // ── Actions ────────────────────────────────
    const handleLaunch = async () => {
        setLaunching(true);
        try {
            const result = await launchBrowser();
            if (result.success) {
                setStatus(result.status);
                showNotification('success', '🚀 Browser abierto — logueate si es necesario');
            }
        } catch (err) {
            showNotification('error', 'Error al abrir el browser');
        } finally {
            setLaunching(false);
        }
    };

    const handleStart = async () => {
        if (parsedUrls.length === 0) {
            showNotification('error', 'No hay URLs válidas de LinkedIn');
            return;
        }

        // 🧹 Limpiar estados anteriores antes de iniciar
        setProfiles([]);
        setCurrentIndex(0);
        setTotalProfiles(0);

        try {
            const result = await startProspecting(parsedUrls, sendNote, noteText || undefined);
            if (result.success) {
                setIsRunning(true);
                setIsPaused(false);
                showNotification('success', `▶️ Iniciando prospecting para ${parsedUrls.length} perfiles`);
            } else {
                showNotification('error', result.error || 'Error al iniciar');
                // Limpiar estados si falló
                setIsRunning(false);
            }
        } catch (err) {
            showNotification('error', 'Error al iniciar el prospecting');
            setIsRunning(false);
        }
    };

    const handlePause = async () => {
        await pauseProspecting();
        setIsPaused(true);
    };

    const handleResume = async () => {
        await resumeProspecting();
        setIsPaused(false);
    };

    const [showStopConfirm, setShowStopConfirm] = useState(false);
    const [isStopping, setIsStopping] = useState(false);

    const handleStopClick = () => {
        setShowStopConfirm(true);
    };

    const handleStopCancel = () => {
        setShowStopConfirm(false);
    };

    const handleStopConfirm = async () => {
        setIsStopping(true);
        try {
            const result = await stopProspecting();
            setIsRunning(false);
            setIsPaused(false);
            setProfiles([]);
            setCurrentIndex(0);
            setTotalProfiles(0);
            showNotification('success',
                `⏹️ Detenido. ${result.deletedCount} contacto${result.deletedCount !== 1 ? 's' : ''} pendiente${result.deletedCount !== 1 ? 's' : ''} eliminado${result.deletedCount !== 1 ? 's' : ''} del CRM.`
            );
        } catch (err) {
            showNotification('error', 'Error al detener el prospecting');
        } finally {
            setIsStopping(false);
            setShowStopConfirm(false);
        }
    };

    // ── Progress Calculation ───────────────────
    const doneCount = profiles.filter(p => p.status === 'done' || p.status === 'error').length;
    const progressPercent = totalProfiles > 0 ? Math.round((doneCount / totalProfiles) * 100) : 0;

    const isLoggedIn = status?.status === 'logged-in';
    const isBrowserOpen = status?.status === 'browser-open' || isLoggedIn;

    return (
        <div className="relative w-full max-w-5xl mx-auto space-y-6 min-h-[calc(100vh-120px)] mt-4">
            {/* Atmospheric Background Effects */}
            <div className="absolute pointer-events-none inset-0 overflow-hidden z-0">
                <div className="absolute -top-40 -left-40 w-96 h-96 bg-fuchsia-400/20 rounded-full blur-3xl opacity-50 animate-pulse" style={{ animationDuration: '8s' }} />
                <div className="absolute top-1/3 -right-40 w-[600px] h-[600px] bg-violet-400/20 rounded-full blur-3xl opacity-40 animate-pulse" style={{ animationDuration: '12s' }} />
                <div className="absolute -bottom-40 left-1/4 w-80 h-80 bg-cyan-400/10 rounded-full blur-3xl opacity-40 animate-pulse" style={{ animationDuration: '10s' }} />
            </div>

            <div className="relative z-10 w-full flex flex-col space-y-6 pb-24 md:pb-12">
                {/* ── Notification Banner ──────────────── */}
                {notification && (
                    <div
                        className="p-4 rounded-[16px] text-sm font-semibold flex items-center justify-center shadow-sm animate-[fadeInSlideDown_0.4s_ease]"
                        style={{
                            background:
                                notification.type === 'success' ? 'linear-gradient(135deg, #dcfce7, #bbf7d0)' :
                                    notification.type === 'warning' ? 'linear-gradient(135deg, #fef3c7, #fde68a)' :
                                        'linear-gradient(135deg, #fee2e2, #fecaca)',
                            color:
                                notification.type === 'success' ? '#166534' :
                                    notification.type === 'warning' ? '#92400e' :
                                        '#991b1b',
                        }}
                    >
                        {notification.text}
                    </div>
                )}

                {/* ── Stop Confirmation Modal ──────────── */}
                {showStopConfirm && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                        style={{ background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(8px)' }}
                        onClick={handleStopCancel}
                    >
                        <div
                            className="rounded-[24px] p-6 max-w-md w-full animate-[fadeInSlideDown_0.3s_ease]"
                            style={{
                                background: 'rgba(255, 255, 255, 0.85)',
                                backdropFilter: 'blur(16px)',
                                border: '1px solid rgba(255, 255, 255, 0.6)',
                                boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.18)',
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center gap-4 mb-5">
                                <div className="w-14 h-14 rounded-[16px] flex items-center justify-center bg-red-100/80 shadow-[inset_0_0_0_1px_rgba(239,68,68,0.2)]">
                                    <span className="text-3xl filter drop-shadow-sm">⚠️</span>
                                </div>
                                <div>
                                    <h3 className="text-[17px] font-bold text-slate-800">
                                        ¿Detener prospecting?
                                    </h3>
                                    <p className="text-[13px] text-slate-500 font-medium">
                                        Esta acción no se puede deshacer
                                    </p>
                                </div>
                            </div>

                            <div className="p-4 rounded-[16px] mb-6 border border-red-100 bg-red-50/50">
                                <p className="text-[13px] text-red-700">
                                    <strong className="font-bold">Se eliminarán:</strong> Todos los contactos pendientes
                                    (estados "Visitando" y "Conectando") del CRM.
                                </p>
                                <p className="text-[12px] mt-2 text-red-500/80 font-medium">
                                    Los contactos ya procesados (conectados, con mensaje enviado) se mantendrán.
                                </p>
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={handleStopCancel}
                                    className="flex-1 py-3 rounded-xl font-bold text-[13px] text-slate-600 transition-all hover:bg-slate-100 hover:text-slate-800"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleStopConfirm}
                                    disabled={isStopping}
                                    className="flex-1 py-3 rounded-xl text-white font-bold text-[13px] transition-all hover:-translate-y-0.5 shadow-[0_4px_14px_rgba(239,68,68,0.3)] disabled:opacity-50 disabled:hover:translate-y-0 relative overflow-hidden group"
                                    style={{
                                        background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                                    }}
                                >
                                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                                    <span className="relative">{isStopping ? '⏳ Deteniendo...' : '⏹️ Sí, detener'}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Section 1: Connection Panel ──────── */}
                <div
                    className="rounded-[24px] p-6 sm:p-8 transition-all duration-300"
                    style={{
                        background: 'rgba(255, 255, 255, 0.4)',
                        backdropFilter: 'blur(24px)',
                        WebkitBackdropFilter: 'blur(24px)',
                        border: '1px solid rgba(255, 255, 255, 0.6)',
                        boxShadow: '0 8px 32px rgba(30, 27, 75, 0.05)',
                    }}
                >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-[14px] bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-[0_4px_12px_rgba(139,92,246,0.3)]">
                                <span className="text-xl text-white">🔗</span>
                            </div>
                            <div>
                                <h2 className="text-[16px] font-bold text-slate-800">
                                    LinkedIn Session
                                </h2>
                                <div className="flex items-center gap-2 mt-1">
                                    <div
                                        className="w-2.5 h-2.5 rounded-full"
                                        style={{
                                            background: isLoggedIn ? '#10b981' : isBrowserOpen ? '#f59e0b' : '#ef4444',
                                            boxShadow: isLoggedIn ? '0 0 12px rgba(16,185,129,0.5)' : isBrowserOpen ? '0 0 12px rgba(245,158,11,0.5)' : 'none',
                                            animation: isLoggedIn ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
                                        }}
                                    />
                                    <span className="text-[13px] font-bold" style={{ color: isLoggedIn ? '#059669' : isBrowserOpen ? '#d97706' : '#dc2626' }}>
                                        {isLoggedIn ? 'Conectado de forma segura' :
                                            isBrowserOpen ? 'Browser abierto — Esperando login' :
                                                'Sesión desconectada'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleLaunch}
                            disabled={launching || isBrowserOpen}
                            className="w-full sm:w-auto px-6 py-3 rounded-xl text-white text-[13px] font-bold transition-all duration-300 shadow-[0_4px_14px_rgba(139,92,246,0.3)] hover:shadow-[0_6px_20px_rgba(139,92,246,0.4)] hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-[0_4px_14px_rgba(139,92,246,0.3)] relative overflow-hidden group/launch"
                            style={{ background: 'linear-gradient(135deg, #8b5cf6, #d946ef)' }}
                        >
                            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/launch:translate-y-0 transition-transform duration-300" />
                            <span className="relative flex items-center justify-center gap-2">
                                {launching ? '⏳ Abriendo Entorno...' : isBrowserOpen ? '✅ Entorno Activo' : '🚀 Iniciar Sesión'}
                            </span>
                        </button>
                    </div>

                    {!isBrowserOpen && (
                        <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                            <p className="text-[12px] font-medium text-blue-800/80 flex items-center gap-2">
                                <span className="text-blue-500">ℹ️</span> Asegúrate de iniciar sesión manualmente la primera vez. Las cookies se guardarán cifradas.
                            </p>
                        </div>
                    )}
                </div>

                {/* ── Section 2: URL Input + Config ────── */}
                <div
                    className="rounded-[24px] p-6 sm:p-8 transition-all duration-300"
                    style={{
                        background: 'rgba(255, 255, 255, 0.5)',
                        backdropFilter: 'blur(24px)',
                        WebkitBackdropFilter: 'blur(24px)',
                        border: '1px solid rgba(255, 255, 255, 0.6)',
                        boxShadow: '0 8px 32px rgba(30, 27, 75, 0.05)',
                    }}
                >
                    <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-[0_4px_10px_rgba(16,185,129,0.2)]">
                                <span className="text-lg text-white">📋</span>
                            </div>
                            <h2 className="text-[16px] font-bold text-slate-800">
                                Target Leads
                            </h2>
                        </div>
                        <span
                            className="px-4 py-1.5 rounded-full text-[12px] font-bold"
                            style={{
                                background: parsedUrls.length > 0 ? 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(20,184,166,0.1))' : 'rgba(203, 213, 225, 0.5)',
                                color: parsedUrls.length > 0 ? '#059669' : '#64748b',
                                boxShadow: parsedUrls.length > 0 ? 'inset 0 0 0 1px rgba(16,185,129,0.2)' : 'none'
                            }}
                        >
                            {parsedUrls.length} Perfil{parsedUrls.length !== 1 ? 'es' : ''} en cola
                        </span>
                    </div>

                    <div className="relative group/textarea">
                        <textarea
                            value={urlText}
                            onChange={(e) => setUrlText(e.target.value)}
                            placeholder={`Ingresa las URLs de LinkedIn (una por línea):\nhttps://linkedin.com/in/perfil1\nhttps://linkedin.com/in/perfil2`}
                            rows={7}
                            disabled={isRunning}
                            className="w-full rounded-[16px] p-5 text-[13px] font-mono resize-none transition-all outline-none text-slate-700 placeholder-slate-400"
                            style={{
                                background: 'rgba(255, 255, 255, 0.6)',
                                border: '1px solid rgba(255, 255, 255, 0.8)',
                                boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
                            }}
                        />
                        <div className="absolute inset-0 rounded-[16px] pointer-events-none border-2 border-transparent group-focus-within/textarea:border-emerald-300 transition-colors" />
                    </div>

                    {/* Note toggle */}
                    <div className="mt-6 flex items-center gap-3">
                        <button
                            onClick={() => setSendNote(!sendNote)}
                            disabled={isRunning}
                            className="relative w-12 h-6 rounded-full transition-all duration-300 shadow-inner"
                            style={{
                                background: sendNote ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(203, 213, 225, 0.5)',
                            }}
                        >
                            <div
                                className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-300"
                                style={{
                                    left: sendNote ? '26px' : '2px',
                                }}
                            />
                        </button>
                        <span className="text-[14px] font-bold text-slate-700">
                            Enviar nota de invitación
                        </span>
                    </div>

                    {sendNote && (
                        <div className="mt-4 animate-[fadeInSlideDown_0.3s_ease]">
                            {/* Template buttons */}
                            <div className="flex flex-wrap gap-2 mb-3">
                                {MESSAGE_TEMPLATES.map((template) => (
                                    <button
                                        key={template.label}
                                        onClick={() => setNoteText(template.text)}
                                        disabled={isRunning}
                                        className="px-4 py-2 rounded-full text-[12px] font-bold transition-all disabled:opacity-50"
                                        style={{
                                            background: noteText === template.text
                                                ? 'linear-gradient(135deg, #10b981, #059669)'
                                                : 'rgba(255, 255, 255, 0.6)',
                                            color: noteText === template.text ? 'white' : '#059669',
                                            border: '1px solid',
                                            borderColor: noteText === template.text ? 'transparent' : 'rgba(16,185,129,0.3)',
                                            boxShadow: noteText === template.text ? '0 4px 10px rgba(16,185,129,0.3)' : '0 2px 4px rgba(0,0,0,0.02)',
                                        }}
                                    >
                                        {template.label}
                                    </button>
                                ))}
                            </div>

                            <div className="relative group/notetext">
                                <textarea
                                    value={noteText}
                                    onChange={(e) => setNoteText(e.target.value)}
                                    placeholder="Hola {nombre}, me gustaría conectar..."
                                    rows={4}
                                    disabled={isRunning}
                                    className="w-full rounded-[16px] p-5 text-[13px] resize-none transition-all outline-none text-slate-700 placeholder-slate-400"
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.6)',
                                        border: '1px solid rgba(255, 255, 255, 0.8)',
                                        boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.02)',
                                    }}
                                />
                                <div className="absolute inset-0 rounded-[16px] pointer-events-none border-2 border-transparent group-focus-within/notetext:border-emerald-300 transition-colors" />
                            </div>

                            {/* Variables hint */}
                            <div className="mt-3 flex flex-wrap items-center gap-2 bg-white/40 p-3 rounded-xl border border-white/60">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Insertar:</span>
                                {AVAILABLE_VARIABLES.map((variable) => (
                                    <button
                                        key={variable}
                                        onClick={() => setNoteText(noteText + variable)}
                                        disabled={isRunning}
                                        className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition-all hover:bg-emerald-100 disabled:opacity-50"
                                        style={{
                                            background: 'rgba(16,185,129,0.1)',
                                            color: '#059669',
                                        }}
                                        title={`Insertar ${variable}`}
                                    >
                                        {variable}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-4 mt-8 pt-6 border-t border-slate-200/50">
                        {!isRunning ? (
                            <button
                                onClick={handleStart}
                                disabled={!isLoggedIn || parsedUrls.length === 0}
                                className="flex-1 py-4 rounded-[16px] text-white font-bold text-[14px] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-1 relative overflow-hidden group/start"
                                style={{
                                    background: 'linear-gradient(135deg, #10b981, #059669)',
                                    boxShadow: isLoggedIn && parsedUrls.length > 0 ? '0 8px 24px -6px rgba(16,185,129,0.5)' : 'none',
                                }}
                            >
                                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/start:translate-y-0 transition-transform duration-300" />
                                <span className="relative flex justify-center items-center gap-2">
                                    ▶️ Iniciar Extracción
                                </span>
                            </button>
                        ) : (
                            <>
                                {!isPaused ? (
                                    <button
                                        onClick={handlePause}
                                        className="flex-1 py-4 rounded-[16px] text-white font-bold text-[14px] transition-all duration-300 hover:-translate-y-1 shadow-[0_8px_24px_-6px_rgba(245,158,11,0.5)] relative overflow-hidden group/pause"
                                        style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
                                    >
                                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/pause:translate-y-0 transition-transform duration-300" />
                                        <span className="relative flex justify-center items-center gap-2">⏸️ Pausar</span>
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleResume}
                                        className="flex-1 py-4 rounded-[16px] text-white font-bold text-[14px] transition-all duration-300 hover:-translate-y-1 shadow-[0_8px_24px_-6px_rgba(16,185,129,0.5)] relative overflow-hidden group/resume"
                                        style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                                    >
                                        <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/resume:translate-y-0 transition-transform duration-300" />
                                        <span className="relative flex justify-center items-center gap-2">▶️ Reanudar</span>
                                    </button>
                                )}
                                <button
                                    onClick={handleStopClick}
                                    disabled={isStopping}
                                    className="px-8 py-4 rounded-[16px] text-white font-bold text-[14px] transition-all duration-300 disabled:opacity-50 hover:-translate-y-1 shadow-[0_8px_24px_-6px_rgba(239,68,68,0.5)] relative overflow-hidden group/stop"
                                    style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
                                >
                                    <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/stop:translate-y-0 transition-transform duration-300" />
                                    <span className="relative flex justify-center items-center gap-2">
                                        {isStopping ? '⏳...' : '⏹️ Abortar'}
                                    </span>
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* ── Section 3: Progress Log ─────────── */}
                {profiles.length > 0 && (
                    <div
                        className="rounded-[24px] p-6 sm:p-8 animate-[fadeInSlideDown_0.5s_ease]"
                        style={{
                            background: 'rgba(255, 255, 255, 0.45)',
                            backdropFilter: 'blur(24px)',
                            WebkitBackdropFilter: 'blur(24px)',
                            border: '1px solid rgba(255, 255, 255, 0.8)',
                            boxShadow: '0 8px 32px rgba(30, 27, 75, 0.05)',
                        }}
                    >
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shadow-[0_4px_10px_rgba(99,102,241,0.2)]">
                                    <span className="text-lg text-white">📡</span>
                                </div>
                                <div>
                                    <h2 className="text-[16px] font-bold text-slate-800">Tracking en Vivo</h2>
                                    <p className="text-[12px] text-slate-500 font-medium tracking-wide">Analizando red LinkedIn</p>
                                </div>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[18px] font-black" style={{ color: '#4f46e5' }}>
                                    {progressPercent}%
                                </span>
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                    {doneCount} / {totalProfiles}
                                </span>
                            </div>
                        </div>

                        {/* Progress Bar */}
                        <div
                            className="w-full h-3.5 rounded-full overflow-hidden mb-8 shadow-inner"
                            style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.8)' }}
                        >
                            <div
                                className="h-full rounded-full transition-all duration-700 relative"
                                style={{
                                    width: `${progressPercent}%`,
                                    background: 'linear-gradient(90deg, #4f46e5, #8b5cf6, #d946ef)',
                                    backgroundSize: '200% 100%',
                                    animation: isRunning ? 'shimmer 2.5s linear infinite' : 'none',
                                    boxShadow: '0 0 10px rgba(139,92,246,0.5)',
                                }}
                            >
                                <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-[length:20px_20px] animate-[pulse_1s_linear_infinite]" />
                            </div>
                        </div>

                        {/* Table */}
                        <div ref={progressRef} className="max-h-[400px] overflow-y-auto rounded-[16px] custom-prospect-scroll" style={{ background: 'rgba(255,255,255,0.3)', border: '1px solid rgba(255, 255, 255, 0.6)' }}>
                            <table className="w-full text-[13px] border-collapse">
                                <thead>
                                    <tr className="sticky top-0 z-10" style={{ background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(8px)' }}>
                                        <th className="px-4 py-3 text-left font-bold text-slate-500 border-b border-slate-200/50">#</th>
                                        <th className="px-4 py-3 text-left font-bold text-slate-500 border-b border-slate-200/50">Perfil</th>
                                        <th className="px-4 py-3 text-center font-bold text-slate-500 border-b border-slate-200/50">👁️ Ext</th>
                                        <th className="px-4 py-3 text-center font-bold text-slate-500 border-b border-slate-200/50">🔗 Con</th>
                                        <th className="px-4 py-3 text-center font-bold text-slate-500 border-b border-slate-200/50">❤️ Fav</th>
                                        <th className="px-4 py-3 text-center font-bold text-slate-500 border-b border-slate-200/50">🧬 CRM</th>
                                        <th className="px-4 py-3 text-center font-bold text-slate-500 border-b border-slate-200/50">Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {profiles.map((profile, idx) => {
                                        const isActive = idx === currentIndex && isRunning;
                                        const profileName = profile.name || profile.url.split('/in/')[1]?.replace(/\//g, '') || profile.url;

                                        return (
                                            <tr
                                                key={idx}
                                                data-active={isActive}
                                                className="transition-all duration-300 hover:bg-white/60 group/row border-b border-slate-100/50 last:border-0"
                                                style={{
                                                    background: isActive
                                                        ? 'linear-gradient(90deg, rgba(139,92,246,0.1), rgba(139,92,246,0.02))'
                                                        : 'transparent',
                                                }}
                                            >
                                                <td className="px-4 py-3.5 font-mono text-[11px] text-slate-400 relative">
                                                    {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.8)]" />}
                                                    {isActive ? <div className="w-4 h-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin inline-block mr-1" /> : idx + 1}
                                                </td>
                                                <td className="px-4 py-3.5 font-bold truncate max-w-[200px]" style={{ color: isActive ? '#6d28d9' : '#334155' }} title={profile.url}>
                                                    {profileName}
                                                </td>
                                                <td className="px-4 py-3.5 text-center text-[15px]">{STEP_ICONS[profile.steps.visit as StepStatus] || '🕐'}</td>
                                                <td className="px-4 py-3.5 text-center text-[15px]">{STEP_ICONS[profile.steps.connect as StepStatus] || '🕐'}</td>
                                                <td className="px-4 py-3.5 text-center text-[15px]">{STEP_ICONS[profile.steps.like as StepStatus] || '🕐'}</td>
                                                <td className="px-4 py-3.5 text-center text-[15px]">
                                                    <EnrichmentBadge status={profile.status} />
                                                </td>
                                                <td className="px-4 py-3.5 text-center">
                                                    <StatusBadge status={profile.status} />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Global Styles */}
            <style>{`
                @keyframes shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
                @keyframes fadeInSlideDown {
                    from { opacity: 0; transform: translateY(-12px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                
                /* Custom elegant scrollbar */
                .custom-prospect-scroll::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-prospect-scroll::-webkit-scrollbar-track {
                    background: transparent;
                    margin: 4px;
                }
                .custom-prospect-scroll::-webkit-scrollbar-thumb {
                    background: rgba(148, 163, 184, 0.3);
                    border-radius: 10px;
                }
                .custom-prospect-scroll:hover::-webkit-scrollbar-thumb {
                    background: rgba(148, 163, 184, 0.5);
                }
            `}</style>
        </div>
    );
}

// ── Status Badge Component ──────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    const config: Record<string, { bg: string; color: string; border: string; text: string }> = {
        pending: { bg: 'rgba(255,255,255,0.6)', color: '#64748b', border: 'rgba(203,213,225,0.8)', text: 'Pendiente' },
        visiting: { bg: 'rgba(139,92,246,0.1)', color: '#7c3aed', border: 'rgba(139,92,246,0.3)', text: 'Visitando' },
        connected: { bg: 'rgba(139,92,246,0.1)', color: '#7c3aed', border: 'rgba(139,92,246,0.3)', text: 'Conectando' },
        liked: { bg: 'rgba(139,92,246,0.1)', color: '#7c3aed', border: 'rgba(139,92,246,0.3)', text: 'Like' },
        done: { bg: 'rgba(16,185,129,0.1)', color: '#059669', border: 'rgba(16,185,129,0.3)', text: 'Completado' },
        error: { bg: 'rgba(239,68,68,0.1)', color: '#dc2626', border: 'rgba(239,68,68,0.3)', text: 'Error' },
        paused: { bg: 'rgba(245,158,11,0.1)', color: '#d97706', border: 'rgba(245,158,11,0.3)', text: 'Pausado' },
    };

    const c = config[status] || config.pending;

    return (
        <span
            className="px-2.5 py-1 rounded-full text-[11px] font-bold inline-block shadow-sm"
            style={{
                background: c.bg,
                color: c.color,
                border: `1px solid ${c.border}`
            }}
        >
            {c.text}
        </span>
    );
}

// ── Enrichment Badge Component ───────────────────────────────

function EnrichmentBadge({ status }: { status: string }) {
    const config: Record<string, string> = {
        pending: '🕐',
        visiting: '🔄',
        connected: '🔄',
        liked: '🔄',
        done: '✅',
        error: '❌',
        paused: '⏸️',
    };

    return <span title="Enriquecimiento">{config[status] || '🕐'}</span>;
}
