# Plan de Pruebas — 360 Agro Finance

> Checklist sistemático para verificar que toda la app funciona antes de seguir desarrollando.
> Marcá cada ítem con ✅ (funciona), ❌ (roto), ⚠️ (funciona con problemas) o — (no aplica/no testeado).
> Anotá el problema debajo del ítem si algo falla.

**Cómo usarlo:** recorré módulo por módulo en el orden de abajo. Empezá siempre desde un usuario de prueba
(no el tuyo de producción) para poder probar el onboarding y el plan limpio.

URL producción: `https://finance.360rural.com`
Backend: `https://robust-alignment-production-01c6.up.railway.app`

---

## 0. Antes de empezar — prerequisitos

| # | Verificar | Estado |
|---|-----------|--------|
| 0.1 | `RESEND_API_KEY` cargada en Railway (sin esto los emails fallan silenciosamente) | — |
| 0.2 | `MP_ACCESS_TOKEN` de producción cargado en Railway | — |
| 0.3 | Tener a mano credenciales de sandbox de MercadoPago para pruebas de pago | — |
| 0.4 | Tener número de WhatsApp del bot disponible para testear | — |

---

## 1. Auth & Onboarding

| # | Caso | Estado | Notas |
|---|------|--------|-------|
| 1.1 | Registro con email nuevo → recibe email de bienvenida + verificación | ✅ | Implementado con Resend. Muestra pantalla "Revisá tu email" tras registro. |
| 1.1b | Registro → solicitar número de teléfono para el bot de WhatsApp | ✅ | Campo teléfono agregado al formulario de registro (opcional). |
| 1.2 | Login con credenciales correctas → entra al dashboard | ✅ | |
| 1.3 | Login con contraseña incorrecta → mensaje de error claro | ✅ | |
| 1.4 | Usuario nuevo sin onboarding → redirige a `/onboarding` | ✅ | |
| 1.5 | Completar onboarding (perfil productor) → llega al dashboard | ✅ | |
| 1.6 | Completar onboarding (perfil negocio) → llega al dashboard | ✅ | |
| 1.7 | SSO desde 360agro (`/sso`) → sesión iniciada correctamente | ✅ | |
| 1.8 | Logout → sesión cerrada, redirige a login | ✅ | |

---

## 2. Plan & Pagos

### 2.1 Estado
| # | Caso | Estado | Notas |
|---|------|--------|-------|
| 2.1 | Pago manual funciona end-to-end | ✅ | Webhook OK, plan actualizado, email de recibo llega |
| 2.2 | Suscripción automática | ⚠️ | Da error — pospuesto para próxima sesión |
| 2.3 | Bloqueo de cuenta al vencer | ⚠️ | Pendiente implementar |
| 2.4 | Mostrar período activo (inicio/vencimiento) en la app | ⚠️ | Pendiente implementar |

### 2.1 Trial y estado del plan
| # | Caso | Estado | Notas |
|---|------|--------|-------|
| 2.1.1 | Usuario en trial → banner muestra fecha de vencimiento | — | |
| 2.1.2 | Usuario activo sin auto-renovación → banner muestra fecha de vencimiento | — | |
| 2.1.3 | Usuario activo con auto-renovación → no muestra banner (o muestra estado OK) | — | |
| 2.1.4 | Usuario vencido → acceso bloqueado, redirige a `/pago` | — | |

### 2.2 Página de pago (`/pago` y `/planes`)
| # | Caso | Estado | Notas |
|---|------|--------|-------|
| 2.2.1 | `/planes` redirige a `/pago` correctamente | — | |
| 2.2.2 | La página muestra las dos opciones: renovación automática y manual | — | |
| 2.2.3 | El precio se muestra como **UYU $280** (no "$7 USD") | — | |

### 2.3 Pago manual (un solo cobro)
| # | Caso | Estado | Notas |
|---|------|--------|-------|
| 2.3.1 | Clic en "Pago manual" → redirige a checkout de MercadoPago | — | |
| 2.3.2 | Pagar en sandbox MP → webhook recibido, plan se extiende 30 días | — | |
| 2.3.3 | Llega email de recibo al usuario | — | Requiere RESEND_API_KEY |
| 2.3.4 | `pagos_historial` registra el pago | — | Verificar desde Railway DB o endpoint |

