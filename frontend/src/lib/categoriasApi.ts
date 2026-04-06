import { api } from "./axios";
import type { Categoria, CategoriaCreate } from "@/types/registros";

export async function getCategorias(): Promise<Categoria[]> {
  const res = await api.get<Categoria[]>("/categorias");
  return res.data;
}

export async function createCategoria(data: CategoriaCreate): Promise<Categoria> {
  const res = await api.post<Categoria>("/categorias", data);
  return res.data;
}

export async function deleteCategoria(id: number): Promise<void> {
  await api.delete(`/categorias/${id}`);
}
