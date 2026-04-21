import { useMapaStore } from "@/store/mapaStore";
import type { TipoPunto } from "@/types/mapa";

const TOOLS: { tipo: TipoPunto; label: string; emoji: string }[] = [
  { tipo: "bebedero", label: "Bebedero", emoji: "💧" },
  { tipo: "casa", label: "Casa", emoji: "🏠" },
  { tipo: "sombra", label: "Sombra", emoji: "🌳" },
  { tipo: "comedero", label: "Comedero", emoji: "🍽️" },
];

export function PuntosToolbar() {
  const { activePuntoTool, setActivePuntoTool } = useMapaStore();

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-white/90 backdrop-blur border border-agro-accent/20 rounded-xl px-3 py-2 shadow-lg">
      <span className="text-agro-muted text-xs mr-2 whitespace-nowrap">Puntos:</span>
      {TOOLS.map((tool) => (
        <button
          key={tool.tipo}
          title={tool.label}
          onClick={() =>
            setActivePuntoTool(activePuntoTool === tool.tipo ? null : tool.tipo)
          }
          className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
            activePuntoTool === tool.tipo
              ? "bg-agro-primary ring-2 ring-agro-primary/50"
              : "hover:bg-agro-bg"
          }`}
        >
          {tool.emoji}
        </button>
      ))}
      {activePuntoTool && (
        <button
          onClick={() => setActivePuntoTool(null)}
          className="ml-2 text-agro-muted hover:text-agro-text text-xs px-2 py-1 rounded border border-agro-accent/20 hover:border-agro-accent/40 transition-colors"
        >
          ✕ Cancelar
        </button>
      )}
    </div>
  );
}
