import { useState, useEffect, useRef, useCallback } from 'react'

const API_URL = 'http://localhost:3000/api/resumidor'
const WA_API_URL = 'http://localhost:3000/api/whatsapp'

interface Group {
    id: string
    name: string
    isGroup: boolean
}

interface ReportConfig {
    includeExecutiveSummary: boolean
    includeTopics: boolean
    includeDecisions: boolean
    includeTasks: boolean
    includeImportantData: boolean
    includeSentiment: boolean
    includeSuggestions: boolean
}

interface LogEntry {
    step: string
    detail: string
    progress?: number
    time: string
}

const DEFAULT_CONFIG: ReportConfig = {
    includeExecutiveSummary: true,
    includeTopics: true,
    includeDecisions: true,
    includeTasks: true,
    includeImportantData: true,
    includeSentiment: true,
    includeSuggestions: true,
}

const CONFIG_LABELS: Record<keyof ReportConfig, { label: string; emoji: string }> = {
    includeExecutiveSummary: { label: 'Resumen Ejecutivo', emoji: '📌' },
    includeTopics: { label: 'Temas Discutidos', emoji: '📋' },
    includeDecisions: { label: 'Decisiones y Acuerdos', emoji: '✅' },
    includeTasks: { label: 'Tareas Pendientes', emoji: '📝' },
    includeImportantData: { label: 'Datos Importantes', emoji: '📊' },
    includeSentiment: { label: 'Análisis de Sentimiento', emoji: '🧠' },
    includeSuggestions: { label: 'Sugerencias de Respuesta', emoji: '💡' },
}

