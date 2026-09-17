# Admin UX/UI Audit — Pastelería Mallorca

**Fuente:** [docs/auditoria.md](./auditoria.md)  
**Alcance:** `http://localhost:19488/admin` · frontend `artifacts/mallorca-ecommerce`  
**Fecha:** 2026-09-14  
**Fase:** 1 — Auditar antes de modificar (sin refactor)

---

## 1. Executive Summary

El Admin **ya cubre la operación** (pedidos, agenda, productos, inventario, sucursales, alertas, import, reportes). No falta capacidad primaria: falta **un solo producto**.

Hoy coexisten **tres familias visuales/UX**:

| Familia | Pantallas | Señal |
|---------|-----------|--------|
| Ops sharp / serif | Pedidos, Agenda, detalle pedido, **Inventario (parcial)** | `font-serif text-3xl`, `rounded-none`, `AdminPageShell` |
| Catálogo cream | Productos, ficha producto, Importar | `#FBFAF7` / `#E8DED0`, headers sticky `px-8 py-6` |
| Utilitario sans | Alertas, Reportes, Responsables | `text-3xl font-bold` o Cards |

**Sucursales** queda a medias (serif + cards `rounded-xl`).

**Riesgo operativo:** estados vacíos/loading/error aún irregulares en Alertas/Reportes/Responsables. **Inventario ya migró** a `AdminPageShell` + loading/error/empty + CTA Importar (live 2026-09-14). Quedan: contexto `?branchId=` roto desde Sucursal, toast genérico al ajustar stock, matriz lenta, columnas de acción fuera de viewport.

**Recomendación:** no rehacer pantallas sanas (pedido nuevo, Inventario list chrome, hub sucursal). Unificar **shell** en el resto y cerrar fricción de contexto sucursal.

---

## 2. Current Information Architecture

```
/admin                          Dashboard
├── /pedidos                    Lista
│   ├── /nuevo                  Alta manual
│   └── /:id                    Detalle
├── /agenda                     Operacional (día)
├── /productos                  Lista + quick-edit
│   ├── /nuevo                  Formulario
│   └── /:id                    Formulario
├── /inventario                 Lista / matriz
├── /sucursales                 Lista cards
│   ├── /nueva                  Wizard
│   ├── /:id                    Hub operacional
│   └── /:id/editar             Wizard
├── /alertas                    Centro alertas
└── Configuración (colapsable)
    ├── /importar
    ├── /reportes
    └── /responsables
```

**Sidebar** (`admin-layout.tsx`): Operación = Inicio → Pedidos → Agenda → Productos → Inventario → Sucursales → Alertas (+ badge). Config = Importar, Reportes, Responsables.

**Alineación vs brief:** casi correcta. Falta “Promociones” como área propia (vive dentro de ficha producto). “Nuevo X” ya es CTA de página, no nav — bien.

---

## 3. Navigation Problems

| PROBLEMA | Dónde | EVIDENCIA | IMPACTO | PROPUESTA | PRI | ESF |
|----------|-------|-----------|---------|-----------|-----|-----|
| Active state demasiado amplio | Sidebar | `location.startsWith(href)` hace que `/admin/pedidos/nuevo` active Pedidos (OK) pero también puede confundir anidados | Orientación OK en general | Mantener; opcional exact match en hojas | P3 | S |
| Doble gate de acceso | Guard + Layout | `admin-guard.tsx` + rol en `admin-layout.tsx` | Flash “denegado” / lógica duplicada | Un solo gate | P2 | S |
| Importar oculto | Config | Ruta crítica de ops en “Más” | Operadores no lo encuentran | Mantener en config pero CTA desde Inventario/Productos | P1 | S |
| Sin Promociones en IA | Nav | Solo en product-form | Gestión promo poco descubrible | Entrada “Promociones” o filtro en Productos | P2 | M |
| Auth local → /cuenta | Live | `/sign-in` redirige a cuenta; `/admin` puede caer a storefront sin rol claro en sesión | Fricción al entrar al Admin | Revisar redirect post-login local → `/admin` si rol ops | P1 | S |

---

## 4. Layout Problems

