import { api } from "./axios";
import type { ChatRequest, ChatResponse } from "@/types/asistente";

export async function enviarMensaje(data: ChatRequest): Promise<ChatResponse> {
  const res = await api.post<ChatResponse>("/asistente/chat", data);
  return res.data;
}
