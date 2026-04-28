import { useQuery } from "@tanstack/react-query";
import { Brain, TrendingUp, Leaf, Beef, Lightbulb, RefreshCw, Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getRecomendaciones } from "@/lib/dashboardApi";
import type { RecomendacionIA } from "@/types/dashboard";

// ── Config maps ───────────────────────────────────────────────────────────────

const PRIORIDAD_CONFIG = {
  alta:  { label: "Alta",  className: "bg-red-100 text-red-700" },
  media: { label: "Media", className: "bg-amber-100 text-amber-700" },
  baja:  { label: "Baja",  className: "bg-emerald-100 text-emerald-700" },
} as const;

const CATEGORIA_CONFIG = {
  finanzas:  { label: "Finanzas",  icon: TrendingUp, className: "bg-blue-100 text-blue-700" },
  campo:     { label: "Campo",     icon: Leaf,       className: "bg-green-100 text-green-700" },
  ganaderia: { label: "Ganadería", icon: Beef,       className: "bg-orange-100 text-orange-700" },
  general:   { label: "General",   icon: Lightbulb,  className: "bg-purple-100 text-purple-700" },
} as const;

// ── Components ────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-agro-accent/20 ${className}`} />;
}

function CardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3 space-y-2">
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-20" />
        </div>
        <Skeleton className="h-5 w-3/4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-full mb-1" />
        <Skeleton className="h-4 w-5/6" />
      </CardContent>
    </Card>
  );
}

function RecomendacionCard({ rec }: { rec: RecomendacionIA }) {
  const prio = PRIORIDAD_CONFIG[rec.prioridad] ?? PRIORIDAD_CONFIG.media;
  const cat = CATEGORIA_CONFIG[rec.categoria] ?? CATEGORIA_CONFIG.general;
  const CatIcon = cat.icon;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap gap-2 mb-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${prio.className}`}>
            {prio.label}
          </span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cat.className}`}>
            <CatIcon className="h-3 w-3" />
            {cat.label}
          </span>
        </div>
        <p className="text-sm font-semibold text-agro-text leading-snug">{rec.titulo}</p>
      </CardHeader>
      <CardContent className="pt-0 flex-1">
        <p className="text-sm text-agro-muted">{rec.detalle}</p>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RecomendacionesPage() {
  const { data: recomendaciones = [], isFetching, refetch } = useQuery<RecomendacionIA[]>({
    queryKey: ["recomendaciones"],
    queryFn: getRecomendaciones,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="p-6 space-y-6 page-fade">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-agro-text flex items-center gap-2">
            <Brain className="h-6 w-6 text-agro-primary" />
            Centro de Decisiones IA
          </h1>
          <p className="text-agro-muted text-sm mt-1">
            Recomendaciones personalizadas basadas en tus datos actuales.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 rounded-lg border border-agro-accent/30 bg-white px-3 py-2 text-sm font-medium text-agro-muted transition-colors hover:border-agro-primary hover:text-agro-primary disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {isFetching ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : recomendaciones.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
          <Sparkles className="h-12 w-12 text-agro-accent" />
          <h2 className="text-lg font-semibold text-agro-text">Sin recomendaciones</h2>
          <p className="text-agro-muted max-w-sm text-sm">
            No se pudieron generar recomendaciones. Intentá actualizar o agregá más datos a tu perfil.
          </p>
          <button
            onClick={() => refetch()}
            className="mt-2 rounded-lg bg-agro-primary px-4 py-2 text-sm font-medium text-white hover:bg-agro-primary/90 transition-colors"
          >
            Reintentar
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {recomendaciones.map((rec, i) => (
            <RecomendacionCard key={i} rec={rec} />
          ))}
        </div>
      )}
    </div>
  );
}
