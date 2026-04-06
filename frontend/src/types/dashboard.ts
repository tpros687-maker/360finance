import type { ResumenCategoria, ResumenMes } from "./registros";

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
