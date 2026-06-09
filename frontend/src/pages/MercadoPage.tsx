import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPredicciones } from "@/lib/mercadoApi";
import type { CategoriaMercado, Tendencia, Unidad } from "@/types/mercado";

// ── Helpers ───────────────────────────────────────────────────────────────────

const GRUPOS_ORDEN = [
  "Terneros / Terneras",
  "Novillos invernada",
  "Vaquillonas",
  "Vacas invernada",
  "Cría",
  "Gordo (frigorífico)",
];

const GRUPO_COLORES: Record<string, string> = {
  "Terneros / Terneras": "#10b981",
  "Novillos invernada":  "#3b82f6",
  "Vaquillonas":         "#8b5cf6",
  "Vacas invernada":     "#f59e0b",
  "Cría":                "#f97316",
  "Gordo (frigorífico)": "#ef4444",
};

function fmtPrecio(v: number, unidad: Unidad): string {
  return unidad === "kg"
    ? `USD ${v.toFixed(3)}/kg`
    : `USD ${v.toFixed(0)}/cab`;
}

function fmtMes(mes: string): string {
  const [y, m] = mes.split("-");
  const names = ["","Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `${names[parseInt(m)]} ${y.slice(2)}`;
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

function TendenciaIcon({ t }: { t: Tendencia }) {
  if (t === "sube") return <TrendingUp className="h-4 w-4 text-emerald-500" />;
  if (t === "baja") return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-agro-muted" />;
}

function TendenciaBadge({ t, prom, actual, unidad }: { t: Tendencia; prom: number; actual: number; unidad: Unidad }) {
  const diff = prom - actual;
  const pct = actual > 0 ? (diff / actual) * 100 : 0;
  const sign = diff >= 0 ? "+" : "";
  const color = t === "sube" ? "text-emerald-600 bg-emerald-50" : t === "baja" ? "text-red-600 bg-red-50" : "text-agro-muted bg-agro-bg";
  const label = unidad === "kg" ? `${sign}${diff.toFixed(3)}` : `${sign}${diff.toFixed(0)}`;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      <TendenciaIcon t={t} />
      {label} ({sign}{pct.toFixed(1)}%)
    </span>
  );
}

function AlertaBadge({ n }: { n: number }) {
  if (n === 0) return <span className="text-xs text-agro-muted">Sin alertas</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
      <AlertTriangle className="h-3 w-3" />
      {n} alerta{n > 1 ? "s" : ""}
    </span>
  );
}

// ── Gráfico de proyección ─────────────────────────────────────────────────────

