# Contexto de Desarrollo — 360 Agro Finance

## Stack
- **Backend**: FastAPI + SQLAlchemy async + PostgreSQL (Railway)
  - Deploy: `https://robust-alignment-production-01c6.up.railway.app`
  - Carpeta: `backend/app/`
- **Frontend**: React + TypeScript + Vite + Tailwind + TanStack Query v5 (Vercel)
  - Carpeta: `frontend/src/`
- **Bot WhatsApp**: Meta Cloud API (migrado desde Twilio)
  - Webhook: `POST /whatsapp/webhook`
  - Verificación: `GET /whatsapp/webhook`

## Variables de entorno en Railway (importantes)
- `META_ACCESS_TOKEN` — token temporal (expira cada 24hs, pendiente hacer permanente)
- `META_PHONE_NUMBER_ID` = `1141547282374620`
- `META_VERIFY_TOKEN` = `whatsapp-verify-360`
- `GROQ_API_KEY` — para clasificación de mensajes e IA

## Archivos clave
| Archivo | Descripción |
|---|---|
| `backend/app/routers/whatsapp.py` | Bot WhatsApp — lógica completa, state machine |
| `backend/app/routers/movimientos.py` | Movimientos de ganado — contiene `_transferir_animales()` |
| `backend/app/routers/potreros.py` | CRUD potreros y franjas |
| `backend/app/models/mapa.py` | Modelos: Potrero, Animal, FranjaEstado, MovimientoGanado |
| `backend/app/config.py` | Settings (env vars) |
| `frontend/src/pages/MapaPage.tsx` | Mapa Mapbox con strips de franjas |
| `frontend/src/lib/potrerosApi.ts` | API calls del frontend |

## Estado del bot WhatsApp
El bot usa una state machine con `_estados` dict en memoria.
Menú: 1=nota, 2=tarea, 3=tarea hecha, 4=gasto, 5=ingreso, 6=tareas, 7=balance, 8=resumen, 9=mover ganado

Flujo "mover ganado" (opción 9):
- Sub-opción 1: mover entre franjas del mismo potrero
- Sub-opción 2: mover entre potreros (acepta múltiples especies: "30 vaquillonas, 20 terneros")

## Pendientes (retomar en nuevo chat)

### 1. Movimiento entre potreros aparece como "programado"
El bot crea el `MovimientoGanado` con `estado="ejecutado"` y llama `_transferir_animales()`,
pero en la app el movimiento aparece en la sección de "programados" con botón aceptar/rechazar.
Revisar cómo el frontend filtra/muestra los movimientos (`MovimientoRead.estado`).

### 2. Auto-activar franja 1 al recibir ganado
Cuando se mueve ganado a un potrero que tiene franjas (`potrero.tiene_franjas == True`),
auto-marcar la franja 1 (`FranjaEstado.numero == 1`) como `en_uso = True`.
Esto va en `_transferir_animales()` en `movimientos.py` o en `_ejecutar_mover_potrero()` en `whatsapp.py`.

### 3. Token permanente de Meta
El token actual (`EAAcfG...`) expira cada 24hs.
Para hacerlo permanente: Meta Developers → tu app → WhatsApp → Configuración →
generar "Token de acceso permanente" vinculado a un System User del Business Manager.
Luego actualizar `META_ACCESS_TOKEN` en Railway.

### 4. (Futuro) Notificación cuando termina el descanso de una franja
Pendiente de implementar.

## Cosas que YA funcionan
- ✅ Mapa con strips de franjas coloreadas (Mapbox + @turf/intersect)
- ✅ Bot WhatsApp: notas, tareas, gastos, ingresos, consultas IA, fotos de comprobantes
- ✅ Bot: mover ganado entre franjas (mismo potrero) — actualiza FranjaEstado
- ✅ Bot: mover ganado entre potreros — crea MovimientoGanado + transfiere Animal
- ✅ Bot: múltiples especies en un mensaje ("30 vaquillonas, 20 terneros")
- ✅ Bot: matching de potreros por palabras completas (evita falsos positivos)
- ✅ Resiliencia: bot siempre responde aunque haya error interno
- ✅ Comandos de escape: "cancelar", "salir", "0" resetean el estado

## Responsive
- Responsive parte 1 (paneles flotantes críticos) — hecho (2026-05-23)
  - Sidebar alertas panel: `lg:left-64 lg:w-80` (antes `left-64 w-80`)
  - PanelLateral mapa: `w-full sm:w-80` (antes `w-80`)
  - MovimientosPanel: `w-[calc(100%-2rem)] max-w-xs sm:w-72` (antes `w-72`)
  - Auditoría completa en RESPONSIVE_AUDIT.md (18 ítems restantes)
- Responsive parte 2 (overflow horizontal: filtros, tablas registros/flujo, resúmenes) — hecho (2026-05-23)
- Responsive parte 3 (grids sin breakpoints, headers comprimidos, safe-area iOS, ModalMovimiento flex) — hecho (2026-05-23)
  - PerfilPage: grid-cols-1 sm:grid-cols-2 para Nombre/Apellido
  - ScoreSaludPage: grid-cols-2 md:grid-cols-3 lg:grid-cols-4 + p-3 sm:p-6
  - CuadernoPage: header flex-col sm:flex-row + padding responsive + ModalTarea grid responsive
  - ClientesPage / ProveedoresPage: p-3 sm:p-6 + header flex-col sm:flex-row
  - AsistentePage: break-words + overflow-x-auto en burbujas de chat
  - ModalMovimiento: cambio de grid a flex para fila de animales
  - MapaPage botón flotante: bottom-[calc(1rem+env(safe-area-inset-bottom))]
  - PuntosToolbar: bottom-[calc(2rem+env(safe-area-inset-bottom))]
  - Auditoría completa: todos los 21 ítems marcados ✅
  - RegistrosFilters: w-full en mobile, sm:w-[original] en desktop; fechas side-by-side en mobile
  - RegistrosPage: p-3 sm:p-6, botones con flex-wrap
  - FlujoCajaPage: p-3 sm:p-6, columna Días oculta en mobile (hidden sm:table-cell)
  - ResumenesMensualesPage: header flex-col sm:flex-row, px-3 sm:px-6

## Cómo retomar en nuevo chat
Decile al asistente:
> "Continuamos el desarrollo de 360 Agro Finance. Lee el archivo CONTEXTO_DESARROLLO.md
> en E:\PROGRAMA360\360finance\ para ponerte al día y luego atacamos los pendientes."
