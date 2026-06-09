import api from "./api";
import type { MercadoResponse, CategoriaMercado } from "@/types/mercado";

export async function getPredicciones(): Promise<MercadoResponse> {
  const { data } = await api.get<MercadoResponse>("/mercado/predicciones");
  return data;
}

export async function getPrediccionCategoria(id: string): Promise<CategoriaMercado> {
  const { data } = await api.get<CategoriaMercado>(`/mercado/predicciones/${id}`);
  return data;
}

export async function actualizarPredicciones(): Promise<void> {
  await api.post("/mercado/actualizar");
}