| PROBLEMA | Dónde | EVIDENCIA | IMPACTO | PROPUESTA | PRI | ESF |
|----------|-------|-----------|---------|-----------|-----|-----|
| max-width inconsistente | Varias | Dashboard `max-w-7xl`; agenda/branch-form `max-w-4xl`; order-detail `max-w-3xl`; listas full-bleed | Tablas ahogadas o detalle demasiado ancho | List/ops: full (~1600–1800); reading: `max-w-3xl`; forms: `max-w-4xl/5xl` tipados | P1 | M |
| Page chrome desigual | Productos vs Pedidos | `px-8 py-6 border-b` vs `p-6 md:p-10` | Sensación de apps distintas | `AdminPageHeader` + `AdminPageShell` | P1 | M |
| Dashboard tipo “cards marketing” | `/admin` | ActionCards + tiles | Pierde densidad operativa | Mantener KPIs compactos; menos card theater | P2 | M |

---

## 5. Spacing Problems

| PROBLEMA | Dónde | EVIDENCIA | IMPACTO | PROPUESTA | PRI | ESF |
|----------|-------|-----------|---------|-----------|-----|-----|
| Tres paddings de página | Global | `p-6 md:p-10` / `p-8` / `p-4 md:p-6` (order-new) | Ritmo visual irregular | Scale: page `24/40`, section `16/24`, row `12` | P1 | S |
| Headers altos en catálogo | productos | Sticky `py-6` + body `p-8` | Mucho scroll antes de tabla | Header `py-4`, título 28px | P2 | S |
| Valores brand hardcode | productos/import | `#E8DED0`, `#25211E`, `#D43B2B` | Tokens rotos / dark mode frágil | Mapear a CSS variables existentes | P2 | M |

---

## 6. Density Problems

| PROBLEMA | Dónde | EVIDENCIA | IMPACTO | PROPUESTA | PRI | ESF |
|----------|-------|-----------|---------|-----------|-----|-----|
| Sucursales en cards | branches.tsx | `rounded-xl … p-5` stack | Poca densidad vs pedidos | Tabla + fila expandible o card compacta | P1 | M |
| Agenda en cards | agenda.tsx | Bloques por hora | Escaneo lento del día | Filas densas agrupadas por hora | P2 | M |
| Inventario aireado | inventory.tsx | `p-3` + rounded | OK pero distinto a pedidos | Unificar row height 48–56px | P2 | S |
| Reportes solo metric cards | reports.tsx | Grid Card | Poco accionable | Cards + link a inventario/pedidos filtrados | P2 | S |

---

## 7. Functional Friction

| PROBLEMA | Dónde | EVIDENCIA | IMPACTO | PROPUESTA | PRI | ESF |
|----------|-------|-----------|---------|-----------|-----|-----|
| Alertas sin empty visible | alerts.tsx | `AlertSection` retorna `null` | Pantalla en blanco | Empty state + CTA Inventario | P0 | S |
| ~~Inventario sin loading/error~~ | inventory.tsx | **RESUELTO** live: `AdminLoading` / `AdminError` / empty+CTA | — | — | ✓ | — |
| Contexto sucursal **no se aplica** en Inventario | inventory.tsx + branch-detail | Hub linkea `?branchId=` pero página solo lee `state` de URL; `branchId` state inicia en `"all"` | Operador re-elige sucursal; rompe auditoria §4 | Leer `branchId` (y sync a URL) | P0 | S |
| Toast stock genérico | inventory `change()` | `"Inventario actualizado"` vs brief “8 → 12” | Sin confirmación cognitiva del delta | Toast: `{producto} · {sucursal}: {antes} → {después}` | P1 | S |
| Matriz lenta / cuelga loading | Live Vista matriz | Quedó en “Cargando matriz…” | Vista ops inutilizable | Timeout + error; paginar/cache | P1 | M |
| Acciones (± / Alerta) fuera de viewport | Live lista | Scroll H; columnas Acciones/Estado al final | Ajuste stock más lento | Sticky Acciones o ± junto a Stock | P1 | S |
| Input stock `defaultValue` stale | inventory.tsx | Tras mutate, input no remount | Valor UI desfasado del server | `key={stock}` o controlled | P1 | S |
| Responsables sin load/empty | responsibles.tsx | Solo toasts | Ops ciega | List states | P1 | S |
| Promos solo en ficha | product-form | Nested | Flujo largo | Quick promo desde lista | P2 | L |

