import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, ExternalLink, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { Semaforo } from "./Semaforo";
import type { Referencias } from "./Semaforo";
import { getRentabilidadPotrero } from "@/lib/rentabilidadApi";
import type { PotreroRentabilidad, ActividadRentabilidad, GastoResumen } from "@/types/rentabilidad";
import type { Periodo } from "./ResumenEstablecimiento";

// ── Reference defaults by activity type ──────────────────────────────────────

const REF_GANADERIA: Referencias = { bajo: 100, medio: 180, alto: 260 };
const REF_AGRICOLA: Referencias  = { bajo: 150, medio: 250, alto: 380 };
const REF_DEFAULT: Referencias   = { bajo: 80,  medio: 150, alto: 220 };

function getRef(actividades: ActividadRentabilidad[]): Referencias {
  const tipos = new Set(actividades.map((a) => a.actividad_tipo));
  if (tipos.has("ciclo") && !tipos.has("lote")) return REF_AGRICOLA;
  if (tipos.has("lote") && !tipos.has("ciclo")) return REF_GANADERIA;
  return REF_DEFAULT;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtUSD(n: number | null | undefined, decimals = 0): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

function actividadLabel(a: ActividadRentabilidad): string {
  return a.nombre || (a.actividad_tipo === "lote" ? `Lote #${a.actividad_id}` : `Ciclo #${a.actividad_id}`);
}

function actividadResumen(actividades: ActividadRentabilidad[]): string {
  const lotes  = actividades.filter((a) => a.actividad_tipo === "lote").length;
  const ciclos = actividades.filter((a) => a.actividad_tipo === "ciclo").length;
  const partes: string[] = [];
  if (lotes)  partes.push(`${lotes} lote${lotes > 1 ? "s" : ""}`);
  if (ciclos) partes.push(`${ciclos} ciclo${ciclos > 1 ? "s" : ""}`);
  return partes.join(", ") || "Sin actividades";
}

// ── Detail panel (fetched on expand) ─────────────────────────────────────────

function DetallePotrero({ potreroId, periodo }: { potreroId: number; periodo: Periodo }) {
  const { data, isLoading } = useQuery({
    queryKey: ["rentabilidad-potrero", potreroId, periodo.fecha_desde, periodo.fecha_hasta],
    queryFn: () =>
      getRentabilidadPotrero(potreroId, {
        fecha_desde: periodo.fecha_desde,
        fecha_hasta: periodo.fecha_hasta,
      }),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 px-1 text-xs text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Cargando detalle…
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-4 pt-2">
      {/* Actividades */}
      {data.actividades.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-2">
            Actividades del período
          </p>
          <div className="space-y-1.5">
            {data.actividades.map((act) => (
              <div
                key={`${act.actividad_tipo}-${act.actividad_id}`}
                className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      act.actividad_tipo === "lote"
                        ? "bg-sky-500/20 text-sky-300"
                        : "bg-lime-500/20 text-lime-300"
                    }`}
                  >
                    {act.actividad_tipo === "lote" ? "Gan." : "Agr."}
                  </span>
                  <span className="text-xs text-slate-200 truncate">{actividadLabel(act)}</span>
                  {act.es_proyectado && (
                    <span className="shrink-0 text-[10px] text-yellow-400">proyectado</span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-2">
                  <span className="text-xs text-slate-400">
                    Ing: {fmtUSD(act.ingresos_usd)}
                  </span>
                  <span
                    className={`text-xs font-semibold ${
                      act.margen_usd >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    MB: {fmtUSD(act.margen_usd)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gastos estructurales/prorrateados */}
      <div className="flex gap-4 text-xs text-slate-400">
        <span>Prorrateo: <span className="text-slate-300">{fmtUSD(data.gastos_prorrateados_usd)}</span></span>
        <span>Estructural: <span className="text-slate-300">{fmtUSD(data.gastos_estructurales_usd)}</span></span>
      </div>

      {/* Link to full detail page */}
      <Link
        to={`/rentabilidad-ha/potreros/${data.potrero_id}`}
        className="inline-flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors"
      >
        <ExternalLink className="h-3 w-3" />
        Ver detalle completo
      </Link>

      {/* Top 5 gastos */}
      {data.top_gastos.length > 0 && (
        <div>
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-2">
            Top gastos del período
          </p>
          <div className="space-y-1">
            {data.top_gastos.map((g: GastoResumen) => (
              <div
                key={g.id}
                className="flex items-center justify-between rounded-lg bg-slate-800/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-xs text-slate-200 truncate">
                    {g.descripcion || "Sin descripción"}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {g.fecha}
                    {g.tipo_imputacion ? ` · ${g.tipo_imputacion}` : ""}
                  </p>
                </div>
                <div className="shrink-0 ml-2 text-right">
                  <p className="text-xs font-semibold text-red-400">
                    {fmtUSD(g.monto_usd)}
                  </p>
                  {g.moneda !== "USD" && (
                    <p className="text-[10px] text-slate-500">
                      {g.moneda} {g.monto.toLocaleString("es-UY")}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function FilaPotrero({ potrero, periodo }: { potrero: PotreroRentabilidad; periodo: Periodo }) {
  const [expanded, setExpanded] = useState(false);
  const ref = getRef(potrero.actividades);
  const positivo = potrero.margen_neto_usd >= 0;

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900 overflow-hidden">
      {/* Main row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-slate-800/50 transition-colors"
      >
        {/* Semáforo */}
        <div onClick={(e) => e.stopPropagation()}>
          <Semaforo
            valor_usd_ha={potrero.margen_neto_ha_anualizado_usd}
            actividad={potrero.actividades[0]?.actividad_tipo ?? "—"}
            referencias={ref}
            size="md"
          />
        </div>

        {/* Nombre + actividades */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-100 truncate">{potrero.nombre}</p>
          <p className="text-xs text-slate-400 truncate">
            {actividadResumen(potrero.actividades)}
            {potrero.es_proyectado && (
              <span className="ml-1.5 text-yellow-400">· proyectado</span>
            )}
          </p>
        </div>

        {/* Hectáreas */}
        <div className="hidden sm:block text-right shrink-0 w-16">
          <p className="text-xs text-slate-400">Ha</p>
          <p className="text-sm text-slate-200">{potrero.hectareas?.toFixed(1) ?? "—"}</p>
        </div>

        {/* Margen/ha/año */}
        <div className="text-right shrink-0 w-24">
          <p className="text-xs text-slate-400">MB/ha/año</p>
          <p
            className={`text-sm font-semibold ${
              potrero.margen_neto_ha_anualizado_usd == null
                ? "text-slate-500"
                : positivo
                ? "text-emerald-400"
                : "text-red-400"
            }`}
          >
            {fmtUSD(potrero.margen_neto_ha_anualizado_usd)}
          </p>
        </div>

        {/* Expand chevron */}
        <div className="shrink-0 text-slate-500">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {/* Secondary stats strip */}
      <div className="px-4 pb-3 flex gap-4 text-xs text-slate-500 -mt-1">
        <span>
          Margen período:{" "}
          <span className={positivo ? "text-emerald-400" : "text-red-400"}>
            {fmtUSD(potrero.margen_neto_usd)}
          </span>
        </span>
        {potrero.margen_neto_ha_usd != null && (
          <span>
            {fmtUSD(potrero.margen_neto_ha_usd, 1)} / ha
          </span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-700/60 px-4 pb-4">
          <DetallePotrero potreroId={potrero.potrero_id} periodo={periodo} />
        </div>
      )}
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────

interface Props {
  potreros: PotreroRentabilidad[];
  periodo: Periodo;
  isLoading: boolean;
}

export function TablaPotreros({ potreros, periodo, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-slate-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (potreros.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-8 text-center text-sm text-slate-400">
        No hay potreros con datos para el período seleccionado.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header (desktop) */}
      <div className="hidden sm:grid grid-cols-[auto_1fr_80px_100px_32px] gap-3 px-4 text-[11px] font-medium text-slate-500 uppercase tracking-wider">
        <span />
        <span>Potrero / Actividades</span>
        <span className="text-right">Ha</span>
        <span className="text-right">MB/ha/año</span>
        <span />
      </div>

      {potreros.map((p) => (
        <FilaPotrero key={p.potrero_id} potrero={p} periodo={periodo} />
      ))}
    </div>
  );
}