function GraficoProyeccion({ cat, color }: { cat: CategoriaMercado; color: string }) {
  const data = cat.proyeccion.map((p) => ({
    mes: fmtMes(p.mes),
    estimado: p.estimado,
    minimo: p.minimo,
    maximo: p.maximo,
  }));

  const yDomain = (): [number, number] => {
    const vals = cat.proyeccion.flatMap((p) => [p.minimo, p.maximo]);
    const mn = Math.min(...vals, cat.alerta_baja) * 0.95;
    const mx = Math.max(...vals, cat.alerta_alta) * 1.05;
    return [parseFloat(mn.toFixed(2)), parseFloat(mx.toFixed(2))];
  };

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`grad-${cat.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#9ca3af" }} tickLine={false} axisLine={false} />
        <YAxis
          tick={{ fontSize: 10, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          domain={yDomain()}
          tickFormatter={(v) => cat.unidad === "kg" ? v.toFixed(2) : v.toFixed(0)}
        />
        <Tooltip
          formatter={(v: number) => [fmtPrecio(v, cat.unidad), ""]}
          labelStyle={{ fontWeight: 600, color: "#1f2937" }}
          contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
        />
        <ReferenceLine y={cat.alerta_alta} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1.2}
          label={{ value: "Alerta alta", position: "insideTopRight", fontSize: 9, fill: "#ef4444" }} />
        <ReferenceLine y={cat.alerta_baja} stroke="#3b82f6" strokeDasharray="4 2" strokeWidth={1.2}
          label={{ value: "Alerta baja", position: "insideBottomRight", fontSize: 9, fill: "#3b82f6" }} />
        {/* Banda de confianza */}
        <Area type="monotone" dataKey="maximo" stroke="none" fill={`url(#grad-${cat.id})`} />
        <Area type="monotone" dataKey="minimo" stroke="none" fill="white" />
        {/* Línea central */}
        <Area
          type="monotone"
          dataKey="estimado"
          stroke={color}
          strokeWidth={2.5}
          fill="none"
          dot={false}
          activeDot={{ r: 4, fill: color }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Tarjeta de categoría ──────────────────────────────────────────────────────

function TarjetaCategoria({ cat, color }: { cat: CategoriaMercado; color: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border border-agro-accent/20 shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: color }} />
              <span className="text-[10px] font-medium text-agro-muted uppercase tracking-wide">
                {cat.fuente} · {cat.unidad === "kg" ? "USD/kg" : "USD/cab"}
              </span>
            </div>
            <CardTitle className="text-sm font-semibold text-agro-text leading-tight">
              {cat.nombre}
            </CardTitle>
          </div>
          <AlertaBadge n={cat.alertas.length} />
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Precios */}
        <div className="flex items-end gap-4">
          <div>
            <p className="text-[10px] text-agro-muted mb-0.5">Precio actual</p>
            <p className="text-xl font-bold text-agro-text">{fmtPrecio(cat.precio_actual, cat.unidad)}</p>
          </div>
          <div className="flex-1">
            <p className="text-[10px] text-agro-muted mb-0.5">Proyección 12 meses</p>
            <TendenciaBadge t={cat.tendencia} prom={cat.prom_proyectado} actual={cat.precio_actual} unidad={cat.unidad} />
          </div>
        </div>

        {/* Gráfico */}
        <GraficoProyeccion cat={cat} color={color} />

        {/* Expand: tabla + alertas */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1 text-xs text-agro-muted hover:text-agro-primary transition-colors py-1"
        >
          {expanded ? (
            <><ChevronUp className="h-3.5 w-3.5" /> Ocultar detalle</>
          ) : (
            <><ChevronDown className="h-3.5 w-3.5" /> Ver detalle mensual</>
          )}
        </button>

        {expanded && (
          <div className="space-y-3 pt-1">
            {/* Alertas */}
            {cat.alertas.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-agro-text">Alertas detectadas</p>
                {cat.alertas.map((a) => (
                  <div
                    key={a.mes}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                      a.tipo === "alta" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      <strong>{fmtMes(a.mes)}</strong>: precio estimado {fmtPrecio(a.precio, cat.unidad)}
                      {" — "}
                      {a.tipo === "alta" ? "por encima del umbral de venta" : "por debajo del umbral mínimo"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Tabla mensual */}
            <div className="overflow-x-auto rounded-lg border border-agro-accent/20">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-agro-bg border-b border-agro-accent/20">
                    <th className="px-3 py-2 text-left font-semibold text-agro-muted">Mes</th>
                    <th className="px-3 py-2 text-right font-semibold text-agro-muted">Estimado</th>
                    <th className="px-3 py-2 text-right font-semibold text-agro-muted">Mínimo</th>
                    <th className="px-3 py-2 text-right font-semibold text-agro-muted">Máximo</th>
                  </tr>
                </thead>
                <tbody>
                  {cat.proyeccion.map((p, i) => (
                    <tr
                      key={p.mes}
                      className={`border-b border-agro-accent/10 ${
                        p.alerta === "alta" ? "bg-red-50" : p.alerta === "baja" ? "bg-blue-50" : i % 2 === 0 ? "bg-white" : "bg-agro-bg/40"
                      }`}
                    >
                      <td className="px-3 py-1.5 font-medium text-agro-text">{fmtMes(p.mes)}</td>
                      <td className={`px-3 py-1.5 text-right font-semibold ${p.alerta ? "text-amber-700" : "text-agro-text"}`}>
                        {cat.unidad === "kg" ? p.estimado.toFixed(3) : p.estimado.toFixed(0)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-agro-muted">
                        {cat.unidad === "kg" ? p.minimo.toFixed(3) : p.minimo.toFixed(0)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-agro-muted">
                        {cat.unidad === "kg" ? p.maximo.toFixed(3) : p.maximo.toFixed(0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function MercadoPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["mercado"],
    queryFn: getPredicciones,
    staleTime: 1000 * 60 * 60, // 1 hora
  });

  // Agrupar categorías
  const grupos: Record<string, CategoriaMercado[]> = {};
  for (const cat of data?.categorias ?? []) {
    if (!grupos[cat.grupo]) grupos[cat.grupo] = [];
    grupos[cat.grupo].push(cat);
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-agro-text">Mercado Ganadero</h1>
          <p className="text-sm text-agro-muted mt-1">
            Predicción de precios a 12 meses para todas las categorías · Fuentes: INAC + Plaza Rural
          </p>
          {data?.actualizado && (
            <p className="text-xs text-agro-muted mt-0.5">
              Modelo actualizado: {data.actualizado}
            </p>
          )}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 rounded-lg border border-agro-accent/30 bg-white px-3 py-2 text-sm font-medium text-agro-muted hover:text-agro-primary hover:border-agro-primary transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {/* Nota informativa */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
        <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700 leading-relaxed">
          Las proyecciones se basan en modelos de inteligencia artificial entrenados con datos históricos
          de INAC y Plaza Rural (2001–2026). Son una referencia orientativa para la toma de decisiones,
          no una garantía de precios futuros. El intervalo sombreado en cada gráfico representa el rango
          de confianza del 90%.
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="border border-agro-accent/20 animate-pulse">
              <CardContent className="h-72 bg-agro-bg/50 rounded-lg" />
            </Card>
          ))}
        </div>
      )}

      {/* Error */}
      {isError && (
        <Card className="border border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-3 py-6">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-700">No se pudieron cargar las predicciones</p>
              <p className="text-xs text-red-600 mt-0.5">
                El modelo puede estar inicializándose. Intentá de nuevo en unos minutos.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grupos de categorías */}
      {!isLoading && !isError && (
        <div className="space-y-8">
          {GRUPOS_ORDEN.map((grupo) => {
            const cats = grupos[grupo];
            if (!cats?.length) return null;
            const color = GRUPO_COLORES[grupo] ?? "#6b7280";
            return (
              <section key={grupo}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-4 w-1 rounded-full" style={{ background: color }} />
                  <h2 className="text-base font-semibold text-agro-text">{grupo}</h2>
                  <div className="flex-1 h-px bg-agro-accent/20" />
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {cats.map((cat) => (
                    <TarjetaCategoria key={cat.id} cat={cat} color={color} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
