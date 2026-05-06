import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, AlertTriangle, Wallet, Plus,
  ChevronDown, ChevronUp, Phone, Mail, FileText,
  CheckCircle2, Clock, Loader2, Users, Truck,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { getFlujoCaja } from "@/lib/dashboardApi";
import {
  getClientes, createCliente, updateCliente, deleteCliente,
  getCuentas, createCuenta, pagarCuenta,
} from "@/lib/clientesApi";
import {
  getProveedores, createProveedor, updateProveedor, deleteProveedor,
  getCuentasPagar, createCuentaPagar, pagarCuentaPagar,
} from "@/lib/proveedoresApi";
import { useAuthStore } from "@/store/authStore";
import { toast } from "@/hooks/useToast";
import { parseApiError } from "@/lib/authApi";
import type { ItemFlujo } from "@/types/dashboard";
import type { Cliente, CuentaCobrar, Proveedor, CuentaPagar } from "@/types/clientes";

// ── Types ─────────────────────────────────────────────────────────────────────

type MainTab = "resumen" | "cobros" | "pagos";

// ── Schemas ───────────────────────────────────────────────────────────────────

const entidadSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  telefono: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  notas: z.string().optional(),
});
type EntidadFormData = z.infer<typeof entidadSchema>;

const cuentaSchema = z.object({
  monto: z.coerce.number().positive("El monto debe ser mayor a 0"),
  moneda: z.enum(["UYU", "USD"]).default("UYU"),
  descripcion: z.string().optional(),
  fecha_vencimiento: z.string().optional(),
});
type CuentaFormData = z.infer<typeof cuentaSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(value: number, moneda: string): string {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: moneda === "USD" ? "USD" : "UYU",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("T")[0].split("-");
  return `${day}/${month}/${year}`;
}

