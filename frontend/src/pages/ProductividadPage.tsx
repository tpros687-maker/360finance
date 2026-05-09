import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Leaf, ArrowRightLeft, Scissors, ShoppingCart } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getPotreros } from "@/lib/potrerosApi";
import {
  getEventos, createEvento, deleteEvento,
  getCiclos, createCiclo, deleteCiclo,
} from "@/lib/produccionApi";
import { getLotes, createLote, moverLote, dividirLote, venderLote } from "@/lib/lotesApi";
import { toast } from "@/hooks/useToast";
import type { Potrero } from "@/types/mapa";
import type { EventoCreate, CicloCreate } from "@/types/produccion";
import type { Lote } from "@/types/lotes";

const todayStr = () => new Date().toISOString().split("T")[0];

const CATEGORIAS = ["novillo", "vaquillona", "ternero", "ternera", "vaca", "toro", "otro"] as const;
const MOTIVOS_DIVISION = ["destete", "punta", "sexo", "inseminacion", "otro"] as const;

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

const SELECT_CLS = "mt-1 w-full bg-agro-bg border border-agro-accent/20 text-agro-text text-sm rounded-md px-3 py-2";
const INPUT_CLS  = "mt-1 bg-agro-bg border-agro-accent/20 text-agro-text text-sm";

// ── Modal: Nuevo lote ─────────────────────────────────────────────────────────

