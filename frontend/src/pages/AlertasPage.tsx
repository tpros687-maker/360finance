import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, Info, CheckCircle, X, RotateCcw } from "lucide-react";

import { getAlertas } from "@/lib/dashboardApi";
import type { AlertaItem } from "@/types/dashboard";

const LS_KEY = "alertas_descartadas";

function loadDescartadas(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveDescartadas(ids: string[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(ids));
}

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

function AlertCard({ alerta, onDismiss }: { alerta: AlertaItem; onDismiss: () => void }) {
  const { border, bg, titleColor, icon } = NIVEL_CONFIG[alerta.nivel];
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-4 ${border} ${bg}`}>
      {icon}
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${titleColor}`}>{alerta.titulo}</p>
        <p className="text-sm text-agro-muted mt-0.5">{alerta.detalle}</p>
      </div>
      <button
        onClick={onDismiss}
        className="shrink-0 p-1 rounded-md text-agro-muted hover:text-agro-text hover:bg-black/5 transition-colors"
        title="Descartar alerta"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function AlertasPage() {
  const [descartadas, setDescartadas] = useState<string[]>(loadDescartadas);

  const { data: alertas = [], isLoading } = useQuery<AlertaItem[]>({
    queryKey: ["alertas"],
    queryFn: getAlertas,
    staleTime: 1000 * 60 * 2,
  });

  const dismiss = (id: string) => {
    const updated = [...descartadas, id];
    setDescartadas(updated);
    saveDescartadas(updated);
  };

  const restaurar = () => {
    setDescartadas([]);
    saveDescartadas([]);
  };

  const visibles = alertas.filter((a) => !descartadas.includes(a.id));
  const hayDescartadas = descartadas.length > 0 && descartadas.some((id) =>
    alertas.some((a) => a.id === id)
  );

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

  const dangerCount = visibles.filter((a) => a.nivel === "danger").length;
  const warningCount = visibles.filter((a) => a.nivel === "warning").length;

  return (
    <div className="p-6 space-y-5 page-fade">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-agro-text">Alertas inteligentes</h1>
          <p className="text-agro-muted text-sm mt-1">
            {visibles.length === 0
              ? "Sin alertas activas."
              : `${visibles.length} alerta${visibles.length > 1 ? "s" : ""} activa${visibles.length > 1 ? "s" : ""}${dangerCount > 0 ? ` · ${dangerCount} crítica${dangerCount > 1 ? "s" : ""}` : ""}${warningCount > 0 ? ` · ${warningCount} advertencia${warningCount > 1 ? "s" : ""}` : ""}.`}
          </p>
        </div>
        {hayDescartadas && (
          <button
            onClick={restaurar}
            className="flex items-center gap-1.5 text-xs text-agro-muted hover:text-agro-text border border-agro-accent/30 rounded-md px-3 py-1.5 hover:bg-agro-bg transition-colors shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Restaurar todas
          </button>
        )}
      </div>

      {visibles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
          <CheckCircle className="h-12 w-12 text-emerald-400" />
          <h2 className="text-lg font-semibold text-agro-text">Todo en orden</h2>
          <p className="text-agro-muted max-w-sm text-sm">
            Sin alertas activas. Revisá esta sección regularmente para estar al tanto de situaciones que requieran atención.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibles.map((a) => (
            <AlertCard key={a.id} alerta={a} onDismiss={() => dismiss(a.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
