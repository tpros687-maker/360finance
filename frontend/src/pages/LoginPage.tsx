import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Leaf, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/store/authStore";
import { login, getMe, parseApiError } from "@/lib/authApi";
import { toast } from "@/hooks/useToast";

const schema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Ingresá tu contraseña"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const { setTokens, setUser } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const tokens = await login(data);
      setTokens(tokens.access_token, tokens.refresh_token);
      const user = await getMe();
      setUser(user);
    },
    onSuccess: () => {
      navigate("/dashboard");
    },
    onError: (err) => {
      toast({ title: "Error al iniciar sesión", description: parseApiError(err), variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand */}
        <div className="flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/20">
            <Leaf className="h-6 w-6 text-brand-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">
            360 <span className="text-brand-400">Finance</span>
          </h1>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle>Iniciar sesión</CardTitle>
            <CardDescription>Ingresá tus credenciales para continuar</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@email.com"
                  autoComplete="email"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-xs text-red-400">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  {...register("password")}
                />
                {errors.password && (
                  <p className="text-xs text-red-400">{errors.password.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Ingresar
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-slate-400">
              ¿No tenés cuenta?{" "}
              <Link to="/register" className="text-brand-400 hover:underline font-medium">
                Registrate
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
