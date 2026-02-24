/**
 * PublicacionesPage — LinkedIn Publishing Dashboard
 *
 * Three sub-tabs:
 *   1. Generar: Create new posts with AI
 *   2. Pendientes: Review and approve/reject drafts
 *   3. Historial: Published posts with metrics
 */

import { useState, useEffect, useCallback } from 'react';
import {
    Sparkles, Clock, BarChart3, Send, RefreshCw, ThumbsUp,
    ThumbsDown, Trash2, Edit3, ChevronDown, ChevronUp,
    AlertTriangle, CheckCircle2, XCircle, Eye, Heart,
    MessageCircle, Share2, Zap, TrendingUp, X,
} from 'lucide-react';
import {
    generatePost, getDrafts, getScheduledPosts, getPublishedPosts,
    approvePost, rejectPost, regeneratePost, deletePost,
    getPilares, getAIHealth,
    type ScheduledPost, type ContentPilar, type AIHealthStatus,
    type ValidationIssue,
} from '../../services/linkedin-posts.service';
import { getActiveAccount, type LinkedInAccount } from '../../services/linkedin-accounts.service';

// ── Constants ────────────────────────────────────────────────

type SubTab = 'generate' | 'pending' | 'history';

const SUB_TABS: { id: SubTab; label: string; Icon: React.ElementType }[] = [
    { id: 'generate', label: 'Generar', Icon: Sparkles },
    { id: 'pending', label: 'Pendientes', Icon: Clock },
    { id: 'history', label: 'Historial', Icon: BarChart3 },
];

