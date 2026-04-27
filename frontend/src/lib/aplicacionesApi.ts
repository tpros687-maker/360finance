import { api } from "./axios";
import type { AplicacionPotrero, AplicacionCreate } from "@/types/mapa";

export async function getAplicaciones(potreroId: number): Promise<AplicacionPotrero[]> {
  const res = await api.get<AplicacionPotrero[]>(`/potreros/${potreroId}/aplicaciones`);
  return res.data;
}

export async function createAplicacion(potreroId: number, data: AplicacionCreate): Promise<AplicacionPotrero> {
  const res = await api.post<AplicacionPotrero>(`/potreros/${potreroId}/aplicaciones`, data);
  return res.data;
}

export async function deleteAplicacion(id: number): Promise<void> {
  await api.delete(`/aplicaciones/${id}`);
}
