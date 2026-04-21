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
  PawPrint,
  ArrowRightLeft,
  BarChart2,
  HelpCircle,
  Package,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";

const BASE_NAV = [
  { to: "/dashboard",    label: "Dashboard",            icon: LayoutDashboard, negocioOnly: false, ssoHidden: false },
  { to: "/mapa",         label: "Mapa",                 icon: Map,             negocioOnly: false, ssoHidden: false },
  { to: "/registros",    label: "Registros",             icon: ClipboardList,   negocioOnly: false, ssoHidden: false },
  { to: "/clientes",     label: "Clientes",              icon: Users,           negocioOnly: false, ssoHidden: false },
  { to: "/proveedores",  label: "Proveedores",           icon: Truck,           negocioOnly: false, ssoHidden: false },
  { to: "/asistente",    label: "Asistente IA",          icon: Bot,             negocioOnly: false, ssoHidden: false },
  { to: "/productos",    label: "Catálogo",              icon: Package,         negocioOnly: true,  ssoHidden: false },
  { to: "/facturacion",  label: "Facturación",           icon: CreditCard,      negocioOnly: false, ssoHidden: true  },
  { to: "/acerca",       label: "Guía / ¿Qué es esto?", icon: HelpCircle,      negocioOnly: false, ssoHidden: false },
];

const FEATURES_PRODUCTOR = [
  { icon: Map,            label: "Mapa de potreros" },
  { icon: PawPrint,       label: "Registro de animales" },
  { icon: ArrowRightLeft, label: "Movimientos de ganado" },
];

const FEATURES_NEGOCIO = [
  { icon: Users,    label: "Clientes" },
  { icon: Truck,    label: "Proveedores" },
  { icon: BarChart2,label: "Dashboard de negocio" },
];

const FEATURES_SIEMPRE = [
  { icon: ClipboardList, label: "Registros financieros" },
  { icon: Bot,           label: "Asistente IA" },
];

export function Sidebar() {
  const { user, logout } = useAuthStore();

  const features = [
    ...(user?.es_productor ? FEATURES_PRODUCTOR : []),
    ...(user?.es_negocio   ? FEATURES_NEGOCIO   : []),
    ...FEATURES_SIEMPRE,
  ];

  const navItems = BASE_NAV.filter(
    (item) =>
      (!item.negocioOnly || user?.es_negocio) &&
      !(item.ssoHidden && user?.plan === "sso"),
  );

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-agro-accent/20 bg-white">
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

      {/* Features card */}
      <div className="mx-3 mb-3 border-t border-agro-accent/20 pt-3">
        <p className="px-1 mb-2 text-[10px] font-semibold text-agro-muted uppercase tracking-wider">
          ¿Qué es 360 Finance?
        </p>
        <ul className="space-y-1">
          {features.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-2 px-1 py-0.5">
              <Icon className="h-3 w-3 shrink-0 text-agro-primary" />
              <span className="text-xs text-agro-muted">{label}</span>
            </li>
          ))}
        </ul>
      </div>

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
  );
}
