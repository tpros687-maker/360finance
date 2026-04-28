import { useQuery } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, Info, CheckCircle } from "lucide-react";

import { getAlertas } from "@/lib/dashboardApi";
import type { AlertaItem } from "@/types/dashboard";

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-agro-accent/20 ${className}`} />;
}

const NIVEL_CONFIG = {
  danger: {
    border: "border-red-200",
    bg: "bg-red-50",
    titleColor: "text-red-700",
    icon: <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />,
  },
  warning: {
    border: "border-amber-200",
    bg: "bg-amber-50",
    titleColor: "text-amber-700",
    icon: <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />,
  },
  info: {
    border: "border-blue-200",
    bg: "bg-blue-50",
    titleColor: "text-blue-700",
    icon: <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />,
  },
} as const;

function AlertCard({ alerta }: { alerta: AlertaItem }) {
  const { border, bg, titleColor, icon } = NIVEL_CONFIG[alerta.nivel];
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-4 ${border} ${bg}`}>
      {icon}
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${titleColor}`}>{alerta.titulo}</p>
        <p className="text-sm text-agro-muted mt-0.5">{alerta.detalle}</p>
      </div>
    </div>
  );
}

export default function AlertasPage() {
  const { data: alertas = [], isLoading } = useQuery<AlertaItem[]>({
    queryKey: ["alertas"],
    queryFn: getAlertas,
    staleTime: 1000 * 60 * 2,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  }

  const dangerCount = alertas.filter((a) => a.nivel === "danger").length;
  const warningCount = alertas.filter((a) => a.nivel === "warning").length;

  return (
    <div className="p-6 space-y-5 page-fade">
      <div>
        <h1 className="text-2xl font-bold text-agro-text">Alertas inteligentes</h1>
        <p className="text-agro-muted text-sm mt-1">
          {alertas.length === 0
            ? "Sin alertas activas."
            : `${alertas.length} alerta${alertas.length > 1 ? "s" : ""} activa${alertas.length > 1 ? "s" : ""}${dangerCount > 0 ? ` · ${dangerCount} crítica${dangerCount > 1 ? "s" : ""}` : ""}${warningCount > 0 ? ` · ${warningCount} advertencia${warningCount > 1 ? "s" : ""}` : ""}.`}
        </p>
      </div>

      {alertas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
          <CheckCircle className="h-12 w-12 text-emerald-400" />
          <h2 className="text-lg font-semibold text-agro-text">Todo en orden</h2>
          <p className="text-agro-muted max-w-sm text-sm">
            Sin alertas activas. Revisá esta sección regularmente para estar al tanto de situaciones que requieran atención.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {alertas.map((a, i) => (
            <AlertCard key={`${a.tipo}-${i}`} alerta={a} />
          ))}
        </div>
      )}
    </div>
  );
}
