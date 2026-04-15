import { useState, useEffect, useCallback, useRef } from "react";

const ALL_MONTHS = [
  "Oct 2025", "Nov 2025", "Dic 2025",
  "Ene 2026", "Feb 2026", "Mar 2026", "Abr 2026"
];

const CURRENT_PERIOD_IDX = 6; // Abr 2026

const RANGE_OPTIONS = [3, 6];
const PERIOD_TYPES = ["Quincenal", "Mensual", "Trimestral", "Semestral"];
const BRANDS = ["Quem", "Todas las marcas"];

const STATUS = {
  good: { color: "#22c55e", bg: "rgba(34,197,94,0.08)", icon: "▲", label: "On track" },
  warning: { color: "#f59e0b", bg: "rgba(245,158,11,0.08)", icon: "—", label: "Atención" },
  bad: { color: "#ef4444", bg: "rgba(239,68,68,0.08)", icon: "▼", label: "Crítico" },
};

const DEFAULT_TARGETS = {
  "adoption-locales-activos": "18/18",
  "adoption-pct-locales-activos": "80%",
  "adoption-pedidos-por-local": "50+",
  "growth-registros-nuevos": "40+",
  "growth-base-total": "Creciente",
  "growth-incremento-base": ">8%",
  "growth-pct-registros-total": ">1%",
  "growth-pct-base-activa": ">5%",
  "growth-pct-usuarios-activados": ">25%",
  "growth-churn": "<5%",
  "value-pedidos-totales": "500+",
  "value-gmv": "$2.5M",
  "value-aov": ">$4.000",
  "value-ahorro-agregadores": "Creciente",
  "value-mix-canales": "Diversificado",
  "value-cant-pedidos-canal": "Creciente",
  "loyalty-recompra": ">2%",
  "loyalty-base-saludable": ">3%",
  "loyalty-programa-puntos": ">50% activos",
  "loyalty-frecuencia": ">2.5",
};

