import { api } from "./axios";
import type { Producto, ProductoCreate, ProductoUpdate } from "@/types/productos";

export async function getProductos(): Promise<Producto[]> {
  const res = await api.get<Producto[]>("/productos");
  return res.data;
}

export async function createProducto(data: ProductoCreate): Promise<Producto> {
  const res = await api.post<Producto>("/productos", data);
  return res.data;
}

export async function updateProducto(id: number, data: ProductoUpdate): Promise<Producto> {
  const res = await api.put<Producto>(`/productos/${id}`, data);
  return res.data;
}

export async function deleteProducto(id: number): Promise<void> {
  await api.delete(`/productos/${id}`);
}

export async function toggleProducto(id: number): Promise<Producto> {
  const res = await api.patch<Producto>(`/productos/${id}/toggle`);
  return res.data;
}
