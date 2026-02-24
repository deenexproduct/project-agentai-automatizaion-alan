import { useState, useEffect, useCallback } from 'react';
import {
    Shield, ShieldAlert, ShieldCheck, ShieldOff,
    Plus, Star, Trash2, RotateCcw, Clock,
    Activity, User, AlertTriangle, CheckCircle2,
    ChevronDown, ChevronUp, Zap,
} from 'lucide-react';
import {
    getAccounts, getCircuitStatus, resetCircuit,
    createAccount, setActiveAccount, disableAccount,
    getAuditLog,
    type LinkedInAccount, type CircuitStatus, type AuditEvent,
} from '../../services/linkedin-accounts.service';

// ── Helpers ────────────────────────────────────────────────────

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
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
}

const STATUS_CONFIG: Record<string, { bg: string; color: string; label: string; icon: string }> = {
    active: { bg: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', label: 'Activa', icon: '🟢' },
    disabled: { bg: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', label: 'Deshabilitada', icon: '🔴' },
    reauth_required: { bg: 'rgba(245, 158, 11, 0.1)', color: '#d97706', label: 'Re-auth', icon: '🟡' },
};

const CIRCUIT_CONFIG: Record<string, { bg: string; color: string; label: string; Icon: React.ElementType }> = {
    CLOSED: { bg: 'rgba(34, 197, 94, 0.1)', color: '#16a34a', label: 'Cerrado', Icon: ShieldCheck },
    OPEN: { bg: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', label: 'Abierto', Icon: ShieldAlert },
    HALF_OPEN: { bg: 'rgba(245, 158, 11, 0.1)', color: '#d97706', label: 'Semi-abierto', Icon: Shield },
};

const AUDIT_ICONS: Record<string, string> = {
    cookies_saved: '💾',
    cookies_loaded: '📂',
    session_verified: '✅',
    session_restored: '🔄',
    session_expired: '⏰',
    session_expiring_soon: '⚠️',
    reauth_required: '🔒',
    account_switch: '🔀',
    circuit_opened: '🔴',
    circuit_closed: '🟢',
    key_rotated: '🔑',
    account_created: '➕',
};

// ── Card Wrapper ───────────────────────────────────────────────

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

// ── Main Component ─────────────────────────────────────────────

export default function ConfigPage() {
    const [accounts, setAccounts] = useState<LinkedInAccount[]>([]);
    const [circuits, setCircuits] = useState<Record<string, CircuitStatus>>({});
    const [auditLog, setAuditLog] = useState<AuditEvent[]>([]);
    const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [newLabel, setNewLabel] = useState('');
    const [creating, setCreating] = useState(false);
    const [showNewForm, setShowNewForm] = useState(false);
    const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [expandedAudit, setExpandedAudit] = useState(false);

    const showNotif = (type: 'success' | 'error', text: string) => {
        setNotification({ type, text });
        setTimeout(() => setNotification(null), 4000);
    };

    // ── Fetch Data ─────────────────────────────────
    const refresh = useCallback(async () => {
        try {
            const accs = await getAccounts();
            setAccounts(accs);

            // Find active account
            const active = accs.find(a => a.status === 'active');
            if (active) {
                setActiveAccountId(active._id);
                // Fetch circuit for each account
                const circuitMap: Record<string, CircuitStatus> = {};
                for (const acc of accs) {
                    try {
                        circuitMap[acc._id] = await getCircuitStatus(acc._id);
                    } catch { /* skip */ }
                }
                setCircuits(circuitMap);

                // Fetch audit for active account
                try {
                    const events = await getAuditLog(active._id);
                    setAuditLog(events);
                } catch { /* skip */ }
            }
        } catch (err) {
            console.error('Failed to load accounts:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
        const interval = setInterval(refresh, 15000);
        return () => clearInterval(interval);
    }, [refresh]);

    // ── Actions ────────────────────────────────────
    const handleCreate = async () => {
        if (!newLabel.trim()) return;
        setCreating(true);
        try {
            await createAccount(newLabel.trim());
            setNewLabel('');
            setShowNewForm(false);
            showNotif('success', `✅ Cuenta "${newLabel}" creada`);
            await refresh();
        } catch (err: any) {
            showNotif('error', err.message);
        } finally {
            setCreating(false);
        }
    };

    const handleSetActive = async (id: string) => {
        try {
            await setActiveAccount(id);
            showNotif('success', '✅ Cuenta activada');
            await refresh();
        } catch (err: any) {
            showNotif('error', err.message);
        }
    };

    const handleDisable = async (id: string, label: string) => {
        if (!confirm(`¿Deshabilitar la cuenta "${label}"?`)) return;
        try {
            await disableAccount(id);
            showNotif('success', `🗑️ Cuenta "${label}" deshabilitada`);
            await refresh();
        } catch (err: any) {
            showNotif('error', err.message);
        }
    };

    const handleResetCircuit = async (id: string) => {
        try {
            await resetCircuit(id);
            showNotif('success', '⚡ Circuit breaker reseteado');
            await refresh();
        } catch (err: any) {
            showNotif('error', err.message);
        }
    };

    // ── Loading State ──────────────────────────────
    if (loading) {
        return (
            <div className="max-w-3xl mx-auto space-y-6">
                {[1, 2, 3].map(i => (
                    <div key={i} className="rounded-2xl h-40 animate-pulse" style={{ background: 'rgba(124, 58, 237, 0.06)' }} />
                ))}
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6 pb-20 md:pb-0">
            {/* ── Notification ────────────────────────── */}
            {notification && (
                <div
                    className="p-4 rounded-xl text-sm font-medium transition-all"
                    style={{
                        background: notification.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: notification.type === 'success' ? '#16a34a' : '#dc2626',
                        border: `1px solid ${notification.type === 'success' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
                    }}
                >
                    {notification.text}
                </div>
            )}

            {/* ══════════════════════════════════════════
                PANEL 1 — Cuentas LinkedIn
               ══════════════════════════════════════════ */}
            <GlassCard>
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{
                                background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                                boxShadow: '0 0 15px rgba(168, 85, 247, 0.3)',
                            }}
                        >
                            <User size={20} color="white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold" style={{ color: '#1e1b4b' }}>
                                Cuentas LinkedIn
                            </h2>
                            <span className="text-xs" style={{ color: '#9ca3af' }}>
                                {accounts.length} cuenta{accounts.length !== 1 ? 's' : ''} registrada{accounts.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={() => setShowNewForm(!showNewForm)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-sm font-semibold transition-all duration-200"
                        style={{
                            background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
                            boxShadow: '0 4px 15px rgba(124, 58, 237, 0.25)',
                            transform: showNewForm ? 'scale(0.97)' : 'scale(1)',
                        }}
                    >
                        <Plus size={16} />
                        Nueva
                    </button>
                </div>

                {/* New Account Form */}
                {showNewForm && (
                    <div
                        className="flex gap-2 mb-4 p-4 rounded-xl"
                        style={{
                            background: 'rgba(124, 58, 237, 0.04)',
                            border: '1px solid rgba(124, 58, 237, 0.12)',
                        }}
                    >
                        <input
                            type="text"
                            value={newLabel}
                            onChange={(e) => setNewLabel(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                            placeholder="Nombre de la cuenta (ej: cuenta-principal)"
                            className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                            style={{
                                background: 'rgba(255, 255, 255, 0.8)',
                                border: '1px solid rgba(124, 58, 237, 0.15)',
                                color: '#1e1b4b',
                            }}
                            autoFocus
                        />
                        <button
                            onClick={handleCreate}
                            disabled={creating || !newLabel.trim()}
                            className="px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-40"
                            style={{
                                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                                boxShadow: '0 4px 15px rgba(34, 197, 94, 0.25)',
                            }}
                        >
                            {creating ? '⏳' : '✓ Crear'}
                        </button>
                    </div>
                )}

                {/* Account List */}
                {accounts.length === 0 ? (
                    <div className="text-center py-10">
                        <User size={40} color="#d1d5db" className="mx-auto mb-3" />
                        <p className="text-sm" style={{ color: '#9ca3af' }}>
                            No hay cuentas configuradas.<br />
                            Creá una para empezar.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {accounts.map((acc) => {
                            const st = STATUS_CONFIG[acc.status] || STATUS_CONFIG.active;
                            const isActive = acc._id === activeAccountId && acc.status === 'active';

                            return (
                                <div
                                    key={acc._id}
                                    className="flex items-center justify-between p-4 rounded-xl transition-all duration-200"
                                    style={{
                                        background: isActive ? 'rgba(124, 58, 237, 0.06)' : 'rgba(0, 0, 0, 0.02)',
                                        border: isActive ? '1px solid rgba(124, 58, 237, 0.2)' : '1px solid transparent',
                                    }}
                                >
                                    <div className="flex items-center gap-3">
                                        {/* Status dot */}
                                        <div
                                            className="w-2.5 h-2.5 rounded-full shrink-0"
                                            style={{
                                                background: st.color,
                                                boxShadow: isActive ? `0 0 8px ${st.color}40` : 'none',
                                                animation: isActive ? 'pulse 2s infinite' : 'none',
                                            }}
                                        />
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-sm" style={{ color: '#1e1b4b' }}>
                                                    {acc.label}
                                                </span>
                                                {isActive && (
                                                    <span
                                                        className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                                                        style={{
                                                            background: 'rgba(124, 58, 237, 0.15)',
                                                            color: '#7c3aed',
                                                        }}
                                                    >
                                                        ACTIVA
                                                    </span>
                                                )}
                                                <span
                                                    className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                                    style={{ background: st.bg, color: st.color }}
                                                >
                                                    {st.label}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-[11px]" style={{ color: '#9ca3af' }}>
                                                    🍪 {acc.cookieCount || 0} cookies
                                                </span>
                                                <span className="text-[11px]" style={{ color: '#9ca3af' }}>
                                                    🕐 {timeAgo(acc.lastUsedAt)}
                                                </span>
                                                {acc.expiresAt && (
                                                    <span className="text-[11px]" style={{ color: '#9ca3af' }}>
                                                        ⏳ Expira: {formatDate(acc.expiresAt)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-1.5">
                                        {!isActive && acc.status !== 'disabled' && (
                                            <button
                                                onClick={() => handleSetActive(acc._id)}
                                                className="p-2 rounded-lg transition-all hover:scale-110"
                                                style={{ color: '#7c3aed' }}
                                                title="Activar cuenta"
                                            >
                                                <Star size={16} />
                                            </button>
                                        )}
                                        {acc.status !== 'disabled' && (
                                            <button
                                                onClick={() => handleDisable(acc._id, acc.label)}
                                                className="p-2 rounded-lg transition-all hover:scale-110"
                                                style={{ color: '#ef4444' }}
                                                title="Deshabilitar cuenta"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </GlassCard>

            {/* ══════════════════════════════════════════
                PANEL 2 — Circuit Breaker
               ══════════════════════════════════════════ */}
            <GlassCard>
                <div className="flex items-center gap-3 mb-5">
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{
                            background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                            boxShadow: '0 0 15px rgba(245, 158, 11, 0.3)',
                        }}
                    >
                        <Zap size={20} color="white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold" style={{ color: '#1e1b4b' }}>
                            Circuit Breaker
                        </h2>
                        <span className="text-xs" style={{ color: '#9ca3af' }}>
                            Protección contra fallos repetidos
                        </span>
                    </div>
                </div>

                {accounts.length === 0 ? (
                    <p className="text-sm text-center py-6" style={{ color: '#9ca3af' }}>
                        Sin cuentas registradas
                    </p>
                ) : (
                    <div className="space-y-3">
                        {accounts.map((acc) => {
                            const circuit = circuits[acc._id];
                            const cfg = (circuit && CIRCUIT_CONFIG[circuit.state]) ? CIRCUIT_CONFIG[circuit.state] : CIRCUIT_CONFIG.CLOSED;
                            const CIcon = cfg.Icon;
                            const cooldownMin = circuit?.cooldownRemainingMs
                                ? Math.ceil(circuit.cooldownRemainingMs / 60000)
                                : null;

                            return (
                                <div
                                    key={acc._id}
                                    className="flex items-center justify-between p-4 rounded-xl"
                                    style={{
                                        background: cfg.bg,
                                        border: `1px solid ${cfg.color}20`,
                                    }}
                                >
                                    <div className="flex items-center gap-3">
                                        <CIcon size={22} color={cfg.color} />
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-sm" style={{ color: '#1e1b4b' }}>
                                                    {acc.label}
                                                </span>
                                                <span
                                                    className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide"
                                                    style={{ background: `${cfg.color}20`, color: cfg.color }}
                                                >
                                                    {cfg.label}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-[11px]" style={{ color: '#6b7280' }}>
                                                    Fallos: {circuit?.consecutiveFailures ?? 0}/5
                                                </span>
                                                {cooldownMin !== null && cooldownMin > 0 && (
                                                    <span className="text-[11px] flex items-center gap-1" style={{ color: '#ef4444' }}>
                                                        <Clock size={10} /> {cooldownMin}min restantes
                                                    </span>
                                                )}
                                                {circuit?.lastFailureReason && (
                                                    <span className="text-[11px] truncate max-w-[200px]" style={{ color: '#9ca3af' }}>
                                                        {circuit.lastFailureReason}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {circuit && circuit.state !== 'CLOSED' && (
                                        <button
                                            onClick={() => handleResetCircuit(acc._id)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 hover:scale-105"
                                            style={{
                                                background: 'rgba(255, 255, 255, 0.8)',
                                                color: cfg.color,
                                                border: `1px solid ${cfg.color}30`,
                                            }}
                                        >
                                            <RotateCcw size={12} />
                                            Reset
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </GlassCard>

            {/* ══════════════════════════════════════════
                PANEL 3 — Audit Log
               ══════════════════════════════════════════ */}
            <GlassCard>
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{
                                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                                boxShadow: '0 0 15px rgba(99, 102, 241, 0.3)',
                            }}
                        >
                            <Activity size={20} color="white" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold" style={{ color: '#1e1b4b' }}>
                                Audit Log
                            </h2>
                            <span className="text-xs" style={{ color: '#9ca3af' }}>
                                Últimos eventos de la cuenta activa
                            </span>
                        </div>
                    </div>

                    {auditLog.length > 5 && (
                        <button
                            onClick={() => setExpandedAudit(!expandedAudit)}
                            className="flex items-center gap-1 text-xs font-medium transition-all"
                            style={{ color: '#7c3aed' }}
                        >
                            {expandedAudit ? 'Ver menos' : `Ver todos (${auditLog.length})`}
                            {expandedAudit ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                    )}
                </div>

                {auditLog.length === 0 ? (
                    <div className="text-center py-8">
                        <Activity size={36} color="#d1d5db" className="mx-auto mb-3" />
                        <p className="text-sm" style={{ color: '#9ca3af' }}>
                            Sin eventos registrados
                        </p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {(expandedAudit ? auditLog : auditLog.slice(0, 5)).map((event, idx) => (
                            <div
                                key={event._id || idx}
                                className="flex items-start gap-3 py-2.5 px-3 rounded-lg transition-all hover:bg-purple-50/50"
                                style={{
                                    borderLeft: '2px solid rgba(124, 58, 237, 0.15)',
                                }}
                            >
                                <span className="text-base shrink-0 mt-0.5">
                                    {AUDIT_ICONS[event.eventType] || '📋'}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-semibold" style={{ color: '#1e1b4b' }}>
                                            {event.eventType.replace(/_/g, ' ')}
                                        </span>
                                        <span className="text-[10px]" style={{ color: '#9ca3af' }}>
                                            {timeAgo(event.createdAt)}
                                        </span>
                                    </div>
                                    {event.details && Object.keys(event.details).length > 0 && (
                                        <p className="text-[11px] mt-0.5 truncate" style={{ color: '#6b7280' }}>
                                            {Object.entries(event.details)
                                                .filter(([k]) => !k.includes('cookie') && !k.includes('Cookie'))
                                                .map(([k, v]) => `${k}: ${v}`)
                                                .join(' · ')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </GlassCard>

            {/* ── Animation styles ────────────────────── */}
            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            `}</style>
        </div>
    );
}
