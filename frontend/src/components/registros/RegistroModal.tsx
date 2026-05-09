import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Paperclip, Plus, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { getCategorias, createCategoria } from "@/lib/categoriasApi";
import { createRegistro, updateRegistro, uploadComprobante } from "@/lib/registrosApi";
import { getPotreros } from "@/lib/potrerosApi";
import { getLotes, getCiclos } from "@/lib/produccionApi";
import { sugerirImputacion } from "@/lib/rentabilidadApi";
import { toast } from "@/hooks/useToast";
import { parseApiError } from "@/lib/authApi";
import type { Registro, TipoMovimiento } from "@/types/registros";

const schema = z.object({
  tipo: z.enum(["gasto", "ingreso"]),
  categoria_id: z.coerce.number().min(1, "Seleccioná una categoría"),
  monto: z.coerce.number().positive("El monto debe ser mayor a 0"),
  moneda: z.enum(["UYU", "USD"]).default("UYU"),
  fecha: z.string().min(1, "Seleccioná una fecha"),
  descripcion: z.string().optional(),
  potrero_id: z.coerce.number().optional().nullable(),
  tipo_imputacion: z.string().optional().nullable(),
  actividad_tipo: z.string().optional().nullable(),
  actividad_id: z.coerce.number().optional().nullable(),
});

type FormValues = z.infer<typeof schema>;

interface SugerenciaRaw {
  tipo_imputacion: string;
  actividad_tipo: string | null;
  actividad_id: number | null;
}

type Confianza = "alta" | "media" | "baja";

function calcConfianza(s: SugerenciaRaw): Confianza {
  if (s.tipo_imputacion === "prorrateo" || s.tipo_imputacion === "estructural") return "alta";
  if (s.tipo_imputacion === "directo" && s.actividad_id != null) return "alta";
  if (s.tipo_imputacion === "directo" && s.actividad_tipo != null) return "media";
  return "baja";
}

function nombreImputacion(s: SugerenciaRaw): string {
  if (s.tipo_imputacion === "prorrateo") return "todos los potreros (prorrateo por ha)";
  if (s.tipo_imputacion === "estructural") return "establecimiento (gasto estructural)";
  if (s.tipo_imputacion === "directo") {
    if (s.actividad_tipo === "lote")
      return s.actividad_id != null ? `Lote #${s.actividad_id}` : "un lote de ganado";
    if (s.actividad_tipo === "ciclo")
      return s.actividad_id != null ? `Ciclo #${s.actividad_id}` : "un ciclo agrícola";
    return "el potrero seleccionado";
  }
  return s.tipo_imputacion;
}

interface Props {
  open: boolean;
  onClose: () => void;
  registro?: Registro | null;
  defaultTipo?: TipoMovimiento;
}

