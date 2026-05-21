import { Link } from "react-router-dom";
import { Leaf, Map, ClipboardList, TrendingUp, Bot, ArrowRight, BarChart2 } from "lucide-react";

const FEATURES = [
  {
    icon: Map,
    title: "Mapa de potreros",
    desc: "Dibujá y gestioná tus potreros directamente en el mapa. Controlá superficie, uso y stock ganadero por zona.",
  },
  {
    icon: ClipboardList,
    title: "Registros con IA",
    desc: "Cargá gastos e ingresos en segundos. La IA sugiere categorías e imputa automáticamente cada movimiento.",
  },
  {
    icon: TrendingUp,
    title: "Rentabilidad por hectárea",
    desc: "Conocé el margen neto de cada potrero, con desglose de costos directos, prorrateados y estructurales.",
  },
  {
    icon: Bot,
    title: "Asistente inteligente",
    desc: "Consultá el estado de tu campo o negocio en lenguaje natural. El asistente conoce tus datos en tiempo real.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-agro-accent/20 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-agro-primary/10">
              <Leaf className="h-4.5 w-4.5 text-agro-primary" />
            </div>
            <span className="text-base font-bold text-agro-text tracking-tight">
              360 Agro <span className="text-agro-primary">Finance</span>
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm font-medium text-agro-muted hover:text-agro-primary transition-colors"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center gap-1.5 rounded-lg bg-agro-primary px-4 py-2 text-sm font-semibold text-white hover:bg-agro-primary/90 transition-colors"
            >
              Registrarse
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="bg-agro-bg border-b border-agro-accent/20">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-agro-primary/10 px-3 py-1 text-xs font-semibold text-agro-primary mb-6">
            <BarChart2 className="h-3.5 w-3.5" />
            Gestión agropecuaria inteligente
          </span>

          <h1 className="text-4xl sm:text-5xl font-bold text-agro-text leading-tight mb-5">
            Gestioná tu campo<br className="hidden sm:block" /> con{" "}
            <span className="text-agro-primary">inteligencia</span>
          </h1>

          <p className="text-agro-muted text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
            Registros financieros, mapa de potreros, rentabilidad por hectárea y asistente IA,
            todo en una sola plataforma pensada para el productor agropecuario uruguayo.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-agro-primary px-6 py-3 text-sm font-semibold text-white hover:bg-agro-primary/90 transition-colors shadow-sm"
            >
              Empezar gratis
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-xl border border-agro-accent/40 bg-white px-6 py-3 text-sm font-semibold text-agro-text hover:bg-agro-bg transition-colors"
            >
              Ya tengo cuenta
            </Link>
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────────────────────── */}
      <section className="flex-1 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-agro-text mb-2">Todo lo que necesitás, en un solo lugar</h2>
            <p className="text-agro-muted text-sm">Herramientas diseñadas para el campo y el negocio rural</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="flex flex-col gap-4 rounded-2xl border border-agro-accent/20 bg-agro-bg p-6 hover:border-agro-primary/30 hover:shadow-sm transition-all"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-agro-primary/10">
                  <Icon className="h-5 w-5 text-agro-primary" />
                </div>
                <div>
                  <p className="font-semibold text-agro-text text-sm mb-1.5">{title}</p>
                  <p className="text-xs text-agro-muted leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-agro-accent/20 bg-agro-bg">
        <div className="mx-auto max-w-6xl px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Leaf className="h-4 w-4 text-agro-primary" />
            <span className="text-sm font-semibold text-agro-text">360 Agro Finance</span>
          </div>
          <p className="text-xs text-agro-muted">© 2026 360 Agro Finance. Todos los derechos reservados.</p>
        </div>
      </footer>

    </div>
  );
}
