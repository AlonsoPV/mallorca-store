# Alertas de inventario — Auditoría y plan (§42)

Fuente: brief de alertas manuales/automáticas.  
**Estado: implementado** (schema + InventoryAlertService + API/OpenAPI + UI admin + import preview + tests unitarios de reglas).

---

## 1. Estado actual

### Datos

| Pieza | Hoy |
|-------|-----|
| Stock on-hand | `branch_products.inventory` |
| Umbral bajo | `branch_products.min_stock` |
| Estado derivado (persistido) | `branch_products.alert_state` texto: `NORMAL` \| `LOW_STOCK` \| `OUT_OF_STOCK` |
| Reservaciones | `inventory_reservations` (`active` / `committed` / `released`) |
| Ledger | `inventory_ledger` (movimientos con actor/reason) |
| Alertas | `inventory_alerts` — tipos solo `LOW_STOCK` / `OUT_OF_STOCK`; resolución vía `resolved_at` |
| Notificaciones in-app | `internal_notifications` ligadas a `alert_id` |
| Preferencias sucursal | `branches.notification_preferences` JSON (`email`, `inApp`; no tipado por tipo de alerta) |

**No existen:** `critical_stock`, `auto_alert_enabled`, `CRITICAL_STOCK`, tipos manuales, workflow `OPEN/IN_PROGRESS/RESOLVED/DISMISSED`, `inventory_alert_events`, columna `available_stock`.

### Lógica

- `stockState(inventory, minStock)` en [`inventory.ts`](artifacts/api-server/src/lib/inventory.ts): `≤0` → OUT; `≤ min` → LOW; else NORMAL.
- `applyInventoryAlert` en [`commerce.ts`](artifacts/api-server/src/routes/commerce.ts): inserta alerta **solo al entrar** a LOW/OUT; al volver a NORMAL resuelve abiertas.
- Call sites: venta/reserva, cancelación, update manual, import CSV inventario.
- **Hueco:** `upsertProductAggregate` actualiza `alertState` / ledger pero **no** llama `applyInventoryAlert` → ficha de producto no genera filas de alerta.
- Alertas usan **inventory on-hand**, no `inventory − reserved`.
- `reservedStock` se calcula en listados admin (SQL), no en evaluación de alertas.

### UI

| Superficie | Hoy |
|------------|-----|
| `/admin/alertas` | Tabla read-only (fecha, producto, stock, tipo, responsable, entrega). Sin filtros ni acciones. |
| `/admin/inventario` | Stock editable, mínimo read-only, badge estado, ± rápido. Sin reservado/disponible/alerta manual. |
| Ficha producto | Stock + min (avanzado). Sin crítico ni auto-alerta ni “Generar alerta”. |
| Dashboard | Contadores low/out + alertas abiertas con links. |
| Import | Inventario `sku,branch_code,quantity[,min_stock]`. Sin preview de alertas. |

### Asignación / notificaciones

- Al crear alerta automática: responsable producto/categoría → branch_manager → admin (en `applyInventoryAlert`).
- Canales según prefs sucursal (`in_app` / `email_pending`); fallo de email no bloquea (solo marca canal).

---

## 2. Gaps (vs brief)

1. Sin nivel **crítico** ni estados `CRITICAL_STOCK`.
2. Sin `auto_alert_enabled` / “sin umbral” (hoy `minStock=0` dispara LOW de inmediato si stock≤0 ya cubre OUT).
3. Alertas **no** usan `available_stock = inventory − reserved`.
4. Sin alertas **manuales** ni masivas (API/UI).
5. Sin workflow OPEN / IN_PROGRESS / RESOLVED / DISMISSED (solo `resolved_at`).
6. Sin `inventory_alert_events` / historial de alerta.
7. Centro de alertas sin filtros ni acciones (asignar, resolver, descartar, ver producto).
8. Ficha / quick-edit / export no configuran ni exportan umbrales críticos / auto-alerta.
9. Import de productos no trae `*_critical_stock` / `*_auto_alert`; preview no advierte alertas.
10. Dos caminos incompletos: aggregate vs `applyInventoryAlert` → riesgo de estados sin filas de alerta.
11. Sin unique “una OPEN por (product, branch, type)” a nivel DB.
12. Prefs de notificación no distinguen low / critical / out ni WhatsApp real.

