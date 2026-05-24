import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

function TrialBanner({ dias, fechaVenc }: { dias: number; fechaVenc: string | null }) {
  const fechaStr = fechaVenc
    ? new Date(fechaVenc).toLocaleDateString("es-UY")
    : null;

  return (
    <div className="flex items-center justify-between gap-3 bg-amber-500 px-4 py-2.5 text-sm text-white">
      <span className="font-medium">
        Tu plan vence en {dias} {dias === 1 ? "día" : "días"}
        {fechaStr ? ` (el ${fechaStr})` : ""}.{" "}
        Renová para continuar.
      </span>
      <a
        href="/pago"
        className="shrink-0 rounded-md bg-white px-3 py-1 text-xs font-semibold text-amber-600 hover:bg-amber-50 transition-colors"
      >
        Ver planes
      </a>
    </div>
  );
}

export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const location = useLocation();

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  if (!user?.onboarding_completado && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  if (user?.plan === "vencido" && location.pathname !== "/pago") {
    return <Navigate to="/pago" replace />;
  }

  const showTrialBanner =
    user != null &&
    user.dias_restantes != null &&
    user.dias_restantes <= 3 &&
    !user.vencido &&
    (user.plan === "trial" || (user.plan === "activo" && user.suscripcion_id == null));

  return (
    <>
      {showTrialBanner && (
        <TrialBanner dias={user.dias_restantes!} fechaVenc={user.trial_fin} />
      )}
      <Outlet />
    </>
  );
}
