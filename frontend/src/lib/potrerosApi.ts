import { api } from "./axios";
import type { FranjaEstado, FranjaMoverRequest, MovimientoGanado, Potrero, PotreroCreate, PotreroUpdate } from "@/types/mapa";
import type { RentabilidadPotrero } from "@/types/potreros";

export async function getPotreros(): Promise<Potrero[]> {
  const res = await api.get<Potrero[]>("/potreros");
  return res.data;
}

export async function createPotrero(data: PotreroCreate): Promise<Potrero> {
  const res = await api.post<Potrero>("/potreros", data);
  return res.data;
}

export async function updatePotrero(id: number, data: PotreroUpdate): Promise<Potrero> {
  const res = await api.put<Potrero>(`/potreros/${id}`, data);
  return res.data;
}

export async function deletePotrero(id: number): Promise<void> {
  await api.delete(`/potreros/${id}`);
}

export async function getMovimientosByPotrero(potreroId: number): Promise<MovimientoGanado[]> {
  const res = await api.get<MovimientoGanado[]>(`/potreros/${potreroId}/movimientos`);
  return res.data;
}

export async function getFranjas(potreroId: number): Promise<FranjaEstado[]> {
  const res = await api.get<FranjaEstado[]>(`/potreros/${potreroId}/franjas`);
  return res.data;
}

export async function moverFranja(potreroId: number, body: FranjaMoverRequest): Promise<FranjaEstado[]> {
  const res = await api.post<FranjaEstado[]>(`/potreros/${potreroId}/franjas/mover`, body);
  return res.data;
}

export async function updateFranja(
  potreroId: number,
  numero: number,
  accion: "activar" | "iniciar_descanso" | "resetear"
): Promise<FranjaEstado> {
  const res = await api.put<FranjaEstado>(`/potreros/${potreroId}/franjas/${numero}`, { accion });
  return res.data;
}

export async function getRentabilidadPotreros(params?: {
  fecha_desde?: string;
  fecha_hasta?: string;
}): Promise<RentabilidadPotrero[]> {
  const res = await api.get<RentabilidadPotrero[]>("/potreros/rentabilidad", { params });
  return res.data;
}
