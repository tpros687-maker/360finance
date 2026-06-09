# 360 Agro Finance — Visión del producto

> Para el asistente que retoma: este archivo explica **QUÉ es la app y QUÉ hace**.
> Para el detalle técnico/cambios recientes ver `CONTEXTO_DESARROLLO.md`; para el traspaso de
> la última sesión ver `RESUMEN_SESION_PAGOS.md`; para ideas no desarrolladas, `IDEAS_FUTURAS.md`.

## Qué es

**360 Agro Finance** es una app web + mobile de **gestión financiera y productiva para el
campo**, pensada para el Río de la Plata (Uruguay primero; moneda principal **UYU**, también
maneja **USD** y **ARS**). Apunta a **productores ganaderos** y a la administración del
negocio agropecuario. Es parte de una suite "360" (dominio `360rural.com`) e integra **SSO con
360agro** (login con token compartido, `SSO_SECRET`).

Modelo de negocio: **prueba gratis 30 días** y luego plan pago (UYU $280 / 30 días) vía
**MercadoPago**, con renovación automática (suscripción) o manual. Campo `plan` del usuario:
`trial` / `activo` / `vencido` / `sso`.

Dos perfiles de uso (flags en el usuario): **es_productor** (habilita lo de campo: mapa,
potreros, ganado) y **es_negocio** (lo financiero). El campo `perfil` distingue el tipo.

## Módulos / funcionalidades

**Campo y ganadería**
- **Mapa de potreros** (`/mapa`, Mapbox GL + PostGIS): dibujar potreros como polígonos, ver
  hectáreas, tipo, estado del pasto, CONEAT, cultivo, etc.
- **Franjas / pastoreo rotativo**: un potrero puede dividirse en franjas (`FranjaEstado`):
  cuál está en uso, cuáles en descanso, días de descanso objetivo. El mapa pinta las franjas
  (strips recortados al polígono con `@turf/intersect` — OJO: turf v7 requiere `FeatureCollection`).
- **Puntos de interés**: bebedero, casa, sombra, comedero (con su geometría).
- **Ganado**: animales por potrero (`especie`, `cantidad`, `raza`). Especies múltiples.
- **Movimientos de ganado** (`MovimientoGanado`): entre potreros y entre franjas. Estados
  programado/ejecutado. Lógica compartida `_transferir_animales()` en `routers/movimientos.py`.

**Finanzas**
- **Registros** (`/registros`): gastos e ingresos por categoría, con comprobantes adjuntos.
- **Flujo de caja** (`/flujo-caja`): incluye **clientes + cuentas por cobrar** y
  **proveedores + cuentas por pagar** (las rutas `/clientes` y `/proveedores` redirigen acá).
- **Productos/servicios** (`/productos`) y **categorías**.
- **Resúmenes mensuales** (`/resumenes`): cierre financiero del mes (`ResumenMensual`), también
  se envía por WhatsApp.

**Inteligencia / análisis**
- **Rentabilidad por potrero** (`/rentabilidad` backend): calcula márgenes, los compara contra
  **referencias productivas** (benchmark de margen neto/ha en USD bajo/medio/alto por país,
  zona y actividad), proyección anual y **export a PDF**. Usa `CotizacionDiaria` (USD/UYU/ARS,
  actualizada a diario) y cachea resultados (`RentabilidadCache`).
- **Score de salud** (`/score-salud`): puntaje del estado del campo/finanzas.
- **Recomendaciones** (`/recomendaciones`): sugerencias con IA.
- **Asistente IA** (`/asistente`): chat agropecuario (usa **Groq**).

**Productividad**
- **Cuaderno de campo** (`/cuaderno`): notas y tareas con fecha planificada y recordatorio.
- **Dashboard** (`/dashboard`): vista general / alertas.
- **Perfil**, **Onboarding**, **Acerca de**, **Facturación/Pago** (`/pago`, `/planes`).

**Bot de WhatsApp** (vía **Meta Cloud API** + Groq, `routers/whatsapp.py`)
State machine en memoria. Menú: 1=nota, 2=tarea, 3=tarea hecha, 4=gasto, 5=ingreso, 6=tareas,
7=balance, 8=resumen, 9=mover ganado (entre franjas o entre potreros, acepta varias especies
en un mensaje). Registra gastos/notas/tareas, mueve ganado, consulta balance, manda resúmenes
y acepta fotos de comprobantes. Resiliente: siempre responde aunque falle algo interno.

## Modelo de datos (tablas principales)
`users`, `potreros`, `franjas_estado`, `animales`, `puntos_interes`, `movimientos_ganado`,
`aplicaciones_potrero`, `registros`, `categorias`, `clientes`, `cuentas_cobrar`, `proveedores`,
`cuentas_pagar`, `productos`, `notas_cuaderno`, `tareas_cuaderno`, `resumenes_mensuales`,
`referencias_productivas`, `cotizaciones_diarias`, `rentabilidad_cache`, `pagos_historial`.

## Tareas programadas (APScheduler, zona America/Montevideo)
- Al arrancar: actualizar cotización del día.
- 07:00 — resumen diario por WhatsApp.
- 08:00 — recordatorios de tareas.
- 10:00 — recordatorios de vencimiento de plan por email (3 y 1 días, solo sin auto-renovación).
- Día 1, 09:00 — resumen mensual por WhatsApp.

## Stack y deploy
- **Backend**: FastAPI + SQLAlchemy async + PostgreSQL/PostGIS, Alembic, Pydantic v2.
  Deploy en **Railway** (`https://robust-alignment-production-01c6.up.railway.app`). Carpeta `backend/app/`.
- **Frontend**: React + TypeScript + Vite + Tailwind + TanStack Query v5 + Zustand +
  react-router-dom + Mapbox GL. Deploy en **Vercel** (`finance.360rural.com`). Carpeta `frontend/src/`.
- **Integraciones**: MercadoPago (pagos/suscripciones), Resend (email), Meta Cloud API (WhatsApp),
  Groq (IA), SSO con 360agro.
