export interface ImputacionSugerida {
  tipo_imputacion: string;
  potrero_id: number | null;
  actividad_tipo: string | null;
  actividad_id: number | null;
  confianza: "alta" | "media" | "baja";
}

export interface ActividadRentabilidad {
  actividad_tipo: "lote" | "ciclo";
  actividad_id: number;
  nombre: string;
  ingresos_usd: number;
  gastos_directos_usd: number;
  margen_usd: number;
  margen_ha_usd: number | null;
  anualizado_usd_ha: number | null;
  es_proyectado: boolean;
}

export interface GastoResumen {
  id: number;
  fecha: string;
  descripcion: string | null;
  monto: number;
  moneda: string;
  monto_usd: number;
  tipo_imputacion: string | null;
  actividad_tipo: string | null;
  actividad_id: number | null;
}

export interface PotreroRentabilidad {
  potrero_id: number;
  nombre: string;
  hectareas: number | null;
  actividades: ActividadRentabilidad[];
  gastos_prorrateados_usd: number;
  gastos_estructurales_usd: number;
  margen_neto_usd: number;
  margen_neto_ha_usd: number | null;
  margen_neto_ha_anualizado_usd: number | null;
  es_proyectado: boolean;
}

export interface PotreroRentabilidadDetalle extends PotreroRentabilidad {
  top_gastos: GastoResumen[];
}

export interface PotreroRentabilidadAnio extends PotreroRentabilidad {
  anio: number;
}

export interface EscenarioProyeccion {
  ingresos_esperados_usd: number;
  gastos_esperados_usd: number;
  margen_esperado_usd: number;
  margen_ha_esperado_usd: number | null;
}

export interface ProyeccionAnual {
  periodo_analizado_dias: number;
  total_ha: number | null;
  pesimista: EscenarioProyeccion;
  base: EscenarioProyeccion;
  optimista: EscenarioProyeccion;
}

export interface ReimputarGastoBody {
  tipo_imputacion: string;
  actividad_tipo?: string | null;
  actividad_id?: number | null;
}
