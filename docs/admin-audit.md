# ADMIN AUDIT

Auditoría integral del panel Admin — Pastelería Mallorca (ecommerce multi-sucursal).  
Fuente: código en `artifacts/mallorca-ecommerce` + `artifacts/api-server` + `lib/api-spec/openapi.yaml`.  
Criterio: operar sin explicación técnica; acciones frecuentes rápidas; complejidad debajo de la UI.

---

## 1. Executive Summary

El Admin **funciona como consola operativa de catálogo, stock, pedidos e importación**, con roles y scoping por sucursal coherentes en backend. No es un rediseño visual “roto”: el problema principal es **carga cognitiva, flujos incompletos y pantallas que no ayudan a decidir**.

**Score general: 5.8 / 10**

| Fortalezas | Debilidades |
|---|---|
| Inventario con edición inline + matriz | Alta de producto monolítica (~1100 líneas) |
| Import CSV/XLSX con preview | Dashboard informativo, poco accionable |
| Scoping API (`canAccessBranch`) | Detalle de sucursal = dump JSON |
| Pedidos: cambio de estado en lista | Sin Agenda / producción cronológica |
| Promociones en API + formulario | Sin módulo Clientes; sin detalle de pedido |

Una persona nueva puede **publicar productos y ajustar stock**, pero se pierde en el formulario de producto, no tiene agenda del día, y el hub de sucursal no es operable.

---

## 2. Arquitectura actual

```
ADMIN
├── Resumen (/admin)
│   ├── métricas: productos, activos, sucursales, bajo stock
│   └── tabla estado por sucursal
├── Productos (/admin/productos)
│   ├── listado + búsqueda + filtro estado
│   ├── Nuevo (/admin/productos/nuevo)  ← también en nav
│   └── Editar (/admin/productos/:id)
│       ├── info / precios / contenido / imágenes
│       ├── promociones programadas
│       └── disponibilidad por sucursal
├── Pedidos (/admin/pedidos)
│   ├── filtros sucursal + estado
│   └── cambio de estado inline
├── Inventario (/admin/inventario)
│   ├── lista + filtros
│   └── vista matriz producto × sucursal
├── Importar (/admin/importar)  ← solo productos
├── Sucursales (/admin/sucursales)
│   ├── listado + edición ligera
│   └── detalle (/admin/sucursales/:id) tabs → JSON
├── Alertas (/admin/alertas)
├── Reportes (/admin/reportes)
└── Responsables (/admin/responsables)
```

**Nav exacta** (`admin-layout.tsx`): Resumen · Productos · Nuevo Producto · Pedidos · Inventario · Importar · Sucursales · Alertas · Reportes · Responsables.

**API con UI ausente:** `GET /admin/inventory/movements`, import de inventario (`/admin/inventory/import*`).

**Roles UI + API (misma allowlist):** `staff`, `branch_manager`, `operations_manager`, `operations`, `manager`, `admin`.  
Globales (todas las sucursales): `admin`, `operations_manager`, `operations`, `manager`.  
Acotados por asignación: `staff`, `branch_manager`.

---

## 3. Principales flujos (jobs-to-be-done)

### JOB 1 — Crear producto y publicarlo en Reforma

| | |
|---|---|
| **Inicio** | Nav “Nuevo Producto” o CTA listado |
| **Pantallas** | 1 formulario largo + diálogo confirmar |
| **Clics** | ~15–25 (campos + sucursal + guardar + confirmar) |
| **Fricción** | Todo visible a la vez; slug/SKU técnicos; promociones y overrides mezclados |
| **Resultado** | `POST /admin/products` (requiere rol global) |

### JOB 2 — Carga masiva

| | |
|---|---|
| **Inicio** | `/admin/importar` |
| **Flujo** | Archivo → mapeo → preview → confirmar → resultado |
| **Fricción** | Solo productos (no inventario); mapeo exige disciplina de columnas |
| **Resultado** | Bueno si el archivo es correcto; errores por fila visibles |

### JOB 3 — Actualizar stock Reforma

| | |
|---|---|
| **Inicio** | `/admin/inventario` |
| **Clics** | 2–4 (filtro + editar celda / ±) |
| **Fricción** | Baja — mejor flujo del Admin |
| **Resultado** | `POST /admin/inventory/update` |

### JOB 4 — Stock crítico

| | |
|---|---|
| **Inicio** | Resumen “Bajo Inventario” o `/admin/alertas` |
| **Fricción** | Dashboard no lleva a acción clara; alertas read-only y campos frágiles |
| **Resultado** | Ver, no resolver en un clic |

### JOB 5 — Pedidos de Lomas hoy

| | |
|---|---|
| **Inicio** | `/admin/pedidos` |
| **Fricción** | Hay filtro sucursal/estado; **no hay filtro fecha “hoy”**; no hay detalle ni `scheduledStart` confiable en UI |
| **Resultado** | Lista parcial para operación diaria |

### JOB 6–8 — Precio / promoción / desactivar en una sucursal

