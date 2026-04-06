import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Map,
  ClipboardList,
  Bot,
  LogOut,
  Leaf,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/mapa", label: "Mapa", icon: Map },
  { to: "/registros", label: "Registros", icon: ClipboardList },
  { to: "/asistente", label: "Asistente IA", icon: Bot },
] as const;

export function Sidebar() {
  const { user, logout } = useAuthStore();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-700/60 bg-slate-900">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-700/60">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500/20">
          <Leaf className="h-5 w-5 text-brand-400" />
        </div>
        <span className="text-lg font-bold text-white tracking-tight">
          360 <span className="text-brand-400">Finance</span>
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
                  ? "bg-brand-500/15 text-brand-400 border border-brand-500/30"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-slate-700/60 px-4 py-4">
        {user && (
          <div className="mb-3 px-1">
            <p className="text-sm font-medium text-slate-200 truncate">
              {user.nombre} {user.apellido}
            </p>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
          </div>
        )}
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:bg-red-900/30 hover:text-red-400 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
