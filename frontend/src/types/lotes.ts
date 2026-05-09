export interface Lote {
  id: number;
  potrero_id: number;
  potrero_nombre: string | null;
  categoria: string;
  cantidad: number;
  fecha_entrada: string;
  peso_total_entrada_kg: number;
  precio_kg_compra: number | null;
  lote_padre_id: number | null;
  cerrado: boolean;
  notas: string | null;
  // Campos calculados (derivados al mostrar)
  kg_producidos: number | null;
  gdp_kg_dia: number | null;
  margen_bruto: number | null;
}

export interface MovimientoLote {
  id: number;
  fecha: string;
  potrero_origen_id: number;
  potrero_destino_id: number;
  notas: string | null;
}

export interface DivisionLote {
  id: number;
  fecha: string;
  lote_hijo_id: number;
  cantidad_separada: number;
  motivo: string | null;
}

export interface VentaLote {
  id: number;
  fecha: string;
  cantidad_vendida: number;
  peso_total_kg: number;
  precio_kg: number;
  moneda: string;
  notas: string | null;
}

export interface LoteDetalle extends Lote {
  movimientos: MovimientoLote[];
  divisiones: DivisionLote[];
  ventas: VentaLote[];
}

export interface LoteCreate {
  potrero_id: number;
  categoria: string;
  cantidad: number;
  fecha_entrada: string;
  peso_total_entrada_kg: number;
  precio_kg_compra?: number | null;
  lote_padre_id?: number | null;
  notas?: string | null;
}

export interface MovimientoCreate {
  potrero_destino_id: number;
  fecha: string;
  notas?: string | null;
}

export interface DivisionCreate {
  cantidad_separada: number;
  potrero_destino_id: number;
  categoria?: string | null;
  fecha: string;
  motivo?: string | null;
  notas_hijo?: string | null;
}

export interface VentaCreate {
  fecha: string;
  cantidad_vendida: number;
  peso_total_kg: number;
  precio_kg: number;
  moneda?: string;
  notas?: string | null;
}
