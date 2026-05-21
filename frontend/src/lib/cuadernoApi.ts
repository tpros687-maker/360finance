import { api } from "./axios";
import type { NotaCuaderno, NotaCreate, TareaCuaderno, TareaCreate } from "@/types/cuaderno";

export async function getNotas(): Promise<NotaCuaderno[]> {
  const res = await api.get<NotaCuaderno[]>("/cuaderno/notas");
  return res.data;
}

export async function createNota(data: NotaCreate): Promise<NotaCuaderno> {
  const res = await api.post<NotaCuaderno>("/cuaderno/notas", data);
  return res.data;
}

export async function deleteNota(id: number): Promise<void> {
  await api.delete(`/cuaderno/notas/${id}`);
}

export async function getTareas(completada?: boolean): Promise<TareaCuaderno[]> {
  const res = await api.get<TareaCuaderno[]>("/cuaderno/tareas", {
    params: completada !== undefined ? { completada } : undefined,
  });
  return res.data;
}

export async function createTarea(data: TareaCreate): Promise<TareaCuaderno> {
  const res = await api.post<TareaCuaderno>("/cuaderno/tareas", data);
  return res.data;
}

export async function completarTarea(id: number): Promise<TareaCuaderno> {
  const res = await api.patch<TareaCuaderno>(`/cuaderno/tareas/${id}/completar`);
  return res.data;
}

export async function deleteTarea(id: number): Promise<void> {
  await api.delete(`/cuaderno/tareas/${id}`);
}
