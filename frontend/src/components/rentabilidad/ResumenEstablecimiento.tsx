import { useState } from "react";
import { TrendingUp, TrendingDown, Calendar, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { PotreroRentabilidad, ProyeccionAnual } from "@/types/rentabilidad";

// ── Período ───────────────────────────────────────────────────────────────────

type TipoPeriodo = "este_anio" | "anio_pasado" | "personalizado";

export interface Periodo {
  tipo: TipoPeriodo;
  fecha_desde: string;
  fecha_hasta: string;
}

function periodoEsteAnio(): Periodo {
  const hoy = new Date();
  return {
    tipo: "este_anio",
    fecha_desde: `${hoy.getFullYear()}-01-01`,
    fecha_hasta: hoy.toISOString().split("T")[0],
  };
}

function periodoAnioPasado(): Periodo {
  const anio = new Date().getFullYear() - 1;
  return {
    tipo: "anio_pasado",
    fecha_desde: `${anio}-01-01`,
    fecha_hasta: `${anio}-12-31`,
  };
}

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

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  potreros: PotreroRentabilidad[];
  proyeccion: ProyeccionAnual | null;
  isLoading: boolean;
  periodo: Periodo;
  onPeriodoChange: (p: Periodo) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ResumenEstablecimiento({
  potreros,
  proyeccion,
  isLoading,
  periodo,
  onPeriodoChange,
}: Props) {
  const [showCustom, setShowCustom] = useState(false);
  const [customDesde, setCustomDesde] = useState(periodo.fecha_desde);
  const [customHasta, setCustomHasta] = useState(periodo.fecha_hasta);

  // Totals derived from potreros list
  const totalMargenNeto = potreros.reduce((s, p) => s + p.margen_neto_usd, 0);
  const totalHa = potreros.reduce((s, p) => s + (p.hectareas ?? 0), 0);
  const margenHa = totalHa > 0 ? totalMargenNeto / totalHa : null;

  // Weighted-average annualized (only potreros with ha and annualized data)
  const potrerosPeso = potreros.filter((p) => p.hectareas && p.margen_neto_ha_anualizado_usd != null);
  const margenHaAnualizado =
    potrerosPeso.length > 0 && totalHa > 0
      ? potrerosPeso.reduce((s, p) => s + p.margen_neto_ha_anualizado_usd! * (p.hectareas ?? 0), 0) /
        potrerosPeso.reduce((s, p) => s + (p.hectareas ?? 0), 0)
      : null;

  const positivo = totalMargenNeto >= 0;

  function selectPeriodo(tipo: TipoPeriodo) {
    if (tipo === "este_anio") { onPeriodoChange(periodoEsteAnio()); setShowCustom(false); }
    else if (tipo === "anio_pasado") { onPeriodoChange(periodoAnioPasado()); setShowCustom(false); }
    else { setShowCustom(true); }
  }

  function applyCustom() {
    if (!customDesde || !customHasta) return;
    onPeriodoChange({ tipo: "personalizado", fecha_desde: customDesde, fecha_hasta: customHasta });
    setShowCustom(false);
  }

  const tipoLabels: Record<TipoPeriodo, string> = {
    este_anio: "Este año",
    anio_pasado: "Año pasado",
    personalizado: "Personalizado",
  };

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2">
        {(["este_anio", "anio_pasado", "personalizado"] as TipoPeriodo[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => selectPeriodo(t)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              periodo.tipo === t
                ? "bg-brand-600 text-white"
                : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            }`}
          >
            <Calendar className="h-3 w-3" />
            {tipoLabels[t]}
          </button>
        ))}
        {periodo.tipo !== "personalizado" && (
          <span className="text-xs text-slate-500">
            {periodo.fecha_desde} → {periodo.fecha_hasta}
          </span>
        )}
      </div>

      {/* Custom date inputs */}
      {showCustom && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-700 bg-slate-800/50 p-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Desde</label>
            <Input type="date" value={customDesde} onChange={(e) => setCustomDesde(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Hasta</label>
            <Input type="date" value={customHasta} onChange={(e) => setCustomHasta(e.target.value)} className="h-8 text-xs" />
          </div>
          <Button size="sm" className="h-8 text-xs" onClick={applyCustom}>
            Aplicar
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setShowCustom(false)}>
            Cancelar
          </Button>
        </div>
      )}

      {/* Metrics grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Main: Margen neto/ha/año */}
        <div className="sm:col-span-1 rounded-2xl border border-slate-700 bg-slate-900 p-5 flex flex-col justify-between">
          <p className="text-xs text-slate-400 mb-2">Margen neto / ha / año</p>
          {isLoading ? (
            <div className="h-10 w-32 rounded-lg bg-slate-800 animate-pulse" />
          ) : (
            <div className="flex items-end gap-2">
              <span
                className={`text-4xl font-bold tracking-tight ${
                  margenHaAnualizado == null
                    ? "text-slate-500"
                    : margenHaAnualizado >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {margenHaAnualizado != null ? fmtUSD(margenHaAnualizado) : "—"}
              </span>
              {margenHaAnualizado != null && (
                <span className="text-sm text-slate-400 mb-1">/ ha</span>
              )}
            </div>
          )}
          {totalHa > 0 && (
            <p className="text-xs text-slate-500 mt-2">{totalHa.toFixed(1)} ha totales</p>
          )}
        </div>

        {/* Margen neto total del período */}
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5 flex flex-col justify-between">
          <p className="text-xs text-slate-400 mb-2">Margen neto del período</p>
          {isLoading ? (
            <div className="h-8 w-28 rounded-lg bg-slate-800 animate-pulse" />
          ) : (
            <div className="flex items-center gap-2">
              {positivo ? (
                <TrendingUp className="h-5 w-5 text-emerald-400 shrink-0" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-400 shrink-0" />
              )}
              <span
                className={`text-2xl font-semibold ${
                  positivo ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {fmtUSD(totalMargenNeto)}
              </span>
            </div>
          )}
          {margenHa != null && (
            <p className="text-xs text-slate-500 mt-2">
              {fmtUSD(margenHa, 1)} / ha en el período
            </p>
          )}
        </div>

        {/* Proyección al cierre del año */}
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-slate-400">Proyección al cierre del año</p>
            <span className="text-[10px] bg-slate-800 text-slate-400 rounded-full px-2 py-0.5">
              escenario base
            </span>
          </div>
          {isLoading || !proyeccion ? (
            <div className="h-8 w-28 rounded-lg bg-slate-800 animate-pulse" />
          ) : (
            <div>
              <span
                className={`text-2xl font-semibold ${
                  proyeccion.base.margen_usd >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
                }`}
              >
                {fmtUSD(proyeccion.base.margen_usd)}
              </span>
            </div>
          )}
          {proyeccion && (
            <div className="mt-2 flex gap-3 text-[11px] text-slate-500">
              <span>
                Pesimista:{" "}
                <span className="text-red-400">
                  {fmtUSD(proyeccion.pesimista.margen_usd)}
                </span>
              </span>
              <span>
                Optimista:{" "}
                <span className="text-emerald-400">
                  {fmtUSD(proyeccion.optimista.margen_usd)}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { periodoEsteAnio };