---

## 7b. Deep dive — Inventario (`/admin/inventario`)

**Live:** `http://localhost:19488/admin/inventario` (2026-09-14)  
**Código:** `pages/admin/inventory.tsx` + `components/admin/*`

### Test 5s / 30s (auditoria §75)

| Pregunta | Resultado |
|----------|-----------|
| ¿Dónde estoy? | Sí — título Inventario + nav activa |
| ¿Qué veo? | Existencias por sucursal/producto |
| ¿Acción principal? | Parcial — Importar + Matriz; ajustar stock está en fila |
| ¿Qué necesita atención? | Débil — no hay KPI “X stock bajo” en header |
| ¿Completar ajuste en 30s? | Sí (± o input) **si** la fila está visible |

### Alineación con patrón de página (auditoria §5)

| Elemento | Estado |
|----------|--------|
| Page header título + desc | Sí (`AdminPageHeader` serif) |
| Acciones principales | Sí: Importar stock, Vista matriz |
| Filtros | Sí: búsqueda + sucursal + estado + categoría (`AdminFilterBar`) |
| Contenido principal | Tabla densa lista / matriz |
| Loading / error / empty | Sí (mejora vs auditoría previa) |
| CTA empty → Importar | Sí |

### Qué está bien (conservar)

- Existencias **por sucursal** visibles (Stock / Reservado / Disponible / Mínimo).
- Ajuste inline (± con `aria-label` + input numérico).
- CTA **Importar stock** en página (ya no solo en Más).
- Deep link dashboard `?state=LOW_STOCK` leído en init.
- Shell unificado con Pedidos (`AdminPageShell`).

### Findings Inventario (formato §77)

**INV-01 — Contexto sucursal ignorado (P0 / S)**  
- Dónde: Inventario + Sucursal hub  
- Evidencia: `branch-detail.tsx` → `/admin/inventario?branchId=`; `inventory.tsx` solo `stateFromSearch` para `state`  
- Impacto: rompe “no volver a preguntar sucursal”  
- Propuesta: init `branchId` desde query; escribir query al cambiar filtro  

**INV-02 — Feedback de ajuste opaco (P1 / S)**  
- Dónde: `change()` toast  
- Evidencia: título fijo “Inventario actualizado”  
- Impacto: sin verificación del delta; riesgo de error silencioso  
- Propuesta: toast con producto, sucursal y antes→después; opcional undo  

**INV-03 — Columnas de acción lejos (P1 / S)**  
- Dónde: tabla lista  
- Evidencia: live scroll horizontal; Acciones al final  
- Impacto: >15s meta de actualización si hay que scrollear  
- Propuesta: ± adyacente a Stock; sticky last col  

**INV-04 — Matriz performance (P1 / M)**  
- Dónde: Vista matriz  
- Evidencia: live “Cargando matriz…” persistente  
- Impacto: feature ops inutilizable  
- Propuesta: loading timeout → AdminError; virtualizar; no bloquear filtros  

**INV-05 — Input uncontrolled stale (P1 / S)**  
- Dónde: `defaultValue={stock}`  
- Evidencia: código; tras ± blur puede mostrar valor viejo  
- Impacto: desconfianza en el número  
- Propuesta: `key={`${id}-${stock}`}` o value controlado  

**INV-06 — Filtros wrap / jerarquía (P2 / S)**  
- Dónde: `AdminFilterBar` flex-wrap  
- Evidencia: live — search + selects en 2 filas  
- Impacto: menor densidad visual  
- Propuesta: fila única en md+; search `flex-1 min-w-[12rem]`  

**INV-07 — Sin resumen de atención (P2 / S)**  
- Dónde: header Inventario  
- Evidencia: no hay “4 stock bajo”  
- Impacto: no cumple “qué necesita atención” en 5s  
- Propuesta: pills contadores que setean filtro estado  

### Metas velocidad (auditoria §74)

| Meta | Live |
|------|------|
| Actualizar stock &lt; 15s | Alcanzable con ± si fila visible; degradado si Acciones off-screen |
| Importar &lt; 2 min | CTA presente → `/admin/importar` (flujo import no re-auditado aquí) |
| Stock bajo desde dashboard | `?state=LOW_STOCK` OK; falta paridad `?branchId=` |

