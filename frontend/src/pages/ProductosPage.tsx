import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus, Package, Wrench, Pencil, Power, Loader2, Tag,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/useToast";
import { parseApiError } from "@/lib/authApi";
import { getProductos, createProducto, updateProducto, toggleProducto } from "@/lib/productosApi";
import { useAuthStore } from "@/store/authStore";
import type { Producto } from "@/types/productos";
import { cn } from "@/lib/utils";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrecio(precio: number, moneda: string): string {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: moneda === "USD" ? "USD" : "UYU",
    maximumFractionDigits: 2,
  }).format(precio);
}

// ── Schema ────────────────────────────────────────────────────────────────────

const productoSchema = z.object({
  nombre: z.string().min(1, "El nombre es obligatorio"),
  descripcion: z.string().optional(),
  tipo: z.enum(["producto", "servicio"]),
  precio: z.coerce.number().min(0, "El precio no puede ser negativo"),
  moneda: z.enum(["UYU", "USD"]),
  stock: z.coerce.number().int().min(0).optional().or(z.literal("")),
});

type ProductoForm = z.infer<typeof productoSchema>;

// ── Modal ─────────────────────────────────────────────────────────────────────

interface ModalProps {
  open: boolean;
  onClose: () => void;
  editing?: Producto | null;
  defaultMoneda: string;
}

