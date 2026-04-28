export type TipoMovimiento = "gasto" | "ingreso";

export interface Categoria {
  id: number;
  nombre: string;
  tipo: TipoMovimiento;
  es_personalizada: boolean;
  user_id: number | null;
  color: string;
}

export interface PotreroSimple {
  id: number;
  nombre: string;
}

export interface Registro {
  id: number;
  user_id: number;
  categoria_id: number;
  categoria: Categoria;
  potrero_id: number | null;
  potrero: PotreroSimple | null;
  tipo: TipoMovimiento;
  monto: string; // Decimal serialized as string
  moneda: string;
  fecha: string; // "YYYY-MM-DD"
  descripcion: string | null;
  comprobante_url: string | null;
  created_at: string;
}

export interface PaginatedRegistros {
  items: Registro[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface RegistroCreate {
  categoria_id: number;
  tipo: TipoMovimiento;
  monto: number;
  moneda?: string;
  fecha: string;
  descripcion?: string;
  comprobante_url?: string;
  potrero_id?: number | null;
}

export interface RegistroUpdate {
  categoria_id?: number;
  tipo?: TipoMovimiento;
  monto?: number;
  moneda?: string;
  fecha?: string;
  descripcion?: string;
  comprobante_url?: string;
  potrero_id?: number | null;
}

export interface CategoriaCreate {
  nombre: string;
  tipo: TipoMovimiento;
  color: string;
}

export interface ResumenCategoria {
  categoria_id: number;
  nombre: string;
  tipo: TipoMovimiento;
  color: string;
  total: string;
}

export interface ResumenMes {
  mes: string;
  gastos: string;
  ingresos: string;
}

export interface ResumenResponse {
  total_gastos: string;
  total_ingresos: string;
  balance: string;
  por_categoria: ResumenCategoria[];
  por_mes: ResumenMes[];
}

export interface RegistroFilters {
  tipo?: TipoMovimiento;
  categoria_id?: number;
  potrero_id?: number;
  fecha_desde?: string;
  fecha_hasta?: string;
  q?: string;
  page: number;
  limit: number;
}

export interface ExtraerComprobanteResponse {
  monto: number | null;
  proveedor: string | null;
  fecha: string | null;
  descripcion: string | null;
  categoria_sugerida: string | null;
  confianza: "alta" | "media" | "baja";
}

export interface ExportFilters {
  formato: "excel" | "pdf";
  tipo?: TipoMovimiento;
  categoria_id?: number;
  potrero_id?: number;
  fecha_desde?: string;
  fecha_hasta?: string;
  q?: string;
}
