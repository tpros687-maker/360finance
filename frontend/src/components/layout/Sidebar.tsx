import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Map,
  ClipboardList,
  Bot,
  LogOut,
  Leaf,
  Users,
  Truck,
  HelpCircle,
  Package,
  CreditCard,
  TrendingUp,
  ArrowLeftRight,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";

const BASE_NAV = [
  { to: "/dashboard",    label: "Dashboard",            icon: LayoutDashboard, negocioOnly: false, ssoHidden: false },
  { to: "/mapa",         label: "Mapa",                 icon: Map,             negocioOnly: false, ssoHidden: false },
  { to: "/registros",    label: "Registros",             icon: ClipboardList,   negocioOnly: false, ssoHidden: false },
  { to: "/rentabilidad", label: "Rentabilidad",          icon: TrendingUp,      negocioOnly: false, ssoHidden: false },
  { to: "/flujo-caja",  label: "Flujo de Caja",         icon: ArrowLeftRight,  negocioOnly: false, ssoHidden: false },
  { to: "/clientes",     label: "Clientes",              icon: Users,           negocioOnly: false, ssoHidden: false },
  { to: "/proveedores",  label: "Proveedores",           icon: Truck,           negocioOnly: false, ssoHidden: false },
  { to: "/asistente",    label: "Asistente IA",          icon: Bot,             negocioOnly: false, ssoHidden: false },
  { to: "/productos",    label: "Catálogo",              icon: Package,         negocioOnly: true,  ssoHidden: false },
  { to: "/facturacion",  label: "Facturación",           icon: CreditCard,      negocioOnly: false, ssoHidden: true  },
  { to: "/acerca",       label: "Guía / ¿Qué es esto?", icon: HelpCircle,      negocioOnly: false, ssoHidden: false },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout } = useAuthStore();

  const navItems = BASE_NAV.filter(
    (item) =>
      (!item.negocioOnly || user?.es_negocio) &&
      !(item.ssoHidden && user?.plan === "sso"),
  );

  return (
    <>
      {/* Overlay mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={cn(
        "fixed inset-y-0 left-0 z-30 flex h-screen w-64 flex-col border-r border-agro-accent/20 bg-white transition-transform duration-300 lg:static lg:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Botón cerrar en mobile */}
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
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-agro-primary text-white"
                    : "text-agro-muted hover:bg-agro-accent/10 hover:text-agro-primary"
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </NavLink>
          ))}
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