export default function ResumidorTab() {
    // Connection state
    const [waConnected, setWaConnected] = useState(false)
    const [ollamaOk, setOllamaOk] = useState(false)
    const [ollamaError, setOllamaError] = useState('')
    const [checkingHealth, setCheckingHealth] = useState(true)

    // Groups
    const [groups, setGroups] = useState<Group[]>([])
    const [selectedGroup, setSelectedGroup] = useState('')
    const [loadingGroups, setLoadingGroups] = useState(false)

    // Range
    const [rangeMode, setRangeMode] = useState<'hours' | 'range'>('hours')
    const [hours, setHours] = useState(2)
    const [rangeFrom, setRangeFrom] = useState('08:00')
    const [rangeTo, setRangeTo] = useState('14:00')

    // Config
    const [config, setConfig] = useState<ReportConfig>(DEFAULT_CONFIG)
    const [showConfig, setShowConfig] = useState(false)

    // Model
    const [models, setModels] = useState<string[]>([])
    const [selectedModel, setSelectedModel] = useState('mistral')

    // Processing
    const [isProcessing, setIsProcessing] = useState(false)
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [progress, setProgress] = useState(0)
    const [showLogs, setShowLogs] = useState(true)

    // Result
    const [summary, setSummary] = useState('')
    const [stats, setStats] = useState<{ chatName: string; totalMessages: number; totalAudios: number; processingTimeSeconds: number } | null>(null)
    const [copied, setCopied] = useState(false)

    // History
    const [showHistory, setShowHistory] = useState(false)
    const [history, setHistory] = useState<any[]>([])

    const logsEndRef = useRef<HTMLDivElement>(null)

    // ── Health Check ──────────────────────────────────────────

    const checkHealth = useCallback(async () => {
        setCheckingHealth(true)
        try {
            const res = await fetch(`${API_URL}/health`)
            const data = await res.json()
            setWaConnected(data.whatsapp)
            setOllamaOk(data.ollama)
            setOllamaError(data.ollamaError || '')
        } catch {
            setWaConnected(false)
            setOllamaOk(false)
        } finally {
            setCheckingHealth(false)
        }
    }, [])

    useEffect(() => {
        checkHealth()
    }, [checkHealth])

    // ── Load Groups ───────────────────────────────────────────

    const loadGroups = useCallback(async () => {
        setLoadingGroups(true)
        try {
            const res = await fetch(`${API_URL}/groups`)
            const data = await res.json()
            setGroups(data)
        } catch {
            setGroups([])
        } finally {
            setLoadingGroups(false)
        }
    }, [])

    useEffect(() => {
        if (waConnected) {
            loadGroups()
        }
    }, [waConnected, loadGroups])

    // ── Load Models ───────────────────────────────────────────

    useEffect(() => {
        if (ollamaOk) {
            fetch(`${API_URL}/models`)
                .then(r => r.json())
                .then(setModels)
                .catch(() => setModels([]))
        }
    }, [ollamaOk])

    // ── Auto-scroll logs ──────────────────────────────────────

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [logs])

    // ── Generate Summary ──────────────────────────────────────

    const handleSummarize = async () => {
        if (!selectedGroup) return

        setIsProcessing(true)
        setLogs([])
        setProgress(0)
        setSummary('')
        setStats(null)
        setShowLogs(true)

        const addLog = (entry: LogEntry) => {
            setLogs(prev => [...prev, entry])
        }

        try {
            const body = {
                chatId: selectedGroup,
                rangeMode,
                hours: rangeMode === 'hours' ? hours : undefined,
                rangeFrom: rangeMode === 'range' ? rangeFrom : undefined,
                rangeTo: rangeMode === 'range' ? rangeTo : undefined,
                model: selectedModel,
                config,
            }

            addLog({ step: 'start', detail: '🚀 Iniciando proceso de resumen...', time: new Date().toLocaleTimeString() })

            const res = await fetch(`${API_URL}/summarize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })

            const reader = res.body?.getReader()
            const decoder = new TextDecoder()

            if (!reader) throw new Error('No se pudo leer la respuesta')

            let buffer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })

                // Process SSE events
                const lines = buffer.split('\n')
                buffer = lines.pop() || '' // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const event = JSON.parse(line.substring(6))

                            if (event.type === 'progress') {
                                addLog({
                                    step: event.step,
                                    detail: event.detail,
                                    progress: event.progress,
                                    time: new Date().toLocaleTimeString(),
                                })
                                if (event.progress) setProgress(event.progress)
                            } else if (event.type === 'complete') {
                                setSummary(event.summary)
                                setStats({
                                    chatName: event.chatName,
                                    totalMessages: event.totalMessages,
                                    totalAudios: event.totalAudios,
                                    processingTimeSeconds: event.processingTimeSeconds,
                                })
                                addLog({
                                    step: 'done',
                                    detail: `✅ Informe generado en ${event.processingTimeSeconds}s`,
                                    progress: 100,
                                    time: new Date().toLocaleTimeString(),
                                })
                                setProgress(100)
                            } else if (event.type === 'error') {
                                addLog({
                                    step: 'error',
                                    detail: `❌ Error: ${event.message}`,
                                    time: new Date().toLocaleTimeString(),
                                })
                                throw new Error(event.message)
                            }
                        } catch (parseErr: any) {
                            if (parseErr.message && !parseErr.message.includes('JSON')) {
                                throw parseErr
                            }
                        }
                    }
                }
            }
        } catch (err: any) {
            addLog({
                step: 'error',
                detail: `❌ ${err.message}`,
                time: new Date().toLocaleTimeString(),
            })
        } finally {
            setIsProcessing(false)
        }
    }

    // ── Copy to Clipboard ─────────────────────────────────────

    const copyToClipboard = () => {
        navigator.clipboard.writeText(summary)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    // ── Load History ──────────────────────────────────────────

    const loadHistory = async () => {
        try {
            const res = await fetch(`${API_URL}/history`)
            const data = await res.json()
            setHistory(data)
        } catch {
            setHistory([])
        }
    }

    // ── Toggle Config ─────────────────────────────────────────

    const toggleConfig = (key: keyof ReportConfig) => {
        setConfig(prev => ({ ...prev, [key]: !prev[key] }))
    }

    // ── Render ────────────────────────────────────────────────

    if (checkingHealth) {
        return (
            <div className="flex justify-center py-20">
                <div className="animate-spin w-8 h-8 border-3 border-violet-600 border-t-transparent rounded-full" style={{ borderWidth: '3px' }}></div>
            </div>
        )
    }

    // Health issues
    if (!waConnected || !ollamaOk) {
        return (
            <div className="space-y-4">
                <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-200">
                    <h2 className="text-lg font-semibold text-slate-800 mb-4">📊 Resumidor de Grupos — Setup</h2>

                    <div className="space-y-3">
                        <div className={`flex items-center gap-3 p-3 rounded-xl ${waConnected ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                            <div className={`w-3 h-3 rounded-full ${waConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                            <span className={`font-medium ${waConnected ? 'text-green-700' : 'text-red-700'}`}>
                                {waConnected ? '✅ WhatsApp conectado' : '❌ WhatsApp desconectado — Conectá via el tab WhatsApp'}
                            </span>
                        </div>

                        <div className={`flex items-center gap-3 p-3 rounded-xl ${ollamaOk ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                            <div className={`w-3 h-3 rounded-full ${ollamaOk ? 'bg-green-500' : 'bg-red-500'}`}></div>
                            <div>
                                <span className={`font-medium ${ollamaOk ? 'text-green-700' : 'text-red-700'}`}>
                                    {ollamaOk ? '✅ Ollama funcionando' : '❌ Ollama no disponible'}
                                </span>
                                {ollamaError && (
                                    <p className="text-sm text-red-600 mt-1">{ollamaError}</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {!ollamaOk && (
                        <div className="mt-4 p-4 bg-amber-50 rounded-xl border border-amber-200">
                            <p className="text-sm font-medium text-amber-800 mb-2">Para instalar Ollama:</p>
                            <code className="block text-sm bg-slate-800 text-green-400 p-3 rounded-lg">
                                brew install ollama<br />
                                brew services start ollama<br />
                                ollama pull mistral
                            </code>
                        </div>
                    )}

                    <button
                        onClick={checkHealth}
                        className="mt-4 px-6 py-2.5 bg-violet-600 text-white rounded-xl hover:bg-violet-700 transition-colors font-medium"
                    >
                        🔄 Verificar de nuevo
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-green-600 font-medium">Ollama + WhatsApp conectados</span>
                </div>
                <button
                    onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadHistory() }}
                    className={`text-sm px-4 py-2 rounded-xl font-medium transition-all ${showHistory ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
                >
                    📋 {showHistory ? 'Nuevo Resumen' : 'Historial'}
                </button>
            </div>

            {showHistory ? (
                /* ── History View ─────────────────────────── */
                <div className="space-y-4">
                    {history.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">No hay resúmenes guardados aún</div>
                    ) : (
                        history.map((item: any) => (
                            <div key={item._id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                                <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">👥</span>
                                        <span className="font-medium text-slate-800">{item.chatName}</span>
                                        <span className="text-xs text-slate-500">•</span>
                                        <span className="text-xs text-slate-500">
                                            {new Date(item.createdAt).toLocaleDateString()} {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <div className="flex gap-2 text-xs text-slate-400">
                                        <span>💬 {item.totalMessages}</span>
                                        <span>🎤 {item.totalAudios}</span>
                                        <span>⏱️ {item.processingTimeSeconds}s</span>
                                    </div>
                                </div>
                                <div className="p-4">
                                    <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans leading-relaxed">{item.summary}</pre>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : (
                /* ── Main Form ────────────────────────────── */
                <>
                    {/* Group Selector */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">👥 Grupo de WhatsApp</label>
                        <select
                            value={selectedGroup}
                            onChange={(e) => setSelectedGroup(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition-all outline-none bg-white"
                            disabled={loadingGroups}
                        >
                            <option value="">Seleccionar grupo...</option>
                            {groups.map(g => (
                                <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Time Range */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                        <label className="block text-sm font-semibold text-slate-700 mb-3">⏰ Rango de Tiempo</label>

                        {/* Mode Toggle */}
                        <div className="flex gap-2 mb-4">
                            <button
                                onClick={() => setRangeMode('hours')}
                                className={`flex-1 py-2.5 px-4 rounded-xl font-medium text-sm transition-all ${rangeMode === 'hours'
                                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                            >
                                ⏱️ Últimas X horas
                            </button>
                            <button
                                onClick={() => setRangeMode('range')}
                                className={`flex-1 py-2.5 px-4 rounded-xl font-medium text-sm transition-all ${rangeMode === 'range'
                                    ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                            >
                                📅 Rango específico
                            </button>
                        </div>

                        {rangeMode === 'hours' ? (
                            <div className="flex items-center gap-3">
                                <span className="text-sm text-slate-600">Últimas</span>
                                <input
                                    type="number"
                                    min={1}
                                    max={48}
                                    value={hours}
                                    onChange={(e) => setHours(Number(e.target.value))}
                                    className="w-20 px-3 py-2.5 rounded-xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition-all outline-none text-center font-semibold"
                                />
                                <span className="text-sm text-slate-600">horas</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3">
                                <div>
                                    <label className="text-xs text-slate-500 mb-1 block">Desde</label>
                                    <input
                                        type="time"
                                        value={rangeFrom}
                                        onChange={(e) => setRangeFrom(e.target.value)}
                                        className="px-3 py-2.5 rounded-xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition-all outline-none"
                                    />
                                </div>
                                <span className="text-slate-400 mt-5">→</span>
                                <div>
                                    <label className="text-xs text-slate-500 mb-1 block">Hasta</label>
                                    <input
                                        type="time"
                                        value={rangeTo}
                                        onChange={(e) => setRangeTo(e.target.value)}
                                        className="px-3 py-2.5 rounded-xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition-all outline-none"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Config Toggle */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <button
                            onClick={() => setShowConfig(!showConfig)}
                            className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                        >
                            <span className="text-sm font-semibold text-slate-700">⚙️ Configuración del Informe</span>
                            <span className={`text-slate-400 transition-transform ${showConfig ? 'rotate-180' : ''}`}>▼</span>
                        </button>

                        {showConfig && (
                            <div className="px-5 pb-4 space-y-2 border-t border-slate-100 pt-3">
                                {(Object.keys(CONFIG_LABELS) as Array<keyof ReportConfig>).map(key => (
                                    <label key={key} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={config[key]}
                                            onChange={() => toggleConfig(key)}
                                            className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                                        />
                                        <span className="text-sm text-slate-700">
                                            {CONFIG_LABELS[key].emoji} {CONFIG_LABELS[key].label}
                                        </span>
                                    </label>
                                ))}

                                {/* Model Selector */}
                                <div className="pt-3 mt-3 border-t border-slate-100">
                                    <label className="text-xs text-slate-500 mb-1 block">Modelo AI</label>
                                    <select
                                        value={selectedModel}
                                        onChange={(e) => setSelectedModel(e.target.value)}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-200 transition-all outline-none"
                                    >
                                        {models.map(m => (
                                            <option key={m} value={m}>{m}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Generate Button */}
                    <button
                        onClick={handleSummarize}
                        disabled={isProcessing || !selectedGroup}
                        className={`w-full py-4 rounded-2xl font-semibold text-lg transition-all ${isProcessing || !selectedGroup
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-600/30 hover:shadow-xl hover:shadow-violet-600/40 hover:scale-[1.01] active:scale-[0.99]'
                            }`}
                    >
                        {isProcessing ? '⏳ Generando informe...' : '📊 Generar Informe'}
                    </button>

                    {/* Progress Bar */}
                    {isProcessing && (
                        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-violet-600 to-purple-600 rounded-full transition-all duration-500"
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                    )}

                    {/* Logs Panel */}
                    {logs.length > 0 && (
                        <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-lg">
                            <button
                                onClick={() => setShowLogs(!showLogs)}
                                className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-slate-800 transition-colors"
                            >
                                <span className="text-sm font-medium text-slate-300">📡 Logs del proceso</span>
                                <span className={`text-slate-500 text-xs transition-transform ${showLogs ? 'rotate-180' : ''}`}>▼</span>
                            </button>

                            {showLogs && (
                                <div className="px-5 pb-4 max-h-64 overflow-y-auto font-mono text-xs">
                                    {logs.map((log, i) => (
                                        <div key={i} className={`py-1 flex gap-3 ${log.step === 'error' ? 'text-red-400' : log.step === 'done' ? 'text-green-400' : 'text-slate-400'}`}>
                                            <span className="text-slate-600 flex-shrink-0">{log.time}</span>
                                            <span>{log.detail}</span>
                                        </div>
                                    ))}
                                    <div ref={logsEndRef} />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Summary Result */}
                    {summary && (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            {/* Stats Header */}
                            {stats && (
                                <div className="bg-gradient-to-r from-violet-50 to-purple-50 px-5 py-4 border-b border-slate-200">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-semibold text-slate-800">📊 {stats.chatName}</h3>
                                        <div className="flex gap-4 text-xs text-slate-500">
                                            <span>💬 {stats.totalMessages} msgs</span>
                                            <span>🎤 {stats.totalAudios} audios</span>
                                            <span>⏱️ {stats.processingTimeSeconds}s</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Summary Content */}
                            <div className="p-5">
                                <pre className="whitespace-pre-wrap text-sm text-slate-700 font-sans leading-relaxed">{summary}</pre>
                            </div>

                            {/* Actions */}
                            <div className="px-5 pb-4 flex gap-3">
                                <button
                                    onClick={copyToClipboard}
                                    className={`px-5 py-2.5 rounded-xl font-medium text-sm transition-all ${copied
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-violet-600 text-white hover:bg-violet-700'
                                        }`}
                                >
                                    {copied ? '✅ Copiado!' : '📋 Copiar Informe'}
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