Todo pasa por **ficha completa de producto**. No hay inline en listado. Promoción no es módulo independiente.

### JOB 9 — Agenda de producción mañana

**No existe** ruta ni página.

### JOB 10 — Responsable de sucursal

Existe `/admin/responsables` (assignments + category responsibles). Separado del detalle de sucursal → fragmentación.

---

## 4. Problemas críticos

### P0

**PROBLEMA:** Detalle de sucursal no es operable (dump JSON).  
**EVIDENCIA:** `branch-detail.tsx` renderiza `JSON.stringify` en tabs; API sí arma payload rico en `admin.ts` (~425–436).  
**IMPACTO:** El hub “toda la operación de una sucursal” del brief no existe en UI.  
**RECOMENDACIÓN:** Tabs reales (general, horarios, productos, inventario, pedidos, alertas, config) reusando listados filtrados.  
**PRIORIDAD:** P0

**PROBLEMA:** No hay Agenda / producción por fecha-hora.  
**EVIDENCIA:** Sin ruta en `App.tsx`; pedidos sin filtro por `scheduledStart` usable.  
**IMPACTO:** JOB 9 imposible; cocina/pastelería opera a ciegas.  
**RECOMENDACIÓN:** Vista Agenda: Sucursal + Fecha → slots con pedidos y líneas.  
**PRIORIDAD:** P0

### P1

**PROBLEMA:** Alta/edición de producto con exceso de carga cognitiva.  
**EVIDENCIA:** `product-form.tsx` (~1100+ líneas): info, precios, imágenes, promociones, overrides por sucursal, atributos en una sola página.  
**IMPACTO:** Alta simple > 2 minutos; errores humanos; rechazo de staff no técnico.  
**RECOMENDACIÓN:** Progressive disclosure: “Alta rápida” (nombre, categoría, precio, sucursales, stock, imagen, publicar) + “Avanzado”.  
**PRIORIDAD:** P1

**PROBLEMA:** Pedidos: UI ofrece todos los estados; backend valida transiciones y responde 409.  
**EVIDENCIA:** `orders-list.tsx` Select completo vs `admin.ts` mapa `valid` (~372).  
**IMPACTO:** Errores confusos; sensación de “no funciona”.  
**RECOMENDACIÓN:** Select solo con siguientes estados válidos + toast claro.  
**PRIORIDAD:** P1

**PROBLEMA:** Mismatch notificaciones sucursal WhatsApp vs API `inApp`.  
**EVIDENCIA:** UI `branches.tsx` envía preferencias WhatsApp; schema backend `email` / `inApp`.  
**IMPACTO:** Preferencias no persisten como el usuario cree.  
**RECOMENDACIÓN:** Alinear contrato OpenAPI + UI.  
**PRIORIDAD:** P1

**PROBLEMA:** Dashboard no prioriza acción.  
**EVIDENCIA:** `dashboard.tsx` — cards de conteo; CTA solo “Nuevo Producto”; low stock sin deep-link a inventario filtrado.  
**IMPACTO:** No responde “qué hacer ahora”.  
**RECOMENDACIÓN:** Bloques acción: N alertas → Revisar inventario; N pedidos pendientes → Ver pedidos.  
**PRIORIDAD:** P1

---

## 5. Fricciones UX

| Fricción | Evidencia | Impacto |
|---|---|---|
| “Nuevo Producto” duplicado en nav y listado | `admin-layout.tsx` + `products-list.tsx` | Ruido en IA |
| Copy hardcode “Lomas y Reforma” | `products-list.tsx` ~57 | No escala a más sucursales |
| Listado productos sin columnas por sucursal / promo | Solo precio + estado | No se ve disponibilidad multi-sede |
| Alertas read-only + `any` / fallbacks | `alerts.tsx` | Poca confianza; no “resolver” |
| Import inventario API sin UI | OpenAPI vs ausencia de hooks en ecommerce | Duplicidad mental vs Importar productos |
| Pedidos: columnas customer duplicadas / casts `any` | `orders-list.tsx` | Claridad baja |
| Sin empty states accionables en varios módulos | reports, matrix | “No data” implícito |

---

## 6. Problemas funcionales

| Ítem | Estado |
|---|---|
| Inventario inline / matriz | Funcional y útil |
| Import productos | Funcional (roles globales) |
| Promociones | Funcional vía ficha producto |
| Branch detail | UI placeholder |
| Order detail | No existe |
| Filtro pedidos por fecha | No existe |
| Historial movimientos inventario | API sí, UI no |
| Import inventario | API sí, UI no |
| Local mock (dev Windows) | Cubre subset; no equivale a Postgres real |

---

## 7. Duplicidades

| Concepto | Dónde aparece | Evaluación |
|---|---|---|
| Stock | Inventario + overrides en producto | OK si misma fuente (`branch_products`); documentar “verdad” = inventario |
| Nuevo producto | Nav + listado | Simplificar a un CTA contextual |
| Responsables | Módulo propio vs tab sucursal (ideal) | Unificar en detalle sucursal + acceso desde Responsables |
| Alertas | Badge nav + página + métrica dashboard | Mantener, pero deep-link unificado |

