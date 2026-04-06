import { api } from "./axios";
import type { Potrero, PotreroCreate, PotreroUpdate } from "@/types/mapa";
import type { MovimientoGanado } from "@/types/mapa";

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
