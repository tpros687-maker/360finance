import { useState } from "react";
import {
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  CalendarDays,
  Receipt,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { getPlan, getPagosHistorial, crearPreferencia, type PagoHistorial } from "@/lib/pagosApi";
import type { PlanInfo } from "@/types/auth";

const PLAN_LABELS: Record<string, string> = {
  trial: "Período de prueba",
  activo: "Plan Pro — Activo",
  vencido: "Período de prueba vencido",
  sso: "Acceso corporativo",
};

const ESTADO_LABELS: Record<string, string> = {
  approved: "Aprobado",
  pending: "Pendiente",
  rejected: "Rechazado",
  in_process: "En proceso",
};

function PlanBadge({ plan }: { plan: string }) {
  const base = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium";
  if (plan === "activo" || plan === "sso")
    return <span className={`${base} bg-emerald-50 text-emerald-700`}><CheckCircle2 className="h-3 w-3" />{PLAN_LABELS[plan] ?? plan}</span>;
  if (plan === "trial")
    return <span className={`${base} bg-amber-50 text-amber-700`}><Clock className="h-3 w-3" />{PLAN_LABELS[plan]}</span>;
  return <span className={`${base} bg-red-50 text-red-700`}><AlertCircle className="h-3 w-3" />{PLAN_LABELS[plan] ?? plan}</span>;
}

function EstadoPago({ estado }: { estado: string }) {
  const label = ESTADO_LABELS[estado] ?? estado;
  if (estado === "approved") return <span className="text-emerald-600 font-medium">{label}</span>;
  if (estado === "pending" || estado === "in_process") return <span className="text-amber-600 font-medium">{label}</span>;
  return <span className="text-red-600 font-medium">{label}</span>;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function FacturacionPage() {
  const user = useAuthStore((s) => s.user);
  const [subscribing, setSubscribing] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  const { data: planInfo } = useQuery<PlanInfo>({
    queryKey: ["plan"],
    queryFn: getPlan,
    enabled: !!user,
  });

  const { data: historial = [], isLoading: loadingHistorial } = useQuery<PagoHistorial[]>({
    queryKey: ["pagos-historial"],
    queryFn: getPagosHistorial,
    enabled: !!user,
  });

  async function handleSuscribir() {
    setSubscribing(true);
    setSubError(null);
    try {
      const { init_point } = await crearPreferencia();
      window.location.href = init_point;
    } catch {
      setSubError("No se pudo iniciar el proceso de pago. Intentá de nuevo.");
      setSubscribing(false);
    }
  }

  const plan = planInfo?.plan ?? user?.plan ?? "trial";
  const diasRestantes = planInfo?.dias_restantes ?? user?.dias_restantes ?? null;
  const trialInicio = planInfo?.trial_inicio ?? user?.trial_inicio ?? null;
  const trialFin = planInfo?.trial_fin ?? user?.trial_fin ?? null;
  const showSuscribir = plan === "trial" || plan === "vencido";

  return (
    <div className="flex h-full flex-col bg-agro-bg overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-agro-accent/20 px-6 py-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-agro-primary/10">
              <CreditCard className="h-5 w-5 text-agro-primary" />
            </div>
            <h1 className="text-2xl font-bold text-agro-text">Facturación</h1>
          </div>
          <p className="text-agro-muted text-sm">
            Estado de tu suscripción e historial de pagos.
          </p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-6 py-8 space-y-8">

        {/* Plan card */}
        <section>
          <div className="rounded-2xl border border-agro-accent/20 bg-white p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-agro-muted uppercase tracking-wider mb-2">
                  Plan actual
                </p>
                <PlanBadge plan={plan} />

                {/* Dates */}
                <div className="pt-3 space-y-1.5">
                  {trialInicio && (
                    <div className="flex items-center gap-2 text-sm text-agro-muted">
                      <CalendarDays className="h-4 w-4 shrink-0" />
                      <span>Inicio: <span className="text-agro-text font-medium">{formatDate(trialInicio)}</span></span>
                    </div>
                  )}
                  {trialFin && (
                    <div className="flex items-center gap-2 text-sm text-agro-muted">
                      <CalendarDays className="h-4 w-4 shrink-0" />
                      <span>
                        {plan === "activo" ? "Próxima renovación" : "Vencimiento"}:{" "}
                        <span className="text-agro-text font-medium">{formatDate(trialFin)}</span>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Days remaining pill */}
              {plan === "trial" && diasRestantes !== null && (
                <div className="flex flex-col items-center justify-center rounded-xl bg-amber-50 border border-amber-200 px-5 py-3 text-center">
                  <span className="text-3xl font-bold text-amber-700">{diasRestantes}</span>
                  <span className="text-xs text-amber-600 mt-0.5">
                    {diasRestantes === 1 ? "día restante" : "días restantes"}
                  </span>
                </div>
              )}
            </div>

            {/* Subscribe button */}
            {showSuscribir && (
              <div className="mt-6 border-t border-agro-accent/15 pt-5">
                {plan === "vencido" && (
                  <p className="mb-3 text-sm text-red-600">
                    Tu período de prueba ha vencido. Suscribite para recuperar el acceso completo.
                  </p>
                )}
                {subError && (
                  <p className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">
                    {subError}
                  </p>
                )}
                <button
                  onClick={handleSuscribir}
                  disabled={subscribing}
                  className="flex items-center gap-2 rounded-xl bg-agro-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-agro-primary/90 disabled:opacity-60"
                >
                  {subscribing ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Procesando…</>
                  ) : (
                    <><CreditCard className="h-4 w-4" />Suscribirme — $7 USD/mes</>
                  )}
                </button>
                <p className="mt-2 text-xs text-agro-muted">Pago seguro procesado por MercadoPago</p>
              </div>
            )}

            {plan === "activo" && (
              <div className="mt-4 border-t border-agro-accent/15 pt-4">
                <p className="text-xs text-agro-muted">
                  Para cancelar o cambiar tu plan, contactanos a{" "}
                  <a href="mailto:soporte@360finance.uy" className="text-agro-primary hover:underline">
                    soporte@360finance.uy
                  </a>
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Historial */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="h-4 w-4 text-agro-primary" />
            <h2 className="text-base font-semibold text-agro-text">Historial de pagos</h2>
          </div>

          <div className="rounded-2xl border border-agro-accent/20 bg-white overflow-hidden">
            {loadingHistorial ? (
              <div className="flex items-center justify-center py-12 text-agro-muted text-sm gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando historial…
              </div>
            ) : historial.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-agro-muted">
                <Receipt className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">Sin pagos registrados</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-agro-accent/15 bg-agro-bg">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-agro-muted uppercase tracking-wider">Fecha</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-agro-muted uppercase tracking-wider">Monto</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-agro-muted uppercase tracking-wider">Estado</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-agro-muted uppercase tracking-wider hidden sm:table-cell">ID de pago</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-agro-accent/10">
                  {historial.map((pago) => (
                    <tr key={pago.id} className="hover:bg-agro-bg/50 transition-colors">
                      <td className="px-5 py-3.5 text-agro-text">{formatDate(pago.created_at)}</td>
                      <td className="px-5 py-3.5 font-medium text-agro-text">
                        ${pago.monto.toFixed(2)} {pago.moneda}
                      </td>
                      <td className="px-5 py-3.5"><EstadoPago estado={pago.estado} /></td>
                      <td className="px-5 py-3.5 text-agro-muted font-mono text-xs hidden sm:table-cell">
                        {pago.mp_payment_id ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
