import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { TrendingUp, TrendingDown, AlertTriangle, Wallet, Plus, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFlujoCaja } from "@/lib/dashboardApi";
import { getClientes, createCuenta } from "@/lib/clientesApi";
import { getProveedores, createCuentaPagar } from "@/lib/proveedoresApi";
import { useAuthStore } from "@/store/authStore";
import { toast } from "@/hooks/useToast";
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
    return <p className="text-agro-muted text-sm italic px-4 py-3">Sin {tipo === "cobro" ? "cobros" : "pagos"} pendientes.</p>;

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
                {fmt(item.monto, item.moneda ?? moneda)}
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
              <p className="text-sm font-semibold text-agro-text">{fmt(item.monto, item.moneda ?? moneda)}</p>
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

// ── Custom tooltip ────────────────────────────────────────────────────────────

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

// ── Form state ────────────────────────────────────────────────────────────────

interface CuentaForm {
  entidad_id: string;
  monto: string;
  moneda: string;
  fecha_vencimiento: string;
  descripcion: string;
}

const EMPTY_FORM: CuentaForm = {
  entidad_id: "",
  monto: "",
  moneda: "UYU",
  fecha_vencimiento: "",
  descripcion: "",
};

// ── Sección Cobros ────────────────────────────────────────────────────────────

