import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Pencil, Trash2, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { deleteRegistro } from "@/lib/registrosApi";
import { toast } from "@/hooks/useToast";
import { useRegistrosStore } from "@/store/registrosStore";
import type { PaginatedRegistros, Registro } from "@/types/registros";

interface Props {
  data: PaginatedRegistros;
  isLoading: boolean;
  onEdit: (registro: Registro) => void;
}

function formatMonto(monto: string) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  }).format(parseFloat(monto));
}

function formatFecha(fecha: string) {
  return new Date(fecha + "T00:00:00").toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function RegistrosTable({ data, isLoading, onEdit }: Props) {
  const queryClient = useQueryClient();
  const { setFilters } = useRegistrosStore();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: deleteRegistro,
    onMutate: (id) => setDeletingId(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registros"] });
      queryClient.invalidateQueries({ queryKey: ["resumen"] });
      toast({ title: "Registro eliminado" });
    },
    onError: () => {
      toast({ title: "Error al eliminar", variant: "destructive" });
    },
    onSettled: () => setDeletingId(null),
  });

  const handleDelete = (registro: Registro) => {
    if (!confirm(`¿Eliminar este registro de ${formatMonto(registro.monto)}?`)) return;
    deleteMutation.mutate(registro.id);
  };

  const handleComprobanteClick = (url: string) => {
    if (/\.(jpg|jpeg|png)$/i.test(url)) {
      setLightboxUrl(url);
    } else {
      window.open(url, "_blank");
    }
  };

  const totalGastos = data.items
    .filter((r) => r.tipo === "gasto")
    .reduce((acc, r) => acc + parseFloat(r.monto), 0);
  const totalIngresos = data.items
    .filter((r) => r.tipo === "ingreso")
    .reduce((acc, r) => acc + parseFloat(r.monto), 0);
  const balance = totalIngresos - totalGastos;

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Table wrapper */}
        <div className="flex-1 overflow-auto rounded-xl border border-slate-700/60">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-800/90 backdrop-blur-sm border-b border-slate-700">
                <th className="px-4 py-3 text-left font-medium text-slate-400 w-28">Fecha</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400 w-24">Tipo</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400 w-44">Categoría</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400 w-36">Potrero</th>
                <th className="px-4 py-3 text-left font-medium text-slate-400">Descripción</th>
                <th className="px-4 py-3 text-right font-medium text-slate-400 w-36">Monto</th>
                <th className="px-4 py-3 text-center font-medium text-slate-400 w-24">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-500">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Cargando registros...
                  </td>
                </tr>
              ) : data.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-500">
                    No hay registros que coincidan con los filtros.
                  </td>
                </tr>
              ) : (
                data.items.map((registro) => (
                  <tr
                    key={registro.id}
                    className="border-b border-slate-700/40 hover:bg-slate-800/40 transition-colors group"
                  >
                    <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                      {formatFecha(registro.fecha)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={registro.tipo}>
                        {registro.tipo === "gasto" ? "Gasto" : "Ingreso"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: registro.categoria.color }}
                        />
                        <span className="text-slate-200 truncate max-w-[140px]">
                          {registro.categoria.nombre}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">
                      {registro.potrero ? (
                        <span className="text-slate-300 text-xs bg-slate-700/60 rounded px-1.5 py-0.5">
                          {registro.potrero.nombre}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 max-w-xs">
                      <span className="truncate block">{registro.descripcion || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium whitespace-nowrap">
                      <span
                        className={registro.tipo === "gasto" ? "text-red-400" : "text-emerald-400"}
                      >
                        {registro.tipo === "gasto" ? "−" : "+"}
                        {formatMonto(registro.monto)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {registro.comprobante_url && (
                          <button
                            onClick={() => handleComprobanteClick(registro.comprobante_url!)}
                            className="p-1.5 rounded-md text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                            title="Ver comprobante"
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => onEdit(registro)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(registro)}
                          disabled={deletingId === registro.id}
                          className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                          title="Eliminar"
                        >
                          {deletingId === registro.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {!isLoading && data.items.length > 0 && (
              <tfoot className="sticky bottom-0">
                <tr className="bg-slate-800 border-t-2 border-slate-600">
                  <td colSpan={5} className="px-4 py-3 text-sm font-semibold text-slate-300">
                    Total en página ({data.items.length} de {data.total} registros)
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="space-y-0.5">
                      <div className="text-xs text-red-400 font-mono">
                        − {formatMonto(String(totalGastos))}
                      </div>
                      <div className="text-xs text-emerald-400 font-mono">
                        + {formatMonto(String(totalIngresos))}
                      </div>
                      <div
                        className={`text-sm font-bold font-mono border-t border-slate-600 pt-0.5 ${
                          balance >= 0 ? "text-emerald-300" : "text-red-300"
                        }`}
                      >
                        {balance >= 0 ? "+" : ""}
                        {formatMonto(String(balance))}
                      </div>
                    </div>
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Pagination */}
        {data.pages > 1 && (
          <div className="flex items-center justify-between py-3 px-1">
            <p className="text-sm text-slate-400">
              Página {data.page} de {data.pages} — {data.total} registros en total
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilters({ page: data.page - 1 })}
                disabled={data.page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setFilters({ page: data.page + 1 })}
                disabled={data.page >= data.pages}
              >
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Lightbox para imágenes */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh] p-2" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxUrl}
              alt="Comprobante"
              className="max-h-[85vh] max-w-full rounded-lg object-contain"
            />
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  );
}
