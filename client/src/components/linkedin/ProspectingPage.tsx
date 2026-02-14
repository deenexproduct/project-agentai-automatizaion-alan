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

        try {
            const result = await startProspecting(parsedUrls, sendNote, noteText || undefined);
            if (result.success) {
                setIsRunning(true);
                setIsPaused(false);
                showNotification('success', `▶️ Iniciando prospecting para ${parsedUrls.length} perfiles`);
            } else {
                showNotification('error', result.error || 'Error al iniciar');
            }
        } catch (err) {
            showNotification('error', 'Error al iniciar el prospecting');
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

    const handleStop = async () => {
        await stopProspecting();
        setIsRunning(false);
        setIsPaused(false);
    };

    // ── Progress Calculation ───────────────────
    const doneCount = profiles.filter(p => p.status === 'done' || p.status === 'error').length;
    const progressPercent = totalProfiles > 0 ? Math.round((doneCount / totalProfiles) * 100) : 0;

    const isLoggedIn = status?.status === 'logged-in';
    const isBrowserOpen = status?.status === 'browser-open' || isLoggedIn;

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* ── Notification Banner ──────────────── */}
            {notification && (
                <div
                    className="p-4 rounded-xl text-sm font-medium animate-pulse"
                    style={{
                        background:
                            notification.type === 'success' ? 'rgba(34, 197, 94, 0.1)' :
                                notification.type === 'warning' ? 'rgba(245, 158, 11, 0.1)' :
                                    'rgba(239, 68, 68, 0.1)',
                        color:
                            notification.type === 'success' ? '#16a34a' :
                                notification.type === 'warning' ? '#d97706' :
                                    '#dc2626',
                        border: `1px solid ${notification.type === 'success' ? 'rgba(34, 197, 94, 0.2)' :
                                notification.type === 'warning' ? 'rgba(245, 158, 11, 0.2)' :
                                    'rgba(239, 68, 68, 0.2)'
                            }`,
                    }}
                >
                    {notification.text}
                </div>
            )}

            {/* ── Section 1: Connection Panel ──────── */}
            <div
                className="rounded-2xl p-6"
                style={{
                    background: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(124, 58, 237, 0.1)',
                    boxShadow: '0 4px 30px rgba(124, 58, 237, 0.05)',
                }}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h2 className="text-lg font-semibold" style={{ color: '#1e1b4b' }}>
                            🔗 LinkedIn Session
                        </h2>
                        <div className="flex items-center gap-2">
                            <div
                                className="w-2.5 h-2.5 rounded-full"
                                style={{
                                    background: isLoggedIn ? '#22c55e' : isBrowserOpen ? '#f59e0b' : '#ef4444',
                                    boxShadow: isLoggedIn ? '0 0 8px rgba(34, 197, 94, 0.5)' : 'none',
                                    animation: isLoggedIn ? 'pulse 2s infinite' : 'none',
                                }}
                            />
                            <span className="text-sm font-medium" style={{ color: '#6b7280' }}>
                                {isLoggedIn ? 'Conectado' :
                                    isBrowserOpen ? 'Browser abierto — Logueate' :
                                        'Desconectado'}
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={handleLaunch}
                        disabled={launching || isBrowserOpen}
                        className="px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                            background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                            boxShadow: launching || isBrowserOpen ? 'none' : '0 4px 20px rgba(124, 58, 237, 0.3)',
                            transform: launching ? 'scale(0.97)' : 'scale(1)',
                        }}
                    >
                        {launching ? '⏳ Abriendo...' : isBrowserOpen ? '✅ Browser activo' : '🚀 Abrir LinkedIn'}
                    </button>
                </div>

                {!isBrowserOpen && (
                    <p className="mt-3 text-xs" style={{ color: '#9ca3af' }}>
                        ℹ️ Logueate manualmente en el browser la primera vez. Las cookies se guardan automáticamente.
                    </p>
                )}
            </div>

            {/* ── Section 2: URL Input + Config ────── */}
            <div
                className="rounded-2xl p-6"
                style={{
                    background: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(124, 58, 237, 0.1)',
                    boxShadow: '0 4px 30px rgba(124, 58, 237, 0.05)',
                }}
            >
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold" style={{ color: '#1e1b4b' }}>
                        📋 Perfiles a Procesar
                    </h2>
                    <span
                        className="px-3 py-1 rounded-full text-xs font-bold"
                        style={{
                            background: parsedUrls.length > 0 ? 'rgba(124, 58, 237, 0.15)' : 'rgba(156, 163, 175, 0.15)',
                            color: parsedUrls.length > 0 ? '#7c3aed' : '#9ca3af',
                        }}
                    >
                        {parsedUrls.length} URL{parsedUrls.length !== 1 ? 's' : ''}
                    </span>
                </div>

                <textarea
                    value={urlText}
                    onChange={(e) => setUrlText(e.target.value)}
                    placeholder={`Pegá URLs de LinkedIn, una por línea:\nhttps://linkedin.com/in/ejemplo1\nhttps://linkedin.com/in/ejemplo2\nhttps://linkedin.com/in/ejemplo3`}
                    rows={8}
                    disabled={isRunning}
                    className="w-full rounded-xl p-4 text-sm font-mono resize-none transition-all outline-none"
                    style={{
                        background: 'rgba(30, 27, 75, 0.03)',
                        border: '1px solid rgba(124, 58, 237, 0.15)',
                        color: '#1e1b4b',
                    }}
                />

                {/* Note toggle */}
                <div className="mt-4 flex items-center gap-3">
                    <button
                        onClick={() => setSendNote(!sendNote)}
                        disabled={isRunning}
                        className="relative w-11 h-6 rounded-full transition-all duration-300"
                        style={{
                            background: sendNote ? 'linear-gradient(135deg, #7c3aed, #a855f7)' : '#d1d5db',
                        }}
                    >
                        <div
                            className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300"
                            style={{
                                left: sendNote ? '22px' : '2px',
                            }}
                        />
                    </button>
                    <span className="text-sm font-medium" style={{ color: '#4b5563' }}>
                        Enviar nota al conectar
                    </span>
                </div>

                {sendNote && (
                    <textarea
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Hola {nombre}, me interesa conectar contigo..."
                        rows={3}
                        disabled={isRunning}
                        className="w-full mt-3 rounded-xl p-4 text-sm resize-none transition-all outline-none"
                        style={{
                            background: 'rgba(30, 27, 75, 0.03)',
                            border: '1px solid rgba(124, 58, 237, 0.15)',
                            color: '#1e1b4b',
                        }}
                    />
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 mt-5">
                    {!isRunning ? (
                        <button
                            onClick={handleStart}
                            disabled={!isLoggedIn || parsedUrls.length === 0}
                            className="flex-1 py-3 rounded-xl text-white font-semibold text-sm transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{
                                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                boxShadow: isLoggedIn && parsedUrls.length > 0 ? '0 4px 20px rgba(34, 197, 94, 0.3)' : 'none',
                            }}
                        >
                            ▶️ Iniciar Prospecting
                        </button>
                    ) : (
                        <>
                            {!isPaused ? (
                                <button
                                    onClick={handlePause}
                                    className="flex-1 py-3 rounded-xl text-white font-semibold text-sm transition-all duration-300"
                                    style={{
                                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                        boxShadow: '0 4px 20px rgba(245, 158, 11, 0.3)',
                                    }}
                                >
                                    ⏸️ Pausar
                                </button>
                            ) : (
                                <button
                                    onClick={handleResume}
                                    className="flex-1 py-3 rounded-xl text-white font-semibold text-sm transition-all duration-300"
                                    style={{
                                        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                        boxShadow: '0 4px 20px rgba(34, 197, 94, 0.3)',
                                    }}
                                >
                                    ▶️ Reanudar
                                </button>
                            )}
                            <button
                                onClick={handleStop}
                                className="px-6 py-3 rounded-xl text-white font-semibold text-sm transition-all duration-300"
                                style={{
                                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                                    boxShadow: '0 4px 20px rgba(239, 68, 68, 0.3)',
                                }}
                            >
                                ⏹️ Detener
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* ── Section 3: Progress Log ─────────── */}
            {profiles.length > 0 && (
                <div
                    className="rounded-2xl p-6"
                    style={{
                        background: 'rgba(255, 255, 255, 0.7)',
                        backdropFilter: 'blur(20px)',
                        border: '1px solid rgba(124, 58, 237, 0.1)',
                        boxShadow: '0 4px 30px rgba(124, 58, 237, 0.05)',
                    }}
                >
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold" style={{ color: '#1e1b4b' }}>
                            📊 Progreso
                        </h2>
                        <span className="text-sm font-semibold" style={{ color: '#7c3aed' }}>
                            {doneCount}/{totalProfiles}
                        </span>
                    </div>

                    {/* Progress Bar */}
                    <div
                        className="w-full h-3 rounded-full overflow-hidden mb-6"
                        style={{ background: 'rgba(124, 58, 237, 0.1)' }}
                    >
                        <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                                width: `${progressPercent}%`,
                                background: 'linear-gradient(90deg, #7c3aed, #a855f7, #c084fc)',
                                backgroundSize: '200% 100%',
                                animation: isRunning ? 'shimmer 2s linear infinite' : 'none',
                            }}
                        />
                    </div>

                    {/* Table */}
                    <div ref={progressRef} className="max-h-96 overflow-y-auto rounded-xl" style={{ border: '1px solid rgba(124, 58, 237, 0.08)' }}>
                        <table className="w-full text-sm">
                            <thead>
                                <tr style={{ background: 'rgba(124, 58, 237, 0.05)' }}>
                                    <th className="px-3 py-2.5 text-left font-semibold" style={{ color: '#6b7280' }}>#</th>
                                    <th className="px-3 py-2.5 text-left font-semibold" style={{ color: '#6b7280' }}>Perfil</th>
                                    <th className="px-3 py-2.5 text-center font-semibold" style={{ color: '#6b7280' }}>👁️</th>
                                    <th className="px-3 py-2.5 text-center font-semibold" style={{ color: '#6b7280' }}>👤</th>
                                    <th className="px-3 py-2.5 text-center font-semibold" style={{ color: '#6b7280' }}>🔗</th>
                                    <th className="px-3 py-2.5 text-center font-semibold" style={{ color: '#6b7280' }}>❤️</th>
                                    <th className="px-3 py-2.5 text-center font-semibold" style={{ color: '#6b7280' }}>Estado</th>
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
                                            className="transition-all duration-300"
                                            style={{
                                                background: isActive
                                                    ? 'rgba(124, 58, 237, 0.08)'
                                                    : idx % 2 === 0
                                                        ? 'rgba(255,255,255,0.5)'
                                                        : 'transparent',
                                                borderLeft: isActive ? '3px solid #7c3aed' : '3px solid transparent',
                                            }}
                                        >
                                            <td className="px-3 py-2.5 font-mono text-xs" style={{ color: '#9ca3af' }}>
                                                {idx + 1}
                                            </td>
                                            <td className="px-3 py-2.5 font-medium truncate max-w-[200px]" style={{ color: '#1e1b4b' }} title={profile.url}>
                                                {isActive && <span className="inline-block mr-1 animate-pulse">⏳</span>}
                                                {profileName}
                                            </td>
                                            <td className="px-3 py-2.5 text-center">{STEP_ICONS[profile.steps.visit as StepStatus] || '🕐'}</td>
                                            <td className="px-3 py-2.5 text-center">{STEP_ICONS[profile.steps.follow as StepStatus] || '🕐'}</td>
                                            <td className="px-3 py-2.5 text-center">{STEP_ICONS[profile.steps.connect as StepStatus] || '🕐'}</td>
                                            <td className="px-3 py-2.5 text-center">{STEP_ICONS[profile.steps.like as StepStatus] || '🕐'}</td>
                                            <td className="px-3 py-2.5 text-center">
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

            {/* Inline style for animations */}
            <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-8px) translateY(-50%); }
          to { opacity: 1; transform: translateX(0) translateY(-50%); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
        </div>
    );
}

// ── Status Badge Component ──────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    const config: Record<string, { bg: string; color: string; text: string }> = {
        pending: { bg: 'rgba(156, 163, 175, 0.1)', color: '#9ca3af', text: 'Pendiente' },
        visiting: { bg: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed', text: 'Visitando' },
        followed: { bg: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed', text: 'Siguiendo' },
        connected: { bg: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed', text: 'Conectando' },
        liked: { bg: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed', text: 'Like' },
        done: { bg: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', text: 'Hecho' },
        error: { bg: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', text: 'Error' },
        paused: { bg: 'rgba(245, 158, 11, 0.1)', color: '#d97706', text: 'Pausado' },
    };

    const c = config[status] || config.pending;

    return (
        <span
            className="px-2 py-0.5 rounded-full text-xs font-semibold inline-block"
            style={{ background: c.bg, color: c.color }}
        >
            {c.text}
        </span>
    );
}
