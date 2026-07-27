import { useEffect, useState } from "react";
import {
  getDeenexEfficiency,
  type EfficiencyResponse,
} from "../../services/deenex-monitoring.service";

// Debajo de este `n` un número no se muestra como dato duro: se marca como muestra insuficiente.
// Con ~500 entregas históricas y mediana de 4 por local, avisar esto es la mitad del valor del panel.
const N_MINIMO_CONFIABLE = 10;

const money = (n: number) => `$${Math.round(n).toLocaleString("es-AR")}`;
const num = (n: number) => n.toLocaleString("es-AR");

/** Chip con el tamaño de muestra. Rojo cuando el número de al lado no es para tomar decisiones. */
function NBadge({ n }: { n: number }) {
  const flaco = n < N_MINIMO_CONFIABLE;
  return (
    <span
      title={flaco ? `Solo ${n} entregas: muestra insuficiente` : `${n} entregas`}
      className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
        flaco ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      n={n}
    </span>
  );
}

function Card({
  titulo,
  subtitulo,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="mb-3">
        <h3 className="text-[15px] font-semibold text-slate-800">{titulo}</h3>
        {subtitulo && (
          <p className="text-[12px] text-slate-500 mt-0.5 leading-snug">{subtitulo}</p>
        )}
      </div>
      {children}
    </div>
  );
}

const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th
    className={`py-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 ${
      right ? "text-right" : "text-left"
    }`}
  >
    {children}
  </th>
);
const TD = ({ children, right, bold }: { children: React.ReactNode; right?: boolean; bold?: boolean }) => (
  <td
    className={`py-2 px-3 text-[13px] ${right ? "text-right tabular-nums" : ""} ${
      bold ? "font-semibold text-slate-800" : "text-slate-600"
    }`}
  >
    {children}
  </td>
);