const blocks = [
  {
    id: "adoption",
    title: "Adopción del Producto",
    subtitle: "¿Los locales están usando Deenex?",
    icon: "⚡",
    accentColor: "#6366f1",
    metrics: [
      {
        id: "adoption-locales-activos",
        name: "Locales Activos",
        definition: "Locales con >50 órdenes mensuales. Fórmula: locales activos / total locales",
        allValues: ["4 / 14", "5 / 14", "6 / 15", "8 / 16", "10 / 18", "12 / 18", "3 / 18"],
        allDeltas: [null, "+1", "+1", "+2", "+2", "+2", null],
        status: "warning",
      },
      {
        id: "adoption-pct-locales-activos",
        name: "% Locales Activos (≥50 pedidos)",
        definition: "% de locales que superan las 50 órdenes mensuales sobre el total de locales",
        allValues: ["14%", "18%", "20%", "25%", "33%", "44%", "0%"],
        allDeltas: [null, "+4pp", "+2pp", "+5pp", "+8pp", "+11pp", null],
        status: "bad",
      },
      {
        id: "adoption-pedidos-por-local",
        name: "Pedidos por Local",
        definition: "Promedio de pedidos mensuales sobre el total de locales (activos e inactivos)",
        allValues: ["12", "14", "18", "22", "29", "38", "6"],
        allDeltas: [null, "+17%", "+29%", "+22%", "+32%", "+31%", null],
        status: "warning",
      },
    ],
  },
  {
    id: "growth",
    title: "Crecimiento de Base",
    subtitle: "¿El canal propio está creciendo?",
    icon: "📈",
    accentColor: "#06b6d4",
    metrics: [
      {
        id: "growth-registros-nuevos",
        name: "Registros Nuevos",
        definition: "Cantidad de usuarios registrados nuevos del periodo en cuestión",
        allValues: ["12", "18", "22", "31", "44", "58", "6"],
        allDeltas: [null, "+50%", "+22%", "+41%", "+42%", "+32%", null],
        status: "good",
      },
      {
        id: "growth-base-total",
        name: "Base Total Registrada",
        definition: "Suma total de registros históricos desde el día cero hasta el final del periodo",
        allValues: ["198", "216", "238", "284", "328", "386", "392"],
        allDeltas: [null, "+9%", "+10%", "+19%", "+15%", "+18%", null],
        status: "good",
      },
      {
        id: "growth-incremento-base",
        name: "Incremento Base",
        definition: "Cuánto aumenta la base de un mes a otro. Fórmula: registros fin periodo actual / registros fin periodo anterior",
        allValues: ["6,80%", "9,09%", "10,19%", "12,30%", "15,49%", "17,68%", "1,55%"],
        allDeltas: [null, "+2,3pp", "+1,1pp", "+2,1pp", "+3,2pp", "+2,2pp", null],
        status: "good",
      },
      {
        id: "growth-pct-registros-total",
        name: "% Registros / Total",
        definition: "Registrados / usuarios totales (registrados + invitados)",
        allValues: ["0,21%", "0,26%", "0,30%", "0,38%", "0,47%", "0,64%", "0,55%"],
        allDeltas: [null, "+0,05pp", "+0,04pp", "+0,08pp", "+0,09pp", "+0,17pp", null],
        status: "warning",
      },
      {
        id: "growth-pct-base-activa",
        name: "% Base Activa",
        definition: "Usuarios con al menos 1 compra en el periodo / usuarios totales de la base",
        allValues: ["1,50%", "1,85%", "2,10%", "2,80%", "3,35%", "9,33%", "1,02%"],
        allDeltas: [null, "+0,35pp", "+0,25pp", "+0,7pp", "+0,55pp", "+5,98pp", null],
        status: "bad",
      },
      {
        id: "growth-pct-usuarios-activados",
        name: "% Usuarios Activados",
        definition: "Nuevos registrados del periodo que compraron en el mismo mes / nuevos registrados del periodo",
        allValues: ["3,20%", "3,80%", "4,50%", "5,10%", "6,82%", "36,21%", "16,67%"],
        allDeltas: [null, "+0,6pp", "+0,7pp", "+0,6pp", "+1,7pp", "+29,4pp", null],
        status: "warning",
      },
      {
        id: "growth-churn",
        name: "Churn de Usuarios",
        definition: "Usuarios activos en M-1 que no volvieron a comprar en el periodo actual",
        allValues: ["—", "—", "—", "—", "—", "—", "—"],
        allDeltas: [null, null, null, null, null, null, null],
        status: "warning",
        missing: true,
      },
    ],
  },
  {
    id: "value",
    title: "Valor del Canal Propio",
    subtitle: "¿Se está migrando venta hacia canal propio?",
    icon: "💰",
    accentColor: "#10b981",
    metrics: [
      {
        id: "value-pedidos-totales",
        name: "Pedidos Totales",
        definition: "La suma de todos los pedidos del periodo",
        allValues: ["62", "89", "134", "198", "312", "456", "48"],
        allDeltas: [null, "+44%", "+51%", "+48%", "+58%", "+46%", null],
        status: "good",
      },
      {
        id: "value-gmv",
        name: "GMV (Ventas Totales)",
        definition: "Facturación total del periodo (valor bruto de mercadería vendido)",
        allValues: ["$280K", "$410K", "$620K", "$890K", "$1.4M", "$2.1M", "$220K"],
        allDeltas: [null, "+46%", "+51%", "+44%", "+57%", "+50%", null],
        status: "good",
      },
      {
        id: "value-aov",
        name: "Ticket Promedio (AOV)",
        definition: "Facturación total del periodo / pedidos totales del periodo",
        allValues: ["$4.516", "$4.607", "$4.627", "$4.494", "$4.487", "$4.605", "$4.583"],
        allDeltas: [null, "+2,0%", "+0,4%", "−2,9%", "−0,2%", "+2,6%", null],
        status: "good",
      },
      {
        id: "value-ahorro-agregadores",
        name: "Ahorro vs Agregadores",
        definition: "Facturación total de pedidos delivery × 0.15 (ahorro estimado del 15% vs comisión de marketplaces)",
        allValues: ["$8.400", "$14.200", "$22.800", "$38.200", "$72.174", "$154.582", "$0"],
        allDeltas: [null, "+69%", "+61%", "+68%", "+89%", "+114%", null],
        status: "good",
      },
      {
        id: "value-mix-canales",
        name: "Mix: Takeaway / Delivery / Mesa",
        definition: "Pedidos por canal / total de pedidos. Muestra cuántos se hacen presencial vs desde casa",
        allValues: ["70% / 30% / 0%", "68% / 32% / 0%", "65% / 35% / 0%", "62% / 38% / 0%", "56% / 44% / 0%", "79% / 21% / 0%", "100% / 0% / 0%"],
        allDeltas: [null, null, null, null, null, null, null],
        status: "warning",
      },
      {
        id: "value-cant-pedidos-canal",
        name: "Cant. Pedidos: TA / Deli / Mesa",
        definition: "Volumen absoluto de pedidos por cada canal (take away, delivery, mesa)",
        allValues: ["43 / 19 / 0", "61 / 28 / 0", "87 / 47 / 0", "123 / 75 / 0", "175 / 137 / 0", "360 / 96 / 0", "48 / 0 / 0"],
        allDeltas: [null, null, null, null, null, null, null],
        status: "warning",
      },
    ],
  },
  {
    id: "loyalty",
    title: "Fidelización",
    subtitle: "¿El sistema de puntos funciona?",
    icon: "🔁",
    accentColor: "#f43f5e",
    metrics: [
      {
        id: "loyalty-recompra",
        name: "% Recompra",
        definition: "Usuarios de la base que volvieron a comprar en el periodo / usuarios totales de la base × 100",
        allValues: ["0,90%", "1,10%", "1,40%", "1,80%", "2,13%", "2,33%", "0,51%"],
        allDeltas: [null, "+0,2pp", "+0,3pp", "+0,4pp", "+0,33pp", "+0,2pp", null],
        status: "bad",
      },
      {
        id: "loyalty-base-saludable",
        name: "% Base Saludable",
        definition: "Usuarios que compraron en al menos 2 de los últimos 3 periodos / usuarios totales de la base",
        allValues: ["0,40%", "0,55%", "0,70%", "0,90%", "1,22%", "1,04%", "0,51%"],
        allDeltas: [null, "+0,15pp", "+0,15pp", "+0,2pp", "+0,32pp", "−0,18pp", null],
        status: "bad",
      },
      {
        id: "loyalty-programa-puntos",
        name: "Usuarios en Programa de Puntos",
        definition: "Usuarios con puntos acumulados en el sistema de fidelización",
        allValues: ["—", "—", "—", "—", "—", "—", "—"],
        allDeltas: [null, null, null, null, null, null, null],
        status: "warning",
        missing: true,
      },
      {
        id: "loyalty-frecuencia",
        name: "Frecuencia (pedidos/usuario/mes)",
        definition: "Promedio de pedidos por usuario activo en el periodo",
        allValues: ["—", "—", "—", "—", "—", "—", "—"],
        allDeltas: [null, null, null, null, null, null, null],
        status: "warning",
        missing: true,
      },
    ],
  },
];

