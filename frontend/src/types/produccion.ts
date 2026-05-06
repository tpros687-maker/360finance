export interface LoteGanado {
  id: number;
  potrero_id: number;
  especie: string;
  cantidad: number;
  fecha_entrada: string;
  peso_entrada_kg: number;
  fecha_salida: string | null;
  peso_salida_kg: number | null;
  notas: string | null;
  dias_en_potrero: number | null;
  kg_producidos: number | null;
  gdp_kg_dia: number | null;
}

export interface LoteCreate {
  potrero_id: number;
  especie: string;
  cantidad: number;
  fecha_entrada: string;
  peso_entrada_kg: number;
  fecha_salida?: string;
  peso_salida_kg?: number;
  notas?: string;
}

export interface LoteUpdate {
  fecha_salida?: string;
  peso_salida_kg?: number;
  notas?: string;
}

export interface EventoReproductivo {
  id: number;
  potrero_id: number;
  tipo: string;
  fecha: string;
  vientres_totales: number;
  resultado: number;
  tasa_pct: number;
  notas: string | null;
}

export interface EventoCreate {
  potrero_id: number;
  tipo: string;
  fecha: string;
  vientres_totales: number;
  resultado: number;
  notas?: string;
}

export interface CicloAgricola {
  id: number;
  potrero_id: number;
  zafra: string;
  cultivo: string;
  fecha_siembra: string | null;
  fecha_cosecha: string | null;
  toneladas_cosechadas: number | null;
  precio_venta_tn: number | null;
  moneda: string;
  notas: string | null;
  rinde_tn_ha: number | null;
  ingreso_bruto: number | null;
}

export interface CicloCreate {
  potrero_id: number;
  zafra: string;
  cultivo: string;
  fecha_siembra?: string;
  fecha_cosecha?: string;
  toneladas_cosechadas?: number;
  precio_venta_tn?: number;
  moneda?: string;
  notas?: string;
}

export interface CicloUpdate {
  fecha_cosecha?: string;
  toneladas_cosechadas?: number;
  precio_venta_tn?: number;
  notas?: string;
}
