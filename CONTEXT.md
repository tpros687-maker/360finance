# 360 Finance — Contexto del proyecto

## Descripción
App web multi-usuario para gestión agropecuaria. Cada usuario registrado
gestiona sus propios datos de forma independiente.

## Stack
- Backend: FastAPI + SQLAlchemy async + PostgreSQL + PostGIS + Alembic + Pydantic v2 + JWT
- Frontend: React + TypeScript + Vite + Tailwind CSS + shadcn/ui + Zustand + React Query + Axios
- Infra: Docker Compose

## Módulos
1. Dashboard — gráficas y KPIs basados en registros del usuario
2. Mapa — mapa satelital Mapbox con potreros, animales, puntos de interés
3. Registros — tabla estilo Excel para gastos e ingresos
4. Asistente IA — chat con Gemini 2.0 Flash con contexto del productor

## Estado actual — v1 completa
- Fase 1 ✅ Auth completo (register, login, JWT, sidebar, rutas protegidas)
- Fase 2 ✅ Registros (gastos/ingresos, categorías fijas + personalizadas, resumen para dashboard)
- Fase 3 ✅ Mapa (potreros PostGIS, animales texto libre, puntos de interés, movimientos de ganado, estado en descanso)
- Fase 4 ✅ Dashboard (KPIs, gráficas Recharts, resumen del campo, movimientos próximos)
- Fase 5 ✅ Asistente IA (Gemini 2.0 Flash, contexto del productor, chat con historial)

## Migraciones aplicadas
- 0001 — create users table
- 0002 — create categorias and registros tables with seed data
- 0003 — create mapa tables (potreros, animales, puntos_interes, movimientos_ganado)
- 0004 — alter animal especie to varchar
- 0005 — add descanso to potrero
- 0006 — add potrero_id (FK nullable) to registros
- 0007 — add hectareas (Numeric 10,2) to potreros

## Convenciones
- Todo tipado estrictamente (TypeScript + Python)
- Cada módulo tiene su store Zustand, su api service y sus tipos
- Los endpoints siempre validan que el recurso pertenezca al usuario autenticado
- Seed data de categorías insertado con op.execute() y SQL puro (cast explícito a enum)

## Roadmap v2
- Fase A ✅ Registros mejorados (asociar potrero, comprobantes, exportar Excel/PDF)
- Fase B ✅ Mapa mejorado (hectáreas automáticas, días en descanso, historial movimientos)
- Fase C ⏳ Dashboard mejorado (gráficas animales, alertas)
- Fase D ⏳ Asistente IA mejorado (sugerencias movimientos, alertas inteligentes, historial en BD)
- Fase E ⏳ UX general (perfil productor, notificaciones, búsqueda global)