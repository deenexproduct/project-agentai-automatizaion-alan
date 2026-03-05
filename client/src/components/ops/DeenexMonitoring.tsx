import { useState, useEffect, useCallback } from 'react';
import {
    Loader2, RefreshCw, Users, ShoppingCart, DollarSign, TrendingUp,
    Award, MapPin, Megaphone, ChevronDown, ChevronUp, Store,
    Heart, AlertTriangle, Moon, Zap, Star, Package, Ticket,
    MessageCircle, Bell, Image, BarChart3, Filter, UserCheck, UserX, ArrowRightLeft
} from 'lucide-react';
import {
    getDeenexOverview,
    getDeenexBrands,
    getDeenexClientStats,
    getDeenexOrderStats,
    getDeenexPointsStats,
    getDeenexTopProducts,
    getDeenexEngagementStats,
    getDeenexLocationsLeaderboard,
    DeenexFilters,
} from '../../services/deenex-monitoring.service';

// ── Types ────────────────────────────────────────────────────
interface OverviewData {
    localesActivosConVentas: number;
    totalPedidos: number;
    facturacionTotal: number;
    usuariosRegistrados: number;
    usuariosInvitados: number;
    tasaInvitadosARegistrados: number;
}

// ── Glassmorphic card wrapper ────────────────────────────────
const GlassCard = ({ children, className = '', style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) => (
    <div
        className={`rounded-2xl p-5 transition-all duration-200 ${className}`}
        style={{
            background: 'rgba(255, 255, 255, 0.75)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(59, 130, 246, 0.08)',
            boxShadow: '0 4px 24px rgba(0, 0, 0, 0.04)',
            ...style,
        }}
    >
        {children}
    </div>
);

// ── KPI mini-card ────────────────────────────────────────────
const KpiCard = ({ label, value, icon: Icon, color, bg, subtitle }: {
    label: string; value: string | number; icon: React.ElementType;
    color: string; bg: string; subtitle?: string;
}) => (
    <GlassCard className="hover:scale-[1.02]">
        <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: bg }}>
                <Icon size={20} color={color} />
            </div>
        </div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-sm text-gray-500 mt-0.5">{label}</div>
        {subtitle && <div className="text-xs mt-1" style={{ color }}>{subtitle}</div>}
    </GlassCard>
);

// ── Collapsible section ──────────────────────────────────────
const Section = ({ title, emoji, children, defaultOpen = true }: {
    title: string; emoji: string; children: React.ReactNode; defaultOpen?: boolean;
}) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <GlassCard style={{ padding: 0 }}>
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
                style={{ cursor: 'pointer', borderBottom: open ? '1px solid rgba(59,130,246,0.06)' : 'none' }}
            >
                <div className="flex items-center gap-2">
                    <span className="text-xl">{emoji}</span>
                    <h3 className="text-base font-semibold text-gray-800">{title}</h3>
                </div>
                {open ? <ChevronUp size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
            </button>
            {open && <div className="px-5 pb-5 pt-3">{children}</div>}
        </GlassCard>
    );
};

