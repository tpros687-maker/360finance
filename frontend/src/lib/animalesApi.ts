import { api } from "./axios";
import type { Animal, AnimalCreate, AnimalUpdate } from "@/types/mapa";

export async function getAnimales(potreroId: number): Promise<Animal[]> {
  const res = await api.get<Animal[]>(`/potreros/${potreroId}/animales`);
  return res.data;
}

export async function createAnimal(potreroId: number, data: AnimalCreate): Promise<Animal> {
  const res = await api.post<Animal>(`/potreros/${potreroId}/animales`, data);
  return res.data;
}

export async function updateAnimal(id: number, data: AnimalUpdate): Promise<Animal> {
  const res = await api.put<Animal>(`/animales/${id}`, data);
  return res.data;
}

export async function deleteAnimal(id: number): Promise<void> {
  await api.delete(`/animales/${id}`);
}
