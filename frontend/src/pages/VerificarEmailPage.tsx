import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/axios";

type Estado = "cargando" | "ok" | "error";

export default function VerificarEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [estado, setEstado] = useState<Estado>("cargando");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setEstado("error");
      return;
    }
    api
      .get("/auth/verificar-email", { params: { token } })
      .then(() => setEstado("ok"))
      .catch(() => setEstado("error"));
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-sm w-full text-center shadow-xl space-y-4">
        <h1 className="text-xl font-bold text-slate-100">360 Agro Finance</h1>

        {estado === "cargando" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
            <p className="text-slate-400 text-sm">Verificando tu email...</p>
          </div>
        )}

        {estado === "ok" && (
          <div className="space-y-4">
            <p className="text-2xl">✅</p>
            <p className="text-slate-200 font-medium">Email verificado</p>
            <p className="text-slate-400 text-sm">Ya podés iniciar sesión.</p>
            <Button className="w-full" onClick={() => navigate("/login")}>
              Ir al login
            </Button>
          </div>
        )}

        {estado === "error" && (
          <div className="space-y-4">
            <p className="text-2xl">❌</p>
            <p className="text-slate-200 font-medium">Link inválido o ya utilizado</p>
            <p className="text-slate-400 text-sm">
              El enlace de verificación expiró o ya fue usado.
            </p>
            <Button variant="outline" className="w-full" onClick={() => navigate("/login")}>
              Ir al login
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
