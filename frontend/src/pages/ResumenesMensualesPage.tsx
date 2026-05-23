import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp, TrendingDown, BarChart3, Calendar, RefreshCw,
  Loader2, AlertCircle, ArrowUp, ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";
import { api } from "@/lib/axios";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ResumenMensual {
  id: number;
  year: number;
  month: number;
  total_ingresos: number;
  total_gastos: number;
  balance: number;
  cobros_cobrados: number;
  cobros_pendientes: number;
  pagos_pagados: number;
  pagos_pendientes: number;
  notas_count: number;
  tareas_creadas: number;
  tareas_completadas: number;
  categoria_top_gasto: string | null;
  monto_top_gasto: number | null;
  categoria_top_ingreso: string | null;
  monto_top_ingreso: number | null;
}

interface RegistroItem {
  id: number;
  fecha: string;
  tipo: "gasto" | "ingreso";
  monto: string;
  descripcion: string | null;
  categoria: { nombre: string; color: string };
}

// ── API ───────────────────────────────────────────────────────────────────────

async function getResumenes(): Promise<ResumenMensual[]> {
  const res = await api.get<ResumenMensual[]>("/resumenes");
  return res.data;
}

async function getRegistrosMes(year: number, month: number): Promise<RegistroItem[]> {
  const desde = `${year}-${String(month).padStart(2, "0")}-01`;
  const ultimoDia = new Date(year, month, 0).getDate();
  const hasta = `${year}-${String(month).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
  const res = await api.get("/registros", { params: { fecha_desde: desde, fecha_hasta: hasta, limit: 200 } });
  return res.data.items ?? [];
}

async function generarResumen(year?: number, month?: number): Promise<ResumenMensual> {
  const params = new URLSearchParams();
  if (year) params.set("year", String(year));
  if (month) params.set("month", String(month));
  const res = await api.post<ResumenMensual>(`/resumenes/generar?${params.toString()}`);
  return res.data;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MESES = [
  "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function fmt(n: number) {
  return new Intl.NumberFormat("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function DeltaBadge({ current, prev, label }: { current: number; prev: number; label: string }) {
  if (!prev) return null;
  const delta = current - prev;
  const pct = Math.round((delta / Math.abs(prev)) * 100);
  const positive = delta >= 0;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded",
      positive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
    )}>
      {positive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(pct)}% vs {label}
    </span>
  );
}

// ── Tarjeta de resumen ────────────────────────────────────────────────────────

function ResumenCard({
  r,
  prev,
  selected,
  onClick,
}: {
  r: ResumenMensual;
  prev?: ResumenMensual;
  selected: boolean;
  onClick: () => void;
}) {
  const balancePos = r.balance >= 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-xl border p-4 transition-all",
        selected
          ? "border-agro-primary bg-agro-primary/5 ring-1 ring-agro-primary/30"
          : "border-agro-accent/20 bg-white hover:border-agro-primary/30",
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-agro-text">
          {MESES[r.month]} {r.year}
        </span>
        <span className={cn(
          "text-xs font-semibold px-2 py-0.5 rounded-full",
          balancePos ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
        )}>
          {balancePos ? "+" : ""}${fmt(r.balance)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-agro-muted">Ingresos</p>
          <p className="font-semibold text-emerald-700">${fmt(r.total_ingresos)}</p>
          {prev && <DeltaBadge current={r.total_ingresos} prev={prev.total_ingresos} label={MESES[prev.month]} />}
        </div>
        <div>
          <p className="text-agro-muted">Gastos</p>
          <p className="font-semibold text-red-600">${fmt(r.total_gastos)}</p>
          {prev && <DeltaBadge current={r.total_gastos} prev={prev.total_gastos} label={MESES[prev.month]} />}
        </div>
      </div>
    </button>
  );
}

// ── Panel de detalle ──────────────────────────────────────────────────────────

function MovimientosMes({ year, month }: { year: number; month: number }) {
  const { data: registros = [], isLoading } = useQuery({
    queryKey: ["registros-mes", year, month],
    queryFn: () => getRegistrosMes(year, month),
  });

  if (isLoading) return (
    <div className="flex justify-center py-4">
      <Loader2 className="h-4 w-4 animate-spin text-agro-muted" />
    </div>
  );

  if (registros.length === 0) return (
    <p className="text-xs text-agro-muted text-center py-3">Sin movimientos registrados en este mes.</p>
  );

  return (
    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
      {registros.map((r) => (
        <div key={r.id} className="flex items-center gap-2 text-xs py-1.5 border-b border-agro-accent/10 last:border-0">
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: r.categoria.color }}
          />
          <span className="text-agro-muted w-16 shrink-0">
            {new Date(r.fecha + "T00:00:00").toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit" })}
          </span>
          <span className="flex-1 truncate text-agro-text">{r.descripcion || r.categoria.nombre}</span>
          <span className={`font-mono font-semibold shrink-0 ${r.tipo === "gasto" ? "text-red-500" : "text-emerald-600"}`}>
            {r.tipo === "gasto" ? "−" : "+"}${new Intl.NumberFormat("es-UY").format(parseFloat(r.monto))}
          </span>
        </div>
      ))}
    </div>
  );
}

function ResumenDetalle({ r, prev }: { r: ResumenMensual; prev?: ResumenMensual }) {
  const balancePos = r.balance >= 0;
  const tasaCompletadas = r.tareas_creadas > 0
    ? Math.round((r.tareas_completadas / r.tareas_creadas) * 100)
    : 0;

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-agro-primary/10">
          <BarChart3 className="h-5 w-5 text-agro-primary" />
        </div>
        <div>
          <h2 className="text-base font-bold text-agro-text">{MESES[r.month]} {r.year}</h2>
          <p className="text-xs text-agro-muted">Resumen financiero del mes</p>
        </div>
      </div>

      {/* Balance principal */}
      <div className={cn(
        "rounded-xl p-4 border",
        balancePos ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
      )}>
        <p className="text-xs text-agro-muted mb-1">Balance del mes</p>
        <p className={cn("text-2xl font-bold", balancePos ? "text-emerald-700" : "text-red-600")}>
          {balancePos ? "+" : ""}${fmt(r.balance)}
        </p>
        {prev && (
          <DeltaBadge current={r.balance} prev={prev.balance} label={`${MESES[prev.month]}`} />
        )}
      </div>

      {/* Ingresos y gastos */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
            <p className="text-xs font-medium text-emerald-700">Ingresos</p>
          </div>
          <p className="text-lg font-bold text-emerald-700">${fmt(r.total_ingresos)}</p>
          {r.categoria_top_ingreso && (
            <p className="text-xs text-emerald-600 mt-1">
              Top: {r.categoria_top_ingreso} (${fmt(r.monto_top_ingreso ?? 0)})
            </p>
          )}
          {prev && <DeltaBadge current={r.total_ingresos} prev={prev.total_ingresos} label={MESES[prev.month]} />}
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown className="h-3.5 w-3.5 text-red-600" />
            <p className="text-xs font-medium text-red-700">Gastos</p>
          </div>
          <p className="text-lg font-bold text-red-600">${fmt(r.total_gastos)}</p>
          {r.categoria_top_gasto && (
            <p className="text-xs text-red-600 mt-1">
              Top: {r.categoria_top_gasto} (${fmt(r.monto_top_gasto ?? 0)})
            </p>
          )}
          {prev && <DeltaBadge current={r.total_gastos} prev={prev.total_gastos} label={MESES[prev.month]} />}
        </div>
      </div>

      {/* Cobros y pagos pendientes */}
      {(r.cobros_pendientes > 0 || r.pagos_pendientes > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
          <p className="text-xs font-semibold text-amber-700 mb-2">Pendientes acumulados</p>
          {r.cobros_pendientes > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-amber-700">Por cobrar</span>
              <span className="font-semibold text-amber-800">${fmt(r.cobros_pendientes)}</span>
            </div>
          )}
          {r.pagos_pendientes > 0 && (
            <div className="flex justify-between text-xs">
              <span className="text-amber-700">Por pagar</span>
              <span className="font-semibold text-amber-800">${fmt(r.pagos_pendientes)}</span>
            </div>
          )}
        </div>
      )}

      {/* Cuaderno */}
      <div className="rounded-xl border border-agro-accent/20 bg-white p-3">
        <p className="text-xs font-semibold text-agro-text mb-2">Actividad del cuaderno</p>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <p className="text-lg font-bold text-agro-primary">{r.notas_count}</p>
            <p className="text-agro-muted">Notas</p>
          </div>
          <div>
            <p className="text-lg font-bold text-agro-primary">{r.tareas_creadas}</p>
            <p className="text-agro-muted">Tareas</p>
          </div>
          <div>
            <p className="text-lg font-bold text-emerald-600">{tasaCompletadas}%</p>
            <p className="text-agro-muted">Completadas</p>
          </div>
        </div>
      </div>

      {/* Movimientos del mes */}
      <div className="rounded-xl border border-agro-accent/20 bg-white p-3">
        <p className="text-xs font-semibold text-agro-text mb-2">Movimientos del mes</p>
        <MovimientosMes year={r.year} month={r.month} />
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ResumenesMensualesPage() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<number | null>(null);

  const { data: resumenes = [], isLoading } = useQuery({
    queryKey: ["resumenes"],
    queryFn: getResumenes,
  });

  useEffect(() => {
    if (resumenes.length > 0 && selected === null) setSelected(resumenes[0].id);
  }, [resumenes]);

  const generar = useMutation({
    mutationFn: () => generarResumen(),
    onSuccess: (nuevo) => {
      queryClient.invalidateQueries({ queryKey: ["resumenes"] });
      setSelected(nuevo.id);
      toast({ title: "Resumen generado", description: `${MESES[nuevo.month]} ${nuevo.year}` });
    },
    onError: () => toast({ title: "Error", description: "No se pudo generar el resumen.", variant: "destructive" }),
  });

  const selectedResumen = resumenes.find((r) => r.id === selected);
  const selectedIndex = resumenes.findIndex((r) => r.id === selected);
  const prevResumen = selectedIndex >= 0 ? resumenes[selectedIndex + 1] : undefined;

  return (
    <div className="page-fade flex flex-col h-full bg-agro-bg overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-agro-accent/20 px-3 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-agro-primary/10">
              <Calendar className="h-5 w-5 text-agro-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-agro-text">Resúmenes mensuales</h1>
              <p className="text-xs text-agro-muted">Historial financiero y comparativa</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => generar.mutate()}
            disabled={generar.isPending}
          >
            {generar.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />
            }
            Generar mes anterior
          </Button>
        </div>
      </div>

      <div className="flex-1 px-3 py-4 sm:px-6 sm:py-6">
        <div className="max-w-5xl mx-auto">

          {isLoading && (
            <div className="flex justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-agro-muted" />
            </div>
          )}

          {!isLoading && resumenes.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
              <AlertCircle className="h-12 w-12 text-agro-accent/40" />
              <p className="text-sm font-medium text-agro-text">Sin resúmenes todavía</p>
              <p className="text-xs text-agro-muted max-w-xs">
                Los resúmenes se generan automáticamente el 1° de cada mes.
                También podés generarlo manualmente con el botón de arriba.
              </p>
              <Button size="sm" onClick={() => generar.mutate()} disabled={generar.isPending}>
                {generar.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Generar ahora
              </Button>
            </div>
          )}

          {!isLoading && resumenes.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Lista de meses */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-agro-muted uppercase tracking-wider">Historial</p>
                {resumenes.map((r, i) => (
                  <ResumenCard
                    key={r.id}
                    r={r}
                    prev={resumenes[i + 1]}
                    selected={r.id === selected}
                    onClick={() => setSelected(r.id)}
                  />
                ))}
              </div>

              {/* Detalle */}
              <div className="lg:col-span-2">
                {selectedResumen ? (
                  <div className="rounded-xl border border-agro-accent/20 bg-white p-5">
                    <ResumenDetalle r={selectedResumen} prev={prevResumen} />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-agro-muted text-sm">
                    Seleccioná un mes para ver el detalle
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
