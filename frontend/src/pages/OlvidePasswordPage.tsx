import { useState } from "react";
import { Link } from "react-router-dom";
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

const schema = z.object({
  email: z.string().email("Email inválido"),
});
type FormValues = z.infer<typeof schema>;

export default function OlvidePasswordPage() {
  const [enviado, setEnviado] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const mutation = useMutation({
    mutationFn: (data: FormValues) => api.post("/auth/recuperar-password", data),
    onSuccess: () => setEnviado(true),
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
          {enviado ? (
            <CardContent className="pt-8 pb-8 text-center space-y-4">
              <p className="text-4xl">✉️</p>
              <p className="text-slate-200 font-medium">Revisá tu email</p>
              <p className="text-slate-400 text-sm leading-relaxed">
                Te enviamos un link para resetear tu contraseña. Si no lo ves, revisá la carpeta de spam.
              </p>
              <Link to="/login" className="block">
                <Button variant="outline" className="w-full">Volver al login</Button>
              </Link>
            </CardContent>
          ) : (
            <>
              <CardHeader className="space-y-1">
                <CardTitle>Recuperar contraseña</CardTitle>
                <CardDescription>Ingresá tu email y te enviamos un link para resetearla</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" placeholder="tu@email.com" autoComplete="email" {...register("email")} />
                    {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
                  </div>
                  <Button type="submit" className="w-full" disabled={mutation.isPending}>
                    {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Enviar link
                  </Button>
                </form>
                <p className="mt-4 text-center text-sm text-slate-400">
                  <Link to="/login" className="text-brand-400 hover:underline font-medium">
                    Volver al login
                  </Link>
                </p>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
