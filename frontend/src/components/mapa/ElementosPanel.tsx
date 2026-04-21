import { useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, Fence } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMapaStore } from "@/store/mapaStore";
import type { TipoPotrero, TipoPunto } from "@/types/mapa";

const PUNTO_EMOJI: Record<TipoPunto, string> = {
  bebedero: "💧",
  casa: "🏠",
  sombra: "🌳",
  comedero: "🍽️",
};

const TIPO_POTRERO_LABEL: Record<TipoPotrero, string> = {
  agricultura: "Agric.",
  ganaderia: "Ganad.",
  mixto: "Mixto",
};

const TIPO_POTRERO_COLOR: Record<TipoPotrero, string> = {
  agricultura: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  ganaderia: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  mixto: "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

function diasDescanso(fecha: string): number {
  const from = new Date(fecha + "T00:00:00");
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
}

function polygonCenter(coords: number[][][]): [number, number] {
  const ring = coords[0];
  const lng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
  const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
  return [lng, lat];
}

interface Props {
  onFlyTo: (center: [number, number], zoom: number) => void;
}

export function ElementosPanel({ onFlyTo }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const { potreros, puntos, animalesByPotrero, selectPotrero } = useMapaStore();

  const handlePotreroClick = (id: number, coords: number[][][]) => {
    const center = polygonCenter(coords);
    onFlyTo(center, 14);
    selectPotrero(id);
  };

  const handlePuntoClick = (coords: [number, number]) => {
    onFlyTo(coords, 15);
  };

  return (
    <div
      className={cn(
        "absolute top-[96px] left-0 bottom-0 z-10 flex flex-col",
        "bg-white/95 backdrop-blur-sm border-r border-agro-accent/20 shadow-xl",
        "transition-all duration-200",
        collapsed ? "w-10" : "w-56"
      )}
    >
      {/* Toggle button */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-center h-8 w-full border-b border-agro-accent/20 text-agro-muted hover:text-agro-text hover:bg-agro-bg transition-colors flex-shrink-0"
        title={collapsed ? "Expandir panel" : "Colapsar panel"}
      >
        {collapsed ? (
          <ChevronRight className="w-4 h-4" />
        ) : (
          <ChevronLeft className="w-4 h-4" />
        )}
      </button>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {collapsed ? (
          /* ── Collapsed: section icons only ─────────────────────────── */
          <div className="flex flex-col items-center gap-3 py-3">
            <div title={`${potreros.length} potreros`} className="relative">
              <Fence className="w-5 h-5 text-emerald-400" />
              {potreros.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-emerald-600 text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold leading-none">
                  {potreros.length}
                </span>
              )}
            </div>
            <div title={`${puntos.length} puntos`} className="relative">
              <MapPin className="w-5 h-5 text-agro-primary" />
              {puntos.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-agro-primary text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold leading-none">
                  {puntos.length}
                </span>
              )}
            </div>
          </div>
        ) : (
          /* ── Expanded: full list ────────────────────────────────────── */
          <div className="py-2">
            {/* Potreros section */}
            <div className="px-3 pb-1 pt-1">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Fence className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span className="text-[11px] font-semibold text-agro-muted uppercase tracking-wider">
                  Potreros
                </span>
                <span className="ml-auto text-[10px] text-agro-muted">{potreros.length}</span>
              </div>

              {potreros.length === 0 ? (
                <p className="text-agro-muted text-xs italic px-1">Sin potreros</p>
              ) : (
                <div className="space-y-0.5">
                  {potreros.map((p) => {
                    const animales = animalesByPotrero[p.id];
                    const totalAnimales = animales
                      ? animales.reduce((s, a) => s + a.cantidad, 0)
                      : null;
                    const dias =
                      p.en_descanso && p.fecha_descanso
                        ? diasDescanso(p.fecha_descanso)
                        : null;

                    return (
                      <button
                        key={p.id}
                        onClick={() => handlePotreroClick(p.id, p.geometria.coordinates)}
                        className="w-full text-left px-2 py-1.5 rounded-md hover:bg-agro-bg transition-colors group"
                      >
                        <div className="flex items-start gap-1.5">
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0",
                              p.en_descanso ? "bg-agro-muted" : "bg-emerald-400"
                            )}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-agro-text text-xs font-medium truncate group-hover:text-agro-text">
                              {p.nombre}
                            </p>
                            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                              <span
                                className={cn(
                                  "text-[10px] px-1.5 py-0 rounded-full border leading-4",
                                  TIPO_POTRERO_COLOR[p.tipo]
                                )}
                              >
                                {TIPO_POTRERO_LABEL[p.tipo]}
                              </span>
                              {dias !== null && (
                                <span className="text-[10px] bg-agro-bg text-agro-muted px-1.5 rounded-full leading-4">
                                  💤 {dias}d
                                </span>
                              )}
                              {totalAnimales !== null && dias === null && (
                                <span className="text-[10px] text-agro-muted">
                                  {totalAnimales} anim.
                                </span>
                              )}
                              {p.hectareas !== null && p.hectareas !== undefined && (
                                <span className="text-[10px] text-agro-muted">
                                  {Number(p.hectareas).toLocaleString("es-AR", { maximumFractionDigits: 1 })} ha
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="my-2 border-t border-agro-accent/20" />

            {/* Puntos section */}
            <div className="px-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <MapPin className="w-3.5 h-3.5 text-agro-primary flex-shrink-0" />
                <span className="text-[11px] font-semibold text-agro-muted uppercase tracking-wider">
                  Puntos de interés
                </span>
                <span className="ml-auto text-[10px] text-agro-muted">{puntos.length}</span>
              </div>

              {puntos.length === 0 ? (
                <p className="text-agro-muted text-xs italic px-1">Sin puntos</p>
              ) : (
                <div className="space-y-0.5">
                  {puntos.map((pt) => (
                    <button
                      key={pt.id}
                      onClick={() =>
                        handlePuntoClick(pt.geometria.coordinates as [number, number])
                      }
                      className="w-full text-left px-2 py-1.5 rounded-md hover:bg-agro-bg transition-colors group"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-base leading-none flex-shrink-0">
                          {PUNTO_EMOJI[pt.tipo]}
                        </span>
                        <span className="text-agro-text text-xs truncate group-hover:text-agro-text">
                          {pt.nombre}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
