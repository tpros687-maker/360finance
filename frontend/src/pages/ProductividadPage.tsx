import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Leaf } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getPotreros } from "@/lib/potrerosApi";
import {
  getLotes, createLote, updateLote, deleteLote,
  getEventos, createEvento, deleteEvento,
  getCiclos, createCiclo, deleteCiclo,
} from "@/lib/produccionApi";
import { toast } from "@/hooks/useToast";
import type { Potrero } from "@/types/mapa";
import type {
  LoteGanado, LoteCreate,
  EventoCreate,
  CicloCreate,
} from "@/types/produccion";

const todayStr = () => new Date().toISOString().split("T")[0];

// ── Badge helpers ─────────────────────────────────────────────────────────────

type Color = "green" | "yellow" | "red";

function colorFromRange(v: number, lo: number, hi: number): Color {
  return v < lo ? "red" : v < hi ? "yellow" : "green";
}

const BADGE_CLS: Record<Color, string> = {
  green:  "bg-emerald-100 text-emerald-700 border border-emerald-200",
  yellow: "bg-amber-100 text-amber-700 border border-amber-200",
  red:    "bg-red-100 text-red-700 border border-red-200",
};

function ColorBadge({ label, value, color }: { label: string; value: string; color: Color }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${BADGE_CLS[color]}`}>
      {label}: {value}
    </span>
  );
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function fmtDate(s: string) {
  return new Date(s + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function fmtCurrency(n: number, moneda: string) {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: moneda === "USD" ? "USD" : "UYU",
    maximumFractionDigits: 0,
  }).format(n);
}

// ── Modal: Nuevo lote ─────────────────────────────────────────────────────────

function ModalNuevoLote({ potreroId, open, onClose }: { potreroId: number; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    especie: "", cantidad: "", fecha_entrada: todayStr(),
    peso_entrada_kg: "", fecha_salida: "", peso_salida_kg: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const mutation = useMutation({
    mutationFn: () => {
      const data: LoteCreate = {
        potrero_id: potreroId,
        especie: form.especie,
        cantidad: parseInt(form.cantidad),
        fecha_entrada: form.fecha_entrada,
        peso_entrada_kg: parseFloat(form.peso_entrada_kg),
        ...(form.fecha_salida && { fecha_salida: form.fecha_salida }),
        ...(form.peso_salida_kg && { peso_salida_kg: parseFloat(form.peso_salida_kg) }),
      };
      return createLote(potreroId, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lotes", potreroId] });
      toast({ title: "Lote registrado" });
      onClose();
      setForm({ especie: "", cantidad: "", fecha_entrada: todayStr(), peso_entrada_kg: "", fecha_salida: "", peso_salida_kg: "" });
    },
    onError: () => toast({ title: "Error al registrar lote", variant: "destructive" }),
  });

  const valid = form.especie && form.cantidad && form.fecha_entrada && form.peso_entrada_kg;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-agro-text">Nuevo lote de ganado</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <Label className="text-agro-muted text-xs">Especie *</Label>
            <Input value={form.especie} onChange={set("especie")} autoFocus
              className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text text-sm" placeholder="Novillos, vaquillonas..." />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-agro-muted text-xs">Cantidad *</Label>
              <Input type="number" min={1} value={form.cantidad} onChange={set("cantidad")}
                className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text text-sm" placeholder="0" />
            </div>
            <div>
              <Label className="text-agro-muted text-xs">Fecha entrada *</Label>
              <Input type="date" value={form.fecha_entrada} onChange={set("fecha_entrada")}
                className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-agro-muted text-xs">Peso total entrada (kg) *</Label>
            <Input type="number" min={0} step="0.1" value={form.peso_entrada_kg} onChange={set("peso_entrada_kg")}
              className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text text-sm" placeholder="Peso total del lote en kg" />
          </div>
          <div className="border-t border-agro-accent/20 pt-3">
            <p className="text-xs text-agro-muted mb-2">Salida (opcional)</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-agro-muted text-xs">Fecha salida</Label>
                <Input type="date" value={form.fecha_salida} onChange={set("fecha_salida")}
                  className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text text-sm" />
              </div>
              <div>
                <Label className="text-agro-muted text-xs">Peso salida (kg)</Label>
                <Input type="number" min={0} step="0.1" value={form.peso_salida_kg} onChange={set("peso_salida_kg")}
                  className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text text-sm" placeholder="0" />
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
            <Button variant="outline" onClick={onClose} className="border-agro-accent/20 text-agro-muted">Cancelar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal: Registrar salida ───────────────────────────────────────────────────

function ModalSalida({ lote, onClose }: { lote: LoteGanado | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ fecha_salida: todayStr(), peso_salida_kg: "" });

  const mutation = useMutation({
    mutationFn: () => updateLote(lote!.id, {
      fecha_salida: form.fecha_salida,
      peso_salida_kg: parseFloat(form.peso_salida_kg),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lotes", lote!.potrero_id] });
      toast({ title: "Salida registrada" });
      onClose();
      setForm({ fecha_salida: todayStr(), peso_salida_kg: "" });
    },
    onError: () => toast({ title: "Error al registrar salida", variant: "destructive" }),
  });

  return (
    <Dialog open={!!lote} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-agro-text text-sm">
            Registrar salida — {lote?.especie}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <Label className="text-agro-muted text-xs">Fecha salida *</Label>
            <Input type="date" value={form.fecha_salida}
              onChange={(e) => setForm(f => ({ ...f, fecha_salida: e.target.value }))}
              className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text text-sm" />
          </div>
          <div>
            <Label className="text-agro-muted text-xs">Peso total salida (kg) *</Label>
            <Input type="number" min={0} step="0.1" value={form.peso_salida_kg} autoFocus
              onChange={(e) => setForm(f => ({ ...f, peso_salida_kg: e.target.value }))}
              className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text text-sm" placeholder="Peso total del lote en kg" />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!form.fecha_salida || !form.peso_salida_kg || mutation.isPending}
              onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
            <Button variant="outline" onClick={onClose} className="border-agro-accent/20 text-agro-muted">Cancelar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal: Nuevo evento reproductivo ─────────────────────────────────────────

function ModalEvento({ potreroId, open, onClose }: { potreroId: number; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    tipo: "tacto", fecha: todayStr(), vientres_totales: "", resultado: "", notas: "",
  });

  const mutation = useMutation({
    mutationFn: () => {
      const data: EventoCreate = {
        potrero_id: potreroId,
        tipo: form.tipo,
        fecha: form.fecha,
        vientres_totales: parseInt(form.vientres_totales),
        resultado: parseInt(form.resultado),
        ...(form.notas && { notas: form.notas }),
      };
      return createEvento(potreroId, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eventos", potreroId] });
      toast({ title: "Evento registrado" });
      onClose();
      setForm({ tipo: "tacto", fecha: todayStr(), vientres_totales: "", resultado: "", notas: "" });
    },
    onError: () => toast({ title: "Error al registrar evento", variant: "destructive" }),
  });

  const valid = form.fecha && form.vientres_totales && form.resultado;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-agro-text">Nuevo evento reproductivo</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-agro-muted text-xs">Tipo *</Label>
              <select value={form.tipo} onChange={(e) => setForm(f => ({ ...f, tipo: e.target.value }))}
                className="mt-1 w-full bg-agro-bg border border-agro-accent/20 text-agro-text text-sm rounded-md px-3 py-2">
                <option value="tacto">Tacto</option>
                <option value="paricion">Parición</option>
                <option value="destete">Destete</option>
              </select>
            </div>
            <div>
              <Label className="text-agro-muted text-xs">Fecha *</Label>
              <Input type="date" value={form.fecha}
                onChange={(e) => setForm(f => ({ ...f, fecha: e.target.value }))}
                className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-agro-muted text-xs">Total vientres *</Label>
              <Input type="number" min={1} value={form.vientres_totales}
                onChange={(e) => setForm(f => ({ ...f, vientres_totales: e.target.value }))}
                className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text text-sm" placeholder="0" />
            </div>
            <div>
              <Label className="text-agro-muted text-xs">Resultado *</Label>
              <Input type="number" min={0} value={form.resultado}
                onChange={(e) => setForm(f => ({ ...f, resultado: e.target.value }))}
                className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text text-sm" placeholder="0" />
            </div>
          </div>
          <div>
            <Label className="text-agro-muted text-xs">Notas</Label>
            <Input value={form.notas} onChange={(e) => setForm(f => ({ ...f, notas: e.target.value }))}
              className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text text-sm" placeholder="Opcional..." />
          </div>
          <div className="flex gap-2 pt-1">
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
            <Button variant="outline" onClick={onClose} className="border-agro-accent/20 text-agro-muted">Cancelar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal: Nueva zafra ────────────────────────────────────────────────────────

function ModalCiclo({ potreroId, open, onClose }: { potreroId: number; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    zafra: "", cultivo: "", fecha_siembra: "", fecha_cosecha: "",
    toneladas_cosechadas: "", precio_venta_tn: "", moneda: "USD",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const mutation = useMutation({
    mutationFn: () => {
      const data: CicloCreate = {
        potrero_id: potreroId,
        zafra: form.zafra,
        cultivo: form.cultivo,
        moneda: form.moneda,
        ...(form.fecha_siembra && { fecha_siembra: form.fecha_siembra }),
        ...(form.fecha_cosecha && { fecha_cosecha: form.fecha_cosecha }),
        ...(form.toneladas_cosechadas && { toneladas_cosechadas: parseFloat(form.toneladas_cosechadas) }),
        ...(form.precio_venta_tn && { precio_venta_tn: parseFloat(form.precio_venta_tn) }),
      };
      return createCiclo(potreroId, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ciclos", potreroId] });
      toast({ title: "Ciclo registrado" });
      onClose();
      setForm({ zafra: "", cultivo: "", fecha_siembra: "", fecha_cosecha: "", toneladas_cosechadas: "", precio_venta_tn: "", moneda: "USD" });
    },
    onError: () => toast({ title: "Error al registrar ciclo", variant: "destructive" }),
  });

  const valid = form.zafra && form.cultivo;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-agro-text">Nueva zafra</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-agro-muted text-xs">Zafra *</Label>
              <Input value={form.zafra} onChange={set("zafra")} autoFocus
                className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text text-sm" placeholder="2024/2025" />
            </div>
            <div>
              <Label className="text-agro-muted text-xs">Cultivo *</Label>
              <Input value={form.cultivo} onChange={set("cultivo")}
                className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text text-sm" placeholder="Soja, Maíz..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-agro-muted text-xs">Fecha siembra</Label>
              <Input type="date" value={form.fecha_siembra} onChange={set("fecha_siembra")}
                className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text text-sm" />
            </div>
            <div>
              <Label className="text-agro-muted text-xs">Fecha cosecha</Label>
              <Input type="date" value={form.fecha_cosecha} onChange={set("fecha_cosecha")}
                className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-agro-muted text-xs">Toneladas cosechadas</Label>
              <Input type="number" min={0} step="0.001" value={form.toneladas_cosechadas} onChange={set("toneladas_cosechadas")}
                className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text text-sm" placeholder="0.000" />
            </div>
            <div>
              <Label className="text-agro-muted text-xs">Precio / tn</Label>
              <Input type="number" min={0} step="0.01" value={form.precio_venta_tn} onChange={set("precio_venta_tn")}
                className="mt-1 bg-agro-bg border-agro-accent/20 text-agro-text text-sm" placeholder="0.00" />
            </div>
          </div>
          <div>
            <Label className="text-agro-muted text-xs">Moneda</Label>
            <select value={form.moneda} onChange={set("moneda")}
              className="mt-1 w-full bg-agro-bg border border-agro-accent/20 text-agro-text text-sm rounded-md px-3 py-2">
              <option value="USD">USD</option>
              <option value="UYU">UYU</option>
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!valid || mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
            <Button variant="outline" onClick={onClose} className="border-agro-accent/20 text-agro-muted">Cancelar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Panel por potrero ─────────────────────────────────────────────────────────

const TIPO_LABEL: Record<string, string> = {
  ganaderia: "Ganadería", agricultura: "Agricultura", mixto: "Mixto",
};

function SectionHeader({ title, onAdd, addLabel }: { title: string; onAdd: () => void; addLabel: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-agro-bg/40 border-b border-agro-accent/10">
      <span className="text-xs font-semibold text-agro-muted uppercase tracking-wide">{title}</span>
      <button onClick={onAdd}
        className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium">
        <Plus className="h-3 w-3" />{addLabel}
      </button>
    </div>
  );
}

function PotreroPanel({ potrero }: { potrero: Potrero }) {
  const qc = useQueryClient();
  const isGan = potrero.tipo !== "agricultura";
  const isAgr = potrero.tipo === "agricultura";

  const [loteModalOpen, setLoteModalOpen] = useState(false);
  const [salidaLote, setSalidaLote] = useState<LoteGanado | null>(null);
  const [eventoModalOpen, setEventoModalOpen] = useState(false);
  const [cicloModalOpen, setCicloModalOpen] = useState(false);

  const { data: lotes = [] } = useQuery({
    queryKey: ["lotes", potrero.id],
    queryFn: () => getLotes(potrero.id),
    enabled: isGan,
    staleTime: 30000,
  });

  const { data: eventos = [] } = useQuery({
    queryKey: ["eventos", potrero.id],
    queryFn: () => getEventos(potrero.id),
    enabled: isGan,
    staleTime: 30000,
  });

  const { data: ciclos = [] } = useQuery({
    queryKey: ["ciclos", potrero.id],
    queryFn: () => getCiclos(potrero.id),
    enabled: isAgr,
    staleTime: 30000,
  });

  const ha = potrero.hectareas != null ? Number(potrero.hectareas) : null;
  const closedLotes = lotes.filter(l => l.kg_producidos != null);
  const kgHa = ha && ha > 0 && closedLotes.length > 0
    ? closedLotes.reduce((s, l) => s + (l.kg_producidos ?? 0), 0) / ha
    : null;
  const gdpValues = closedLotes.filter(l => l.gdp_kg_dia != null).map(l => l.gdp_kg_dia!);
  const gdpAvg = gdpValues.length > 0 ? gdpValues.reduce((s, v) => s + v, 0) / gdpValues.length : null;
  const tasaRep = eventos[0]?.tasa_pct ?? null;
  const lastRinde = ciclos.find(c => c.rinde_tn_ha != null)?.rinde_tn_ha ?? null;

  const deleteLoteMut = useMutation({
    mutationFn: deleteLote,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lotes", potrero.id] }),
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });
  const deleteEventoMut = useMutation({
    mutationFn: deleteEvento,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eventos", potrero.id] }),
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });
  const deleteCicloMut = useMutation({
    mutationFn: deleteCiclo,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ciclos", potrero.id] }),
    onError: () => toast({ title: "Error al eliminar", variant: "destructive" }),
  });

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <CardHeader className="pb-3 border-b border-agro-accent/10">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-agro-text">{potrero.nombre}</h2>
            <p className="text-xs text-agro-muted mt-0.5">
              {TIPO_LABEL[potrero.tipo] ?? potrero.tipo}
              {ha ? ` · ${ha.toFixed(1)} ha` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-1 justify-end">
            {isGan && kgHa != null && (
              <ColorBadge label="kg/ha" value={kgHa.toFixed(0)} color={colorFromRange(kgHa, 60, 100)} />
            )}
            {isGan && gdpAvg != null && (
              <ColorBadge label="GDP" value={`${gdpAvg.toFixed(3)} kg/d`} color={colorFromRange(gdpAvg, 0.3, 0.6)} />
            )}
            {isGan && tasaRep != null && (
              <ColorBadge label="Tasa rep." value={`${tasaRep.toFixed(1)}%`} color={colorFromRange(tasaRep, 75, 90)} />
            )}
            {isAgr && lastRinde != null && (
              <ColorBadge label="Rinde" value={`${Number(lastRinde).toFixed(2)} tn/ha`} color={colorFromRange(Number(lastRinde), 1.5, 3)} />
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isGan && (
          <>
            {/* Lotes de ganado */}
            <div className="border-b border-agro-accent/10">
              <SectionHeader title="Lotes de ganado" addLabel="Nuevo lote" onAdd={() => setLoteModalOpen(true)} />
              <div className="divide-y divide-agro-accent/10">
                {lotes.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-agro-muted italic">Sin lotes registrados</p>
                ) : lotes.map(l => (
                  <div key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-agro-text capitalize">{l.especie}</span>
                      <span className="text-agro-muted ml-1.5">{l.cantidad} cab.</span>
                      <span className="text-agro-muted ml-1.5">· Ent: {fmtDate(l.fecha_entrada)}</span>
                      {l.fecha_salida && <span className="text-agro-muted ml-1.5">· Sal: {fmtDate(l.fecha_salida)}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {l.kg_producidos != null ? (
                        <>
                          <span className="text-agro-text font-medium">{l.kg_producidos.toFixed(0)} kg prod.</span>
                          {l.gdp_kg_dia != null && (
                            <span className="text-agro-muted">GDP: {l.gdp_kg_dia.toFixed(3)}</span>
                          )}
                        </>
                      ) : (
                        <button onClick={() => setSalidaLote(l)}
                          className="text-xs text-emerald-600 hover:text-emerald-700 font-medium border border-emerald-200 rounded px-2 py-0.5 whitespace-nowrap">
                          Registrar salida
                        </button>
                      )}
                      <button onClick={() => { if (confirm("¿Eliminar lote?")) deleteLoteMut.mutate(l.id); }}
                        className="text-agro-muted hover:text-red-500 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Reproducción */}
            <div>
              <SectionHeader title="Reproducción" addLabel="Nuevo evento" onAdd={() => setEventoModalOpen(true)} />
              <div className="divide-y divide-agro-accent/10">
                {eventos.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-agro-muted italic">Sin eventos registrados</p>
                ) : eventos.map(e => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-agro-text capitalize">{e.tipo}</span>
                      <span className="text-agro-muted ml-1.5">· {fmtDate(e.fecha)}</span>
                      <span className="text-agro-muted ml-1.5">· {e.resultado}/{e.vientres_totales}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <ColorBadge label="Tasa" value={`${e.tasa_pct.toFixed(1)}%`}
                        color={colorFromRange(e.tasa_pct, 75, 90)} />
                      <button onClick={() => { if (confirm("¿Eliminar evento?")) deleteEventoMut.mutate(e.id); }}
                        className="text-agro-muted hover:text-red-500 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {isAgr && (
          <div>
            <SectionHeader title="Ciclos agrícolas" addLabel="Nueva zafra" onAdd={() => setCicloModalOpen(true)} />
            <div className="divide-y divide-agro-accent/10">
              {ciclos.length === 0 ? (
                <p className="px-4 py-3 text-xs text-agro-muted italic">Sin ciclos registrados</p>
              ) : ciclos.map(c => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-agro-text">{c.zafra} — {c.cultivo}</span>
                    {c.fecha_cosecha && <span className="text-agro-muted ml-1.5">· {fmtDate(c.fecha_cosecha)}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.rinde_tn_ha != null && (
                      <ColorBadge label="Rinde" value={`${Number(c.rinde_tn_ha).toFixed(2)} tn/ha`}
                        color={colorFromRange(Number(c.rinde_tn_ha), 1.5, 3)} />
                    )}
                    {c.ingreso_bruto != null && (
                      <span className="text-agro-text font-medium">
                        {fmtCurrency(Number(c.ingreso_bruto), c.moneda)}
                      </span>
                    )}
                    <button onClick={() => { if (confirm("¿Eliminar ciclo?")) deleteCicloMut.mutate(c.id); }}
                      className="text-agro-muted hover:text-red-500 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <ModalNuevoLote potreroId={potrero.id} open={loteModalOpen} onClose={() => setLoteModalOpen(false)} />
      <ModalSalida lote={salidaLote} onClose={() => setSalidaLote(null)} />
      <ModalEvento potreroId={potrero.id} open={eventoModalOpen} onClose={() => setEventoModalOpen(false)} />
      <ModalCiclo potreroId={potrero.id} open={cicloModalOpen} onClose={() => setCicloModalOpen(false)} />
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-agro-accent/20 ${className}`} />;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
      <Leaf className="h-12 w-12 text-agro-accent" />
      <h2 className="text-lg font-semibold text-agro-text">Sin potreros</h2>
      <p className="text-agro-muted max-w-xs text-sm">
        Agregá potreros en el Mapa para ver sus métricas de productividad aquí.
      </p>
    </div>
  );
}

export default function ProductividadPage() {
  const { data: potreros = [], isLoading } = useQuery({
    queryKey: ["potreros"],
    queryFn: getPotreros,
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 page-fade">
      <div>
        <h1 className="text-2xl font-bold text-agro-text">Productividad por Potrero</h1>
        <p className="text-agro-muted text-sm mt-1">
          Lotes de ganado, eventos reproductivos y ciclos agrícolas con métricas de rendimiento.
        </p>
      </div>
      {potreros.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {potreros.map(p => <PotreroPanel key={p.id} potrero={p} />)}
        </div>
      )}
    </div>
  );
}
