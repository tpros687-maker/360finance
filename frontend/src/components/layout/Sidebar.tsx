import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Map,
  ClipboardList,
  Bot,
  LogOut,
  Leaf,
  HelpCircle,
  Package,
  CreditCard,
  TrendingUp,
  ArrowLeftRight,
  Bell,
  Brain,
  Activity,
  X,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { getAlertas } from "@/lib/dashboardApi";
import type { AlertaItem } from "@/types/dashboard";

// ── LocalStorage helpers ──────────────────────────────────────────────────────

const LS_KEY = "alertas_descartadas";

function loadDescartadas(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]"); } catch { return []; }
}
function saveDescartadas(ids: string[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(ids));
}

// ── Alert level config ────────────────────────────────────────────────────────

const NIVEL_CONFIG = {
  danger:  { border: "border-red-200",   bg: "bg-red-50",   titleColor: "text-red-700",   Icon: AlertCircle,   iconClass: "text-red-500"   },
  warning: { border: "border-amber-200", bg: "bg-amber-50", titleColor: "text-amber-700", Icon: AlertTriangle, iconClass: "text-amber-500" },
  info:    { border: "border-blue-200",  bg: "bg-blue-50",  titleColor: "text-blue-700",  Icon: Info,          iconClass: "text-blue-500"  },
} as const;

// ── Nav items ─────────────────────────────────────────────────────────────────

