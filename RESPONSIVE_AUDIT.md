# Responsive Audit — 360 Agro Finance
**Target:** 375–430 px de ancho (iPhone SE / iPhone 14 Pro / Android estándar)
**Fecha:** 2026-05-23
**Estado:** auditoría completa — 3 críticos ✅ corregidos (2026-05-23)

---

## CRÍTICO — rompen la UI completamente

### ✅ 1. Sidebar.tsx — Panel de alertas fuera de pantalla
**Archivo:** `frontend/src/components/layout/Sidebar.tsx:130`
```
className="fixed left-64 top-0 h-screen w-80 z-50 ..."
```
**Qué rompe:** `left-64` (256px) asume que el sidebar está visible. En mobile el sidebar es un overlay, así que el panel de alertas queda fuera de viewport (empieza en x=256, pero la pantalla mide 375px y el panel mide 320px → se corta por la derecha).
**Fix sugerido:**
```tsx
// En mobile: full-width desde left-0. En desktop: left-64
className="fixed inset-y-0 left-0 w-full z-50 sm:left-64 sm:w-80 ..."
```

---

### ✅ 2. PanelLateral.tsx — Panel de potrero ocupa toda la pantalla sin scroll
**Archivo:** `frontend/src/components/mapa/PanelLateral.tsx:469`
```
className="absolute top-0 right-0 h-full w-80 bg-white ..."
```
**Qué rompe:** `w-80` = 320px sobre 375px de pantalla. El mapa queda completamente tapado. No hay swipe-to-close ni overlay para cerrarlo. El panel tiene scroll interno pero los botones del footer pueden quedar fuera del viewport en teléfonos con teclado abierto.
**Fix sugerido:**
```tsx
// Full-width en mobile, w-80 en sm+
className="absolute top-0 right-0 h-full w-full sm:w-80 bg-white ..."
// Agregar botón visible de cierre en mobile (ya existe el X, solo hacerlo más grande)
```

---

### ✅ 3. MovimientosPanel.tsx — Panel flotante demasiado ancho
**Archivo:** `frontend/src/components/mapa/MovimientosPanel.tsx`
**Qué rompe:** El panel usa un ancho fijo (`w-72` = 288px). En pantallas de 375px esto deja solo 87px de mapa visible. No colapsa ni adapta en mobile.
**Fix sugerido:**
```tsx
className="... w-full sm:w-72 ..."
// + max-h-[60vh] overflow-y-auto para no tapar el mapa completo
```

---

### 4. ElementosPanel.tsx — Panel de elementos flotante
**Archivo:** `frontend/src/components/mapa/ElementosPanel.tsx`
**Qué rompe:** Ancho fijo `w-56` (224px) posicionado con `absolute`. En mobile puede solaparse con PanelLateral o PuntosToolbar, dejando el mapa inusable.
**Fix sugerido:**
```tsx
// Reducir en mobile o convertirlo en drawer desde abajo
className="... w-48 sm:w-56 ..."
```

---

## ALTO — tablas y filtros que desbordan horizontalmente

### ✅ 5. RegistrosFilters.tsx — Filtros con anchos fijos que desbordan
**Archivo:** `frontend/src/components/registros/RegistrosFilters.tsx`
**Qué rompe:** Todos los controles de filtro tienen anchos fijos sin breakpoint responsive:
- Búsqueda: `min-w-[200px]` — más ancho que la pantalla si hay otros elementos
- Tipo: `w-36` (144px)
- Categoría: `w-48` (192px)
- Potrero: `w-44` (176px)
- Fechas: `w-40` (160px) × 2

En mobile, el contenedor tiene `flex flex-wrap` pero los anchos mínimos hacen que cada filtro ocupe toda una fila o desborde.
**Fix sugerido:**
```tsx
// Búsqueda:
className="w-full sm:min-w-[200px] sm:flex-1 ..."
// Selects: ancho mínimo flexible
className="w-full sm:w-36 ..."  // Tipo
className="w-full sm:w-48 ..."  // Categoría
className="w-full sm:w-44 ..."  // Potrero
className="w-full sm:w-40 ..."  // Fechas
// O bien: 2 columnas en mobile con grid
className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2"
```

---

### ✅ 6. RegistrosTable.tsx — Tabla sin gestión de overflow en mobile
**Archivo:** `frontend/src/components/registros/RegistrosTable.tsx:79`
```
<div className="flex-1 overflow-auto rounded-xl border border-slate-700/60">
  <table className="w-full text-sm border-collapse">
```
**Qué rompe:** La tabla tiene 7 columnas (Fecha, Tipo, Categoría, Potrero, Descripción, Monto, Acciones) con anchos explícitos `w-28`, `w-24`, `w-44`, `w-36`, `w-36`, `w-24`. El total mínimo supera 375px. Hay `overflow-auto` en el wrapper pero no hay indicación visual al usuario de que puede hacer scroll horizontal.
**Fix sugerido:**
- Opción A (rápida): mantener scroll horizontal, agregar `overflow-x-auto` explícito y sombra/indicador de scroll.
- Opción B (mejor UX): ocultar columnas secundarias en mobile:
```tsx
// En th/td de Potrero y Descripción:
className="hidden sm:table-cell ..."
```

