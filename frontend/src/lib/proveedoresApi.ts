import { api } from "./axios";
import type {
  Proveedor,
  ProveedorCreate,
  ProveedorUpdate,
  CuentaPagar,
  CuentaPagarCreate,
} from "@/types/clientes";

export async function getProveedores(): Promise<Proveedor[]> {
  const res = await api.get<Proveedor[]>("/proveedores");
  return res.data;
}

export async function createProveedor(data: ProveedorCreate): Promise<Proveedor> {
  const res = await api.post<Proveedor>("/proveedores", data);
  return res.data;
}

export async function updateProveedor(id: number, data: ProveedorUpdate): Promise<Proveedor> {
  const res = await api.put<Proveedor>(`/proveedores/${id}`, data);
  return res.data;
}

export async function deleteProveedor(id: number): Promise<void> {
  await api.delete(`/proveedores/${id}`);
}

export async function getCuentasPagar(proveedorId: number): Promise<CuentaPagar[]> {
  const res = await api.get<CuentaPagar[]>(`/proveedores/${proveedorId}/cuentas`);
  return res.data;
}

export async function createCuentaPagar(
  proveedorId: number,
  data: CuentaPagarCreate
): Promise<CuentaPagar> {
  const res = await api.post<CuentaPagar>(`/proveedores/${proveedorId}/cuentas`, data);
  return res.data;
}

export async function pagarCuentaPagar(cuentaId: number): Promise<CuentaPagar> {
  const res = await api.patch<CuentaPagar>(`/proveedores/cuentas/${cuentaId}/pagar`);
  return res.data;
}
