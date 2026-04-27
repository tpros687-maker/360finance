import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMapaStore } from "@/store/mapaStore";
import { createMovimiento } from "@/lib/movimientosApi";
import type { MovimientoCreate } from "@/types/mapa";
import { toast } from "@/hooks/useToast";

const today = () => new Date().toISOString().split("T")[0];

const ESPECIE_ENUM: Record<string, string> = {
  bovino: "bovino", bovinos: "bovino",
  ternero: "bovino", terneros: "bovino",
  ternera: "bovino", terneras: "bovino",
  novillo: "bovino", novillos: "bovino",
  vaquillona: "bovino", vaquillonas: "bovino",
  vaca: "bovino", vacas: "bovino",
  toro: "bovino", toros: "bovino",
  ovino: "ovino", ovinos: "ovino",
  oveja: "ovino", ovejas: "ovino",
  equino: "equino", equinos: "equino",
  caballo: "equino", caballos: "equino",
  yegua: "equino", yeguas: "equino",
  porcino: "porcino", porcinos: "porcino",
  cerdo: "porcino", cerdos: "porcino",
  chancho: "porcino", chanchos: "porcino",
};

function toEspecieEnum(especie: string): string {
  return ESPECIE_ENUM[especie.toLowerCase().trim()] ?? "otro";
}

interface BaseForm {
  potrero_destino_id: number;
  ejecutar_ahora: boolean;
  fecha_programada: string;
  notas: string;
}

interface FilaAnimal {
  especie: string;
  cantidadMax: number;
  cantidad: number;
  checked: boolean;
}