function CobrosSection({ items }: { items: ItemFlujo[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CuentaForm>(EMPTY_FORM);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: getClientes,
    staleTime: 60000,
  });

  const mutation = useMutation({
    mutationFn: () =>
      createCuenta(parseInt(form.entidad_id), {
        monto: parseFloat(form.monto),
        moneda: form.moneda,
        fecha_vencimiento: form.fecha_vencimiento || undefined,
        descripcion: form.descripcion.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flujo-caja"] });
      toast({ title: "Cobro registrado" });
      setOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: () => toast({ title: "Error al registrar cobro", variant: "destructive" }),
  });

  const valid = !!form.entidad_id && parseFloat(form.monto) > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base text-agro-text flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            Cobros a realizar
          </CardTitle>
          <button
            onClick={() => { setOpen((v) => !v); setForm(EMPTY_FORM); }}
            className="flex items-center gap-1 text-xs text-emerald-700 border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 rounded-md px-2.5 py-1.5 transition-colors"
          >
            {open ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            {open ? "Cancelar" : "Agregar cobro"}
          </button>
        </div>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        {open && (
          <div className="mx-4 mb-4 p-4 border border-emerald-200 bg-emerald-50/40 rounded-lg space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label className="text-agro-muted text-xs">Cliente *</Label>
                <select
                  value={form.entidad_id}
                  onChange={(e) => setForm((f) => ({ ...f, entidad_id: e.target.value }))}
                  className="mt-1 w-full bg-white border border-agro-accent/20 text-agro-text text-sm rounded-md px-3 py-2"
                >
                  <option value="">Seleccionar cliente...</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-agro-muted text-xs">Monto *</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.monto}
                  onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
                  className="mt-1 bg-white border-agro-accent/20 text-agro-text"
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-agro-muted text-xs">Moneda</Label>
                <select
                  value={form.moneda}
                  onChange={(e) => setForm((f) => ({ ...f, moneda: e.target.value }))}
                  className="mt-1 w-full bg-white border border-agro-accent/20 text-agro-text text-sm rounded-md px-3 py-2"
                >
                  <option value="UYU">UYU</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <Label className="text-agro-muted text-xs">Fecha vencimiento</Label>
                <Input
                  type="date"
                  value={form.fecha_vencimiento}
                  onChange={(e) => setForm((f) => ({ ...f, fecha_vencimiento: e.target.value }))}
                  className="mt-1 bg-white border-agro-accent/20 text-agro-text"
                />
              </div>
              <div>
                <Label className="text-agro-muted text-xs">Descripción</Label>
                <Input
                  value={form.descripcion}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  className="mt-1 bg-white border-agro-accent/20 text-agro-text"
                  placeholder="Opcional"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
                disabled={!valid || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "Guardando..." : "Guardar cobro"}
              </Button>
              <Button
                variant="outline"
                className="text-sm border-agro-accent/20 text-agro-muted"
                onClick={() => { setOpen(false); setForm(EMPTY_FORM); }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
        <PendingTable items={items} tipo="cobro" />
      </CardContent>
    </Card>
  );
}

// ── Sección Pagos ─────────────────────────────────────────────────────────────

function PagosSection({ items }: { items: ItemFlujo[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CuentaForm>(EMPTY_FORM);

  const { data: proveedores = [] } = useQuery({
    queryKey: ["proveedores"],
    queryFn: getProveedores,
    staleTime: 60000,
  });

  const mutation = useMutation({
    mutationFn: () =>
      createCuentaPagar(parseInt(form.entidad_id), {
        monto: parseFloat(form.monto),
        moneda: form.moneda,
        fecha_vencimiento: form.fecha_vencimiento || undefined,
        descripcion: form.descripcion.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flujo-caja"] });
      toast({ title: "Pago registrado" });
      setOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: () => toast({ title: "Error al registrar pago", variant: "destructive" }),
  });

  const valid = !!form.entidad_id && parseFloat(form.monto) > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base text-agro-text flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-red-500" />
            Pagos a realizar
          </CardTitle>
          <button
            onClick={() => { setOpen((v) => !v); setForm(EMPTY_FORM); }}
            className="flex items-center gap-1 text-xs text-red-700 border border-red-200 bg-red-50 hover:bg-red-100 rounded-md px-2.5 py-1.5 transition-colors"
          >
            {open ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
            {open ? "Cancelar" : "Agregar pago"}
          </button>
        </div>
      </CardHeader>
      <CardContent className="p-0 pb-2">
        {open && (
          <div className="mx-4 mb-4 p-4 border border-red-200 bg-red-50/40 rounded-lg space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label className="text-agro-muted text-xs">Proveedor *</Label>
                <select
                  value={form.entidad_id}
                  onChange={(e) => setForm((f) => ({ ...f, entidad_id: e.target.value }))}
                  className="mt-1 w-full bg-white border border-agro-accent/20 text-agro-text text-sm rounded-md px-3 py-2"
                >
                  <option value="">Seleccionar proveedor...</option>
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-agro-muted text-xs">Monto *</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.monto}
                  onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))}
                  className="mt-1 bg-white border-agro-accent/20 text-agro-text"
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <div>
                <Label className="text-agro-muted text-xs">Moneda</Label>
                <select
                  value={form.moneda}
                  onChange={(e) => setForm((f) => ({ ...f, moneda: e.target.value }))}
                  className="mt-1 w-full bg-white border border-agro-accent/20 text-agro-text text-sm rounded-md px-3 py-2"
                >
                  <option value="UYU">UYU</option>
                  <option value="USD">USD</option>
                </select>
              </div>
              <div>
                <Label className="text-agro-muted text-xs">Fecha vencimiento</Label>
                <Input
                  type="date"
                  value={form.fecha_vencimiento}
                  onChange={(e) => setForm((f) => ({ ...f, fecha_vencimiento: e.target.value }))}
                  className="mt-1 bg-white border-agro-accent/20 text-agro-text"
                />
              </div>
              <div>
                <Label className="text-agro-muted text-xs">Descripción</Label>
                <Input
                  value={form.descripcion}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                  className="mt-1 bg-white border-agro-accent/20 text-agro-text"
                  placeholder="Opcional"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                className="bg-red-600 hover:bg-red-700 text-white text-sm"
                disabled={!valid || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "Guardando..." : "Guardar pago"}
              </Button>
              <Button
                variant="outline"
                className="text-sm border-agro-accent/20 text-agro-muted"
                onClick={() => { setOpen(false); setForm(EMPTY_FORM); }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
        <PendingTable items={items} tipo="pago" />
      </CardContent>
    </Card>
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
  const hayResumen = data.total_por_cobrar > 0 || data.total_por_pagar > 0;

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
      {hayResumen && (
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
      )}

      {/* Gráfico semanas */}
      {hayResumen && (
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
      )}

      {/* Vencidos */}
      {hayVencidos && (
        <VencidosSection cobrosV={data.cobros_vencidos} pagosV={data.pagos_vencidos} />
      )}

      {/* Cobros a realizar */}
      <CobrosSection items={data.cobros_pendientes} />

      {/* Pagos a realizar */}
      <PagosSection items={data.pagos_pendientes} />
    </div>
  );
}
