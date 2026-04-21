import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  TreePine, Building2, Leaf, Loader2, ChevronLeft,
  Map, ArrowRightLeft, Bot, Users, Truck, BarChart2, PawPrint,
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useAuthStore } from "@/store/authStore";
import { completeOnboarding, parseApiError } from "@/lib/authApi";
import { toast } from "@/hooks/useToast";
import { cn } from "@/lib/utils";

const DEPARTAMENTOS = [
  "Artigas", "Canelones", "Cerro Largo", "Colonia", "Durazno",
  "Flores", "Florida", "Lavalleja", "Maldonado", "Montevideo",
  "Paysandú", "Río Negro", "Rivera", "Rocha", "Salto",
  "San José", "Soriano", "Tacuarembó", "Treinta y Tres",
];

const MONEDAS = [
  { value: "UYU", label: "$ UYU — Peso uruguayo" },
  { value: "USD", label: "US$ USD — Dólar" },
] as const;

const FEATURES_CAMPO = [
  { icon: Map,           label: "Mapa de potreros",           desc: "Dibujá y gestioná tus potreros en el mapa" },
  { icon: PawPrint,      label: "Registro de animales",        desc: "Controlá stock ganadero por potrero" },
  { icon: ArrowRightLeft,label: "Movimientos de ganado",       desc: "Programá y ejecutá traslados entre potreros" },
  { icon: Bot,           label: "Asistente IA agropecuario",   desc: "Consultá sobre tu campo en lenguaje natural" },
];

