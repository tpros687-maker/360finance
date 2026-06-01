import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { User, Save, Lock } from "lucide-react";
import { updateProfile, parseApiError } from "@/lib/authApi";
import { useAuthStore } from "@/store/authStore";
import { toast } from "@/hooks/useToast";
import { api } from "@/lib/axios";

interface FormValues {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
}

const pwSchema = z
  .object({
    password_actual: z.string().min(1, "Ingresá tu contraseña actual"),
    password_nueva: z.string().min(8, "Mínimo 8 caracteres"),
    confirm: z.string(),
  })
  .refine((d) => d.password_nueva === d.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  });

type PwFormValues = z.infer<typeof pwSchema>;

export default function PerfilPage() {
  const { user, setUser } = useAuthStore();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>();

  useEffect(() => {
    if (user) {
      reset({
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        telefono: user.telefono ?? "",
      });
    }
  }, [user, reset]);

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      updateProfile({
        nombre: data.nombre,
        apellido: data.apellido,
        email: data.email,
        telefono: data.telefono.trim() || null,
      }),
    onSuccess: (updated) => {
      setUser(updated);
      reset({
        nombre: updated.nombre,
        apellido: updated.apellido,
        email: updated.email,
        telefono: updated.telefono ?? "",
      });
      toast({ title: "Perfil actualizado", variant: "default" });
    },
    onError: (err) => {
      toast({ title: parseApiError(err), variant: "destructive" });
    },
  });

  const onSubmit = (data: FormValues) => mutation.mutate(data);

  const {
    register: registerPw,
    handleSubmit: handleSubmitPw,
    reset: resetPw,
    formState: { errors: errorsPw },
  } = useForm<PwFormValues>({ resolver: zodResolver(pwSchema) });

  const pwMutation = useMutation({
    mutationFn: (data: PwFormValues) =>
      api.put("/auth/cambiar-password", {
        password_actual: data.password_actual,
        password_nueva: data.password_nueva,
      }),
    onSuccess: () => {
      resetPw();
      toast({ title: "Contraseña actualizada" });
    },
    onError: (err) => {
      toast({ title: parseApiError(err), variant: "destructive" });
    },
  });

  return (
    <div className="mx-auto max-w-lg py-8 px-4">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-agro-primary/10">
          <User className="h-5 w-5 text-agro-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-agro-text">Mi perfil</h1>
          <p className="text-sm text-agro-muted">Actualizá tus datos personales</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="rounded-xl border border-agro-accent/20 bg-white p-6 shadow-sm space-y-4">
          {/* Nombre */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-agro-muted uppercase tracking-wide">
                Nombre
              </label>
              <input
                {...register("nombre", { required: "Requerido" })}
                className="w-full rounded-lg border border-agro-accent/30 px-3 py-2 text-sm text-agro-text outline-none focus:border-agro-primary focus:ring-1 focus:ring-agro-primary/30"
              />
              {errors.nombre && (
                <p className="text-xs text-red-500">{errors.nombre.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-agro-muted uppercase tracking-wide">
                Apellido
              </label>
              <input
                {...register("apellido", { required: "Requerido" })}
                className="w-full rounded-lg border border-agro-accent/30 px-3 py-2 text-sm text-agro-text outline-none focus:border-agro-primary focus:ring-1 focus:ring-agro-primary/30"
              />
              {errors.apellido && (
                <p className="text-xs text-red-500">{errors.apellido.message}</p>
              )}
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-agro-muted uppercase tracking-wide">
              Email
            </label>
            <input
              type="email"
              {...register("email", {
                required: "Requerido",
                pattern: { value: /\S+@\S+\.\S+/, message: "Email inválido" },
              })}
              className="w-full rounded-lg border border-agro-accent/30 px-3 py-2 text-sm text-agro-text outline-none focus:border-agro-primary focus:ring-1 focus:ring-agro-primary/30"
            />
            {errors.email && (
              <p className="text-xs text-red-500">{errors.email.message}</p>
            )}
          </div>

          {/* Teléfono */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-agro-muted uppercase tracking-wide">
              Teléfono WhatsApp
            </label>
            <input
              type="tel"
              placeholder="+598 9X XXX XXX"
              {...register("telefono")}
              className="w-full rounded-lg border border-agro-accent/30 px-3 py-2 text-sm text-agro-text outline-none focus:border-agro-primary focus:ring-1 focus:ring-agro-primary/30"
            />
            <p className="text-xs text-agro-muted">
              Con código de país, ej: +59899123456. Se usa para recibir mensajes del asistente por WhatsApp.
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={!isDirty || mutation.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-agro-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-agro-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="h-4 w-4" />
          {mutation.isPending ? "Guardando..." : "Guardar cambios"}
        </button>
      </form>

      {/* Cambiar contraseña */}
      <form onSubmit={handleSubmitPw((d) => pwMutation.mutate(d))} className="mt-6 space-y-4">
        <div className="rounded-xl border border-agro-accent/20 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="h-4 w-4 text-agro-muted" />
            <p className="text-xs font-medium text-agro-muted uppercase tracking-wide">Cambiar contraseña</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-agro-muted uppercase tracking-wide">
              Contraseña actual
            </label>
            <input
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              {...registerPw("password_actual")}
              className="w-full rounded-lg border border-agro-accent/30 px-3 py-2 text-sm text-agro-text outline-none focus:border-agro-primary focus:ring-1 focus:ring-agro-primary/30"
            />
            {errorsPw.password_actual && (
              <p className="text-xs text-red-500">{errorsPw.password_actual.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-agro-muted uppercase tracking-wide">
              Nueva contraseña
            </label>
            <input
              type="password"
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
              {...registerPw("password_nueva")}
              className="w-full rounded-lg border border-agro-accent/30 px-3 py-2 text-sm text-agro-text outline-none focus:border-agro-primary focus:ring-1 focus:ring-agro-primary/30"
            />
            {errorsPw.password_nueva && (
              <p className="text-xs text-red-500">{errorsPw.password_nueva.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-agro-muted uppercase tracking-wide">
              Confirmar nueva contraseña
            </label>
            <input
              type="password"
              placeholder="Repetí tu nueva contraseña"
              autoComplete="new-password"
              {...registerPw("confirm")}
              className="w-full rounded-lg border border-agro-accent/30 px-3 py-2 text-sm text-agro-text outline-none focus:border-agro-primary focus:ring-1 focus:ring-agro-primary/30"
            />
            {errorsPw.confirm && (
              <p className="text-xs text-red-500">{errorsPw.confirm.message}</p>
            )}
          </div>
        </div>
        <button
          type="submit"
          disabled={pwMutation.isPending}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-agro-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-agro-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Lock className="h-4 w-4" />
          {pwMutation.isPending ? "Guardando..." : "Cambiar contraseña"}
        </button>
      </form>

      {/* Info de cuenta */}
      {user && (
        <div className="mt-6 rounded-xl border border-agro-accent/20 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-agro-muted uppercase tracking-wide mb-3">Cuenta</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-agro-muted">Plan</span>
              <span className="font-medium text-agro-text capitalize">{user.plan}</span>
            </div>
            {user.trial_fin && user.plan === "trial" && (
              <div className="flex justify-between">
                <span className="text-agro-muted">Vence</span>
                <span className="font-medium text-agro-text">
                  {new Date(user.trial_fin).toLocaleDateString("es-UY")}
                  {user.dias_restantes !== null && (
                    <span className="ml-1 text-agro-muted">({user.dias_restantes}d restantes)</span>
                  )}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-agro-muted">Miembro desde</span>
              <span className="font-medium text-agro-text">
                {new Date(user.created_at).toLocaleDateString("es-UY")}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
