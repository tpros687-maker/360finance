# Resumen de sesión — Traspaso a nuevo chat

> Para el asistente que retoma: **leé primero estos archivos del repo** antes de tocar nada:
> `VISION_PRODUCTO.md` (qué es y qué hace la app), `CONTEXTO_DESARROLLO.md` (detalle técnico),
> `CONTEXT.md` (si existe), `IDEAS_FUTURAS.md` y este archivo.
> El proyecto está en `E:\PROGRAMA360\360finance`. Backend FastAPI en Railway, frontend React
> en Vercel (dominio finance.360rural.com). Bot de WhatsApp vía Meta Cloud API.

---

## Cómo trabajamos (importante, mantener este flujo)

El usuario (Mateo) trabaja así, **por rubros y por partes**:
1. Se marca el rubro de trabajo.
2. El asistente (Cowork) **planifica y escribe prompts autocontenidos** que Mateo copia y pega
   en **Claude Code (CLI)**, que es quien hace las ediciones, commits y push.
3. Cada prompt le pide a Claude Code que **lea el contexto** (`CONTEXTO_DESARROLLO.md`) primero.
4. Después de cada push, el asistente **verifica el diff** con git/bash (no asume que está bien).
5. Regla de seguridad: **ningún token/secreto va al código ni al repo**, todo por variables de
   entorno (patrón de `backend/app/config.py`, pydantic-settings, `extra="ignore"`).

Idioma: Mateo escribe en español (con typos), responder en español, tono cercano y claro.

---

## Lo que se hizo en esta sesión: RUBRO PAGOS (COMPLETO)

Objetivo: dos modos de renovación de la suscripción (UYU $280 / 30 días), con recibos por
email y avisos de vencimiento. Se decidió **MercadoPago solamente** (Stripe NO opera en
Uruguay). Email con **Resend**. Aviso de vencimiento por **correo + banner en la página**.
"Factura" = **recibo/comprobante simple** (NO factura electrónica DGI/CFE).

Commits (en orden):
- `c53d7bf` — **Parte 1**: infra de email con Resend (`backend/app/services/email.py`,
  función `send_email` async que nunca rompe si falla) + config (`RESEND_API_KEY`,
  `EMAIL_FROM`, `EMAIL_REPLY_TO`) + `resend==2.4.0` en requirements. **Bugfix** en
  `pagos.py` webhook: `PRECIO_USD` (no existía) → `PRECIO_UYU`, y moneda default `"USD"` → `"UYU"`.
- `970aa99` — **Parte 2**: `send_recibo_pago(...)` (HTML + texto) y se dispara en el webhook
  solo en pago nuevo y aprobado (idempotente ante reintentos de MP).
- `206175f` — **Parte 3**: renovación **automática** con MercadoPago **Suscripciones (preapproval)**.
  Endpoint `POST /pagos/crear-suscripcion`. Webhook refactorizado en handlers:
  `_handle_payment` (pago único), `_handle_preapproval` (suscripción autorizada/cancelada),
  `_handle_authorized_payment` (cobro recurrente, vía httpx a `GET /authorized_payments/{id}`).
  Guarda `suscripcion_id`, extiende `trial_fin` +30 días, manda recibo en cada cobro.
  **OJO**: tiene comentarios `NOTA` marcando campos a verificar en el **sandbox de MercadoPago**.
- `5ec1e67` — **Parte 4**: recordatorios de vencimiento por email. `send_aviso_vencimiento(...)`
  en email.py + `backend/app/services/suscripciones.py` con `enviar_recordatorios_vencimiento`.
  Job diario 10:00 (America/Montevideo) en `main.py` (APScheduler). Avisa a **3 y 1 días**,
  solo a usuarios **sin** renovación automática (`suscripcion_id IS NULL`).
- `81ecba2` — **Parte 5** (frontend): `PagoPage.tsx` con **dos opciones** (automática vs
  manual), precio corregido a **UYU $280** (antes decía "$7 USD"), `crearSuscripcion()` en
  `pagosApi.ts`, banner (`ProtectedRoute.tsx`) ahora muestra la **fecha de vencimiento** y
  también aparece para plan "activo" sin auto-renovación. Ruta `/planes` como alias de `/pago`.
- `e6af3a5` — **Fix de regresión**: en la Parte 5, Claude Code (para pasar el build) cambió
  `turfIntersect` en `MapaPage.tsx` a la forma de 2 argumentos, que **rompe en runtime** con
  turf v7 ("Must specify at least 2 geometries"). Se revirtió a la forma `FeatureCollection`
  correcta: `(turfIntersect as any)({ type: "FeatureCollection", features: [...] })`. Verificado
  ejecutando la función real. (Los otros cambios de ese commit —quitar variables sin usar en
  `PanelLateral.tsx` y `RegistroModal.tsx`— estaban bien y se dejaron.)

