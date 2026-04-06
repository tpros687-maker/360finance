import { api } from "./axios";
import type { PuntoInteres, PuntoInteresCreate } from "@/types/mapa";

export async function getPuntos(): Promise<PuntoInteres[]> {
  const res = await api.get<PuntoInteres[]>("/puntos-interes");
  return res.data;
}

export async function createPunto(data: PuntoInteresCreate): Promise<PuntoInteres> {
  const res = await api.post<PuntoInteres>("/puntos-interes", data);
  return res.data;
}

export async function deletePunto(id: number): Promise<void> {
  await api.delete(`/puntos-interes/${id}`);
}
