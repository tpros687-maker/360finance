import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { Toaster } from "@/components/Toaster";
import { PageLoader } from "@/components/PageLoader";
import { useAuthStore } from "@/store/authStore";

function OptionalLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (isAuthenticated) return <AppLayout />;
  return <Outlet />;
}

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/RegisterPage"));
const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const RegistrosPage = lazy(() => import("@/pages/RegistrosPage"));
const MapaPage = lazy(() => import("@/pages/MapaPage"));
const AsistentePage = lazy(() => import("@/pages/AsistentePage"));
const SSOPage = lazy(() => import("@/pages/SSOPage"));
const OnboardingPage = lazy(() => import("@/pages/OnboardingPage"));
const ClientesPage = lazy(() => import("@/pages/ClientesPage"));
const ProveedoresPage = lazy(() => import("@/pages/ProveedoresPage"));
const AcercaDePage = lazy(() => import("@/pages/AcercaDePage"));
const ProductosPage = lazy(() => import("@/pages/ProductosPage"));
const PagoPage = lazy(() => import("@/pages/PagoPage"));
const FacturacionPage = lazy(() => import("@/pages/FacturacionPage"));
const RentabilidadPage = lazy(() => import("@/pages/RentabilidadPage"));
const FlujoCajaPage = lazy(() => import("@/pages/FlujoCajaPage"));
const AlertasPage = lazy(() => import("@/pages/AlertasPage"));
const RecomendacionesPage = lazy(() => import("@/pages/RecomendacionesPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5,
    },
  },
});

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/sso" element={<SSOPage />} />

        {/* Semi-public: layout when authenticated, bare page otherwise */}
        <Route element={<OptionalLayout />}>
          <Route path="/pago" element={<PagoPage />} />
        </Route>

        {/* Protected */}
        <Route element={<ProtectedRoute />}>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/mapa" element={<MapaPage />} />
            <Route path="/registros" element={<RegistrosPage />} />
            <Route path="/clientes" element={<ClientesPage />} />
            <Route path="/proveedores" element={<ProveedoresPage />} />
            <Route path="/asistente" element={<AsistentePage />} />
            <Route path="/acerca" element={<AcercaDePage />} />
            <Route path="/productos" element={<ProductosPage />} />
            <Route path="/facturacion" element={<FacturacionPage />} />
            <Route path="/rentabilidad" element={<RentabilidadPage />} />
            <Route path="/flujo-caja" element={<FlujoCajaPage />} />
            <Route path="/alertas" element={<AlertasPage />} />
            <Route path="/recomendaciones" element={<RecomendacionesPage />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
