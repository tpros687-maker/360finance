import { type ElementType } from "react";
import {
  Map, PawPrint, ArrowRightLeft, Bot,
  Users, Truck, BarChart2, Package,
  ClipboardList, FileDown, Paperclip,
  Leaf,
} from "lucide-react";
import { useAuthStore } from "@/store/authStore";

interface CardProps {
  icon: ElementType;
  title: string;
  description: string;
}

function FeatureCard({ icon: Icon, title, description }: CardProps) {
  return (
    <div className="flex gap-4 rounded-xl border border-agro-accent/20 bg-white p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-agro-primary/10">
        <Icon className="h-5 w-5 text-agro-primary" />
      </div>
      <div>
        <p className="text-sm font-semibold text-agro-text">{title}</p>
        <p className="mt-0.5 text-xs text-agro-muted leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

const CARDS_PRODUCTOR: CardProps[] = [
  {
    icon: Map,
    title: "Mapa de potreros",
    description: "Dibujá y editá tus potreros directamente en el mapa. Controlá superficie, tipo de uso y estado del pasto.",
  },
  {
    icon: PawPrint,
    title: "Registro de animales",
    description: "Llevá el conteo de animales por potrero con especie y cantidad. Actualizá el stock al instante.",
  },
  {
    icon: ArrowRightLeft,
    title: "Movimientos de ganado",
    description: "Programá traslados entre potreros y ejecutalos cuando corresponda. Quedá con el historial completo.",
  },
  {
    icon: Bot,
    title: "Asistente IA agropecuario",
    description: "Consultá el estado de tu campo en lenguaje natural. El asistente conoce tus potreros, animales y registros.",
  },
];

const CARDS_NEGOCIO: CardProps[] = [
  {
    icon: Users,
    title: "Clientes",
    description: "Administrá tu cartera de clientes y sus cuentas por cobrar. Seguí el estado de deuda de cada uno.",
  },
  {
    icon: Truck,
    title: "Proveedores",
    description: "Registrá tus proveedores y gestioná las cuentas por pagar y pagos pendientes en un solo lugar.",
  },
  {
    icon: BarChart2,
    title: "Dashboard financiero",
    description: "Resumen ejecutivo de ingresos, gastos y balance. Filtrá por período y categoría para analizar tu negocio.",
  },
  {
    icon: Bot,
    title: "Asistente IA comercial",
    description: "Consultá el estado de tu negocio, deudas activas y movimientos recientes en lenguaje natural.",
  },
  {
    icon: Package,
    title: "Catálogo de productos y servicios",
    description: "Registrá los productos y servicios que ofrecés con precios de referencia en UYU o USD.",
  },
];

const CARDS_SIEMPRE: CardProps[] = [
  {
    icon: ClipboardList,
    title: "Registros de gastos e ingresos",
    description: "Registrá cualquier movimiento financiero con categoría, monto y fecha. Compatible con múltiples monedas.",
  },
  {
    icon: Paperclip,
    title: "Comprobantes adjuntos",
    description: "Adjuntá fotos o PDFs de facturas y recibos directamente a cada registro financiero.",
  },
  {
    icon: FileDown,
    title: "Exportación",
    description: "Exportá tus registros para análisis externo o para compartir con tu contador.",
  },
];

export default function AcercaDePage() {
  const { user } = useAuthStore();

  return (
    <div className="page-fade flex h-full flex-col bg-agro-bg overflow-y-auto">
      {/* Header */}
      <div className="bg-white border-b border-agro-accent/20 px-6 py-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-agro-primary/10">
              <Leaf className="h-5 w-5 text-agro-primary" />
            </div>
            <h1 className="text-2xl font-bold text-agro-text">¿Qué es 360 Finance?</h1>
          </div>
          <p className="text-agro-muted text-sm leading-relaxed max-w-xl">
            360 Finance es una herramienta de gestión financiera y operativa pensada para el mundo agropecuario.
            Combiná el control de tu campo con la administración de tu negocio rural en una sola plataforma.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-3xl px-6 py-8 space-y-10">

        {/* Sección productores */}
        {user?.es_productor && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <Map className="h-4 w-4 text-agro-primary" />
              <h2 className="text-base font-semibold text-agro-text">Para productores</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CARDS_PRODUCTOR.map((card) => (
                <FeatureCard key={card.title} {...card} />
              ))}
            </div>
          </section>
        )}

        {/* Sección negocios */}
        {user?.es_negocio && (
          <section>
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 className="h-4 w-4 text-agro-primary" />
              <h2 className="text-base font-semibold text-agro-text">Para negocios rurales</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CARDS_NEGOCIO.map((card) => (
                <FeatureCard key={card.title} {...card} />
              ))}
            </div>
          </section>
        )}

        {/* Siempre disponible */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList className="h-4 w-4 text-agro-primary" />
            <h2 className="text-base font-semibold text-agro-text">Siempre disponible</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CARDS_SIEMPRE.map((card) => (
              <FeatureCard key={card.title} {...card} />
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
