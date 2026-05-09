import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileDown, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ResumenEstablecimiento, periodoEsteAnio } from "@/components/rentabilidad/ResumenEstablecimiento";
import { TablaPotreros } from "@/components/rentabilidad/TablaPotreros";
import { ProyeccionAnualCards } from "@/components/rentabilidad/ProyeccionAnual";
import { getRentabilidadPotreros, getProyeccionAnual, exportarRentabilidadPDF } from "@/lib/rentabilidadApi";
import { toast } from "@/hooks/useToast";
import type { Periodo } from "@/components/rentabilidad/ResumenEstablecimiento";

export default function RentabilidadHaPage() {
  const [periodo, setPeriodo] = useState<Periodo>(periodoEsteAnio());
  const [isExporting, setIsExporting] = useState(false);

  const { data: potreros = [], isLoading: loadingPotreros } = useQuery({
    queryKey: ["rentabilidad-motor", periodo.fecha_desde, periodo.fecha_hasta],
    queryFn: () =>
      getRentabilidadPotreros({
        fecha_desde: periodo.fecha_desde,
        fecha_hasta: periodo.fecha_hasta,
      }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: proyeccion = null, isLoading: loadingProy } = useQuery({
    queryKey: ["proyeccion-anual"],
    queryFn: getProyeccionAnual,
    staleTime: 10 * 60 * 1000,
  });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportarRentabilidadPDF({
        fecha_desde: periodo.fecha_desde,
        fecha_hasta: periodo.fecha_hasta,
      });
    } catch {
      toast({ title: "Error al generar el PDF", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-950 p-6 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Rentabilidad / ha</h1>
          <p className="text-slate-400 text-sm mt-1">
            Margen neto anualizado por hectárea · motor económico por potrero.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={isExporting}
          onClick={handleExport}
          className="shrink-0 border-slate-700 bg-transparent text-slate-400 hover:text-slate-100 hover:border-slate-500 gap-2"
        >
          {isExporting
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <FileDown className="h-4 w-4" />
          }
          {isExporting ? "Generando…" : "Exportar PDF"}
        </Button>
      </div>

      {/* Resumen del establecimiento + selector de período */}
      <ResumenEstablecimiento
        potreros={potreros}
        proyeccion={proyeccion}
        isLoading={loadingPotreros || loadingProy}
        periodo={periodo}
        onPeriodoChange={setPeriodo}
      />

      {/* Tabla comparativa de potreros */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Potreros
        </h2>
        <TablaPotreros
          potreros={potreros}
          periodo={periodo}
          isLoading={loadingPotreros}
        />
      </div>

      {/* Proyección al cierre del año */}
      {proyeccion && !loadingProy && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Proyección al cierre del año
          </h2>
          <ProyeccionAnualCards data={proyeccion} />
        </div>
      )}
    </div>
  );
}