export function RegistroModal({ open, onClose, registro, defaultTipo = "gasto" }: Props) {
  const queryClient = useQueryClient();
  const isEdit = !!registro;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showNewCategoria, setShowNewCategoria] = useState(false);
  const [newCatNombre, setNewCatNombre] = useState("");
  const [newCatColor, setNewCatColor] = useState("#22c55e");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Imputación state
  const [sugerencia, setSugerencia] = useState<SugerenciaRaw | null>(null);
  const [sugerenciaLoading, setSugerenciaLoading] = useState(false);
  const [imputacionAceptada, setImputacionAceptada] = useState(false);
  const [mostrarManual, setMostrarManual] = useState(false);
  const [manualTipo, setManualTipo] = useState("directo");
  const [manualPotreroId, setManualPotreroId] = useState<number | null>(null);
  const [manualActividadTipo, setManualActividadTipo] = useState<"lote" | "ciclo" | "">("");
  const [manualActividadId, setManualActividadId] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo: defaultTipo,
      fecha: new Date().toISOString().split("T")[0],
    },
  });

  const tipo = watch("tipo");
  const moneda = watch("moneda");
  const categoriaId = watch("categoria_id");
  const fecha = watch("fecha");

  // Fetch suggestion when categoria + fecha change (gastos only)
  useEffect(() => {
    if (tipo !== "gasto" || !categoriaId || categoriaId < 1 || !fecha) {
      setSugerencia(null);
      setImputacionAceptada(false);
      setMostrarManual(false);
      return;
    }
    let cancelled = false;
    setSugerenciaLoading(true);
    setSugerencia(null);
    setImputacionAceptada(false);
    setMostrarManual(false);
    sugerirImputacion({ categoria_id: Number(categoriaId), fecha })
      .then((res) => {
        if (cancelled) return;
        if (res) {
          const raw: SugerenciaRaw = {
            tipo_imputacion: res.tipo_imputacion,
            actividad_tipo: res.actividad_tipo,
            actividad_id: res.actividad_id,
          };
          setSugerencia(raw);
          const conf = calcConfianza(raw);
          if (conf === "alta") {
            // Auto-accept high-confidence suggestions
            applyImputacion(raw);
            setImputacionAceptada(true);
          }
        } else {
          setMostrarManual(true);
        }
      })
      .catch(() => {
        if (!cancelled) setMostrarManual(true);
      })
      .finally(() => {
        if (!cancelled) setSugerenciaLoading(false);
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaId, fecha, tipo]);

  function applyImputacion(s: SugerenciaRaw) {
    setValue("tipo_imputacion", s.tipo_imputacion);
    setValue("actividad_tipo", s.actividad_tipo ?? null);
    setValue("actividad_id", s.actividad_id ?? null);
  }

  function applyManual() {
    setValue("tipo_imputacion", manualTipo);
    if (manualTipo === "directo") {
      setValue("actividad_tipo", manualActividadTipo || null);
      setValue("actividad_id", manualActividadId ?? null);
    } else {
      setValue("actividad_tipo", null);
      setValue("actividad_id", null);
    }
    setImputacionAceptada(true);
    setMostrarManual(false);
  }

  useEffect(() => {
    if (registro) {
      reset({
        tipo: registro.tipo,
        categoria_id: registro.categoria_id,
        monto: parseFloat(registro.monto),
        moneda: (registro.moneda as "UYU" | "USD") ?? "UYU",
        fecha: registro.fecha,
        descripcion: registro.descripcion ?? "",
        potrero_id: registro.potrero_id ?? null,
        tipo_imputacion: (registro as any).tipo_imputacion ?? null,
        actividad_tipo: (registro as any).actividad_tipo ?? null,
        actividad_id: (registro as any).actividad_id ?? null,
      });
      if ((registro as any).tipo_imputacion) setImputacionAceptada(true);
    } else {
      reset({
        tipo: defaultTipo,
        categoria_id: undefined,
        monto: undefined,
        moneda: "UYU",
        fecha: new Date().toISOString().split("T")[0],
        descripcion: "",
        potrero_id: null,
        tipo_imputacion: null,
        actividad_tipo: null,
        actividad_id: null,
      });
      setSugerencia(null);
      setImputacionAceptada(false);
      setMostrarManual(false);
    }
    setShowNewCategoria(false);
    setPendingFile(null);
    setPreviewUrl(registro?.comprobante_url ?? null);
  }, [registro, open, defaultTipo, reset]);

  const { data: categorias = [] } = useQuery({
    queryKey: ["categorias"],
    queryFn: getCategorias,
  });

  const { data: potreros = [] } = useQuery({
    queryKey: ["potreros"],
    queryFn: getPotreros,
  });

  const { data: lotes = [] } = useQuery({
    queryKey: ["lotes", manualPotreroId],
    queryFn: () => getLotes(manualPotreroId!),
    enabled: !!manualPotreroId && mostrarManual && manualActividadTipo === "lote",
  });

  const { data: ciclos = [] } = useQuery({
    queryKey: ["ciclos", manualPotreroId],
    queryFn: () => getCiclos(manualPotreroId!),
    enabled: !!manualPotreroId && mostrarManual && manualActividadTipo === "ciclo",
  });

  const filteredCategorias = categorias.filter((c) => c.tipo === tipo);

  const saveMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const payload = {
        categoria_id: data.categoria_id,
        tipo: data.tipo,
        monto: data.monto,
        moneda: data.moneda,
        fecha: data.fecha,
        descripcion: data.descripcion || undefined,
        potrero_id: data.potrero_id || null,
        tipo_imputacion: data.tipo_imputacion || null,
        actividad_tipo: data.actividad_tipo || null,
        actividad_id: data.actividad_id || null,
      };
      const saved = isEdit
        ? await updateRegistro(registro!.id, payload)
        : await createRegistro(payload);

      if (pendingFile) {
        return await uploadComprobante(saved.id, pendingFile);
      }
      return saved;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registros"] });
      queryClient.invalidateQueries({ queryKey: ["resumen"] });
      toast({ title: isEdit ? "Registro actualizado" : "Registro creado" });
      onClose();
    },
    onError: (err) => {
      toast({ title: "Error", description: parseApiError(err), variant: "destructive" });
    },
  });

  const newCatMutation = useMutation({
    mutationFn: () =>
      createCategoria({ nombre: newCatNombre.trim(), tipo, color: newCatColor }),
    onSuccess: (cat) => {
      queryClient.invalidateQueries({ queryKey: ["categorias"] });
      setValue("categoria_id", cat.id);
      setShowNewCategoria(false);
      setNewCatNombre("");
      toast({ title: "Categoría creada" });
    },
    onError: (err) => {
      toast({ title: "Error", description: parseApiError(err), variant: "destructive" });
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    if (file.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
  }

  function clearFile() {
    setPendingFile(null);
    setPreviewUrl(registro?.comprobante_url ?? null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const hasComprobante = previewUrl || pendingFile;
  const isImagePreview =
    previewUrl &&
    (previewUrl.startsWith("blob:") || /\.(jpg|jpeg|png)$/i.test(previewUrl));

  // Imputación UI helpers
  const confianza = sugerencia ? calcConfianza(sugerencia) : null;
  const confianzaClasses: Record<Confianza, string> = {
    alta: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    media: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
    baja: "border-slate-600 bg-slate-800/50 text-slate-300",
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar registro" : "Nuevo registro"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Modificá los datos del registro."
              : "Completá los datos para agregar un movimiento."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-4">
          {/* Tipo toggle */}
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <div className="flex rounded-lg border border-slate-700 overflow-hidden">
              {(["gasto", "ingreso"] as TipoMovimiento[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setValue("tipo", t);
                    setValue("categoria_id", 0 as unknown as number);
                  }}
                  className={`flex-1 py-2 text-sm font-medium transition-colors capitalize ${
                    tipo === t
                      ? t === "gasto"
                        ? "bg-red-500/20 text-red-400 border-red-500/40"
                        : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                      : "text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  {t === "gasto" ? "Gasto" : "Ingreso"}
                </button>
              ))}
            </div>
          </div>

          {/* Categoría */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="categoria_id">Categoría</Label>
              <button
                type="button"
                onClick={() => setShowNewCategoria((v) => !v)}
                className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                <Plus className="h-3 w-3" />
                Nueva
              </button>
            </div>

            {showNewCategoria ? (
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 space-y-3">
                <p className="text-xs text-slate-400">Nueva categoría personalizada ({tipo})</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Nombre de la categoría"
                    value={newCatNombre}
                    onChange={(e) => setNewCatNombre(e.target.value)}
                    className="flex-1"
                  />
                  <input
                    type="color"
                    value={newCatColor}
                    onChange={(e) => setNewCatColor(e.target.value)}
                    className="h-10 w-10 cursor-pointer rounded-md border border-slate-700 bg-slate-800 p-1"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => newCatMutation.mutate()}
                    disabled={!newCatNombre.trim() || newCatMutation.isPending}
                    className="flex-1"
                  >
                    {newCatMutation.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                    Crear
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowNewCategoria(false)}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : (
              <Select id="categoria_id" {...register("categoria_id")}>
                <option value="">Seleccioná una categoría</option>
                {filteredCategorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                    {c.es_personalizada ? " (personalizada)" : ""}
                  </option>
                ))}
              </Select>
            )}
            {errors.categoria_id && (
              <p className="text-xs text-red-400">{errors.categoria_id.message}</p>
            )}
          </div>

          {/* ── Imputación de costo (solo gastos) ── */}
          {tipo === "gasto" && (
            <div className="space-y-2">
              <Label className="text-slate-300">Imputación del gasto</Label>

              {sugerenciaLoading && (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Analizando categoría…
                </div>
              )}

              {/* Sugerencia recibida, no aceptada aún */}
              {sugerencia && !imputacionAceptada && !mostrarManual && (
                <div className={`rounded-lg border p-3 space-y-2 ${confianzaClasses[confianza!]}`}>
                  <p className="text-xs font-medium">
                    {confianza === "alta" ? "✓" : "~"} Este gasto se imputará a:{" "}
                    <span className="font-semibold">{nombreImputacion(sugerencia)}</span>
                  </p>
                  <p className="text-[11px] opacity-70">
                    Confianza {confianza}
                  </p>
                  <div className="flex gap-2 pt-0.5">
                    <Button
                      type="button"
                      size="sm"
                      className="flex-1 h-7 text-xs gap-1"
                      onClick={() => { applyImputacion(sugerencia); setImputacionAceptada(true); }}
                    >
                      <Check className="h-3 w-3" />
                      Aceptar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="flex-1 h-7 text-xs"
                      onClick={() => setMostrarManual(true)}
                    >
                      Cambiar
                    </Button>
                  </div>
                </div>
              )}

              {/* Sugerencia aceptada (alta confianza auto-aceptada o manual) */}
              {imputacionAceptada && !mostrarManual && sugerencia && (
                <div className={`rounded-lg border p-3 flex items-center justify-between ${confianzaClasses[confianza!]}`}>
                  <p className="text-xs">
                    <span className="font-semibold">{nombreImputacion(sugerencia)}</span>
                  </p>
                  <button
                    type="button"
                    className="text-[11px] underline opacity-60 hover:opacity-100 ml-2 shrink-0"
                    onClick={() => { setImputacionAceptada(false); setMostrarManual(true); }}
                  >
                    Cambiar
                  </button>
                </div>
              )}

              {/* Selector manual */}
              {mostrarManual && (
                <div className="rounded-lg border border-slate-600 bg-slate-800/50 p-3 space-y-3">
                  <p className="text-xs text-slate-400">Seleccioná cómo imputar este gasto</p>

                  <div className="flex rounded-lg border border-slate-700 overflow-hidden text-xs">
                    {(["directo", "prorrateo", "estructural"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setManualTipo(t); setManualActividadTipo(""); setManualActividadId(null); }}
                        className={`flex-1 py-2 font-medium transition-colors capitalize ${
                          manualTipo === t
                            ? "bg-brand-500/20 text-brand-300"
                            : "text-slate-400 hover:bg-slate-700"
                        }`}
                      >
                        {t === "directo" ? "Directo" : t === "prorrateo" ? "Prorrateo" : "Estructural"}
                      </button>
                    ))}
                  </div>

                  {manualTipo === "directo" && (
                    <div className="space-y-2">
                      <Select
                        value={manualPotreroId ?? ""}
                        onChange={(e) => {
                          setManualPotreroId(Number(e.target.value) || null);
                          setManualActividadId(null);
                        }}
                      >
                        <option value="">Potrero (opcional)</option>
                        {potreros.map((p) => (
                          <option key={p.id} value={p.id}>{p.nombre}</option>
                        ))}
                      </Select>

                      {manualPotreroId && (
                        <div className="flex gap-2">
                          <Select
                            value={manualActividadTipo}
                            onChange={(e) => {
                              setManualActividadTipo(e.target.value as "lote" | "ciclo" | "");
                              setManualActividadId(null);
                            }}
                            className="flex-1"
                          >
                            <option value="">Sin actividad</option>
                            <option value="lote">Lote de ganado</option>
                            <option value="ciclo">Ciclo agrícola</option>
                          </Select>

                          {manualActividadTipo === "lote" && lotes.length > 0 && (
                            <Select
                              value={manualActividadId ?? ""}
                              onChange={(e) => setManualActividadId(Number(e.target.value) || null)}
                              className="flex-1"
                            >
                              <option value="">Todos</option>
                              {lotes.map((l) => (
                                <option key={l.id} value={l.id}>{l.nombre || `Lote #${l.id}`}</option>
                              ))}
                            </Select>
                          )}

                          {manualActividadTipo === "ciclo" && ciclos.length > 0 && (
                            <Select
                              value={manualActividadId ?? ""}
                              onChange={(e) => setManualActividadId(Number(e.target.value) || null)}
                              className="flex-1"
                            >
                              <option value="">Todos</option>
                              {ciclos.map((c) => (
                                <option key={c.id} value={c.id}>{c.cultivo || `Ciclo #${c.id}`}</option>
                              ))}
                            </Select>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {manualTipo === "prorrateo" && (
                    <p className="text-xs text-slate-400">
                      El gasto se distribuirá entre todos los potreros según sus hectáreas.
                    </p>
                  )}
                  {manualTipo === "estructural" && (
                    <p className="text-xs text-slate-400">
                      Gasto de estructura del establecimiento (contabilidad, seguros, etc.).
                    </p>
                  )}

                  <Button
                    type="button"
                    size="sm"
                    className="w-full h-7 text-xs"
                    onClick={applyManual}
                  >
                    Confirmar imputación
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Monto */}
          <div className="space-y-1.5">
            <Label htmlFor="monto">Monto</Label>
            <div className="flex rounded-lg border border-slate-700 overflow-hidden mb-1.5">
              {(["UYU", "USD"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setValue("moneda", m)}
                  className={`flex-1 py-1.5 text-sm font-medium transition-colors ${
                    moneda === m
                      ? "bg-brand-500/20 text-brand-400 border-brand-500/40"
                      : "text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  {m === "UYU" ? "$ UYU" : "US$ USD"}
                </button>
              ))}
            </div>
            <Input
              id="monto"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              {...register("monto")}
            />
            {errors.monto && <p className="text-xs text-red-400">{errors.monto.message}</p>}
          </div>

          {/* Fecha */}
          <div className="space-y-1.5">
            <Label htmlFor="fecha">Fecha</Label>
            <Input id="fecha" type="date" {...register("fecha")} />
            {errors.fecha && <p className="text-xs text-red-400">{errors.fecha.message}</p>}
          </div>

          {/* Descripción */}
          <div className="space-y-1.5">
            <Label htmlFor="descripcion">Descripción (opcional)</Label>
            <Input
              id="descripcion"
              placeholder="Anotá un detalle..."
              {...register("descripcion")}
            />
          </div>

          {/* Potrero */}
          <div className="space-y-1.5">
            <Label htmlFor="potrero_id">Potrero relacionado (opcional)</Label>
            <Select id="potrero_id" {...register("potrero_id")}>
              <option value="">Sin potrero</option>
              {potreros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </div>

          {/* Comprobante */}
          <div className="space-y-1.5">
            <Label>Comprobante (opcional)</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              className="hidden"
              onChange={handleFileChange}
            />
            {hasComprobante ? (
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 space-y-2">
                {isImagePreview && (
                  <img
                    src={previewUrl!}
                    alt="Comprobante"
                    className="max-h-40 rounded-md object-contain mx-auto"
                  />
                )}
                {!isImagePreview && (
                  <div className="flex items-center gap-2 text-slate-300 text-sm">
                    <Paperclip className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="truncate">
                      {pendingFile ? pendingFile.name : "Comprobante adjunto"}
                    </span>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="flex-1 text-xs"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Cambiar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-red-400 hover:text-red-300"
                    onClick={clearFile}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2 border-dashed"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
                Adjuntar comprobante
              </Button>
            )}
          </div>

          <Separator />

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1"
              variant={tipo === "gasto" ? "destructive" : "default"}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Guardar cambios" : tipo === "gasto" ? "Agregar gasto" : "Agregar ingreso"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
