import { useState, useEffect, useCallback } from 'react';
import {
    Loader2, RefreshCw, ShoppingCart, DollarSign, TrendingUp,
    Award, MapPin, Store, Heart, AlertTriangle, Moon, Zap, Star,
    Package, Ticket, MessageCircle, Bell, Image, BarChart3, Filter,
    UserCheck, UserX, ArrowRightLeft, Receipt, CircleDollarSign,
    Navigation, Activity, CreditCard, Users, ChevronRight
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
import SearchableSelect from '../common/SearchableSelect';

// ── Types ────────────────────────────────────────────────────
interface OverviewData {
    localesActivosConVentas: number;
    totalPedidos: number;
    facturacionTotal: number;
    usuariosRegistrados: number;
    usuariosInvitados: number;
    tasaDeRegistro: number;
}

// ══════════════════════════════════════════════════════════════
// DESIGN TOKENS
// ══════════════════════════════════════════════════════════════
const PALETTE = {
    indigo: '#6366f1',
    violet: '#8b5cf6',
    sky: '#0ea5e9',
    emerald: '#22c55e',
    amber: '#f59e0b',
    rose: '#ec4899',
    red: '#ef4444',
    teal: '#14b8a6',
    slate: '#94a3b8',
    orange: '#f97316',
};

const COLORS = [PALETTE.indigo, PALETTE.sky, PALETTE.emerald, PALETTE.amber, PALETTE.rose, PALETTE.teal, PALETTE.violet, PALETTE.red];

const rgba = (hex: string, a: number) => {
    const h = hex.replace('#', '');
    return `rgba(${parseInt(h.substring(0, 2), 16)},${parseInt(h.substring(2, 4), 16)},${parseInt(h.substring(4, 6), 16)},${a})`;
};

// ══════════════════════════════════════════════════════════════
// DESIGN COMPONENTS
// ══════════════════════════════════════════════════════════════

/* ── Glass card ───────────────────────────────────────────── */
const Card = ({ children, className = '', style, onClick }: { children: React.ReactNode; className?: string; style?: React.CSSProperties; onClick?: () => void }) => (
    <div className={`rounded-3xl p-7 ${className}`}
        onClick={onClick}
        style={{
            background: 'rgba(255,255,255,0.72)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.7)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 4px 24px rgba(99,102,241,0.04)',
            ...style,
        }}>
        {children}
    </div>
);

/* ── Section divider title ────────────────────────────────── */
const SectionDivider = ({ title, icon: Icon, color }: { title: string; icon: React.ElementType; color: string }) => (
    <div className="flex items-center gap-3 pt-4 pb-2">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: rgba(color, 0.1) }}>
            <Icon size={20} color={color} />
        </div>
        <h3 className="text-lg font-extrabold text-gray-800 tracking-tight">{title}</h3>
    </div>
);

/* ── Hero KPI card (big number) ───────────────────────────── */
const HeroKPI = ({ icon: Icon, label, value, color, subtitle }: {
    icon: React.ElementType; label: string; value: string | number;
    color: string; subtitle?: string;
}) => (
    <Card className="flex flex-col items-center justify-center text-center py-8 hover:scale-[1.02] transition-transform duration-300">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: rgba(color, 0.1) }}>
            <Icon size={24} color={color} />
        </div>
        <div className="text-3xl lg:text-4xl font-black text-gray-900 tracking-tight leading-none">{String(value)}</div>
        <div className="text-sm text-gray-500 font-semibold mt-2">{label}</div>
        {subtitle && <div className="text-xs font-medium mt-1" style={{ color }}>{subtitle}</div>}
    </Card>
);