---

### ✅ 7. FlujoCajaPage.tsx — Tablas de cobros/pagos pendientes sin collapse mobile
**Archivo:** `frontend/src/pages/FlujoCajaPage.tsx` (componente `PendingTable`)
**Qué rompe:** La tabla de cobros/pagos pendientes tiene columnas `Cliente`, `Vence`, `Días`, `Monto` en horizontal. En mobile (375px) las columnas de texto largo se cortan o desbordan.
**Fix sugerido:**
```tsx
// Convertir a tarjetas en mobile:
<div className="sm:hidden flex flex-col gap-2">
  {items.map(item => <div className="flex justify-between ..."> ... </div>)}
</div>
<table className="hidden sm:table w-full ..."> ... </table>
```

---

### ✅ 8. FlujoCajaPage.tsx — CobrosTab y PagosTab: tablas de CRUD
**Archivo:** `frontend/src/pages/FlujoCajaPage.tsx` (componentes `CobrosTab` / `PagosTab`)
**Qué rompe:** Las tablas de gestión de cobros y pagos tienen columnas `Cliente/Proveedor`, `Concepto`, `Vence`, `Monto`, `Estado`, `Acciones`. En mobile las columnas de fecha y texto se solapan.
**Fix sugerido:** Mismo patrón — ocultar columnas secundarias con `hidden sm:table-cell` o usar layout de tarjeta en mobile.

---

### ✅ 9. ResumenesMensualesPage.tsx — Layout master/detail en mobile
**Archivo:** `frontend/src/pages/ResumenesMensualesPage.tsx`
**Qué rompe:** El layout usa una lista lateral + panel de detalle en desktop. En mobile ambos paneles se apilan, pero el panel de detalle puede aparecer antes de que el usuario seleccione un mes, mostrando un estado vacío confuso.
**Fix sugerido:** En mobile, mostrar solo la lista y navegar al detalle como pantalla completa (o usar tabs para alternar).

---

## MEDIO — grids que no colapsan correctamente

### 10. PerfilPage.tsx — Grid 2 columnas sin breakpoint
**Archivo:** `frontend/src/pages/PerfilPage.tsx`
**Qué rompe:** `grid grid-cols-2 gap-4` para los campos Nombre/Apellido. En 375px cada columna mide ~175px — alcanza pero los inputs quedan muy ajustados, especialmente con labels.
**Fix sugerido:**
```tsx
className="grid grid-cols-1 sm:grid-cols-2 gap-4"
```

---

### 11. ScoreSaludPage.tsx — Grid que salta de 2 a 4 columnas
**Archivo:** `frontend/src/pages/ScoreSaludPage.tsx`
**Qué rompe:** `grid-cols-2 xl:grid-cols-4` — en tablets (768-1280px) queda en 2 columnas (muy espaciado). No hay salto intermedio `md:grid-cols-3` o `lg:grid-cols-4`.
**Fix sugerido:**
```tsx
className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
```

---

### 12. DashboardPage.tsx — KPI cards en mobile
**Archivo:** `frontend/src/pages/DashboardPage.tsx`
**Qué rompe:** Grid de KPIs usa `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`. En mobile (1 columna) ocupa mucho scroll vertical. Las cards de resumen por categoría y por mes pueden tener texto que se corta.
**Fix sugerido:** El colapso a 1 columna está bien. Verificar que las cards tengan `truncate` en textos de nombres de categoría largos.

---

### 13. FlujoCajaPage.tsx — KPI cards del ResumenTab
**Archivo:** `frontend/src/pages/FlujoCajaPage.tsx:638`
```
className="grid grid-cols-1 sm:grid-cols-3 gap-4"
```
**Qué rompe:** Salta directo de 1 a 3 columnas. En tablets angostos (540–640px) las 3 columnas quedan muy estrechas.
**Fix sugerido:**
```tsx
className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
```

---

### 14. CuadernoPage.tsx — Header con múltiples botones en mobile
**Archivo:** `frontend/src/pages/CuadernoPage.tsx`
**Qué rompe:** La barra de acciones del cuaderno tiene botones en `flex` horizontal que en mobile se comprimen (texto se corta o desaparecen labels). La guía WhatsApp usa `grid-cols-3` que en mobile queda muy angosto.
**Fix sugerido:**
```tsx
// Header: flex-col en mobile
className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3"
// Guía WhatsApp:
className="grid grid-cols-1 sm:grid-cols-3 gap-4"
```

---