const ENGAGEMENT_COLORS = {
    bajo: { bg: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', label: '🔴 Bajo' },
    medio: { bg: 'rgba(245, 158, 11, 0.1)', color: '#d97706', label: '🟡 Medio' },
    alto: { bg: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', label: '🟢 Alto' },
};

const STATUS_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
    draft: { bg: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed', label: 'Borrador' },
    approved: { bg: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', label: 'Aprobado' },
    scheduled: { bg: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', label: 'Programado' },
    publishing: { bg: 'rgba(245, 158, 11, 0.1)', color: '#d97706', label: 'Publicando...' },
    published: { bg: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', label: 'Publicado' },
    failed: { bg: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', label: 'Falló' },
    rejected: { bg: 'rgba(107, 114, 128, 0.1)', color: '#6b7280', label: 'Rechazado' },
};

const FORMATOS = ['Auto', 'text', 'carousel', 'image', 'poll'];

// ── Helpers ──────────────────────────────────────────────────

function timeAgo(dateStr?: string): string {
    if (!dateStr) return '—';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'ahora';
    if (mins < 60) return `${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
}

function formatDate(dateStr?: string): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('es-AR', {
        weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
}

// ── Glass Card ───────────────────────────────────────────────

function GlassCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
    return (
        <div
            className={`rounded-2xl p-6 ${className}`}
            style={{
                background: 'rgba(255, 255, 255, 0.7)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(124, 58, 237, 0.1)',
                boxShadow: '0 4px 30px rgba(124, 58, 237, 0.05)',
            }}
        >
            {children}
        </div>
    );
}

// ── Main Component ───────────────────────────────────────────

export default function PublicacionesPage() {
    const [subTab, setSubTab] = useState<SubTab>('generate');
    const [account, setAccount] = useState<LinkedInAccount | null>(null);
    const [pilares, setPilares] = useState<ContentPilar[]>([]);
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [aiHealth, setAIHealth] = useState<AIHealthStatus | null>(null);

    const showNotif = (type: 'success' | 'error', text: string) => {
        setNotification({ type, text });
        setTimeout(() => setNotification(null), 5000);
    };

    // Load initial data
    useEffect(() => {
        const load = async () => {
            try {
                const [acc, pils, health] = await Promise.all([
                    getActiveAccount(),
                    getPilares(),
                    getAIHealth(),
                ]);
                setAccount(acc);
                setPilares(pils);
                setAIHealth(health);
            } catch (err) {
                console.error('Failed to load publishing data:', err);
            }
        };
        load();
    }, []);

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-20 md:pb-0">
            {/* Notification */}
            {notification && (
                <div
                    className="p-4 rounded-xl text-sm font-medium flex items-center justify-between"
                    style={{
                        background: notification.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: notification.type === 'success' ? '#16a34a' : '#dc2626',
                        border: `1px solid ${notification.type === 'success' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                    }}
                >
                    {notification.text}
                    <button onClick={() => setNotification(null)}>
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* AI Health Status */}
            {aiHealth && !aiHealth.ollama.healthy && (
                <div
                    className="p-4 rounded-xl text-sm flex items-center gap-3"
                    style={{
                        background: 'rgba(245, 158, 11, 0.1)',
                        color: '#d97706',
                        border: '1px solid rgba(245, 158, 11, 0.2)',
                    }}
                >
                    <AlertTriangle size={18} />
                    <div>
                        <span className="font-semibold">Ollama no disponible.</span>{' '}
                        {aiHealth.ollama.error || 'Ejecutá: ollama serve'}
                    </div>
                </div>
            )}

            {/* Sub-tab Selector */}
            <div className="flex gap-2">
                {SUB_TABS.map(({ id, label, Icon }) => (
                    <button
                        key={id}
                        onClick={() => setSubTab(id)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200"
                        style={{
                            background: subTab === id
                                ? 'linear-gradient(135deg, #7c3aed, #a855f7)'
                                : 'rgba(255, 255, 255, 0.7)',
                            color: subTab === id ? 'white' : '#6b7280',
                            boxShadow: subTab === id ? '0 4px 15px rgba(124, 58, 237, 0.25)' : 'none',
                            backdropFilter: 'blur(20px)',
                            border: subTab === id ? 'none' : '1px solid rgba(124, 58, 237, 0.1)',
                            transform: subTab === id ? 'scale(1.02)' : 'scale(1)',
                        }}
                    >
                        <Icon size={16} />
                        {label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {subTab === 'generate' && (
                <GenerateTab
                    account={account}
                    pilares={pilares}
                    aiHealthy={aiHealth?.ollama.healthy ?? false}
                    showNotif={showNotif}
                    onGenerated={() => setSubTab('pending')}
                />
            )}
            {subTab === 'pending' && (
                <PendingTab account={account} showNotif={showNotif} />
            )}
            {subTab === 'history' && (
                <HistoryTab />
            )}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// TAB 1 — GENERAR POST
// ══════════════════════════════════════════════════════════════

function GenerateTab({
    account,
    pilares,
    aiHealthy,
    showNotif,
    onGenerated,
}: {
    account: LinkedInAccount | null;
    pilares: ContentPilar[];
    aiHealthy: boolean;
    showNotif: (type: 'success' | 'error', text: string) => void;
    onGenerated: () => void;
}) {
    const [idea, setIdea] = useState('');
    const [context, setContext] = useState('');
    const [pilar, setPilar] = useState('Auto');
    const [formato, setFormato] = useState('Auto');
    const [includeTrends, setIncludeTrends] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [lastResult, setLastResult] = useState<{ content: string; issues: ValidationIssue[] } | null>(null);

    const handleGenerate = async () => {
        if (!idea.trim()) return;
        if (!account) {
            showNotif('error', 'No hay cuenta LinkedIn activa. Configurá una primero.');
            return;
        }
        if (!aiHealthy) {
            showNotif('error', 'Ollama no está disponible. Ejecutá: ollama serve');
            return;
        }

        setGenerating(true);
        setLastResult(null);
        try {
            const result = await generatePost(idea.trim(), account._id, {
                context: context.trim() || undefined,
                pilar: pilar === 'Auto' ? undefined : pilar,
                formato: formato === 'Auto' ? undefined : formato,
                includeTrends,
            });

            setLastResult({
                content: result.draft.texto,
                issues: result.validation.issues,
            });

            showNotif('success', '✅ Post generado. Revisalo en Pendientes.');
            setIdea('');
            setContext('');
            setTimeout(onGenerated, 2000);
        } catch (err: any) {
            showNotif('error', `❌ ${err.message}`);
        } finally {
            setGenerating(false);
        }
    };

    return (
        <>
            <GlassCard>
                <div className="flex items-center gap-3 mb-5">
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{
                            background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                            boxShadow: '0 0 15px rgba(168, 85, 247, 0.3)',
                        }}
                    >
                        <Sparkles size={20} color="white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold" style={{ color: '#1e1b4b' }}>
                            Generar Post con AI
                        </h2>
                        <span className="text-xs" style={{ color: '#9ca3af' }}>
                            Describí tu idea y el AI genera el post completo
                        </span>
                    </div>
                </div>

                {/* Idea input */}
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-semibold mb-1.5 block" style={{ color: '#6b7280' }}>
                            💡 Tu idea o tema
                        </label>
                        <textarea
                            value={idea}
                            onChange={(e) => setIdea(e.target.value)}
                            placeholder="Ej: Hablar sobre cuánto pierde un restaurante con 30 locales en comisiones..."
                            rows={3}
                            className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none transition-all"
                            style={{
                                background: 'rgba(255, 255, 255, 0.8)',
                                border: '1px solid rgba(124, 58, 237, 0.15)',
                                color: '#1e1b4b',
                            }}
                        />
                    </div>

                    <div>
                        <label className="text-xs font-semibold mb-1.5 block" style={{ color: '#6b7280' }}>
                            📝 Contexto adicional (opcional)
                        </label>
                        <input
                            type="text"
                            value={context}
                            onChange={(e) => setContext(e.target.value)}
                            placeholder="Ej: Según datos del sector, las comisiones van del 15% al 35%"
                            className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                            style={{
                                background: 'rgba(255, 255, 255, 0.8)',
                                border: '1px solid rgba(124, 58, 237, 0.15)',
                                color: '#1e1b4b',
                            }}
                        />
                    </div>

                    {/* Options row */}
                    <div className="flex gap-3 flex-wrap">
                        <div className="flex-1 min-w-[140px]">
                            <label className="text-xs font-semibold mb-1.5 block" style={{ color: '#6b7280' }}>
                                🎯 Pilar
                            </label>
                            <select
                                value={pilar}
                                onChange={(e) => setPilar(e.target.value)}
                                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                                style={{
                                    background: 'rgba(255, 255, 255, 0.8)',
                                    border: '1px solid rgba(124, 58, 237, 0.15)',
                                    color: '#1e1b4b',
                                }}
                            >
                                <option value="Auto">🔄 Auto (rotación)</option>
                                {pilares.map((p) => (
                                    <option key={p._id} value={p.nombre}>{p.nombre}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex-1 min-w-[140px]">
                            <label className="text-xs font-semibold mb-1.5 block" style={{ color: '#6b7280' }}>
                                📐 Formato
                            </label>
                            <select
                                value={formato}
                                onChange={(e) => setFormato(e.target.value)}
                                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                                style={{
                                    background: 'rgba(255, 255, 255, 0.8)',
                                    border: '1px solid rgba(124, 58, 237, 0.15)',
                                    color: '#1e1b4b',
                                }}
                            >
                                {FORMATOS.map((f) => (
                                    <option key={f} value={f}>{f === 'Auto' ? '🔄 Auto' : f}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex items-end pb-0.5">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={includeTrends}
                                    onChange={(e) => setIncludeTrends(e.target.checked)}
                                    className="rounded"
                                    style={{ accentColor: '#7c3aed' }}
                                />
                                <span className="text-xs font-medium" style={{ color: '#6b7280' }}>
                                    📊 Incluir tendencias
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* Generate button */}
                    <button
                        onClick={handleGenerate}
                        disabled={generating || !idea.trim() || !aiHealthy}
                        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-semibold transition-all duration-200 disabled:opacity-40"
                        style={{
                            background: generating
                                ? 'linear-gradient(135deg, #6b7280, #9ca3af)'
                                : 'linear-gradient(135deg, #7c3aed, #a855f7)',
                            boxShadow: generating ? 'none' : '0 4px 20px rgba(124, 58, 237, 0.3)',
                            transform: generating ? 'scale(0.98)' : 'scale(1)',
                        }}
                    >
                        {generating ? (
                            <>
                                <RefreshCw size={18} className="animate-spin" />
                                Generando con Ollama...
                            </>
                        ) : (
                            <>
                                <Sparkles size={18} />
                                Generar Post
                            </>
                        )}
                    </button>
                </div>
            </GlassCard>

            {/* Preview of last result */}
            {lastResult && (
                <GlassCard>
                    <h3 className="text-sm font-bold mb-3" style={{ color: '#1e1b4b' }}>
                        ✨ Preview del post generado
                    </h3>
                    <div
                        className="p-4 rounded-xl text-sm whitespace-pre-wrap"
                        style={{
                            background: 'rgba(124, 58, 237, 0.04)',
                            color: '#1e1b4b',
                            lineHeight: '1.6',
                            maxHeight: '300px',
                            overflowY: 'auto',
                        }}
                    >
                        {lastResult.content}
                    </div>
                    {lastResult.issues.length > 0 && (
                        <div className="mt-3 space-y-1">
                            {lastResult.issues.map((issue, i) => (
                                <div
                                    key={i}
                                    className="flex items-start gap-2 text-xs p-2 rounded-lg"
                                    style={{
                                        background: issue.type === 'critical' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                                        color: issue.type === 'critical' ? '#dc2626' : '#d97706',
                                    }}
                                >
                                    {issue.type === 'critical' ? <XCircle size={14} /> : <AlertTriangle size={14} />}
                                    {issue.detail}
                                </div>
                            ))}
                        </div>
                    )}
                </GlassCard>
            )}
        </>
    );
}

// ══════════════════════════════════════════════════════════════
// TAB 2 — PENDIENTES (Drafts + Approved)
// ══════════════════════════════════════════════════════════════

function PendingTab({
    account,
    showNotif,
}: {
    account: LinkedInAccount | null;
    showNotif: (type: 'success' | 'error', text: string) => void;
}) {
    const [drafts, setDrafts] = useState<ScheduledPost[]>([]);
    const [scheduled, setScheduled] = useState<ScheduledPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [feedbackId, setFeedbackId] = useState<string | null>(null);
    const [feedback, setFeedback] = useState('');
    const [actionInProgress, setActionInProgress] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            const [d, s] = await Promise.all([getDrafts(), getScheduledPosts()]);
            setDrafts(d);
            setScheduled(s);
        } catch (err) {
            console.error('Failed to load posts:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, 10000);
        return () => clearInterval(interval);
    }, [refresh]);

    const handleApprove = async (id: string) => {
        setActionInProgress(id);
        try {
            await approvePost(id);
            showNotif('success', '✅ Post aprobado y programado');
            await refresh();
        } catch (err: any) {
            showNotif('error', err.message);
        } finally {
            setActionInProgress(null);
        }
    };

    const handleReject = async (id: string) => {
        setActionInProgress(id);
        try {
            await rejectPost(id);
            showNotif('success', '❌ Post rechazado');
            await refresh();
        } catch (err: any) {
            showNotif('error', err.message);
        } finally {
            setActionInProgress(null);
        }
    };

    const handleRegenerate = async (id: string) => {
        if (!feedback.trim()) return;
        setActionInProgress(id);
        try {
            await regeneratePost(id, feedback.trim());
            showNotif('success', '🔄 Post regenerado con tu feedback');
            setFeedbackId(null);
            setFeedback('');
            await refresh();
        } catch (err: any) {
            showNotif('error', err.message);
        } finally {
            setActionInProgress(null);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Eliminar este post?')) return;
        try {
            await deletePost(id);
            showNotif('success', '🗑️ Post eliminado');
            await refresh();
        } catch (err: any) {
            showNotif('error', err.message);
        }
    };

    if (loading) {
        return (
            <div className="space-y-4">
                {[1, 2].map(i => (
                    <div key={i} className="rounded-2xl h-48 animate-pulse" style={{ background: 'rgba(124, 58, 237, 0.06)' }} />
                ))}
            </div>
        );
    }

    const allPosts = [...drafts, ...scheduled];

    if (allPosts.length === 0) {
        return (
            <GlassCard>
                <div className="text-center py-12">
                    <Clock size={40} color="#d1d5db" className="mx-auto mb-3" />
                    <p className="text-sm font-medium" style={{ color: '#6b7280' }}>
                        No hay posts pendientes
                    </p>
                    <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
                        Generá un post nuevo en la pestaña "Generar"
                    </p>
                </div>
            </GlassCard>
        );
    }

    return (
        <div className="space-y-4">
            {allPosts.map((post) => {
                const st = STATUS_CONFIG[post.status] || STATUS_CONFIG.draft;
                const engagement = ENGAGEMENT_COLORS[post.aiMetadata.predictedEngagement] || ENGAGEMENT_COLORS.medio;
                const isExpanded = expandedId === post._id;
                const isRegenerating = feedbackId === post._id;
                const isProcessing = actionInProgress === post._id;

                return (
                    <GlassCard key={post._id}>
                        {/* Header */}
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span
                                    className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide"
                                    style={{ background: st.bg, color: st.color }}
                                >
                                    {st.label}
                                </span>
                                <span
                                    className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                                    style={{ background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed' }}
                                >
                                    {post.aiMetadata.pilar}
                                </span>
                                <span
                                    className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                                    style={{ background: engagement.bg, color: engagement.color }}
                                >
                                    {engagement.label}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px]" style={{ color: '#9ca3af' }}>
                                <Clock size={12} />
                                {formatDate(post.scheduledAt)}
                            </div>
                        </div>

                        {/* Content Preview */}
                        <div
                            className="text-sm whitespace-pre-wrap cursor-pointer rounded-xl p-4 transition-all"
                            style={{
                                background: 'rgba(124, 58, 237, 0.03)',
                                color: '#1e1b4b',
                                lineHeight: '1.6',
                                maxHeight: isExpanded ? 'none' : '120px',
                                overflow: isExpanded ? 'visible' : 'hidden',
                            }}
                            onClick={() => setExpandedId(isExpanded ? null : post._id)}
                        >
                            {post.content}
                        </div>
                        {!isExpanded && post.content.length > 200 && (
                            <button
                                onClick={() => setExpandedId(post._id)}
                                className="flex items-center gap-1 text-xs font-medium mt-1"
                                style={{ color: '#7c3aed' }}
                            >
                                Ver más <ChevronDown size={12} />
                            </button>
                        )}

                        {/* Hashtags */}
                        {post.hashtags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-3">
                                {post.hashtags.map((tag, i) => (
                                    <span
                                        key={i}
                                        className="text-[11px] px-2 py-0.5 rounded-full"
                                        style={{
                                            background: 'rgba(124, 58, 237, 0.08)',
                                            color: '#7c3aed',
                                        }}
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Meta info */}
                        <div className="flex items-center gap-4 mt-3 text-[11px]" style={{ color: '#9ca3af' }}>
                            <span>📐 {post.aiMetadata.formato}</span>
                            <span>🪝 {post.aiMetadata.hookType}</span>
                            <span>⚡ {post.aiMetadata.generationTimeMs}ms</span>
                            <span>🤖 {post.aiMetadata.model}</span>
                        </div>

                        {/* Regeneration feedback bar */}
                        {isRegenerating && (
                            <div className="mt-4 flex gap-2">
                                <input
                                    type="text"
                                    value={feedback}
                                    onChange={(e) => setFeedback(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleRegenerate(post._id)}
                                    placeholder="Qué cambios querés? Ej: Hacelo más corto, más datos..."
                                    className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none"
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.8)',
                                        border: '1px solid rgba(124, 58, 237, 0.15)',
                                        color: '#1e1b4b',
                                    }}
                                    autoFocus
                                />
                                <button
                                    onClick={() => handleRegenerate(post._id)}
                                    disabled={!feedback.trim() || isProcessing}
                                    className="px-4 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40"
                                    style={{
                                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                    }}
                                >
                                    {isProcessing ? '⏳' : '🔄 Regenerar'}
                                </button>
                                <button
                                    onClick={() => { setFeedbackId(null); setFeedback(''); }}
                                    className="px-3 py-2.5 rounded-xl text-sm"
                                    style={{ color: '#6b7280' }}
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        )}

                        {/* Action buttons */}
                        {post.status === 'draft' && !isRegenerating && (
                            <div className="flex items-center gap-2 mt-4 pt-4" style={{ borderTop: '1px solid rgba(124, 58, 237, 0.08)' }}>
                                <button
                                    onClick={() => handleApprove(post._id)}
                                    disabled={isProcessing}
                                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-50"
                                    style={{
                                        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                        boxShadow: '0 4px 15px rgba(34, 197, 94, 0.25)',
                                    }}
                                >
                                    <ThumbsUp size={14} />
                                    {isProcessing ? '...' : 'Aprobar'}
                                </button>
                                <button
                                    onClick={() => setFeedbackId(post._id)}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                                    style={{
                                        background: 'rgba(245, 158, 11, 0.1)',
                                        color: '#d97706',
                                        border: '1px solid rgba(245, 158, 11, 0.2)',
                                    }}
                                >
                                    <RefreshCw size={14} />
                                    Regenerar
                                </button>
                                <button
                                    onClick={() => handleReject(post._id)}
                                    disabled={isProcessing}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                                    style={{
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        color: '#dc2626',
                                        border: '1px solid rgba(239, 68, 68, 0.2)',
                                    }}
                                >
                                    <ThumbsDown size={14} />
                                    Rechazar
                                </button>
                                <button
                                    onClick={() => handleDelete(post._id)}
                                    className="p-2 rounded-xl transition-all hover:scale-110 ml-auto"
                                    style={{ color: '#9ca3af' }}
                                    title="Eliminar"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        )}

                        {/* Approved posts show schedule info */}
                        {post.status === 'approved' && (
                            <div
                                className="flex items-center gap-2 mt-4 pt-4 text-sm"
                                style={{ borderTop: '1px solid rgba(124, 58, 237, 0.08)', color: '#3b82f6' }}
                            >
                                <Send size={14} />
                                Se publicará: {formatDate(post.scheduledAt)}
                                <button
                                    onClick={() => handleDelete(post._id)}
                                    className="ml-auto text-xs px-3 py-1 rounded-lg"
                                    style={{
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        color: '#dc2626',
                                    }}
                                >
                                    Cancelar
                                </button>
                            </div>
                        )}
                    </GlassCard>
                );
            })}
        </div>
    );
}

// ══════════════════════════════════════════════════════════════
// TAB 3 — HISTORIAL (Published)
// ══════════════════════════════════════════════════════════════

function HistoryTab() {
    const [posts, setPosts] = useState<ScheduledPost[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getPublishedPosts()
            .then(setPosts)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map(i => (
                    <div key={i} className="rounded-2xl h-32 animate-pulse" style={{ background: 'rgba(124, 58, 237, 0.06)' }} />
                ))}
            </div>
        );
    }

    if (posts.length === 0) {
        return (
            <GlassCard>
                <div className="text-center py-12">
                    <BarChart3 size={40} color="#d1d5db" className="mx-auto mb-3" />
                    <p className="text-sm font-medium" style={{ color: '#6b7280' }}>
                        No hay posts publicados aún
                    </p>
                    <p className="text-xs mt-1" style={{ color: '#9ca3af' }}>
                        Las métricas aparecerán acá después de publicar
                    </p>
                </div>
            </GlassCard>
        );
    }

    return (
        <div className="space-y-4">
            {posts.map((post) => {
                const eng = post.engagement;
                const hasMetrics = eng.impressions > 0 || eng.likes > 0;

                return (
                    <GlassCard key={post._id}>
                        {/* Top row */}
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 size={16} color="#16a34a" />
                                <span className="text-xs font-semibold" style={{ color: '#16a34a' }}>
                                    Publicado
                                </span>
                                <span className="text-[11px]" style={{ color: '#9ca3af' }}>
                                    {formatDate(post.publishedAt)}
                                </span>
                            </div>
                            <span
                                className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                                style={{ background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed' }}
                            >
                                {post.aiMetadata.pilar}
                            </span>
                        </div>

                        {/* Content snippet */}
                        <p
                            className="text-sm rounded-xl p-3"
                            style={{
                                background: 'rgba(124, 58, 237, 0.03)',
                                color: '#1e1b4b',
                                lineHeight: '1.5',
                                maxHeight: '80px',
                                overflow: 'hidden',
                            }}
                        >
                            {post.content.substring(0, 150)}
                            {post.content.length > 150 ? '...' : ''}
                        </p>

                        {/* Metrics row */}
                        {hasMetrics && (
                            <div className="flex items-center gap-5 mt-4 pt-3" style={{ borderTop: '1px solid rgba(124, 58, 237, 0.05)' }}>
                                <MetricBadge icon={<Eye size={14} />} value={eng.impressions} label="Vistas" />
                                <MetricBadge icon={<Heart size={14} />} value={eng.likes} label="Likes" color="#ef4444" />
                                <MetricBadge icon={<MessageCircle size={14} />} value={eng.comments} label="Coments" color="#3b82f6" />
                                <MetricBadge icon={<Share2 size={14} />} value={eng.shares} label="Shares" color="#8b5cf6" />
                                {eng.engagementRate > 0 && (
                                    <div className="flex items-center gap-1 ml-auto">
                                        <TrendingUp size={14} color="#16a34a" />
                                        <span className="text-sm font-bold" style={{ color: '#16a34a' }}>
                                            {eng.engagementRate.toFixed(1)}%
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {!hasMetrics && (
                            <div className="flex items-center gap-2 mt-3 text-[11px]" style={{ color: '#9ca3af' }}>
                                <Clock size={12} />
                                Métricas pendientes — se scrapean a las 4h, 24h y 7d
                            </div>
                        )}

                        {/* LinkedIn URL */}
                        {post.linkedinPostUrl && (
                            <a
                                href={post.linkedinPostUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs mt-2 font-medium"
                                style={{ color: '#7c3aed' }}
                            >
                                🔗 Ver en LinkedIn
                            </a>
                        )}
                    </GlassCard>
                );
            })}
        </div>
    );
}

// ── Metric Badge ────────────────────────────────────────────

function MetricBadge({
    icon,
    value,
    label,
    color = '#6b7280',
}: {
    icon: React.ReactNode;
    value: number;
    label: string;
    color?: string;
}) {
    return (
        <div className="flex items-center gap-1.5">
            <span style={{ color }}>{icon}</span>
            <div>
                <span className="text-sm font-bold" style={{ color: '#1e1b4b' }}>
                    {value >= 1000 ? `${(value / 1000).toFixed(1)}K` : value}
                </span>
                <span className="text-[10px] ml-1" style={{ color: '#9ca3af' }}>
                    {label}
                </span>
            </div>
        </div>
    );
}
