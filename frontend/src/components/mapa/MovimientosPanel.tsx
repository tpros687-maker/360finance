import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, CheckCircle, XCircle, ChevronDown } from "lucide-react";
import { useState } from "react";

import { useMapaStore } from "@/store/mapaStore";
import { ejecutarMovimiento, deleteMovimiento } from "@/lib/movimientosApi";
import { getAnimales } from "@/lib/animalesApi";
import { getPotreros } from "@/lib/potrerosApi";
import { toast } from "@/hooks/useToast";
import type { EstadoMovimiento } from "@/types/mapa";

const ESTADO_BADGE: Record<EstadoMovimiento, string> = {
  programado: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  ejecutado: "bg-green-500/20 text-green-400 border-green-500/30",
  cancelado: "bg-agro-muted/10 text-agro-muted border-agro-muted/30",
};

export function MovimientosPanel() {
  const {
    movimientosPanelOpen,
    setMovimientosPanelOpen,
    movimientos,
    updateMovimiento,
    setAnimalesForPotrero,
    setPotreros,
  } = useMapaStore();
  const qc = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);

  const ejecutarMutation = useMutation({
    mutationFn: async (id: number) => {
      const mov = await ejecutarMovimiento(id);
      updateMovimiento(mov);
      qc.invalidateQueries({ queryKey: ["movimientos"] });
      const [animalesOrigen, animalesDestino] = await Promise.all([
        getAnimales(mov.potrero_origen_id),
        getAnimales(mov.potrero_destino_id),
      ]);
      setAnimalesForPotrero(mov.potrero_origen_id, animalesOrigen);
      setAnimalesForPotrero(mov.potrero_destino_id, animalesDestino);
      qc.invalidateQueries({ queryKey: ["animales", mov.potrero_origen_id] });
      qc.invalidateQueries({ queryKey: ["animales", mov.potrero_destino_id] });
      const updatedPotreros = await getPotreros();
      setPotreros(updatedPotreros);
      qc.invalidateQueries({ queryKey: ["potreros"] });
    },
    onSuccess: () => toast({ title: "Movimiento ejecutado" }),
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const cancelarMutation = useMutation({
    mutationFn: async (id: number) => {
      await deleteMovimiento(id);
      qc.invalidateQueries({ queryKey: ["movimientos"] });
    },
    onSuccess: () => toast({ title: "Movimiento cancelado" }),
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  if (!movimientosPanelOpen) return null;

  const programados = movimientos.filter((m) => m.estado === "programado");

  return (
    <div className="absolute bottom-16 left-4 z-10 w-72 bg-white/95 backdrop-blur border border-agro-accent/20 rounded-xl shadow-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-agro-accent/20">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-2 text-agro-text font-semibold text-sm"
        >
          Movimientos programados
          <span className="bg-yellow-500 text-black text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
            {programados.length}
          </span>
          <ChevronDown className={`w-4 h-4 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
        </button>
        <button onClick={() => setMovimientosPanelOpen(false)} className="text-agro-muted hover:text-agro-text">
          <X className="w-4 h-4" />
        </button>
      </div>

      {!collapsed && (
        <div className="max-h-80 overflow-y-auto">
          {programados.length === 0 ? (
            <p className="text-agro-muted text-xs text-center py-6">Sin movimientos programados</p>
          ) : (
            programados.map((mov) => (
              <div key={mov.id} className="px-4 py-3 border-b border-agro-accent/20 last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-agro-text text-xs font-medium truncate">
                      {mov.potrero_origen_nombre} → {mov.potrero_destino_nombre}
                    </p>
                    <p className="text-agro-muted text-xs mt-0.5">
                      {mov.cantidad} {mov.especie} · {mov.fecha_programada}
                    </p>
                    {mov.notas && (
                      <p className="text-agro-muted text-xs mt-0.5 italic truncate">{mov.notas}</p>
                    )}
                  </div>
                  <span
                    className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full border ${ESTADO_BADGE[mov.estado]}`}
                  >
                    {mov.estado}
                  </span>
                </div>
                {mov.estado === "programado" && (
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => ejecutarMutation.mutate(mov.id)}
                      disabled={ejecutarMutation.isPending}
                      className="flex items-center gap-1 text-green-400 hover:text-green-300 text-xs"
                    >
                      <CheckCircle className="w-3 h-3" />
                      Ejecutar
                    </button>
                    <button
                      onClick={() => cancelarMutation.mutate(mov.id)}
                      disabled={cancelarMutation.isPending}
                      className="flex items-center gap-1 text-red-400 hover:text-red-300 text-xs"
                    >
                      <XCircle className="w-3 h-3" />
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
