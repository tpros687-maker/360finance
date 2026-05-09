import type { ProyeccionAnual as ProyeccionAnualData } from "@/types/rentabilidad";

function fmtUSD(n: number | null | undefined, decimals = 0): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

function diasHastaFinAnio(): number {
  const hoy = new Date();
  const finAnio = new Date(hoy.getFullYear(), 11, 31);
  return Math.ceil((finAnio.getTime() - hoy.getTime()) / 86_400_000);
}

interface ScenarioCardProps {
  label: string;
  margenHa: number | null;
  ingresos: number;
  gastos: number;
  margen: number;
  variant: "pesimista" | "base" | "optimista";
}

function ScenarioCard({ label, margenHa, ingresos, gastos, margen, variant }: ScenarioCardProps) {
  const styles = {
    pesimista: {
      border: "border-red-500/30",
      bg: "bg-red-500/5",
      accent: "text-red-400",
      badge: "bg-red-500/20 text-red-300",
    },
    base: {
      border: "border-slate-600",
      bg: "bg-slate-800/60",
      accent: margen >= 0 ? "text-emerald-400" : "text-red-400",
      badge: "bg-slate-700 text-slate-300",
    },
    optimista: {
      border: "border-emerald-500/30",
      bg: "bg-emerald-500/5",
      accent: "text-emerald-400",
      badge: "bg-emerald-500/20 text-emerald-300",
    },
  }[variant];

  return (
    <div className={`rounded-2xl border ${styles.border} ${styles.bg} p-4 flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${styles.badge}`}>
          {label}
        </span>
      </div>

      {/* Main metric */}
      <div>
        <p className="text-[11px] text-slate-500 mb-0.5">Margen / ha esperado</p>
        <p className={`text-3xl font-bold tracking-tight ${styles.accent}`}>
          {fmtUSD(margenHa, 0)}
        </p>
        {margenHa != null && <p className="text-xs text-slate-500">/ ha · año</p>}
      </div>

      {/* Details */}
      <div className="space-y-1 border-t border-slate-700/60 pt-3">
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Ingresos esperados</span>
          <span className="text-slate-200">{fmtUSD(ingresos)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Gastos esperados</span>
          <span className="text-slate-200">{fmtUSD(gastos)}</span>
        </div>
        <div className="flex justify-between text-xs font-semibold pt-1 border-t border-slate-700/40">
          <span className="text-slate-300">Margen total</span>
          <span className={styles.accent}>{fmtUSD(margen)}</span>
        </div>
      </div>
    </div>
  );
}

interface Props {
  data: ProyeccionAnualData;
}

export function ProyeccionAnualCards({ data }: Props) {
  const diasRestantes = diasHastaFinAnio();
  const { pesimista, base, optimista, periodo_analizado_dias } = data;

  return (
    <div className="space-y-3">
      {/* Meta info */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>
          Basado en{" "}
          <span className="text-slate-300 font-medium">{periodo_analizado_dias} días</span>{" "}
          de datos reales
        </span>
        <span>
          Faltan{" "}
          <span className="text-slate-300 font-medium">{diasRestantes} días</span>{" "}
          para fin de año
        </span>
        {data.total_ha && (
          <span>
            <span className="text-slate-300 font-medium">{data.total_ha.toLocaleString("es-UY")}</span>{" "}
            ha totales
          </span>
        )}
      </div>

      {/* Three scenario cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <ScenarioCard
          label="Pesimista (×0.85)"
          margenHa={pesimista.margen_ha_usd}
          ingresos={pesimista.ingresos_usd}
          gastos={pesimista.gastos_usd}
          margen={pesimista.margen_usd}
          variant="pesimista"
        />
        <ScenarioCard
          label="Base (extrapolado)"
          margenHa={base.margen_ha_usd}
          ingresos={base.ingresos_usd}
          gastos={base.gastos_usd}
          margen={base.margen_usd}
          variant="base"
        />
        <ScenarioCard
          label="Optimista (×1.15)"
          margenHa={optimista.margen_ha_usd}
          ingresos={optimista.ingresos_usd}
          gastos={optimista.gastos_usd}
          margen={optimista.margen_usd}
          variant="optimista"
        />
      </div>
    </div>
  );
}
