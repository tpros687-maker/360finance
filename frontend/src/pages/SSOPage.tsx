import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getMe, ssoLogin } from "@/lib/authApi";
import { useAuthStore } from "@/store/authStore";

export default function SSOPage() {
  const [error, setError] = useState<string | null>(null);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setTokens, setUser } = useAuthStore();

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setError("Token SSO no encontrado en la URL.");
      return;
    }
    ssoLogin(token)
      .then(async (pair) => {
        setTokens(pair.access_token, pair.refresh_token);
        const user = await getMe();
        setUser(user);
        navigate(user.onboarding_completado ? "/dashboard" : "/onboarding", { replace: true });
      })
      .catch(() =>
        setError("Token SSO inválido o expirado. Volvé a intentarlo desde 360 Agro.")
      );
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <p className="text-red-400 text-center max-w-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <p className="text-slate-400">Iniciando sesión...</p>
    </div>
  );
}