export default function EfficiencyDashboard() {
  const [data, setData] = useState<EfficiencyResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setIsLoading(true);
        const d = await getDeenexEfficiency();
        if (alive) setData(d);
      } catch (e) {
        console.error(e);
        if (alive) setError("No se pudo cargar la eficiencia logística.");
      } finally {
        if (alive) setIsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (isLoading) return <div className="p-8 text-slate-500">Calculando eficiencia…</div>;
  if (error) return <div className="p-8 text-red-500">{error}</div>;
  if (!data) return null;

  const { resumen, canales, porDistancia, porDensidad, ranking, umbrales } = data;
  const peores = [...ranking].reverse().slice(0, 5);

  return (
    <div className="space-y-4 pb-8">
      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Entregas analizadas", valor: num(resumen.n) },
          { label: "Distancia mediana", valor: `${resumen.distanciaMediana} km` },
          { label: "Envío sobre la comida", valor: `${resumen.pctEnvioSobreComida}%` },
          { label: "Tiempo mediano", valor: `${resumen.tiempoMediano} min` },
          { label: "Locales con entregas", valor: num(resumen.localesConEntregas) },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-[11px] text-slate-400 uppercase tracking-wide">{k.label}</div>
            <div className="text-[22px] font-semibold text-slate-800 mt-1">{k.valor}</div>
          </div>
        ))}
      </div>

      {/* 1. Canal */}
      <Card
        titulo="¿Hace falta sumar operadores logísticos?"
        subtitulo="Compara la logística de terceros (Rappi y marketplaces) contra la flota propia. Si las entregas son cortas, rápidas y no fallan, el problema no es de capacidad logística."
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <TH>Canal</TH>
              <TH right>Entregas</TH>
              <TH right>Distancia</TH>
              <TH right>Tiempo</TH>
              <TH right>Envío / comida</TH>
              <TH right>Fallas reales</TH>
            </tr>
          </thead>
          <tbody>
            {canales.map((c) => (
              <tr key={c.canal} className="border-b border-slate-50 last:border-0">
                <TD bold>{c.canal === "terceros" ? "Terceros (Rappi)" : "Delivery propio"}</TD>
                <TD right>
                  {num(c.n)}
                  <NBadge n={c.n} />
                </TD>
                <TD right>{c.distanciaMediana} km</TD>
                <TD right>{c.nConTiempo > 0 ? `${c.tiempoMediano} min` : "—"}</TD>
                <TD right>{c.pctEnvioSobreComida}%</TD>
                <TD right>
                  {c.fallas} ({c.n ? ((100 * c.fallas) / c.n).toFixed(1) : 0}%)
                </TD>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* 1.b ¿Quién paga el envío? */}
      <Card
        titulo="¿Quién paga el envío?"
        subtitulo="El costo de envío se reparte entre lo que absorbe el comercio y lo que paga el cliente. Lo que absorbe el comercio es el costo real del canal; lo que paga el cliente no le cuesta al negocio."
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          {[
            { label: "Costo total de envío", valor: money(resumen.costoEnvioTotal) },
            { label: "Lo absorbe el comercio", valor: money(resumen.costoAbsorbidoMarca), destacar: true },
            { label: "Lo paga el cliente", valor: money(resumen.costoPagadoUsuario) },
            { label: "Envíos gratis", valor: num(resumen.enviosGratis) },
          ].map((k) => (
            <div key={k.label} className="rounded-lg bg-slate-50 p-3">
              <div className="text-[11px] text-slate-400 uppercase tracking-wide">{k.label}</div>
              <div className={`text-[17px] font-semibold mt-0.5 ${k.destacar ? "text-red-600" : "text-slate-800"}`}>
                {k.valor}
              </div>
            </div>
          ))}
        </div>
        {/* Barra: qué proporción del envío absorbe el negocio */}
        <div className="h-3 rounded-full overflow-hidden bg-slate-100 flex">
          <div
            className="bg-red-400"
            style={{ width: `${Math.min(resumen.pctEnvioAbsorbidoMarca, 100)}%` }}
            title={`Comercio: ${resumen.pctEnvioAbsorbidoMarca}%`}
          />
          <div className="bg-emerald-400 flex-1" title="Cliente" />
        </div>
        <div className="flex justify-between text-[11px] text-slate-500 mt-1">
          <span>
            Comercio <b>{resumen.pctEnvioAbsorbidoMarca}%</b>
          </span>
          <span>
            Cliente <b>{Number((100 - resumen.pctEnvioAbsorbidoMarca).toFixed(1))}%</b>
          </span>
        </div>

        <table className="w-full mt-4">
          <thead>
            <tr className="border-b border-slate-100">
              <TH>Canal</TH>
              <TH right>Costo total</TH>
              <TH right>Absorbe el comercio</TH>
              <TH right>% absorbido</TH>
              <TH right>Envíos gratis</TH>
            </tr>
          </thead>
          <tbody>
            {canales.map((c) => (
              <tr key={c.canal} className="border-b border-slate-50 last:border-0">
                <TD bold>{c.canal === "terceros" ? "Terceros (Rappi)" : "Delivery propio"}</TD>
                <TD right>{money(c.costoEnvioTotal)}</TD>
                <TD right>{money(c.costoAbsorbidoMarca)}</TD>
                <TD right>{c.pctEnvioAbsorbidoMarca}%</TD>
                <TD right>{c.enviosGratis}</TD>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* 2. Acantilado de distancia */}
      <Card
        titulo="¿Hasta dónde conviene entregar?"
        subtitulo="Costo y tiempo según qué tan lejos está la entrega del local. El punto donde el costo se dispara es tu límite económico real de cobertura."
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <TH>Distancia</TH>
              <TH right>Entregas</TH>
              <TH right>Envío mediano</TH>
              <TH right>Envío / comida</TH>
              <TH right>Tiempo</TH>
            </tr>
          </thead>
          <tbody>
            {porDistancia.map((d) => {
              // Marcamos el rango donde el peso del envío se va por encima del doble del mejor rango.
              const mejor = Math.min(...porDistancia.filter((x) => x.n > 0).map((x) => x.pctEnvioSobreComida));
              const caro = d.n > 0 && d.pctEnvioSobreComida >= mejor * 2;
              return (
                <tr key={d.rango} className={`border-b border-slate-50 last:border-0 ${caro ? "bg-red-50/50" : ""}`}>
                  <TD bold>{d.rango}</TD>
                  <TD right>
                    {num(d.n)}
                    {d.n > 0 && <NBadge n={d.n} />}
                  </TD>
                  <TD right>{d.n ? money(d.envioMediano) : "—"}</TD>
                  <TD right>
                    <span className={caro ? "text-red-600 font-semibold" : ""}>
                      {d.n ? `${d.pctEnvioSobreComida}%` : "—"}
                    </span>
                  </TD>
                  <TD right>{d.nConTiempo > 0 ? `${d.tiempoMediano} min` : "—"}</TD>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* 3. Densidad */}
      <Card
        titulo="¿Abrir más locales canibaliza o abarata?"
        subtitulo={`Locales agrupados según cuántos locales de la misma marca tienen a menos de ${umbrales.vecinoKm} km. Si al tener vecinos el costo de envío BAJA y los pedidos no se derrumban, densificar conviene.`}
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <TH>Grupo</TH>
              <TH right>Locales</TH>
              <TH right>Pedidos por local</TH>
              <TH right>Distancia</TH>
              <TH right>Envío / comida</TH>
            </tr>
          </thead>
          <tbody>
            {porDensidad.map((g) => (
              <tr key={g.grupo} className="border-b border-slate-50 last:border-0">
                <TD bold>{g.grupo}</TD>
                <TD right>{g.locales}</TD>
                <TD right>{g.pedidosMedianaPorLocal}</TD>
                <TD right>{g.distanciaMediana} km</TD>
                <TD right>{g.pctEnvioSobreComida}%</TD>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* 4. Ranking */}
      <Card
        titulo="Ranking de locales"
        subtitulo={`Ordenados por peso del envío sobre la comida (menos es mejor). Solo locales con ${umbrales.minPedidosLocal}+ entregas: ${resumen.localesRankeables} de ${resumen.localesConEntregas} llegan a ese piso.`}
      >
        {ranking.length === 0 ? (
          <div className="text-[13px] text-slate-400">
            Ningún local alcanza el mínimo de entregas para rankear.
          </div>
        ) : (
          <>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600 mb-1">
              Más eficientes
            </div>
            <RankTable filas={ranking.slice(0, 5)} />
            {peores.length > 0 && (
              <>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-red-500 mt-4 mb-1">
                  Menos eficientes
                </div>
                <RankTable filas={peores} />
              </>
            )}
          </>
        )}
      </Card>

      {/* Advertencias: qué NO dicen estos números */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <div className="text-[13px] font-semibold text-amber-800 mb-1.5">
          Qué NO dicen estos números
        </div>
        <ul className="text-[12px] text-amber-800/90 space-y-1 list-disc pl-4 leading-snug">
          {Object.values(data.advertencias).map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RankTable({ filas }: { filas: EfficiencyResponse["ranking"] }) {
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-slate-100">
          <TH>Local</TH>
          <TH>Marca</TH>
          <TH right>Entregas</TH>
          <TH right>Distancia</TH>
          <TH right>Envío / comida</TH>
          <TH right>% terceros</TH>
          <TH right>GMV</TH>
        </tr>
      </thead>
      <tbody>
        {filas.map((l) => (
          <tr key={l.id} className="border-b border-slate-50 last:border-0">
            <TD bold>{l.nombre}</TD>
            <TD>{l.marca}</TD>
            <TD right>{num(l.n)}</TD>
            <TD right>{l.distanciaMediana} km</TD>
            <TD right>{l.pctEnvioSobreComida}%</TD>
            <TD right>{l.pctTerceros}%</TD>
            <TD right>{money(l.gmv)}</TD>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
