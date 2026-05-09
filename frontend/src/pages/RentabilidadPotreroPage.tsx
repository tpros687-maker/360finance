import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, RotateCcw } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { HistoricoAnual } from "@/components/rentabilidad/HistoricoAnual";
import { periodoEsteAnio } from "@/components/rentabilidad/ResumenEstablecimiento";
import type { Periodo } from "@/components/rentabilidad/ResumenEstablecimiento";
import {
  getHistoricoRentabilidad,
  getRentabilidadPotrero,
  getGastosPotrero,
  reimputarGasto,
} from "@/lib/rentabilidadApi";
import { getLotes, getCiclos } from "@/lib/produccionApi";
import { getPotreros } from "@/lib/potrerosApi";
import { toast } from "@/hooks/useToast";
import { parseApiError } from "@/lib/authApi";
import type { GastoResumen, ActividadRentabilidad } from "@/types/rentabilidad";
import type { LoteGanado, CicloAgricola } from "@/types/produccion";
import type { ReimputarGastoBody } from "@/types/rentabilidad";

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

function daysBetween(a: string, b: string): number {
  return Math.max(
    (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000,
    1
  );
}

// ── Reimputar modal ───────────────────────────────────────────────────────────

interface ModalReimputarProps {
  gasto: GastoResumen;
  potreroId: number;
  onClose: () => void;
}

function ModalReimputar({ gasto, potreroId, onClose }: ModalReimputarProps) {
  const queryClient = useQueryClient();
  const [tipoImputacion, setTipoImputacion] = useState(gasto.tipo_imputacion ?? "directo");
  const [actividadTipo, setActividadTipo] = useState<string>(gasto.actividad_tipo ?? "");
  const [actividadId, setActividadId] = useState<number | "">(gasto.actividad_id ?? "");

  const { data: lotes = [] } = useQuery({
    queryKey: ["lotes", potreroId],
    queryFn: () => getLotes(potreroId),
    enabled: actividadTipo === "lote",
  });

  const { data: ciclos = [] } = useQuery({
    queryKey: ["ciclos", potreroId],
    queryFn: () => getCiclos(potreroId),
    enabled: actividadTipo === "ciclo",
  });

  const mutation = useMutation({
    mutationFn: () => {
      const body: ReimputarGastoBody = {
        tipo_imputacion: tipoImputacion,
        actividad_tipo: actividadTipo || null,
        actividad_id: actividadId !== "" ? Number(actividadId) : null,
      };
      return reimputarGasto(gasto.id, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gastos-potrero"] });
      queryClient.invalidateQueries({ queryKey: ["rentabilidad-potrero"] });
      toast({ title: "Imputación actualizada" });
      onClose();
    },
    onError: (err) => {
      toast({ title: "Error", description: parseApiError(err), variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reimputar gasto</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <p className="text-xs text-slate-400">
            {gasto.descripcion || "Sin descripción"} · {fmtUSD(gasto.monto_usd)}
          </p>

          {/* Tipo de imputación */}
          <div className="space-y-1.5">
            <label className="text-xs text-slate-300 font-medium">Tipo de imputación</label>
            <div className="flex rounded-lg border border-slate-700 overflow-hidden text-sm">
              {(["directo", "prorrateo", "estructural"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setTipoImputacion(t); setActividadTipo(""); setActividadId(""); }}
                  className={`flex-1 py-2 font-medium transition-colors capitalize ${
                    tipoImputacion === t
                      ? "bg-brand-500/20 text-brand-300"
                      : "text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  {t === "directo" ? "Directo" : t === "prorrateo" ? "Prorrateo" : "Estructural"}
                </button>
              ))}
            </div>
          </div>

          {tipoImputacion === "directo" && (
            <div className="space-y-2">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-300 font-medium">Tipo de actividad</label>
                <Select
                  value={actividadTipo}
                  onChange={(e) => { setActividadTipo(e.target.value); setActividadId(""); }}
                >
                  <option value="">Sin actividad específica</option>
                  <option value="lote">Lote de ganado</option>
                  <option value="ciclo">Ciclo agrícola</option>
                </Select>
              </div>

              {actividadTipo === "lote" && lotes.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-300 font-medium">Lote</label>
                  <Select
                    value={actividadId}
                    onChange={(e) => setActividadId(Number(e.target.value) || "")}
                  >
                    <option value="">Todos los lotes</option>
                    {lotes.map((l) => (
                      <option key={l.id} value={l.id}>{l.nombre || `Lote #${l.id}`}</option>
                    ))}
                  </Select>
                </div>
              )}

              {actividadTipo === "ciclo" && ciclos.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-300 font-medium">Ciclo</label>
                  <Select
                    value={actividadId}
                    onChange={(e) => setActividadId(Number(e.target.value) || "")}
                  >
                    <option value="">Todos los ciclos</option>
                    {ciclos.map((c) => (
                      <option key={c.id} value={c.id}>{c.cultivo || `Ciclo #${c.id}`}</option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
          )}

          {tipoImputacion === "prorrateo" && (
            <p className="text-xs text-slate-400">
              El gasto se distribuirá entre todos los potreros según sus hectáreas.
            </p>
          )}
          {tipoImputacion === "estructural" && (
            <p className="text-xs text-slate-400">
              Gasto de estructura del establecimiento.
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="ghost" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button
              className="flex-1"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Activity indicators ───────────────────────────────────────────────────────

function IndicadoresLote({
  act,
  lote,
  ha,
}: {
  act: ActividadRentabilidad;
  lote: LoteGanado | undefined;
  ha: number | null;
}) {
  const hoy = new Date().toISOString().split("T")[0];
  const gdp =
    lote && lote.peso_salida_kg && lote.peso_entrada_kg && lote.cantidad
      ? ((lote.peso_salida_kg - lote.peso_entrada_kg) /
          daysBetween(lote.fecha_entrada, lote.fecha_salida ?? hoy) /
          lote.cantidad).toFixed(2)
      : null;
  const kgHa =
    lote && lote.peso_salida_kg && lote.peso_entrada_kg && ha
      ? ((lote.peso_salida_kg - lote.peso_entrada_kg) / ha).toFixed(0)
      : null;

  return (
    <div className="flex flex-wrap gap-3 text-xs text-slate-400 mt-1">
      {gdp && <span>GDP: <span className="text-slate-200">{gdp} kg/cab/día</span></span>}
      {kgHa && <span>Producción: <span className="text-slate-200">{kgHa} kg/ha</span></span>}
      <span>Margen: <span className={act.margen_usd >= 0 ? "text-emerald-400" : "text-red-400"}>{fmtUSD(act.margen_usd)}</span></span>
      {act.margen_ha_usd != null && (
        <span>MB/ha: <span className="text-slate-200">{fmtUSD(act.margen_ha_usd, 1)}</span></span>
      )}
    </div>
  );
}

function IndicadoresCiclo({
  act,
  ciclo,
  ha,
}: {
  act: ActividadRentabilidad;
  ciclo: CicloAgricola | undefined;
  ha: number | null;
}) {
  const rinde =
    ciclo && ciclo.toneladas_cosechadas && ha
      ? (ciclo.toneladas_cosechadas / ha).toFixed(2)
      : null;

  return (
    <div className="flex flex-wrap gap-3 text-xs text-slate-400 mt-1">
      {rinde && <span>Rinde: <span className="text-slate-200">{rinde} tn/ha</span></span>}
      {ciclo?.toneladas_cosechadas && (
        <span>Cosecha: <span className="text-slate-200">{ciclo.toneladas_cosechadas} tn</span></span>
      )}
      <span>Margen: <span className={act.margen_usd >= 0 ? "text-emerald-400" : "text-red-400"}>{fmtUSD(act.margen_usd)}</span></span>
      {act.margen_ha_usd != null && (
        <span>MB/ha: <span className="text-slate-200">{fmtUSD(act.margen_ha_usd, 1)}</span></span>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RentabilidadPotreroPage() {
  const { id } = useParams<{ id: string }>();
  const potreroId = Number(id);
  const [periodo] = useState<Periodo>(periodoEsteAnio);
  const [gastoAReimputar, setGastoAReimputar] = useState<GastoResumen | null>(null);

  const { data: historico = [], isLoading: loadingHistorico } = useQuery({
    queryKey: ["rentabilidad-historico", potreroId],
    queryFn: () => getHistoricoRentabilidad(potreroId),
    enabled: !!potreroId,
  });

  const { data: detalle, isLoading: loadingDetalle } = useQuery({
    queryKey: ["rentabilidad-potrero", potreroId, periodo.fecha_desde, periodo.fecha_hasta],
    queryFn: () => getRentabilidadPotrero(potreroId, {
      fecha_desde: periodo.fecha_desde,
      fecha_hasta: periodo.fecha_hasta,
    }),
    enabled: !!potreroId,
  });

  const { data: gastos = [], isLoading: loadingGastos } = useQuery({
    queryKey: ["gastos-potrero", potreroId, periodo.fecha_desde, periodo.fecha_hasta],
    queryFn: () => getGastosPotrero(potreroId, {
      fecha_desde: periodo.fecha_desde,
      fecha_hasta: periodo.fecha_hasta,
    }),
    enabled: !!potreroId,
  });

  const { data: lotes = [] } = useQuery({
    queryKey: ["lotes", potreroId],
    queryFn: () => getLotes(potreroId),
    enabled: !!potreroId,
  });

  const { data: ciclos = [] } = useQuery({
    queryKey: ["ciclos", potreroId],
    queryFn: () => getCiclos(potreroId),
    enabled: !!potreroId,
  });

  const ha = detalle?.hectareas ?? null;
  const nombrePotrero = detalle?.nombre ?? historico[0]?.nombre ?? `Potrero #${potreroId}`;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          to="/rentabilidad"
          className="text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-slate-100">{nombrePotrero}</h1>
          <p className="text-xs text-slate-400">Rentabilidad detallada</p>
        </div>
      </div>

      {/* Histórico */}
      <section>
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Evolución histórica</h2>
        <HistoricoAnual datos={historico} isLoading={loadingHistorico} />
      </section>

      {/* Actividades del período */}
      <section>
        <h2 className="text-sm font-semibold text-slate-300 mb-3">
          Actividades del período
        </h2>
        {loadingDetalle ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-800 animate-pulse" />)}
          </div>
        ) : detalle?.actividades.length === 0 ? (
          <p className="text-sm text-slate-500">Sin actividades registradas en el período.</p>
        ) : (
          <div className="space-y-2">
            {detalle?.actividades.map((act) => {
              const lote = act.actividad_tipo === "lote"
                ? lotes.find((l) => l.id === act.actividad_id)
                : undefined;
              const ciclo = act.actividad_tipo === "ciclo"
                ? ciclos.find((c) => c.id === act.actividad_id)
                : undefined;

              return (
                <div
                  key={`${act.actividad_tipo}-${act.actividad_id}`}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        act.actividad_tipo === "lote"
                          ? "bg-sky-500/20 text-sky-300"
                          : "bg-lime-500/20 text-lime-300"
                      }`}
                    >
                      {act.actividad_tipo === "lote" ? "Ganadería" : "Agricultura"}
                    </span>
                    <span className="text-sm font-medium text-slate-100">{act.nombre}</span>
                    {act.es_proyectado && (
                      <span className="text-[10px] text-yellow-400">proyectado</span>
                    )}
                  </div>
                  {act.actividad_tipo === "lote" ? (
                    <IndicadoresLote act={act} lote={lote} ha={ha} />
                  ) : (
                    <IndicadoresCiclo act={act} ciclo={ciclo} ha={ha} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Gastos del período */}
      <section>
        <h2 className="text-sm font-semibold text-slate-300 mb-3">
          Gastos del período
          {gastos.length > 0 && (
            <span className="ml-2 text-xs font-normal text-slate-500">
              ({gastos.length})
            </span>
          )}
        </h2>
        {loadingGastos ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-xl bg-slate-800 animate-pulse" />)}
          </div>
        ) : gastos.length === 0 ? (
          <p className="text-sm text-slate-500">Sin gastos en el período.</p>
        ) : (
          <div className="space-y-1.5">
            {gastos.map((g) => (
              <div
                key={g.id}
                className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 hover:border-slate-700 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">
                    {g.descripcion || "Sin descripción"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {g.fecha}
                    {g.tipo_imputacion && (
                      <span className="ml-2 rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                        {g.tipo_imputacion}
                      </span>
                    )}
                    {g.actividad_tipo && (
                      <span className="ml-1 rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                        {g.actividad_tipo} #{g.actividad_id}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-red-400">{fmtUSD(g.monto_usd)}</p>
                  {g.moneda !== "USD" && (
                    <p className="text-[10px] text-slate-500">
                      {g.moneda} {g.monto.toLocaleString("es-UY")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  title="Reimputar"
                  onClick={() => setGastoAReimputar(g)}
                  className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Reimputar modal */}
      {gastoAReimputar && (
        <ModalReimputar
          gasto={gastoAReimputar}
          potreroId={potreroId}
          onClose={() => setGastoAReimputar(null)}
        />
      )}
    </div>
  );
}
