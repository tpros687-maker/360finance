import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, BarChart2, Leaf, Plus, ChevronDown, ChevronUp, FileDown, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getRentabilidadPotreros } from "@/lib/potrerosApi";
import { exportarRentabilidadPDF } from "@/lib/rentabilidadApi";
import { getCategorias, createCategoria } from "@/lib/categoriasApi";
import { createRegistro } from "@/lib/registrosApi";
import { useAuthStore } from "@/store/authStore";
import { toast } from "@/hooks/useToast";
import type { RentabilidadPotrero } from "@/types/potreros";

const todayStr = () => new Date().toISOString().split("T")[0];

const VENTA_NOMBRE = "Venta de producción";

function fmt(value: number, moneda: string): string {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: moneda === "USD" ? "USD" : "UYU",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtPct(value: number | null): string {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function fmtNum(value: number | null, decimals = 1, suffix = ""): string {
  if (value === null) return "—";
  return `${value.toFixed(decimals)}${suffix}`;
}

function BalancePill({ value, moneda }: { value: number; moneda: string }) {
  const positive = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
        positive ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
      }`}
    >
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {fmt(value, moneda)}
    </span>
  );
}

function RentPill({ value }: { value: number | null }) {
  if (value === null) return <span className="text-agro-muted text-sm">—</span>;
  const positive = value >= 0;
  return (
    <span className={`text-sm font-semibold ${positive ? "text-emerald-600" : "text-red-600"}`}>
      {fmtPct(value)}
    </span>
  );
}

interface KpiProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}

function KpiCard({ title, value, icon, color }: KpiProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-agro-muted">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function EmptyPotreros() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
      <Leaf className="h-12 w-12 text-agro-accent" />
      <h2 className="text-lg font-semibold text-agro-text">Sin potreros</h2>
      <p className="text-agro-muted max-w-xs text-sm">
        Agregá potreros en el Mapa y registrá gastos e ingresos para ver su rentabilidad aquí.
      </p>
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-agro-accent/20 ${className}`} />;
}

function PageSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-8 w-56" />
      <div className="flex gap-3">
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

interface IngresoForm {
  monto: string;
  moneda: string;
  fecha: string;
  descripcion: string;
}

interface ModalIngresoProps {
  potrero: { id: number; nombre: string } | null;
  onClose: () => void;
}

function ModalIngreso({ potrero, onClose }: ModalIngresoProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState<IngresoForm>({
    monto: "",
    moneda: "UYU",
    fecha: todayStr(),
    descripcion: "",
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ["categorias"],
    queryFn: getCategorias,
    staleTime: 60000,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!potrero) return;

      let cat = categorias.find(
        (c) => c.nombre === VENTA_NOMBRE && c.tipo === "ingreso"
      );
      if (!cat) {
        cat = await createCategoria({
          nombre: VENTA_NOMBRE,
          tipo: "ingreso",
          color: "#22c55e",
        });
        qc.invalidateQueries({ queryKey: ["categorias"] });
      }

      await createRegistro({
        tipo: "ingreso",
        categoria_id: cat.id,
        potrero_id: potrero.id,
        monto: parseFloat(form.monto),
        moneda: form.moneda,
        fecha: form.fecha,
        descripcion: form.descripcion.trim() || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rentabilidad"] });
      qc.invalidateQueries({ queryKey: ["registros"] });
      qc.invalidateQueries({ queryKey: ["resumen"] });
      toast({ title: "Ingreso registrado" });
      onClose();
    },
    onError: () => toast({ title: "Error al registrar ingreso", variant: "destructive" }),
  });

  const valid = parseFloat(form.monto) > 0 && !!form.fecha;

  return (
    <Dialog open={!!potrero} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-agro-text">
            Registrar ingreso — {potrero?.nombre}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <Label className="text-agro-muted text-xs">Monto *</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={form.monto}
                onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
                className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text"
                placeholder="0.00"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-agro-muted text-xs">Moneda</Label>
              <select
                value={form.moneda}
                onChange={(e) => setForm((f) => ({ ...f, moneda: e.target.value }))}
                className="mt-1 w-full bg-agro-bg border border-agro-accent/20 text-agro-text text-sm rounded-md px-3 py-2"
              >
                <option value="UYU">UYU</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          <div>
            <Label className="text-agro-muted text-xs">Fecha *</Label>
            <Input
              type="date"
              value={form.fecha}
              onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
              className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text"
            />
          </div>

          <div>
            <Label className="text-agro-muted text-xs">Descripción</Label>
            <Input
              value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text"
              placeholder="Opcional"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!valid || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Guardando..." : "Guardar ingreso"}
            </Button>
            <Button variant="outline" onClick={onClose} className="border-agro-accent/20 text-agro-muted">
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface IndicadorRowProps {
  label: string;
  value: string;
  referencia?: string;
}

function IndicadorRow({ label, value, referencia }: IndicadorRowProps) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-agro-muted">{label}</span>
      <span className="text-sm font-semibold text-agro-text">{value}</span>
      {referencia && <span className="text-[10px] text-agro-muted/60 mt-0.5">{referencia}</span>}
    </div>
  );
}

