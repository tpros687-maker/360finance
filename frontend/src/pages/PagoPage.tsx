import { useState } from "react";
import { Leaf, CheckCircle2, Clock, Loader2, CreditCard, RefreshCw } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { crearPreferencia, crearSuscripcion } from "@/lib/pagosApi";

const FEATURES_BASE = [
  "Registros de gastos e ingresos",
  "Clientes y cuentas por cobrar",
  "Proveedores y cuentas por pagar",
  "Catálogo de productos y servicios",
  "Asistente IA agropecuario",
  "Exportación de registros",
  "Comprobantes adjuntos",
];

const FEATURES_CAMPO = [
  "Mapa de potreros interactivo",
  "Registro y movimiento de animales",
];

export default function PagoPage() {
  const user = useAuthStore((s) => s.user);
  const [loadingAuto, setLoadingAuto] = useState(false);
  const [loadingManual, setLoadingManual] = useState(false);
  const [errorAuto, setErrorAuto] = useState<string | null>(null);
  const [errorManual, setErrorManual] = useState<string | null>(null);

  const features = user?.es_productor
    ? [...FEATURES_BASE, ...FEATURES_CAMPO]
    : FEATURES_BASE;

  const diasRestantes =
    user?.plan === "trial" && user.dias_restantes !== null && user.dias_restantes !== undefined
      ? user.dias_restantes
      : null;

  const anyLoading = loadingAuto || loadingManual;

  async function handleSuscripcionAuto() {
    setLoadingAuto(true);
    setErrorAuto(null);
    try {
      const { init_point } = await crearSuscripcion();
      window.location.href = init_point;
    } catch {
      setErrorAuto("No se pudo iniciar la suscripción automática. Intentá de nuevo.");
      setLoadingAuto(false);
    }
  }

  async function handlePagoManual() {
    setLoadingManual(true);
    setErrorManual(null);
    try {
      const { init_point } = await crearPreferencia();
      window.location.href = init_point;
    } catch {
      setErrorManual("No se pudo iniciar el proceso de pago. Intentá de nuevo.");
      setLoadingManual(false);
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-agro-bg px-4 py-12 overflow-y-auto">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-agro-primary/10">
            <Leaf className="h-5 w-5 text-agro-primary" />
          </div>
          <h1 className="text-xl font-bold text-agro-text">
            360 Agro Finance <span className="text-agro-primary">— Plan Pro</span>
          </h1>
        </div>

        {/* Trial notice */}
        {diasRestantes !== null && (
          <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <Clock className="h-4 w-4 shrink-0" />
            <span>
              {diasRestantes === 0
                ? "Tu período de prueba vence hoy."
                : `Te ${diasRestantes === 1 ? "queda" : "quedan"} ${diasRestantes} ${diasRestantes === 1 ? "día" : "días"} de prueba.`}
            </span>
          </div>
        )}

        {/* Plan card */}
        <div className="rounded-2xl border border-agro-accent/20 bg-white p-8 shadow-sm">

          {/* Price */}
          <div className="mb-6 text-center">
            <p className="text-4xl font-bold text-agro-text">
              UYU $280{" "}
              <span className="text-lg font-normal text-agro-muted">por mes</span>
            </p>
            <p className="mt-1 text-xs text-agro-muted">Pago seguro procesado por MercadoPago</p>
          </div>

          {/* Divider */}
          <div className="mb-5 border-t border-agro-accent/15" />

          {/* Features */}
          <ul className="mb-6 space-y-2.5">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-agro-text">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-agro-primary" />
                {f}
              </li>
            ))}
          </ul>

          {/* Divider */}
          <div className="mb-5 border-t border-agro-accent/15" />

          {/* Opción 1 — Renovación automática (recomendada) */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-agro-text">Renovación automática</span>
              <span className="rounded-full bg-agro-primary/10 px-2 py-0.5 text-[11px] font-semibold text-agro-primary">
                Recomendado
              </span>
            </div>
            <p className="text-xs text-agro-muted mb-2.5">
              Se cobra automáticamente cada mes. Cancelás cuando quieras.
            </p>
            {errorAuto && (
              <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 border border-red-200">
                {errorAuto}
              </p>
            )}
            <button
              onClick={handleSuscripcionAuto}
              disabled={anyLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-agro-primary py-3 text-sm font-semibold text-white transition-colors hover:bg-agro-primary/90 disabled:opacity-60"
            >
              {loadingAuto ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Procesando…
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Suscribirme (automático)
                </>
              )}
            </button>
          </div>

          {/* Opción 2 — Pago manual */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-semibold text-agro-text">Pagar un mes (manual)</span>
            </div>
            <p className="text-xs text-agro-muted mb-2.5">
              Pagás un mes. Te avisamos por email antes de que venza para que renueves.
            </p>
            {errorManual && (
              <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 border border-red-200">
                {errorManual}
              </p>
            )}
            <button
              onClick={handlePagoManual}
              disabled={anyLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-agro-accent/30 bg-white py-3 text-sm font-semibold text-agro-text transition-colors hover:bg-agro-bg disabled:opacity-60"
            >
              {loadingManual ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Procesando…
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4" />
                  Pagar un mes
                </>
              )}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