### 2.4 Suscripción automática
| # | Caso | Estado | Notas |
|---|------|--------|-------|
| 2.4.1 | Clic en "Renovación automática" → redirige a checkout de suscripción MP | — | |
| 2.4.2 | Autorizar suscripción en sandbox → `suscripcion_id` se guarda en el usuario | — | |
| 2.4.3 | Cobro recurrente simulado → plan se extiende, llega email de recibo | — | Verificar campos `NOTA` en `pagos.py` |
| 2.4.4 | Cancelar suscripción desde MP → `suscripcion_id` se borra en el usuario | — | |

### 2.5 Recordatorios de vencimiento
| # | Caso | Estado | Notas |
|---|------|--------|-------|
| 2.5.1 | Usuario sin auto-renovación con 3 días para vencer → recibe email de aviso | — | Testear llamando directamente al endpoint o esperando el job |
| 2.5.2 | Usuario sin auto-renovación con 1 día para vencer → recibe email de aviso | — | |
| 2.5.3 | Usuario CON auto-renovación → NO recibe email de aviso | — | |

---

## 3. Mapa & Campo

### 3.1 Potreros
| # | Caso | Estado | Notas |
|---|------|--------|-------|
| 3.1.1 | Mapa carga correctamente (Mapbox) | ✅ | |
| 3.1.2 | Crear potrero dibujando polígono → se guarda y aparece en el mapa | ✅ | |
| 3.1.3 | Editar nombre/datos de un potrero | ✅ | |
| 3.1.4 | Eliminar potrero | ✅ | |
| 3.1.5 | Hectáreas calculadas correctamente al dibujar | ✅ | |
| 3.1.6 | Panel lateral muestra info del potrero seleccionado | ✅ | |

### 3.2 Franjas (pastoreo rotativo)
| # | Caso | Estado | Notas |
|---|------|--------|-------|
| 3.2.1 | Activar "tiene franjas" en un potrero → aparece selector de número de franjas | ✅ | |
| 3.2.2 | Franjas se dibujan como strips dentro del polígono del potrero | ✅ | Fix de turfIntersect confirmado OK |
| 3.2.3 | Franjas se colorean según estado (en uso / descanso) | ✅ | |
| 3.2.4 | Cambiar franja en uso → se actualiza visualmente | ✅ | |
| 3.2.5 | Días de descanso objetivo se guardan y muestran | ✅ | |

### 3.3 Puntos de interés
| # | Caso | Estado | Notas |
|---|------|--------|-------|
| 3.3.1 | Agregar punto de interés (bebedero, casa, etc.) → aparece en el mapa | ✅ | |
| 3.3.2 | Eliminar punto de interés | ✅ | |

### 3.4 Ganado
| # | Caso | Estado | Notas |
|---|------|--------|-------|
| 3.4.1 | Agregar animales a un potrero (especie, cantidad, raza) | ✅ | |
| 3.4.2 | Múltiples especies en el mismo potrero | ✅ | |
| 3.4.3 | El panel del potrero muestra los animales actuales | ✅ | Ej: "55 anim. 26ha" |

---

## 4. Movimientos de Ganado

| # | Caso | Estado | Notas |
|---|------|--------|-------|
| 4.1 | Mover ganado entre potreros desde la app → movimiento aparece como ejecutado (no programado) | ✅ | Funciona bien, categorías bien separadas |
| 4.2 | Mover ganado entre franjas del mismo potrero | ✅ | |
| 4.3 | Al mover ganado a potrero con franjas → franja 1 se activa automáticamente | ✅ | |
| 4.4 | Historial de movimientos muestra los ejecutados | ✅ | |

---

## 5. Finanzas

### 5.1 Registros de gastos e ingresos
| # | Caso | Estado | Notas |
|---|------|--------|-------|
| 5.1.1 | Crear gasto con categoría y monto | ✅ | |
| 5.1.2 | Crear ingreso con categoría y monto | ✅ | |
| 5.1.3 | Adjuntar comprobante (imagen) a un registro | ✅ | |
| 5.1.4 | Filtrar registros por fecha / categoría | ✅ | |
| 5.1.5 | Editar y eliminar un registro | ✅ | |

### 5.2 Categorías y Productos — POSPUESTO (decidir si se mantiene o se saca)
| # | Caso | Estado | Notas |
|---|------|--------|-------|
| 5.2.1 | Crear, editar y eliminar categorías | — | |
| 5.2.2 | Crear, editar y eliminar productos/servicios | — | |

