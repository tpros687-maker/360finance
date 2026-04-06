import { create } from "zustand";
import type { MensajeChat } from "@/types/asistente";
import { enviarMensaje } from "@/lib/asistenteApi";

interface AsistesteState {
  historial: MensajeChat[];
  isLoading: boolean;
  sendMessage: (mensaje: string) => Promise<void>;
  resetConversacion: () => void;
}

export const useAsistesteStore = create<AsistesteState>((set, get) => ({
  historial: [],
  isLoading: false,

  sendMessage: async (mensaje: string) => {
    const historialActual = get().historial;

    // Agregar mensaje del usuario de inmediato al historial local
    set((s) => ({
      historial: [...s.historial, { role: "user", content: mensaje }],
      isLoading: true,
    }));

    try {
      const response = await enviarMensaje({
        mensaje,
        // Enviar el historial sin el mensaje recién agregado (el backend lo suma)
        historial: historialActual,
      });

      set({ historial: response.historial, isLoading: false });
    } catch {
      set((s) => ({
        historial: [
          ...s.historial,
          {
            role: "assistant" as const,
            content: "Hubo un error al conectar con el asistente. Por favor intentá de nuevo.",
          },
        ],
        isLoading: false,
      }));
    }
  },

  resetConversacion: () => set({ historial: [], isLoading: false }),
}));
