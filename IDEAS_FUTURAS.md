# Ideas futuras — 360 Agro Finance

Backlog de ideas que NO están desarrolladas todavía. Anotadas para no perderlas.
No tocar el código por estas ideas hasta que Mateo lo indique explícitamente.

---

## 1. Modo "Multi-establecimiento" (administradores de varios campos)

**Quién lo usaría:** técnicos, ingenieros agrónomos o empresas que administran
varios campos/estancias de distintos productores (no solo el suyo).

**Idea:**
- Que un mismo usuario pueda gestionar varios establecimientos desde la misma cuenta.
- En el menú se elige el establecimiento activo, por ejemplo "Estancia San Felipe",
  y se ven TODOS sus datos (potreros, ganado, franjas, finanzas, mapa, etc.).
- Luego se "sale" de Estancia San Felipe y se "entra" a "Estancia El Colono", y así
  con todas las estancias que esa persona administre.
- Es decir, un selector/switch de establecimiento que cambia el contexto de toda la app.

**Implicancias técnicas a evaluar (cuando se desarrolle):**
- Nueva entidad `Establecimiento` (o `Campo`) con relación a `User` (uno administra muchos).
- Tabla puente usuario↔establecimiento con rol (dueño / administrador / técnico).
- Casi todos los modelos actuales (potreros, ganado, movimientos, franjas, finanzas)
  deberían colgar de `establecimiento_id` en vez de (o además de) `user_id`.
- Selector de establecimiento activo en el frontend (estado global / Zustand) que
  filtre todas las queries.
- Planes/pago: definir cómo se cobra (por establecimiento, por administrador, etc.).

**Estado:** SOLO IDEA. Falta desarrollo y definición.

---

## 2. Trazabilidad

**Idea:** sumar trazabilidad del ganado (origen, movimientos, sanidad, etc.).
Inspiración: Tend (software de cultivos) ofrece "Seamless Traceability" — registra
cada paso del producto "de la semilla a la venta" para auditorías y certificaciones.
Adaptar ese concepto a ganadería (trazabilidad individual o por lote de animales).

**Estado:** SOLO IDEA. Falta desarrollo y definición.

---

## Referencia: app Tend (analizada el 2026-05-24)

- Web: https://www.tend.com — "Farm Management Software for Modern Growers".
- Enfocada en CULTIVOS (verduras, flores, viñedos, huertos, viveros, microgreens),
  NO en ganadería. Es el "otro lado" respecto a 360 Agro Finance.
- Funcionalidades fuertes: planificación de cultivos (crop planning + biblioteca de
  cultivos global), tareas y mano de obra (asignación, revisión, timeline de quién
  hizo qué), ventas multicanal, inventario, contabilidad, analítica, trazabilidad para
  certificaciones (orgánico/regenerativo), mapeo de campos, modo offline, web + móvil,
  colaboración de equipo (notas → tareas).
- Modelo: app gratuita / planes; ganó "Farm Management Software of the Year 2025".
- Lo que NO tiene (y 360 sí, o puede diferenciarse): foco ganadero, potreros/franjas,
  rotación de pastoreo, bot de WhatsApp, score de salud del campo, enfoque rioplatense (UYU).
