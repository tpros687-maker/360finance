import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Leaf, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/axios";
import { parseApiError } from "@/lib/authApi";
import { toast } from "@/hooks/useToast";

const schema = z
  .object({
    password_nueva: z.string().min(8, "Mínimo 8 caracteres"),
    confirm: z.string(),
  })
  .refine((d) => d.password_nueva === d.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  });

type FormValues = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [ok, setOk] = useState(false);
  const token = searchParams.get("token") ?? "";

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      api.post("/auth/reset-password", { token, password_nueva: data.password_nueva }),
    onSuccess: () => setOk(true),
    onError: (err) => {
      toast({ title: "Error", description: parseApiError(err), variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/20">
            <Leaf className="h-6 w-6 text-brand-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">
            360 Agro <span className="text-brand-400">Finance</span>
          </h1>
        </div>

        <Card>
          {ok ? (
            <CardContent className="pt-8 pb-8 text-center space-y-4">
              <p className="text-slate-200 font-medium text-lg">Contraseña actualizada ✅</p>
              <p className="text-slate-400 text-sm">Ya podés iniciar sesión con tu nueva contraseña.</p>
              <Button className="w-full" onClick={() => navigate("/login")}>
                Ir al login
              </Button>
            </CardContent>
          ) : (
            <>
              <CardHeader className="space-y-1">
                <CardTitle>Nueva contraseña</CardTitle>
                <CardDescription>Elegí una contraseña segura para tu cuenta</CardDescription>
              </CardHeader>
              <CardContent>
                {!token ? (
                  <p className="text-red-400 text-sm text-center">Link inválido o expirado.</p>
                ) : (
                  <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="password_nueva">Nueva contraseña</Label>
                      <Input id="password_nueva" type="password" placeholder="Mínimo 8 caracteres" autoComplete="new-password" {...register("password_nueva")} />
                      {errors.password_nueva && <p className="text-xs text-red-400">{errors.password_nueva.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="confirm">Confirmar contraseña</Label>
                      <Input id="confirm" type="password" placeholder="Repetí tu contraseña" autoComplete="new-password" {...register("confirm")} />
                      {errors.confirm && <p className="text-xs text-red-400">{errors.confirm.message}</p>}
                    </div>
                    <Button type="submit" className="w-full" disabled={mutation.isPending}>
                      {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      Guardar contraseña
                    </Button>
                  </form>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