function DetailPanel({ row, moneda }: { row: RentabilidadPotrero; moneda: string }) {
  const hasHa = row.hectareas != null && row.hectareas > 0;
  const hasIndicadores = hasHa && (row.margen_bruto_ha != null || row.carga_animal_ug_ha != null || row.produccion_kg_ha != null);

  return (
    <div className="px-4 py-3 bg-agro-bg/60 border-t border-agro-accent/10">
      <p className="text-xs font-semibold text-agro-muted mb-2 uppercase tracking-wide">Indicadores ganaderos</p>
      {!hasHa ? (
        <p className="text-xs text-agro-muted italic">Sin superficie registrada. Ingresá las hectáreas en el Mapa para calcular indicadores.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <IndicadorRow
            label="CONEAT"
            value={row.coneat != null ? String(row.coneat) : "—"}
            referencia="Ref: 100 = promedio país"
          />
          <IndicadorRow
            label="Margen bruto/ha"
            value={row.margen_bruto_ha != null ? fmt(row.margen_bruto_ha, moneda) + "/ha" : "—"}
          />
          <IndicadorRow
            label="Carga animal"
            value={fmtNum(row.carga_animal_ug_ha, 2, " UG/ha")}
            referencia="Ref: 0.5–1.5 UG/ha"
          />
          <IndicadorRow
            label="Producción carne"
            value={fmtNum(row.produccion_kg_ha, 1, " kg/ha")}
            referencia="Ref: 80–120 kg/ha"
          />
        </div>
      )}
      {hasIndicadores && (
        <p className="text-[10px] text-agro-muted/50 mt-2">
          Carga animal estimada usando factor 0,8 UG por cabeza.
        </p>
      )}
    </div>
  );
}