---

## 3. Cambios DB (aditivos; un solo sistema)

Extender **`branch_products`**:

- `critical_stock` integer nullable  
- `auto_alert_enabled` boolean not null default true  

Extender **`inventory_alerts`** (no tabla paralela):

- `source`: `AUTOMATIC` \| `MANUAL`
- `status`: `OPEN` \| `IN_PROGRESS` \| `RESOLVED` \| `DISMISSED` (backfill: `resolved_at IS NULL` → OPEN, else RESOLVED)
- `priority`: `LOW` \| `MEDIUM` \| `HIGH` \| `CRITICAL`
- `message` text
- `available_stock_at_trigger`, `stock_at_trigger`, `min_stock_at_trigger`, `critical_stock_at_trigger`
- `created_by_user_id`, `resolved_by_user_id`, `resolution_note`
- Ampliar enum `type`: + `CRITICAL_STOCK`, `INVENTORY_REVIEW`, `RESTOCK_REQUEST`, `INVENTORY_MISMATCH`, `CUSTOM`
- Unique parcial: una alerta **OPEN** por `(product_id, branch_id, type)` para tipos automáticos

Nueva **`inventory_alert_events`**:

- `alert_id`, `event`, `user_id`, `metadata` jsonb, `created_at`

Opcional prefs: enriquecer `notification_preferences` con flags por tipo (`lowStock`, `criticalStock`, `outOfStock`) + canales.

**No** persistir `inventory_status` como fuente de verdad: derivarlo de available + umbrales; `alert_state` se mantiene como cache dual-write.

---

## 4. Lógica de eventos (un solo pipeline)

```
InventoryService.adjustStock / import / sale / cancel
  → recalcular available = inventory − reserved(active)
  → deriveState(available, min, critical)
  → InventoryAlertService.syncAutomatic(prev, next)
       → transición a LOW/CRITICAL/OUT: create OPEN (si auto_alert_enabled; LOW solo si min definido)
       → transición a AVAILABLE: resolve OPEN automáticas del tipo que ya no aplica
       → sin re-fire mientras el tipo OPEN siga vigente
  → notificar best-effort (nunca bloquea commit)
```

Manual:

```
InventoryAlertService.createManual({ type, priority, message, assignee, product, branch })
  → puede coexistir con automática OPEN del mismo producto/sucursal (tipos distintos)
  → event CREATED
```

Reglas clave:

- Evaluar con **available_stock**, no solo on-hand.
- `min_stock` null/no configurado → no LOW automático; OUT (0) sí si regla global on.
- Transición `AVAILABLE → LOW → CRITICAL → OUT` genera alertas al **entrar** a cada tipo; no spam intra-estado.
- `LOW → AVAILABLE → LOW` → nueva alerta LOW.
- Restock que saca de LOW/CRITICAL/OUT → auto RESOLVED + note “Inventario recuperado.”

---

## 5. Cambios API

- Extender `BranchConfiguration` / inventory update: `criticalStock`, `autoAlertEnabled`, stock ± con reason.
- `GET /admin/inventory/alerts` — filtros: branch, product, type, priority, status, source, assignee, date range.
- `POST /admin/inventory/alerts` — manual (+ bulk `ids[]` → N alertas).
- `PATCH /admin/inventory/alerts/{id}` — assign, status (IN_PROGRESS / RESOLVED / DISMISSED), priority, note.
- `GET /admin/inventory/alerts/{id}/events`
- Inventory list/matrix: `reservedStock`, `availableStock`, `criticalStock`, `autoAlertEnabled`, `openAlertCount`, `inventoryStatus` (derivado).
- Import preview: flag `willTriggerAlert` + tipo.
- Export: columnas stock / reserved / available / min / critical / auto_alert / status.
- Dashboard summary: low / critical / out / openAlerts.
- Unificar: product-aggregate y commerce **deben** llamar al mismo `InventoryAlertService` tras cambios de stock.

---

## 6. Cambios UI

