import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-agro-bg text-agro-text overflow-hidden">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header mobile con botón hamburguesa */}
        <header className="flex items-center gap-4 border-b border-agro-accent/20 bg-white px-4 py-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-agro-muted hover:text-agro-primary"
          >
            <Menu className="h-6 w-6" />
          </button>
          <span className="text-base font-bold text-agro-text">
            360 <span className="text-agro-primary">Finance</span>
          </span>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