---

## 8. Inconsistent Components

- **Filtros:** shadcn `Select` (pedidos/agenda) vs `<select>` nativo (alertas/responsables/order-new) vs `FilterSelect` local (inventario).
- **Tablas:** 3 skins; `ui/table.tsx` **no se usa**.
- **Títulos:** serif 3xl / serif 2xl / sans bold 3xl.
- **Corners:** `rounded-none` (ops+catálogo) vs `rounded-lg/xl` (utilitario/sucursales).
- **Empty:** icon box / dashed CTA / plain text / null.
- **Tabs:** custom en branch-detail; `ui/tabs` no usado.

---

## 9. Redundant Components

| Pieza | Duplicada en | Consolidar a |
|-------|--------------|--------------|
| FilterSelect / native selects / Select | inventory, alerts, orders | `AdminFilterBar` + Select shadcn |
| DataTable local | branch-detail | `AdminTable` compartido |
| ActionCard | dashboard | KPI `Stat`/`Metric` reutilizable |
| Chip filters | orders, products, import | `FilterChips` |
| Page headers | todas | `AdminPageHeader` |

---

## 10. Responsive Problems

- Sidebar sticky desktop; en mobile es stack vertical (OK) pero **ocupa altura** antes del contenido.
- Tablas sin sticky header en la mayoría → scroll horizontal sin ancla.
- Product form grids OK; order-new denso en mobile (aceptable para ops).
- Branch cards en mobile bien; dashboard ActionCards apilados OK.

**Prioridad:** sticky thead en pedidos/inventario/productos (P1).

---

## 11. Accessibility Problems

| Issue | Dónde | PRI |
|-------|-------|-----|
| Icon buttons sin label ocasional | inventory ± | P1 |
| Tablas sin caption / scope | varias | P2 |
| Color-only status chips | orders/products | P2 |
| Focus rings inconsistentes (brand vs default) | catalog | P2 |
| Alertas vacías = sin mensaje para SR | alerts | P0 |

---

## 12. Performance / perceived performance

- Listas sin skeleton unificado (productos sí; inventario no).
- Dashboard múltiples queries en paralelo (OK) pero sin progressive reveal claro.
- Quick-edit sheet: buen patrón percibido (no full navigation).
- Import wizard: feedback fuerte (conservar).

---

## 13. Top 10 workflows (importancia operativa)

1. Ver / atender pedidos de hoy  
2. Cambiar estado de pedido  
3. Agenda del día por sucursal  
4. Actualizar stock (± / cantidad)  
5. Resolver / atender alerta  
6. Buscar producto y quick-edit  
7. Crear producto básico  
8. Pedido manual  
9. Operación de sucursal (hub)  
10. Importar inventario  

---

## 14. Click count (estado actual, estimado)

| Workflow | Clicks / pasos hoy | Meta brief |
|----------|--------------------|------------|
| Pedidos hoy | 1 (Pedidos) + filtro día si no default | &lt; 10s |
| Cambiar estado | Detalle → control estado ≈ 2–3 | 1–2 |
| Stock ± | Inventario → ± ≈ 2 | &lt; 15s |
| Generar alerta | Inventario → Alerta → dialog ≈ 3–4 | &lt; 10s |
| Nuevo producto | Productos → Nuevo → form largo | &lt; 2 min básico |
| Pedido manual | Pedidos → Nuevo → form denso | 2–3 min |
| Hub sucursal | Sucursales → card → hub ≈ 2 | 1 clic ideal |
| Import inventario | Más → Importar → modo → upload | &lt; 2 min |

---

## 15. Quick Wins (P0–P1, esfuerzo S)

1. **Inventario:** leer/escribir `?branchId=` (INV-01).  
2. Empty + loading + error en **Alertas**.  
3. Toast stock con delta (INV-02) + `key` en input (INV-05).  
4. ± sticky / junto a Stock (INV-03).  
5. Matriz: timeout + error (INV-04).  
6. Sticky thead en pedidos/productos/inventario.  
7. Redirect login local → `/admin` si rol admin/ops.  
8. Contadores “stock bajo / agotado” en header Inventario (INV-07).  

---

