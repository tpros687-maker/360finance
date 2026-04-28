import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { TrendingUp, TrendingDown, AlertTriangle, Wallet, ArrowLeftRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getFlujoCaja } from "@/lib/dashboardApi";
import { useAuthStore } from "@/store/authStore";
import type { ItemFlujo } from "@/types/dashboard";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(value: number, moneda: string): string {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: moneda === "USD" ? "USD" : "UYU",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function Diasbadge({ dias, tipo }: { dias: number | null; tipo: "cobro" | "pago" }) {
  if (dias === null)
    return <span className="text-xs px-2 py-0.5 rounded-full bg-agro-accent/20 text-agro-muted">Sin fecha</span>;
  if (dias <= 7)
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${tipo === "cobro" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
        {dias === 0 ? "Hoy" : `${dias}d`}
      </span>
    );
  if (dias <= 30)
    return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">{dias}d</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-agro-accent/20 text-agro-muted">{dias}d</span>;
}

function KpiCard({ title, value, icon, color }: { title: string; value: string; icon: React.ReactNode; color: string }) {
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

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-agro-accent/20 ${className}`} />;
}

function PendingTable({ items, tipo }: { items: ItemFlujo[]; tipo: "cobro" | "pago" }) {
  const moneda = useAuthStore((s) => s.user?.moneda ?? "UYU");
  const label = tipo === "cobro" ? "Cliente" : "Proveedor";
  if (items.length === 0)
    return <p className="text-agro-muted text-sm italic px-1 py-3">Sin {tipo === "cobro" ? "cobros" : "pagos"} pendientes.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-agro-accent/20 bg-agro-bg/50">
            <th className="text-left text-agro-muted font-medium px-3 py-2">{label}</th>
            <th className="text-left text-agro-muted font-medium px-3 py-2 hidden sm:table-cell">Descripción</th>
            <th className="text-right text-agro-muted font-medium px-3 py-2">Monto</th>
            <th className="text-right text-agro-muted font-medium px-3 py-2">Vencimiento</th>
            <th className="text-right text-agro-muted font-medium px-3 py-2">Días</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-agro-accent/10">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-agro-bg/40 transition-colors">
              <td className="px-3 py-2.5 font-medium text-agro-text">{item.contraparte}</td>
              <td className="px-3 py-2.5 text-agro-muted hidden sm:table-cell truncate max-w-[180px]">
                {item.descripcion ?? "—"}
              </td>
              <td className="px-3 py-2.5 text-right font-medium text-agro-text">
                {fmt(item.monto, item.moneda)}
              </td>
              <td className="px-3 py-2.5 text-right text-agro-muted">{fmtFecha(item.fecha_vencimiento)}</td>
              <td className="px-3 py-2.5 text-right">
                <Diasbadge dias={item.dias_restantes} tipo={tipo} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VencidosSection({ cobrosV, pagosV }: { cobrosV: ItemFlujo[]; pagosV: ItemFlujo[] }) {
  const moneda = useAuthStore((s) => s.user?.moneda ?? "UYU");
  const [tab, setTab] = useState<"cobros" | "pagos">("cobros");

  return (
    <Card className="border-red-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-red-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Items vencidos
        </CardTitle>
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => setTab("cobros")}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${tab === "cobros" ? "bg-red-600 text-white border-red-600" : "text-agro-muted border-agro-accent/30 hover:border-red-300"}`}
          >
            Cobros vencidos ({cobrosV.length})
          </button>
          <button
            onClick={() => setTab("pagos")}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${tab === "pagos" ? "bg-red-600 text-white border-red-600" : "text-agro-muted border-agro-accent/30 hover:border-red-300"}`}
          >
            Pagos vencidos ({pagosV.length})
          </button>
        </div>
      </CardHeader>
      <CardContent className="p-0 pb-3">
        {(tab === "cobros" ? cobrosV : pagosV).map((item) => (
          <div key={item.id} className="flex items-start justify-between px-4 py-2.5 border-b border-agro-accent/10 last:border-0">
            <div className="min-w-0">
              <p className="text-sm font-medium text-agro-text">{item.contraparte}</p>
              {item.descripcion && <p className="text-xs text-agro-muted truncate">{item.descripcion}</p>}
            </div>
            <div className="text-right ml-4 shrink-0">
              <p className="text-sm font-semibold text-agro-text">{fmt(item.monto, item.moneda)}</p>
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                Vencido hace {Math.abs(item.dias_restantes ?? 0)}d
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ── Custom tooltip para el gráfico ────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-agro-accent/20 rounded-lg p-3 text-xs shadow-xl">
      <p className="font-medium text-agro-text mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {new Intl.NumberFormat("es-UY", { maximumFractionDigits: 0 }).format(entry.value)}
        </p>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FlujoCajaPage() {
  const moneda = useAuthStore((s) => s.user?.moneda ?? "UYU");

  const { data, isLoading } = useQuery({
    queryKey: ["flujo-caja"],
    queryFn: getFlujoCaja,
    staleTime: 1000 * 60 * 5,
    select: (d) => ({
      ...d,
      total_por_cobrar: parseFloat(String(d.total_por_cobrar)),
      total_por_pagar: parseFloat(String(d.total_por_pagar)),
      balance_proyectado: parseFloat(String(d.balance_proyectado)),
      cobros_pendientes: (d.cobros_pendientes ?? []).map((c) => ({
        ...c,
        monto: parseFloat(String(c.monto)),
        dias_restantes: c.dias_restantes != null ? Number(c.dias_restantes) : null,
      })),
      pagos_pendientes: (d.pagos_pendientes ?? []).map((p) => ({
        ...p,
        monto: parseFloat(String(p.monto)),
        dias_restantes: p.dias_restantes != null ? Number(p.dias_restantes) : null,
      })),
      cobros_vencidos: (d.cobros_vencidos ?? []).map((c) => ({
        ...c,
        monto: parseFloat(String(c.monto)),
        dias_restantes: c.dias_restantes != null ? Number(c.dias_restantes) : null,
      })),
      pagos_vencidos: (d.pagos_vencidos ?? []).map((p) => ({
        ...p,
        monto: parseFloat(String(p.monto)),
        dias_restantes: p.dias_restantes != null ? Number(p.dias_restantes) : null,
      })),
      semanas: (d.semanas ?? []).map((s) => ({
        ...s,
        cobros: parseFloat(String(s.cobros)),
        pagos: parseFloat(String(s.pagos)),
        balance_semana: parseFloat(String(s.balance_semana)),
        balance_acumulado: parseFloat(String(s.balance_acumulado)),
      })),
    }),
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const hayVencidos = data.cobros_vencidos.length > 0 || data.pagos_vencidos.length > 0;
  const hayPendientes = data.cobros_pendientes.length > 0 || data.pagos_pendientes.length > 0;
  const hayDatos = hayVencidos || hayPendientes || data.total_por_cobrar > 0 || data.total_por_pagar > 0;

  if (!hayDatos) {
    return (
      <div className="p-6 page-fade">
        <h1 className="text-2xl font-bold text-agro-text mb-2">Flujo de Caja Proyectado</h1>
        <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
          <ArrowLeftRight className="h-12 w-12 text-agro-accent" />
          <h2 className="text-lg font-semibold text-agro-text">Sin cuentas pendientes</h2>
          <p className="text-agro-muted max-w-sm text-sm">
            Agregá cuentas por cobrar en Clientes y cuentas por pagar en Proveedores para ver tu flujo proyectado aquí.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 page-fade">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-agro-text">Flujo de Caja Proyectado</h1>
        <p className="text-agro-muted text-sm mt-1">Cobros y pagos pendientes para las próximas 13 semanas.</p>
      </div>

      {/* Alerta de liquidez */}
      {data.alerta_liquidez && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 font-medium">
            Alerta: tu flujo de caja proyectado entra en negativo en las próximas semanas. Revisá tus pagos pendientes.
          </p>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          title="Por cobrar"
          value={fmt(data.total_por_cobrar, moneda)}
          icon={<TrendingUp className="h-5 w-5 text-emerald-400" />}
          color="text-emerald-600"
        />
        <KpiCard
          title="Por pagar"
          value={fmt(data.total_por_pagar, moneda)}
          icon={<TrendingDown className="h-5 w-5 text-red-400" />}
          color="text-red-600"
        />
        <KpiCard
          title="Balance proyectado"
          value={fmt(data.balance_proyectado, moneda)}
          icon={<Wallet className={`h-5 w-5 ${data.balance_proyectado >= 0 ? "text-emerald-400" : "text-red-400"}`} />}
          color={data.balance_proyectado >= 0 ? "text-emerald-600" : "text-red-600"}
        />
      </div>

      {/* Gráfico semanas */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-agro-text">Proyección semanal (13 semanas)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={data.semanas} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="semana_label"
                tick={{ fontSize: 9, fill: "#94a3b8" }}
                angle={-30}
                textAnchor="end"
                height={52}
              />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} width={60} tickFormatter={(v) => new Intl.NumberFormat("es-UY", { notation: "compact" }).format(v)} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="cobros" name="Cobros" fill="#10b981" opacity={0.85} radius={[3, 3, 0, 0]} />
              <Bar dataKey="pagos" name="Pagos" fill="#ef4444" opacity={0.85} radius={[3, 3, 0, 0]} />
              <Line
                type="monotone"
                dataKey="balance_acumulado"
                name="Balance acumulado"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Vencidos */}
      {hayVencidos && (
        <VencidosSection cobrosV={data.cobros_vencidos} pagosV={data.pagos_vencidos} />
      )}

      {/* Cobros pendientes */}
      {data.cobros_pendientes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-agro-text flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Cobros pendientes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <PendingTable items={data.cobros_pendientes} tipo="cobro" />
          </CardContent>
        </Card>
      )}

      {/* Pagos pendientes */}
      {data.pagos_pendientes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-agro-text flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              Pagos pendientes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <PendingTable items={data.pagos_pendientes} tipo="pago" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
