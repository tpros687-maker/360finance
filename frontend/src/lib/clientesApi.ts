import { api } from "./axios";
import type {
  Cliente,
  ClienteCreate,
  ClienteUpdate,
  CuentaCobrar,
  CuentaCobrarCreate,
} from "@/types/clientes";

export async function getClientes(): Promise<Cliente[]> {
  const res = await api.get<Cliente[]>("/clientes");
  return res.data;
}

export async function createCliente(data: ClienteCreate): Promise<Cliente> {
  const res = await api.post<Cliente>("/clientes", data);
  return res.data;
}

export async function updateCliente(id: number, data: ClienteUpdate): Promise<Cliente> {
  const res = await api.put<Cliente>(`/clientes/${id}`, data);
  return res.data;
}

export async function deleteCliente(id: number): Promise<void> {
  await api.delete(`/clientes/${id}`);
}

export async function getCuentas(clienteId: number): Promise<CuentaCobrar[]> {
  const res = await api.get<CuentaCobrar[]>(`/clientes/${clienteId}/cuentas`);
  return res.data;
}

export async function createCuenta(
  clienteId: number,
  data: CuentaCobrarCreate
): Promise<CuentaCobrar> {
  const res = await api.post<CuentaCobrar>(`/clientes/${clienteId}/cuentas`, data);
  return res.data;
}

export async function pagarCuenta(cuentaId: number): Promise<CuentaCobrar> {
  const res = await api.patch<CuentaCobrar>(`/clientes/cuentas/${cuentaId}/pagar`);
  return res.data;
}
