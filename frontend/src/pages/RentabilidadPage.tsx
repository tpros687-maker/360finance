import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, BarChart2, Leaf } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRentabilidadPotreros } from "@/lib/potrerosApi";
import { useAuthStore } from "@/store/authStore";
import type { RentabilidadPotrero } from "@/types/potreros";

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
    <span
      className={`text-sm font-semibold ${positive ? "text-emerald-600" : "text-red-600"}`}
    >
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

export default function RentabilidadPage() {
  const moneda = useAuthStore((s) => s.user?.moneda ?? "UYU");

  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const { data = [], isLoading } = useQuery<RentabilidadPotrero[]>({
    queryKey: ["rentabilidad", fechaDesde, fechaHasta],
    queryFn: () =>
      getRentabilidadPotreros({
        fecha_desde: fechaDesde || undefined,
        fecha_hasta: fechaHasta || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  if (isLoading) return <PageSkeleton />;

  const totalIngresos = data.reduce((s, r) => s + r.total_ingresos, 0);
  const totalGastos = data.reduce((s, r) => s + r.total_gastos, 0);
  const balanceGlobal = totalIngresos - totalGastos;
  const mejorPotrero = data.length > 0 ? data[0] : null;

  return (
    <div className="p-6 space-y-6 page-fade">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-agro-text">Rentabilidad por Potrero</h1>
        <p className="text-agro-muted text-sm mt-1">
          Análisis de ingresos y gastos asociados a cada potrero.
        </p>
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-agro-accent/10">
                    {data.map((row) => (
                      <tr key={row.potrero_id} className="hover:bg-agro-bg/40 transition-colors">
                        <td className="px-4 py-3 font-medium text-agro-text">{row.nombre}</td>
                        <td className="px-4 py-3 text-right text-agro-muted">
                          {row.hectareas != null ? `${Number(row.hectareas).toFixed(1)} ha` : "—"}
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
                      </tr>
                    ))}
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
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
