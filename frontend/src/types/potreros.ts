export interface RentabilidadPotrero {
  potrero_id: number;
  nombre: string;
  hectareas: number | null;
  total_ingresos: number;
  total_gastos: number;
  balance: number;
  rentabilidad_pct: number | null;
  cantidad_animales: number;
  margen_bruto_ha: number | null;
  carga_animal_ug_ha: number | null;
  produccion_kg_ha: number | null;
  coneat: number | null;
}
