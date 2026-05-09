import { useQuery } from "@tanstack/react-query";
import { ProyeccionAnualCards } from "@/components/rentabilidad/ProyeccionAnual";
import { getProyeccionAnual } from "@/lib/rentabilidadApi";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Beef,
  MapPin,
  Maximize2,
  CalendarClock,
  ArrowRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  PackageCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardResumen } from "@/lib/dashboardApi";
import { getClientes } from "@/lib/clientesApi";
import { getProveedores } from "@/lib/proveedoresApi";
import { useAuthStore } from "@/store/authStore";
import type { DashboardResumen, MovimientoProximo } from "@/types/dashboard";
import type { ResumenCategoria } from "@/types/registros";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMoneda(value: string | number, moneda: string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: moneda === "USD" ? "USD" : "UYU",
    maximumFractionDigits: 0,
  }).format(num);
}

function formatMesLabel(mes: string): string {
  const [year, month] = mes.split("-");
  const names = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `${names[parseInt(month) - 1]} ${year.slice(2)}`;
}

function pctChange(current: number, prev: number): { text: string; positive: boolean } | null {
  if (prev === 0) return null;
  const pct = ((current - prev) / prev) * 100;
  const positive = pct >= 0;
  return { text: `${positive ? "+" : ""}${pct.toFixed(1)}% vs mes anterior`, positive };
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function prevMonthKey(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatFecha(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

const ESPECIE_LABEL: Record<string, string> = {
  bovino: "Bovinos",
  ovino: "Ovinos",
  equino: "Equinos",
  porcino: "Porcinos",
  otro: "Otros",
};

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-agro-accent/20 ${className}`} />;
}

function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="lg:col-span-2 h-72" />
        <Skeleton className="h-72" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-52" />
        <Skeleton className="h-52" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ perfil }: { perfil?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
      <Wallet className="h-12 w-12 text-agro-accent" />
      <h2 className="text-lg font-semibold text-agro-text">Sin datos aún</h2>
      <p className="text-agro-muted max-w-xs text-sm">
        {perfil === "negocio"
          ? "Registrá tus primeros gastos e ingresos para ver tu resumen aquí."
          : "Registrá tus primeros gastos e ingresos, y agregá potreros en el mapa para ver tu resumen aquí."}
      </p>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  valueColor?: string;
  change?: { text: string; positive: boolean } | null;
}

function KpiCard({ title, value, icon, valueColor = "text-agro-text", change }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-agro-muted">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent className="space-y-1">
        <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
        {change && (
          <p className={`text-xs ${change.positive ? "text-emerald-400" : "text-red-400"}`}>
            {change.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Custom Tooltip para BarChart ──────────────────────────────────────────────

function BarTooltip({ active, payload, label }: any) {
  const moneda = useAuthStore((s) => s.user?.moneda ?? "UYU");
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-agro-accent/20 rounded-lg p-3 text-sm shadow-xl">
      <p className="font-medium text-agro-text mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatMoneda(entry.value, moneda)}
        </p>
      ))}
    </div>
  );
}

// ── Custom Tooltip para PieChart ──────────────────────────────────────────────

function PieTooltip({ active, payload }: any) {
  const moneda = useAuthStore((s) => s.user?.moneda ?? "UYU");
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="bg-white border border-agro-accent/20 rounded-lg p-3 text-sm shadow-xl">
      <p className="text-agro-text font-medium">{name}</p>
      <p className="text-agro-primary font-semibold">{formatMoneda(value, moneda)}</p>
    </div>
  );
}

// ── Gráfica de barras ─────────────────────────────────────────────────────────

function BarChartCard({ data }: { data: DashboardResumen["por_mes"] }) {
  const chartData = data.map((m) => ({
    mes: formatMesLabel(m.mes),
    Ingresos: parseFloat(m.ingresos),
    Gastos: parseFloat(m.gastos),
  }));

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base text-agro-text">Ingresos vs Gastos — últimos 12 meses</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-agro-muted text-sm text-center py-8">Sin registros en los últimos 12 meses.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#8CB79B40" vertical={false} />
              <XAxis
                dataKey="mes"
                tick={{ fill: "#6B8F7A", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#6B8F7A", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) =>
                  v >= 1000000
                    ? `$${(v / 1000000).toFixed(1)}M`
                    : v >= 1000
                    ? `$${(v / 1000).toFixed(0)}k`
                    : `$${v}`
                }
                width={52}
              />
              <Tooltip content={<BarTooltip />} cursor={{ fill: "#8CB79B15" }} />
              <Bar dataKey="Ingresos" fill="#235347" radius={[3, 3, 0, 0]} maxBarSize={24} />
              <Bar dataKey="Gastos" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ── Gráfica de torta ──────────────────────────────────────────────────────────

function PieChartCard({ categorias }: { categorias: ResumenCategoria[] }) {
  const gastos = categorias.filter((c) => c.tipo === "gasto");

  const chartData = gastos.map((c) => ({
    name: c.nombre,
    value: parseFloat(c.total),
    color: c.color,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-agro-text">Gastos por categoría</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-agro-muted text-sm text-center py-8">Sin gastos registrados.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="45%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} stroke="transparent" />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip />} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: "11px", color: "#6B8F7A" }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ── Info del campo ────────────────────────────────────────────────────────────

function CampoCard({ data }: { data: DashboardResumen }) {
  const maxAnimales = Math.max(...data.animales_por_especie.map((a) => a.total), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-agro-text">Información del campo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center bg-agro-bg rounded-lg p-3">
            <MapPin className="h-5 w-5 text-agro-primary mb-1" />
            <span className="text-xl font-bold text-agro-text">{data.total_potreros}</span>
            <span className="text-xs text-agro-muted">Potreros</span>
          </div>
          <div className="flex flex-col items-center bg-agro-bg rounded-lg p-3">
            <Maximize2 className="h-5 w-5 text-amber-500 mb-1" />
            <span className="text-xl font-bold text-agro-text">
              {parseFloat(data.hectareas_totales).toLocaleString("es-AR", { maximumFractionDigits: 1 })}
            </span>
            <span className="text-xs text-agro-muted">Hectáreas</span>
          </div>
          <div className="flex flex-col items-center bg-agro-bg rounded-lg p-3">
            <Beef className="h-5 w-5 text-agro-accent mb-1" />
            <span className="text-xl font-bold text-agro-text">{data.total_animales}</span>
            <span className="text-xs text-agro-muted">Animales</span>
          </div>
        </div>

        {data.animales_por_especie.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-agro-muted uppercase tracking-wide">Por especie</p>
            {data.animales_por_especie.map((a) => (
              <div key={a.especie} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-agro-text">{ESPECIE_LABEL[a.especie] ?? a.especie}</span>
                  <span className="text-agro-muted">{a.total}</span>
                </div>
                <div className="h-1.5 bg-agro-accent/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-agro-primary rounded-full transition-all"
                    style={{ width: `${(a.total / maxAnimales) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-agro-muted text-sm text-center py-2">Sin animales registrados.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Movimientos próximos ──────────────────────────────────────────────────────

function MovimientosCard({ movimientos }: { movimientos: MovimientoProximo[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-agro-text flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-agro-primary" />
          Movimientos próximos (7 días)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {movimientos.length === 0 ? (
          <p className="text-agro-muted text-sm text-center py-6">
            No hay movimientos programados para los próximos 7 días.
          </p>
        ) : (
          <ul className="space-y-3">
            {movimientos.map((mov) => (
              <li
                key={mov.id}
                className="flex items-center justify-between bg-agro-bg rounded-lg px-3 py-2.5"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-sm text-agro-text">
                    <span className="font-medium truncate max-w-[100px]">{mov.potrero_origen_nombre}</span>
                    <ArrowRight className="h-3 w-3 text-agro-muted shrink-0" />
                    <span className="font-medium truncate max-w-[100px]">{mov.potrero_destino_nombre}</span>
                  </div>
                  <p className="text-xs text-agro-muted">
                    {mov.cantidad} {ESPECIE_LABEL[mov.especie] ?? mov.especie}
                  </p>
                </div>
                <span className="text-xs text-agro-muted shrink-0 ml-2">
                  {formatFecha(mov.fecha_programada)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ── Tabla por categoría ───────────────────────────────────────────────────────

function CategoriaTabla({ categorias }: { categorias: ResumenCategoria[] }) {
  const moneda = useAuthStore((s) => s.user?.moneda ?? "UYU");
  const totalGastos = categorias
    .filter((c) => c.tipo === "gasto")
    .reduce((acc, c) => acc + parseFloat(c.total), 0);
  const totalIngresos = categorias
    .filter((c) => c.tipo === "ingreso")
    .reduce((acc, c) => acc + parseFloat(c.total), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-agro-text">Resumen por categoría</CardTitle>
      </CardHeader>
      <CardContent>
        {categorias.length === 0 ? (
          <p className="text-agro-muted text-sm text-center py-6">Sin categorías con registros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-agro-accent/20">
                  <th className="text-left py-2 px-2 text-agro-muted font-medium">Categoría</th>
                  <th className="text-left py-2 px-2 text-agro-muted font-medium">Tipo</th>
                  <th className="text-right py-2 px-2 text-agro-muted font-medium">Total</th>
                  <th className="text-right py-2 px-2 text-agro-muted font-medium">% del tipo</th>
                </tr>
              </thead>
              <tbody>
                {categorias.map((cat) => {
                  const total = parseFloat(cat.total);
                  const base = cat.tipo === "gasto" ? totalGastos : totalIngresos;
                  const pct = base > 0 ? ((total / base) * 100).toFixed(1) : "0.0";
                  return (
                    <tr
                      key={cat.categoria_id}
                      className="border-b border-agro-accent/10 hover:bg-agro-bg transition-colors"
                    >
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="text-agro-text">{cat.nombre}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                            cat.tipo === "gasto"
                              ? "text-red-600 ring-red-400/30 bg-red-50"
                              : "text-agro-primary ring-agro-accent/40 bg-agro-accent/10"
                          }`}
                        >
                          {cat.tipo === "gasto" ? "Gasto" : "Ingreso"}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right font-medium text-agro-text">
                        {formatMoneda(total, moneda)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-agro-muted">{pct}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Dashboard Negocio ─────────────────────────────────────────────────────────

interface DashboardNegocioProps {
  data: DashboardResumen;
  moneda: string;
  ingresosCur: number;
  gastosCur: number;
}

function DashboardNegocio({ data, moneda, ingresosCur, gastosCur }: DashboardNegocioProps) {
  const balance = parseFloat(data.balance);
  const margen = ingresosCur - gastosCur;

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: getClientes,
  });

  const totalPendiente = clientes
    .flatMap((c) => c.cuentas ?? [])
    .filter((cu) => !cu.pagado)
    .reduce((acc, cu) => acc + cu.monto, 0);

  const totalCobrado = clientes
    .flatMap((c) => c.cuentas ?? [])
    .filter((cu) => cu.pagado)
    .reduce((acc, cu) => acc + cu.monto, 0);

  const { data: proveedores = [] } = useQuery({
    queryKey: ["proveedores"],
    queryFn: getProveedores,
  });

  const totalPorPagar = proveedores
    .flatMap((p) => p.cuentas_pagar ?? [])
    .filter((cu) => !cu.pagado)
    .reduce((acc, cu) => acc + cu.monto, 0);

  const totalPagadoProveedores = proveedores
    .flatMap((p) => p.cuentas_pagar ?? [])
    .filter((cu) => cu.pagado)
    .reduce((acc, cu) => acc + cu.monto, 0);

  return (
    <div className="space-y-6">
      {/* Fila 1 — KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <KpiCard
          title="Facturación del mes"
          value={formatMoneda(ingresosCur, moneda)}
          icon={<TrendingUp className="h-5 w-5 text-emerald-400" />}
          valueColor="text-emerald-400"
        />
        <KpiCard
          title="Gastos del mes"
          value={formatMoneda(gastosCur, moneda)}
          icon={<TrendingDown className="h-5 w-5 text-red-400" />}
          valueColor="text-red-400"
        />
        <KpiCard
          title="Margen bruto del mes"
          value={formatMoneda(margen, moneda)}
          icon={
            margen >= 0
              ? <TrendingUp className="h-5 w-5 text-emerald-400" />
              : <TrendingDown className="h-5 w-5 text-red-400" />
          }
          valueColor={margen >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <KpiCard
          title="Balance total"
          value={formatMoneda(data.balance, moneda)}
          icon={<Wallet className={`h-5 w-5 ${balance >= 0 ? "text-emerald-400" : "text-red-400"}`} />}
          valueColor={balance >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <KpiCard
          title="Por cobrar"
          value={formatMoneda(totalPendiente, moneda)}
          icon={<Clock className="h-5 w-5 text-amber-400" />}
          valueColor="text-amber-400"
        />
        <KpiCard
          title="Cobrado"
          value={formatMoneda(totalCobrado, moneda)}
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />}
          valueColor="text-emerald-400"
        />
        <KpiCard
          title="Por pagar"
          value={formatMoneda(totalPorPagar, moneda)}
          icon={<AlertCircle className="h-5 w-5 text-red-400" />}
          valueColor="text-red-400"
        />
        <KpiCard
          title="Pagado proveedores"
          value={formatMoneda(totalPagadoProveedores, moneda)}
          icon={<PackageCheck className="h-5 w-5 text-agro-muted" />}
          valueColor="text-agro-muted"
        />
      </div>

      {/* Fila 2 — Gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BarChartCard data={data.por_mes} />
        <PieChartCard categorias={data.por_categoria} />
      </div>

      {/* Fila 3 — Tabla categorías */}
      <CategoriaTabla categorias={data.por_categoria} />
    </div>
  );
}

// ── Dashboard Productor ───────────────────────────────────────────────────────

interface DashboardProductorProps {
  data: DashboardResumen;
  moneda: string;
  ingresosCur: number;
  ingresosPrev: number;
  gastosCur: number;
  gastosPrev: number;
  balance: number;
}

function DashboardProductor({
  data,
  moneda,
  ingresosCur,
  ingresosPrev,
  gastosCur,
  gastosPrev,
  balance,
}: DashboardProductorProps) {
  return (
    <div className="space-y-6">
      {/* Fila 1 — KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="Balance total"
          value={formatMoneda(data.balance, moneda)}
          icon={<Wallet className={`h-5 w-5 ${balance >= 0 ? "text-emerald-400" : "text-red-400"}`} />}
          valueColor={balance >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <KpiCard
          title="Total ingresos"
          value={formatMoneda(data.total_ingresos, moneda)}
          icon={<TrendingUp className="h-5 w-5 text-emerald-400" />}
          valueColor="text-emerald-400"
          change={pctChange(ingresosCur, ingresosPrev)}
        />
        <KpiCard
          title="Total gastos"
          value={formatMoneda(data.total_gastos, moneda)}
          icon={<TrendingDown className="h-5 w-5 text-red-400" />}
          valueColor="text-red-400"
          change={pctChange(gastosCur, gastosPrev)}
        />
        <KpiCard
          title="Total animales"
          value={data.total_animales.toLocaleString("es-AR")}
          icon={<Beef className="h-5 w-5 text-amber-400" />}
        />
      </div>

      {/* Fila 2 — Gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BarChartCard data={data.por_mes} />
        <PieChartCard categorias={data.por_categoria} />
      </div>

      {/* Fila 3 — Campo y movimientos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CampoCard data={data} />
        <MovimientosCard movimientos={data.movimientos_proximos} />
      </div>

      {/* Fila 4 — Tabla categorías */}
      <CategoriaTabla categorias={data.por_categoria} />

      {/* Fila 5 — Proyección anual */}
      <ProyeccionSection />
    </div>
  );
}

// ── Proyección section ────────────────────────────────────────────────────────

function ProyeccionSection() {
  const { data, isLoading } = useQuery({
    queryKey: ["proyeccion-anual"],
    queryFn: getProyeccionAnual,
    staleTime: 5 * 60_000,
  });

  const MIN_DIAS = 30;

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-agro-text">Proyección al cierre del año</h2>

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 rounded-2xl bg-slate-800 animate-pulse" />
          ))}
        </div>
      )}

      {!isLoading && data && data.periodo_analizado_dias < MIN_DIAS && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 text-center">
          <p className="text-sm text-slate-400">
            Se necesitan al menos {MIN_DIAS} días de datos para calcular la proyección.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Llevás {data.periodo_analizado_dias} días registrados este año.
          </p>
        </div>
      )}

      {!isLoading && data && data.periodo_analizado_dias >= MIN_DIAS && (
        <ProyeccionAnualCards data={data} />
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard-resumen"],
    queryFn: getDashboardResumen,
    staleTime: 60_000,
  });

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !data) {
    return (
      <div className="p-6">
        <p className="text-red-400 text-sm">Error al cargar el dashboard. Intentá de nuevo más tarde.</p>
      </div>
    );
  }

  const isEmpty =
    parseFloat(data.total_gastos) === 0 &&
    parseFloat(data.total_ingresos) === 0 &&
    data.total_potreros === 0;

  // Cambio mes actual vs anterior para KPIs
  const curKey = currentMonthKey();
  const prevKey = prevMonthKey();
  const curMes = data.por_mes.find((m) => m.mes === curKey);
  const prevMes = data.por_mes.find((m) => m.mes === prevKey);

  const ingresosCur = parseFloat(curMes?.ingresos ?? "0");
  const ingresosPrev = parseFloat(prevMes?.ingresos ?? "0");
  const gastosCur = parseFloat(curMes?.gastos ?? "0");
  const gastosPrev = parseFloat(prevMes?.gastos ?? "0");

  const balance = parseFloat(data.balance);
  const moneda = user?.moneda ?? "UYU";

  return (
    <div className="page-fade p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-agro-text">
          Hola, {user?.nombre ?? "…"} 👋
        </h1>
        <p className="text-agro-muted mt-1">Panel de control — 360 Finance</p>
      </div>

      {isEmpty ? (
        <EmptyState perfil={user?.perfil} />
      ) : user?.perfil === "negocio" ? (
        <DashboardNegocio
          data={data}
          moneda={moneda}
          ingresosCur={ingresosCur}
          gastosCur={gastosCur}
        />
      ) : (
        <DashboardProductor
          data={data}
          moneda={moneda}
          ingresosCur={ingresosCur}
          ingresosPrev={ingresosPrev}
          gastosCur={gastosCur}
          gastosPrev={gastosPrev}
          balance={balance}
        />
      )}
    </div>
  );
}
