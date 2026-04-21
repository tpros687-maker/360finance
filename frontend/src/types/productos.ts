export interface Producto {
  id: number;
  user_id: number;
  nombre: string;
  descripcion?: string | null;
  tipo: "producto" | "servicio";
  precio: number;
  moneda: string;
  stock?: number | null;
  activo: boolean;
  created_at: string;
}

export interface ProductoCreate {
  nombre: string;
  descripcion?: string | null;
  tipo: "producto" | "servicio";
  precio: number;
  moneda: string;
  stock?: number | null;
}

export interface ProductoUpdate {
  nombre?: string;
  descripcion?: string | null;
  tipo?: "producto" | "servicio";
  precio?: number;
  moneda?: string;
  stock?: number | null;
}