## 16. Structural Improvements

1. Extraer design tokens admin (spacing, type scale, table).  
2. `AdminPageShell` / `AdminTable` / `AdminFilterBar`.  
3. Contexto sucursal en URL (`?branchId=`).  
4. Mover Importar discovery a Inventario/Productos.  
5. Tabla para Sucursales (cards opcionales en mobile).  
6. Dashboard → “cola de trabajo” (pedidos + alertas + stock) sobre marketing cards.  

---

## 17. Proposed Design System / tokens (admin)

```
--admin-space-1: 4px
--admin-space-2: 8px
--admin-space-3: 12px
--admin-space-4: 16px
--admin-space-5: 24px
--admin-space-6: 32px

Page padding: 24px / md 40px
Title: 28–32px (serif display o sans semibold — elegir UNO)
Desc: 14px muted, max 2 líneas
Row height table: 52px
Radius: 0 (ops) OR 6px — elegir UNO para admin
Primary CTA: filled; secondary: outline; danger: destructive
```

Conservar acento Mallorca rojo; abandonar hex sueltos en favor de variables.

---

## 18. Proposed layout patterns

| Tipo | Patrón |
|------|--------|
| LIST | Header + filters sticky + full-width table |
| DETAIL | Header + back + 1–2 columnas; max-w-3xl–4xl |
| CREATE | Header sticky acciones; form max-w-5xl |
| OPERATIONAL | Full bleed; filtros densos; matrix/agenda |
| DASHBOARD | KPI row compacta + work queue table |

---

## 19. Components to consolidate

1. `AdminPageHeader`  
2. `AdminFilterBar`  
3. `AdminTable` (usar `ui/table` o wrapper)  
4. `AdminEmptyState` / `AdminLoading` / `AdminError`  
5. `StatusBadge`  
6. `BranchContextSelect` (shared)  

---

## 20. Screens requiring redesign (no rewrite total)

| Pantalla | Motivo |
|----------|--------|
| Dashboard | Baja densidad operativa |
| Sucursales list | Cards → tabla |
| Alertas | Empty/feedback + densidad |
| Inventario | **Chrome OK**; pulir contexto URL, toast, matriz, sticky acciones |
| Reportes | Más accionable |
| Responsables | Subir calidad al nivel ops |

---

## 21. Screens that should NOT be touched (solo shell)

| Pantalla | Motivo |
|----------|--------|
| Pedido nuevo (`order-new`) | Flujo denso ya operativo |
| Pedido detalle | Lectura clara |
| Product quick-edit | Excelente patrón contextual |
| Hub sucursal (`branch-detail`) | Mejor empty/CTA del admin |
| Import wizard | Feedback fuerte |
| Product form (lógica) | Complejo; solo unificar chrome externo |

---

## Roadmap propuesto (post-auditoría)

### FASE A — Consistencia global — HECHA (2026-09-14)
Shell compartido en `src/components/admin/`: `AdminPageShell`, `AdminPageHeader`, `AdminFilterBar`/`AdminFilterSelect`, `AdminTable`, `AdminEmptyState`, `AdminLoading`, `AdminError`.

Aplicado a: Alertas (empty visible), Inventario (+ CTA Importar), Productos (sin cream), Pedidos, Sucursales, Reportes, Responsables, Dashboard.

### FASE B — Operación crítica — HECHA (2026-09-16)
- Dashboard: KPIs compactos + colas (próximos pedidos, alertas abiertas, stock a revisar) + lista densa por sucursal.
- Helper `src/lib/admin-search-params.ts`; Pedidos / Inventario / Alertas sincronizan `?branchId=` (y filtros clave) con sticky filters.
- Agenda: densidad (`space-y-3`, título hora `text-lg`).
- Alertas: deep-link Stock → inventario con `branchId`.

### FASE C — Catálogo
Productos list chrome · Import CTAs · Promos discoverability.

### FASE D — Config
Sucursales tabla · Responsables · Reportes accionables.

---

## Apéndice — Inventario de rutas

Ver exploración en código: `App.tsx` + `pages/admin/*` (17 rutas, 1 drawer no ruteado).

**Patrones a conservar:** quick-edit, pedido manual denso, hub sucursal, import steps, badge alertas OPEN.
