import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, StickyNote, CheckSquare, Plus, Trash2, CheckCircle2,
  ChevronDown, ChevronUp, Calendar, MapPin, AlertTriangle, Loader2,
  MessageCircle, X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/useToast";
import { parseApiError } from "@/lib/authApi";
import { getPotreros } from "@/lib/potrerosApi";
import {
  getNotas, createNota, deleteNota,
  getTareas, createTarea, completarTarea, deleteTarea,
} from "@/lib/cuadernoApi";
import { cn } from "@/lib/utils";
import type { NotaCuaderno, TareaCuaderno } from "@/types/cuaderno";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-UY", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function isVencida(tarea: TareaCuaderno): boolean {
  if (tarea.completada || !tarea.fecha_planificada) return false;
  return tarea.fecha_planificada < new Date().toISOString().split("T")[0];
}

type Tab = "notas" | "tareas";

// ── Modal Nota ────────────────────────────────────────────────────────────────

function ModalNota({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState("");
  const [potreroId, setPotreroId] = useState<string>("");

  const { data: potreros = [] } = useQuery({ queryKey: ["potreros"], queryFn: getPotreros });

  const mutation = useMutation({
    mutationFn: () => createNota({
      texto: texto.trim(),
      potrero_id: potreroId ? Number(potreroId) : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notas"] });
      toast({ title: "Nota guardada" });
      setTexto("");
      setPotreroId("");
      onClose();
    },
    onError: (err) => toast({ title: "Error", description: parseApiError(err), variant: "destructive" }),
  });

  function handleClose() {
    setTexto("");
    setPotreroId("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva nota</DialogTitle>
          <DialogDescription>Anotá lo que necesitás recordar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Texto</Label>
            <textarea
              className="w-full rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
              rows={4}
              placeholder="Escribí tu nota..."
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Potrero (opcional)</Label>
            <Select value={potreroId} onChange={(e) => setPotreroId(e.target.value)}>
              <option value="">Sin potrero</option>
              {potreros.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </Select>
          </div>
          <Separator />
          <div className="flex gap-3">
            <Button type="button" variant="ghost" className="flex-1" onClick={handleClose}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              disabled={!texto.trim() || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal Tarea ───────────────────────────────────────────────────────────────

function ModalTarea({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [texto, setTexto] = useState("");
  const [fecha, setFecha] = useState("");
  const [potreroId, setPotreroId] = useState<string>("");
  const [diasAntes, setDiasAntes] = useState<string>("1");

  const { data: potreros = [] } = useQuery({ queryKey: ["potreros"], queryFn: getPotreros });

  const mutation = useMutation({
    mutationFn: () => createTarea({
      texto: texto.trim(),
      fecha_planificada: fecha || null,
      potrero_id: potreroId ? Number(potreroId) : null,
      notificar_dias_antes: diasAntes ? Number(diasAntes) : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tareas"] });
      toast({ title: "Tarea creada" });
      setTexto(""); setFecha(""); setPotreroId(""); setDiasAntes("1");
      onClose();
    },
    onError: (err) => toast({ title: "Error", description: parseApiError(err), variant: "destructive" }),
  });

  function handleClose() {
    setTexto(""); setFecha(""); setPotreroId(""); setDiasAntes("1");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva tarea</DialogTitle>
          <DialogDescription>Planificá una tarea para tu campo o negocio.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <textarea
              className="w-full rounded-md border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
              rows={3}
              placeholder="¿Qué hay que hacer?"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fecha planificada</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Avisar con anticipación</Label>
              <Select value={diasAntes} onChange={(e) => setDiasAntes(e.target.value)}>
                <option value="1">1 día antes</option>
                <option value="3">3 días antes</option>
                <option value="7">7 días antes</option>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Potrero (opcional)</Label>
            <Select value={potreroId} onChange={(e) => setPotreroId(e.target.value)}>
              <option value="">Sin potrero</option>
              {potreros.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </Select>
          </div>
          <Separator />
          <div className="flex gap-3">
            <Button type="button" variant="ghost" className="flex-1" onClick={handleClose}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              disabled={!texto.trim() || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Crear tarea
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Nota card ─────────────────────────────────────────────────────────────────

function NotaCard({ nota, potreroNombre }: { nota: NotaCuaderno; potreroNombre?: string }) {
  const queryClient = useQueryClient();
  const del = useMutation({
    mutationFn: () => deleteNota(nota.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notas"] });
      toast({ title: "Nota eliminada" });
    },
    onError: (err) => toast({ title: "Error", description: parseApiError(err), variant: "destructive" }),
  });

  return (
    <div className="flex items-start gap-3 rounded-xl border border-agro-accent/20 bg-white p-4 hover:border-agro-primary/20 transition-colors">
      <StickyNote className="h-4 w-4 text-agro-primary shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-agro-text whitespace-pre-wrap leading-relaxed">{nota.texto}</p>
        <div className="flex items-center gap-3 mt-2 text-xs text-agro-muted">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatFecha(nota.created_at)}
          </span>
          {potreroNombre && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {potreroNombre}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => del.mutate()}
        disabled={del.isPending}
        className="shrink-0 p-1.5 rounded-md text-agro-muted hover:text-red-500 hover:bg-red-50 transition-colors"
      >
        {del.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ── Tarea row ─────────────────────────────────────────────────────────────────

function TareaRow({
  tarea, potreroNombre, completada: isCompletada,
}: {
  tarea: TareaCuaderno; potreroNombre?: string; completada: boolean;
}) {
  const queryClient = useQueryClient();
  const vencida = isVencida(tarea);

  const completar = useMutation({
    mutationFn: () => completarTarea(tarea.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tareas"] });
      toast({ title: "¡Tarea completada!" });
    },
    onError: (err) => toast({ title: "Error", description: parseApiError(err), variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: () => deleteTarea(tarea.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tareas"] });
      toast({ title: "Tarea eliminada" });
    },
    onError: (err) => toast({ title: "Error", description: parseApiError(err), variant: "destructive" }),
  });

  return (
    <div className={cn(
      "flex items-start gap-3 rounded-xl border p-4 transition-colors",
      isCompletada
        ? "border-agro-accent/10 bg-agro-bg/50 opacity-60"
        : vencida
        ? "border-red-200 bg-red-50"
        : "border-agro-accent/20 bg-white hover:border-agro-primary/20",
    )}>
      {isCompletada
        ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
        : vencida
        ? <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
        : <CheckSquare className="h-4 w-4 text-agro-muted shrink-0 mt-0.5" />
      }

      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm leading-relaxed",
          isCompletada ? "line-through text-agro-muted" : "text-agro-text",
        )}>
          {tarea.texto}
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-agro-muted">
          {tarea.fecha_planificada && (
            <span className={cn(
              "flex items-center gap-1",
              vencida && "text-red-600 font-semibold",
            )}>
              <Calendar className="h-3 w-3" />
              {formatFecha(tarea.fecha_planificada)}
              {vencida && " · vencida"}
            </span>
          )}
          {potreroNombre && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {potreroNombre}
            </span>
          )}
          {isCompletada && tarea.completed_at && (
            <span className="text-emerald-600">
              Completada {formatFecha(tarea.completed_at)}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!isCompletada && (
          <button
            onClick={() => completar.mutate()}
            disabled={completar.isPending}
            title="Marcar completada"
            className="p-1.5 rounded-md text-agro-muted hover:text-emerald-600 hover:bg-emerald-50 transition-colors text-xs font-medium flex items-center gap-1"
          >
            {completar.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <CheckCircle2 className="h-3.5 w-3.5" />
            }
          </button>
        )}
        <button
          onClick={() => del.mutate()}
          disabled={del.isPending}
          title="Eliminar"
          className="p-1.5 rounded-md text-agro-muted hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          {del.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

// ── Tarjeta guía WhatsApp ─────────────────────────────────────────────────────

function GuiaWhatsApp() {
  const [visible, setVisible] = useState(() => {
    return localStorage.getItem("cuaderno_guia_wsp") !== "oculta";
  });

  if (!visible) return null;

  return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-4 relative">
      <button
        onClick={() => {
          setVisible(false);
          localStorage.setItem("cuaderno_guia_wsp", "oculta");
        }}
        className="absolute top-3 right-3 text-green-400 hover:text-green-600"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-2 mb-3">
        <MessageCircle className="h-4 w-4 text-green-600 shrink-0" />
        <span className="text-sm font-semibold text-green-800">
          Cómo usar el bot de WhatsApp
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="bg-white rounded-lg p-3 border border-green-100">
          <p className="font-semibold text-green-700 mb-1.5">📝 Guardar nota</p>
          <p className="text-agro-muted mb-1">Empezá con <code className="bg-green-100 px-1 rounded">nota:</code></p>
          <p className="text-agro-text italic">"nota: revisé el alambrado sur"</p>
        </div>
        <div className="bg-white rounded-lg p-3 border border-green-100">
          <p className="font-semibold text-green-700 mb-1.5">✅ Guardar tarea</p>
          <p className="text-agro-muted mb-1">Empezá con <code className="bg-green-100 px-1 rounded">tarea:</code></p>
          <p className="text-agro-text italic">"tarea: comprar sal el lunes"</p>
        </div>
        <div className="bg-white rounded-lg p-3 border border-green-100">
          <p className="font-semibold text-green-700 mb-1.5">❓ Hacer consulta</p>
          <p className="text-agro-muted mb-1">Escribí tu pregunta con <code className="bg-green-100 px-1 rounded">?</code></p>
          <p className="text-agro-text italic">"cuánto gasté este mes?"</p>
        </div>
      </div>

      <p className="text-xs text-green-700 mt-3">
        Comandos directos: <code className="bg-green-100 px-1 rounded">resumen</code> · <code className="bg-green-100 px-1 rounded">tareas</code> · <code className="bg-green-100 px-1 rounded">balance</code> · <code className="bg-green-100 px-1 rounded">ayuda</code>
      </p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CuadernoPage() {
  const [tab, setTab] = useState<Tab>("notas");
  const [modalNota, setModalNota] = useState(false);
  const [modalTarea, setModalTarea] = useState(false);
  const [completadasOpen, setCompletadasOpen] = useState(false);

  const { data: potreros = [] } = useQuery({ queryKey: ["potreros"], queryFn: getPotreros });
  const { data: notas = [], isLoading: loadingNotas } = useQuery({
    queryKey: ["notas"],
    queryFn: getNotas,
  });
  const { data: tareas = [], isLoading: loadingTareas } = useQuery({
    queryKey: ["tareas"],
    queryFn: () => getTareas(),
  });

  const potreroMap = Object.fromEntries(potreros.map((p) => [p.id, p.nombre]));

  const pendientes = tareas.filter((t) => !t.completada);
  const completadas = tareas.filter((t) => t.completada);
  const vencidas = pendientes.filter(isVencida).length;

  const TAB_STYLE = (active: boolean) =>
    cn(
      "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors",
      active
        ? "bg-agro-primary text-white"
        : "text-agro-muted hover:bg-agro-accent/10 hover:text-agro-primary",
    );

  return (
    <div className="page-fade flex flex-col h-full bg-agro-bg overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-agro-accent/20 px-3 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-agro-primary/10">
              <BookOpen className="h-5 w-5 text-agro-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-agro-text">Cuaderno</h1>
              <p className="text-xs text-agro-muted">Notas y tareas del campo</p>
            </div>
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => tab === "notas" ? setModalNota(true) : setModalTarea(true)}
          >
            <Plus className="h-4 w-4" />
            {tab === "notas" ? "Nueva nota" : "Nueva tarea"}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-agro-accent/20 px-3 sm:px-6">
        <div className="flex gap-1 max-w-4xl mx-auto py-2">
          <button className={TAB_STYLE(tab === "notas")} onClick={() => setTab("notas")}>
            <StickyNote className="h-4 w-4" />
            Notas
            {notas.length > 0 && (
              <span className="ml-1 rounded-full bg-agro-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-agro-primary">
                {notas.length}
              </span>
            )}
          </button>
          <button className={TAB_STYLE(tab === "tareas")} onClick={() => setTab("tareas")}>
            <CheckSquare className="h-4 w-4" />
            Tareas
            {vencidas > 0 && (
              <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {vencidas}
              </span>
            )}
            {vencidas === 0 && pendientes.length > 0 && (
              <span className="ml-1 rounded-full bg-agro-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-agro-primary">
                {pendientes.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-3 py-4 sm:px-6 sm:py-6">
        <div className="max-w-4xl mx-auto space-y-3">

          {/* Guía WhatsApp */}
          <GuiaWhatsApp />

          {/* ── Tab Notas ── */}
          {tab === "notas" && (
            <>
              {loadingNotas && (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-agro-muted" />
                </div>
              )}
              {!loadingNotas && notas.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                  <StickyNote className="h-10 w-10 text-agro-accent/40" />
                  <p className="text-sm font-medium text-agro-text">Sin notas todavía</p>
                  <p className="text-xs text-agro-muted">Usá el botón "Nueva nota" para empezar.</p>
                </div>
              )}
              {notas.map((nota) => (
                <NotaCard
                  key={nota.id}
                  nota={nota}
                  potreroNombre={nota.potrero_id ? potreroMap[nota.potrero_id] : undefined}
                />
              ))}
            </>
          )}

          {/* ── Tab Tareas ── */}
          {tab === "tareas" && (
            <>
              {loadingTareas && (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-agro-muted" />
                </div>
              )}

              {/* Pendientes */}
              {!loadingTareas && pendientes.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
                  <CheckSquare className="h-10 w-10 text-agro-accent/40" />
                  <p className="text-sm font-medium text-agro-text">Sin tareas pendientes</p>
                  <p className="text-xs text-agro-muted">Usá el botón "Nueva tarea" para planificar.</p>
                </div>
              )}
              {pendientes.map((tarea) => (
                <TareaRow
                  key={tarea.id}
                  tarea={tarea}
                  potreroNombre={tarea.potrero_id ? potreroMap[tarea.potrero_id] : undefined}
                  completada={false}
                />
              ))}

              {/* Completadas colapsable */}
              {completadas.length > 0 && (
                <div className="mt-4">
                  <button
                    onClick={() => setCompletadasOpen((v) => !v)}
                    className="flex items-center gap-2 text-sm font-medium text-agro-muted hover:text-agro-text transition-colors py-2"
                  >
                    {completadasOpen
                      ? <ChevronUp className="h-4 w-4" />
                      : <ChevronDown className="h-4 w-4" />
                    }
                    Completadas ({completadas.length})
                  </button>

                  {completadasOpen && (
                    <div className="space-y-3 mt-2">
                      {completadas.map((tarea) => (
                        <TareaRow
                          key={tarea.id}
                          tarea={tarea}
                          potreroNombre={tarea.potrero_id ? potreroMap[tarea.potrero_id] : undefined}
                          completada
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ModalNota open={modalNota} onClose={() => setModalNota(false)} />
      <ModalTarea open={modalTarea} onClose={() => setModalTarea(false)} />
    </div>
  );
}