function InlineDelta({ value }) {
  if (!value) return null;
  const isNeg = value.startsWith("−") || value.startsWith("-");
  const color = isNeg ? "#ef4444" : "#22c55e";
  return (
    <div style={{ fontSize: 9, fontWeight: 600, color, marginTop: 2, fontFamily: "'JetBrains Mono', 'SF Mono', monospace", letterSpacing: "-0.02em" }}>
      {isNeg ? "↓" : "↑"} {value}
    </div>
  );
}

function EditableTarget({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() !== value) onChange(draft.trim());
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
        style={{
          width: 72, padding: "4px 6px", fontSize: 11, fontWeight: 600, color: "#6366f1",
          fontFamily: "'JetBrains Mono', 'SF Mono', monospace", textAlign: "center",
          border: "1.5px solid #6366f1", borderRadius: 6, outline: "none",
          backgroundColor: "rgba(99,102,241,0.06)",
        }}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      title="Click para editar target"
      style={{
        fontSize: 11, fontWeight: 600, color: "#64748b",
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        cursor: "pointer", padding: "4px 6px", borderRadius: 6,
        border: "1px dashed rgba(100,116,139,0.25)", transition: "all 0.15s",
        minWidth: 60, display: "inline-block",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#6366f1"; e.currentTarget.style.color = "#6366f1"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(100,116,139,0.25)"; e.currentTarget.style.color = "#64748b"; }}
    >
      {value || "—"}
    </div>
  );
}

function StatusBadge({ status }) {
  const s = STATUS[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600, color: s.color, backgroundColor: s.bg, letterSpacing: "0.02em" }}>
      {s.icon} {s.label}
    </span>
  );
}

