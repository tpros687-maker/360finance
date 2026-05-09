import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PotreroRentabilidadAnio } from "@/types/rentabilidad";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtUSD(n: number | null | undefined, decimals = 0): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

function variacion(actual: number | null, anterior: number | null): number | null {
  if (actual == null || anterior == null || anterior === 0) return null;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
}

// ── Custom tooltip for the chart ──────────────────────────────────────────────

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs shadow-xl">
      <p className="font-semibold text-slate-100 mb-1">{d.anio}</p>
      <p className="text-slate-400">
        Margen/ha:{" "}
        <span className={d.valor >= 0 ? "text-emerald-400" : "text-red-400"}>
          {fmtUSD(d.valor, 1)}
        </span>
      </p>
      <p className="text-slate-400">
        Margen total: <span className="text-slate-200">{fmtUSD(d.margen_total)}</span>
      </p>
      {d.es_proyectado && (
        <p className="text-yellow-400 mt-1">Año en curso (proyectado)</p>
      )}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  datos: PotreroRentabilidadAnio[];
  isLoading?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function HistoricoAnual({ datos, isLoading }: Props) {
  if (isLoading) {
    return <div className="h-64 rounded-2xl bg-slate-800 animate-pulse" />;
  }

  if (!datos.length) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-8 text-center text-sm text-slate-400">
        Sin datos históricos disponibles.
      </div>
    );
  }

  const chartData = datos.map((d) => ({
    anio: d.anio,
    valor: d.margen_neto_ha_anualizado_usd ?? d.margen_neto_ha_usd ?? 0,
    margen_total: d.margen_neto_usd,
    es_proyectado: d.es_proyectado,
  }));

  const maxAbs = Math.max(...chartData.map((d) => Math.abs(d.valor)), 1);
  const domainPad = Math.ceil(maxAbs * 1.2 / 50) * 50;

  return (
    <div className="space-y-4">
      {/* Bar chart */}
      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
        <p className="text-xs text-slate-400 mb-3">Margen neto / ha / año · USD</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis
              dataKey="anio"
              tick={{ fontSize: 12, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={[-domainPad, domainPad]}
              tick={{ fontSize: 11, fill: "#64748b" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}`}
              width={40}
            />
            <ReferenceLine y={0} stroke="#475569" strokeWidth={1} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar dataKey="valor" radius={[6, 6, 0, 0]} maxBarSize={56}>
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    entry.es_proyectado
                      ? entry.valor >= 0 ? "#34d399aa" : "#f87171aa"
                      : entry.valor >= 0 ? "#10b981"   : "#ef4444"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-slate-600 mt-1 text-right">
          Barras semitransparentes = año en curso
        </p>
      </div>

      {/* Comparison table */}
      <div className="rounded-2xl border border-slate-700 bg-slate-900 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-700 text-slate-500 uppercase tracking-wider text-[11px]">
              <th className="px-4 py-2.5 text-left font-medium">Año</th>
              <th className="px-4 py-2.5 text-right font-medium">Margen/ha/año</th>
              <th className="px-4 py-2.5 text-right font-medium">Margen total</th>
              <th className="px-4 py-2.5 text-right font-medium">Var. %</th>
            </tr>
          </thead>
          <tbody>
            {datos.map((d, i) => {
              const anterior = i > 0 ? (datos[i - 1].margen_neto_ha_anualizado_usd ?? datos[i - 1].margen_neto_ha_usd ?? null) : null;
              const actual   = d.margen_neto_ha_anualizado_usd ?? d.margen_neto_ha_usd ?? null;
              const varPct   = variacion(actual, anterior);
              const positivo = actual != null && actual >= 0;
              const mejoro   = varPct != null && varPct > 0;

              return (
                <tr
                  key={d.anio}
                  className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-slate-200">
                    {d.anio}
                    {d.es_proyectado && (
                      <span className="ml-1.5 text-[10px] text-yellow-400">en curso</span>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-right font-semibold ${positivo ? "text-emerald-400" : actual == null ? "text-slate-500" : "text-red-400"}`}>
                    {fmtUSD(actual, 1)}
                  </td>
                  <td className={`px-4 py-3 text-right ${d.margen_neto_usd >= 0 ? "text-slate-300" : "text-red-400"}`}>
                    {fmtUSD(d.margen_neto_usd)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {varPct == null ? (
                      <span className="text-slate-600">—</span>
                    ) : (
                      <span className={`font-semibold ${mejoro ? "text-emerald-400" : "text-red-400"}`}>
                        {mejoro ? "▲" : "▼"} {Math.abs(varPct).toFixed(1)}%
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