### 5.3 Flujo de caja / Clientes / Proveedores
| # | Caso | Estado | Notas |
|---|------|--------|-------|
| 5.3.1 | `/clientes` redirige a `/flujo-caja` correctamente | — | |
| 5.3.2 | `/proveedores` redirige a `/flujo-caja` correctamente | — | |
| 5.3.3 | Crear cliente y registrar cuenta por cobrar | ✅ | |
| 5.3.4 | Crear proveedor y registrar cuenta por pagar | ✅ | |
| 5.3.5 | El balance de flujo de caja refleja los movimientos | ✅ | Fix aplicado (commit 380a342): ítems vencidos y sin fecha ahora aparecen en semana 0. Al marcar como cobrado/pagado se quitan del gráfico. |
| 5.3.6 | Columna "Días" se oculta en mobile (hidden sm:table-cell) | — | |

---

## 6. Análisis e Inteligencia

### 6.1 Rentabilidad por potrero — REMOVIDO (pendiente rediseñar y desarrollar desde cero)
| # | Caso | Estado | Notas |
|---|------|--------|-------|
| 6.1.1 | La página carga y muestra márgenes por potrero | — | Módulo quitado, no aplica |
| 6.1.2 | Comparación con benchmarks (bajo/medio/alto) visible | — | Módulo quitado, no aplica |
| 6.1.3 | Export a PDF funciona | — | Módulo quitado, no aplica |
| 6.1.4 | Cotización del día (USD/UYU) se muestra actualizada | — | Módulo quitado, no aplica |

### 6.2 Score de salud
| # | Caso | Estado | Notas |
|---|------|--------|-------|
| 6.2.1 | La página carga y muestra el score | ✅ | |
| 6.2.2 | Grid de métricas se ve bien en mobile (grid-cols-2) | ✅ | |

### 6.3 Recomendaciones IA y Asistente
| # | Caso | Estado | Notas |
|---|------|--------|-------|
| 6.3.1 | Recomendaciones carga y muestra sugerencias (Groq) | ✅ | |
| 6.3.2 | Asistente IA responde preguntas agropecuarias | ✅ | MEJORA PENDIENTE: mejorar para mayor impacto y que derive en mejor uso de la app. |
| 6.3.3 | Burbujas de chat no desbordan en mobile (break-words) | ✅ | |

---

## 7. Productividad — (Dashboard/Alertas removidos; Cuaderno, Resúmenes y Perfil siguen activos)

### 7.1 Dashboard / Alertas — REMOVIDO

### 7.2 Cuaderno de campo
| # | Caso | Estado | Notas |
|---|------|--------|-------|
| 7.2.1 | Crear nota con fecha | ✅ | |
| 7.2.2 | Crear tarea con fecha planificada | ✅ | |
| 7.2.3 | Marcar tarea como hecha | ✅ | |
| 7.2.4 | Recordatorio de tarea funciona (job 08:00) | ✅ | |

### 7.3 Resúmenes mensuales
| # | Caso | Estado | Notas |
|---|------|--------|-------|
| 7.3.1 | La página muestra el resumen del mes actual | ✅ | Fix aplicado: generar sin parámetros ahora usa el mes actual. |
| 7.3.2 | Resumen se genera y envía por WhatsApp el día 1 (job) | — | |

### 7.4 Perfil y configuración
| # | Caso | Estado | Notas |
|---|------|--------|-------|
| 7.4.1 | Editar nombre, apellido y datos del perfil | ✅ | |
| 7.4.2 | Cambiar contraseña | ✅ | Flujo completo: cambio desde perfil + recuperación por email + emails con diseño. |
| 7.4.3 | Grid Nombre/Apellido se ve bien en mobile | ✅ | Mobile en general se ve bien, sin desbordamiento. |

---

## 8. Bot de WhatsApp

> Testeá enviando mensajes al número del bot. Antes de cada flujo mandá "0" o "cancelar" para resetear el estado.