function MissingBadge() {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600, color: "#94a3b8", backgroundColor: "rgba(148,163,184,0.1)", border: "1px dashed rgba(148,163,184,0.3)", letterSpacing: "0.03em", textTransform: "uppercase" }}>
      ⚠ Agregar
    </span>
  );
}

function HealthSummary() {
  let good = 0, warning = 0, bad = 0, missing = 0;
  blocks.forEach((b) => b.metrics.forEach((m) => {
    if (m.missing) missing++; else if (m.status === "good") good++; else if (m.status === "warning") warning++; else bad++;
  }));
  const total = good + warning + bad;
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
      {[
        { n: good, t: total, label: "on track", color: "#22c55e" },
        { n: warning, t: total, label: "atención", color: "#f59e0b" },
        { n: bad, t: total, label: "crítico", color: "#ef4444" },
      ].map((x) => (
        <div key={x.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: x.color }} />
          <span style={{ fontSize: 13, color: "#64748b" }}>{x.n}/{x.t} {x.label}</span>
        </div>
      ))}
      {missing > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", border: "2px dashed #94a3b8", boxSizing: "border-box" }} />
          <span style={{ fontSize: 13, color: "#94a3b8" }}>{missing} por agregar</span>
        </div>
      )}
    </div>
  );
}