/* ── Horizontal bar chart (spacious) ──────────────────────── */
const BarChart = ({ items, formatValue, title }: {
    items: { label: string; value: number; color: string }[];
    formatValue?: (v: number) => string;
    title?: string;
}) => {
    const safe = (items || []).map(i => ({
        label: String(i?.label ?? 'N/A'),
        value: typeof i?.value === 'number' && !isNaN(i.value) ? i.value : 0,
        color: String(i?.color ?? PALETTE.slate),
    }));
    const max = Math.max(...safe.map(i => i.value), 1);
    if (safe.length === 0) return <div className="text-sm text-gray-400 italic py-4">Sin datos disponibles</div>;
    return (
        <div>
            {title && <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">{title}</div>}
            <div className="space-y-4">
                {safe.map((item, i) => (
                    <div key={i}>
                        <div className="flex justify-between items-baseline mb-1.5">
                            <span className="text-sm font-semibold text-gray-700">{item.label}</span>
                            <span className="text-sm font-bold text-gray-900">
                                {formatValue ? formatValue(item.value) : item.value.toLocaleString()}
                            </span>
                        </div>
                        <div className="h-3 rounded-full overflow-hidden" style={{ background: rgba(item.color, 0.08) }}>
                            <div className="h-full rounded-full transition-all duration-1000 ease-out"
                                style={{ width: `${Math.max((item.value / max) * 100, 4)}%`, background: `linear-gradient(90deg, ${item.color}, ${rgba(item.color, 0.7)})` }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

/* ── Donut chart (larger) ─────────────────────────────────── */
const DonutChart = ({ value, total, label, color, sublabel, size = 120 }: {
    value: number; total: number; label: string; color: string; sublabel?: string; size?: number;
}) => {
    const pct = total > 0 ? (value / total) * 100 : 0;
    const r = (size - 16) / 2;
    const c = 2 * Math.PI * r;
    const offset = c - (pct / 100) * c;
    return (
        <div className="flex flex-col items-center gap-3">
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={rgba(color, 0.08)} strokeWidth="10" />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="10"
                    strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
                    transform={`rotate(-90 ${size / 2} ${size / 2})`}
                    style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)' }}
                />
                <text x={size / 2} y={size / 2 + 1} textAnchor="middle" dominantBaseline="middle" fill="#1e293b" fontSize="22" fontWeight="900">
                    {Math.round(pct)}%
                </text>
            </svg>
            <div className="text-center">
                <div className="text-xl font-black" style={{ color }}>{value.toLocaleString()}</div>
                <div className="text-sm text-gray-600 font-semibold">{label}</div>
                {sublabel && <div className="text-xs text-gray-400 mt-0.5">{sublabel}</div>}
            </div>
        </div>
    );
};

/* ── Mini stat block ──────────────────────────────────────── */
const StatBlock = ({ label, value, icon: Icon, color, sub }: {
    label: string; value: string | number; icon?: React.ElementType; color: string; sub?: string;
}) => (
    <div className="p-5 rounded-2xl text-center" style={{ background: rgba(color, 0.04) }}>
        {Icon && <Icon size={18} color={color} className="mx-auto mb-2" />}
        <div className="text-2xl font-black text-gray-900">{String(value)}</div>
        <div className="text-xs text-gray-500 font-semibold mt-1">{label}</div>
        {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
);

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
            const [ov, br] = await Promise.all([getDeenexOverview(filters), getDeenexBrands()]);
            setOverview(ov); setBrands(br);
            const [cl, or, pt, pr, en, lb] = await Promise.all([
                getDeenexClientStats(filters), getDeenexOrderStats(filters),
                getDeenexPointsStats(filters), getDeenexTopProducts(filters),
                getDeenexEngagementStats(filters), getDeenexLocationsLeaderboard(filters),
            ]);
            setClientStats(cl); setOrderStats(or); setPointsStats(pt);
            setProducts(pr); setEngagement(en); setLeaderboard(lb);
        } catch (err: any) {
            console.error('Deenex monitoring load error:', err);
            setError(err.message || 'Error cargando datos de monitoreo');
        } finally { setLoading(false); setRefreshing(false); }
    }, [selectedBrand]);

    useEffect(() => { loadAll(); }, [loadAll]);

    // ── Loading state ──────────────────────────────────────────
    if (loading) return (
        <div className="flex flex-col items-center justify-center h-[60vh] gap-5">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 12px 40px rgba(99,102,241,0.35)' }}>
                <Loader2 size={28} color="#fff" className="animate-spin" />
            </div>
            <div className="text-gray-400 text-sm font-semibold tracking-wide">Conectando con Deenex…</div>
        </div>
    );

    if (error) return (
        <div className="flex flex-col items-center justify-center h-[60vh] gap-5">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: rgba(PALETTE.red, 0.1) }}>
                <AlertTriangle size={28} color={PALETTE.red} />
            </div>
            <div className="text-gray-500 text-sm text-center max-w-md">{error}</div>
            <button onClick={() => loadAll()}
                className="px-6 py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-105"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', cursor: 'pointer', boxShadow: '0 6px 20px rgba(99,102,241,0.35)' }}>
                Reintentar
            </button>
        </div>
    );

    const TYPE_LABELS: Record<string, string> = { mesa: 'Dine-in (Mesa)', takeaway: 'Takeaway', delivery: 'Delivery' };
    const TYPE_COLORS: Record<string, string> = { mesa: PALETTE.indigo, takeaway: PALETTE.sky, delivery: PALETTE.amber };
    const healthTotal = (clientStats?.health?.active || 0) + (clientStats?.health?.atRisk || 0) + (clientStats?.health?.dormant || 0);

    return (
        <div className="py-6 space-y-8 max-w-[1200px] mx-auto" style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>

            {/* ════════════════════════════════════════════════════
                 HEADER
                ════════════════════════════════════════════════════ */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-2">
                <div>
                    <h2 className="text-2xl font-black tracking-tight"
                        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Centro de Monitoreo
                    </h2>
                    <p className="text-sm text-gray-400 mt-1 font-medium">Estadísticas en tiempo real · Base de datos Deenex</p>
                </div>
                <div className="flex items-center gap-3 relative z-20">
                    {brands.length > 1 && (
                        <SearchableSelect
                            value={selectedBrand}
                            onChange={(val: string) => setSelectedBrand(val)}
                            options={[{ value: '', label: 'Todas las marcas' }, ...brands.map((b: any) => ({ value: b._id, label: b.appName || b.domain }))]}
                            placeholder="Todas las marcas"
                            containerClassName="w-[220px]"
                        />
                    )}
                    <button onClick={() => loadAll(true)} disabled={refreshing}
                        className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white transition-all hover:scale-105 active:scale-95 shrink-0"
                        style={{
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            opacity: refreshing ? 0.7 : 1,
                            cursor: refreshing ? 'default' : 'pointer',
                            boxShadow: '0 6px 24px rgba(99,102,241,0.3)',
                        }}>
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                        {refreshing ? 'Actualizando…' : 'Actualizar'}
                    </button>
                </div>
            </div>

            {/* ════════════════════════════════════════════════════
                 KPIs HERO — each one gets its own big card
                ════════════════════════════════════════════════════ */}
            {overview && (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-5">
                    <HeroKPI icon={MapPin} label="Locales Activos" value={overview.localesActivosConVentas ?? 0} color={PALETTE.indigo} subtitle="Con al menos 1 pedido" />
                    <HeroKPI icon={ShoppingCart} label="Total Pedidos" value={(overview.totalPedidos ?? 0).toLocaleString()} color={PALETTE.sky} />
                    <HeroKPI icon={DollarSign} label="Facturación Total" value={`$${(overview.facturacionTotal ?? 0).toLocaleString()}`} color={PALETTE.emerald} />
                    <HeroKPI icon={UserCheck} label="Usuarios Registrados" value={(overview.usuariosRegistrados ?? 0).toLocaleString()} color={PALETTE.violet} subtitle="Email, Google, Apple, Facebook" />
                    <HeroKPI icon={UserX} label="Usuarios Invitados" value={(overview.usuariosInvitados ?? 0).toLocaleString()} color={PALETTE.amber} />
                    <HeroKPI icon={ArrowRightLeft} label="Tasa de Registro" value={`${overview.tasaDeRegistro ?? 0}%`} color={PALETTE.rose} subtitle="Registrados sobre total" />
                </div>
            )}

            {/* ════════════════════════════════════════════════════
                 CLIENTES
                ════════════════════════════════════════════════════ */}
            {clientStats && (
                <>
                    <SectionDivider title="Clientes" icon={Users} color={PALETTE.indigo} />

                    {/* Salud de la Base — full width */}
                    <Card>
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-5">Salud de la Base de Clientes</div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                            {[
                                { label: 'Activos', value: clientStats.health?.active || 0, color: PALETTE.emerald, icon: Heart, desc: 'Compraron recientemente' },
                                { label: 'En Riesgo', value: clientStats.health?.atRisk || 0, color: PALETTE.amber, icon: AlertTriangle, desc: 'Sin actividad reciente' },
                                { label: 'Dormidos', value: clientStats.health?.dormant || 0, color: PALETTE.slate, icon: Moon, desc: 'Sin actividad prolongada' },
                            ].map(({ label, value, color, icon: Ic, desc }) => {
                                const pct = healthTotal > 0 ? Math.round((value / healthTotal) * 100) : 0;
                                return (
                                    <div key={label} className="p-5 rounded-2xl" style={{ background: rgba(color, 0.04) }}>
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: rgba(color, 0.12) }}>
                                                <Ic size={18} color={color} />
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-gray-700">{label}</div>
                                                <div className="text-xs text-gray-400">{desc}</div>
                                            </div>
                                        </div>
                                        <div className="text-3xl font-black text-gray-900 mb-2">{value.toLocaleString()} <span className="text-lg font-bold" style={{ color }}>({pct}%)</span></div>
                                        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: rgba(color, 0.1) }}>
                                            <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${Math.max(pct, 3)}%`, background: color }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </Card>

                    {/* Registro + Género — side by side */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <Card>
                            <BarChart title="Método de Registro"
                                items={(clientStats.registrationMethods || []).map((r: any, i: number) => ({
                                    label: r.method || 'Desconocido', value: r.count, color: COLORS[i % COLORS.length],
                                }))}
                            />
                        </Card>
                        <Card>
                            <BarChart title="Distribución por Género"
                                items={(clientStats.genderDistribution || []).map((g: any, i: number) => ({
                                    label: g.gender === 'male' ? '👨 Masculino' : g.gender === 'female' ? '👩 Femenino' : g.gender === 'no_especificado' ? '❓ No especificado' : (g.gender || '❓ Otro'),
                                    value: g.count, color: [PALETTE.indigo, PALETTE.rose, PALETTE.slate, PALETTE.sky][i % 4],
                                }))}
                            />
                        </Card>
                    </div>

                    {/* Valor del Cliente — dedicated row */}
                    <Card>
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-5">Valor del Cliente</div>
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                            <StatBlock label="CLV Promedio" value={`$${clientStats.clv?.average?.toLocaleString() || 0}`} icon={CircleDollarSign} color={PALETTE.emerald} />
                            <StatBlock label="CLV Máximo" value={`$${clientStats.clv?.max?.toLocaleString() || 0}`} icon={TrendingUp} color={PALETTE.violet} />
                            <StatBlock label="Revenue Total" value={`$${clientStats.clv?.totalRevenue?.toLocaleString() || 0}`} icon={DollarSign} color={PALETTE.sky} />
                            <StatBlock label="Compras Promedio" value={clientStats.purchaseBehavior?.avgPurchases || 0} icon={ShoppingCart} color={PALETTE.amber} sub="por comprador" />
                            <StatBlock label="Gasto Promedio" value={`$${clientStats.purchaseBehavior?.avgSpent?.toLocaleString() || 0}`} icon={Receipt} color={PALETTE.rose} sub="por comprador" />
                        </div>
                    </Card>

                    {/* Conversión — standalone */}
                    <Card className="flex items-center justify-between">
                        <div>
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Tasa de Conversión</div>
                            <div className="text-sm text-gray-500">{clientStats.purchaseBehavior?.totalBuyers?.toLocaleString() || 0} compradores de {clientStats.total?.toLocaleString() || 0} registrados</div>
                        </div>
                        <div className="text-5xl font-black" style={{ color: PALETTE.indigo }}>{clientStats.purchaseBehavior?.conversionRate || 0}%</div>
                    </Card>
                </>
            )}

            {/* ════════════════════════════════════════════════════
                 PEDIDOS
                ════════════════════════════════════════════════════ */}
            {orderStats && (
                <>
                    <SectionDivider title="Pedidos" icon={ShoppingCart} color={PALETTE.sky} />

                    {/* Billing KPIs */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                        <StatBlock label="Facturación Total" value={`$${orderStats.billing?.total?.toLocaleString() || 0}`} icon={CircleDollarSign} color={PALETTE.emerald} />
                        <StatBlock label="Ticket Promedio" value={`$${orderStats.billing?.avgTicket?.toLocaleString() || 0}`} icon={Receipt} color={PALETTE.indigo} />
                        <StatBlock label="Ticket Máximo" value={`$${orderStats.billing?.maxTicket?.toLocaleString() || 0}`} icon={TrendingUp} color={PALETTE.violet} />
                        {orderStats.rating?.totalRated > 0 && (
                            <StatBlock label={`${orderStats.rating.totalRated} reviews`} value={`${orderStats.rating.average} / 5`} icon={Star} color={PALETTE.amber} />
                        )}
                    </div>

                    {/* Canal distribution — donuts get their own space */}
                    <Card>
                        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-6">Distribución por Canal</div>
                        <div className="flex flex-wrap justify-center gap-12">
                            {(orderStats.byType || []).map((t: any) => (
                                <DonutChart key={t.type} value={t.count} total={orderStats.total}
                                    label={TYPE_LABELS[t.type] || t.type} color={TYPE_COLORS[t.type] || PALETTE.slate}
                                    sublabel={`$${(t.revenue || 0).toLocaleString()} revenue`} size={140} />
                            ))}
                        </div>
                    </Card>

                    {/* Revenue by channel + Payment methods — side by side */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <Card>
                            <BarChart title="Revenue por Canal"
                                items={(orderStats.byType || []).map((t: any, i: number) => ({
                                    label: TYPE_LABELS[t.type] || t.type, value: t.revenue || 0,
                                    color: TYPE_COLORS[t.type] || COLORS[i % COLORS.length],
                                }))} formatValue={v => `$${v.toLocaleString()}`} />
                        </Card>
                        <Card>
                            <BarChart title="Métodos de Pago"
                                items={(orderStats.paymentMethods || []).slice(0, 6).map((p: any, i: number) => ({
                                    label: p.method || 'N/A', value: p.count, color: COLORS[i % COLORS.length],
                                }))} />
                        </Card>
                    </div>

                    {/* Monthly trends — full width */}
                    {orderStats.monthlyTrend?.length > 0 && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                            <Card>
                                <BarChart title="Pedidos por Mes"
                                    items={orderStats.monthlyTrend.map((m: any, i: number) => ({
                                        label: m.month, value: m.orders, color: COLORS[i % COLORS.length],
                                    }))} />
                            </Card>
                            <Card>
                                <BarChart title="Facturación por Mes"
                                    items={orderStats.monthlyTrend.map((m: any, i: number) => ({
                                        label: m.month, value: m.revenue || 0,
                                        color: [PALETTE.emerald, PALETTE.sky, PALETTE.violet, PALETTE.amber, PALETTE.rose, PALETTE.teal][i % 6],
                                    }))} formatValue={v => `$${v.toLocaleString()}`} />
                            </Card>
                        </div>
                    )}
                </>
            )}

            {/* ════════════════════════════════════════════════════
                 ECOSISTEMA DE PUNTOS
                ════════════════════════════════════════════════════ */}
            {pointsStats && (
                <>
                    <SectionDivider title="Ecosistema de Puntos" icon={Zap} color={PALETTE.emerald} />

                    {/* Point stats — large individual cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-5">
                        <Card className="text-center !p-6">
                            <Zap size={20} color={PALETTE.emerald} className="mx-auto mb-2" />
                            <div className="text-2xl font-black text-gray-900">{(pointsStats.generated?.amount || 0).toLocaleString()}</div>
                            <div className="text-sm font-semibold text-gray-600 mt-1">Generados</div>
                            <div className="text-xs text-gray-400 mt-0.5">{(pointsStats.generated?.count || 0).toLocaleString()} transacciones</div>
                        </Card>
                        <Card className="text-center !p-6">
                            <ShoppingCart size={20} color={PALETTE.indigo} className="mx-auto mb-2" />
                            <div className="text-2xl font-black text-gray-900">{(pointsStats.used?.amount || 0).toLocaleString()}</div>
                            <div className="text-sm font-semibold text-gray-600 mt-1">Usados</div>
                            <div className="text-xs text-gray-400 mt-0.5">{(pointsStats.used?.count || 0).toLocaleString()} transacciones</div>
                        </Card>
                        <Card className="text-center !p-6">
                            <AlertTriangle size={20} color={PALETTE.red} className="mx-auto mb-2" />
                            <div className="text-2xl font-black text-gray-900">{(pointsStats.expired?.amount || 0).toLocaleString()}</div>
                            <div className="text-sm font-semibold text-gray-600 mt-1">Expirados</div>
                            <div className="text-xs text-gray-400 mt-0.5">{(pointsStats.expired?.count || 0).toLocaleString()} transacciones</div>
                        </Card>
                        <Card className="text-center !p-6">
                            <Award size={20} color={PALETTE.violet} className="mx-auto mb-2" />
                            <div className="text-2xl font-black text-gray-900">{(pointsStats.rewards?.amount || 0).toLocaleString()}</div>
                            <div className="text-sm font-semibold text-gray-600 mt-1">Recompensas</div>
                            <div className="text-xs text-gray-400 mt-0.5">{(pointsStats.rewards?.count || 0).toLocaleString()} transacciones</div>
                        </Card>
                        <Card className="text-center !p-6 flex flex-col items-center justify-center"
                            style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.06))' }}>
                            <div className="text-4xl font-black" style={{ color: PALETTE.indigo }}>{pointsStats.redemptionRate || 0}%</div>
                            <div className="text-sm font-semibold text-gray-600 mt-1">Tasa de Redención</div>
                        </Card>
                    </div>

                    {/* Breakdown by reason + status — side by side */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {pointsStats.byReason?.length > 0 && (
                            <Card>
                                <BarChart title="Detalle por Motivo"
                                    items={(pointsStats.byReason || []).map((r: any, i: number) => ({
                                        label: r.reason === 'cashback' ? 'Cashback' : r.reason === 'purchase' ? 'Compras' : r.reason === 'expiration' ? 'Expiración' : r.reason === 'reward' ? 'Recompensa' : r.reason === 'refund' ? 'Reembolso' : (r.reason || 'Otro'),
                                        value: Math.abs(r.amount), color: COLORS[i % COLORS.length],
                                    }))} />
                            </Card>
                        )}
                        {pointsStats.statusDistribution?.length > 0 && (
                            <Card>
                                <BarChart title="Distribución por Estado"
                                    items={(pointsStats.statusDistribution || []).map((s: any, i: number) => ({
                                        label: s.status === 'completed' ? '✅ Completado' : s.status === 'pending' ? '⏳ Pendiente' : s.status === 'expired' ? '❌ Expirado' : s.status === 'cancelled' ? '🚫 Cancelado' : (s.status || 'Otro'),
                                        value: s.count, color: [PALETTE.emerald, PALETTE.amber, PALETTE.red, PALETTE.slate, PALETTE.indigo][i % 5],
                                    }))} />
                            </Card>
                        )}
                    </div>
                </>
            )}

            {/* ════════════════════════════════════════════════════
                 RANKING DE LOCALES
                ════════════════════════════════════════════════════ */}
            {leaderboard.length > 0 && (
                <>
                    <SectionDivider title="Ranking de Locales" icon={MapPin} color={PALETTE.amber} />
                    <div className="space-y-4">
                        {leaderboard.slice(0, 10).map((local: any, i: number) => {
                            const maxRev = leaderboard[0]?.totalRevenue || 1;
                            const pct = (local.totalRevenue / maxRev) * 100;
                            const isTop3 = i < 3;
                            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
                            return (
                                <Card key={local._id} className="!p-5 hover:scale-[1.005] transition-transform">
                                    <div className="flex items-start gap-4">
                                        {/* Position badge */}
                                        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black shrink-0"
                                            style={{
                                                background: isTop3 ? 'linear-gradient(135deg, #f59e0b, #f97316)' : rgba(PALETTE.slate, 0.08),
                                                color: isTop3 ? '#fff' : '#64748b',
                                                boxShadow: isTop3 ? '0 4px 12px rgba(245,158,11,0.3)' : 'none',
                                            }}>
                                            {medal || (i + 1)}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between mb-2">
                                                <div>
                                                    <div className="text-base font-extrabold text-gray-800">{local.name || 'Sin nombre'}</div>
                                                    {local.address && (
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <Navigation size={10} color={PALETTE.slate} />
                                                            <span className="text-xs text-gray-400 truncate max-w-[400px]">{local.address}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-right shrink-0 ml-4">
                                                    <div className="text-xl font-black" style={{ color: PALETTE.emerald }}>${local.totalRevenue?.toLocaleString()}</div>
                                                    <div className="text-xs text-gray-400 font-medium">{local.totalOrders} pedidos · Ticket: ${local.avgTicket?.toLocaleString()}</div>
                                                </div>
                                            </div>

                                            {/* Revenue bar */}
                                            <div className="h-2 rounded-full overflow-hidden mb-3" style={{ background: rgba(PALETTE.indigo, 0.06) }}>
                                                <div className="h-full rounded-full transition-all duration-1000"
                                                    style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${PALETTE.indigo}, ${PALETTE.violet})` }} />
                                            </div>

                                            {/* Detail tags */}
                                            <div className="flex flex-wrap gap-2">
                                                {local.ordersByType && Object.entries(local.ordersByType).map(([type, count]) => (
                                                    <span key={type} className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                                                        style={{ background: rgba(TYPE_COLORS[type] || PALETTE.slate, 0.08), color: TYPE_COLORS[type] || PALETTE.slate }}>
                                                        {TYPE_LABELS[type] || type}: {count as number}
                                                    </span>
                                                ))}
                                                {(local.points?.generated > 0 || local.points?.used > 0) && (
                                                    <>
                                                        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                                                            style={{ background: rgba(PALETTE.emerald, 0.08), color: PALETTE.emerald }}>
                                                            Pts gen: {local.points.generated?.toLocaleString()}
                                                        </span>
                                                        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                                                            style={{ background: rgba(PALETTE.indigo, 0.08), color: PALETTE.indigo }}>
                                                            Pts usados: {local.points.used?.toLocaleString()}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                </>
            )}

            {/* ════════════════════════════════════════════════════
                 PRODUCTOS
                ════════════════════════════════════════════════════ */}
            {products && (
                <>
                    <SectionDivider title="Productos" icon={Package} color={PALETTE.violet} />
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                        <Card className="text-center !py-8">
                            <Package size={24} color={PALETTE.emerald} className="mx-auto mb-3" />
                            <div className="text-4xl font-black text-gray-900">{products.activeProducts || 0}</div>
                            <div className="text-sm font-semibold text-gray-500 mt-2">Productos Activos</div>
                        </Card>
                        <Card className="text-center !py-8">
                            <Package size={24} color={PALETTE.slate} className="mx-auto mb-3" />
                            <div className="text-4xl font-black text-gray-900">{products.inactiveProducts || 0}</div>
                            <div className="text-sm font-semibold text-gray-500 mt-2">Productos Inactivos</div>
                        </Card>
                        <Card className="text-center !py-8">
                            <BarChart3 size={24} color={PALETTE.indigo} className="mx-auto mb-3" />
                            <div className="text-4xl font-black text-gray-900">{products.totalProducts || (products.activeProducts || 0) + (products.inactiveProducts || 0)}</div>
                            <div className="text-sm font-semibold text-gray-500 mt-2">Total Productos</div>
                        </Card>
                    </div>
                    <Card>
                        <BarChart title="Distribución por Categoría"
                            items={(products.byCategory || []).slice(0, 10).map((c: any, i: number) => ({
                                label: typeof c.category === 'string' ? c.category : (c.category?.es || c.category?.en || 'Sin categoría'),
                                value: c.count || 0,
                                color: COLORS[i % COLORS.length],
                            }))} />
                    </Card>
                </>
            )}

            {/* ════════════════════════════════════════════════════
                 ENGAGEMENT & MARKETING
                ════════════════════════════════════════════════════ */}
            {engagement && (
                <>
                    <SectionDivider title="Engagement & Marketing" icon={Bell} color={PALETTE.rose} />
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                        <Card className="text-center !py-8 hover:scale-[1.02] transition-transform">
                            <Image size={24} color={PALETTE.rose} className="mx-auto mb-3" />
                            <div className="text-3xl font-black text-gray-900">{engagement.stories?.total || 0}</div>
                            <div className="text-sm font-semibold text-gray-600 mt-2">Stories</div>
                            <div className="text-xs text-gray-400 mt-1">{engagement.stories?.active || 0} activas · {(engagement.stories?.totalViews || 0).toLocaleString()} vistas</div>
                        </Card>
                        <Card className="text-center !py-8 hover:scale-[1.02] transition-transform">
                            <Bell size={24} color={PALETTE.indigo} className="mx-auto mb-3" />
                            <div className="text-3xl font-black text-gray-900">{engagement.notifications?.total || 0}</div>
                            <div className="text-sm font-semibold text-gray-600 mt-2">Notificaciones</div>
                            <div className="text-xs text-gray-400 mt-1">Push enviadas</div>
                        </Card>
                        <Card className="text-center !py-8 hover:scale-[1.02] transition-transform">
                            <MessageCircle size={24} color={PALETTE.emerald} className="mx-auto mb-3" />
                            <div className="text-3xl font-black text-gray-900">{engagement.whatsappCampaigns?.total || 0}</div>
                            <div className="text-sm font-semibold text-gray-600 mt-2">WhatsApp</div>
                            <div className="text-xs text-gray-400 mt-1">Campañas enviadas</div>
                        </Card>
                        <Card className="text-center !py-8 hover:scale-[1.02] transition-transform">
                            <Ticket size={24} color={PALETTE.amber} className="mx-auto mb-3" />
                            <div className="text-3xl font-black text-gray-900">{engagement.coupons?.total || 0}</div>
                            <div className="text-sm font-semibold text-gray-600 mt-2">Cupones</div>
                            {engagement.coupons?.byStatus?.length > 0 && (
                                <div className="text-xs text-gray-400 mt-1">
                                    {engagement.coupons.byStatus.map((s: any) => `${s.status}: ${s.count}`).join(' · ')}
                                </div>
                            )}
                        </Card>
                    </div>
                </>
            )}

            {/* ════════════════════════════════════════════════════
                 MARCAS
                ════════════════════════════════════════════════════ */}
            {brands.length > 0 && !selectedBrand && (
                <>
                    <SectionDivider title="Marcas Registradas" icon={Store} color={PALETTE.teal} />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {brands.map((brand: any) => (
                            <Card key={brand._id} className="hover:scale-[1.02] transition-transform cursor-pointer"
                                onClick={() => setSelectedBrand(brand._id)}>
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                                        style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                                        <Store size={20} color="#fff" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-base font-bold text-gray-800 truncate">{brand.appName || brand.domain}</div>
                                        <div className="flex gap-3 mt-1 text-xs text-gray-500">
                                            <span>{brand.localsCount || 0} locales</span>
                                            <span>{brand.clientsCount || 0} clientes</span>
                                            <span>{brand.ordersCount || 0} pedidos</span>
                                        </div>
                                    </div>
                                    <ChevronRight size={16} color={PALETTE.slate} />
                                </div>
                            </Card>
                        ))}
                    </div>
                </>
            )}

            {/* ════════════════════════════════════════════════════
                 FOOTER
                ════════════════════════════════════════════════════ */}
            <div className="text-center py-6">
                <div className="inline-flex items-center gap-2 text-xs text-gray-400 font-medium">
                    <Activity size={12} />
                    Datos en modo lectura (GET only) — Base de datos producción Deenex
                </div>
            </div>
        </div>
    );
}
