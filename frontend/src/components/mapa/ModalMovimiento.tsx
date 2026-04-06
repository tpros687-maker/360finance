import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMapaStore } from "@/store/mapaStore";
import { createMovimiento } from "@/lib/movimientosApi";
import type { MovimientoCreate, EspecieAnimal } from "@/types/mapa";
import { toast } from "@/hooks/useToast";

const today = () => new Date().toISOString().split("T")[0];

interface FormData {
  potrero_destino_id: number;
  especie: EspecieAnimal;
  cantidad: number;
  ejecutar_ahora: boolean;
  fecha_programada: string;
  notas: string;
}

export function ModalMovimiento() {
  const {
    modalMovimientoOpen,
    setModalMovimientoOpen,
    selectedPotreroId,
    potreros,
    addMovimiento,
  } = useMapaStore();
  const qc = useQueryClient();

  const { register, handleSubmit, watch, reset } = useForm<FormData>({
    defaultValues: {
      especie: "bovino",
      cantidad: 1,
      ejecutar_ahora: false,
      fecha_programada: today(),
      notas: "",
    },
  });

  const ejecutarAhora = watch("ejecutar_ahora");

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (!selectedPotreroId) return;
      const payload: MovimientoCreate = {
        potrero_origen_id: selectedPotreroId,
        potrero_destino_id: Number(data.potrero_destino_id),
        especie: data.especie,
        cantidad: Number(data.cantidad),
        fecha_programada: data.ejecutar_ahora ? today() : data.fecha_programada,
        ejecutar_ahora: data.ejecutar_ahora,
        notas: data.notas || undefined,
      };
      const mov = await createMovimiento(payload);
      addMovimiento(mov);
      qc.invalidateQueries({ queryKey: ["movimientos"] });
      return mov;
    },
    onSuccess: () => {
      toast({ title: "Movimiento registrado" });
      reset();
      setModalMovimientoOpen(false);
    },
    onError: () => toast({ title: "Error al registrar movimiento", variant: "destructive" }),
  });

  if (!modalMovimientoOpen) return null;

  const otrosPotreros = potreros.filter((p) => p.id !== selectedPotreroId);
  const origenNombre = potreros.find((p) => p.id === selectedPotreroId)?.nombre ?? "—";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-slate-700">
          <h2 className="text-white font-semibold">Movimiento de ganado</h2>
          <p className="text-slate-400 text-sm mt-1">Desde: {origenNombre}</p>
        </div>

        <form
          onSubmit={handleSubmit((d) => mutation.mutate(d))}
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
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Especie y cantidad */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300 text-xs">Especie</Label>
              <select
                {...register("especie")}
                className="mt-1 w-full bg-slate-800 border border-slate-600 text-white text-sm rounded-md px-3 py-2"
              >
                <option value="bovino">Bovino</option>
                <option value="ovino">Ovino</option>
                <option value="equino">Equino</option>
                <option value="porcino">Porcino</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Cantidad</Label>
              <Input
                type="number"
                {...register("cantidad", { min: 1, valueAsNumber: true })}
                className="mt-1 bg-slate-800 border-slate-600 text-white text-sm"
                min={1}
              />
            </div>
          </div>

          {/* Fecha / ahora */}
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
              onClick={() => { reset(); setModalMovimientoOpen(false); }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {mutation.isPending ? "Registrando..." : "Confirmar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