const BASE_NAV = [
  { to: "/dashboard",       label: "Dashboard",            icon: LayoutDashboard, negocioOnly: false, ssoHidden: false },
  { to: "/mapa",            label: "Mapa",                 icon: Map,             negocioOnly: false, ssoHidden: false },
  { to: "/registros",       label: "Registros",            icon: ClipboardList,   negocioOnly: false, ssoHidden: false },
  { to: "/productividad",   label: "Productividad",        icon: TrendingUp,      negocioOnly: false, ssoHidden: false },
  { to: "/flujo-caja",      label: "Flujo de Caja",        icon: ArrowLeftRight,  negocioOnly: false, ssoHidden: false },
  { to: "/recomendaciones", label: "Decisiones IA",        icon: Brain,           negocioOnly: false, ssoHidden: false },
  { to: "/score-salud",     label: "Score de Salud",       icon: Activity,        negocioOnly: false, ssoHidden: false },
  { to: "/asistente",       label: "Asistente IA",         icon: Bot,             negocioOnly: false, ssoHidden: false },
  { to: "/productos",       label: "Catálogo",             icon: Package,         negocioOnly: true,  ssoHidden: false },
  { to: "/facturacion",     label: "Facturación",          icon: CreditCard,      negocioOnly: false, ssoHidden: true  },
  { to: "/acerca",          label: "Guía / ¿Qué es esto?", icon: HelpCircle,     negocioOnly: false, ssoHidden: false },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuthStore();
  const [panelOpen, setPanelOpen] = useState(false);
  const [descartadas, setDescartadas] = useState<string[]>(loadDescartadas);

  const { data: alertas = [] } = useQuery<AlertaItem[]>({
    queryKey: ["alertas"],
    queryFn: getAlertas,
    staleTime: 1000 * 60 * 2,
    enabled: !!user,
  });

  const visibles = alertas.filter((a) => !descartadas.includes(a.id));
  const dangerCount = visibles.filter((a) => a.nivel === "danger").length;
  const hayDescartadas = descartadas.some((id) => alertas.some((a) => a.id === id));

  const dismiss = (id: string) => {
    const updated = [...descartadas, id];
    setDescartadas(updated);
    saveDescartadas(updated);
  };

  const restaurar = () => {
    setDescartadas([]);
    saveDescartadas([]);
  };

  const navItems = BASE_NAV.filter(
    (item) => (!item.negocioOnly || user?.es_negocio) && !(item.ssoHidden && user?.plan === "sso"),
  );
  const mainNav = navItems.filter((item) => item.to !== "/acerca");
  const acercaItem = navItems.find((item) => item.to === "/acerca");

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
      isActive ? "bg-agro-primary text-white" : "text-agro-muted hover:bg-agro-accent/10 hover:text-agro-primary"
    );

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={onClose} />
      )}

      {/* Alertas panel backdrop */}
      {panelOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setPanelOpen(false)} />
      )}

      {/* Alertas panel */}
      {panelOpen && (
        <div className="fixed left-64 top-0 h-screen w-80 z-50 flex flex-col bg-white border-l border-agro-accent/20 shadow-2xl">
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-agro-accent/20 shrink-0">
            <div>
              <h2 className="text-sm font-bold text-agro-text">Alertas inteligentes</h2>
              <p className="text-xs text-agro-muted mt-0.5">
                {visibles.length === 0
                  ? "Sin alertas activas."
                  : `${visibles.length} alerta${visibles.length > 1 ? "s" : ""} activa${visibles.length > 1 ? "s" : ""}`}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {hayDescartadas && (
                <button
                  onClick={restaurar}
                  title="Restaurar todas"
                  className="p-1.5 rounded-md text-agro-muted hover:text-agro-text hover:bg-agro-bg transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setPanelOpen(false)}
                className="p-1.5 rounded-md text-agro-muted hover:text-agro-text hover:bg-agro-bg transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Panel body */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {visibles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
                <CheckCircle className="h-10 w-10 text-emerald-400" />
                <p className="text-sm font-semibold text-agro-text">Todo en orden</p>
                <p className="text-xs text-agro-muted">Sin alertas activas por ahora.</p>
              </div>
            ) : (
              visibles.map((a) => {
                const { border, bg, titleColor, Icon, iconClass } = NIVEL_CONFIG[a.nivel];
                return (
                  <div key={a.id} className={`flex items-start gap-2.5 rounded-lg border p-3 ${border} ${bg}`}>
                    <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${iconClass}`} />
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-semibold leading-snug ${titleColor}`}>{a.titulo}</p>
                      <p className="text-xs text-agro-muted mt-0.5 leading-relaxed">{a.detalle}</p>
                    </div>
                    <button
                      onClick={() => dismiss(a.id)}
                      className="shrink-0 p-0.5 rounded text-agro-muted hover:text-agro-text hover:bg-black/5 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-30 flex h-screen w-64 flex-col border-r border-agro-accent/20 bg-white transition-transform duration-300 lg:static lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Mobile close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 lg:hidden text-agro-muted hover:text-agro-text"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-agro-accent/20">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-agro-primary/10">
            <Leaf className="h-5 w-5 text-agro-primary" />
          </div>
          <span className="text-lg font-bold text-agro-text tracking-tight">
            360 <span className="text-agro-primary">Finance</span>
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {mainNav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={onClose} className={navLinkClass}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{label}</span>
            </NavLink>
          ))}

          {/* Bell / Alertas button */}
          <button
            onClick={() => setPanelOpen((v) => !v)}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              panelOpen
                ? "bg-agro-primary text-white"
                : "text-agro-muted hover:bg-agro-accent/10 hover:text-agro-primary"
            )}
          >
            <Bell className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">Alertas</span>
            {dangerCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {dangerCount}
              </span>
            )}
          </button>

          {/* Acerca de — always last */}
          {acercaItem && (
            <NavLink to={acercaItem.to} onClick={onClose} className={navLinkClass}>
              <acercaItem.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{acercaItem.label}</span>
            </NavLink>
          )}
        </nav>

        {/* User footer */}
        <div className="border-t border-agro-accent/20 px-4 py-4">
          {user && (
            <div className="mb-3 px-1">
              <p className="text-sm font-medium text-agro-text truncate">
                {user.nombre} {user.apellido}
              </p>
              <p className="text-xs text-agro-muted truncate">{user.email}</p>
            </div>
          )}
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-agro-muted hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