function isVencida(fecha?: string): boolean {
  if (!fecha) return false;
  return new Date(fecha) < new Date();
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-agro-accent/20 ${className}`} />;
}

// ── Resumen helpers ───────────────────────────────────────────────────────────

function Diasbadge({ dias, tipo }: { dias: number | null; tipo: "cobro" | "pago" }) {
  if (dias === null)
    return <span className="text-xs px-2 py-0.5 rounded-full bg-agro-accent/20 text-agro-muted">Sin fecha</span>;
  if (dias <= 7)
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${tipo === "cobro" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
        {dias === 0 ? "Hoy" : `${dias}d`}
      </span>
    );
  if (dias <= 30)
    return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">{dias}d</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-agro-accent/20 text-agro-muted">{dias}d</span>;
}

function KpiCard({ title, value, icon, color }: { title: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-agro-muted">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function PendingTable({ items, tipo }: { items: ItemFlujo[]; tipo: "cobro" | "pago" }) {
  const moneda = useAuthStore((s) => s.user?.moneda ?? "UYU");
  const label = tipo === "cobro" ? "Cliente" : "Proveedor";
  if (items.length === 0)
    return <p className="text-agro-muted text-sm italic px-4 py-3">Sin {tipo === "cobro" ? "cobros" : "pagos"} pendientes.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-agro-accent/20 bg-agro-bg/50">
            <th className="text-left text-agro-muted font-medium px-3 py-2">{label}</th>
            <th className="text-left text-agro-muted font-medium px-3 py-2 hidden sm:table-cell">Descripción</th>
            <th className="text-right text-agro-muted font-medium px-3 py-2">Monto</th>
            <th className="text-right text-agro-muted font-medium px-3 py-2">Vencimiento</th>
            <th className="text-right text-agro-muted font-medium px-3 py-2">Días</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-agro-accent/10">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-agro-bg/40 transition-colors">
              <td className="px-3 py-2.5 font-medium text-agro-text">{item.contraparte}</td>
              <td className="px-3 py-2.5 text-agro-muted hidden sm:table-cell truncate max-w-[180px]">{item.descripcion ?? "—"}</td>
              <td className="px-3 py-2.5 text-right font-medium text-agro-text">{fmt(item.monto, item.moneda ?? moneda)}</td>
              <td className="px-3 py-2.5 text-right text-agro-muted">{fmtFecha(item.fecha_vencimiento)}</td>
              <td className="px-3 py-2.5 text-right"><Diasbadge dias={item.dias_restantes} tipo={tipo} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VencidosSection({ cobrosV, pagosV }: { cobrosV: ItemFlujo[]; pagosV: ItemFlujo[] }) {
  const moneda = useAuthStore((s) => s.user?.moneda ?? "UYU");
  const [tab, setTab] = useState<"cobros" | "pagos">("cobros");
  return (
    <Card className="border-red-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-red-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Items vencidos
        </CardTitle>
        <div className="flex gap-2 mt-2">
          <button onClick={() => setTab("cobros")}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${tab === "cobros" ? "bg-red-600 text-white border-red-600" : "text-agro-muted border-agro-accent/30 hover:border-red-300"}`}>
            Cobros vencidos ({cobrosV.length})
          </button>
          <button onClick={() => setTab("pagos")}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${tab === "pagos" ? "bg-red-600 text-white border-red-600" : "text-agro-muted border-agro-accent/30 hover:border-red-300"}`}>
            Pagos vencidos ({pagosV.length})
          </button>
        </div>
      </CardHeader>
      <CardContent className="p-0 pb-3">
        {(tab === "cobros" ? cobrosV : pagosV).map((item) => (
          <div key={item.id} className="flex items-start justify-between px-4 py-2.5 border-b border-agro-accent/10 last:border-0">
            <div className="min-w-0">
              <p className="text-sm font-medium text-agro-text">{item.contraparte}</p>
              {item.descripcion && <p className="text-xs text-agro-muted truncate">{item.descripcion}</p>}
            </div>
            <div className="text-right ml-4 shrink-0">
              <p className="text-sm font-semibold text-agro-text">{fmt(item.monto, item.moneda ?? moneda)}</p>
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                Vencido hace {Math.abs(item.dias_restantes ?? 0)}d
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-agro-accent/20 rounded-lg p-3 text-xs shadow-xl">
      <p className="font-medium text-agro-text mb-1">{label}</p>
      {payload.map((entry: any) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: {new Intl.NumberFormat("es-UY", { maximumFractionDigits: 0 }).format(entry.value)}
        </p>
      ))}
    </div>
  );
}

// ── Shared cuenta status badge ────────────────────────────────────────────────

function StatusBadge({ pagado, vencida }: { pagado: boolean; vencida: boolean }) {
  if (pagado)
    return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"><CheckCircle2 className="h-3 w-3" />Pagado</span>;
  if (vencida)
    return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30"><Clock className="h-3 w-3" />Vencida</span>;
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30"><Clock className="h-3 w-3" />Pendiente</span>;
}

// ── Cobros tab components ─────────────────────────────────────────────────────

function ClienteModal({ open, onClose, editing }: { open: boolean; onClose: () => void; editing?: Cliente | null }) {
  const queryClient = useQueryClient();
  const isEdit = !!editing;
  const { register, handleSubmit, reset, formState: { errors } } = useForm<EntidadFormData>({
    resolver: zodResolver(entidadSchema),
    defaultValues: { nombre: "", telefono: "", email: "", notas: "" },
  });

  useState(() => {
    if (open) reset(editing ? { nombre: editing.nombre, telefono: editing.telefono ?? "", email: editing.email ?? "", notas: editing.notas ?? "" } : { nombre: "", telefono: "", email: "", notas: "" });
  });

  const mutation = useMutation({
    mutationFn: (data: EntidadFormData) => {
      const payload = { nombre: data.nombre, telefono: data.telefono || undefined, email: data.email || undefined, notas: data.notas || undefined };
      return isEdit ? updateCliente(editing!.id, payload) : createCliente(payload);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["clientes"] }); toast({ title: isEdit ? "Cliente actualizado" : "Cliente creado" }); onClose(); },
    onError: (err) => toast({ title: "Error", description: parseApiError(err), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          <DialogDescription>{isEdit ? "Modificá los datos del cliente." : "Completá los datos para agregar un cliente."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input placeholder="Nombre del cliente" {...register("nombre")} />
            {errors.nombre && <p className="text-xs text-red-400">{errors.nombre.message}</p>}
          </div>
          <div className="space-y-1.5"><Label>Teléfono</Label><Input placeholder="+598 99 000 000" {...register("telefono")} /></div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" placeholder="cliente@email.com" {...register("email")} />
            {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5"><Label>Notas</Label><Input placeholder="Observaciones..." {...register("notas")} /></div>
          <Separator />
          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Guardar cambios" : "Crear cliente"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CuentaCobraModal({ open, onClose, clienteId, defaultMoneda = "UYU" }: { open: boolean; onClose: () => void; clienteId: number; defaultMoneda?: string }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<CuentaFormData>({
    resolver: zodResolver(cuentaSchema),
    defaultValues: { moneda: defaultMoneda as "UYU" | "USD" },
  });
  const moneda = watch("moneda");

  const mutation = useMutation({
    mutationFn: (data: CuentaFormData) => createCuenta(clienteId, { monto: data.monto, moneda: data.moneda, descripcion: data.descripcion || undefined, fecha_vencimiento: data.fecha_vencimiento || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["cuentas", clienteId] }); toast({ title: "Cuenta creada" }); reset({ moneda: defaultMoneda as "UYU" | "USD" }); onClose(); },
    onError: (err) => toast({ title: "Error", description: parseApiError(err), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva cuenta por cobrar</DialogTitle>
          <DialogDescription>Registrá una deuda pendiente del cliente.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Moneda</Label>
            <div className="flex rounded-lg border border-slate-700 overflow-hidden">
              {(["UYU", "USD"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setValue("moneda", m)}
                  className={`flex-1 py-1.5 text-sm font-medium transition-colors ${moneda === m ? "bg-brand-500/20 text-brand-400" : "text-agro-muted hover:bg-slate-800"}`}>
                  {m === "UYU" ? "$ UYU" : "US$ USD"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Monto *</Label>
            <Input type="number" step="0.01" min="0.01" placeholder="0.00" {...register("monto")} />
            {errors.monto && <p className="text-xs text-red-400">{errors.monto.message}</p>}
          </div>
          <div className="space-y-1.5"><Label>Descripción</Label><Input placeholder="Concepto..." {...register("descripcion")} /></div>
          <div className="space-y-1.5"><Label>Fecha de vencimiento</Label><Input type="date" {...register("fecha_vencimiento")} /></div>
          <Separator />
          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Crear cuenta
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CuentaCobraRow({ cuenta, clienteId }: { cuenta: CuentaCobrar; clienteId: number }) {
  const queryClient = useQueryClient();
  const pagarMutation = useMutation({
    mutationFn: () => pagarCuenta(cuenta.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["cuentas", clienteId] }); toast({ title: "Cuenta marcada como pagada" }); },
    onError: (err) => toast({ title: "Error", description: parseApiError(err), variant: "destructive" }),
  });
  const vencida = !cuenta.pagado && isVencida(cuenta.fecha_vencimiento);
  return (
    <div className="flex items-center justify-between bg-agro-bg rounded-lg px-4 py-3 gap-3">
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-agro-text">{fmt(cuenta.monto, cuenta.moneda)}</span>
          <StatusBadge pagado={cuenta.pagado} vencida={vencida} />
        </div>
        {cuenta.descripcion && <p className="text-sm text-agro-muted truncate">{cuenta.descripcion}</p>}
        {cuenta.fecha_vencimiento && <p className={`text-xs ${vencida ? "text-red-400" : "text-agro-muted"}`}>Vence: {fmtFecha(cuenta.fecha_vencimiento)}</p>}
      </div>
      {!cuenta.pagado && (
        <Button size="sm" variant="outline" onClick={() => pagarMutation.mutate()} disabled={pagarMutation.isPending}
          className="shrink-0 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10">
          {pagarMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          <span className="ml-1.5 hidden sm:inline">Marcar pagado</span>
        </Button>
      )}
    </div>
  );
}

function ClienteCard({ cliente, onEdit, onDelete, defaultMoneda }: { cliente: Cliente; onEdit: (c: Cliente) => void; onDelete: (c: Cliente) => void; defaultMoneda: string }) {
  const [expanded, setExpanded] = useState(false);
  const [cuentaModalOpen, setCuentaModalOpen] = useState(false);
  const { data: cuentas = [], isLoading } = useQuery({ queryKey: ["cuentas", cliente.id], queryFn: () => getCuentas(cliente.id), enabled: expanded });
  const pendientes = cuentas.filter((c) => !c.pagado);
  const totalPendiente = pendientes.reduce((acc, c) => acc + c.monto, 0);
  const monedaPendiente = pendientes[0]?.moneda ?? defaultMoneda;

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="pb-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-agro-text text-base truncate">{cliente.nombre}</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                {cliente.telefono && <span className="flex items-center gap-1 text-xs text-agro-muted"><Phone className="h-3 w-3" />{cliente.telefono}</span>}
                {cliente.email && <span className="flex items-center gap-1 text-xs text-agro-muted"><Mail className="h-3 w-3" />{cliente.email}</span>}
              </div>
              {cliente.notas && <p className="flex items-center gap-1 text-xs text-agro-muted mt-1 truncate"><FileText className="h-3 w-3 shrink-0" />{cliente.notas}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {pendientes.length > 0 && (
                <div className="text-right">
                  <p className="text-xs text-agro-muted">Pendiente</p>
                  <p className="text-sm font-semibold text-amber-400">{fmt(totalPendiente, monedaPendiente)}</p>
                </div>
              )}
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="text-agro-muted hover:text-slate-200 px-2" onClick={() => onEdit(cliente)}>Editar</Button>
                <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 px-2" onClick={() => onDelete(cliente)}>Eliminar</Button>
              </div>
              <button onClick={() => setExpanded((v) => !v)} className="p-1.5 rounded-md text-agro-muted hover:text-slate-200 hover:bg-slate-700 transition-colors">
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </CardHeader>
        {expanded && (
          <CardContent className="pt-4 space-y-3">
            <Separator />
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-agro-text">
                Cuentas por cobrar
                {pendientes.length > 0 && <span className="ml-2 text-xs text-amber-400">({pendientes.length} pendiente{pendientes.length > 1 ? "s" : ""})</span>}
              </p>
              <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => setCuentaModalOpen(true)}>
                <Plus className="h-3 w-3" />Nueva cuenta
              </Button>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-agro-muted" /></div>
            ) : cuentas.length === 0 ? (
              <p className="text-sm text-agro-muted text-center py-4">Sin cuentas por cobrar registradas.</p>
            ) : (
              <div className="space-y-2">{cuentas.map((c) => <CuentaCobraRow key={c.id} cuenta={c} clienteId={cliente.id} />)}</div>
            )}
          </CardContent>
        )}
      </Card>
      <CuentaCobraModal open={cuentaModalOpen} onClose={() => setCuentaModalOpen(false)} clienteId={cliente.id} defaultMoneda={defaultMoneda} />
    </>
  );
}

// ── Pagos tab components ──────────────────────────────────────────────────────

function ProveedorModal({ open, onClose, editing }: { open: boolean; onClose: () => void; editing?: Proveedor | null }) {
  const queryClient = useQueryClient();
  const isEdit = !!editing;
  const { register, handleSubmit, reset, formState: { errors } } = useForm<EntidadFormData>({
    resolver: zodResolver(entidadSchema),
    defaultValues: { nombre: "", telefono: "", email: "", notas: "" },
  });

  useState(() => {
    if (open) reset(editing ? { nombre: editing.nombre, telefono: editing.telefono ?? "", email: editing.email ?? "", notas: editing.notas ?? "" } : { nombre: "", telefono: "", email: "", notas: "" });
  });

  const mutation = useMutation({
    mutationFn: (data: EntidadFormData) => {
      const payload = { nombre: data.nombre, telefono: data.telefono || undefined, email: data.email || undefined, notas: data.notas || undefined };
      return isEdit ? updateProveedor(editing!.id, payload) : createProveedor(payload);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["proveedores"] }); toast({ title: isEdit ? "Proveedor actualizado" : "Proveedor creado" }); onClose(); },
    onError: (err) => toast({ title: "Error", description: parseApiError(err), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
          <DialogDescription>{isEdit ? "Modificá los datos del proveedor." : "Completá los datos para agregar un proveedor."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre *</Label>
            <Input placeholder="Nombre del proveedor" {...register("nombre")} />
            {errors.nombre && <p className="text-xs text-red-400">{errors.nombre.message}</p>}
          </div>
          <div className="space-y-1.5"><Label>Teléfono</Label><Input placeholder="+598 99 000 000" {...register("telefono")} /></div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" placeholder="proveedor@email.com" {...register("email")} />
            {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5"><Label>Notas</Label><Input placeholder="Observaciones..." {...register("notas")} /></div>
          <Separator />
          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Guardar cambios" : "Crear proveedor"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CuentaPagarModal({ open, onClose, proveedorId, defaultMoneda = "UYU" }: { open: boolean; onClose: () => void; proveedorId: number; defaultMoneda?: string }) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<CuentaFormData>({
    resolver: zodResolver(cuentaSchema),
    defaultValues: { moneda: defaultMoneda as "UYU" | "USD" },
  });
  const moneda = watch("moneda");

  const mutation = useMutation({
    mutationFn: (data: CuentaFormData) => createCuentaPagar(proveedorId, { monto: data.monto, moneda: data.moneda, descripcion: data.descripcion || undefined, fecha_vencimiento: data.fecha_vencimiento || undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["cuentas-pagar", proveedorId] }); toast({ title: "Cuenta por pagar creada" }); reset({ moneda: defaultMoneda as "UYU" | "USD" }); onClose(); },
    onError: (err) => toast({ title: "Error", description: parseApiError(err), variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva cuenta por pagar</DialogTitle>
          <DialogDescription>Registrá una deuda pendiente con el proveedor.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Moneda</Label>
            <div className="flex rounded-lg border border-slate-700 overflow-hidden">
              {(["UYU", "USD"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setValue("moneda", m)}
                  className={`flex-1 py-1.5 text-sm font-medium transition-colors ${moneda === m ? "bg-brand-500/20 text-brand-400" : "text-agro-muted hover:bg-slate-800"}`}>
                  {m === "UYU" ? "$ UYU" : "US$ USD"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Monto *</Label>
            <Input type="number" step="0.01" min="0.01" placeholder="0.00" {...register("monto")} />
            {errors.monto && <p className="text-xs text-red-400">{errors.monto.message}</p>}
          </div>
          <div className="space-y-1.5"><Label>Descripción</Label><Input placeholder="Concepto..." {...register("descripcion")} /></div>
          <div className="space-y-1.5"><Label>Fecha de vencimiento</Label><Input type="date" {...register("fecha_vencimiento")} /></div>
          <Separator />
          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">Cancelar</Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Crear cuenta
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CuentaPagarRow({ cuenta, proveedorId }: { cuenta: CuentaPagar; proveedorId: number }) {
  const queryClient = useQueryClient();
  const pagarMutation = useMutation({
    mutationFn: () => pagarCuentaPagar(cuenta.id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["cuentas-pagar", proveedorId] }); toast({ title: "Cuenta marcada como pagada" }); },
    onError: (err) => toast({ title: "Error", description: parseApiError(err), variant: "destructive" }),
  });
  const vencida = !cuenta.pagado && isVencida(cuenta.fecha_vencimiento);
  return (
    <div className="flex items-center justify-between bg-agro-bg rounded-lg px-4 py-3 gap-3">
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-agro-text">{fmt(cuenta.monto, cuenta.moneda)}</span>
          <StatusBadge pagado={cuenta.pagado} vencida={vencida} />
        </div>
        {cuenta.descripcion && <p className="text-sm text-agro-muted truncate">{cuenta.descripcion}</p>}
        {cuenta.fecha_vencimiento && <p className={`text-xs ${vencida ? "text-red-400" : "text-agro-muted"}`}>Vence: {fmtFecha(cuenta.fecha_vencimiento)}</p>}
      </div>
      {!cuenta.pagado && (
        <Button size="sm" variant="outline" onClick={() => pagarMutation.mutate()} disabled={pagarMutation.isPending}
          className="shrink-0 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10">
          {pagarMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          <span className="ml-1.5 hidden sm:inline">Marcar pagado</span>
        </Button>
      )}
    </div>
  );
}

function ProveedorCard({ proveedor, onEdit, onDelete, defaultMoneda }: { proveedor: Proveedor; onEdit: (p: Proveedor) => void; onDelete: (p: Proveedor) => void; defaultMoneda: string }) {
  const [expanded, setExpanded] = useState(false);
  const [cuentaModalOpen, setCuentaModalOpen] = useState(false);
  const { data: cuentas = [], isLoading } = useQuery({ queryKey: ["cuentas-pagar", proveedor.id], queryFn: () => getCuentasPagar(proveedor.id), enabled: expanded });
  const pendientes = cuentas.filter((c) => !c.pagado);
  const totalPendiente = pendientes.reduce((acc, c) => acc + c.monto, 0);
  const monedaPendiente = pendientes[0]?.moneda ?? defaultMoneda;

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader className="pb-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-agro-text text-base truncate">{proveedor.nombre}</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                {proveedor.telefono && <span className="flex items-center gap-1 text-xs text-agro-muted"><Phone className="h-3 w-3" />{proveedor.telefono}</span>}
                {proveedor.email && <span className="flex items-center gap-1 text-xs text-agro-muted"><Mail className="h-3 w-3" />{proveedor.email}</span>}
              </div>
              {proveedor.notas && <p className="flex items-center gap-1 text-xs text-agro-muted mt-1 truncate"><FileText className="h-3 w-3 shrink-0" />{proveedor.notas}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {pendientes.length > 0 && (
                <div className="text-right">
                  <p className="text-xs text-agro-muted">Por pagar</p>
                  <p className="text-sm font-semibold text-red-400">{fmt(totalPendiente, monedaPendiente)}</p>
                </div>
              )}
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="text-agro-muted hover:text-slate-200 px-2" onClick={() => onEdit(proveedor)}>Editar</Button>
                <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300 px-2" onClick={() => onDelete(proveedor)}>Eliminar</Button>
              </div>
              <button onClick={() => setExpanded((v) => !v)} className="p-1.5 rounded-md text-agro-muted hover:text-slate-200 hover:bg-slate-700 transition-colors">
                {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </CardHeader>
        {expanded && (
          <CardContent className="pt-4 space-y-3">
            <Separator />
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-agro-text">
                Cuentas por pagar
                {pendientes.length > 0 && <span className="ml-2 text-xs text-red-400">({pendientes.length} pendiente{pendientes.length > 1 ? "s" : ""})</span>}
              </p>
              <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => setCuentaModalOpen(true)}>
                <Plus className="h-3 w-3" />Nueva cuenta
              </Button>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-agro-muted" /></div>
            ) : cuentas.length === 0 ? (
              <p className="text-sm text-agro-muted text-center py-4">Sin cuentas por pagar registradas.</p>
            ) : (
              <div className="space-y-2">{cuentas.map((c) => <CuentaPagarRow key={c.id} cuenta={c} proveedorId={proveedor.id} />)}</div>
            )}
          </CardContent>
        )}
      </Card>
      <CuentaPagarModal open={cuentaModalOpen} onClose={() => setCuentaModalOpen(false)} proveedorId={proveedor.id} defaultMoneda={defaultMoneda} />
    </>
  );
}

// ── Tab panels ────────────────────────────────────────────────────────────────

function ResumenTab({ data, moneda }: { data: any; moneda: string }) {
  const hayVencidos = data.cobros_vencidos.length > 0 || data.pagos_vencidos.length > 0;
  const hayResumen = data.total_por_cobrar > 0 || data.total_por_pagar > 0;
  return (
    <div className="space-y-6">
      {data.alerta_liquidez && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 font-medium">
            Alerta: tu flujo de caja proyectado entra en negativo en las próximas semanas. Revisá tus pagos pendientes.
          </p>
        </div>
      )}
      {hayResumen && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard title="Por cobrar" value={fmt(data.total_por_cobrar, moneda)} icon={<TrendingUp className="h-5 w-5 text-emerald-400" />} color="text-emerald-600" />
          <KpiCard title="Por pagar" value={fmt(data.total_por_pagar, moneda)} icon={<TrendingDown className="h-5 w-5 text-red-400" />} color="text-red-600" />
          <KpiCard title="Balance proyectado" value={fmt(data.balance_proyectado, moneda)}
            icon={<Wallet className={`h-5 w-5 ${data.balance_proyectado >= 0 ? "text-emerald-400" : "text-red-400"}`} />}
            color={data.balance_proyectado >= 0 ? "text-emerald-600" : "text-red-600"} />
        </div>
      )}
      {hayResumen && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-agro-text">Proyección semanal (13 semanas)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={data.semanas} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="semana_label" tick={{ fontSize: 9, fill: "#94a3b8" }} angle={-30} textAnchor="end" height={52} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} width={60} tickFormatter={(v) => new Intl.NumberFormat("es-UY", { notation: "compact" }).format(v)} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="cobros" name="Cobros" fill="#10b981" opacity={0.85} radius={[3, 3, 0, 0]} />
                <Bar dataKey="pagos" name="Pagos" fill="#ef4444" opacity={0.85} radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="balance_acumulado" name="Balance acumulado" stroke="#6366f1" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
      {hayVencidos && <VencidosSection cobrosV={data.cobros_vencidos} pagosV={data.pagos_vencidos} />}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-agro-text flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />Cobros pendientes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2"><PendingTable items={data.cobros_pendientes} tipo="cobro" /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-agro-text flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />Pagos pendientes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 pb-2"><PendingTable items={data.pagos_pendientes} tipo="pago" /></CardContent>
        </Card>
      </div>
    </div>
  );
}

function CobrosTab({ defaultMoneda }: { defaultMoneda: string }) {
  const queryClient = useQueryClient();
  const [clienteModalOpen, setClienteModalOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [deletingCliente, setDeletingCliente] = useState<Cliente | null>(null);
  const { data: clientes = [], isLoading } = useQuery({ queryKey: ["clientes"], queryFn: getClientes });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteCliente(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["clientes"] }); toast({ title: "Cliente eliminado" }); setDeletingCliente(null); },
    onError: (err) => toast({ title: "Error", description: parseApiError(err), variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-agro-muted text-sm">Gestioná tus clientes y cuentas por cobrar</p>
        <Button onClick={() => { setEditingCliente(null); setClienteModalOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" />Nuevo cliente
        </Button>
      </div>
      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-agro-accent/20 animate-pulse" />)}</div>
      ) : clientes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
          <Users className="h-12 w-12 text-agro-accent" />
          <h2 className="text-lg font-semibold text-agro-text">Sin clientes</h2>
          <p className="text-agro-muted max-w-xs text-sm">Agregá tu primer cliente para registrar cuentas por cobrar.</p>
          <Button onClick={() => { setEditingCliente(null); setClienteModalOpen(true); }} className="gap-2 mt-2">
            <Plus className="h-4 w-4" />Nuevo cliente
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {clientes.map((c) => (
            <ClienteCard key={c.id} cliente={c}
              onEdit={(c) => { setEditingCliente(c); setClienteModalOpen(true); }}
              onDelete={setDeletingCliente}
              defaultMoneda={defaultMoneda} />
          ))}
        </div>
      )}
      <ClienteModal open={clienteModalOpen} onClose={() => { setClienteModalOpen(false); setEditingCliente(null); }} editing={editingCliente} />
      <Dialog open={!!deletingCliente} onOpenChange={(v) => !v && setDeletingCliente(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar cliente</DialogTitle>
            <DialogDescription>¿Confirmás que querés eliminar a <span className="font-semibold text-agro-text">{deletingCliente?.nombre}</span>? Esta acción eliminará también todas sus cuentas por cobrar y no se puede deshacer.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" onClick={() => setDeletingCliente(null)} className="flex-1">Cancelar</Button>
            <Button variant="destructive" onClick={() => deletingCliente && deleteMutation.mutate(deletingCliente.id)} disabled={deleteMutation.isPending} className="flex-1">
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PagosTab({ defaultMoneda }: { defaultMoneda: string }) {
  const queryClient = useQueryClient();
  const [proveedorModalOpen, setProveedorModalOpen] = useState(false);
  const [editingProveedor, setEditingProveedor] = useState<Proveedor | null>(null);
  const [deletingProveedor, setDeletingProveedor] = useState<Proveedor | null>(null);
  const { data: proveedores = [], isLoading } = useQuery({ queryKey: ["proveedores"], queryFn: getProveedores });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteProveedor(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["proveedores"] }); toast({ title: "Proveedor eliminado" }); setDeletingProveedor(null); },
    onError: (err) => toast({ title: "Error", description: parseApiError(err), variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-agro-muted text-sm">Gestioná tus proveedores y cuentas por pagar</p>
        <Button onClick={() => { setEditingProveedor(null); setProveedorModalOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" />Nuevo proveedor
        </Button>
      </div>
      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-agro-accent/20 animate-pulse" />)}</div>
      ) : proveedores.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
          <Truck className="h-12 w-12 text-agro-accent" />
          <h2 className="text-lg font-semibold text-agro-text">Sin proveedores</h2>
          <p className="text-agro-muted max-w-xs text-sm">Agregá tu primer proveedor para registrar cuentas por pagar.</p>
          <Button onClick={() => { setEditingProveedor(null); setProveedorModalOpen(true); }} className="gap-2 mt-2">
            <Plus className="h-4 w-4" />Nuevo proveedor
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {proveedores.map((p) => (
            <ProveedorCard key={p.id} proveedor={p}
              onEdit={(p) => { setEditingProveedor(p); setProveedorModalOpen(true); }}
              onDelete={setDeletingProveedor}
              defaultMoneda={defaultMoneda} />
          ))}
        </div>
      )}
      <ProveedorModal open={proveedorModalOpen} onClose={() => { setProveedorModalOpen(false); setEditingProveedor(null); }} editing={editingProveedor} />
      <Dialog open={!!deletingProveedor} onOpenChange={(v) => !v && setDeletingProveedor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar proveedor</DialogTitle>
            <DialogDescription>¿Confirmás que querés eliminar a <span className="font-semibold text-agro-text">{deletingProveedor?.nombre}</span>? Esta acción eliminará también todas sus cuentas por pagar y no se puede deshacer.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button variant="ghost" onClick={() => setDeletingProveedor(null)} className="flex-1">Cancelar</Button>
            <Button variant="destructive" onClick={() => deletingProveedor && deleteMutation.mutate(deletingProveedor.id)} disabled={deleteMutation.isPending} className="flex-1">
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FlujoCajaPage() {
  const { user } = useAuthStore();
  const moneda = user?.moneda ?? "UYU";
  const [activeTab, setActiveTab] = useState<MainTab>("resumen");

  const { data, isLoading } = useQuery({
    queryKey: ["flujo-caja"],
    queryFn: getFlujoCaja,
    staleTime: 1000 * 60 * 5,
    select: (d) => ({
      ...d,
      total_por_cobrar: parseFloat(String(d.total_por_cobrar)),
      total_por_pagar: parseFloat(String(d.total_por_pagar)),
      balance_proyectado: parseFloat(String(d.balance_proyectado)),
      cobros_pendientes: (d.cobros_pendientes ?? []).map((c) => ({ ...c, monto: parseFloat(String(c.monto)), dias_restantes: c.dias_restantes != null ? Number(c.dias_restantes) : null })),
      pagos_pendientes: (d.pagos_pendientes ?? []).map((p) => ({ ...p, monto: parseFloat(String(p.monto)), dias_restantes: p.dias_restantes != null ? Number(p.dias_restantes) : null })),
      cobros_vencidos: (d.cobros_vencidos ?? []).map((c) => ({ ...c, monto: parseFloat(String(c.monto)), dias_restantes: c.dias_restantes != null ? Number(c.dias_restantes) : null })),
      pagos_vencidos: (d.pagos_vencidos ?? []).map((p) => ({ ...p, monto: parseFloat(String(p.monto)), dias_restantes: p.dias_restantes != null ? Number(p.dias_restantes) : null })),
      semanas: (d.semanas ?? []).map((s) => ({ ...s, cobros: parseFloat(String(s.cobros)), pagos: parseFloat(String(s.pagos)), balance_semana: parseFloat(String(s.balance_semana)), balance_acumulado: parseFloat(String(s.balance_acumulado)) })),
    }),
  });

  const TABS: { key: MainTab; label: string }[] = [
    { key: "resumen", label: "Resumen" },
    { key: "cobros", label: "Cobros" },
    { key: "pagos", label: "Pagos" },
  ];

  return (
    <div className="p-6 space-y-6 page-fade">
      <div>
        <h1 className="text-2xl font-bold text-agro-text">Flujo de Caja</h1>
        <p className="text-agro-muted text-sm mt-1">Cobros, pagos y gestión de clientes y proveedores.</p>
      </div>

      <div className="flex gap-1 border-b border-agro-accent/20">
        {TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === key ? "border-agro-primary text-agro-primary" : "border-transparent text-agro-muted hover:text-agro-text"}`}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === "resumen" && (
        isLoading || !data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
            </div>
            <Skeleton className="h-64" />
            <Skeleton className="h-48" />
          </div>
        ) : <ResumenTab data={data} moneda={moneda} />
      )}
      {activeTab === "cobros" && <CobrosTab defaultMoneda={moneda} />}
      {activeTab === "pagos" && <PagosTab defaultMoneda={moneda} />}
    </div>
  );
}
