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
import { register as registerUser, login, getMe, parseApiError } from "@/lib/authApi";
import { toast } from "@/hooks/useToast";

const schema = z
  .object({
    nombre: z.string().min(1, "Ingresá tu nombre"),
    apellido: z.string().min(1, "Ingresá tu apellido"),
    email: z.string().email("Email inválido"),
    password: z.string().min(8, "Mínimo 8 caracteres"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  });

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const navigate = useNavigate();
  const { setTokens, setUser } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: async (data: FormValues) => {
      await registerUser({ email: data.email, nombre: data.nombre, apellido: data.apellido, password: data.password });
      const tokens = await login({ email: data.email, password: data.password });
      setTokens(tokens.access_token, tokens.refresh_token);
      const user = await getMe();
      setUser(user);
    },
    onSuccess: () => {
      toast({ title: "Cuenta creada", description: "Bienvenido a 360 Finance" });
      navigate("/dashboard");
    },
    onError: (err) => {
      toast({ title: "Error al registrarse", description: parseApiError(err), variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-8">
      <div className="w-full max-w-md space-y-6">
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
            <CardTitle>Crear cuenta</CardTitle>
            <CardDescription>Completá tus datos para registrarte</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="nombre">Nombre</Label>
                  <Input id="nombre" placeholder="Juan" {...register("nombre")} />
                  {errors.nombre && <p className="text-xs text-red-400">{errors.nombre.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="apellido">Apellido</Label>
                  <Input id="apellido" placeholder="Pérez" {...register("apellido")} />
                  {errors.apellido && <p className="text-xs text-red-400">{errors.apellido.message}</p>}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="tu@email.com" autoComplete="email" {...register("email")} />
                {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Contraseña</Label>
                <Input id="password" type="password" placeholder="Mínimo 8 caracteres" autoComplete="new-password" {...register("password")} />
                {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirmar contraseña</Label>
                <Input id="confirm" type="password" placeholder="Repetí tu contraseña" autoComplete="new-password" {...register("confirm")} />
                {errors.confirm && <p className="text-xs text-red-400">{errors.confirm.message}</p>}
              </div>

              <Button type="submit" className="w-full" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Crear cuenta
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-slate-400">
              ¿Ya tenés cuenta?{" "}
              <Link to="/login" className="text-brand-400 hover:underline font-medium">
                Iniciá sesión
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
