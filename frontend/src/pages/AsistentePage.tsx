import { useEffect, useRef, useState, KeyboardEvent } from "react";
import { Bot, Send, RotateCcw, Sparkles } from "lucide-react";
import { useAsistesteStore } from "@/store/asistenteStore";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils";

const SUGERENCIAS = [
  "¿Cómo están mis finanzas este mes?",
  "¿Qué potreros tengo activos?",
  "¿Cuáles son mis mayores gastos?",
  "Recomendaciones para optimizar mis costos",
];

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 mb-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 border border-slate-600">
        <Bot className="h-4 w-4 text-brand-400" />
      </div>
      <div className="rounded-2xl rounded-bl-sm bg-slate-800 border border-slate-700 px-4 py-3">
        <div className="flex gap-1 items-center h-5">
          <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
          <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
          <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

export default function AsistentePage() {
  const { user } = useAuthStore();
  const { historial, isLoading, sendMessage, resetConversacion } = useAsistesteStore();
  const [input, setInput] = useState("");
  const [greeted, setGreeted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const nombreUsuario = user?.nombre ?? "productor";

  // Mensaje de bienvenida automático al abrir la página
  useEffect(() => {
    if (!greeted && historial.length === 0) {
      useAsistesteStore.setState({
        historial: [
          {
            role: "assistant",
            content: `¡Hola ${nombreUsuario}! Soy tu asistente agropecuario. Tengo acceso a tus datos del campo. ¿En qué te puedo ayudar hoy?`,
          },
        ],
      });
      setGreeted(true);
    }
  }, [greeted, historial.length, nombreUsuario]);

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [historial, isLoading]);

  const handleSend = async () => {
    const texto = input.trim();
    if (!texto || isLoading) return;
    setInput("");
    await sendMessage(texto);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNuevaConversacion = () => {
    resetConversacion();
    setGreeted(false);
    inputRef.current?.focus();
  };

  const handleSugerencia = (texto: string) => {
    if (isLoading) return;
    sendMessage(texto);
  };

  const mostrarSugerencias =
    historial.length <= 1 && !isLoading;

  return (
    <div className="flex h-full flex-col bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700/60 bg-slate-900 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/20 border border-brand-500/30">
            <Bot className="h-5 w-5 text-brand-400" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">Asistente IA</h1>
            <p className="text-xs text-slate-400">Powered by Gemini 2.0 Flash</p>
          </div>
        </div>
        <button
          onClick={handleNuevaConversacion}
          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-slate-600 hover:text-white"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Nueva conversación
        </button>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-1">
        <div className="mx-auto max-w-3xl">
          {historial.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex items-end gap-2 mb-4",
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              )}
            >
              {/* Avatar */}
              {msg.role === "assistant" && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 border border-slate-600">
                  <Bot className="h-4 w-4 text-brand-400" />
                </div>
              )}

              {/* Bubble */}
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                  msg.role === "user"
                    ? "rounded-br-sm bg-brand-600 text-white shadow-md"
                    : "rounded-bl-sm bg-slate-800 border border-slate-700 text-slate-100"
                )}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isLoading && <TypingIndicator />}

          {/* Sugerencias rápidas */}
          {mostrarSugerencias && (
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-brand-400" />
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Preguntas frecuentes
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {SUGERENCIAS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSugerencia(s)}
                    className="rounded-full border border-slate-700 bg-slate-800/60 px-4 py-2 text-xs font-medium text-slate-300 transition-colors hover:border-brand-500/50 hover:bg-brand-500/10 hover:text-brand-300"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-slate-700/60 bg-slate-900 p-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 focus-within:border-brand-500/50 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribí tu pregunta... (Enter para enviar)"
              rows={1}
              disabled={isLoading}
              className="flex-1 resize-none bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none disabled:opacity-50"
              style={{ maxHeight: "120px", overflowY: "auto" }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white transition-colors hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-slate-600">
            El asistente tiene acceso a tus datos en tiempo real.
          </p>
        </div>
      </div>
    </div>
  );
}
