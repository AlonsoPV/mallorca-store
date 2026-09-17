# Productos UX/UI Audit — Pastelería Mallorca

**Fuente:** [docs/auditoria.md](./auditoria.md) (§41 Productos, §77 formato findings)  
**Alcance:** `http://localhost:19488/admin/productos` (+ `/nuevo`, `/:id`, quick-edit)  
**Fecha:** 2026-09-14  
**Base transversal:** [docs/admin-ux-audit.md](./admin-ux-audit.md) · brief [docs/productos.md](./productos.md)

---

## 1. Executive Summary

El módulo Productos **ya opera**: listado con columnas multi-sucursal, chips de vista, bulk, export/import CTA, quick-edit drawer y formulario con sticky actions. El chrome del listado ya usa `AdminPageShell` / `AdminPageHeader` / `AdminTable`.

El bloqueo operativo real es **editar borradores e inactivos**: el form hidrata detalle vía storefront `GET /api/products/:slug`, que 404 si `status !== "active"`. No existe `GET /admin/products/:id`.

Prioridad: arreglar hydrate admin (P0), persistir filtros en URL (P1), filtros categoría/sucursal + stock bajo por `minStock` (P1/P2), unificar chrome del form (P2).

**Conservar:** quick-edit, bulk/export, columnas por sucursal, chips Todos/Activos/Borradores/Stock bajo/Agotados.

---

## 2. Mapas actuales

| Ruta | Componente | Rol |
|------|------------|-----|
| `/admin/productos` | `products-list.tsx` | Lista + bulk + export |
| `/admin/productos/nuevo` | `product-form.tsx` | Alta |
| `/admin/productos/:id` | `product-form.tsx` | Edición |
| (drawer) | `product-quick-edit.tsx` | Quick edit |

**API relevante**

| Método | Path | Nota |
|--------|------|------|
| GET | `/api/admin/products` | Lista admin OK |
| POST/PATCH | `/api/admin/products` | Create/update OK |
| — | `GET /api/admin/products/:id` | **No existe** (OpenAPI solo PATCH) |
| GET | `/api/products/:slug` | Storefront; **solo activos** |

---

## 3. Findings

### P0-01 — Editar borrador/inactivo deja form vacío o incompleto

**Dónde:** `/admin/productos/:id` · `product-form.tsx`

**EVIDENCIA:** Form resuelve producto con `useListAdminProducts` + `find(id)`, luego hidrata detalle con `useGetProduct(slug)`. Storefront (`storefront.ts` ~154–157): `if (!product || product.status !== "active")` → 404.

**IMPACTO:** Operadores no pueden corregir borradores ni reactivar archivados desde la ficha. Rompe operación diaria.

**PROPUESTA:** `GET /admin/products/:id` devolviendo `ProductDetail` sin filtro de status; form usa ese hook y deja de llamar storefront.

**PRIORIDAD:** P0 · **ESFUERZO:** M

---

### P1-01 — Sin get-by-id admin; edit escanea lista completa

**Dónde:** `product-form.tsx` · OpenAPI `/admin/products/{id}`

**EVIDENCIA:** `existingProduct = adminProducts?.find(p => p.id === Number(id))`. Lista completa en cada edición. OpenAPI solo define `patch` en ese path.

**IMPACTO:** Latencia y fallo si el producto no viene en la primera página/filtro de lista; no escala.

**PROPUESTA:** Endpoint + `useGetAdminProduct(id)`.

**PRIORIDAD:** P1 · **ESFUERZO:** M

---

### P1-02 — Filtros de listado no persisten en URL

**Dónde:** `products-list.tsx`

**EVIDENCIA:** `useState` local para `search`, `view`; sin `?view=&q=`. Al volver de editar se pierden (§61 auditoria).

**IMPACTO:** Re-filtrar en cada ida/vuelta; más clics en workflow diario.

**PROPUESTA:** Sync `view`, `q`, `categoryId`, `branchId` ↔ query string; links Editar preservan query al volver (o history back).

**PRIORIDAD:** P1 · **ESFUERZO:** S

---

### P1-03 — Archivar sin confirmación

**Dónde:** acciones de fila en listado

**EVIDENCIA:** `onClick={() => archive(product.id)}` directo. Auditoria §28: sí confirmar Archivar.

**IMPACTO:** Archivo accidental; reversible pero con fricción.

**PROPUESTA:** `window.confirm` o dialog corto antes de PATCH inactive.

**PRIORIDAD:** P1 · **ESFUERZO:** S

---

### P2-01 — Filtros categoría / sucursal ausentes en lista

**Dónde:** `products-list.tsx` filter bar

**EVIDENCIA:** Solo chips de vista + búsqueda. Brief productos.md y auditoria §14 piden Categoría y Sucursal.

**IMPACTO:** Escaneo lento en catálogos grandes; no alinear con Inventario filtrado.

**PROPUESTA:** `AdminFilterSelect` categoría + sucursal; chips activos + Limpiar.

**PRIORIDAD:** P2 · **ESFUERZO:** S

---

### P2-02 — Stock bajo hardcode ≤5

**Dónde:** `filtered` en `products-list.tsx` (~122–125)

