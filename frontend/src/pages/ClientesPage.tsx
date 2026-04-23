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
  Users,
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
  getClientes,
  createCliente,
  updateCliente,
  deleteCliente,
  getCuentas,
  createCuenta,
  pagarCuenta,
} from "@/lib/clientesApi";
import { useAuthStore } from "@/store/authStore";
import type { Cliente, CuentaCobrar } from "@/types/clientes";

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

const clienteSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  telefono: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  notas: z.string().optional(),
});

type ClienteForm = z.infer<typeof clienteSchema>;

const cuentaSchema = z.object({
  monto: z.coerce.number().positive("El monto debe ser mayor a 0"),
  moneda: z.enum(["UYU", "USD"]).default("UYU"),
  descripcion: z.string().optional(),
  fecha_vencimiento: z.string().optional(),
});

type CuentaForm = z.infer<typeof cuentaSchema>;

// ── Modal Cliente ─────────────────────────────────────────────────────────────

interface ClienteModalProps {
  open: boolean;
  onClose: () => void;
  editing?: Cliente | null;
}

function ClienteModal({ open, onClose, editing }: ClienteModalProps) {
  const queryClient = useQueryClient();
  const isEdit = !!editing;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ClienteForm>({
    resolver: zodResolver(clienteSchema),
    defaultValues: { nombre: "", telefono: "", email: "", notas: "" },
  });

  // Reset when opening
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
    mutationFn: (data: ClienteForm) => {
      const payload = {
        nombre: data.nombre,
        telefono: data.telefono || undefined,
        email: data.email || undefined,
        notas: data.notas || undefined,
      };
      return isEdit ? updateCliente(editing!.id, payload) : createCliente(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      toast({ title: isEdit ? "Cliente actualizado" : "Cliente creado" });
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
          <DialogTitle>{isEdit ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Modificá los datos del cliente." : "Completá los datos para agregar un cliente."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit((d) => mutation.mutate(d))}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre *</Label>
            <Input id="nombre" placeholder="Nombre del cliente" {...register("nombre")} />
            {errors.nombre && <p className="text-xs text-red-400">{errors.nombre.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="telefono">Teléfono</Label>
            <Input id="telefono" placeholder="+598 99 000 000" {...register("telefono")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="cliente@email.com" {...register("email")} />
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
              {isEdit ? "Guardar cambios" : "Crear cliente"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal Cuenta ──────────────────────────────────────────────────────────────

interface CuentaModalProps {
  open: boolean;
  onClose: () => void;
  clienteId: number;
  defaultMoneda?: string;
}

function CuentaModal({ open, onClose, clienteId, defaultMoneda = "UYU" }: CuentaModalProps) {
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
      createCuenta(clienteId, {
        monto: data.monto,
        moneda: data.moneda,
        descripcion: data.descripcion || undefined,
        fecha_vencimiento: data.fecha_vencimiento || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cuentas", clienteId] });
      toast({ title: "Cuenta creada" });
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
          <DialogTitle>Nueva cuenta por cobrar</DialogTitle>
          <DialogDescription>Registrá una deuda pendiente del cliente.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          {/* Moneda toggle */}
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

// ── Fila de cuenta ────────────────────────────────────────────────────────────

interface CuentaRowProps {
  cuenta: CuentaCobrar;
  clienteId: number;
}

function CuentaRow({ cuenta, clienteId }: CuentaRowProps) {
  const queryClient = useQueryClient();

  const pagarMutation = useMutation({
    mutationFn: () => pagarCuenta(cuenta.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cuentas", clienteId] });
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

// ── Card de cliente expandible ────────────────────────────────────────────────

interface ClienteCardProps {
  cliente: Cliente;
  onEdit: (c: Cliente) => void;
  onDelete: (c: Cliente) => void;
  defaultMoneda: string;
}

function ClienteCard({ cliente, onEdit, onDelete, defaultMoneda }: ClienteCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [cuentaModalOpen, setCuentaModalOpen] = useState(false);

  const { data: cuentas = [], isLoading } = useQuery({
    queryKey: ["cuentas", cliente.id],
    queryFn: () => getCuentas(cliente.id),
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
              <h3 className="font-semibold text-agro-text text-base truncate">{cliente.nombre}</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                {cliente.telefono && (
                  <span className="flex items-center gap-1 text-xs text-agro-muted">
                    <Phone className="h-3 w-3" />
                    {cliente.telefono}
                  </span>
                )}
                {cliente.email && (
                  <span className="flex items-center gap-1 text-xs text-agro-muted">
                    <Mail className="h-3 w-3" />
                    {cliente.email}
                  </span>
                )}
              </div>
              {cliente.notas && (
                <p className="flex items-center gap-1 text-xs text-agro-muted mt-1 truncate">
                  <FileText className="h-3 w-3 shrink-0" />
                  {cliente.notas}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {pendientes.length > 0 && (
                <div className="text-right">
                  <p className="text-xs text-agro-muted">Pendiente</p>
                  <p className="text-sm font-semibold text-amber-400">
                    {formatMoneda(totalPendiente, monedaPendiente)}
                  </p>
                </div>
              )}
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-agro-muted hover:text-slate-200 px-2"
                  onClick={() => onEdit(cliente)}
                >
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-400 hover:text-red-300 px-2"
                  onClick={() => onDelete(cliente)}
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
                Cuentas por cobrar
                {pendientes.length > 0 && (
                  <span className="ml-2 text-xs text-amber-400">({pendientes.length} pendiente{pendientes.length > 1 ? "s" : ""})</span>
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
                Sin cuentas por cobrar registradas.
              </p>
            ) : (
              <div className="space-y-2">
                {cuentas.map((c) => (
                  <CuentaRow key={c.id} cuenta={c} clienteId={cliente.id} />
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <CuentaModal
        open={cuentaModalOpen}
        onClose={() => setCuentaModalOpen(false)}
        clienteId={cliente.id}
        defaultMoneda={defaultMoneda}
      />
    </>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function ClientesPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const defaultMoneda = user?.moneda ?? "UYU";

  const [clienteModalOpen, setClienteModalOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [deletingCliente, setDeletingCliente] = useState<Cliente | null>(null);

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ["clientes"],
    queryFn: getClientes,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteCliente(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clientes"] });
      toast({ title: "Cliente eliminado" });
      setDeletingCliente(null);
    },
    onError: (err) => {
      toast({ title: "Error", description: parseApiError(err), variant: "destructive" });
    },
  });

  function openNew() {
    setEditingCliente(null);
    setClienteModalOpen(true);
  }

  function openEdit(c: Cliente) {
    setEditingCliente(c);
    setClienteModalOpen(true);
  }

  return (
    <div className="page-fade p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-agro-text">Clientes</h1>
          <p className="text-agro-muted mt-1">Gestioná tus clientes y cuentas por cobrar</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuevo cliente
        </Button>
      </div>

      {/* Listado */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : clientes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
          <Users className="h-12 w-12 text-agro-accent" />
          <h2 className="text-lg font-semibold text-agro-text">Sin clientes</h2>
          <p className="text-agro-muted max-w-xs text-sm">
            Agregá tu primer cliente para registrar cuentas por cobrar.
          </p>
          <Button onClick={openNew} className="gap-2 mt-2">
            <Plus className="h-4 w-4" />
            Nuevo cliente
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {clientes.map((c) => (
            <ClienteCard
              key={c.id}
              cliente={c}
              onEdit={openEdit}
              onDelete={setDeletingCliente}
              defaultMoneda={defaultMoneda}
            />
          ))}
        </div>
      )}

      {/* Modal cliente */}
      <ClienteModal
        open={clienteModalOpen}
        onClose={() => {
          setClienteModalOpen(false);
          setEditingCliente(null);
        }}
        editing={editingCliente}
      />

      {/* Confirm delete */}
      <Dialog open={!!deletingCliente} onOpenChange={(v) => !v && setDeletingCliente(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar cliente</DialogTitle>
            <DialogDescription>
              ¿Confirmás que querés eliminar a{" "}
              <span className="font-semibold text-agro-text">{deletingCliente?.nombre}</span>? Esta acción
              eliminará también todas sus cuentas por cobrar y no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button
              variant="ghost"
              onClick={() => setDeletingCliente(null)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingCliente && deleteMutation.mutate(deletingCliente.id)}
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