### Archivos clave de pagos
- `backend/app/routers/pagos.py` — endpoints `crear-preferencia` (manual/único),
  `crear-suscripcion` (automática), `webhook` (3 handlers), `historial`.
  Constantes: `PRECIO_UYU = 280.0`, `PLAN_DURACION_DIAS = 30`.
- `backend/app/services/email.py` — `send_email`, `send_recibo_pago`, `send_aviso_vencimiento`,
  helper `_fmt_fecha`. **Cambiar de proveedor de email = tocar solo este módulo.**
- `backend/app/services/suscripciones.py` — recordatorios de vencimiento.
- `backend/app/main.py` — APScheduler con el job `recordatorios_vencimiento` (10:00).
- `backend/app/models/user.py` — campos `plan`, `trial_fin`, `suscripcion_id` (si está seteado
  = auto-renovación), etc.
- `frontend/src/pages/PagoPage.tsx`, `frontend/src/lib/pagosApi.ts`,
  `frontend/src/components/ProtectedRoute.tsx`, `frontend/src/App.tsx`.

---

## PENDIENTE — del lado de Mateo (para que funcione en producción)

1. **Resend**: verificar un dominio (ideal `360rural.com`) y cargar `RESEND_API_KEY` en Railway.
   Ajustar `EMAIL_FROM` al dominio verificado (hoy default `no-reply@360rural.com`). Sin la
   key, los emails se saltan silenciosamente (logueado), no rompen nada.
2. **MercadoPago Suscripciones**: probar `crear-suscripcion` y los webhooks en el **sandbox de
   MP** con credenciales de prueba. Verificar los nombres reales de los campos de
   `GET /authorized_payments/{id}` (`preapproval_id`, `status`, `transaction_amount`) — están
   marcados con `NOTA` en `pagos.py`. Confirmar que `MP_ACCESS_TOKEN` de producción esté en Railway.
3. Probar el flujo end-to-end (pago manual y suscripción) y que lleguen los recibos.

---

## IDEAS FUTURAS (ver `IDEAS_FUTURAS.md`) — SOLO IDEAS, no desarrollar sin pedido

1. **Modo multi-establecimiento**: para técnicos/ingenieros/empresas que administran varios
   campos. Selector en el menú: entrar a "Estancia San Felipe", ver todo, salir y entrar a
   "Estancia El Colono", etc. Implica entidad `Establecimiento`, tabla puente usuario↔
   establecimiento con rol, y colgar los modelos de `establecimiento_id`. Definir cobro.
2. **Trazabilidad** del ganado (origen, movimientos, sanidad). Inspirado en la trazabilidad de
   la app **Tend** (tend.com), que es software de gestión de CULTIVOS (no ganadería) — es la
   "competencia del otro lado". El diferencial de 360 es el foco ganadero (potreros, franjas,
   rotación, bot WhatsApp, enfoque rioplatense UYU).

---

## Otros pendientes / notas previas

- **Pendiente "movimiento programado"**: el movimiento de ganado por el bot aparecía como
  "programado" en la app debiendo ser inmediato. Se analizó: **no hay bug de código** (el bot
  crea `estado="ejecutado"`). Es tema de deploy/datos viejos. Mateo decidió dejarlo.
- **Franja 1 automática**: hecho (commit anterior `15b3efc`) — al mover ganado a un potrero con
  franjas se activa la franja 1 (`_activar_franja_inicial` en `movimientos.py`).
- **Token permanente de Meta**: documentado en `META_TOKEN_PERMANENTE.md`.
- **Responsive/mobile**: tanda completa (commits 7e9c1f1, f17f832, 1e3e4bd, b58e38f). Queda por
  confirmar si `ScoreSaludPage` en `grid-cols-2` en mobile es aceptable.

## Gotchas técnicos del entorno

- El árbol de trabajo en Windows muestra CRLF/archivos "modificados" que NO son cambios reales
  (`core.fileMode` false). **Commitear solo archivos tocados explícitamente.**
- Al verificar desde Linux, a veces el mount muestra un archivo truncado/corrupto aunque el
  commit en git está bien. **Verificar siempre con `git show HEAD:<archivo>`**, no solo el árbol.
- `.git/index.lock` y `rm` pueden fallar con "Operation not permitted" desde el mount Linux
  (lock de Windows). Esas operaciones las hace Claude Code (corre nativo en Windows).
- Para validar un cambio de comportamiento (ej. firma de una librería como turf), **ejecutar la
  función real** > confiar en que `tsc` pase (tsc no detectó la regresión de turf).