const FEATURES_NEGOCIO = [
  { icon: Users,        label: "Clientes y cuentas por cobrar", desc: "Administrá tus clientes y deudas activas" },
  { icon: Truck,        label: "Proveedores y cuentas por pagar", desc: "Seguí tus proveedores y pagos pendientes" },
  { icon: BarChart2,    label: "Dashboard financiero",          desc: "Resumen de ingresos, gastos y balance" },
  { icon: Bot,          label: "Asistente IA comercial",        desc: "Consultá sobre tu negocio en lenguaje natural" },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { setUser, user } = useAuthStore();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [esProductor, setEsProductor] = useState(user?.es_productor ?? true);
  const [esNegocio, setEsNegocio] = useState(user?.es_negocio ?? true);
  const [nombreCampo, setNombreCampo] = useState(user?.nombre_campo ?? "");
  const [departamento, setDepartamento] = useState(user?.departamento ?? "");
  const [moneda, setMoneda] = useState<"UYU" | "USD">(
    (user?.moneda as "UYU" | "USD") ?? "UYU"
  );

  const ningunoSeleccionado = !esProductor && !esNegocio;

  const mutation = useMutation({
    mutationFn: () =>
      completeOnboarding({
        es_productor: esProductor,
        es_negocio: esNegocio,
        nombre_campo: nombreCampo || null,
        departamento: departamento || null,
        moneda,
      }),
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
      navigate("/dashboard", { replace: true });
    },
    onError: (err) => {
      toast({ title: "Error", description: parseApiError(err), variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 px-4 py-8">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/20">
          <Leaf className="h-5 w-5 text-brand-400" />
        </div>
        <span className="text-xl font-bold text-white">
          360 <span className="text-brand-400">Finance</span>
        </span>
      </div>

      <div className="w-full max-w-lg">
        {/* Indicador de paso */}
        <p className="text-center text-sm text-slate-400 mb-2">Paso {step} de 3</p>
        <div className="flex gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                s <= step ? "bg-brand-500" : "bg-slate-700"
              )}
            />
          ))}
        </div>

        {/* ── Paso 1: elegir perfiles ─────────────────────────────────────── */}
        {step === 1 && (
          <>
            <h1 className="text-2xl font-bold text-white text-center mb-2">
              ¿Cómo usás 360 Finance?
            </h1>
            <p className="text-slate-400 text-center mb-8">
              Podés seleccionar ambas opciones a la vez
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              {/* Campo / Estancia */}
              <button
                type="button"
                onClick={() => setEsProductor((v) => !v)}
                className={cn(
                  "flex flex-col items-center gap-3 rounded-xl border p-6 text-center transition-all",
                  esProductor
                    ? "border-brand-500 bg-brand-500/10 text-white"
                    : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:bg-slate-800"
                )}
              >
                <div className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-xl",
                  esProductor ? "bg-brand-500/20" : "bg-slate-800"
                )}>
                  <TreePine className={cn("h-7 w-7", esProductor ? "text-brand-400" : "text-slate-400")} />
                </div>
                <div>
                  <div className="flex items-center justify-center gap-2">
                    <div className={cn(
                      "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0",
                      esProductor ? "bg-brand-500 border-brand-500" : "border-slate-500"
                    )}>
                      {esProductor && <span className="text-white text-[10px] font-bold">✓</span>}
                    </div>
                    <p className="font-semibold">Campo / Estancia</p>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Gestión ganadera, agrícola y de potreros</p>
                </div>
              </button>

              {/* Negocio Rural */}
              <button
                type="button"
                onClick={() => setEsNegocio((v) => !v)}
                className={cn(
                  "flex flex-col items-center gap-3 rounded-xl border p-6 text-center transition-all",
                  esNegocio
                    ? "border-brand-500 bg-brand-500/10 text-white"
                    : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500 hover:bg-slate-800"
                )}
              >
                <div className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-xl",
                  esNegocio ? "bg-brand-500/20" : "bg-slate-800"
                )}>
                  <Building2 className={cn("h-7 w-7", esNegocio ? "text-brand-400" : "text-slate-400")} />
                </div>
                <div>
                  <div className="flex items-center justify-center gap-2">
                    <div className={cn(
                      "w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0",
                      esNegocio ? "bg-brand-500 border-brand-500" : "border-slate-500"
                    )}>
                      {esNegocio && <span className="text-white text-[10px] font-bold">✓</span>}
                    </div>
                    <p className="font-semibold">Negocio Rural</p>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Veterinaria, acopio, proveedor agropecuario</p>
                </div>
              </button>
            </div>

            {ningunoSeleccionado && (
              <p className="text-center text-xs text-red-400 mb-4">
                Seleccioná al menos una opción para continuar
              </p>
            )}

            <Button
              type="button"
              className="w-full"
              disabled={ningunoSeleccionado}
              onClick={() => setStep(2)}
            >
              Continuar
            </Button>
          </>
        )}

        {/* ── Paso 2: pantalla informativa ────────────────────────────────── */}
        {step === 2 && (
          <>
            <h1 className="text-2xl font-bold text-white text-center mb-2">
              ¿Qué tenés disponible en 360 Finance?
            </h1>
            <p className="text-slate-400 text-center mb-8">
              Según lo que seleccionaste, estas son tus herramientas
            </p>

            <div className={cn("grid gap-4 mb-8", esProductor && esNegocio ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1")}>
              {/* Card campo */}
              {esProductor && (
                <div className="rounded-xl border border-agro-accent/30 bg-agro-primary/5 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-agro-primary/15">
                      <TreePine className="h-4 w-4 text-agro-primary" />
                    </div>
                    <p className="font-semibold text-white text-sm">Campo / Estancia</p>
                  </div>
                  <ul className="space-y-3">
                    {FEATURES_CAMPO.map(({ icon: Icon, label, desc }) => (
                      <li key={label} className="flex items-start gap-3">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-agro-primary/10 mt-0.5">
                          <Icon className="h-3.5 w-3.5 text-agro-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white leading-tight">{label}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Card negocio */}
              {esNegocio && (
                <div className="rounded-xl border border-agro-accent/30 bg-agro-primary/5 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-agro-primary/15">
                      <Building2 className="h-4 w-4 text-agro-primary" />
                    </div>
                    <p className="font-semibold text-white text-sm">Negocio Rural</p>
                  </div>
                  <ul className="space-y-3">
                    {FEATURES_NEGOCIO.map(({ icon: Icon, label, desc }) => (
                      <li key={label} className="flex items-start gap-3">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-agro-primary/10 mt-0.5">
                          <Icon className="h-3.5 w-3.5 text-agro-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white leading-tight">{label}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                className="flex items-center gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                Atrás
              </Button>
              <Button
                type="button"
                className="flex-1 bg-agro-primary hover:bg-agro-primary/90"
                onClick={() => setStep(3)}
              >
                Entendido, continuar
              </Button>
            </div>
          </>
        )}

        {/* ── Paso 3: datos personales ─────────────────────────────────────── */}
        {step === 3 && (
          <>
            <h1 className="text-2xl font-bold text-white text-center mb-2">
              Datos básicos
            </h1>
            <p className="text-slate-400 text-center mb-8">
              Podés completarlo después desde tu perfil
            </p>

            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="nombre_campo">
                  {esProductor && !esNegocio ? "Nombre del campo" : esNegocio && !esProductor ? "Nombre del negocio" : "Nombre del campo / negocio"}
                  <span className="text-slate-500 text-xs ml-1">(opcional)</span>
                </Label>
                <Input
                  id="nombre_campo"
                  placeholder={esProductor && !esNegocio ? "Ej: La Palmera" : "Ej: Veterinaria del Sur"}
                  value={nombreCampo}
                  onChange={(e) => setNombreCampo(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="departamento">Departamento</Label>
                <Select
                  id="departamento"
                  value={departamento}
                  onChange={(e) => setDepartamento(e.target.value)}
                >
                  <option value="">Seleccioná un departamento</option>
                  {DEPARTAMENTOS.map((dep) => (
                    <option key={dep} value={dep}>{dep}</option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Moneda</Label>
                <div className="grid grid-cols-2 gap-3">
                  {MONEDAS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMoneda(value)}
                      className={cn(
                        "rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
                        moneda === value
                          ? "border-brand-500 bg-brand-500/10 text-brand-400"
                          : "border-slate-700 text-slate-400 hover:border-slate-500"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(2)}
                  className="flex items-center gap-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Atrás
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate()}
                >
                  {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Comenzar
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
