export type Tendencia = "sube" | "baja" | "estable";
export type TipoAlerta = "alta" | "baja";
export type Unidad = "kg" | "cab";

export interface ProyeccionMes {
  mes: string;
  estimado: number;
  minimo: number;
  maximo: number;
  alerta: TipoAlerta | null;
}

export interface AlertaMercado {
  mes: string;
  tipo: TipoAlerta;
  precio: number;
}

export interface CategoriaMercado {
  id: string;
  nombre: string;
  grupo: string;
  fuente: string;
  unidad: Unidad;
  alerta_alta: number;
  alerta_baja: number;
  precio_actual: number;
  fecha_ultimo_dato: string;
  prom_proyectado: number;
  tendencia: Tendencia;
  proyeccion: ProyeccionMes[];
  alertas: AlertaMercado[];
}

export interface MercadoResponse {
  actualizado: string | null;
  categorias: CategoriaMercado[];
}
