import React, { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw } from "lucide-react";
import {
  getDeenexProductMetrics,
  getDeenexBrands,
} from "../../services/deenex-monitoring.service";

function MetricTooltip({
  formula,
  implication,
}: {
  formula?: string;
  implication?: string;
}) {
  if (!formula && !implication) return null;
  return (
    <div className="relative group/tooltip flex items-center justify-center">
      <div className="w-4 h-4 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-[10px] font-bold text-slate-500 cursor-help group-hover/tooltip:bg-indigo-100 group-hover/tooltip:border-indigo-200 group-hover/tooltip:text-indigo-600 transition-colors">
        ?
      </div>
      <div className="absolute left-full ml-3 top-1/2 -translate-y-1/2 w-[280px] p-4 bg-slate-800 rounded-xl shadow-xl z-50 opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all pointer-events-none">
        <div className="absolute left-0 top-1/2 -translate-x-[6px] -translate-y-1/2 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-r-[6px] border-r-slate-800"></div>
        {formula && (
          <div className="mb-3">
            <div className="text-[10px] uppercase tracking-widest text-indigo-300 font-bold mb-1">
              Cómo se calcula
            </div>
            <div className="text-[11px] font-mono text-slate-200 bg-slate-900/50 p-2 rounded-lg leading-relaxed border border-white/5">
              {formula}
            </div>
          </div>
        )}
        {implication && (
          <div>
            <div className="text-[10px] uppercase tracking-widest text-emerald-300 font-bold mb-1">
              Qué implica
            </div>
            <div className="text-[11px] text-slate-300 leading-relaxed font-sans">
              {implication}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Define the blocks configuration mapped to backend keys
const blocksConfig = [
  {
    id: "adoption",
    title: "Adopción del Producto",
    subtitle: "¿Los locales están usando Deenex?",
    icon: "⚡",
    accentColor: "text-indigo-500",
    metrics: [
      {
        id: "adoption-locales-activos",
        name: "Locales Activos",
        definition: "Locales con >50 órdenes mensuales.",
        key: "localesActivosCount",
        suffix: " / total",
        type: "fraction",
        fractionKey: "localesActivosTotal",
        status: "warning",
      },
      {
        id: "adoption-pct-locales-activos",
        name: "% Locales Activos",
        definition: "% de locales que superan las 50 órdenes sobre el total",
        tooltip: {
          formula: "Locales activos / Totales",
          implication:
            "¿Cuántos locales utilizan el canal propio de forma activa?",
        },
        key: "localesActivos50Orders",
        type: "percent",
        status: "bad",
      },
      {
        id: "adoption-pedidos-por-local",
        name: "Pedidos por Local",
        definition: "Promedio de pedidos mensuales sobre el total de locales",
        key: "pedidosPorLocal",
        type: "number",
        status: "warning",
      },
    ],
  },
  {
    id: "growth",
    title: "Crecimiento de Base",
    subtitle: "¿El canal propio está creciendo?",
    icon: "📈",
    accentColor: "text-cyan-500",
    metrics: [
      {
        id: "growth-registros-nuevos",
        name: "Registros Nuevos",
        definition: "Cantidad de usuarios registrados nuevos del periodo",
        tooltip: {
          formula:
            "Cantidad de usuarios registrados nuevos del periodo en cuestion",
          implication: "¿Cuanto traccionamos registros con el canal propio?",
        },
        key: "registrosNuevos",
        type: "number",
        status: "good",
      },
      {
        id: "growth-base-total",
        name: "Base Total Registrada",
        definition: "Suma total de registros históricos hasta fin de periodo",
        tooltip: {
          formula:
            "suma total de registros historicos desde el dia cero hasta el final del periodo",
          implication:
            "Suma total de registros historicos desde el dia cero hasta el final del periodo",
        },
        key: "baseTotalRegistrada",
        type: "number",
        status: "good",
      },
      {
        id: "growth-incremento-base",
        name: "Incremento Base",
        definition: "Aumento porcentual de la base desde inicio de periodo",
        tooltip: {
          formula:
            "Registros totales al final del período anterior / Registros generados hasta final del período en curso",
          implication: "¿Cuanto aumenta la base de datos de un mes a otro?",
        },
        key: "incrementoBase",
        type: "percent",
        status: "good",
      },
      {
        id: "growth-pct-registros-total",
        name: "% Registros / Total",
        definition: "Registrados / usuarios totales (registrados + invitados)",
        tooltip: {
          formula:
            "Registrados / usuarios totales (es decir, registrados + invitados)",
          implication: "Tasa general de conversión a base registrada.",
        },
        key: "tasaRegistro",
        type: "percent",
        status: "warning",
      },
      {
        id: "growth-pct-base-activa",
        name: "% Base Activa",
        definition: "Usuarios con al menos 1 compra en el periodo / total base",
        tooltip: {
          formula:
            "Usuarios con 1 o más compras en el periodo / Usuarios totales de la base",
          implication:
            "De toda la base de datos, ¿cuántos efectivamente compraron este mes?",
        },
        key: "pBaseActiva",
        type: "percent",
        status: "bad",
      },
      {
        id: "growth-pct-usuarios-activados",
        name: "% Usuarios Activados",
        definition: "Nuevos registrados que compraron / nuevos registrados",
        tooltip: {
          formula:
            "Nuevos registrados del periodo que compraron en el mismo mes / Nuevos registrados del periodo",
          implication:
            "¿El canal propio no solo registra usuarios, sino que también convierte? Mide usuarios nuevos registrados que hicieron su primera compra en el mismo mes.",
        },
        key: "pUsuariosActivados",
        type: "percent",
        status: "warning",
      },
      {
        id: "growth-churn",
        name: "Churn de Usuarios",
        definition: "Usuarios inactivos (Falta implementar)",
        key: "missing",
        missing: true,
        status: "warning",
      },
    ],
  },
  {
    id: "value",
    title: "Valor del Canal Propio",
    subtitle: "¿Se está migrando venta hacia canal propio?",
    icon: "💰",
    accentColor: "text-emerald-500",
    metrics: [
      {
        id: "value-pedidos-totales",
        name: "Pedidos Totales",
        definition: "La suma de todos los pedidos del periodo",
        tooltip: {
          formula: "La suma de los pedidos del periodo",
          implication: "Volumen transaccional absoluto general.",
        },
        key: "pedidosTotales",
        type: "number",
        status: "good",
      },
      {
        id: "value-gmv",
        name: "GMV (Ventas Totales)",
        definition: "Facturación total del periodo",
        key: "gmv",
        type: "currency",
        status: "good",
      },
      {
        id: "value-aov",
        name: "Ticket Promedio (AOV)",
        definition: "Facturación total / pedidos totales",
        tooltip: {
          formula: "Facturacion / Pedidos",
          implication: "El ticket promedio por transacción.",
        },
        key: "aov",
        type: "currency",
        status: "good",
      },
      {
        id: "value-ahorro-agregadores",
        name: "Ahorro vs Agregadores",
        definition: "Facturación de delivery × 0.15 (ahorro del 15%)",
        tooltip: {
          formula: "Facturación total de pedidos delivery * 0.15",
          implication:
            "¿Cuanto ahorro directo le generamos a nuestros clientes en comparación a los marketplace? (15% de ahorro calculado)",
        },
        key: "ahorroDirecto",
        type: "currency",
        status: "good",
      },
      {
        id: "value-mix-canales",
        name: "Mix: Takeaway / Delivery / Mesa",
        definition: "Porcentaje de pedidos por canal",
        tooltip: {
          formula: "Pedidos según método / Total de pedidos",
          implication:
            "¿Cuantos pedidos se hacen presencial y cuantos desde casa?",
        },
        key: "mixCanales",
        type: "mixPercent",
        status: "warning",
      },
      {
        id: "value-cant-pedidos-canal",
        name: "Cant. Pedidos: TA / Deli / Mesa",
        definition: "Volumen absoluto por canal",
        tooltip: {
          formula: "Volumen absoluto por cada método",
          implication:
            "¿Cuantos pedidos se hacen presencial y cuantos desde casa?",
        },
        key: "mixCant",
        type: "mixCant",
        status: "warning",
      },
    ],
  },
  {
    id: "loyalty",
    title: "Fidelización",
    subtitle: "¿El sistema de retención funciona?",
    icon: "🔁",
    accentColor: "text-rose-500",
    metrics: [
      {
        id: "loyalty-recompra",
        name: "% Recompra",
        definition:
          "Usuarios que ya habían comprado y volvieron a comprar / base",
        tooltip: {
          formula:
            "(Usuarios de la base que volvieron a comprar en el período / Usuarios totales de la base) × 100",
          implication:
            "Usuarios que ya habían comprado antes y volvieron a comprar durante este periodo.",
        },
        key: "pRecompra",
        type: "percent",
        status: "bad",
      },
      {
        id: "loyalty-base-saludable",
        name: "% Base Saludable",
        definition: "Compraron en mes actual y en el anterior simultáneamente",
        tooltip: {
          formula:
            "Usuarios que compraron en al menos 2 de los últimos 3 periodos / Usuarios totales de la base",
          implication:
            "Mide algo mucho más cercano a hábito y no a compra aislada. Usuarios que compraron en 2 de los últimos 3 meses.",
        },
        key: "pBaseSaludable",
        type: "percent",
        status: "bad",
      },
      {
        id: "loyalty-programa-puntos",
        name: "Usuarios en Puntos",
        definition: "En desarrollo",
        key: "missing",
        missing: true,
        status: "warning",
      },
      {
        id: "loyalty-frecuencia",
        name: "Frecuencia",
        definition: "En desarrollo",
        key: "missing",
        missing: true,
        status: "warning",
      },
    ],
  },
];

function formatCurrency(val: number) {
  if (!val) return "$0";
  if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
  if (val >= 1000) return `$${Math.round(val / 1000)}K`;
  return `$${val}`;
}

function computeValueString(
  val: any,
  type: string,
  fractionKeyVal: any = null,
  mRow: any = null,
) {
  const safeVal = val !== undefined && val !== null ? val : 0;
  if (type === "percent") return `${safeVal}%`;
  if (type === "fraction") return `${safeVal} / ${fractionKeyVal || 0}`;
  if (type === "currency") return formatCurrency(safeVal);
  if (type === "mixPercent")
    return `${mRow?.pPedidosLlevar || 0}% / ${mRow?.pPedidosDelivery || 0}% / ${mRow?.pPedidosMesa || 0}%`;
  if (type === "mixCant")
    return `${mRow?.cantLlevar || 0} / ${mRow?.cantDelivery || 0} / ${mRow?.cantMesa || 0}`;
  return `${safeVal}`;
}

function computeDeltaString(curr: any, prev: any, type: string) {
  if (prev === 0 || !prev) return null; // Avoid inf
  if (type === "percent") {
    const diff = curr - prev;
    if (Math.abs(diff) < 0.01) return null;
    return `${diff > 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)}pp`;
  }
  if (type === "number" || type === "currency") {
    const pct = ((curr - prev) / prev) * 100;
    if (Math.abs(pct) < 1) return null;
    return `${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(0)}%`;
  }
  return null;
}

function InlineDelta({ value }: { value: string }) {
  if (!value) return null;
  const isNeg = value.startsWith("−") || value.startsWith("-");
  return (
    <div
      className={`text-[9px] font-semibold mt-0.5 tracking-tight font-mono ${isNeg ? "text-red-500" : "text-green-500"}`}
    >
      {isNeg ? "↓" : "↑"} {value}
    </div>
  );
}

function MultiDropdown({ label, options, selected, onChange, icon }: any) {
  const [open, setOpen] = useState(false);
  const [localSelected, setLocalSelected] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpenToggle = () => {
    if (!open) {
      // Sync state when opening
      setLocalSelected(
        selected.length === 0 ? options.map((o: any) => o.id) : selected,
      );
    }
    setOpen(!open);
  };

  const handleApply = () => {
    if (localSelected.length === options.length || localSelected.length === 0) {
      // If all are selected, or if someone accidentally applied with 0 selections, we just load all to prevent errors.
      onChange([]);
    } else {
      onChange(localSelected);
    }
    setOpen(false);
  };

  const allSelected = localSelected.length === options.length;

  const title =
    selected.length === 0 || selected.length === options.length
      ? "Todas las marcas"
      : selected.length === 1
        ? options.find((o: any) => o.id === selected[0])?.name
        : `${selected.length} seleccionadas`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpenToggle}
        className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-[13px] text-slate-600 font-medium bg-white cursor-pointer flex items-center gap-1 hover:bg-slate-50 transition-colors"
      >
        {icon} {title} ▾
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-lg z-50 min-w-[220px] flex flex-col">
          <div
            onClick={() =>
              setLocalSelected(allSelected ? [] : options.map((o: any) => o.id))
            }
            className="px-4 py-2.5 text-[13px] font-semibold text-indigo-500 cursor-pointer border-b border-slate-100 hover:bg-slate-50 flex justify-between items-center"
          >
            {allSelected ? "☐ Deseleccionar Todas" : "☑ Seleccionar Todas"}
          </div>
          <div className="max-h-[250px] overflow-y-auto py-1">
            {options.map((o: any) => {
              const isSel = localSelected.includes(o.id);
              return (
                <label
                  key={o.id}
                  className="flex items-center gap-2.5 w-full px-4 py-2 bg-white text-slate-600 text-[13px] cursor-pointer hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={isSel}
                    onChange={(e) => {
                      if (e.target.checked)
                        setLocalSelected([...localSelected, o.id]);
                      else
                        setLocalSelected(
                          localSelected.filter((id) => id !== o.id),
                        );
                    }}
                    className="accent-indigo-500 w-4 h-4 rounded-sm border-slate-300"
                  />
                  {o.name}
                </label>
              );
            })}
          </div>
          <div className="p-2 border-t border-slate-100 bg-slate-50">
            <button
              onClick={handleApply}
              className="w-full py-1.5 bg-indigo-500 text-white text-[13px] font-semibold rounded-lg hover:bg-indigo-600 transition-colors"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BasicDropdown({ value, options, onChange, icon }: any) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="px-3.5 py-1.5 rounded-xl border border-slate-200 text-[13px] text-slate-600 font-medium bg-white cursor-pointer flex items-center gap-1 hover:bg-slate-50 transition-colors"
      >
        {icon} {options.find((o: any) => o.id === value)?.name || value} ▾
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-white rounded-xl border border-slate-200 overflow-hidden shadow-lg z-50 min-w-[160px]">
          {options.map((o: any) => (
            <button
              key={o.id}
              onClick={() => {
                onChange(o.id);
                setOpen(false);
              }}
              className={`block w-full px-4 py-2.5 text-left text-[13px] hover:bg-slate-50 transition-colors ${o.id === value ? "bg-indigo-50/50 text-indigo-500 font-bold" : "bg-white text-slate-600 font-medium"}`}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DatePickerWithApply({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const apply = () => onChange(draft);

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="date"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") apply();
        }}
        className="border border-slate-200 rounded-lg px-2 py-1 text-[13px] bg-white text-slate-700 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-colors"
      />
      {draft !== value && (
        <button
          onClick={apply}
          className="px-2 py-1 bg-indigo-500 text-white font-semibold text-[11px] rounded-lg hover:bg-indigo-600 transition-colors cursor-pointer"
        >
          Aplicar
        </button>
      )}
    </div>
  );
}

export default function MetricsDashboard() {
  const [range, setRange] = useState(3);
  const [brands, setBrands] = useState([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [periodType, setPeriodType] = useState("monthly");
  const [baseDate, setBaseDate] = useState("");

  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadBrands();
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [selectedBrands, periodType, baseDate, range]);

  const loadBrands = async () => {
    try {
      const res = await getDeenexBrands();
      setBrands(
        res.map((b: any) => ({ id: b._id, name: b.appName || b.domain })),
      );
    } catch (e) {
      console.error(e);
    }
  };

  const loadMetrics = async () => {
    setIsLoading(true);
    setData([]);
    try {
      const res = await getDeenexProductMetrics({
        brandIds: selectedBrands,
        baseDate: baseDate || undefined,
        periodType: periodType as any,
        periodsCount: range,
      });
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const periodOptions = [
    { id: "weekly", name: "Quincenal" },
    { id: "monthly", name: "Mensual" },
    { id: "quarterly", name: "Trimestral" },
    { id: "four-monthly", name: "Cuatrimestral" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans p-6 pb-12 mt-3 rounded-[24px]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=JetBrains+Mono:wght@400;600;700&display=swap');
        .font-sans { font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
        .font-mono { font-family: 'JetBrains Mono', 'SF Mono', monospace; }
      `}</style>

      {/* Header */}
      <div className="flex justify-between items-start mb-7 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-[26px] font-extrabold text-slate-900 m-0 tracking-tight">
              Deenex Metrics
            </h1>
            <p className="m-0 text-slate-500 text-[14px] font-medium flex items-center gap-2 h-[34px]">
              Configurar Inicio:
              <DatePickerWithApply value={baseDate} onChange={setBaseDate} />
            </p>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {/* Refresh */}
          <button
            onClick={loadMetrics}
            disabled={isLoading}
            className={`px-3.5 py-1.5 rounded-xl bg-indigo-500 text-white border-none cursor-pointer flex items-center gap-1.5 text-[13px] font-semibold transition-opacity ${isLoading ? "opacity-70" : "hover:opacity-90"}`}
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            {isLoading ? "Actualizando..." : "Actualizar"}
          </button>

          <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white">
            {[3, 6, 9, 12].map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3.5 py-1.5 text-[13px] border-none cursor-pointer transition-colors font-inherit ${range === r ? "font-bold text-white bg-indigo-500" : "font-medium text-slate-600 bg-white hover:bg-slate-50"}`}
              >
                {r} <span className="opacity-60 font-normal">col</span>
              </button>
            ))}
          </div>

          <BasicDropdown
            value={periodType}
            options={periodOptions}
            onChange={setPeriodType}
            icon="📅"
          />
          <MultiDropdown
            label="Marcas"
            options={brands}
            selected={selectedBrands}
            onChange={setSelectedBrands}
            icon="🏬"
          />
        </div>
      </div>

      {/* Blocks */}
      {blocksConfig.map((block) => (
        <div
          key={block.id}
          className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden mb-5 shadow-sm"
        >
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <span className="text-[22px]">{block.icon}</span>
            <div>
              <div className="text-[16px] font-bold text-slate-900 tracking-tight">
                {block.title}
              </div>
              <div className="text-[12px] text-slate-400 mt-0.5 italic">
                {block.subtitle}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto overflow-y-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2.5 px-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest min-w-[220px]">
                    Métrica
                  </th>

                  {data.map((period, i) => {
                    const isLast = i === data.length - 1;
                    return (
                      <th
                        key={i}
                        className={`text-center py-2.5 px-1.5 text-[10px] font-bold uppercase tracking-widest min-w-[95px] ${period.isCurrent ? "text-amber-500 bg-amber-500/5" : isLast ? block.accentColor : "text-slate-400"}`}
                      >
                        {period.isCurrent ? (
                          <div className="flex flex-col items-center gap-px">
                            <span>⏳ {period.periodLabel}</span>
                            <span className="text-[8px] font-semibold text-amber-500 tracking-wider">
                              ENCURSO - {period.daysElapsed}D
                            </span>
                          </div>
                        ) : (
                          period.periodLabel
                        )}
                      </th>
                    );
                  })}
                  {data.length === 0 &&
                    isLoading &&
                    [1, 2, 3, 4, 5, 6].slice(0, range).map((x) => (
                      <th key={x} className="min-w-[95px]">
                        <div className="h-2 w-12 bg-slate-200 rounded mx-auto animate-pulse"></div>
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {block.metrics
                  .filter((m) => !m.missing)
                  .map((metric, idx, arr) => {
                    const isLastRow = idx === arr.length - 1;
                    return (
                      <tr
                        key={idx}
                        className={`${!isLastRow ? "border-b border-slate-50" : ""} ${metric.missing ? "bg-slate-50/50" : "bg-transparent"}`}
                      >
                        <td className="py-3 px-6">
                          <div
                            className={`text-[13px] font-semibold leading-snug flex items-center gap-1.5 ${metric.missing ? "text-slate-400" : "text-slate-800"}`}
                          >
                            {metric.name}
                            {(metric as any).tooltip && (
                              <MetricTooltip
                                formula={(metric as any).tooltip.formula}
                                implication={
                                  (metric as any).tooltip.implication
                                }
                              />
                            )}
                            {metric.missing && (
                              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold text-slate-400 bg-slate-200/50 uppercase">
                                En dev
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                            {metric.definition}
                          </div>
                        </td>

                        {data.map((period, di) => {
                          const mData = period.metrics || {};
                          const val = mData[metric.key];
                          const prevVal =
                            di > 0 ? data[di - 1].metrics[metric.key] : null;

                          const valStr = computeValueString(
                            val,
                            metric.type,
                            mData[metric.fractionKey as string],
                            mData,
                          );
                          const deltaStr =
                            di > 0 && !metric.missing
                              ? computeDeltaString(val, prevVal, metric.type)
                              : null;

                          const isLast = di === data.length - 1;

                          return (
                            <td
                              key={di}
                              className={`text-center py-2.5 px-1.5 align-middle ${period.isCurrent ? "bg-amber-500/5" : "bg-transparent"}`}
                            >
                              <div
                                className={`text-[13px] font-mono ${metric.missing ? "text-slate-300" : period.isCurrent ? "text-amber-600 italic" : isLast ? "text-slate-900 font-bold" : "text-slate-500"} ${!period.isCurrent && isLast ? "font-bold" : "font-normal"}`}
                              >
                                {metric.missing ? "—" : valStr}
                              </div>
                              {!metric.missing &&
                                !period.isCurrent &&
                                deltaStr && <InlineDelta value={deltaStr} />}
                            </td>
                          );
                        })}

                        {data.length === 0 &&
                          isLoading &&
                          [1, 2, 3, 4, 5, 6].slice(0, range).map((x) => (
                            <td key={x}>
                              <div className="h-4 w-10 bg-slate-200 rounded mx-auto animate-pulse"></div>
                            </td>
                          ))}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="mt-2 py-3 px-5 rounded-xl bg-indigo-50/50 border border-dashed border-indigo-200/60 text-[12px] text-slate-500 leading-relaxed">
        <strong className="text-indigo-500 mr-1">💡 Tip:</strong> El filtro
        "Configurar Inicio" define el periodo de anclaje (fecha cero). Usá
        "rango" para mostrar u ocultar meses anteriores.
      </div>
    </div>
  );
}