| Superficie | Cambio |
|------------|--------|
| Ficha producto | Por sucursal: stock, min, crítico, auto-alerta + preview de estado; acciones Ajustar / Historial / Generar alerta |
| Inventario | Columnas Reservado, Disponible, Mínimo, Estado (icono+texto), Alertas; acción Generar alerta |
| Drawer “Generar alerta” | Tipo, prioridad, mensaje, asignado; reutilizar en producto, inventario y masivo |
| Centro Alertas | Secciones Críticas / Atención / Resueltas; filtros; acciones Ver producto, Actualizar stock, Asignar, En atención, Resolver, Descartar |
| Dashboard | Bloques Inventario (bajo/crítico/agotado) + Alertas abiertas |
| Import | Preview “⚠ Generará alerta…”; columnas wide critical/auto_alert |

---

## 7. Reglas anti-duplicados

1. Transición de estado (no cada write).
2. Unique parcial OPEN automáticas por `(product_id, branch_id, type)`.
3. Sync idempotente: si ya hay OPEN del mismo tipo, no insertar; actualizar snapshot opcional.
4. Jobs/retries: misma clave natural + transaction.
5. Manuales **no** compiten con unique de automáticas (tipos distintos) — CASO 4.
6. Notificaciones: dedupe por `alert_id` + canal + ventana corta.

---

## 8. Permisos

| Rol | Ver | Crear manual | Asignar/resolver | Config umbrales / prefs |
|-----|-----|--------------|------------------|-------------------------|
| Staff | Su sucursal | Sí (su sucursal) | Limitado | No |
| Branch manager | Su sucursal | Sí | Sí | Umbrales de su sucursal |
| Operations | Todas | Sí | Sí | Sí |
| Admin | Todas | Sí | Sí | Sí |

Validar en backend en create/patch/list (hoy list alerts es global admin-ish).

---

## 9. Impacto import / export

- Import inventario/producto: tras apply stock → mismo `InventoryAlertService`.
- Preview: diff stock + `willTriggerAlert` / tipo esperado.
- Columnas nuevas: `min_stock`, `critical_stock`, `auto_alert` (y wide `REF_*` / `LOM_*`).
- Export reimportable con reserved/available/status derivados.

---

## 10. Pruebas necesarias

| Caso brief | Assertion |
|------------|-----------|
| 1 | 6→5 con min=5 → 1 alerta LOW |
| 2 | 5→4 → 0 alertas nuevas |
| 3 | 4→12 → LOW OPEN → RESOLVED |
| 4 | Manual RESTOCK/REVIEW coexiste con LOW automática |
| 5 | Import 10→2 con critical=2 → CRITICAL (+ unique) |
| 6 | Reforma 0 / Lomas >0 → solo alerta Reforma |
| Extra | available = 10−7=3, min=5 → LOW |
| Extra | min no definido → no LOW; stock 0 → OUT |
| Extra | Product form adjust dispara alerta (mismo service) |
| Extra | Retry no duplica OPEN |

---

## Plan de implementación (post-confirmación)

1. **Schema** — columnas + enums + events + unique + backfill status ✅  
2. **InventoryAlertService + InventoryService** — available_stock, critical, sync automático; cablear commerce + admin update + import + product-aggregate ✅  
3. **API** — CRUD alertas, filtros, bulk manual, inventory enrichment, OpenAPI ✅  
4. **UI** — ficha, inventario, drawer, centro alertas, dashboard ✅  
5. **Import/export + preview** ✅ (columnas critical/auto_alert + willTriggerAlert)  
6. **Permisos + prefs notificación + tests de aceptación** ✅  
   - Prefs por tipo (`lowStock` / `criticalStock` / `outOfStock`) + canales (`inApp` / `email` / `whatsapp` cola)  
   - Staff: crear + “en atención”; managers+ resuelven/asignan  
   - WhatsApp outbound real sigue fuera de alcance (solo `whatsapp_pending`)

**Ops:** aplicar schema (`drizzle push` / migraciones) y backfill de `status` en alertas históricas (`resolved_at` null → OPEN).

---

*Plan de alertas cerrado; pendiente solo proveedor outbound de WhatsApp/email si se requiere más adelante.*
