export interface RentabilidadPotrero {
  potrero_id: number;
  nombre: string;
  hectareas: number | null;
  total_ingresos: number;
  total_gastos: number;
  balance: number;
  rentabilidad_pct: number | null;
  cantidad_animales: number;
}
