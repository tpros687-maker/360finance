import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload, X, ScanLine } from "lucide-react";

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
import { getCategorias } from "@/lib/categoriasApi";
import { createRegistro, extraerComprobante } from "@/lib/registrosApi";
import { toast } from "@/hooks/useToast";
import type { ExtraerComprobanteResponse, TipoMovimiento } from "@/types/registros";

// ── Confidence badge ──────────────────────────────────────────────────────────

const CONFIANZA_CONFIG = {
  alta:  { label: "Confianza alta",  className: "bg-emerald-100 text-emerald-700" },
  media: { label: "Confianza media", className: "bg-amber-100 text-amber-700" },
  baja:  { label: "Confianza baja",  className: "bg-red-100 text-red-700" },
} as const;

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export function EscanearFacturaModal({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Step state ──────────────────────────────────────────────────────────────
  const [step, setStep] = useState<"upload" | "confirm">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtraerComprobanteResponse | null>(null);

  // ── Confirm form state ──────────────────────────────────────────────────────
  const [tipo, setTipo] = useState<TipoMovimiento>("gasto");
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [categoriaId, setCategoriaId] = useState<string>("");
  const [moneda, setMoneda] = useState<"UYU" | "USD">("UYU");

  // ── Reset on open/close ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setStep("upload");
      setFile(null);
      setPreviewUrl(null);
      setExtraction(null);
      setMonto("");
      setFecha("");
      setDescripcion("");
      setCategoriaId("");
      setMoneda("UYU");
      setTipo("gasto");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open]);

  // ── Categorías ──────────────────────────────────────────────────────────────
  const { data: categorias = [] } = useQuery({
    queryKey: ["categorias"],
    queryFn: getCategorias,
    enabled: open,
  });
  const filteredCats = categorias.filter((c) => c.tipo === tipo);

  // ── Extract mutation ────────────────────────────────────────────────────────
  const extractMutation = useMutation({
    mutationFn: () => extraerComprobante(file!),
    onSuccess: (data) => {
      setExtraction(data);
      setMonto(data.monto != null ? String(data.monto) : "");
      setFecha(data.fecha ?? new Date().toISOString().split("T")[0]);
      setDescripcion(data.proveedor ?? data.descripcion ?? "");
      setCategoriaId("");
      setStep("confirm");
    },
    onError: () => {
      toast({ title: "No se pudo procesar el archivo", variant: "destructive" });
    },
  });

  // ── Save mutation ───────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: () =>
      createRegistro({
        tipo,
        categoria_id: Number(categoriaId),
        monto: parseFloat(monto),
        moneda,
        fecha,
        descripcion: descripcion || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registros"] });
      queryClient.invalidateQueries({ queryKey: ["resumen"] });
      toast({ title: "Registro creado desde comprobante" });
      onClose();
    },
    onError: () => {
      toast({ title: "Error al crear el registro", variant: "destructive" });
    },
  });

  // ── File handler ────────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(f));
    } else {
      setPreviewUrl(null);
    }
  }

  function clearFile() {
    setFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const canSave =
    categoriaId &&
    monto &&
    !isNaN(parseFloat(monto)) &&
    parseFloat(monto) > 0 &&
    fecha;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-agro-primary" />
            Escanear factura
          </DialogTitle>
          <DialogDescription>
            {step === "upload"
              ? "Subí una foto o PDF de tu factura y extraemos los datos automáticamente."
              : "Revisá y ajustá los datos antes de guardar."}
          </DialogDescription>
        </DialogHeader>

        {/* ── PASO 1: UPLOAD ── */}
        {step === "upload" && (
          <div className="space-y-4">
            {/* Drop zone */}
            <div
              className="relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-agro-accent/40 bg-agro-bg/30 px-6 py-10 text-center cursor-pointer hover:border-agro-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {previewUrl ? (
                <>
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-h-48 rounded-lg object-contain shadow"
                  />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); clearFile(); }}
                    className="absolute right-2 top-2 rounded-full bg-white p-1 shadow hover:bg-red-50 transition-colors"
                  >
                    <X className="h-3.5 w-3.5 text-agro-muted" />
                  </button>
                </>
              ) : file ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-agro-primary/10">
                    <Upload className="h-6 w-6 text-agro-primary" />
                  </div>
                  <p className="text-sm font-medium text-agro-text">{file.name}</p>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); clearFile(); }}
                    className="text-xs text-agro-muted underline hover:text-red-500"
                  >
                    Quitar
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-agro-primary/10">
                    <Upload className="h-6 w-6 text-agro-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-agro-text">Hacé clic para seleccionar</p>
                    <p className="text-xs text-agro-muted mt-0.5">JPG, PNG o PDF</p>
                  </div>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            <Button
              className="w-full gap-2"
              onClick={() => extractMutation.mutate()}
              disabled={!file || extractMutation.isPending}
            >
              {extractMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {extractMutation.isPending ? "Procesando…" : "Extraer datos"}
            </Button>
          </div>
        )}

        {/* ── PASO 2: CONFIRM ── */}
        {step === "confirm" && extraction && (
          <div className="space-y-4">
            {/* Confidence badge */}
            <div className="flex items-center justify-between">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${CONFIANZA_CONFIG[extraction.confianza].className}`}
              >
                {CONFIANZA_CONFIG[extraction.confianza].label}
              </span>
              <button
                type="button"
                onClick={() => setStep("upload")}
                className="text-xs text-agro-muted underline hover:text-agro-text"
              >
                ← Volver
              </button>
            </div>
            <p className="text-sm text-agro-muted">Revisá los datos antes de guardar.</p>

            {/* Tipo toggle */}
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <div className="flex rounded-lg border border-slate-700 overflow-hidden">
                {(["gasto", "ingreso"] as TipoMovimiento[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setTipo(t); setCategoriaId(""); }}
                    className={`flex-1 py-2 text-sm font-medium transition-colors capitalize ${
                      tipo === t
                        ? t === "gasto"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-emerald-500/20 text-emerald-400"
                        : "text-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    {t === "gasto" ? "Gasto" : "Ingreso"}
                  </button>
                ))}
              </div>
            </div>

            {/* Monto */}
            <div className="space-y-1.5">
              <Label htmlFor="sc-monto">Monto</Label>
              <div className="flex gap-2">
                <Input
                  id="sc-monto"
                  type="number"
                  min="0"
                  step="0.01"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  className="flex-1"
                />
                <Select
                  value={moneda}
                  onChange={(e) => setMoneda(e.target.value as "UYU" | "USD")}
                  className="w-24"
                >
                  <option value="UYU">UYU</option>
                  <option value="USD">USD</option>
                </Select>
              </div>
            </div>

            {/* Fecha */}
            <div className="space-y-1.5">
              <Label htmlFor="sc-fecha">Fecha</Label>
              <Input
                id="sc-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>

            {/* Descripción */}
            <div className="space-y-1.5">
              <Label htmlFor="sc-desc">Descripción / Proveedor</Label>
              <Input
                id="sc-desc"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Proveedor o descripción"
              />
            </div>

            {/* Categoría */}
            <div className="space-y-1.5">
              <Label htmlFor="sc-cat">Categoría</Label>
              <Select
                id="sc-cat"
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
              >
                <option value="">Seleccioná una categoría</option>
                {filteredCats.map((c) => (
                  <option key={c.id} value={String(c.id)}>{c.nombre}</option>
                ))}
              </Select>
              {extraction.categoria_sugerida && (
                <p className="text-xs text-agro-muted">
                  Sugerida por IA: <span className="font-medium">{extraction.categoria_sugerida}</span>
                </p>
              )}
            </div>

            <Button
              className="w-full gap-2"
              onClick={() => saveMutation.mutate()}
              disabled={!canSave || saveMutation.isPending}
            >
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {saveMutation.isPending ? "Guardando…" : "Crear registro"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
