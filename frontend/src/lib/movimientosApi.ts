import { api } from "./axios";
import type { MovimientoGanado, MovimientoCreate } from "@/types/mapa";

export async function getMovimientos(): Promise<MovimientoGanado[]> {
  const res = await api.get<MovimientoGanado[]>("/movimientos");
  return res.data;
}

export async function createMovimiento(data: MovimientoCreate): Promise<MovimientoGanado> {
  const res = await api.post<MovimientoGanado>("/movimientos", data);
  return res.data;
}

export async function ejecutarMovimiento(id: number): Promise<MovimientoGanado> {
  const res = await api.put<MovimientoGanado>(`/movimientos/${id}/ejecutar`);
  return res.data;
}

export async function deleteMovimiento(id: number): Promise<void> {
  await api.delete(`/movimientos/${id}`);
}