function ProductoModal({ open, onClose, editing, defaultMoneda }: ModalProps) {
  const queryClient = useQueryClient();
  const isEdit = !!editing;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ProductoForm>({
    resolver: zodResolver(productoSchema),
    defaultValues: {
      nombre: "",
      descripcion: "",
      tipo: "producto",
      precio: 0,
      moneda: (defaultMoneda as "UYU" | "USD") ?? "UYU",
      stock: "",
    },
  });

  useEffect(() => {
    if (open) {
      reset(
        editing
          ? {
              nombre: editing.nombre,
              descripcion: editing.descripcion ?? "",
              tipo: editing.tipo,
              precio: editing.precio,
              moneda: editing.moneda as "UYU" | "USD",
              stock: editing.stock ?? "",
            }
          : {
              nombre: "",
              descripcion: "",
              tipo: "producto",
              precio: 0,
              moneda: (defaultMoneda as "UYU" | "USD") ?? "UYU",
              stock: "",
            }
      );
    }
  }, [open, editing, defaultMoneda, reset]);

  const tipo = watch("tipo");
  const moneda = watch("moneda");

  const mutation = useMutation({
    mutationFn: (data: ProductoForm) => {
      const payload = {
        nombre: data.nombre,
        descripcion: data.descripcion || null,
        tipo: data.tipo,
        precio: data.precio,
        moneda: data.moneda,
        stock: data.stock !== "" && data.stock != null ? Number(data.stock) : null,
      };
      return isEdit
        ? updateProducto(editing!.id, payload)
        : createProducto(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productos"] });
      toast({ title: isEdit ? "Producto actualizado" : "Producto creado" });
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
          <DialogTitle>{isEdit ? "Editar" : "Nuevo producto / servicio"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Modificá los datos del ítem." : "Completá los datos para agregar al catálogo."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          {/* Tipo toggle */}
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["producto", "servicio"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setValue("tipo", t)}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg border py-2 text-sm font-medium transition-colors",
                    tipo === t
                      ? "border-agro-primary bg-agro-primary/10 text-agro-primary"
                      : "border-agro-accent/20 text-agro-muted hover:border-agro-accent/40"
                  )}
                >
                  {t === "producto" ? <Package className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre *</Label>
            <Input id="nombre" placeholder="Ej: Ivermectina 1%" {...register("nombre")} />
            {errors.nombre && <p className="text-xs text-red-400">{errors.nombre.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descripcion">Descripción</Label>
            <Input id="descripcion" placeholder="Descripción opcional..." {...register("descripcion")} />
          </div>

          {/* Precio + moneda */}
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="precio">Precio *</Label>
              <Input
                id="precio"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                {...register("precio")}
              />
              {errors.precio && <p className="text-xs text-red-400">{errors.precio.message}</p>}
            </div>
            <div className="flex rounded-lg border border-agro-accent/20 overflow-hidden mb-0.5">
              {(["UYU", "USD"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setValue("moneda", m)}
                  className={cn(
                    "px-3 py-2 text-xs font-semibold transition-colors",
                    moneda === m
                      ? "bg-agro-primary text-white"
                      : "text-agro-muted hover:bg-agro-bg"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Stock (solo productos) */}
          {tipo === "producto" && (
            <div className="space-y-1.5">
              <Label htmlFor="stock">
                Stock
                <span className="text-agro-muted text-xs ml-1">(opcional)</span>
              </Label>
              <Input
                id="stock"
                type="number"
                min="0"
                step="1"
                placeholder="Sin límite"
                {...register("stock")}
              />
            </div>
          )}

          <Separator />

          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Guardar cambios" : "Crear"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

interface CardProps {
  producto: Producto;
  onEdit: (p: Producto) => void;
}

function ProductoCard({ producto, onEdit }: CardProps) {
  const queryClient = useQueryClient();

  const toggleMutation = useMutation({
    mutationFn: () => toggleProducto(producto.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["productos"] });
      toast({ title: producto.activo ? "Ítem desactivado" : "Ítem activado" });
    },
    onError: (err) => {
      toast({ title: "Error", description: parseApiError(err), variant: "destructive" });
    },
  });

  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-4 flex flex-col gap-3 transition-opacity",
        !producto.activo && "opacity-60"
      )}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-agro-primary/10">
            {producto.tipo === "producto"
              ? <Package className="h-4 w-4 text-agro-primary" />
              : <Wrench className="h-4 w-4 text-agro-primary" />
            }
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-agro-text text-sm truncate">{producto.nombre}</p>
            {producto.descripcion && (
              <p className="text-xs text-agro-muted mt-0.5 line-clamp-2">{producto.descripcion}</p>
            )}
          </div>
        </div>

        {/* Badge activo */}
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold border",
            producto.activo
              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
              : "bg-agro-muted/10 text-agro-muted border-agro-accent/20"
          )}
        >
          {producto.activo ? "Activo" : "Inactivo"}
        </span>
      </div>

      {/* Price + stock row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Tag className="h-3.5 w-3.5 text-agro-primary" />
          <span className="text-sm font-semibold text-agro-text">
            {formatPrecio(producto.precio, producto.moneda)}
          </span>
        </div>
        {producto.tipo === "producto" && producto.stock != null && (
          <span className="text-xs text-agro-muted border border-agro-accent/20 rounded-full px-2 py-0.5">
            Stock: {producto.stock}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t border-agro-accent/10">
        <Button
          size="sm"
          variant="ghost"
          className="flex-1 gap-1.5 text-agro-muted hover:text-agro-text h-7 text-xs"
          onClick={() => onEdit(producto)}
        >
          <Pencil className="h-3.5 w-3.5" />
          Editar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className={cn(
            "flex-1 gap-1.5 h-7 text-xs",
            producto.activo
              ? "text-agro-muted hover:text-amber-600"
              : "text-agro-muted hover:text-emerald-600"
          )}
          onClick={() => toggleMutation.mutate()}
          disabled={toggleMutation.isPending}
        >
          {toggleMutation.isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Power className="h-3.5 w-3.5" />
          }
          {producto.activo ? "Desactivar" : "Activar"}
        </Button>
      </div>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────

type Tab = "producto" | "servicio";

export default function ProductosPage() {
  const { user } = useAuthStore();
  const defaultMoneda = user?.moneda ?? "UYU";

  const [tab, setTab] = useState<Tab>("producto");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Producto | null>(null);

  const { data: todos = [], isLoading } = useQuery({
    queryKey: ["productos"],
    queryFn: getProductos,
  });

  const items = todos.filter((p) => p.tipo === tab);

  function openNew() {
    setEditing(null);
    setModalOpen(true);
  }

  function openEdit(p: Producto) {
    setEditing(p);
    setModalOpen(true);
  }

  const tabCls = (t: Tab) =>
    cn(
      "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors",
      tab === t
        ? "bg-agro-primary text-white"
        : "text-agro-muted hover:bg-agro-accent/10 hover:text-agro-primary"
    );

  return (
    <div className="page-fade p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-agro-text">Catálogo</h1>
          <p className="text-agro-muted mt-1 text-sm">Administrá tus productos y servicios</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuevo
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-agro-bg rounded-xl p-1 w-fit border border-agro-accent/20">
        <button className={tabCls("producto")} onClick={() => setTab("producto")}>
          <Package className="h-4 w-4" />
          Productos
          <span className="ml-1 text-xs opacity-70">
            ({todos.filter((p) => p.tipo === "producto").length})
          </span>
        </button>
        <button className={tabCls("servicio")} onClick={() => setTab("servicio")}>
          <Wrench className="h-4 w-4" />
          Servicios
          <span className="ml-1 text-xs opacity-70">
            ({todos.filter((p) => p.tipo === "servicio").length})
          </span>
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-36 rounded-xl bg-agro-bg animate-pulse border border-agro-accent/20" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
          {tab === "producto"
            ? <Package className="h-12 w-12 text-agro-accent/40" />
            : <Wrench className="h-12 w-12 text-agro-accent/40" />
          }
          <h2 className="text-lg font-semibold text-agro-text">
            Sin {tab === "producto" ? "productos" : "servicios"}
          </h2>
          <p className="text-agro-muted max-w-xs text-sm">
            Agregá tu primer {tab} al catálogo para usarlo en tus ventas.
          </p>
          <Button onClick={openNew} className="gap-2 mt-2">
            <Plus className="h-4 w-4" />
            Nuevo {tab}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((p) => (
            <ProductoCard key={p.id} producto={p} onEdit={openEdit} />
          ))}
        </div>
      )}

      <ProductoModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        editing={editing}
        defaultMoneda={defaultMoneda}
      />
    </div>
  );
}