| # | Flujo | Caso | Estado | Notas |
|---|-------|------|--------|-------|
| 8.1 | Menú | Mandar cualquier mensaje → recibir menú con 9 opciones | ✅ | |
| 8.2 | Nota (1) | Enviar "1" → escribir nota → se guarda en cuaderno | ✅ | |
| 8.3 | Tarea (2) | Enviar "2" → escribir tarea → se guarda en cuaderno | ✅ | |
| 8.4 | Tarea hecha (3) | Enviar "3" → marcar tarea → estado actualizado | ✅ | |
| 8.5 | Gasto (4) | Enviar "4" → registrar gasto → aparece en registros | ✅ | |
| 8.6 | Ingreso (5) | Enviar "5" → registrar ingreso → aparece en registros | ✅ | |
| 8.7 | Tareas (6) | Enviar "6" → bot responde lista de tareas pendientes | ✅ | |
| 8.8 | Balance (7) | Enviar "7" → bot responde balance actual | ✅ | |
| 8.9 | Resumen (8) | Enviar "8" → bot responde resumen financiero | ✅ | |
| 8.10 | Mover ganado — franjas (9→1) | Enviar "9" → "1" → nombre potrero → número franja → se actualiza FranjaEstado | ✅ | Ganado se mueve al instante |
| 8.11 | Mover ganado — potreros (9→2) | Enviar "9" → "2" → potrero origen → potrero destino → cantidad y especie | ✅ | |
| 8.12 | Múltiples especies | En mover potreros → múltiples especies → se transfieren por separado | ✅ | Fix aplicado: cada subcategoría bovina ahora tiene su propia especie. |
| 8.13 | Foto de comprobante | Mandar foto → se adjunta a gasto reciente | — | Pospuesto |
| 8.14 | Cancelar | Enviar "cancelar" en cualquier punto → resetea estado, muestra menú | ✅ | |
| 8.15 | Resiliencia ante error | Si algo falla → bot igual responde (no queda en silencio) | ⚠️ | Al mover entre franjas sin franja 1 activada costó un poco pero luego siguió normal. Revisar el manejo de ese caso borde. |

---

## 9. Mobile / Responsive

> Probá en celular real o con DevTools en modo móvil (375px de ancho).

| # | Página | Verificar | Estado | Notas |
|---|--------|-----------|--------|-------|
| 9.1 | Mapa | Panel lateral ocupa ancho completo (no sobresale) | ✅ | Se despliega y guarda bien |
| 9.2 | Mapa | Panel movimientos visible y no tapado por barra Safari | ✅ | |
| 9.3 | Mapa | Botón "confirmar potrero" visible arriba | ✅ | Fix aplicado: se oculta inmediatamente al clickearlo. |
| 9.4 | Mapa | Barra de puntos (PuntosToolbar) no tapada por barra de Safari iOS | ✅ | |
| 9.5 | Registros | Filtros en ancho completo, fechas side-by-side | ⚠️ | Se ven cortados pero se puede hacer scroll para ver todo. Aceptable por ahora. |
| 9.6 | Registros | Sin scroll horizontal en la tabla | ✅ | |
| 9.7 | Flujo de caja | Sin scroll horizontal, columna "Días" oculta | ✅ | |
| 9.8 | Resúmenes | Header no se corta | — | No testeado |
| 9.9 | Score de salud | Grid 2 columnas en mobile aceptable | ✅ | |
| 9.10 | Cuaderno | Header y modal de tarea responsivos | ✅ | |
| 9.11 | Clientes/Proveedores | Padding y header responsivos | — | No testeado |
| 9.12 | Asistente IA | Burbujas no desbordan el ancho | ✅ | |
| 9.13 | Perfil | Campos Nombre/Apellido en columna en mobile | ✅ | |

---

## Resumen de resultados

Completá esto al terminar:

| Módulo | ✅ OK | ❌ Roto | ⚠️ Parcial |
|--------|-------|---------|-----------|
| Auth & Onboarding | 7 | 1 (email bienvenida) | 1 (falta pedir teléfono) |
| Plan & Pagos | — | — | Pospuesto para rediseño |
| Mapa & Campo | 14 | 0 | 0 |
| Movimientos de ganado | 4 | 0 | 0 |
| Finanzas | 6 | 1 (gráfico flujo de caja en 0) | 1 (categorías/productos: decidir si se mantiene) |
| Análisis e IA | 4 | 0 | 1 (asistente: mejorar impacto) |
| Productividad | 7 | 1 (resumen muestra mes pasado) | 1 (cambio contraseña: mejorar) |
| Bot WhatsApp | 11 | 1 (especies se fusionan al mover) | 1 (caso borde franja sin activar) |
| Mobile/Responsive | 10 | 0 | 2 (botón confirmar potrero queda visible; filtros se cortan pero aceptable) |

---

## Cómo reportar un bug para que lo arregle

Al encontrar algo roto, anotá:
1. **Qué hiciste** (pasos exactos)
2. **Qué esperabas** que pasara
3. **Qué pasó** (mensaje de error, comportamiento raro, pantalla en blanco)
4. Si es visual: un screenshot ayuda mucho

Con eso puedo preparar el prompt exacto para Claude Code y arreglarlo.
