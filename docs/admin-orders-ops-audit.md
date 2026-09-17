# Auditoría operativa — Admin Pedidos

**Roles:** Senior Product Designer · Full-Stack · Ecommerce Ops  
**Fecha:** 2026-09-16  
**Rutas:** `/admin/pedidos` · `/admin/pedidos/:id` · `/admin/pedidos/nuevo`

## 1. Estructura actual (post-implementación)

| Superficie | Archivo | Rol |
|---|---|---|
| Listado | `orders-list.tsx` | Identificar / filtrar / abrir |
| Detalle | `order-detail.tsx` | Ops cockpit 65/35 + acciones |
| Nuevo | `order-new.tsx` | Order Builder 65/35 |
| API | `admin-order-serialize.ts` | Snapshot items + `audit[]` + `imageUrl` |

## 2. API disponible

- List / Get / Create / Preview / Payment / Payment-link / Duplicate / Customer search
- `Order` incluye: líneas snapshot, descuentos, notes, payment fields, `createdAt`, `audit[]`
- `OrderLineItem.imageUrl` (best-effort desde producto actual; nombre/precio vienen del snapshot)

## 3. Gaps residuales (fuera de este ciclo)

1. Ledger de pagos (`order_payments`) no se expone en GET (sí se escribe)
2. Edición controlada de líneas post-creación (UI deshabilitada; API parcial)
3. Reembolso UI
4. Filtros `paymentStatus` / `q` en listado son client-side sobre el rango cargado
5. Direcciones guardadas del cliente (selector) — delivery sigue texto libre + lat/lng

## 4. Round-trip checklist

| Dato | Nuevo | Payload | DB | GET | Detalle |
|------|-------|---------|----|-----|---------|
| Cliente | PASS | PASS | PASS | PASS | PASS |
| Sucursal | PASS | PASS | PASS | PASS | PASS |
| Fecha/hora | PASS | PASS | PASS | PASS | PASS |
| Productos | PASS | PASS | PASS | PASS | PASS |
| Pago CASH_ON_PICKUP | PASS | PASS | PENDING | PASS | POR COBRAR |
| Notas | PASS | PASS | PASS | PASS | PASS |
| Audit | — | write | PASS | PASS | Historial |

## 5. Principio

LISTADO = encontrar · DETALLE = operar · NUEVO = construir rápido. Sin segundo modelo de pedidos.