**EVIDENCIA:** `a.inventory <= 5`. `ProductAvailability` incluye `minStock` en API/list cards.

**IMPACTO:** Falsos positivos/negativos vs umbral real por sucursal.

**PROPUESTA:** `inventory > 0 && inventory <= (minStock ?? 5)`.

**PRIORIDAD:** P2 · **ESFUERZO:** S

---

### P2-03 — Form chrome “catálogo cream” vs shell ops

**Dónde:** `product-form.tsx`

**EVIDENCIA:** `#FBFAF7`, `#E8DED0`, `#D43B2B`, `#25211E` hardcode; listado ya migró a tokens/`AdminPage*`.

**IMPACTO:** Sensación de dos apps (hallazgo transversal familia “Catálogo cream”).

**PROPUESTA:** `AdminPageShell`/`AdminPageHeader`; bordes `border-border`; CTA `Button` default; sticky footer neutro.

**PRIORIDAD:** P2 · **ESFUERZO:** M

---

### P2-04 — Progressive disclosure incompleto

**Dónde:** `product-form.tsx` · flag `showAdvanced`

**EVIDENCIA:** Toggle binario oculta bloques; no hay secciones claras Básico / Operación / Comercial / Avanzado (§17 auditoria). Alta ya tipa “Alta rápida” pero editar abre avanzado por defecto.

**IMPACTO:** Alta &lt; 2 min OK si se mantiene simple; edición sigue cognitiva alta (~1.2k líneas).

**PROPUESTA:** Secciones con headings + disclosure; alta arranca Básico; editar puede abrir Operación visible, Avanzado colapsado.

**PRIORIDAD:** P2 · **ESFUERZO:** M

---

### P2-05 — Cuatro botones por fila (no menú ⋯)

**Dónde:** acciones listado

**EVIDENCIA:** Editar + More (quick-edit) + Duplicar + Archivar visibles. Auditoria §13: primaria + menú secundario.

**IMPACTO:** Ruido visual; More no es menú, es quick-edit.

**PROPUESTA:** Editar + Quick-edit visibles; Duplicar/Archivar en DropdownMenu ⋯ (o confirmar Archivar y dejar Duplicar en menú).

**PRIORIDAD:** P2 · **ESFUERZO:** S

---

### P3-01 — Empty / labels menores

**Dónde:** lista

**EVIDENCIA:** `AdminEmptyState` ya presente con CTA. Estado mostrado como `capitalize` raw (`active`/`draft`).

**IMPACTO:** Menor; polish.

**PROPUESTA:** Labels ES (Activo / Borrador / Inactivo); empty con Importar secundario si aplica.

**PRIORIDAD:** P3 · **ESFUERZO:** S

---

### P3-02 — Quick-edit: feedback genérico

**Dónde:** `product-quick-edit.tsx`

**EVIDENCIA:** Toast “Cambios guardados”; no detalla stock por sucursal (§29).

**IMPACTO:** Bajo; patrón drawer es bueno (no tocar estructura).

**PROPUESTA:** Opcional toast “Inventario Reforma: 8 → 12” cuando cambie stock. Diferir si no hay tiempo.

**PRIORIDAD:** P3 · **ESFUERZO:** S

---

## 4. Qué ya funciona (no rehacer)

| Pieza | Motivo |
|-------|--------|
| Quick-edit drawer | Patrón contextual excelente (audit transversal) |
| AdminPageShell + AdminTable sticky thead en lista | Fase A parcial hecha |
| Bulk + export reimportable + CTA Importar | Ops reales |
| Columnas stock por sucursal + promo | Alineado a brief |
| Sticky footer Guardar borrador / Publicar | Cumple §25 |
| Debounce búsqueda 400ms | Cumple §16 |

---

## 5. Click-count (workflows Productos)

| Workflow | Hoy (est.) | Meta |
|----------|------------|------|
| Buscar producto | 1 (nav) + tipeo | 1–2 |
| Quick-edit stock | Lista → ⋯ → editar → Guardar ≈ 3–4 | ≤ 3 |
| Crear producto básico | Lista → Añadir → campos → Publicar ≈ 2 + form | &lt; 2 min |
| Editar borrador | Lista → Editar → **falla hydrate** | 2 + form completo |
| Exportar | Lista → Exportar ≈ 2 | 1–2 |

---

## 6. Top 5 quick wins (orden de implementación)

1. **GET admin product + form hydrate** (P0/P1) — desbloquea edición.
2. **URL filters** `view`/`q`/`categoryId`/`branchId` (P1).
3. **Confirm archivar** + labels estado ES (P1/P3).
4. **Filtros categoría/sucursal + minStock** (P2).
5. **Form chrome + secciones** (P2) — sin rewrite de lógica de negocio.

---

## 7. Roadmap de este doc

| Fase | Entrega |
|------|---------|
| 1 | Este documento |
| 2 | Listado: URL, filtros, minStock, confirm, polish |
| 3 | `GET /admin/products/:id` + form hydrate + UX shell/secciones |

Fuera de alcance ahora: módulo Promociones standalone, rewrite import wizard, hard delete.