export default function RentabilidadPage() {
  const moneda = useAuthStore((s) => s.user?.moneda ?? "UYU");

  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [modalPotrero, setModalPotrero] = useState<{ id: number; nombre: string } | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const { data = [], isLoading } = useQuery<RentabilidadPotrero[]>({
    queryKey: ["rentabilidad", fechaDesde, fechaHasta],
    queryFn: () =>
      getRentabilidadPotreros({
        fecha_desde: fechaDesde || undefined,
        fecha_hasta: fechaHasta || undefined,
      }),
    select: (rows) =>
      rows.map((r) => ({
        ...r,
        total_ingresos: parseFloat(String(r.total_ingresos)),
        total_gastos: parseFloat(String(r.total_gastos)),
        balance: parseFloat(String(r.balance)),
        rentabilidad_pct: r.rentabilidad_pct != null ? parseFloat(String(r.rentabilidad_pct)) : null,
        hectareas: r.hectareas != null ? parseFloat(String(r.hectareas)) : null,
        margen_bruto_ha: r.margen_bruto_ha != null ? parseFloat(String(r.margen_bruto_ha)) : null,
        carga_animal_ug_ha: r.carga_animal_ug_ha != null ? parseFloat(String(r.carga_animal_ug_ha)) : null,
        produccion_kg_ha: r.produccion_kg_ha != null ? parseFloat(String(r.produccion_kg_ha)) : null,
        coneat: r.coneat != null ? parseFloat(String(r.coneat)) : null,
      })),
    placeholderData: (prev) => prev,
  });

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      await exportarRentabilidadPDF({
        fecha_desde: fechaDesde || undefined,
        fecha_hasta: fechaHasta || undefined,
      });
    } catch {
      toast({ title: "Error al generar el PDF", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) return <PageSkeleton />;

  const totalIngresos = data.reduce((s, r) => s + r.total_ingresos, 0);
  const totalGastos = data.reduce((s, r) => s + r.total_gastos, 0);
  const balanceGlobal = totalIngresos - totalGastos;
  const mejorPotrero = data.length > 0 ? data[0] : null;

  const COLS = 11;

  return (
    <div className="p-6 space-y-6 page-fade">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-agro-text">Rentabilidad por Potrero</h1>
          <p className="text-agro-muted text-sm mt-1">
            Análisis de ingresos y gastos asociados a cada potrero.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={isExporting}
          onClick={handleExportPdf}
          className="shrink-0 border-agro-accent/30 text-agro-muted hover:text-agro-text gap-2"
        >
          {isExporting
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <FileDown className="h-4 w-4" />
          }
          {isExporting ? "Generando…" : "Exportar PDF"}
        </Button>
      </div>

      {/* Filtros de fecha */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-agro-muted whitespace-nowrap">Desde</label>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="bg-white border border-agro-accent/30 text-agro-text text-sm rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-agro-primary/30"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-agro-muted whitespace-nowrap">Hasta</label>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="bg-white border border-agro-accent/30 text-agro-text text-sm rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-agro-primary/30"
          />
        </div>
        {(fechaDesde || fechaHasta) && (
          <button
            onClick={() => { setFechaDesde(""); setFechaHasta(""); }}
            className="text-xs text-agro-muted hover:text-agro-text underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {data.length === 0 ? (
        <EmptyPotreros />
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard
              title="Total ingresos"
              value={fmt(totalIngresos, moneda)}
              icon={<TrendingUp className="h-5 w-5 text-emerald-400" />}
              color="text-emerald-600"
            />
            <KpiCard
              title="Total gastos"
              value={fmt(totalGastos, moneda)}
              icon={<TrendingDown className="h-5 w-5 text-red-400" />}
              color="text-red-600"
            />
            <KpiCard
              title="Balance global"
              value={fmt(balanceGlobal, moneda)}
              icon={
                balanceGlobal >= 0
                  ? <TrendingUp className="h-5 w-5 text-emerald-400" />
                  : <TrendingDown className="h-5 w-5 text-red-400" />
              }
              color={balanceGlobal >= 0 ? "text-emerald-600" : "text-red-600"}
            />
            <KpiCard
              title="Mejor potrero"
              value={mejorPotrero?.nombre ?? "—"}
              icon={<BarChart2 className="h-5 w-5 text-agro-primary" />}
              color="text-agro-primary"
            />
          </div>

          {/* Tabla */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-agro-text">Detalle por potrero</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-agro-accent/20 bg-agro-bg/50">
                      <th className="text-left text-agro-muted font-medium px-4 py-3">Potrero</th>
                      <th className="text-right text-agro-muted font-medium px-4 py-3">Hectáreas</th>
                      <th className="text-right text-agro-muted font-medium px-4 py-3">Animales</th>
                      <th className="text-right text-agro-muted font-medium px-4 py-3">Ingresos</th>
                      <th className="text-right text-agro-muted font-medium px-4 py-3">Gastos</th>
                      <th className="text-right text-agro-muted font-medium px-4 py-3">Balance</th>
                      <th className="text-right text-agro-muted font-medium px-4 py-3">Rentabilidad</th>
                      <th className="text-right text-agro-muted font-medium px-4 py-3 whitespace-nowrap">MB/ha</th>
                      <th className="text-right text-agro-muted font-medium px-4 py-3 whitespace-nowrap">UG/ha</th>
                      <th className="text-right text-agro-muted font-medium px-4 py-3 whitespace-nowrap">Kg/ha</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-agro-accent/10">
                    {data.map((row) => {
                      const isExpanded = expandedId === row.potrero_id;
                      return (
                        <>
                          <tr
                            key={row.potrero_id}
                            className="hover:bg-agro-bg/40 transition-colors cursor-pointer"
                            onClick={() => setExpandedId(isExpanded ? null : row.potrero_id)}
                          >
                            <td className="px-4 py-3 font-medium text-agro-text">
                              <span className="flex items-center gap-1.5">
                                {isExpanded
                                  ? <ChevronUp className="h-3.5 w-3.5 text-agro-muted shrink-0" />
                                  : <ChevronDown className="h-3.5 w-3.5 text-agro-muted shrink-0" />
                                }
                                {row.nombre}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-agro-muted">
                              {row.hectareas != null ? `${row.hectareas.toFixed(1)} ha` : "—"}
                            </td>
                            <td className="px-4 py-3 text-right text-agro-muted">
                              {row.cantidad_animales > 0 ? row.cantidad_animales : "—"}
                            </td>
                            <td className="px-4 py-3 text-right text-emerald-600 font-medium">
                              {fmt(row.total_ingresos, moneda)}
                            </td>
                            <td className="px-4 py-3 text-right text-red-600 font-medium">
                              {fmt(row.total_gastos, moneda)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <BalancePill value={row.balance} moneda={moneda} />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <RentPill value={row.rentabilidad_pct} />
                            </td>
                            <td className="px-4 py-3 text-right text-agro-muted">
                              {row.margen_bruto_ha != null ? fmt(row.margen_bruto_ha, moneda) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right text-agro-muted">
                              {fmtNum(row.carga_animal_ug_ha, 2)}
                            </td>
                            <td className="px-4 py-3 text-right text-agro-muted">
                              {fmtNum(row.produccion_kg_ha, 1)}
                            </td>
                            <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => setModalPotrero({ id: row.potrero_id, nombre: row.nombre })}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors whitespace-nowrap"
                              >
                                <Plus className="h-3 w-3" />
                                Ingreso
                              </button>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${row.potrero_id}-detail`}>
                              <td colSpan={COLS} className="p-0">
                                <DetailPanel row={row} moneda={moneda} />
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-agro-accent/30 bg-agro-bg/50 font-semibold">
                      <td className="px-4 py-3 text-agro-text">Total</td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-right text-emerald-600">{fmt(totalIngresos, moneda)}</td>
                      <td className="px-4 py-3 text-right text-red-600">{fmt(totalGastos, moneda)}</td>
                      <td className="px-4 py-3 text-right">
                        <BalancePill value={balanceGlobal} moneda={moneda} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <RentPill
                          value={totalGastos > 0 ? ((balanceGlobal / totalGastos) * 100) : null}
                        />
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <ModalIngreso
        potrero={modalPotrero}
        onClose={() => setModalPotrero(null)}
      />
    </div>
  );
}
