import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { X, Plus, Trash2, ArrowRightLeft, Check, ChevronDown, ChevronUp, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMapaStore } from "@/store/mapaStore";
import { updatePotrero, deletePotrero, getMovimientosByPotrero } from "@/lib/potrerosApi";
import { getAnimales, createAnimal, deleteAnimal } from "@/lib/animalesApi";
import type { PotreroUpdate, AnimalCreate, EstadoPasto } from "@/types/mapa";
import { toast } from "@/hooks/useToast";

const ESTADO_COLORS: Record<EstadoPasto, string> = {
  bueno: "bg-green-500",
  regular: "bg-yellow-500",
  malo: "bg-red-500",
};

interface NuevaFila {
  especie: string;
  cantidad: number;
}

function diasDescanso(fecha: string): number {
  const from = new Date(fecha + "T00:00:00");
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
}

function formatFecha(fecha: string): string {
  return new Date(fecha + "T00:00:00").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function PanelLateral() {
  const {
    selectedPotreroId,
    potreros,
    panelOpen,
    setPanelOpen,
    selectPotrero,
    updatePotrero: storePotrero,
    removePotrero,
    setAnimalesForPotrero,
    addAnimalToPotrero,
    removeAnimalFromPotrero,
    animalesByPotrero,
    setModalMovimientoOpen,
  } = useMapaStore();

  const qc = useQueryClient();

  const potrero = potreros.find((p) => p.id === selectedPotreroId) ?? null;

  const [nuevasFilas, setNuevasFilas] = useState<NuevaFila[]>([]);
  const [historialExpanded, setHistorialExpanded] = useState(false);
  const [historialShowAll, setHistorialShowAll] = useState(false);
  const animales = selectedPotreroId ? (animalesByPotrero[selectedPotreroId] ?? []) : [];

  const { register, handleSubmit, reset, watch, setValue } = useForm<PotreroUpdate>({
    defaultValues: {
      nombre: potrero?.nombre ?? "",
      tipo: potrero?.tipo ?? "mixto",
      estado_pasto: potrero?.estado_pasto ?? "bueno",
      tiene_suplementacion: potrero?.tiene_suplementacion ?? false,
      suplementacion_detalle: potrero?.suplementacion_detalle ?? "",
      tiene_franjas: potrero?.tiene_franjas ?? false,
      cantidad_franjas: potrero?.cantidad_franjas ?? undefined,
      franjas_usadas: potrero?.franjas_usadas ?? undefined,
      observaciones: potrero?.observaciones ?? "",
    },
  });

  useEffect(() => {
    if (potrero) {
      reset({
        nombre: potrero.nombre,
        tipo: potrero.tipo,
        estado_pasto: potrero.estado_pasto,
        tiene_suplementacion: potrero.tiene_suplementacion,
        suplementacion_detalle: potrero.suplementacion_detalle ?? "",
        tiene_franjas: potrero.tiene_franjas,
        cantidad_franjas: potrero.cantidad_franjas ?? undefined,
        franjas_usadas: potrero.franjas_usadas ?? undefined,
        observaciones: potrero.observaciones ?? "",
      });
      setNuevasFilas([]);
      setHistorialExpanded(false);
      setHistorialShowAll(false);
    }
  }, [potrero, reset]);

  useQuery({
    queryKey: ["animales", selectedPotreroId],
    queryFn: async () => {
      if (!selectedPotreroId) return [];
      const data = await getAnimales(selectedPotreroId);
      setAnimalesForPotrero(selectedPotreroId, data);
      return data;
    },
    enabled: !!selectedPotreroId,
    staleTime: 0,
  });

  const { data: historialMovimientos = [] } = useQuery({
    queryKey: ["movimientos-potrero", selectedPotreroId],
    queryFn: () => getMovimientosByPotrero(selectedPotreroId!),
    enabled: !!selectedPotreroId && historialExpanded,
    staleTime: 30000,
  });

  const [isSaving, setIsSaving] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPotreroId) return;
      await deletePotrero(selectedPotreroId);
      removePotrero(selectedPotreroId);
      selectPotrero(null);
      qc.invalidateQueries({ queryKey: ["potreros"] });
    },
    onSuccess: () => toast({ title: "Potrero eliminado" }),
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  const addAnimalMutation = useMutation({
    mutationFn: async (data: AnimalCreate) => {
      if (!selectedPotreroId) return;
      const animal = await createAnimal(selectedPotreroId, data);
      addAnimalToPotrero(selectedPotreroId, animal);
    },
    onError: () => toast({ title: "Error al agregar animal", variant: "destructive" }),
  });

  const deleteAnimalMutation = useMutation({
    mutationFn: async (animalId: number) => {
      if (!selectedPotreroId) return;
      await deleteAnimal(animalId);
      removeAnimalFromPotrero(selectedPotreroId, animalId);
    },
    onError: () => toast({ title: "Error al eliminar animal", variant: "destructive" }),
  });

  const tieneSuplementacion = watch("tiene_suplementacion");
  const tieneFranjas = watch("tiene_franjas");

  const onSave = handleSubmit(async (data) => {
    if (!selectedPotreroId) return;
    setIsSaving(true);
    try {
      const updated = await updatePotrero(selectedPotreroId, {
        ...data,
        suplementacion_detalle: data.tiene_suplementacion ? data.suplementacion_detalle : null,
        cantidad_franjas: data.tiene_franjas ? data.cantidad_franjas : null,
        franjas_usadas: data.tiene_franjas ? data.franjas_usadas : null,
      });
      storePotrero(updated);

      const filasValidas = nuevasFilas.filter((f) => f.especie.trim() && f.cantidad >= 1);
      for (const fila of filasValidas) {
        const animal = await createAnimal(selectedPotreroId, {
          especie: fila.especie.trim(),
          cantidad: fila.cantidad,
        });
        addAnimalToPotrero(selectedPotreroId, animal);
      }
      setNuevasFilas([]);

      qc.invalidateQueries({ queryKey: ["potreros"] });
      qc.invalidateQueries({ queryKey: ["animales", selectedPotreroId] });
      toast({ title: "Potrero guardado" });
    } catch {
      toast({ title: "Error al guardar", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  });

  const agregarFila = () =>
    setNuevasFilas((f) => [...f, { especie: "", cantidad: 1 }]);

  const actualizarFila = (i: number, campo: keyof NuevaFila, valor: string | number) =>
    setNuevasFilas((f) => f.map((row, idx) => (idx === i ? { ...row, [campo]: valor } : row)));

  const eliminarFila = (i: number) =>
    setNuevasFilas((f) => f.filter((_, idx) => idx !== i));

  const confirmarFila = async (i: number) => {
    const fila = nuevasFilas[i];
    if (!fila.especie.trim() || fila.cantidad < 1) return;
    await addAnimalMutation.mutateAsync({ especie: fila.especie.trim(), cantidad: fila.cantidad });
    eliminarFila(i);
  };

  const totalAnimales = animales.reduce((s, a) => s + a.cantidad, 0);

  const movimientosToShow = historialShowAll
    ? historialMovimientos
    : historialMovimientos.slice(0, 10);

  if (!panelOpen || !potrero) return null;

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-white border-l border-agro-accent/20 flex flex-col z-10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-agro-accent/20 flex-shrink-0">
        <h2 className="text-agro-text font-semibold text-sm truncate">{potrero.nombre || "Nuevo potrero"}</h2>
        <button onClick={() => setPanelOpen(false)} className="text-agro-muted hover:text-agro-text">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

        {/* En descanso banner */}
        {potrero.en_descanso && (
          <div className="flex items-center gap-2 bg-agro-bg border border-agro-accent/20 rounded-md px-3 py-2">
            <span className="text-base leading-none">💤</span>
            <span className="text-agro-text text-xs font-medium">
              {potrero.fecha_descanso
                ? `En descanso hace ${diasDescanso(potrero.fecha_descanso)} día${diasDescanso(potrero.fecha_descanso) !== 1 ? "s" : ""}`
                : "En descanso"}
            </span>
          </div>
        )}

        {/* Hectáreas (read-only) */}
        {potrero.hectareas !== null && potrero.hectareas !== undefined && (
          <div className="flex items-center justify-between bg-agro-bg border border-agro-accent/20 rounded-md px-3 py-2">
            <span className="text-agro-muted text-xs">Superficie</span>
            <span className="text-agro-text text-sm font-semibold">
              {Number(potrero.hectareas).toLocaleString("es-AR", { maximumFractionDigits: 2 })} ha
            </span>
          </div>
        )}

        {/* Nombre */}
        <div>
          <Label className="text-agro-muted text-xs">Nombre</Label>
          <Input
            {...register("nombre")}
            className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text text-sm"
            placeholder="Ej: Potrero Norte"
          />
        </div>

        {/* Tipo */}
        <div>
          <Label className="text-agro-muted text-xs">Tipo</Label>
          <select
            {...register("tipo")}
            className="mt-1 w-full bg-agro-bg border border-agro-accent/20 text-agro-text text-sm rounded-md px-3 py-2"
          >
            <option value="agricultura">Agricultura</option>
            <option value="ganaderia">Ganadería</option>
            <option value="mixto">Mixto</option>
          </select>
        </div>

        {/* Estado del pasto */}
        <div>
          <Label className="text-agro-muted text-xs">Estado del pasto</Label>
          <div className="mt-1 flex gap-2">
            {(["bueno", "regular", "malo"] as EstadoPasto[]).map((est) => {
              const val = watch("estado_pasto");
              return (
                <button
                  key={est}
                  type="button"
                  onClick={() => setValue("estado_pasto", est)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                    val === est
                      ? "border-agro-primary text-agro-text bg-agro-bg"
                      : "border-agro-accent/20 text-agro-muted hover:border-agro-accent/40"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${ESTADO_COLORS[est]}`} />
                  {est.charAt(0).toUpperCase() + est.slice(1)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Suplementación */}
        <div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="tiene_suplementacion"
              {...register("tiene_suplementacion")}
              className="accent-emerald-500"
            />
            <Label htmlFor="tiene_suplementacion" className="text-agro-muted text-xs cursor-pointer">
              Suplementación activa
            </Label>
          </div>
          {tieneSuplementacion && (
            <Input
              {...register("suplementacion_detalle")}
              className="mt-2 bg-agro-bg border-agro-accent/20 text-agro-text text-sm"
              placeholder="Detalle de suplementación..."
            />
          )}
        </div>

        {/* Franjas */}
        <div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="tiene_franjas"
              {...register("tiene_franjas")}
              className="accent-emerald-500"
            />
            <Label htmlFor="tiene_franjas" className="text-agro-muted text-xs cursor-pointer">
              Gestión por franjas
            </Label>
          </div>
          {tieneFranjas && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div>
                <Label className="text-agro-muted text-xs">Total</Label>
                <Input
                  type="number"
                  {...register("cantidad_franjas", { valueAsNumber: true })}
                  className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text text-sm"
                  placeholder="0"
                  min={0}
                />
              </div>
              <div>
                <Label className="text-agro-muted text-xs">Usadas</Label>
                <Input
                  type="number"
                  {...register("franjas_usadas", { valueAsNumber: true })}
                  className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text text-sm"
                  placeholder="0"
                  min={0}
                />
              </div>
            </div>
          )}
        </div>

        {/* Animales */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-agro-muted text-xs">
              Animales
              {totalAnimales > 0 && (
                <span className="ml-1.5 text-agro-muted/60">({totalAnimales} total)</span>
              )}
            </Label>
            <button
              type="button"
              onClick={agregarFila}
              className="text-emerald-400 hover:text-emerald-300 text-xs flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              Agregar
            </button>
          </div>

          <div className="space-y-1">
            {animales.length === 0 && nuevasFilas.length === 0 && (
              <p className="text-agro-muted text-xs italic">Sin animales registrados</p>
            )}
            {animales.map((a) => (
              <div
                key={a.id}
                className="grid grid-cols-[1fr_56px_28px] items-center gap-1.5 bg-agro-bg rounded-md px-2 py-1.5"
              >
                <span className="text-agro-text text-xs truncate">{a.especie}</span>
                <span className="text-agro-muted text-xs text-right">{a.cantidad} cab.</span>
                <button
                  type="button"
                  onClick={() => deleteAnimalMutation.mutate(a.id)}
                  className="flex items-center justify-center text-agro-muted hover:text-red-400"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}

            {nuevasFilas.map((fila, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_64px_28px_28px] items-center gap-1.5 bg-agro-bg border border-emerald-700/40 rounded-md px-2 py-1.5"
              >
                <input
                  type="text"
                  value={fila.especie}
                  onChange={(e) => actualizarFila(i, "especie", e.target.value)}
                  placeholder="Ej: Vacas, Toros..."
                  className="bg-transparent text-agro-text text-xs outline-none placeholder-agro-muted/50 w-full"
                  autoFocus={i === nuevasFilas.length - 1}
                />
                <input
                  type="number"
                  value={fila.cantidad}
                  min={1}
                  onChange={(e) => actualizarFila(i, "cantidad", Number(e.target.value))}
                  className="bg-agro-bg border border-agro-accent/20 text-agro-text text-xs rounded px-1.5 py-0.5 w-full text-right outline-none"
                />
                <button
                  type="button"
                  onClick={() => confirmarFila(i)}
                  disabled={!fila.especie.trim() || addAnimalMutation.isPending}
                  className="flex items-center justify-center text-emerald-400 hover:text-emerald-300 disabled:opacity-30"
                  title="Confirmar"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => eliminarFila(i)}
                  className="flex items-center justify-center text-agro-muted hover:text-red-400"
                  title="Cancelar"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}

            {totalAnimales > 0 && (
              <div className="flex justify-end pt-1">
                <span className="text-xs text-agro-muted font-medium">
                  Total: <span className="text-agro-text">{totalAnimales}</span> animales
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Observaciones */}
        <div>
          <Label className="text-agro-muted text-xs">Observaciones</Label>
          <textarea
            {...register("observaciones")}
            rows={3}
            className="mt-1 w-full bg-agro-bg border border-agro-accent/20 text-agro-text text-sm rounded-md px-3 py-2 resize-none"
            placeholder="Notas adicionales..."
          />
        </div>

        {/* ── Historial de movimientos ───────────────────────────────────── */}
        <div className="border border-agro-accent/20 rounded-md overflow-hidden">
          <button
            type="button"
            onClick={() => setHistorialExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-agro-bg hover:bg-agro-bg/80 transition-colors text-left"
          >
            <span className="text-agro-muted text-xs font-medium">Historial de movimientos</span>
            {historialExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-agro-muted" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-agro-muted" />
            )}
          </button>

          {historialExpanded && (
            <div className="divide-y divide-agro-accent/10">
              {historialMovimientos.length === 0 ? (
                <p className="text-agro-muted text-xs italic px-3 py-3">
                  Sin movimientos registrados
                </p>
              ) : (
                <>
                  {movimientosToShow.map((mov) => {
                    const esSalida = mov.potrero_origen_id === selectedPotreroId;
                    const contraparte = esSalida
                      ? mov.potrero_destino_nombre
                      : mov.potrero_origen_nombre;
                    const fecha = mov.fecha_ejecutada ?? mov.fecha_programada;
                    return (
                      <div
                        key={mov.id}
                        className="flex items-start gap-2 px-3 py-2 text-xs"
                      >
                        {/* Dirección */}
                        <span
                          className={`mt-0.5 shrink-0 ${esSalida ? "text-red-400" : "text-emerald-400"}`}
                          title={esSalida ? "Salida" : "Entrada"}
                        >
                          {esSalida ? (
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          ) : (
                            <ArrowDownLeft className="w-3.5 h-3.5" />
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-agro-text font-medium truncate">
                              {mov.cantidad} {mov.especie}
                            </span>
                            <span className="text-agro-muted text-[10px] shrink-0">
                              {formatFecha(fecha)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span
                              className={`text-[10px] px-1.5 rounded-full ${
                                mov.estado === "ejecutado"
                                  ? "bg-emerald-500/15 text-emerald-400"
                                  : mov.estado === "programado"
                                  ? "bg-yellow-500/15 text-yellow-400"
                                  : "bg-agro-muted/10 text-agro-muted"
                              }`}
                            >
                              {mov.estado}
                            </span>
                            <span className="text-agro-muted text-[10px] truncate">
                              {esSalida ? "→" : "←"} {contraparte}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {historialMovimientos.length > 10 && !historialShowAll && (
                    <button
                      type="button"
                      onClick={() => setHistorialShowAll(true)}
                      className="w-full px-3 py-2 text-xs text-agro-primary hover:text-agro-primary/80 hover:bg-agro-bg transition-colors text-left"
                    >
                      Ver todos ({historialMovimientos.length} movimientos)
                    </button>
                  )}
                  {historialShowAll && historialMovimientos.length > 10 && (
                    <button
                      type="button"
                      onClick={() => setHistorialShowAll(false)}
                      className="w-full px-3 py-2 text-xs text-agro-muted hover:text-agro-text hover:bg-agro-bg transition-colors text-left"
                    >
                      Mostrar menos
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-agro-accent/20 flex flex-col gap-2 flex-shrink-0">
        <Button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm"
        >
          {isSaving ? "Guardando..." : "Guardar"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setModalMovimientoOpen(true)}
          className="w-full border-agro-accent/20 text-agro-muted hover:bg-agro-bg text-sm"
        >
          <ArrowRightLeft className="w-4 h-4 mr-2" />
          Programar movimiento
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={() => {
            if (confirm("¿Eliminar este potrero y todos sus datos?")) {
              deleteMutation.mutate();
            }
          }}
          disabled={deleteMutation.isPending}
          className="w-full text-sm"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Eliminar potrero
        </Button>
      </div>
    </div>
  );
}
