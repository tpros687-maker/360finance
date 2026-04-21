export interface Cliente {
  id: number;
  nombre: string;
  telefono?: string;
  email?: string;
  notas?: string;
  created_at: string;
  cuentas?: CuentaCobrar[];
}

export interface CuentaCobrar {
  id: number;
  cliente_id: number;
  monto: number;
  moneda: string;
  descripcion?: string;
  fecha_vencimiento?: string;
  pagado: boolean;
  created_at: string;
}

export interface ClienteCreate {
  nombre: string;
  telefono?: string;
  email?: string;
  notas?: string;
}

export interface ClienteUpdate {
  nombre?: string;
  telefono?: string;
  email?: string;
  notas?: string;
}

export interface CuentaCobrarCreate {
  monto: number;
  moneda?: string;
  descripcion?: string;
  fecha_vencimiento?: string;
}

export interface Proveedor {
  id: number;
  nombre: string;
  telefono?: string;
  email?: string;
  notas?: string;
  created_at: string;
  cuentas_pagar?: CuentaPagar[];
}

export interface CuentaPagar {
  id: number;
  proveedor_id: number;
  monto: number;
  moneda: string;
  descripcion?: string;
  fecha_vencimiento?: string;
  pagado: boolean;
  created_at: string;
}

export interface ProveedorCreate {
  nombre: string;
  telefono?: string;
  email?: string;
  notas?: string;
}

export interface ProveedorUpdate {
  nombre?: string;
  telefono?: string;
  email?: string;
  notas?: string;
}

export interface CuentaPagarCreate {
  monto: number;
  moneda?: string;
  descripcion?: string;
  fecha_vencimiento?: string;
}
