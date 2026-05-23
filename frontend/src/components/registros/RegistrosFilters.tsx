import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { getCategorias } from "@/lib/categoriasApi";
import { getPotreros } from "@/lib/potrerosApi";
import { useRegistrosStore } from "@/store/registrosStore";
import type { TipoMovimiento } from "@/types/registros";

export function RegistrosFilters() {
  const { filters, setFilters, resetFilters } = useRegistrosStore();
  const { data: categorias = [] } = useQuery({ queryKey: ["categorias"], queryFn: getCategorias });
  const { data: potreros = [] } = useQuery({ queryKey: ["potreros"], queryFn: getPotreros });

  const hasActiveFilters =
    filters.tipo ||
    filters.categoria_id ||
    filters.potrero_id ||
    filters.fecha_desde ||
    filters.fecha_hasta ||
    filters.q;

  const tipoFiltradas = filters.tipo
    ? categorias.filter((c) => c.tipo === filters.tipo)
    : categorias;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative w-full sm:min-w-[200px] sm:flex-1 sm:max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <Input
          placeholder="Buscar descripción..."
          value={filters.q ?? ""}
          onChange={(e) => setFilters({ q: e.target.value || undefined })}
          className="pl-9"
        />
      </div>

      {/* Tipo */}
      <Select
        value={filters.tipo ?? ""}
        onChange={(e) =>
          setFilters({ tipo: (e.target.value as TipoMovimiento) || undefined, categoria_id: undefined })
        }
        className="w-full sm:w-36"
      >
        <option value="">Todos los tipos</option>
        <option value="gasto">Gastos</option>
        <option value="ingreso">Ingresos</option>
      </Select>

      {/* Categoría */}
      <Select
        value={filters.categoria_id ?? ""}
        onChange={(e) => setFilters({ categoria_id: e.target.value ? Number(e.target.value) : undefined })}
        className="w-full sm:w-48"
      >
        <option value="">Todas las categorías</option>
        {tipoFiltradas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </Select>

      {/* Potrero */}
      {potreros.length > 0 && (
        <Select
          value={filters.potrero_id ?? ""}
          onChange={(e) =>
            setFilters({ potrero_id: e.target.value ? Number(e.target.value) : undefined })
          }
          className="w-full sm:w-44"
        >
          <option value="">Todos los potreros</option>
          {potreros.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
      )}

      {/* Fechas — lado a lado en mobile, sueltas en desktop */}
      <div className="flex gap-2 w-full sm:w-auto sm:contents">
        <Input
          type="date"
          value={filters.fecha_desde ?? ""}
          onChange={(e) => setFilters({ fecha_desde: e.target.value || undefined })}
          className="flex-1 min-w-0 sm:w-40 sm:flex-none"
          title="Desde"
        />
        <Input
          type="date"
          value={filters.fecha_hasta ?? ""}
          onChange={(e) => setFilters({ fecha_hasta: e.target.value || undefined })}
          className="flex-1 min-w-0 sm:w-40 sm:flex-none"
          title="Hasta"
        />
      </div>

      {/* Clear */}
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1.5">
          <X className="h-3.5 w-3.5" />
          Limpiar
        </Button>
      )}
    </div>
  );
}
