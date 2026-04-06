export type RoleMensaje = "user" | "assistant";

export interface MensajeChat {
  role: RoleMensaje;
  content: string;
}

export interface ChatRequest {
  mensaje: string;
  historial: MensajeChat[];
}

export interface ChatResponse {
  respuesta: string;
  historial: MensajeChat[];
}
