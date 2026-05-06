// ── GeoJSON primitives ────────────────────────────────────────────────────────

export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

export interface GeoJSONPoint {
  type: "Point";
  coordinates: [number, number]; // [lng, lat]
}

// ── Enums ─────────────────────────────────────────────────────────────────────

export type TipoPotrero = "agricultura" | "ganaderia" | "mixto";
export type EstadoPasto = "bueno" | "regular" | "malo";
export type EspecieAnimal = string;
export type TipoPunto = "bebedero" | "casa" | "sombra" | "comedero";
export type EstadoMovimiento = "programado" | "ejecutado" | "cancelado";

// ── Potrero ───────────────────────────────────────────────────────────────────

export interface Potrero {
  id: number;
  user_id: number;
  nombre: string;
  geometria: GeoJSONPolygon;
  tipo: TipoPotrero;
  estado_pasto: EstadoPasto;
  hectareas: number | null;
  tiene_suplementacion: boolean;
  suplementacion_detalle: string | null;
  tiene_franjas: boolean;
  cantidad_franjas: number | null;
  franjas_usadas: number | null;
  dias_por_franja: number | null;
  observaciones: string | null;
  en_descanso: boolean;
  fecha_descanso: string | null;
  cultivo?: string | null;
  es_primera?: boolean | null;
  fecha_siembra?: string | null;
  coneat?: number | null;
  kg_producidos_anio?: number | null;
  created_at: string;
}

export interface PotreroCreate {
  nombre: string;
  geometria: GeoJSONPolygon;
  tipo: TipoPotrero;
  estado_pasto: EstadoPasto;
  hectareas?: number;
  tiene_suplementacion?: boolean;
  suplementacion_detalle?: string;
  tiene_franjas?: boolean;
  cantidad_franjas?: number;
  franjas_usadas?: number;
  dias_por_franja?: number | null;
  observaciones?: string;
  cultivo?: string | null;
  es_primera?: boolean | null;
  fecha_siembra?: string | null;
  coneat?: number | null;
  kg_producidos_anio?: number | null;
}

export interface PotreroUpdate {
  nombre?: string;
  geometria?: GeoJSONPolygon;
  tipo?: TipoPotrero;
  estado_pasto?: EstadoPasto;
  hectareas?: number | null;
  tiene_suplementacion?: boolean;
  suplementacion_detalle?: string | null;
  tiene_franjas?: boolean;
  cantidad_franjas?: number | null;
  franjas_usadas?: number | null;
  dias_por_franja?: number | null;
  observaciones?: string | null;
  cultivo?: string | null;
  es_primera?: boolean | null;
  fecha_siembra?: string | null;
  coneat?: number | null;
  kg_producidos_anio?: number | null;
}

export interface AplicacionPotrero {
  id: number;
  potrero_id: number;
  producto: string;
  fecha_aplicacion: string;
  costo: number | null;
  moneda: string;
  observaciones: string | null;
  registro_id: number | null;
  created_at: string;
}

export interface AplicacionCreate {
  producto: string;
  fecha_aplicacion: string;
  costo?: number | null;
  moneda?: string;
  observaciones?: string;
}

// ── Animal ────────────────────────────────────────────────────────────────────

export interface Animal {
  id: number;
  potrero_id: number;
  user_id: number;
  especie: EspecieAnimal;
  cantidad: number;
  raza: string | null;
  created_at: string;
}

export interface AnimalCreate {
  especie: EspecieAnimal;
  cantidad: number;
  raza?: string;
}

export interface AnimalUpdate {
  especie?: EspecieAnimal;
  cantidad?: number;
  raza?: string | null;
}

// ── PuntoInteres ──────────────────────────────────────────────────────────────

export interface PuntoInteres {
  id: number;
  user_id: number;
  potrero_id: number | null;
  nombre: string;
  tipo: TipoPunto;
  geometria: GeoJSONPoint;
  created_at: string;
}

export interface PuntoInteresCreate {
  nombre: string;
  tipo: TipoPunto;
  geometria: GeoJSONPoint;
  potrero_id?: number;
}

// ── MovimientoGanado ──────────────────────────────────────────────────────────

export interface MovimientoGanado {
  id: number;
  user_id: number;
  potrero_origen_id: number;
  potrero_destino_id: number;
  potrero_origen_nombre: string;
  potrero_destino_nombre: string;
  cantidad: number;
  especie: EspecieAnimal;
  fecha_programada: string; // "YYYY-MM-DD"
  fecha_ejecutada: string | null;
  estado: EstadoMovimiento;
  notas: string | null;
  created_at: string;
}

export interface MovimientoCreate {
  potrero_origen_id: number;
  potrero_destino_id: number;
  cantidad: number;
  especie: EspecieAnimal;
  fecha_programada: string;
  ejecutar_ahora?: boolean;
  notas?: string;
}
