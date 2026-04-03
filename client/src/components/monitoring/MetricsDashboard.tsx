import { useState, useEffect, useMemo } from "react";
import {
  BarChart3,
  Calendar,
  RefreshCw,
  Filter,
  Download,
  TrendingUp,
  TrendingDown,
  MapPin,
  Users,
  CreditCard,
  Zap,
  HeartPulse,
  Repeat,
} from "lucide-react";
import {
  getDeenexProductMetrics,
  getDeenexBrands,
} from "../../services/deenex-monitoring.service";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface MetricPeriod {
  periodLabel: string;
  metrics: {
    tasaRegistro: number;
    localesActivos50Orders: number;
    localesActivosTotal: number;
    ahorroDirecto: number;
    pPedidosMesa: number;
    pPedidosLlevar: number;
    pPedidosDelivery: number;
    incrementoBase: number;
    registrosNuevos: number;
    baseTotalRegistrada: number;
    pBaseActiva: number;
    pUsuariosActivados: number;
    pBaseSaludable: number;
    pRecompra: number;
  };
}

export default function MetricsDashboard() {
  const [brands, setBrands] = useState<any[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  const [periodType, setPeriodType] = useState<
    "weekly" | "monthly" | "quarterly" | "four-monthly"
  >("monthly");
  const [baseDate, setBaseDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [data, setData] = useState<MetricPeriod[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadBrands();
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [selectedBrand, periodType, baseDate]);

  const loadBrands = async () => {
    try {
      const res = await getDeenexBrands();
      setBrands(res);
    } catch (error) {
      console.error("Error loading brands:", error);
    }
  };

  const loadMetrics = async () => {
    setIsLoading(true);
    try {
      const res = await getDeenexProductMetrics({
        brandId: selectedBrand || undefined,
        baseDate,
        periodType,
        periodsCount: 3,
      });
      setData(res);
    } catch (error) {
      console.error("Error loading metrics:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = () => {
    // Implement CSV export if needed
    console.log("Exporting metrics...");
  };

  const metricConfigs = [
    {
      key: "tasaRegistro",
      label: "% Registros / Total",
      icon: Users,
      suffix: "%",
    },
    {
      key: "localesActivos50Orders",
      label: "% Locales Activos (>50 orders)",
      icon: MapPin,
      suffix: "%",
    },
    {
      key: "ahorroDirecto",
      label: "Ahorro vs Agregadores",
      icon: CreditCard,
      prefix: "$",
    },
    {
      key: "pPedidosMesa",
      label: "% Pedidos en Mesa",
      icon: BarChart3,
      suffix: "%",
    },
    {
      key: "pPedidosLlevar",
      label: "% Pedidos Takeaway",
      icon: BarChart3,
      suffix: "%",
    },
    {
      key: "pPedidosDelivery",
      label: "% Pedidos Delivery",
      icon: BarChart3,
      suffix: "%",
    },
    {
      key: "incrementoBase",
      label: "Incremento Base Registros",
      icon: TrendingUp,
      suffix: "%",
    },
    { key: "registrosNuevos", label: "Registros Nuevos", icon: Users },
    {
      key: "baseTotalRegistrada",
      label: "Base Total Registrada",
      icon: Database,
    },
    { key: "pBaseActiva", label: "% Base Activa", icon: Zap, suffix: "%" },
    {
      key: "pUsuariosActivados",
      label: "% Usuarios Activados",
      icon: Zap,
      suffix: "%",
    },
    {
      key: "pBaseSaludable",
      label: "% Base Saludable",
      icon: HeartPulse,
      suffix: "%",
    },
    { key: "pRecompra", label: "% Recompra", icon: Repeat, suffix: "%" },
  ];

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      {/* Header / Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white/50 backdrop-blur-md p-4 rounded-2xl border border-violet-100/50 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-violet-400 uppercase ml-1">
              Marca
            </label>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="bg-white border border-violet-100 rounded-xl px-3 py-1.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-violet-500/20 transition-all"
            >
              <option value="">Todas las marcas</option>
              {brands.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.appName || b.domain}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-violet-400 uppercase ml-1">
              Periodo 0 (Inicio)
            </label>
            <input
              type="date"
              value={baseDate}
              onChange={(e) => setBaseDate(e.target.value)}
              className="bg-white border border-violet-100 rounded-xl px-3 py-1.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-violet-500/20 transition-all"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-violet-400 uppercase ml-1">
              Tipo Período
            </label>
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as any)}
              className="bg-white border border-violet-100 rounded-xl px-3 py-1.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-violet-500/20 transition-all"
            >
              <option value="weekly">Quincenal</option>
              <option value="monthly">Mensual</option>
              <option value="quarterly">Trimestral</option>
              <option value="four-monthly">Cuatrimestral</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadMetrics}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-violet-500/20 disabled:opacity-50"
          >
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            Actualizar
          </button>
          {/* <button 
                        onClick={handleExport}
                        className="p-2 bg-white border border-violet-100 text-violet-600 rounded-xl hover:bg-violet-50 transition-all shadow-sm"
                        title="Exportar CSV"
                    >
                        <Download size={18} />
                    </button> */}
        </div>
      </div>

      {/* Metrics Table */}
      <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-violet-100 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="text-left px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-violet-50">
                  Métrica
                </th>
                {(data.length === 0 && isLoading ? [1, 2, 3] : data).map(
                  (period, idx) => (
                    <th
                      key={idx}
                      className="text-center px-6 py-4 text-xs font-bold text-violet-600 uppercase tracking-wider border-b border-violet-50 bg-violet-50/30"
                    >
                      {isLoading ? (
                        <div className="h-3 w-20 bg-violet-200/50 animate-pulse rounded mx-auto"></div>
                      ) : typeof period === "object" ? (
                        period.periodLabel
                      ) : (
                        "..."
                      )}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-violet-50">
              {metricConfigs.map((config, mIdx) => (
                <tr
                  key={config.key}
                  className="hover:bg-violet-50/30 transition-colors group"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-violet-100 flex items-center justify-center text-violet-500 shadow-sm group-hover:scale-110 transition-transform">
                        <config.icon size={16} />
                      </div>
                      <span className="text-sm font-semibold text-slate-700">
                        {config.label}
                      </span>
                    </div>
                  </td>
                  {(data.length === 0 && isLoading ? [1, 2, 3] : data).map(
                    (period, pIdx) => {
                      const value =
                        typeof period === "object"
                          ? (period.metrics as any)[config.key || ""]
                          : null;
                      const formattedValue =
                        typeof value === "number"
                          ? `${config.prefix || ""}${value.toLocaleString()}${config.suffix || ""}`
                          : "N/D";

                      return (
                        <td
                          key={pIdx}
                          className="px-6 py-4 text-center font-mono text-sm text-slate-600"
                        >
                          {isLoading ? (
                            <div className="h-5 w-16 bg-violet-100 animate-pulse rounded-md mx-auto"></div>
                          ) : (
                            <span
                              className={`px-2 py-1 rounded-lg ${pIdx === 0 ? "bg-violet-100/50 text-violet-700 font-bold" : ""}`}
                            >
                              {formattedValue}
                            </span>
                          )}
                        </td>
                      );
                    },
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
          <h4 className="text-xs font-bold text-emerald-600 uppercase mb-2 flex items-center gap-2">
            <Zap size={14} /> Insights de Crecimiento
          </h4>
          <p className="text-sm text-emerald-800 leading-relaxed">
            La base de datos histórico-total ha crecido consistentemente. El
            ahorro directo generado para los locales mediante el canal propio
            evita las altas comisiones de los agregadores externos
            (Marketplace).
          </p>
        </div>
        <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
          <h4 className="text-xs font-bold text-amber-600 uppercase mb-2 flex items-center gap-2">
            <HeartPulse size={14} /> Salud de la Base
          </h4>
          <p className="text-sm text-amber-800 leading-relaxed">
            Los usuarios saludables son aquellos con comportamiento de compra
            recurrente. Mantener una tasa de recompra alta es clave para la
            sostenibilidad del negocio y el valor de vida del cliente (CLV).
          </p>
        </div>
      </div>
    </div>
  );
}

// Minimal missing icons
function Database(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5V19A9 3 0 0 0 21 19V5" />
      <path d="M3 12A9 3 0 0 0 21 12" />
    </svg>
  );
}