// ── Mini bar chart (pure CSS) ────────────────────────────────
const MiniBar = ({ items, maxValue }: { items: { label: string; value: number; color: string }[]; maxValue?: number }) => {
    const max = maxValue || Math.max(...items.map(i => i.value), 1);
    return (
        <div className="space-y-2">
            {items.map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                    <div className="text-xs text-gray-600 w-28 shrink-0 truncate" title={item.label}>{item.label}</div>
                    <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
                        <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${Math.max((item.value / max) * 100, 2)}%`, background: item.color }}
                        />
                    </div>
                    <div className="text-xs font-semibold text-gray-700 w-16 text-right">{item.value.toLocaleString()}</div>
                </div>
            ))}
        </div>
    );
};

// ── Donut stat ───────────────────────────────────────────────
const DonutStat = ({ value, total, label, color }: { value: number; total: number; label: string; color: string }) => {
    const pct = total > 0 ? (value / total) * 100 : 0;
    const circumference = 2 * Math.PI * 36;
    const offset = circumference - (pct / 100) * circumference;
    return (
        <div className="flex flex-col items-center gap-1">
            <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="36" fill="none" stroke="#f1f5f9" strokeWidth="6" />
                <circle
                    cx="40" cy="40" r="36" fill="none" stroke={color} strokeWidth="6"
                    strokeDasharray={circumference} strokeDashoffset={offset}
                    strokeLinecap="round" transform="rotate(-90 40 40)"
                    style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
                <text x="40" y="43" textAnchor="middle" fill="#1e293b" fontSize="14" fontWeight="700">
                    {Math.round(pct)}%
                </text>
            </svg>
            <div className="text-xs text-gray-600 text-center">{label}</div>
            <div className="text-sm font-bold" style={{ color }}>{value.toLocaleString()}</div>
        </div>
    );
};

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════
export default function DeenexMonitoring() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [overview, setOverview] = useState<OverviewData | null>(null);
    const [brands, setBrands] = useState<any[]>([]);
    const [clientStats, setClientStats] = useState<any>(null);
    const [orderStats, setOrderStats] = useState<any>(null);
    const [pointsStats, setPointsStats] = useState<any>(null);
    const [products, setProducts] = useState<any>(null);
    const [engagement, setEngagement] = useState<any>(null);
    const [leaderboard, setLeaderboard] = useState<any[]>([]);
    const [selectedBrand, setSelectedBrand] = useState<string>('');

    const filters: DeenexFilters = selectedBrand ? { brandId: selectedBrand } : {};

    const loadAll = useCallback(async (isRefresh = false) => {
        try {
            if (isRefresh) setRefreshing(true); else setLoading(true);
            setError(null);

            const [ov, br] = await Promise.all([
                getDeenexOverview(filters),
                getDeenexBrands(),
            ]);
            setOverview(ov);
            setBrands(br);

            // Load secondary data in parallel
            const [cl, or, pt, pr, en, lb] = await Promise.all([
                getDeenexClientStats(filters),
                getDeenexOrderStats(filters),
                getDeenexPointsStats(filters),
                getDeenexTopProducts(filters),
                getDeenexEngagementStats(filters),
                getDeenexLocationsLeaderboard(filters),
            ]);
            setClientStats(cl);
            setOrderStats(or);
            setPointsStats(pt);
            setProducts(pr);
            setEngagement(en);
            setLeaderboard(lb);
        } catch (err: any) {
            console.error('Deenex monitoring load error:', err);
            setError(err.message || 'Error cargando datos de monitoreo');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [selectedBrand]);

    useEffect(() => { loadAll(); }, [loadAll]);

    // ── Loading state ────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-96 gap-4">
                <div className="relative">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0ea5e9, #6366f1)', boxShadow: '0 0 30px rgba(99, 102, 241, 0.3)' }}>
                        <Loader2 size={28} color="#fff" className="animate-spin" />
                    </div>
                </div>
                <div className="text-gray-500 text-sm font-medium">Conectando con Deenex...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-96 gap-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
                    <AlertTriangle size={28} color="#ef4444" />
                </div>
                <div className="text-gray-600 text-sm">{error}</div>
                <button
                    onClick={() => loadAll()}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-white"
                    style={{ background: 'linear-gradient(135deg, #3b82f6, #6366f1)', cursor: 'pointer' }}
                >
                    Reintentar
                </button>
            </div>
        );
    }

    const COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];
    const ORDER_COLORS: Record<string, string> = { mesa: '#3b82f6', takeaway: '#22c55e', delivery: '#f59e0b' };
    const ORDER_LABELS: Record<string, string> = { mesa: 'Mesa', takeaway: 'Takeaway', delivery: 'Delivery' };
    const HEALTH_CONFIG = [
        { key: 'active', label: 'Activos', icon: Heart, color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
        { key: 'atRisk', label: 'En riesgo', icon: AlertTriangle, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
        { key: 'dormant', label: 'Dormidos', icon: Moon, color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
    ];

    return (
        <div className="py-4 space-y-5 max-w-[1400px] mx-auto">
            {/* ── Header ──────────────────────────────── */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold" style={{ background: 'linear-gradient(90deg, #0ea5e9, #6366f1) text', WebkitTextFillColor: 'transparent' }}>
                        Centro de Monitoreo
                    </h2>
                    <p className="text-sm text-gray-500 mt-0.5">Estadísticas en tiempo real — Base de datos Deenex</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Brand filter */}
                    {brands.length > 1 && (
                        <div className="relative">
                            <Filter size={14} color="#94a3b8" className="absolute left-3 top-1/2 -translate-y-1/2" />
                            <select
                                value={selectedBrand}
                                onChange={(e) => setSelectedBrand(e.target.value)}
                                className="pl-8 pr-3 py-2 rounded-xl text-sm border-0 appearance-none"
                                style={{
                                    background: 'rgba(255,255,255,0.8)',
                                    backdropFilter: 'blur(10px)',
                                    border: '1px solid rgba(59,130,246,0.12)',
                                    cursor: 'pointer',
                                    outline: 'none',
                                    minWidth: 180,
                                }}
                            >
                                <option value="">Todas las marcas</option>
                                {brands.map((b: any) => (
                                    <option key={b._id} value={b._id}>{b.appName || b.domain}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    <button
                        onClick={() => loadAll(true)}
                        disabled={refreshing}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all"
                        style={{
                            background: 'linear-gradient(135deg, #0ea5e9, #3b82f6)',
                            opacity: refreshing ? 0.7 : 1,
                            cursor: refreshing ? 'default' : 'pointer',
                            boxShadow: '0 4px 15px rgba(59,130,246,0.25)',
                        }}
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                        {refreshing ? 'Actualizando...' : 'Actualizar'}
                    </button>
                </div>
            </div>

            {/* ── KPI Overview Cards (6 métricas) ──────── */}
            {overview && (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    <KpiCard label="Locales Activos con Ventas" value={overview.localesActivosConVentas ?? 0} icon={MapPin} color="#0ea5e9" bg="rgba(14,165,233,0.1)" subtitle="Con al menos 1 pedido" />
                    <KpiCard label="Total Pedidos" value={(overview.totalPedidos ?? 0).toLocaleString()} icon={ShoppingCart} color="#8b5cf6" bg="rgba(139,92,246,0.1)" />
                    <KpiCard label="Facturación Total" value={`$${(overview.facturacionTotal ?? 0).toLocaleString()}`} icon={DollarSign} color="#22c55e" bg="rgba(34,197,94,0.1)" />
                    <KpiCard label="Usuarios Registrados" value={(overview.usuariosRegistrados ?? 0).toLocaleString()} icon={UserCheck} color="#3b82f6" bg="rgba(59,130,246,0.1)" subtitle="Google, Apple, Email, Facebook" />
                    <KpiCard label="Usuarios Invitados" value={(overview.usuariosInvitados ?? 0).toLocaleString()} icon={UserX} color="#f59e0b" bg="rgba(245,158,11,0.1)" />
                    <KpiCard label="Tasa Invitados / Registrados" value={`${overview.tasaInvitadosARegistrados ?? 0}%`} icon={ArrowRightLeft} color="#6366f1" bg="rgba(99,102,241,0.1)" subtitle="Proporción invitados vs registrados" />
                </div>
            )}

            {/* ── Brands overview ─────────────────────── */}
            {brands.length > 0 && !selectedBrand && (
                <Section title="Marcas Registradas" emoji="🏢" defaultOpen={false}>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {brands.map((brand: any) => (
                            <div
                                key={brand._id}
                                onClick={() => setSelectedBrand(brand._id)}
                                className="flex items-center gap-3 p-3 rounded-xl hover:scale-[1.01] transition-all"
                                style={{ background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.08)', cursor: 'pointer' }}
                            >
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ background: 'linear-gradient(135deg, #0ea5e9, #3b82f6)' }}>
                                    <Store size={18} color="#fff" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-gray-800 truncate">{brand.appName || brand.domain}</div>
                                    <div className="text-xs text-gray-500">{brand.localsCount} locales · {brand.clientsCount} clientes · {brand.ordersCount} pedidos</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* ── Clients Section ─────────────────────── */}
            {clientStats && (
                <Section title="Clientes" emoji="👥">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        {/* Health */}
                        <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">Salud de la Base</h4>
                            <div className="space-y-2">
                                {HEALTH_CONFIG.map(h => {
                                    const val = clientStats.health?.[h.key] || 0;
                                    const total = (clientStats.health?.active || 0) + (clientStats.health?.atRisk || 0) + (clientStats.health?.dormant || 0);
                                    const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                                    return (
                                        <div key={h.key} className="flex items-center gap-3 p-2.5 rounded-xl" style={{ background: h.bg }}>
                                            <h.icon size={16} color={h.color} />
                                            <div className="flex-1">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs font-medium text-gray-700">{h.label}</span>
                                                    <span className="text-xs font-bold" style={{ color: h.color }}>{val.toLocaleString()} ({pct}%)</span>
                                                </div>
                                                <div className="h-1.5 rounded-full mt-1" style={{ background: 'rgba(0,0,0,0.05)' }}>
                                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: h.color, transition: 'width 0.6s ease' }} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Registro */}
                        <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">Medio de Registro</h4>
                            <MiniBar
                                items={(clientStats.registrationMethods || []).map((r: any, i: number) => ({
                                    label: r.method || 'Desconocido',
                                    value: r.count,
                                    color: COLORS[i % COLORS.length],
                                }))}
                            />
                        </div>

                        {/* CLV & Conversion */}
                        <div className="space-y-4">
                            <div>
                                <h4 className="text-sm font-semibold text-gray-700 mb-2">Valor del Cliente</h4>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="p-3 rounded-xl" style={{ background: 'rgba(34,197,94,0.06)' }}>
                                        <div className="text-xs text-gray-500">CLV Promedio</div>
                                        <div className="text-lg font-bold text-gray-900">${clientStats.clv?.average?.toLocaleString()}</div>
                                    </div>
                                    <div className="p-3 rounded-xl" style={{ background: 'rgba(139,92,246,0.06)' }}>
                                        <div className="text-xs text-gray-500">CLV Máximo</div>
                                        <div className="text-lg font-bold text-gray-900">${clientStats.clv?.max?.toLocaleString()}</div>
                                    </div>
                                </div>
                            </div>
                            <div className="p-3 rounded-xl" style={{ background: 'rgba(59,130,246,0.06)' }}>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs text-gray-500">Tasa de Conversión</span>
                                    <span className="text-sm font-bold" style={{ color: '#3b82f6' }}>{clientStats.purchaseBehavior?.conversionRate}%</span>
                                </div>
                                <div className="text-xs text-gray-400 mt-0.5">{clientStats.purchaseBehavior?.totalBuyers?.toLocaleString()} compradores de {clientStats.total?.toLocaleString()} registrados</div>
                            </div>
                        </div>
                    </div>
                </Section>
            )}

            {/* ── Orders Section ──────────────────────── */}
            {orderStats && (
                <Section title="Pedidos" emoji="📦">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        {/* By type donut */}
                        <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">Por Tipo</h4>
                            <div className="flex justify-around">
                                {(orderStats.byType || []).map((t: any) => (
                                    <DonutStat
                                        key={t.type}
                                        value={t.count}
                                        total={orderStats.total}
                                        label={ORDER_LABELS[t.type] || t.type}
                                        color={ORDER_COLORS[t.type] || '#94a3b8'}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Monthly trend */}
                        <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">Tendencia Mensual</h4>
                            {orderStats.monthlyTrend?.length > 0 ? (
                                <MiniBar
                                    items={orderStats.monthlyTrend.map((m: any, i: number) => ({
                                        label: m.month,
                                        value: m.orders,
                                        color: COLORS[i % COLORS.length],
                                    }))}
                                />
                            ) : (
                                <div className="text-sm text-gray-400 italic">Sin datos de tendencia</div>
                            )}
                        </div>

                        {/* Payment methods & rating */}
                        <div className="space-y-4">
                            <div>
                                <h4 className="text-sm font-semibold text-gray-700 mb-2">Métodos de Pago</h4>
                                <MiniBar
                                    items={(orderStats.paymentMethods || []).slice(0, 5).map((p: any, i: number) => ({
                                        label: p.method || 'N/A',
                                        value: p.count,
                                        color: COLORS[i % COLORS.length],
                                    }))}
                                />
                            </div>
                            {orderStats.rating?.totalRated > 0 && (
                                <div className="flex items-center gap-2 p-3 rounded-xl" style={{ background: 'rgba(245,158,11,0.06)' }}>
                                    <Star size={18} color="#f59e0b" fill="#f59e0b" />
                                    <div>
                                        <div className="text-sm font-bold text-gray-800">{orderStats.rating.average} / 5</div>
                                        <div className="text-xs text-gray-500">{orderStats.rating.totalRated} valoraciones</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </Section>
            )}

            {/* ── Points Section ──────────────────────── */}
            {pointsStats && (
                <Section title="Ecosistema de Puntos" emoji="💰">
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                        <div className="p-3 rounded-xl" style={{ background: 'rgba(34,197,94,0.06)' }}>
                            <Zap size={16} color="#22c55e" />
                            <div className="text-lg font-bold text-gray-900 mt-1">{pointsStats.generated?.amount?.toLocaleString()}</div>
                            <div className="text-xs text-gray-500">Generados (Cashback)</div>
                        </div>
                        <div className="p-3 rounded-xl" style={{ background: 'rgba(59,130,246,0.06)' }}>
                            <ShoppingCart size={16} color="#3b82f6" />
                            <div className="text-lg font-bold text-gray-900 mt-1">{pointsStats.used?.amount?.toLocaleString()}</div>
                            <div className="text-xs text-gray-500">Usados (Compras)</div>
                        </div>
                        <div className="p-3 rounded-xl" style={{ background: 'rgba(239,68,68,0.06)' }}>
                            <AlertTriangle size={16} color="#ef4444" />
                            <div className="text-lg font-bold text-gray-900 mt-1">{pointsStats.expired?.amount?.toLocaleString()}</div>
                            <div className="text-xs text-gray-500">Expirados</div>
                        </div>
                        <div className="p-3 rounded-xl" style={{ background: 'rgba(139,92,246,0.06)' }}>
                            <Award size={16} color="#8b5cf6" />
                            <div className="text-lg font-bold text-gray-900 mt-1">{pointsStats.rewards?.amount?.toLocaleString()}</div>
                            <div className="text-xs text-gray-500">Recompensas</div>
                        </div>
                        <div className="p-3 rounded-xl flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.08), rgba(139,92,246,0.08))' }}>
                            <div className="text-2xl font-bold" style={{ color: '#6366f1' }}>{pointsStats.redemptionRate}%</div>
                            <div className="text-xs text-gray-600 text-center">Tasa de Redención</div>
                        </div>
                    </div>
                </Section>
            )}

            {/* ── Locations Leaderboard ───────────────── */}
            {leaderboard.length > 0 && (
                <Section title="Ranking de Locales" emoji="🏆">
                    <div className="space-y-2">
                        {leaderboard.slice(0, 10).map((local: any, i: number) => {
                            const maxRev = leaderboard[0]?.totalRevenue || 1;
                            const pct = (local.totalRevenue / maxRev) * 100;
                            return (
                                <div key={local._id} className="flex items-center gap-3 p-3 rounded-xl transition-all hover:bg-blue-50/30">
                                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                                        style={{
                                            background: i < 3 ? 'linear-gradient(135deg, #f59e0b, #f97316)' : 'rgba(148,163,184,0.15)',
                                            color: i < 3 ? '#fff' : '#64748b',
                                        }}>
                                        {i + 1}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-sm font-semibold text-gray-800 truncate">{local.name || 'Sin nombre'}</span>
                                            <span className="text-sm font-bold" style={{ color: '#22c55e' }}>${local.totalRevenue?.toLocaleString()}</span>
                                        </div>
                                        <div className="h-2 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
                                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #0ea5e9, #3b82f6)', transition: 'width 0.6s ease' }} />
                                        </div>
                                        <div className="flex gap-3 mt-1 text-xs text-gray-500">
                                            <span>{local.totalOrders} pedidos</span>
                                            <span>Ticket: ${local.avgTicket?.toLocaleString()}</span>
                                            {local.ordersByType && Object.entries(local.ordersByType).map(([type, count]) => (
                                                <span key={type} style={{ color: ORDER_COLORS[type] || '#94a3b8' }}>{ORDER_LABELS[type] || type}: {(count as number)}</span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex items-center w-5">
                                        {local.active ? <MapPin size={14} color="#22c55e" /> : <MapPin size={14} color="#ef4444" />}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Section>
            )}

            {/* ── Products Section ────────────────────── */}
            {products && (
                <Section title="Productos" emoji="🍽️" defaultOpen={false}>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <div>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="flex gap-2 text-sm">
                                    <span className="px-2 py-0.5 rounded-lg font-medium" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                                        <Package size={12} className="inline mr-1" />{products.activeProducts} activos
                                    </span>
                                    <span className="px-2 py-0.5 rounded-lg font-medium" style={{ background: 'rgba(148,163,184,0.1)', color: '#94a3b8' }}>
                                        {products.inactiveProducts} inactivos
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">Por Categoría</h4>
                            <MiniBar
                                items={(products.byCategory || []).slice(0, 8).map((c: any, i: number) => ({
                                    label: c.category,
                                    value: c.count,
                                    color: COLORS[i % COLORS.length],
                                }))}
                            />
                        </div>
                    </div>
                </Section>
            )}

            {/* ── Engagement Section ──────────────────── */}
            {engagement && (
                <Section title="Engagement & Marketing" emoji="📱" defaultOpen={false}>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="p-3 rounded-xl" style={{ background: 'rgba(236,72,153,0.06)' }}>
                            <Image size={16} color="#ec4899" />
                            <div className="text-lg font-bold text-gray-900 mt-1">{engagement.stories?.total}</div>
                            <div className="text-xs text-gray-500">Stories ({engagement.stories?.active} activas)</div>
                            <div className="text-xs text-gray-400 mt-0.5">{engagement.stories?.totalViews?.toLocaleString()} vistas</div>
                        </div>
                        <div className="p-3 rounded-xl" style={{ background: 'rgba(59,130,246,0.06)' }}>
                            <Bell size={16} color="#3b82f6" />
                            <div className="text-lg font-bold text-gray-900 mt-1">{engagement.notifications?.total}</div>
                            <div className="text-xs text-gray-500">Notificaciones</div>
                        </div>
                        <div className="p-3 rounded-xl" style={{ background: 'rgba(34,197,94,0.06)' }}>
                            <MessageCircle size={16} color="#22c55e" />
                            <div className="text-lg font-bold text-gray-900 mt-1">{engagement.whatsappCampaigns?.total}</div>
                            <div className="text-xs text-gray-500">Campañas WhatsApp</div>
                        </div>
                        <div className="p-3 rounded-xl" style={{ background: 'rgba(245,158,11,0.06)' }}>
                            <Ticket size={16} color="#f59e0b" />
                            <div className="text-lg font-bold text-gray-900 mt-1">{engagement.coupons?.total}</div>
                            <div className="text-xs text-gray-500">Cupones</div>
                            {engagement.coupons?.byStatus?.map((s: any) => (
                                <div key={s.status} className="text-xs text-gray-400">{s.status}: {s.count}</div>
                            ))}
                        </div>
                    </div>
                </Section>
            )}

            {/* ── Footer ──────────────────────────────── */}
            <div className="text-center text-xs text-gray-400 py-2">
                <BarChart3 size={12} className="inline mr-1" />
                Datos obtenidos en modo lectura (GET only) — Base de datos producción Deenex
            </div>
        </div>
    );
}
