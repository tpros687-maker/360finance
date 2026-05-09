import { useEffect, useRef, useState } from "react";

export interface Referencias {
  bajo: number;
  medio: number;
  alto: number;
}

interface Props {
  valor_usd_ha: number | null | undefined;
  actividad: string;
  referencias: Referencias;
  size?: "sm" | "md";
}

type Color = "verde" | "amarillo" | "rojo" | "gris";

function getColor(valor: number | null | undefined, refs: Referencias): Color {
  if (valor == null) return "gris";
  if (valor >= refs.alto) return "verde";
  if (valor >= refs.bajo) return "amarillo";
  return "rojo";
}

const colorClasses: Record<Color, string> = {
  verde:    "bg-emerald-500 shadow-emerald-500/40",
  amarillo: "bg-yellow-400 shadow-yellow-400/40",
  rojo:     "bg-red-500 shadow-red-500/40",
  gris:     "bg-slate-600 shadow-none",
};

const colorLabel: Record<Color, string> = {
  verde:    "Por encima del umbral alto",
  amarillo: "Entre umbral bajo y alto",
  rojo:     "Por debajo del umbral mínimo",
  gris:     "Sin datos",
};

function fmt(n: number): string {
  return n.toLocaleString("es-UY", { maximumFractionDigits: 0 });
}

export function Semaforo({ valor_usd_ha, actividad, referencias, size = "md" }: Props) {
  const color = getColor(valor_usd_ha, referencias);
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close tooltip when clicking outside (mobile tap-away)
  useEffect(() => {
    if (!visible) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setVisible(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [visible]);

  const dotSize = size === "sm" ? "h-2.5 w-2.5" : "h-3.5 w-3.5";

  const tooltipLines: string[] = [];
  if (valor_usd_ha != null) {
    tooltipLines.push(`Tu potrero: USD ${fmt(valor_usd_ha)}/ha`);
  }
  tooltipLines.push(`Ref. baja: USD ${fmt(referencias.bajo)}/ha`);
  tooltipLines.push(`Ref. media: USD ${fmt(referencias.medio)}/ha`);
  tooltipLines.push(`Ref. alta: USD ${fmt(referencias.alto)}/ha`);
  tooltipLines.push(colorLabel[color]);

  return (
    <div ref={ref} className="relative inline-flex items-center">
      <button
        type="button"
        aria-label={`Semáforo rentabilidad ${actividad}: ${colorLabel[color]}`}
        className={`rounded-full shadow-md transition-transform active:scale-90 ${dotSize} ${colorClasses[color]}`}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={() => setVisible((v) => !v)}
      />

      {visible && (
        <div
          role="tooltip"
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 shadow-xl text-xs text-slate-200 space-y-1 pointer-events-none"
        >
          {tooltipLines.map((line, i) => (
            <p
              key={i}
              className={
                i === 0
                  ? "font-semibold text-white"
                  : i === tooltipLines.length - 1
                  ? `mt-1 font-medium ${
                      color === "verde"
                        ? "text-emerald-400"
                        : color === "amarillo"
                        ? "text-yellow-400"
                        : color === "rojo"
                        ? "text-red-400"
                        : "text-slate-400"
                    }`
                  : "text-slate-400"
              }
            >
              {line}
            </p>
          ))}
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-700" />
        </div>
      )}
    </div>
  );
}
