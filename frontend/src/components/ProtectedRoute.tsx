import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";

function TrialBanner({ dias }: { dias: number }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-amber-500 px-4 py-2.5 text-sm text-white">
      <span className="font-medium">
        Tu período de prueba vence en {dias} {dias === 1 ? "día" : "días"}.{" "}
        Suscribite para continuar.
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
    user?.plan === "trial" &&
    user.dias_restantes !== null &&
    user.dias_restantes !== undefined &&
    user.dias_restantes <= 3;

  return (
    <>
      {showTrialBanner && <TrialBanner dias={user!.dias_restantes!} />}
      <Outlet />
    </>
  );
}