---

## 8. Módulos faltantes

1. **Agenda / Producción** (prioridad máxima operativa).  
2. **Detalle de pedido** (líneas, cliente, fulfillment, historial).  
3. **Clientes** (mínimo: ficha desde pedido + WhatsApp/teléfono).  
4. **Promociones** como módulo (listado global + crear), no solo embebido.  
5. **UI de movimientos / import inventario**.  
6. **Hub sucursal real** (reemplazar JSON).

---

## 9. Propuesta de navegación

```
ADMIN
├── Inicio            → acción + alertas + pedidos del día
├── Pedidos
│   └── (detalle)
├── Agenda            → NUEVO: producción por fecha/hora
├── Productos
│   ├── Inventario    (subnav o tab)
│   └── Importar
├── Promociones       → NUEVO: listado global
├── Sucursales
│   └── :id           → hub operativo real
├── Alertas
└── Configuración
    ├── Responsables
    └── Reportes
```

Principio: **frecuencia arriba** (Pedidos, Agenda, Inventario); **configuración abajo**.

---

## 10. Quick Wins

1. Deep-link dashboard “Bajo inventario” → `/admin/inventario?state=LOW_STOCK`.  
2. Select de estados de pedido = solo transiciones válidas.  
3. Quitar “Nuevo Producto” del nav lateral; dejar CTA en listado.  
4. Alta rápida: colapsar Promociones / Atributos / overrides avanzados por defecto.  
5. Empty states con CTA (`Crear promoción`, `Importar productos`).  
6. Arreglar contrato notificaciones sucursal.  
7. Columnas listado productos: categoría, precio, #sucursales activas, estado.  
8. Filtro “Hoy / Mañana” en pedidos (aunque Agenda venga después).

---

## 11. Mejoras estructurales

| Fase | Cambio |
|---|---|
| A | Rediseñar ficha producto (wizard / tabs) |
| B | Agenda de producción + detalle pedido |
| C | Hub sucursal (tabs con datos reales) |
| D | Módulo promociones + clientes |
| E | Unificar permisos UI (ocultar acciones no globales) con backend |

---

## 12. Score por módulo

| Módulo | Funcionalidad | UX | Claridad | Riesgo | Score |
|---|---:|---:|---:|---|---:|
| Dashboard | 6 | 5 | 6 | Medio | **5.7** |
| Productos (lista) | 7 | 6 | 6 | Medio | **6.3** |
| Productos (alta/edit) | 8 | 4 | 4 | Alto | **5.3** |
| Inventario | 8 | 7 | 7 | Bajo | **7.3** |
| Importar | 7 | 7 | 7 | Medio | **7.0** |
| Pedidos | 6 | 5 | 5 | Alto | **5.3** |
| Sucursales | 5 | 4 | 4 | Alto | **4.3** |
| Alertas | 5 | 5 | 5 | Medio | **5.0** |
| Reportes | 6 | 6 | 6 | Bajo | **6.0** |
| Responsables | 7 | 6 | 6 | Medio | **6.3** |
| Agenda | 0 | — | — | Crítico | **0** |
| Promociones (módulo) | 4* | 4 | 4 | Medio | **4.0** |

\*Promociones existen embebidas; score como módulo independiente.

**Promedio ponderado (operación diaria):** ~**5.8 / 10**

---

## 13. Roadmap recomendado

### Fase 1 — Operar el día (1–2 sprints)
- Agenda básica (sucursal + fecha + pedidos por slot)
- Pedidos: filtro hoy/mañana + estados válidos + detalle mínimo
- Dashboard accionable + deep-links
- Fix notificaciones sucursal + quick wins de nav/form colapsable

### Fase 2 — Catálogo usable (2–3 sprints)
- Alta rápida / progressive disclosure en producto
- Listado productos multi-sucursal
- Hub sucursal real (reemplazar JSON)
- UI movimientos / import inventario

### Fase 3 — Escala (posterior)
- Módulo promociones
- Clientes
- Permisos UI fine-grained alineados a rol
- Calendarización avanzada / producción

---

## Apéndice — Evidencia clave

| Tema | Archivo |
|---|---|
| Rutas admin | `artifacts/mallorca-ecommerce/src/App.tsx` |
| Nav | `.../components/layout/admin-layout.tsx` |
| Guard roles | `.../admin-guard.tsx` |
| requireRole | `artifacts/api-server/src/routes/index.ts` |
| Branch scope | `.../middlewares/auth.ts` |
| Transiciones pedido | `.../routes/admin.ts` |
| Form producto | `.../pages/admin/product-form.tsx` |
| Inventario | `.../pages/admin/inventory.tsx` |
| Branch JSON | `.../pages/admin/branch-detail.tsx` |
| Brief origen | `docs/analisis.md` |

---

*Entregable según FASE 33 de `docs/analisis.md`: diagnóstico primero; sin rediseño completo ni refactors grandes en esta ejecución.*