function ModalNuevoLote({ potreroId, open, onClose }: { potreroId: number; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    categoria: "novillo" as typeof CATEGORIAS[number],
    cantidad: "",
    fecha_entrada: todayStr(),
    peso_total_entrada_kg: "",
    precio_kg_compra: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const mut = useMutation({
    mutationFn: () => createLote({
      potrero_id: potreroId,
      categoria: form.categoria,
      cantidad: parseInt(form.cantidad),
      fecha_entrada: form.fecha_entrada,
      peso_total_entrada_kg: parseFloat(form.peso_total_entrada_kg),
      ...(form.precio_kg_compra ? { precio_kg_compra: parseFloat(form.precio_kg_compra) } : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lotes", potreroId] });
      toast({ title: "Lote registrado" });
      onClose();
      setForm({ categoria: "novillo", cantidad: "", fecha_entrada: todayStr(), peso_total_entrada_kg: "", precio_kg_compra: "" });
    },
    onError: () => toast({ title: "Error al registrar lote", variant: "destructive" }),
  });

  const valid = form.cantidad && form.fecha_entrada && form.peso_total_entrada_kg;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-agro-text">Nuevo lote de ganado</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <Label className="text-agro-muted text-xs">Categoría *</Label>
            <select value={form.categoria} onChange={set("categoria")} className={SELECT_CLS}>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-agro-muted text-xs">Cantidad (cab.) *</Label>
              <Input type="number" min={1} value={form.cantidad} onChange={set("cantidad")}
                className={INPUT_CLS} placeholder="0" autoFocus />
            </div>
            <div>
              <Label className="text-agro-muted text-xs">Fecha entrada *</Label>
              <Input type="date" value={form.fecha_entrada} onChange={set("fecha_entrada")} className={INPUT_CLS} />
            </div>
          </div>
          <div>
            <Label className="text-agro-muted text-xs">Peso total entrada (kg) *</Label>
            <Input type="number" min={0} step="0.1" value={form.peso_total_entrada_kg} onChange={set("peso_total_entrada_kg")}
              className={INPUT_CLS} placeholder="Peso total del lote en kg" />
          </div>
          <div>
            <Label className="text-agro-muted text-xs">Precio / kg compra (USD, opcional)</Label>
            <Input type="number" min={0} step="0.01" value={form.precio_kg_compra} onChange={set("precio_kg_compra")}
              className={INPUT_CLS} placeholder="Ej: 1.80" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!valid || mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? "Guardando..." : "Guardar"}
            </Button>
            <Button variant="outline" onClick={onClose} className="border-agro-accent/20 text-agro-muted">Cancelar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal: Mover lote ─────────────────────────────────────────────────────────

function ModalMoverLote({ lote, potreros, onClose }: { lote: Lote | null; potreros: Potrero[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ potrero_destino_id: "", fecha: todayStr(), notas: "" });

  const opciones = potreros.filter(p => p.id !== lote?.potrero_id);

  const mut = useMutation({
    mutationFn: () => moverLote(lote!.id, {
      potrero_destino_id: parseInt(form.potrero_destino_id),
      fecha: form.fecha,
      ...(form.notas ? { notas: form.notas } : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lotes", lote!.potrero_id] });
      qc.invalidateQueries({ queryKey: ["lotes", parseInt(form.potrero_destino_id)] });
      toast({ title: "Lote movido" });
      onClose();
      setForm({ potrero_destino_id: "", fecha: todayStr(), notas: "" });
    },
    onError: () => toast({ title: "Error al mover lote", variant: "destructive" }),
  });

  const valid = form.potrero_destino_id && form.fecha;

  return (
    <Dialog open={!!lote} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-agro-text text-sm">
            Mover lote — {lote?.categoria} · {lote?.cantidad} cab.
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <Label className="text-agro-muted text-xs">Potrero destino *</Label>
            <select value={form.potrero_destino_id}
              onChange={(e) => setForm(f => ({ ...f, potrero_destino_id: e.target.value }))}
              className={SELECT_CLS}>
              <option value="">Seleccioná un potrero...</option>
              {opciones.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-agro-muted text-xs">Fecha *</Label>
            <Input type="date" value={form.fecha}
              onChange={(e) => setForm(f => ({ ...f, fecha: e.target.value }))} className={INPUT_CLS} />
          </div>
          <div>
            <Label className="text-agro-muted text-xs">Notas</Label>
            <Input value={form.notas} onChange={(e) => setForm(f => ({ ...f, notas: e.target.value }))}
              className={INPUT_CLS} placeholder="Opcional..." />
          </div>
          <div className="flex gap-2 pt-1">
            <Button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              disabled={!valid || mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? "Moviendo..." : "Confirmar"}
            </Button>
            <Button variant="outline" onClick={onClose} className="border-agro-accent/20 text-agro-muted">Cancelar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal: Dividir lote ───────────────────────────────────────────────────────

function ModalDividirLote({ lote, potreros, onClose }: { lote: Lote | null; potreros: Potrero[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    cantidad_separada: "",
    potrero_destino_id: "",
    fecha: todayStr(),
    motivo: "" as string,
    notas_hijo: "",
  });

  const maxCantidad = (lote?.cantidad ?? 2) - 1;

  const mut = useMutation({
    mutationFn: () => dividirLote(lote!.id, {
      cantidad_separada: parseInt(form.cantidad_separada),
      potrero_destino_id: parseInt(form.potrero_destino_id),
      fecha: form.fecha,
      ...(form.motivo ? { motivo: form.motivo } : {}),
      ...(form.notas_hijo ? { notas_hijo: form.notas_hijo } : {}),
    }),
    onSuccess: (hijo) => {
      qc.invalidateQueries({ queryKey: ["lotes", lote!.potrero_id] });
      qc.invalidateQueries({ queryKey: ["lotes", hijo.potrero_id] });
      toast({ title: `Lote dividido — lote hijo #${hijo.id} creado` });
      onClose();
      setForm({ cantidad_separada: "", potrero_destino_id: "", fecha: todayStr(), motivo: "", notas_hijo: "" });
    },
    onError: () => toast({ title: "Error al dividir lote", variant: "destructive" }),
  });

  const cantNum = parseInt(form.cantidad_separada);
  const valid = form.potrero_destino_id && form.fecha &&
    !isNaN(cantNum) && cantNum >= 1 && cantNum <= maxCantidad;

  return (
    <Dialog open={!!lote} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-agro-text text-sm">
            Dividir lote — {lote?.categoria} · {lote?.cantidad} cab.
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-agro-muted text-xs">Cantidad a separar * (máx {maxCantidad})</Label>
              <Input type="number" min={1} max={maxCantidad} value={form.cantidad_separada} autoFocus
                onChange={(e) => setForm(f => ({ ...f, cantidad_separada: e.target.value }))}
                className={INPUT_CLS} placeholder="0" />
            </div>
            <div>
              <Label className="text-agro-muted text-xs">Fecha *</Label>
              <Input type="date" value={form.fecha}
                onChange={(e) => setForm(f => ({ ...f, fecha: e.target.value }))} className={INPUT_CLS} />
            </div>
          </div>
          <div>
            <Label className="text-agro-muted text-xs">Potrero destino del hijo *</Label>
            <select value={form.potrero_destino_id}
              onChange={(e) => setForm(f => ({ ...f, potrero_destino_id: e.target.value }))}
              className={SELECT_CLS}>
              <option value="">Seleccioná un potrero...</option>
              {potreros.map(p => <option key={p.id} value={p.id}>{p.nombre}{p.id === lote?.potrero_id ? " (actual)" : ""}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-agro-muted text-xs">Motivo</Label>
            <select value={form.motivo}
              onChange={(e) => setForm(f => ({ ...f, motivo: e.target.value }))}
              className={SELECT_CLS}>
              <option value="">Sin especificar</option>
              {MOTIVOS_DIVISION.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-agro-muted text-xs">Notas del lote hijo</Label>
            <Input value={form.notas_hijo}
              onChange={(e) => setForm(f => ({ ...f, notas_hijo: e.target.value }))}
              className={INPUT_CLS} placeholder="Opcional..." />
          </div>
          <div className="flex gap-2 pt-1">
            <Button className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
              disabled={!valid || mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? "Dividiendo..." : "Confirmar"}
            </Button>
            <Button variant="outline" onClick={onClose} className="border-agro-accent/20 text-agro-muted">Cancelar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal: Vender lote ────────────────────────────────────────────────────────

function ModalVenderLote({ lote, onClose }: { lote: Lote | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    fecha: todayStr(),
    cantidad_vendida: "",
    peso_total_kg: "",
    precio_kg: "",
    moneda: "USD",
    notas: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const maxCantidad = lote?.cantidad ?? 1;
  const cantNum = parseInt(form.cantidad_vendida);
  const totalEstimado = !isNaN(cantNum) && form.peso_total_kg && form.precio_kg
    ? (parseFloat(form.peso_total_kg) * parseFloat(form.precio_kg)).toFixed(2)
    : null;

  const mut = useMutation({
    mutationFn: () => venderLote(lote!.id, {
      fecha: form.fecha,
      cantidad_vendida: cantNum,
      peso_total_kg: parseFloat(form.peso_total_kg),
      precio_kg: parseFloat(form.precio_kg),
      moneda: form.moneda,
      ...(form.notas ? { notas: form.notas } : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lotes", lote!.potrero_id] });
      const cerrado = cantNum === maxCantidad;
      toast({ title: cerrado ? "Venta registrada — lote cerrado" : "Venta registrada" });
      onClose();
      setForm({ fecha: todayStr(), cantidad_vendida: "", peso_total_kg: "", precio_kg: "", moneda: "USD", notas: "" });
    },
    onError: () => toast({ title: "Error al registrar venta", variant: "destructive" }),
  });

  const valid = form.fecha && form.peso_total_kg && form.precio_kg &&
    !isNaN(cantNum) && cantNum >= 1 && cantNum <= maxCantidad;

  return (
    <Dialog open={!!lote} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-agro-text text-sm">
            Registrar venta — {lote?.categoria} · {lote?.cantidad} cab.
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-agro-muted text-xs">Cantidad vendida * (máx {maxCantidad})</Label>
              <Input type="number" min={1} max={maxCantidad} value={form.cantidad_vendida} autoFocus
                onChange={set("cantidad_vendida")} className={INPUT_CLS} placeholder="0" />
            </div>
            <div>
              <Label className="text-agro-muted text-xs">Fecha *</Label>
              <Input type="date" value={form.fecha} onChange={set("fecha")} className={INPUT_CLS} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-agro-muted text-xs">Peso total (kg) *</Label>
              <Input type="number" min={0} step="0.1" value={form.peso_total_kg} onChange={set("peso_total_kg")}
                className={INPUT_CLS} placeholder="0.0" />
            </div>
            <div>
              <Label className="text-agro-muted text-xs">Precio / kg *</Label>
              <Input type="number" min={0} step="0.01" value={form.precio_kg} onChange={set("precio_kg")}
                className={INPUT_CLS} placeholder="0.00" />
            </div>
          </div>
          <div>
            <Label className="text-agro-muted text-xs">Moneda</Label>
            <select value={form.moneda} onChange={set("moneda")} className={SELECT_CLS}>
              <option value="USD">USD</option>
              <option value="UYU">UYU</option>
            </select>
          </div>
          {totalEstimado && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
              Total estimado: {form.moneda} {totalEstimado}
            </p>
          )}
          <div>
            <Label className="text-agro-muted text-xs">Notas</Label>
            <Input value={form.notas} onChange={set("notas")} className={INPUT_CLS} placeholder="Opcional..." />
          </div>
          <div className="flex gap-2 pt-1">
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!valid || mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? "Guardando..." : "Registrar venta"}
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

  const mut = useMutation({
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
              <select value={form.tipo} onChange={(e) => setForm(f => ({ ...f, tipo: e.target.value }))} className={SELECT_CLS}>
                <option value="tacto">Tacto</option>
                <option value="paricion">Parición</option>
                <option value="destete">Destete</option>
              </select>
            </div>
            <div>
              <Label className="text-agro-muted text-xs">Fecha *</Label>
              <Input type="date" value={form.fecha}
                onChange={(e) => setForm(f => ({ ...f, fecha: e.target.value }))} className={INPUT_CLS} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-agro-muted text-xs">Total vientres *</Label>
              <Input type="number" min={1} value={form.vientres_totales}
                onChange={(e) => setForm(f => ({ ...f, vientres_totales: e.target.value }))}
                className={INPUT_CLS} placeholder="0" />
            </div>
            <div>
              <Label className="text-agro-muted text-xs">Resultado *</Label>
              <Input type="number" min={0} value={form.resultado}
                onChange={(e) => setForm(f => ({ ...f, resultado: e.target.value }))}
                className={INPUT_CLS} placeholder="0" />
            </div>
          </div>
          <div>
            <Label className="text-agro-muted text-xs">Notas</Label>
            <Input value={form.notas} onChange={(e) => setForm(f => ({ ...f, notas: e.target.value }))}
              className={INPUT_CLS} placeholder="Opcional..." />
          </div>
          <div className="flex gap-2 pt-1">
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!valid || mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? "Guardando..." : "Guardar"}
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

  const mut = useMutation({
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
                className={INPUT_CLS} placeholder="2024/2025" />
            </div>
            <div>
              <Label className="text-agro-muted text-xs">Cultivo *</Label>
              <Input value={form.cultivo} onChange={set("cultivo")} className={INPUT_CLS} placeholder="Soja, Maíz..." />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-agro-muted text-xs">Fecha siembra</Label>
              <Input type="date" value={form.fecha_siembra} onChange={set("fecha_siembra")} className={INPUT_CLS} />
            </div>
            <div>
              <Label className="text-agro-muted text-xs">Fecha cosecha</Label>
              <Input type="date" value={form.fecha_cosecha} onChange={set("fecha_cosecha")} className={INPUT_CLS} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-agro-muted text-xs">Toneladas cosechadas</Label>
              <Input type="number" min={0} step="0.001" value={form.toneladas_cosechadas} onChange={set("toneladas_cosechadas")}
                className={INPUT_CLS} placeholder="0.000" />
            </div>
            <div>
              <Label className="text-agro-muted text-xs">Precio / tn</Label>
              <Input type="number" min={0} step="0.01" value={form.precio_venta_tn} onChange={set("precio_venta_tn")}
                className={INPUT_CLS} placeholder="0.00" />
            </div>
          </div>
          <div>
            <Label className="text-agro-muted text-xs">Moneda</Label>
            <select value={form.moneda} onChange={set("moneda")} className={SELECT_CLS}>
              <option value="USD">USD</option>
              <option value="UYU">UYU</option>
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!valid || mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? "Guardando..." : "Guardar"}
            </Button>
            <Button variant="outline" onClick={onClose} className="border-agro-accent/20 text-agro-muted">Cancelar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Lote row ──────────────────────────────────────────────────────────────────

function LoteRow({ lote, onMover, onDividir, onVender }: {
  lote: Lote;
  onMover: () => void;
  onDividir: () => void;
  onVender: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 text-xs">
      <div className="flex-1 min-w-0">
        <span className="font-medium text-agro-text capitalize">{lote.categoria}</span>
        <span className="text-agro-muted ml-1.5">{lote.cantidad} cab.</span>
        <span className="text-agro-muted ml-1.5">· Ent: {fmtDate(lote.fecha_entrada)}</span>
        {lote.kg_producidos != null && (
          <span className="text-agro-text ml-1.5">· {lote.kg_producidos.toFixed(0)} kg prod.</span>
        )}
        {lote.gdp_kg_dia != null && (
          <span className="text-agro-muted ml-1.5">GDP: {lote.gdp_kg_dia.toFixed(3)}</span>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button onClick={onMover}
          className="flex items-center gap-1 px-2 py-1 rounded text-blue-600 hover:bg-blue-50 transition-colors whitespace-nowrap">
          <ArrowRightLeft className="h-3 w-3" />Mover
        </button>
        <button onClick={onDividir}
          className="flex items-center gap-1 px-2 py-1 rounded text-amber-600 hover:bg-amber-50 transition-colors whitespace-nowrap">
          <Scissors className="h-3 w-3" />Dividir
        </button>
        <button onClick={onVender}
          className="flex items-center gap-1 px-2 py-1 rounded text-emerald-600 hover:bg-emerald-50 transition-colors whitespace-nowrap">
          <ShoppingCart className="h-3 w-3" />Vender
        </button>
      </div>
    </div>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

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

// ── Panel por potrero ─────────────────────────────────────────────────────────

const TIPO_LABEL: Record<string, string> = {
  ganaderia: "Ganadería", agricultura: "Agricultura", mixto: "Mixto",
};

function PotreroPanel({ potrero, potreros }: { potrero: Potrero; potreros: Potrero[] }) {
  const qc = useQueryClient();
  const isGan = potrero.tipo !== "agricultura";
  const isAgr = potrero.tipo === "agricultura";

  const [loteModalOpen, setLoteModalOpen] = useState(false);
  const [eventoModalOpen, setEventoModalOpen] = useState(false);
  const [cicloModalOpen, setCicloModalOpen] = useState(false);
  const [loteMover, setLoteMover] = useState<Lote | null>(null);
  const [loteDividir, setLoteDividir] = useState<Lote | null>(null);
  const [loteVender, setLoteVender] = useState<Lote | null>(null);

  const { data: lotes = [] } = useQuery({
    queryKey: ["lotes", potrero.id],
    queryFn: () => getLotes({ potrero_id: potrero.id }),
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
  const lotesConKg = lotes.filter(l => l.kg_producidos != null);
  const kgHa = ha && ha > 0 && lotesConKg.length > 0
    ? lotesConKg.reduce((s, l) => s + (l.kg_producidos ?? 0), 0) / ha
    : null;
  const gdpValues = lotes.filter(l => l.gdp_kg_dia != null).map(l => l.gdp_kg_dia!);
  const gdpAvg = gdpValues.length > 0 ? gdpValues.reduce((s, v) => s + v, 0) / gdpValues.length : null;
  const tasaRep = eventos[0]?.tasa_pct ?? null;
  const lastRinde = ciclos.find(c => c.rinde_tn_ha != null)?.rinde_tn_ha ?? null;

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
            <div className="border-b border-agro-accent/10">
              <SectionHeader title="Lotes de ganado" addLabel="Nuevo lote" onAdd={() => setLoteModalOpen(true)} />
              <div className="divide-y divide-agro-accent/10">
                {lotes.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-agro-muted italic">Sin lotes activos</p>
                ) : lotes.map(l => (
                  <LoteRow
                    key={l.id}
                    lote={l}
                    onMover={() => setLoteMover(l)}
                    onDividir={() => setLoteDividir(l)}
                    onVender={() => setLoteVender(l)}
                  />
                ))}
              </div>
            </div>

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
      <ModalEvento potreroId={potrero.id} open={eventoModalOpen} onClose={() => setEventoModalOpen(false)} />
      <ModalCiclo potreroId={potrero.id} open={cicloModalOpen} onClose={() => setCicloModalOpen(false)} />
      <ModalMoverLote lote={loteMover} potreros={potreros} onClose={() => setLoteMover(null)} />
      <ModalDividirLote lote={loteDividir} potreros={potreros} onClose={() => setLoteDividir(null)} />
      <ModalVenderLote lote={loteVender} onClose={() => setLoteVender(null)} />
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
          {potreros.map(p => <PotreroPanel key={p.id} potrero={p} potreros={potreros} />)}
        </div>
      )}
    </div>
  );
}
