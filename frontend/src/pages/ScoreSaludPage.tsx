import { useQuery } from "@tanstack/react-query";
import { Activity, Droplets, Banknote, Sprout, TrendingDown } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getScoreSalud } from "@/lib/dashboardApi";
import type { IndicadorSalud, ScoreSaludResponse } from "@/types/dashboard";

// ── Config ────────────────────────────────────────────────────────────────────

const NIVEL_CONFIG = {
  "crítico":   { color: "#ef4444", bg: "bg-red-100",     text: "text-red-700",     label: "Crítico"   },
  "regular":   { color: "#f59e0b", bg: "bg-amber-100",   text: "text-amber-700",   label: "Regular"   },
  "bueno":     { color: "#3b82f6", bg: "bg-blue-100",    text: "text-blue-700",    label: "Bueno"     },
  "excelente": { color: "#10b981", bg: "bg-emerald-100", text: "text-emerald-700", label: "Excelente" },
} as const;

const INDICADOR_ICONS = {
  liquidez:      Droplets,
  deuda:         Banknote,
  productividad: Sprout,
  costos:        TrendingDown,
} as const;

// ── SVG circle progress ───────────────────────────────────────────────────────

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function CircleProgress({ score, color }: { score: number; color: string }) {
  const offset = CIRCUMFERENCE * (1 - score / 100);
  return (
    <svg width="140" height="140" className="-rotate-90">
      {/* Track */}
      <circle cx="70" cy="70" r={RADIUS} fill="none" stroke="#e2e8f0" strokeWidth="10" />
      {/* Progress */}
      <circle
        cx="70"
        cy="70"
        r={RADIUS}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}

// ── Indicator card ────────────────────────────────────────────────────────────

function IndicadorCard({
  name,
  data,
}: {
  name: keyof typeof INDICADOR_ICONS;
  data: IndicadorSalud;
}) {
  const Icon = INDICADOR_ICONS[name];
  const pct = (data.pts / data.max) * 100;
  const barColor =
    pct === 100 ? "bg-emerald-500" : pct >= 48 ? "bg-amber-500" : "bg-red-500";

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-agro-primary/10">
          <Icon className="h-4 w-4 text-agro-primary" />
        </div>
        <CardTitle className="text-sm font-medium text-agro-muted">{data.label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold text-agro-text">{data.pts}</span>
          <span className="text-sm text-agro-muted">/ {data.max}</span>
        </div>
        <div className="h-2 w-full rounded-full bg-agro-accent/20">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-agro-accent/20 ${className}`} />;
}

function PageSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <Skeleton className="h-8 w-56" />
      <div className="flex justify-center">
        <Skeleton className="h-64 w-64 rounded-2xl" />
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ScoreSaludPage() {
  const { data, isLoading } = useQuery<ScoreSaludResponse>({
    queryKey: ["score-salud"],
    queryFn: getScoreSalud,
    staleTime: 1000 * 60 * 5,
  });

  if (isLoading || !data) return <PageSkeleton />;

  const cfg = NIVEL_CONFIG[data.nivel];

  return (
    <div className="p-6 space-y-6 page-fade">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Activity className="h-6 w-6 text-agro-primary" />
        <h1 className="text-2xl font-bold text-agro-text">Score de Salud del Campo</h1>
      </div>

      {/* Score central */}
      <Card>
        <CardContent className="flex flex-col items-center py-8 gap-4">
          {/* Circle + number overlay */}
          <div className="relative flex items-center justify-center">
            <CircleProgress score={data.score} color={cfg.color} />
            <div className="absolute flex flex-col items-center">
              <span className="text-4xl font-black text-agro-text leading-none">{data.score}</span>
              <span className="text-xs text-agro-muted mt-0.5">/ 100</span>
            </div>
          </div>

          {/* Level badge */}
          <span className={`inline-flex items-center rounded-full px-4 py-1 text-sm font-bold ${cfg.bg} ${cfg.text}`}>
            {cfg.label}
          </span>

          <p className="text-sm text-agro-muted text-center max-w-xs">
            {data.nivel === "excelente" && "Tu campo está en excelente estado financiero y productivo."}
            {data.nivel === "bueno"     && "Buen desempeño general, hay oportunidades de mejora menores."}
            {data.nivel === "regular"   && "Algunas áreas requieren atención. Revisá los indicadores en rojo."}
            {data.nivel === "crítico"   && "Situación crítica. Tomá medidas urgentes en los indicadores en rojo."}
          </p>
        </CardContent>
      </Card>

      {/* Indicators grid */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {(Object.keys(INDICADOR_ICONS) as (keyof typeof INDICADOR_ICONS)[]).map((key) => (
          <IndicadorCard key={key} name={key} data={data.detalle[key]} />
        ))}
      </div>

      {/* Fecha */}
      <p className="text-center text-xs text-agro-muted">
        Calculado el{" "}
        {new Date(data.fecha_calculo).toLocaleDateString("es-AR", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        })}
      </p>
    </div>
  );
}