### 15. ClientesPage.tsx / ProveedoresPage.tsx — Header + tabla
**Archivo:** `frontend/src/pages/ClientesPage.tsx`, `frontend/src/pages/ProveedoresPage.tsx`
**Qué rompe:** Header con `flex justify-between` comprime el título y el botón "Nuevo cliente/proveedor" en una sola línea. Las tablas de clientes/proveedores con columnas Email, Teléfono, Saldo debordan en mobile.
**Fix sugerido:**
```tsx
// Header:
className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between"
// Tabla: ocultar email/teléfono en mobile
className="hidden sm:table-cell"
```

---

## BAJO — detalles de UX en mobile

### 16. RegistrosPage.tsx — Botones de acción en header
**Archivo:** `frontend/src/pages/RegistrosPage.tsx`
**Qué rompe:** Los 4 botones (Exportar, Escanear factura, + Gasto, + Ingreso) en una línea horizontal se comprimen en mobile. "Escanear factura" puede quedar con texto cortado.
**Fix sugerido:**
```tsx
// Agrupar en 2 filas en mobile:
<div className="flex flex-wrap gap-2">
  {/* Los botones primarios en una fila, secundarios en otra */}
</div>
// O: acortar labels: "Exportar" → ícono solo, "Escanear" en vez de "Escanear factura"
```

---

### 17. AsistentePage.tsx — Burbujas de chat muy anchas
**Archivo:** `frontend/src/pages/AsistentePage.tsx`
**Qué rompe:** `max-w-[75%]` en mobile deja espacio adecuado pero en 375px los bloques de código en respuestas IA pueden hacer scroll horizontal dentro de la burbuja sin indicador visible.
**Fix sugerido:**
```tsx
// En el contenido de la burbuja:
className="... prose-pre:overflow-x-auto prose-pre:max-w-full"
// O wrappear código en: overflow-x-auto max-w-full
```

---

### 18. ModalMovimiento.tsx — Grid hardcodeado en modal
**Archivo:** `frontend/src/components/mapa/ModalMovimiento.tsx`
**Qué rompe:** Usa `grid grid-cols-[20px_1fr_90px]` para las filas de animales. La columna fija de 90px (cantidad + unidad) puede ser muy ajustada en mobile si el texto del input es largo.
**Fix sugerido:**
```tsx
// Cambiar a flex gap en mobile:
className="flex items-center gap-2 py-2 sm:grid sm:grid-cols-[20px_1fr_90px]"
```

---

### 19. EscanearFacturaModal.tsx — Drop zone con padding excesivo
**Archivo:** `frontend/src/components/registros/EscanearFacturaModal.tsx`
**Qué rompe:** `px-6 py-10` en la zona de drop hace que el modal sea muy alto en mobile, requiriendo scroll antes de ver los resultados extraídos.
**Fix sugerido:**
```tsx
className="... px-4 py-6 sm:px-6 sm:py-10 ..."
```

---

### 20. MapaPage.tsx — Botón "Movimientos" con posición left-4 fixed
**Archivo:** `frontend/src/pages/MapaPage.tsx:726`
```
className="absolute bottom-4 left-4 z-10 ..."
```
**Qué rompe:** En mobile, cuando el sidebar overlay está abierto, este botón queda detrás del overlay. También, `bottom-4` puede quedar tapado por la barra de navegación del sistema en iOS (safe area).
**Fix sugerido:**
```tsx
className="absolute bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-10 ..."
// Y asegurarse de que z-10 < z-20 (overlay del sidebar)
```

---

### 21. PuntosToolbar.tsx — Toolbar de puntos de interés
**Archivo:** `frontend/src/components/mapa/PuntosToolbar.tsx`
**Qué rompe:** La toolbar flotante con botones de tipo de punto puede solaparse con el PanelLateral en mobile, dejando botones inaccesibles.
**Fix sugerido:** Reposicionar en mobile para que no colisione con el panel lateral (que en mobile es full-width). Podría ir abajo centrado cuando no hay panel abierto.

---

## Resumen de prioridades

| # | Componente | Impacto | Esfuerzo |
|---|-----------|---------|---------|
| 1 | Sidebar alertas panel (`left-64`) | 🔴 Crítico | Bajo |
| 2 | PanelLateral mapa (`w-80` full overlay) | 🔴 Crítico | Medio |
| 3 | MovimientosPanel (`w-72`) | 🔴 Crítico | Bajo |
| 4 | ElementosPanel (ancho fijo) | 🟠 Alto | Bajo |
| 5 | RegistrosFilters (anchos fijos) | 🟠 Alto | Medio |
| 6 | RegistrosTable (7 columnas) | 🟠 Alto | Medio |
| 7–8 | FlujoCajaPage tablas | 🟠 Alto | Alto |
| 9 | ResumenesMensualesPage master/detail | 🟡 Medio | Alto |
| 10 | PerfilPage grid-cols-2 | 🟡 Medio | Bajo |
| 11–13 | Grids sin breakpoints intermedios | 🟡 Medio | Bajo |
| 14–15 | CuadernoPage / ClientesPage headers | 🟡 Medio | Bajo |
| 16–21 | Detalles menores | 🟢 Bajo | Bajo |
