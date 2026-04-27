import type { ResumenCategoria, ResumenMes } from "./registros";

export interface ItemFlujo {
  id: number;
  tipo: "cobro" | "pago";
  descripcion: string | null;
  contraparte: string;
  monto: number;
  moneda: string;
  fecha_vencimiento: string | null;
  dias_restantes: number | null;
  vencido: boolean;
}

export interface SemanaFlujo {
  semana_label: string;
  cobros: number;
  pagos: number;
  balance_semana: number;
  balance_acumulado: number;
}

export interface FlujoCajaResponse {
  total_por_cobrar: number;
  total_por_pagar: number;
  balance_proyectado: number;
  alerta_liquidez: boolean;
  semanas: SemanaFlujo[];
  cobros_pendientes: ItemFlujo[];
  pagos_pendientes: ItemFlujo[];
  cobros_vencidos: ItemFlujo[];
  pagos_vencidos: ItemFlujo[];
}

export type { ResumenCategoria, ResumenMes };

export interface AnimalEspecie {
  especie: string;
  total: number;
}

export interface MovimientoProximo {
  id: number;
  potrero_origen_nombre: string;
  potrero_destino_nombre: string;
  cantidad: number;
  especie: string;
  fecha_programada: string; // "YYYY-MM-DD"
}

export interface DashboardResumen {
  // Financiero
  total_gastos: string;
  total_ingresos: string;
  balance: string;
  por_mes: ResumenMes[];
  por_categoria: ResumenCategoria[];
  // Campo
  total_potreros: number;
  total_animales: number;
  hectareas_totales: string;
  animales_por_especie: AnimalEspecie[];
  // Próximos movimientos
  movimientos_proximos: MovimientoProximo[];
}
