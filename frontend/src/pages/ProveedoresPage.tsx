import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  ChevronDown,
  ChevronUp,
  Phone,
  Mail,
  FileText,
  CheckCircle2,
  Clock,
  Loader2,
  Truck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/useToast";
import { parseApiError } from "@/lib/authApi";
import {
  getProveedores,
  createProveedor,
  updateProveedor,
  deleteProveedor,
  getCuentasPagar,
  createCuentaPagar,
  pagarCuentaPagar,
} from "@/lib/proveedoresApi";
import { useAuthStore } from "@/store/authStore";
import type { Proveedor, CuentaPagar } from "@/types/clientes";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMoneda(value: number, moneda: string): string {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: moneda === "USD" ? "USD" : "UYU",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatFecha(iso: string): string {
  const [year, month, day] = iso.split("T")[0].split("-");
  return `${day}/${month}/${year}`;
}

function isVencida(fecha?: string): boolean {
  if (!fecha) return false;
  return new Date(fecha) < new Date();
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const proveedorSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  telefono: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  notas: z.string().optional(),
});

type ProveedorForm = z.infer<typeof proveedorSchema>;

const cuentaSchema = z.object({
  monto: z.coerce.number().positive("El monto debe ser mayor a 0"),
  moneda: z.enum(["UYU", "USD"]).default("UYU"),
  descripcion: z.string().optional(),
  fecha_vencimiento: z.string().optional(),
});

type CuentaForm = z.infer<typeof cuentaSchema>;

// ── Modal Proveedor ───────────────────────────────────────────────────────────

interface ProveedorModalProps {
  open: boolean;
  onClose: () => void;
  editing?: Proveedor | null;
}

