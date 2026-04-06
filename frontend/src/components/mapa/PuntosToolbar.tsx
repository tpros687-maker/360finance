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
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 bg-slate-900/90 backdrop-blur border border-slate-700 rounded-xl px-3 py-2 shadow-lg">
      <span className="text-slate-400 text-xs mr-2 whitespace-nowrap">Puntos:</span>
      {TOOLS.map((tool) => (
        <button
          key={tool.tipo}
          title={tool.label}
          onClick={() =>
            setActivePuntoTool(activePuntoTool === tool.tipo ? null : tool.tipo)
          }
          className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
            activePuntoTool === tool.tipo
              ? "bg-emerald-600 ring-2 ring-emerald-400"
              : "hover:bg-slate-700"
          }`}
        >
          {tool.emoji}
        </button>
      ))}
      {activePuntoTool && (
        <button
          onClick={() => setActivePuntoTool(null)}
          className="ml-2 text-slate-400 hover:text-white text-xs px-2 py-1 rounded border border-slate-600 hover:border-slate-400 transition-colors"
        >
          ✕ Cancelar
        </button>
      )}
    </div>
  );
}
