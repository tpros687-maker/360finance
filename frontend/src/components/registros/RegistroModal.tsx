import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Paperclip, Plus, X } from "lucide-react";

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
import { toast } from "@/hooks/useToast";
import { parseApiError } from "@/lib/authApi";
import type { Registro, TipoMovimiento } from "@/types/registros";

const schema = z.object({
  tipo: z.enum(["gasto", "ingreso"]),
  categoria_id: z.coerce.number().min(1, "Seleccioná una categoría"),
  monto: z.coerce.number().positive("El monto debe ser mayor a 0"),
  fecha: z.string().min(1, "Seleccioná una fecha"),
  descripcion: z.string().optional(),
  potrero_id: z.coerce.number().optional().nullable(),
});

type FormValues = z.infer<typeof schema>;

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

  useEffect(() => {
    if (registro) {
      reset({
        tipo: registro.tipo,
        categoria_id: registro.categoria_id,
        monto: parseFloat(registro.monto),
        fecha: registro.fecha,
        descripcion: registro.descripcion ?? "",
        potrero_id: registro.potrero_id ?? null,
      });
    } else {
      reset({
        tipo: defaultTipo,
        categoria_id: undefined,
        monto: undefined,
        fecha: new Date().toISOString().split("T")[0],
        descripcion: "",
        potrero_id: null,
      });
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

  const filteredCategorias = categorias.filter((c) => c.tipo === tipo);

  const saveMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const payload = {
        categoria_id: data.categoria_id,
        tipo: data.tipo,
        monto: data.monto,
        fecha: data.fecha,
        descripcion: data.descripcion || undefined,
        potrero_id: data.potrero_id || null,
      };
      const saved = isEdit
        ? await updateRegistro(registro!.id, payload)
        : await createRegistro(payload);

      // Upload comprobante if a new file was selected
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
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
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

          {/* Monto */}
          <div className="space-y-1.5">
            <Label htmlFor="monto">Monto ($)</Label>
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
                    src={
                      previewUrl!.startsWith("blob:")
                        ? previewUrl!
                        : `http://localhost:8000${previewUrl}`
                    }
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