export function ModalMovimiento() {
  const {
    modalMovimientoOpen,
    setModalMovimientoOpen,
    selectedPotreroId,
    potreros,
    animalesByPotrero,
    addMovimiento,
  } = useMapaStore();
  const qc = useQueryClient();

  const animalesOrigen: FilaAnimal[] = selectedPotreroId
    ? (animalesByPotrero[selectedPotreroId] ?? []).map((a) => ({
        especie: a.especie,
        cantidadMax: a.cantidad,
        cantidad: a.cantidad,
        checked: true,
      }))
    : [];

  const [filas, setFilas] = useState<FilaAnimal[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, watch, reset } = useForm<BaseForm>({
    defaultValues: {
      potrero_destino_id: 0,
      ejecutar_ahora: false,
      fecha_programada: today(),
      notas: "",
    },
  });

  const ejecutarAhora = watch("ejecutar_ahora");

  // Sync filas when modal opens
  if (modalMovimientoOpen && filas.length === 0 && animalesOrigen.length > 0) {
    setFilas(animalesOrigen);
  }

  const mutation = useMutation({
    mutationFn: async (base: BaseForm) => {
      if (!selectedPotreroId) return;
      const seleccionadas = filas.filter((f) => f.checked && f.cantidad >= 1);
      if (seleccionadas.length === 0) throw new Error("Seleccioná al menos un grupo de animales");

      for (const fila of seleccionadas) {
        const payload: MovimientoCreate = {
          potrero_origen_id: selectedPotreroId,
          potrero_destino_id: Number(base.potrero_destino_id),
          especie: toEspecieEnum(fila.especie),
          cantidad: fila.cantidad,
          fecha_programada: base.ejecutar_ahora ? today() : base.fecha_programada,
          ejecutar_ahora: base.ejecutar_ahora,
          notas: base.notas || undefined,
        };
        const mov = await createMovimiento(payload);
        addMovimiento(mov);
      }
    },
    onSuccess: () => {
      toast({ title: "Movimiento registrado" });
      qc.invalidateQueries({ queryKey: ["movimientos"] });
      qc.invalidateQueries({ queryKey: ["potreros"] });
      qc.invalidateQueries({ queryKey: ["animales"] });
      reset();
      setFilas([]);
      setModalMovimientoOpen(false);
    },
    onError: (e: Error) => toast({ title: e.message || "Error al registrar movimiento", variant: "destructive" }),
  });

  function cerrar() {
    reset();
    setFilas([]);
    setModalMovimientoOpen(false);
  }

  function toggleFila(i: number) {
    setFilas((prev) => prev.map((f, idx) => idx === i ? { ...f, checked: !f.checked } : f));
  }

  function setCantidad(i: number, val: number) {
    setFilas((prev) => prev.map((f, idx) =>
      idx === i ? { ...f, cantidad: Math.min(Math.max(1, val), f.cantidadMax) } : f
    ));
  }

  if (!modalMovimientoOpen) return null;

  const otrosPotreros = potreros.filter((p) => p.id !== selectedPotreroId);
  const origenNombre = potreros.find((p) => p.id === selectedPotreroId)?.nombre ?? "—";
  const seleccionadas = filas.filter((f) => f.checked && f.cantidad >= 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-slate-700">
          <h2 className="text-white font-semibold">Movimiento de ganado</h2>
          <p className="text-slate-400 text-sm mt-1">Desde: <span className="text-white">{origenNombre}</span></p>
        </div>

        <form
          onSubmit={handleSubmit((d) => {
            setSubmitting(true);
            mutation.mutate(d);
          })}
          className="px-6 py-4 space-y-4"
        >
          {/* Destino */}
          <div>
            <Label className="text-slate-300 text-xs">Potrero destino</Label>
            <select
              {...register("potrero_destino_id", { required: true })}
              className="mt-1 w-full bg-slate-800 border border-slate-600 text-white text-sm rounded-md px-3 py-2"
            >
              <option value="">Seleccioná un potrero...</option>
              {otrosPotreros.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>

          {/* Animales a mover */}
          <div>
            <Label className="text-slate-300 text-xs">Animales a mover</Label>
            {filas.length === 0 ? (
              <p className="mt-2 text-slate-500 text-xs italic">
                Sin animales registrados en este potrero.
              </p>
            ) : (
              <div className="mt-2 space-y-1.5">
                {filas.map((fila, i) => (
                  <div
                    key={fila.especie}
                    className={`grid grid-cols-[20px_1fr_90px] items-center gap-2 rounded-md px-2.5 py-2 border transition-colors ${
                      fila.checked
                        ? "bg-slate-800 border-emerald-700/50"
                        : "bg-slate-800/40 border-slate-700/40 opacity-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={fila.checked}
                      onChange={() => toggleFila(i)}
                      className="accent-emerald-500"
                    />
                    <span className="text-white text-sm">{fila.especie}</span>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        value={fila.cantidad}
                        min={1}
                        max={fila.cantidadMax}
                        disabled={!fila.checked}
                        onChange={(e) => setCantidad(i, Number(e.target.value))}
                        className="w-16 bg-slate-700 border border-slate-600 text-white text-xs rounded px-2 py-1 text-right disabled:opacity-40"
                      />
                      <span className="text-slate-500 text-xs">cab.</span>
                    </div>
                  </div>
                ))}
                <p className="text-slate-500 text-[11px] pt-0.5">
                  {seleccionadas.length} grupo{seleccionadas.length !== 1 ? "s" : ""} seleccionado{seleccionadas.length !== 1 ? "s" : ""} —{" "}
                  {seleccionadas.reduce((s, f) => s + f.cantidad, 0)} cabezas en total
                </p>
              </div>
            )}
          </div>

          {/* Ejecutar ahora / fecha */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                id="ejecutar_ahora"
                {...register("ejecutar_ahora")}
                className="accent-emerald-500"
              />
              <Label htmlFor="ejecutar_ahora" className="text-slate-300 text-xs cursor-pointer">
                Ejecutar ahora
              </Label>
            </div>
            {!ejecutarAhora && (
              <div>
                <Label className="text-slate-300 text-xs">Fecha programada</Label>
                <Input
                  type="date"
                  {...register("fecha_programada")}
                  className="mt-1 bg-slate-800 border-slate-600 text-white text-sm"
                />
              </div>
            )}
          </div>

          {/* Notas */}
          <div>
            <Label className="text-slate-300 text-xs">Notas (opcional)</Label>
            <textarea
              {...register("notas")}
              rows={2}
              className="mt-1 w-full bg-slate-800 border border-slate-600 text-white text-sm rounded-md px-3 py-2 resize-none"
              placeholder="Observaciones del movimiento..."
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-800"
              onClick={cerrar}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || submitting || seleccionadas.length === 0}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {mutation.isPending ? "Registrando..." : `Mover ${seleccionadas.reduce((s, f) => s + f.cantidad, 0)} cab.`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
