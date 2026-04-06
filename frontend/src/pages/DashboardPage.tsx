import { useQuery } from "@tanstack/react-query";
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboardResumen } from "@/lib/dashboardApi";
import { useAuthStore } from "@/store/authStore";
import type { DashboardResumen, MovimientoProximo } from "@/types/dashboard";
import type { ResumenCategoria } from "@/types/registros";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatARS(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
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
  return <div className={`animate-pulse rounded-lg bg-slate-800 ${className}`} />;
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
      <Wallet className="h-12 w-12 text-slate-600" />
      <h2 className="text-lg font-semibold text-slate-300">Sin datos aún</h2>
      <p className="text-slate-500 max-w-xs text-sm">
        Registrá tus primeros gastos e ingresos, y agregá potreros en el mapa para ver tu
        resumen aquí.
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

function KpiCard({ title, value, icon, valueColor = "text-white", change }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-slate-400">{title}</CardTitle>
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
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm shadow-xl">
      <p className="font-medium text-slate-200 mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {formatARS(entry.value)}
        </p>
      ))}
    </div>
  );
}

// ── Custom Tooltip para PieChart ──────────────────────────────────────────────

function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm shadow-xl">
      <p className="text-slate-200 font-medium">{name}</p>
      <p className="text-white">{formatARS(value)}</p>
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
        <CardTitle className="text-base text-slate-300">Ingresos vs Gastos — últimos 12 meses</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">Sin registros en los últimos 12 meses.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis
                dataKey="mes"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#94a3b8", fontSize: 11 }}
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
              <Tooltip content={<BarTooltip />} cursor={{ fill: "#1e293b" }} />
              <Bar dataKey="Ingresos" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={24} />
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
        <CardTitle className="text-base text-slate-300">Gastos por categoría</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-8">Sin gastos registrados.</p>
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
                wrapperStyle={{ fontSize: "11px", color: "#94a3b8" }}
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
        <CardTitle className="text-base text-slate-300">Información del campo</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center bg-slate-800/60 rounded-lg p-3">
            <MapPin className="h-5 w-5 text-brand-400 mb-1" />
            <span className="text-xl font-bold text-white">{data.total_potreros}</span>
            <span className="text-xs text-slate-400">Potreros</span>
          </div>
          <div className="flex flex-col items-center bg-slate-800/60 rounded-lg p-3">
            <Maximize2 className="h-5 w-5 text-amber-400 mb-1" />
            <span className="text-xl font-bold text-white">
              {parseFloat(data.hectareas_totales).toLocaleString("es-AR", { maximumFractionDigits: 1 })}
            </span>
            <span className="text-xs text-slate-400">Hectáreas</span>
          </div>
          <div className="flex flex-col items-center bg-slate-800/60 rounded-lg p-3">
            <Beef className="h-5 w-5 text-emerald-400 mb-1" />
            <span className="text-xl font-bold text-white">{data.total_animales}</span>
            <span className="text-xs text-slate-400">Animales</span>
          </div>
        </div>

        {data.animales_por_especie.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Por especie</p>
            {data.animales_por_especie.map((a) => (
              <div key={a.especie} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">{ESPECIE_LABEL[a.especie] ?? a.especie}</span>
                  <span className="text-slate-400">{a.total}</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${(a.total / maxAnimales) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500 text-sm text-center py-2">Sin animales registrados.</p>
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
        <CardTitle className="text-base text-slate-300 flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-blue-400" />
          Movimientos próximos (7 días)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {movimientos.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-6">
            No hay movimientos programados para los próximos 7 días.
          </p>
        ) : (
          <ul className="space-y-3">
            {movimientos.map((mov) => (
              <li
                key={mov.id}
                className="flex items-center justify-between bg-slate-800/60 rounded-lg px-3 py-2.5"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-sm text-slate-200">
                    <span className="font-medium truncate max-w-[100px]">{mov.potrero_origen_nombre}</span>
                    <ArrowRight className="h-3 w-3 text-slate-500 shrink-0" />
                    <span className="font-medium truncate max-w-[100px]">{mov.potrero_destino_nombre}</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {mov.cantidad} {ESPECIE_LABEL[mov.especie] ?? mov.especie}
                  </p>
                </div>
                <span className="text-xs text-slate-400 shrink-0 ml-2">
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
  const totalGastos = categorias
    .filter((c) => c.tipo === "gasto")
    .reduce((acc, c) => acc + parseFloat(c.total), 0);
  const totalIngresos = categorias
    .filter((c) => c.tipo === "ingreso")
    .reduce((acc, c) => acc + parseFloat(c.total), 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-slate-300">Resumen por categoría</CardTitle>
      </CardHeader>
      <CardContent>
        {categorias.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-6">Sin categorías con registros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-2 text-slate-400 font-medium">Categoría</th>
                  <th className="text-left py-2 px-2 text-slate-400 font-medium">Tipo</th>
                  <th className="text-right py-2 px-2 text-slate-400 font-medium">Total</th>
                  <th className="text-right py-2 px-2 text-slate-400 font-medium">% del tipo</th>
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
                      className="border-b border-slate-800 hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: cat.color }}
                          />
                          <span className="text-slate-200">{cat.nombre}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                            cat.tipo === "gasto"
                              ? "text-red-300 ring-red-400/30 bg-red-400/10"
                              : "text-emerald-300 ring-emerald-400/30 bg-emerald-400/10"
                          }`}
                        >
                          {cat.tipo === "gasto" ? "Gasto" : "Ingreso"}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right font-medium text-slate-200">
                        {formatARS(total)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-400">{pct}%</td>
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

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          Hola, {user?.nombre ?? "…"} 👋
        </h1>
        <p className="text-slate-400 mt-1">Panel de control — 360 Finance</p>
      </div>

      {isEmpty ? (
        <EmptyState />
      ) : (
        <>
          {/* Fila 1 — KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <KpiCard
              title="Balance total"
              value={formatARS(data.balance)}
              icon={<Wallet className={`h-5 w-5 ${balance >= 0 ? "text-emerald-400" : "text-red-400"}`} />}
              valueColor={balance >= 0 ? "text-emerald-400" : "text-red-400"}
            />
            <KpiCard
              title="Total ingresos"
              value={formatARS(data.total_ingresos)}
              icon={<TrendingUp className="h-5 w-5 text-emerald-400" />}
              valueColor="text-emerald-400"
              change={pctChange(ingresosCur, ingresosPrev)}
            />
            <KpiCard
              title="Total gastos"
              value={formatARS(data.total_gastos)}
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
        </>
      )}
    </div>
  );
}
