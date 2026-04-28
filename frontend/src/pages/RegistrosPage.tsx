import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Download, Plus, ScanLine, TrendingDown, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RegistrosTable } from "@/components/registros/RegistrosTable";
import { RegistrosFilters } from "@/components/registros/RegistrosFilters";
import { RegistroModal } from "@/components/registros/RegistroModal";
import { EscanearFacturaModal } from "@/components/registros/EscanearFacturaModal";
import { getRegistros, exportarRegistros } from "@/lib/registrosApi";
import { useRegistrosStore } from "@/store/registrosStore";
import { toast } from "@/hooks/useToast";
import type { Registro, TipoMovimiento } from "@/types/registros";

export default function RegistrosPage() {
  const { filters } = useRegistrosStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRegistro, setEditingRegistro] = useState<Registro | null>(null);
  const [escanearOpen, setEscanearOpen] = useState(false);
  const [defaultTipo, setDefaultTipo] = useState<TipoMovimiento>("gasto");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["registros", filters],
    queryFn: () => getRegistros(filters),
    placeholderData: (prev) => prev,
  });

  const emptyData = { items: [], total: 0, page: 1, limit: 20, pages: 1 };

  function openNew(tipo: TipoMovimiento) {
    setEditingRegistro(null);
    setDefaultTipo(tipo);
    setModalOpen(true);
  }

  function openEdit(registro: Registro) {
    setEditingRegistro(registro);
    setModalOpen(true);
  }

  async function handleExport(formato: "excel" | "pdf") {
    setExportMenuOpen(false);
    setExporting(true);
    try {
      await exportarRegistros({
        formato,
        tipo: filters.tipo,
        categoria_id: filters.categoria_id,
        potrero_id: filters.potrero_id,
        fecha_desde: filters.fecha_desde,
        fecha_hasta: filters.fecha_hasta,
        q: filters.q,
      });
    } catch {
      toast({ title: "Error al exportar", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="page-fade flex flex-col h-full p-6 gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-agro-text">Registros</h1>
          <p className="text-agro-muted text-sm mt-0.5">Historial de movimientos financieros</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Export dropdown */}
          <div className="relative" ref={exportRef}>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={exporting}
              onClick={() => setExportMenuOpen((v) => !v)}
            >
              <Download className="h-4 w-4" />
              Exportar
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            {exportMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setExportMenuOpen(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-20 w-36 rounded-lg border border-agro-accent/20 bg-white shadow-xl overflow-hidden">
                  <button
                    className="w-full px-4 py-2.5 text-sm text-left text-agro-text hover:bg-agro-bg transition-colors"
                    onClick={() => handleExport("excel")}
                  >
                    Excel (.xlsx)
                  </button>
                  <button
                    className="w-full px-4 py-2.5 text-sm text-left text-agro-text hover:bg-agro-bg transition-colors"
                    onClick={() => handleExport("pdf")}
                  >
                    PDF
                  </button>
                </div>
              </>
            )}
          </div>

          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setEscanearOpen(true)}
          >
            <ScanLine className="h-4 w-4" />
            Escanear factura
          </Button>
          <Button
            onClick={() => openNew("gasto")}
            variant="destructive"
            className="gap-2"
          >
            <TrendingDown className="h-4 w-4" />
            <Plus className="h-4 w-4 -ml-1" />
            Gasto
          </Button>
          <Button
            onClick={() => openNew("ingreso")}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800"
          >
            <TrendingUp className="h-4 w-4" />
            <Plus className="h-4 w-4 -ml-1" />
            Ingreso
          </Button>
        </div>
      </div>

      {/* Filters */}
      <RegistrosFilters />

      {/* Table */}
      <div className="flex-1 min-h-0">
        <RegistrosTable
          data={data ?? emptyData}
          isLoading={isLoading}
          onEdit={openEdit}
        />
      </div>

      {/* Escanear factura */}
      <EscanearFacturaModal
        open={escanearOpen}
        onClose={() => setEscanearOpen(false)}
      />

      {/* Modal */}
      <RegistroModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingRegistro(null);
        }}
        registro={editingRegistro}
        defaultTipo={defaultTipo}
      />
    </div>
  );
}