function MetricBlock({ block, range, targets, onTargetChange }) {
  const startIdx = ALL_MONTHS.length - range;
  const visibleMonths = ALL_MONTHS.slice(startIdx);
  const lastClosedIdx = visibleMonths.length - 1;

  return (
    <div style={{ backgroundColor: "rgba(255,255,255,0.6)", backdropFilter: "blur(12px)", borderRadius: 16, border: "1px solid rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: 20 }}>
      <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid rgba(0,0,0,0.04)", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 22 }}>{block.icon}</span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.01em" }}>{block.title}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 1, fontStyle: "italic" }}>{block.subtitle}</div>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
              <th style={{ textAlign: "left", padding: "10px 24px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", minWidth: 220 }}>Métrica</th>
              <th style={{ textAlign: "center", padding: "10px 10px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", minWidth: 80 }}>Estado</th>
              {visibleMonths.map((m, i) => {
                const globalIdx = startIdx + i;
                const isCurrent = globalIdx === CURRENT_PERIOD_IDX;
                const isLastClosed = !isCurrent && (i === lastClosedIdx || (i === lastClosedIdx - 1 && startIdx + lastClosedIdx === CURRENT_PERIOD_IDX));
                const parts = m.split(" ");
                const label = parts[0].substring(0, 3).toUpperCase() + " '" + parts[1].slice(-2);
                return (
                  <th key={m} style={{
                    textAlign: "center", padding: "10px 6px", fontSize: 10, fontWeight: 700,
                    textTransform: "uppercase", letterSpacing: "0.08em", minWidth: 85,
                    color: isCurrent ? "#f59e0b" : isLastClosed ? block.accentColor : "#94a3b8",
                    backgroundColor: isCurrent ? "rgba(245,158,11,0.04)" : "transparent",
                  }}>
                    {isCurrent ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                        <span>⏳ {label}</span>
                        <span style={{ fontSize: 8, fontWeight: 600, color: "#f59e0b", letterSpacing: "0.05em" }}>EN CURSO</span>
                      </div>
                    ) : label}
                  </th>
                );
              })}
              <th style={{ textAlign: "center", padding: "10px 10px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", minWidth: 80, borderLeft: "2px solid rgba(0,0,0,0.06)" }}>🎯 Target</th>
            </tr>
          </thead>
          <tbody>
            {block.metrics.map((metric, idx) => (
              <tr key={idx} style={{ borderBottom: idx < block.metrics.length - 1 ? "1px solid rgba(0,0,0,0.03)" : "none", backgroundColor: metric.missing ? "rgba(148,163,184,0.03)" : "transparent" }}>
                <td style={{ padding: "12px 24px" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: metric.missing ? "#94a3b8" : "#1e293b", lineHeight: 1.3 }}>{metric.name}</div>
                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2, lineHeight: 1.4 }}>{metric.definition}</div>
                </td>
                <td style={{ textAlign: "center", padding: "12px 10px" }}>
                  {metric.missing ? <MissingBadge /> : <StatusBadge status={metric.status} />}
                </td>
                {visibleMonths.map((m, vi) => {
                  const dataIdx = startIdx + vi;
                  const isCurrent = dataIdx === CURRENT_PERIOD_IDX;
                  const isLastClosed = !isCurrent && (vi === lastClosedIdx || (vi === lastClosedIdx - 1 && startIdx + lastClosedIdx === CURRENT_PERIOD_IDX));
                  const val = metric.allValues[dataIdx];
                  const delta = metric.allDeltas[dataIdx];
                  return (
                    <td key={m} style={{
                      textAlign: "center", padding: "10px 6px", verticalAlign: "middle",
                      backgroundColor: isCurrent ? "rgba(245,158,11,0.04)" : "transparent",
                    }}>
                      <div style={{
                        fontSize: 13,
                        fontWeight: isLastClosed ? 700 : 400,
                        color: metric.missing ? "#cbd5e1" : isCurrent ? "#d97706" : isLastClosed ? "#0f172a" : "#64748b",
                        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
                        fontStyle: isCurrent ? "italic" : "normal",
                        opacity: isCurrent ? 0.7 : 1,
                      }}>
                        {val}
                      </div>
                      {!metric.missing && !isCurrent && <InlineDelta value={delta} />}
                    </td>
                  );
                })}
                <td style={{ textAlign: "center", padding: "12px 10px", borderLeft: "2px solid rgba(0,0,0,0.04)" }}>
                  <EditableTarget
                    value={targets[metric.id] || "—"}
                    onChange={(newVal) => onTargetChange(metric.id, newVal)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Dropdown({ value, options, onChange, icon }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          padding: "7px 14px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.1)",
          fontSize: 13, color: "#475569", fontWeight: 500, backgroundColor: "white",
          cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4,
        }}
      >
        {icon} {value} ▾
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", right: 0, marginTop: 4, backgroundColor: "white",
          borderRadius: 10, border: "1px solid rgba(0,0,0,0.1)", overflow: "hidden",
          boxShadow: "0 8px 24px rgba(0,0,0,0.08)", zIndex: 100, minWidth: 160,
        }}>
          {options.map((o) => (
            <button
              key={o}
              onClick={() => { onChange(o); setOpen(false); }}
              style={{
                display: "block", width: "100%", padding: "10px 16px", border: "none",
                backgroundColor: o === value ? "rgba(99,102,241,0.06)" : "white",
                color: o === value ? "#6366f1" : "#475569", fontSize: 13,
                fontWeight: o === value ? 700 : 500,
                cursor: "pointer", textAlign: "left", fontFamily: "inherit",
              }}
              onMouseEnter={(e) => { if (o !== value) e.currentTarget.style.backgroundColor = "#f8fafc"; }}
              onMouseLeave={(e) => { if (o !== value) e.currentTarget.style.backgroundColor = "white"; }}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DeenexDashboard() {
  const [range, setRange] = useState(3);
  const [brand, setBrand] = useState("Quem");
  const [periodType, setPeriodType] = useState("Mensual");
  const [targets, setTargets] = useState(DEFAULT_TARGETS);
  const [loaded, setLoaded] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const key = `deenex-targets:${brand.replace(/\s+/g, "_")}`;
        const result = await window.storage.get(key);
        if (result && result.value) {
          setTargets({ ...DEFAULT_TARGETS, ...JSON.parse(result.value) });
        } else {
          setTargets({ ...DEFAULT_TARGETS });
        }
      } catch {
        setTargets({ ...DEFAULT_TARGETS });
      }
      setLoaded(true);
    })();
  }, [brand]);

  const saveTargets = useCallback(async (newTargets) => {
    try {
      const key = `deenex-targets:${brand.replace(/\s+/g, "_")}`;
      await window.storage.set(key, JSON.stringify(newTargets));
      setSaveIndicator(true);
      setTimeout(() => setSaveIndicator(false), 1500);
    } catch (e) {
      console.error("Error saving targets:", e);
    }
  }, [brand]);

  const handleTargetChange = (metricId, newVal) => {
    const updated = { ...targets, [metricId]: newVal };
    setTargets(updated);
    saveTargets(updated);
  };

  if (!loaded) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ color: "#94a3b8", fontSize: 14 }}>Cargando...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f8fafc", fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: "24px 24px 48px" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", margin: 0, letterSpacing: "-0.03em" }}>Deenex</h1>
            <span style={{ padding: "3px 10px", borderRadius: 999, backgroundColor: "#6366f1", color: "white", fontSize: 11, fontWeight: 700 }}>{brand}</span>
            {saveIndicator && (
              <span style={{ padding: "3px 10px", borderRadius: 999, backgroundColor: "rgba(34,197,94,0.1)", color: "#22c55e", fontSize: 11, fontWeight: 600 }}>
                ✓ Guardado
              </span>
            )}
          </div>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14, fontWeight: 500 }}>
            Métricas de producto · Periodo: <strong style={{ color: "#0f172a" }}>{periodType}</strong>
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Range selector */}
          <div style={{ display: "flex", borderRadius: 10, border: "1px solid rgba(0,0,0,0.1)", overflow: "hidden", backgroundColor: "white" }}>
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{
                  padding: "7px 14px", fontSize: 13, fontWeight: range === r ? 700 : 500,
                  color: range === r ? "white" : "#475569",
                  backgroundColor: range === r ? "#6366f1" : "white",
                  border: "none", cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit",
                }}
              >
                {r} periodos
              </button>
            ))}
          </div>
          <Dropdown value={periodType} options={PERIOD_TYPES} onChange={setPeriodType} icon="📅" />
          <Dropdown value={brand} options={BRANDS} onChange={(b) => { setBrand(b); setLoaded(false); }} icon="🏷" />
        </div>
      </div>

      {/* Health Summary */}
      <div style={{ backgroundColor: "white", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, padding: "14px 24px", marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Salud General</div>
        <HealthSummary />
      </div>

      {/* Blocks */}
      {blocks.map((block) => (
        <MetricBlock
          key={block.id}
          block={block}
          range={range}
          targets={targets}
          onTargetChange={handleTargetChange}
        />
      ))}

      {/* Footer */}
      <div style={{ marginTop: 8, padding: "12px 20px", borderRadius: 10, backgroundColor: "rgba(99,102,241,0.04)", border: "1px dashed rgba(99,102,241,0.2)", fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
        <strong style={{ color: "#6366f1" }}>💡</strong> Click en cualquier target para editarlo — se guarda por marca. La columna ⏳ marca el periodo en curso (datos parciales).
      </div>
    </div>
  );
}