function ProveedorModal({ open, onClose, editing }: ProveedorModalProps) {
  const queryClient = useQueryClient();
  const isEdit = !!editing;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProveedorForm>({
    resolver: zodResolver(proveedorSchema),
    defaultValues: { nombre: "", telefono: "", email: "", notas: "" },
  });

  useState(() => {
    if (open) {
      reset(
        editing
          ? { nombre: editing.nombre, telefono: editing.telefono ?? "", email: editing.email ?? "", notas: editing.notas ?? "" }
          : { nombre: "", telefono: "", email: "", notas: "" }
      );
    }
  });

  const mutation = useMutation({
    mutationFn: (data: ProveedorForm) => {
      const payload = {
        nombre: data.nombre,
        telefono: data.telefono || undefined,
        email: data.email || undefined,
        notas: data.notas || undefined,
      };
      return isEdit ? updateProveedor(editing!.id, payload) : createProveedor(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proveedores"] });
      toast({ title: isEdit ? "Proveedor actualizado" : "Proveedor creado" });
      onClose();
    },
    onError: (err) => {
      toast({ title: "Error", description: parseApiError(err), variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Modificá los datos del proveedor." : "Completá los datos para agregar un proveedor."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre *</Label>
            <Input id="nombre" placeholder="Nombre del proveedor" {...register("nombre")} />
            {errors.nombre && <p className="text-xs text-red-400">{errors.nombre.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="telefono">Teléfono</Label>
            <Input id="telefono" placeholder="+598 99 000 000" {...register("telefono")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="proveedor@email.com" {...register("email")} />
            {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notas">Notas</Label>
            <Input id="notas" placeholder="Observaciones..." {...register("notas")} />
          </div>

          <Separator />

          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
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

// ── Modal Cuenta por pagar ────────────────────────────────────────────────────

interface CuentaModalProps {
  open: boolean;
  onClose: () => void;
  proveedorId: number;
  defaultMoneda?: string;
}

function CuentaModal({ open, onClose, proveedorId, defaultMoneda = "UYU" }: CuentaModalProps) {
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CuentaForm>({
    resolver: zodResolver(cuentaSchema),
    defaultValues: { moneda: defaultMoneda as "UYU" | "USD" },
  });

  const moneda = watch("moneda");

  const mutation = useMutation({
    mutationFn: (data: CuentaForm) =>
      createCuentaPagar(proveedorId, {
        monto: data.monto,
        moneda: data.moneda,
        descripcion: data.descripcion || undefined,
        fecha_vencimiento: data.fecha_vencimiento || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cuentas-pagar", proveedorId] });
      toast({ title: "Cuenta por pagar creada" });
      reset({ moneda: defaultMoneda as "UYU" | "USD" });
      onClose();
    },
    onError: (err) => {
      toast({ title: "Error", description: parseApiError(err), variant: "destructive" });
    },
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
                <button
                  key={m}
                  type="button"
                  onClick={() => setValue("moneda", m)}
                  className={`flex-1 py-1.5 text-sm font-medium transition-colors ${
                    moneda === m
                      ? "bg-brand-500/20 text-brand-400"
                      : "text-agro-muted hover:bg-slate-800"
                  }`}
                >
                  {m === "UYU" ? "$ UYU" : "US$ USD"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="monto">Monto *</Label>
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

          <div className="space-y-1.5">
            <Label htmlFor="descripcion">Descripción</Label>
            <Input id="descripcion" placeholder="Concepto..." {...register("descripcion")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fecha_vencimiento">Fecha de vencimiento</Label>
            <Input id="fecha_vencimiento" type="date" {...register("fecha_vencimiento")} />
          </div>

          <Separator />

          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Crear cuenta
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Fila de cuenta por pagar ──────────────────────────────────────────────────

interface CuentaRowProps {
  cuenta: CuentaPagar;
  proveedorId: number;
}

function CuentaRow({ cuenta, proveedorId }: CuentaRowProps) {
  const queryClient = useQueryClient();

  const pagarMutation = useMutation({
    mutationFn: () => pagarCuentaPagar(cuenta.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cuentas-pagar", proveedorId] });
      toast({ title: "Cuenta marcada como pagada" });
    },
    onError: (err) => {
      toast({ title: "Error", description: parseApiError(err), variant: "destructive" });
    },
  });

  const vencida = !cuenta.pagado && isVencida(cuenta.fecha_vencimiento);

  return (
    <div className="flex items-center justify-between bg-agro-bg rounded-lg px-4 py-3 gap-3">
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-agro-text">
            {formatMoneda(cuenta.monto, cuenta.moneda)}
          </span>
          {cuenta.pagado ? (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="h-3 w-3" />
              Pagado
            </span>
          ) : vencida ? (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/30">
              <Clock className="h-3 w-3" />
              Vencida
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <Clock className="h-3 w-3" />
              Pendiente
            </span>
          )}
        </div>
        {cuenta.descripcion && (
          <p className="text-sm text-agro-muted truncate">{cuenta.descripcion}</p>
        )}
        {cuenta.fecha_vencimiento && (
          <p className={`text-xs ${vencida ? "text-red-400" : "text-agro-muted"}`}>
            Vence: {formatFecha(cuenta.fecha_vencimiento)}
          </p>
        )}
      </div>

      {!cuenta.pagado && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => pagarMutation.mutate()}
          disabled={pagarMutation.isPending}
          className="shrink-0 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10"
        >
          {pagarMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          <span className="ml-1.5 hidden sm:inline">Marcar pagado</span>
        </Button>
      )}
    </div>
  );
}

// ── Card de proveedor expandible ──────────────────────────────────────────────

interface ProveedorCardProps {
  proveedor: Proveedor;
  onEdit: (p: Proveedor) => void;
  onDelete: (p: Proveedor) => void;
  defaultMoneda: string;
}

function ProveedorCard({ proveedor, onEdit, onDelete, defaultMoneda }: ProveedorCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [cuentaModalOpen, setCuentaModalOpen] = useState(false);

  const { data: cuentas = [], isLoading } = useQuery({
    queryKey: ["cuentas-pagar", proveedor.id],
    queryFn: () => getCuentasPagar(proveedor.id),
    enabled: expanded,
  });

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
                {proveedor.telefono && (
                  <span className="flex items-center gap-1 text-xs text-agro-muted">
                    <Phone className="h-3 w-3" />
                    {proveedor.telefono}
                  </span>
                )}
                {proveedor.email && (
                  <span className="flex items-center gap-1 text-xs text-agro-muted">
                    <Mail className="h-3 w-3" />
                    {proveedor.email}
                  </span>
                )}
              </div>
              {proveedor.notas && (
                <p className="flex items-center gap-1 text-xs text-agro-muted mt-1 truncate">
                  <FileText className="h-3 w-3 shrink-0" />
                  {proveedor.notas}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {pendientes.length > 0 && (
                <div className="text-right">
                  <p className="text-xs text-agro-muted">Por pagar</p>
                  <p className="text-sm font-semibold text-red-400">
                    {formatMoneda(totalPendiente, monedaPendiente)}
                  </p>
                </div>
              )}
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-agro-muted hover:text-slate-200 px-2"
                  onClick={() => onEdit(proveedor)}
                >
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:text-red-300 px-2"
                  onClick={() => onDelete(proveedor)}
                >
                  Eliminar
                </Button>
              </div>
              <button
                onClick={() => setExpanded((v) => !v)}
                className="p-1.5 rounded-md text-agro-muted hover:text-slate-200 hover:bg-slate-700 transition-colors"
              >
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
                {pendientes.length > 0 && (
                  <span className="ml-2 text-xs text-red-400">
                    ({pendientes.length} pendiente{pendientes.length > 1 ? "s" : ""})
                  </span>
                )}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-7 text-xs"
                onClick={() => setCuentaModalOpen(true)}
              >
                <Plus className="h-3 w-3" />
                Nueva cuenta
              </Button>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-agro-muted" />
              </div>
            ) : cuentas.length === 0 ? (
              <p className="text-sm text-agro-muted text-center py-4">
                Sin cuentas por pagar registradas.
              </p>
            ) : (
              <div className="space-y-2">
                {cuentas.map((c) => (
                  <CuentaRow key={c.id} cuenta={c} proveedorId={proveedor.id} />
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <CuentaModal
        open={cuentaModalOpen}
        onClose={() => setCuentaModalOpen(false)}
        proveedorId={proveedor.id}
        defaultMoneda={defaultMoneda}
      />
    </>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function ProveedoresPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const defaultMoneda = user?.moneda ?? "UYU";

  const [proveedorModalOpen, setProveedorModalOpen] = useState(false);
  const [editingProveedor, setEditingProveedor] = useState<Proveedor | null>(null);
  const [deletingProveedor, setDeletingProveedor] = useState<Proveedor | null>(null);

  const { data: proveedores = [], isLoading } = useQuery({
    queryKey: ["proveedores"],
    queryFn: getProveedores,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteProveedor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["proveedores"] });
      toast({ title: "Proveedor eliminado" });
      setDeletingProveedor(null);
    },
    onError: (err) => {
      toast({ title: "Error", description: parseApiError(err), variant: "destructive" });
    },
  });

  function openNew() {
    setEditingProveedor(null);
    setProveedorModalOpen(true);
  }

  function openEdit(p: Proveedor) {
    setEditingProveedor(p);
    setProveedorModalOpen(true);
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-agro-text">Proveedores</h1>
          <p className="text-agro-muted mt-1">Gestioná tus proveedores y cuentas por pagar</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuevo proveedor
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : proveedores.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
          <Truck className="h-12 w-12 text-agro-accent" />
          <h2 className="text-lg font-semibold text-agro-text">Sin proveedores</h2>
          <p className="text-agro-muted max-w-xs text-sm">
            Agregá tu primer proveedor para registrar cuentas por pagar.
          </p>
          <Button onClick={openNew} className="gap-2 mt-2">
            <Plus className="h-4 w-4" />
            Nuevo proveedor
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {proveedores.map((p) => (
            <ProveedorCard
              key={p.id}
              proveedor={p}
              onEdit={openEdit}
              onDelete={setDeletingProveedor}
              defaultMoneda={defaultMoneda}
            />
          ))}
        </div>
      )}

      <ProveedorModal
        open={proveedorModalOpen}
        onClose={() => {
          setProveedorModalOpen(false);
          setEditingProveedor(null);
        }}
        editing={editingProveedor}
      />

      <Dialog open={!!deletingProveedor} onOpenChange={(v) => !v && setDeletingProveedor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar proveedor</DialogTitle>
            <DialogDescription>
              ¿Confirmás que querés eliminar a{" "}
              <span className="font-semibold text-agro-text">{deletingProveedor?.nombre}</span>? Esta acción
              eliminará también todas sus cuentas por pagar y no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button
              variant="ghost"
              onClick={() => setDeletingProveedor(null)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingProveedor && deleteMutation.mutate(deletingProveedor.id)}
              disabled={deleteMutation.isPending}
              className="flex-1"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Eliminar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
