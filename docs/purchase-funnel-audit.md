# Purchase funnel audit — Pastelería Mallorca

**Roles:** Senior Ecommerce Product Designer · CRO · UX Architect · Software Architect  
**Alcance:** storefront `artifacts/mallorca-ecommerce` + commerce `artifacts/api-server` + OpenAPI  
**Fecha:** 2026-09-15  
**Estado:** Fase 1 — audit only (sin implementación)

**Principio de experiencia pedido:** Qué → En qué Mallorca → Para cuándo → Cómo recibirlo → Cómo pago — pidiendo cada decisión **solo cuando es necesaria**.

**Principio actual (código):** En qué Mallorca → Para cuándo → Qué → Cómo recibirlo → (pago stub). El funnel **invierte** las dos primeras decisiones y las exige **antes de explorar**.

---

## 0. Veredicto

El journey **ya opera** (catálogo, PDP, carrito, guest checkout, pickup/delivery, confirmación). No falta un segundo ecommerce: falta **dejar de pedir contexto operativo como formulario de entrada**.

Tres bloqueos de conversión / confianza:

| # | Tipo | Hallazgo |
|---|------|----------|
| 1 | UX / CRO | Dialogs bloqueantes de sucursal **y** fecha/hora en `/tienda`, PDP, carrito y checkout. El catálogo no se puede explorar con baja fricción. |
| 2 | Confianza | `POST /orders/{id}/payment` es un **503 stub**. El cliente “confirma”, ve pedido, y el pedido queda `pending_payment` hasta **TTL 15 min** → auto-cancel + restock. |
| 3 | Inventario | El carrito **no reserva** stock. La reserva nace en `createOrder`. Dos clientes pueden añadir el último pastel; uno pierde en el create. |

Conservar: guest checkout, carrito 1 sucursal, preview al cambiar sucursal (no vaciar en silencio), precios/promos server-side en create, PDP ~55/45, quick-add en cards simples.

---

## 1. Journey actual completo

```
Home (/)                         [sin gate]
  ├─ Ver la tienda → /tienda
  ├─ Categoría → /tienda?categorySlug=
  ├─ Card favorito → /producto/:slug  (gate al llegar)
  └─ Sucursales → /sucursales/:slug   (cards; prop showBranchAvailability muerta)

/tienda · /producto/:slug · /carrito · /checkout
  ├─ SI no hay branch  → Dialog BLOQUEANTE “¿Desde qué Mallorca quieres pedir?”
  └─ SI hay branch y falta fecha/hora → Dialog BLOQUEANTE “¿Para cuándo lo necesitas?”
       GET /fulfillment/slots?method=pickup   ← siempre pickup en header
       Confirm: “Ver productos disponibles”
       Si hay ítems: POST /fulfillment/preview

APIs de catálogo (home featured, /tienda, PDP)
  enabled SOLO si branch + (time | date+time)

Card /tienda
  Añadir (simple, stock>0)  → POST /cart/session (lazy) + POST /cart/:id/items
                            → toast “Añadido a tu bolsa”
                            → NO abre mini-cart
  Ver opciones (resto)      → PDP

PDP
  Variante · qty · “Agregar al carrito” → toast
  Sticky CTA mobile
  Cross-sell “Combina bien con” (hasta 6, misma sucursal+stock)
  NO navega, NO abre mini-cart

Mini-cart Sheet “Tu bolsa”  (solo icono bolsa)
  líneas + subtotal
  CTA “Terminar compra” → /carrito   (no checkout)
  sin imagen, sin ±, sin eliminar, sin promo, sin delivery

/carrito  “Tu bolsa.”
  sucursal, líneas, ±, eliminar
  Total Estimado = subtotal
  CTA “Pasar a entrega” → /checkout
  SIN fulfillment, SIN fecha, SIN cross-sell, SIN cupón

/checkout  “¿Cómo quieres recibirlo?”
  Pickup | Delivery
  Delivery: 1 campo dirección + geolocalización OBLIGATORIA
  Fecha/hora: SOLO lectura (cambiar en header)
  Contacto: nombre, email, teléfono, notas
  POST /orders  →  POST /orders/:id/payment (503 ignorado)
  clearCartSession → /pedido/:id/:token

Confirmación
  “Todo listo” · Pago pendiente si unpaid
  “El pago en línea estará disponible próximamente…”
```

**Persistencia**

| Dato | Dónde |
|------|--------|
| Branch | `localStorage selected_branch_id` |
| Cart id | `localStorage mallorca_cart_id` |
| Fecha / hora | `sessionStorage` (se borra al cambiar sucursal) |

---

## 2. Diagrama (implementado)

```
Catálogo ──► PDP ──► Add to cart ──► Toast
   ▲                    │                 │
   │                    │                 └── badge bolsa
   │                    ▼
Gate branch+slot    Mini-cart (manual) ──► Cart ──► Checkout
(forced before          │                    │         │
 list/PDP APIs)         └── Terminar         │    Pickup|Delivery
                            compra           │    Contacto
                                             │    POST /orders
                                             │    payment 503
                                             ▼
                                        Confirmation
                                        (pending_payment)
                                             │
                                             └── 15 min TTL → cancel
```

**Flujo deseado (no implementado):** explorar → añadir → mini-cart → revisar → sucursal si falta → cómo/cuando → pagar.

---

## 3. Click count actual (happy path)

Persona: producto simple, pickup, guest, ya no tiene contexto.

| Paso | Clicks / campos | Meta brief |
|------|-----------------|------------|
| Entrar a tienda | 1 (Ver la tienda) | — |
| Elegir sucursal (modal) | 1 + implícito | No al inicio |
| Elegir fecha | 1 | Cuando afecte |
| Elegir slot | 1 | Cuando afecte |
| Confirmar “Ver productos” | 1 | — |
| Añadir desde card | 1 | 1 acción |
| Abrir bolsa | 1 | auto al añadir |
| Terminar compra → carrito | 1 | Continuar pedido |
| Pasar a entrega | 1 | — |
| Pickup (si no default) | 0–1 | < 30s |
| Nombre / email / teléfono | 3 campos | Contacto mínimo |
| Confirmar pedido | 1 | < 2 min checkout |
| **Total** | **~10–12 clicks + 3 campos** | Funnel se siente “formulario primero” |

Producto con variantes: +PDP (+1–3). Delivery: +dirección + geolocalización (frecuente abandono).

Modificar cantidad en carrito: 1 (cumple meta). Entender total: subtotal visible <5s, **pero no es el total real** (falta delivery / reprice).

---

## 4. Fricciones UX

| ID | Pri | Fricción | Evidencia |
|----|-----|----------|-----------|
| FUN-01 | P1 | Fecha/hora **antes** de explorar | `StoreLayout.branchRequired` + `FulfillmentSelector required` |
| FUN-02 | P1 | Sucursal como **modal de arranque**, no contexto | Dialog “Antes de empezar”, no se puede cerrar |
| FUN-03 | P1 | Add to cart no abre mini-cart | `product-card` / PDP solo toast |
| FUN-04 | P1 | Mini-cart no permite corregir | Sin ±, delete, imagen |
| FUN-05 | P1 | CTA mini-cart va a **carrito**, no a checkout | “Terminar compra” → `/carrito` |
| FUN-06 | P1 | Carrito editorial (`text-5xl/7xl`) + un paso extra | `cart.tsx` |
| FUN-07 | P1 | Fulfillment recién en checkout | Cart “Pasar a entrega” |
| FUN-08 | P1 | Delivery exige GPS, no autocomplete estructurado | Un input + “Compartir ubicación exacta” |
| FUN-09 | P1 | Fecha en checkout es read-only → “cámbiala en el header” | Salir del flujo mental |
| FUN-10 | P1 | Copy de no disponible genérico | “No disponible para este horario” / “Agotado” |
| FUN-11 | P1 | Branch switch: disponible sí/no, **sin delta de precio** | API manda `price`/`salePrice`; UI no los muestra |
| FUN-12 | P1 | Home featured no carga sin slot | Query `enabled` |
| FUN-13 | P2 | Search hace `window.location.href` (reload) | `store-layout.tsx` |
| FUN-14 | P2 | Cross-sell 6 en PDP, 0 en carrito | Pedido: 2–3 y en momento de ticket |
| FUN-15 | P2 | “Elige sucursal” en card en vez de precio | Sin branch |
| FUN-16 | P2 | Link `/nosotros` roto | Nav HISTORIA |
| FUN-17 | P2 | TIENDA y PASTELERÍA van al mismo `/tienda` | Nav duplicada |

---

## 5. Fricciones mobile (390–430px)

- Header: bolsa + search + hamburger; sucursal/horario compactos — **compiten** con el contenido.
- Modales bloqueantes a `max-h-[calc(100dvh-2rem)]`: el primer “producto” es un formulario.
- Cards: “Añadir” es **icono +** (label hidden `sm:inline`); touch OK, copy pobre.
- PDP: barra fija inferior “Añadir” vs FAB quick-links `bottom-24` — riesgo de solape.
- Mini-cart Sheet a full width: bien como bottom-ish panel; no es bottom sheet nativo.
- Carrito/checkout: **sin CTA sticky**; Confirmar queda abajo de mucho whitespace editorial (`text-5xl/7xl`).
- Calendar + slots en Dialog: usable, no bottom sheet.
- Delivery GPS: en iOS el permiso asusta; sin fallback de CP/colonia server-side.
- Quick-add no da feedback persistente (toast corto, drawer cerrado).
- Posible overflow: header context + kicker + display type.

---

## 6. Información repetida

| Dato | Dónde se vuelve a pedir o mostrar |
|------|-----------------------------------|
| Sucursal | Header, PDP “Tu Mallorca”, mini-cart “Preparando en…”, cart “Tu Mallorca”, checkout pickup copy |
| Fecha/hora | Header (editable) + checkout (solo lectura + instrucción de usar el header) |
| Líneas + precios | Mini-cart, cart, checkout summary, confirmación |
| Subtotal | Mini-cart, cart, checkout (ninguno es total final de `createOrder`) |
| Nombre sucursal | 4–5 veces en el mismo pedido |

No se pide dirección en pickup (correcto). Sí se pide sucursal **antes** de saber qué quiere (incorrecto vs brief).

---

## 7. Validaciones duplicadas

| Regla | Dónde vive hoy | Riesgo |
|-------|----------------|--------|
| Lead time producto | PDP `scheduleAvailable` (cliente) + `fulfillment/preview` + `createOrder` | Cliente puede diferir del server (usa `selectedTime` vs slot start) |
| Stock | Card/PDP `inventory > 0` + PATCH cart + create decrement | Sin reserved en carrito |
| Precio / promo | Catalog GET + `cartView()` live + `priceOrderLines` en create | UI “Total Estimado” ≠ order |
| Min order | Checkout `minimumRemaining` vs `createOrder` `branch.minimumOrder` | Checkout usa subtotal pre-reprice |
| Delivery cobertura | `POST /fulfillment/delivery-validation` + create | OK si coords válidas |
| Slot capacity | `GET /slots` **sin** filtrar method; create **con** method | Lista ≠ create |
| Branch mix | Cart DB 1 `branchId` + preview | OK |
| Horario sucursal | Selector (hours) + schedule server | Special hours: verificar paridad UI |

Admin manual order reutiliza `createOrder` / pricing / delivery (bien). PDP/Cart **no** llaman un AvailabilityService único: hay reglas en React.

---

## 8. Riesgos técnicos

| ID | Pri | Riesgo |
|----|-----|--------|
| TECH-01 | P0 | Payment stub 503; cliente traga el error y avanza |
| TECH-02 | P0 | Sin `POST /orders/preview` en storefront: total UI no es verdad |
| TECH-03 | P0 | Slots header hardcoded `method: "pickup"` |
| TECH-04 | P0 | Capacidad GET slots ignora `fulfillmentMethod` |
| TECH-05 | P1 | Sin idempotency key de pedido más allá de `orders_cart_unique` |
| TECH-06 | P1 | Mock local **no** cubre cart/orders storefront |
| TECH-07 | P1 | Cross-sell via listado completo + filter cliente |
| TECH-08 | P1 | PDP poll 30s + SSE: coste; no sustituye revalidación al pagar |
| TECH-09 | P1 | `window.location` search: pierde SPA state |
| TECH-10 | P2 | Stripe columns en DB sin wiring; no hay Mercado Pago |
| TECH-11 | P2 | Analytics solo CustomEvent de sucursal |

---

## 9. Riesgos de inventario

Política **real**:

```
available mostrado en catálogo ≈ branchProducts.inventory  (físico actual)
reserved_stock              ≈ filas inventory_reservations active
reserva inicia              = POST /orders (createOrder)
TTL storefront              = 15 minutos
commit                      = order paid (hoy: admin / métodos immediatePaid)
release                     = cancel · TTL · pending_payment expirado
```

| Hueco | Impacto |
|-------|---------|
| Carrito no reserva | Overselling entre add y create |
| Pago no committea (nunca paid online) | Reserva 15m y **libera**; pedido desaparece |
| Add/update chequea `inventory` no `inventory - reserved` | Puede vender unidades ya reservadas por otro pedido unpaid |
| TTL agresivo + copy de confirmación “Todo listo” | Cliente cree que hay pedido; ops ve cancelado |
| Transfer admin TTL 24h vs storefront 15m | Inconsistencia de política |

---

## 10. Riesgos de disponibilidad

- Fecha/hora se elige **sin saber el producto** → lead time de 24h aparece tarde (“No disponible para este horario”) sin “disponible a partir del miércoles”.
- Delivery usa otros slots; header ya fijó pickup → checkout pide “elige otro” si el slot no sirve.
- Special hours / blocked dates: UI usa `branch.hours`; create usa schedule server — drift posible.
- Seasonality / product inactive en carrito: create falla; carrito no revalida al foco.
- Promo que caduca: `cartView` live-price sí; usuario no ve aviso “el precio cambió”.
- `includeUnavailable` checkbox en tienda: bueno para transparencia; fácil de no encontrar.

---

## 11. Riesgos de pago

| Caso | Hoy |
|------|-----|
| Integración | Stub 503 `PAYMENT_PROVIDER_NOT_CONFIGURED` |
| UI | CTA “Confirmar Pedido” (no “Pagar con tarjeta”) |
| Doble click | Spinner en pending; cart unique evita 2 orders del mismo cart |
| Pago fallido | No hay retry de pago: el 503 se ignora |
| Pedido duplicado | Nuevo cart (localStorage cleared) → segundo pedido unpaid fácil |
| Webhook | No hay |
| Copy confirmación | Admite que el pago online “estará disponible próximamente” |
| Recuperar pago | No hay flujo; el pedido muere a los 15 min |

**P0 de negocio:** no se puede cobrar en storefront. Todo el CRO del funnel termina en un callejón.

---

## 12. Propuesta de journey optimizado

Secuencia percibida:

> Elijo lo que quiero → (si hace falta) en qué Mallorca → añado → reviso → cómo/cuándo → pago → listo.

| Momento | Qué pedimos | Qué no |
|---------|-------------|--------|
| Home / tienda | Nada, o sucursal suave (chip, no modal) | Fecha |
| Ver precio/stock preciso | Sucursal (sheet, dismissible en browse; required al add) | Slot |
| Add producto con lead time largo | Aviso “para el día D”; no bloquear browse | Formulario completo |
| Mini-cart post-add | Corregir qty, seguir o continuar | Checkout entero |
| Cart | Revisar; sucursal visible; fulfillment **opcional** si aún no | Dirección si pickup |
| Checkout 1 página | Contacto → entrega (cómo+cuándo+dir) → pago | Registro, sucursal otra vez, fecha en header escondida |
| Post-pago | Confirmación operativa | “Próximamente” |

**Regla de sucursal:** contexto operativo. Sin sucursal se puede **mirar** el catálogo (precio “desde” o “según sucursal”). Al **añadir**, si falta, sheet “¿En cuál Mallorca?”. Un pedido = una sucursal (ya es así en API).

**Regla de fecha:** se pide cuando (a) el usuario va a checkout, o (b) el producto no puede salir “hoy” y hay que explicar alternativa. Listados pueden usar “ahora + lead default de sucursal” para no mostrar lo imposible, sin modal.

---

## 13. Wireframes textuales

### 13.1 Catálogo `/tienda`

```
[Tu Mallorca: Reforma ▾]     [Buscar]     [Bolsa 2]

Pasteles | Bollería | …          (chips, no sidebar pesada)

[img] Nombre
 $680   [$850]           [Añadir +]     ← simple
                         [Elegir opciones] ← variantes / lead / config

Mobile: grid 2 col; CTA 44px; sin overflow.
```

Sin modal a pantalla completa. Chip sucursal siempre visible.

### 13.2 PDP

```
Desktop 55% galería | 45% compra sticky
Categoría
Nombre
Descripción corta (una vez)
$ precio  ·  promo  ·  ahorras
Variantes
Cantidad
“Disponible en Reforma · 8 piezas”
“Necesita 24 h · desde miércoles 10:00”
[Añadir al carrito]

Debajo: ingredientes, alérgenos, “Combina bien con” (máx 3)
Mobile: imagen → info → opciones → CTA sticky
```

### 13.3 Mini-cart (abre al añadir)

```
✓ Panettone Tradicional añadido

[img] Panettone  Estándar
      − 1 +     $520     [x]

Subtotal $520
Envío se calcula al elegir entrega

[Continuar con mi pedido]
[Seguir comprando]
```

### 13.4 Carrito

```
Sucursal: Reforma                    [Cambiar]

líneas con img, variante, ±, promo, total línea

Cómo recibirlo (si aún no): [Lo recojo] [Envíenmelo]  ← puede vivir aquí o checkout
Fecha/hora compactos si ya hay contexto

Combina bien (0–3)

Subtotal / desc / envío est. / total est.
[Continuar]  sticky mobile
```

### 13.5 Cambio de sucursal

```
Al cambiar a Mallorca Lomas:

✓ 3 productos disponibles
⚠ 1 agotado (se quitará si confirmas)
⚠ 1 precio diferente  $520 → $480

[Seguir en Reforma]  [Cambiar a Lomas]
```

Nunca vaciar en silencio (ya casi: falta el renglón de precio).

### 13.6 Checkout (una página)

```
CONTACTO     Nombre  Tel  Email
ENTREGA      Pickup | Delivery
             Pickup: sucursal (locked) + fecha + slots pickup
             Delivery: calle, núm, colonia, CP, refs + cobertura + fee + ventana
PAGO         Tarjeta | …  (cuando exista)
             CTA: Pagar $1,250   disabled while processing

Desktop: form 60% + summary sticky 40%
Mobile: vertical + resumen colapsable “Ver pedido · $1,250”
Cupón: “¿Tienes un código?” cerrado
```

### 13.7 Pago fallido

```
No pudimos procesar el pago.
Pedido #1042 conservado (productos, sucursal, fecha, datos).

[Reintentar]  [Cambiar método]
```

### 13.8 Confirmación

```
Pedido confirmado  #1042
Reforma · Pickup · Sábado 11:00
Pagado $1,250  (o instrucciones de pago)
líneas
[Ver pedido] [Cómo llegar] [Contactar sucursal]
¿Quieres una cuenta? (opcional)
```

---

## 14. Arquitectura frontend necesaria

Hoy: páginas + `CartProvider` + dialogs en `StoreLayout`. No hay orquestador de funnel.

Propuesta (sin big-bang):

| Módulo | Responsabilidad |
|--------|-----------------|
| `PurchaseContext` | branch, schedule, fulfillment method, flags “gate reason” |
| `useCatalogQuery` | list/PDP con sucursal opcional; `scheduledStart` solo si el usuario ya eligió |
| `MiniCart` | componente propio; `openOnAdd` |
| `BranchSwitchDialog` | preview: stock + **price delta** |
| `FulfillmentPanel` | pickup vs delivery slots **según method** |
| `CheckoutTotals` | de `POST /orders/preview` (nuevo), nunca suma local como verdad |
| `analytics.ts` | mapa GA4/datalayer de la sección 17 |
| Design density | tokens: catalog editorial → checkout compact (`space`, type scale) |

`Admin OrderService` ya extraído: storefront create debe seguir siendo wrapper, no lógica nueva en React.

---

## 15. Servicios backend involucrados (concepto vs hoy)

| Servicio | Hoy | Gap |
|----------|-----|-----|
| BranchService | `branches` routes + hours | OK |
| CatalogService | `catalog.ts` list/detail | Browse sin slot |
| InventoryService | decrement en create; soft check en cart | available = physical − reserved **en add/list** |
| AvailabilityService | `fulfillmentSchedule` + preview | Unificar con PDP; method-aware slots |
| PromotionService | `catalog-promotions.ts` | Exponer nombre/ahorro en cart |
| PricingService | `order-pricing.ts` | Storefront preview |
| FulfillmentService | slots + delivery-validation | Slots delivery ≠ pickup |
| CartService | `commerce.ts` cart* | Revalidate endpoint |
| OrderService | `createOrder` | Idempotency-Key; no auto-success sin pago |
| PaymentService | **no existe** | Provider real + webhook + idempotency |

---

## 16. Cambios DB/API necesarios

**P0**

- Payment provider (intent + webhook) **o** política explícita “paga al recoger” sin pretender pago online.
- Si online: no marcar experiencia como confirmada hasta `paid` **o** hold más largo + copy honesto.
- `availableStock` en list/cart/add = `inventory - active reservations`.
- `GET /fulfillment/slots` filtrar por `fulfillmentMethod` igual que create.
- `POST /orders/preview` (o reusar admin preview) para storefront totals.

**P1**

- Header/slots: `method` del usuario, no hardcoded pickup.
- Branch preview: UI de `price`/`salePrice` (API ya los trae).
- Order `Idempotency-Key` header.
- Coupon opcional en `OrderInput` storefront (hoy admin-only) si se quiere en checkout.
- Dirección estructurada o al menos CP + cobertura sin GPS obligatorio.

**P2**

- Cart reservation soft (TTL corto) vs solo al order — decidir política única.
- Eventos analytics persistidos / GTM.
- Search endpoint si el reload duele.

---

## 17. Analytics necesarios

Hoy: `branch_selected` / `branch_changed` vía `mallorca:analytics`.

Instrumentar (GA4-style, un solo `track(event, params)`):

| Evento | Trigger |
|--------|---------|
| `view_item_list` | `/tienda` |
| `select_item` | click card |
| `view_item` | PDP |
| `add_to_cart` | quick-add / PDP |
| `remove_from_cart` | cart / mini-cart |
| `view_cart` | `/carrito` + open mini-cart |
| `begin_checkout` | `/checkout` |
| `branch_selected` | ya existe |
| `fulfillment_selected` | pickup/delivery |
| `date_selected` / `time_selected` | slots |
| `add_shipping_info` | delivery validada |
| `add_payment_info` | método elegido |
| `purchase` | **solo paid** (hoy se dispararía mal en create) |
| `checkout_error` | 409 slot/stock/min order |
| `payment_failed` | provider reject |

Funnel medible: Product View → ATC → View Cart → Begin Checkout → Payment Attempt → Purchase.

---

## 18. Casos borde (estado actual → objetivo)

| Caso | Hoy | Objetivo |
|------|-----|----------|
| Agotado después de add | Falla en create con toast genérico | Revalidar cart; CTA cambiar qty / sucursal |
| Promo termina | Precio live en GET cart; poco aviso | Banner “el precio se actualizó” |
| Stock cambia en checkout | Race hasta create | available−reserved; preview |
| Cambia sucursal | Preview stock; nuevo cart | + precios distintos |
| Cambia fecha | Preview fulfillment; drop líneas | Copy lead time accionable |
| Slot se llena | 409 create; lista puede mentir | Misma regla method+capacity |
| Delivery fuera de zona | reason API | Fee/cobertura antes de pago |
| Cupón inválido | N/A storefront | Inline, no romper pedido |
| Pago rechazado | 503 ignorado | No destruir order; retry |
| Doble click pagar | Spinner + cart unique | Idempotency payment |
| Webhook duplicado | N/A | Idempotent paid |
| Vuelve en horas | sessionStorage fecha perdida; cart localStorage | Recuperar cart; revalidar |
| Producto desactivado | Create fail | Línea tachada + quitar |
| Precio cambia | Reprice silencioso en create | Mostrar delta |

---

## 19. Plan de QA

**Conversión / UX**

1. Entrar a `/tienda` sin localStorage: ¿se puede ver catálogo? (hoy: no)
2. Quick-add 1 tap; mini-cart (hoy: no abre)
3. Pickup < 30s desde cart
4. Guest: 3 campos; sin password
5. Pickup: cero dirección
6. Mobile 390: PDP CTA, cart CTA, checkout CTA visibles
7. Cambio sucursal con mix available/OOS/price

**Inventario / disponibilidad**

8. Dos browsers, stock=1, ambos add, ambos checkout
9. Lead 24h, slot “hoy”: copy + acción
10. Switch pickup→delivery: slots distintos
11. Min order: checkout y create alineados
12. TTL 15m: pedido unpaid desaparece — documentar para ops

**Pago (cuando exista)**

13. CTA disabled al procesar
14. Fail: order intacto
15. Retry idempotente
16. Success: purchase event una vez; stock committed

**Regresión admin**

17. Pedido manual sigue usando `createOrder`
18. No romper reservas admin transfer 24h

---

## 20. Roadmap P0 / P1 / P2

### P0 — integridad (cobro, stock, pedido válido)

1. **Definir y comunicar modelo de pago.** Stub + “Todo listo” + TTL 15m es P0 de confianza. O provider real, o “paga al recoger/entregar” sin 503 silencioso, TTL acorde, copy honesto.
2. **Stock vendible = físico − reservado** en list, add, update, cards.
3. **Slots method-aware** (GET = create = header).
4. **No confirmar éxito de pago si 503.**
5. **Preview de totales server-side** antes de create.
6. Pedido siempre con sucursal + slot válido (ya enforced en create; alinear UI delivery).

### P1 — conversión (fricción)

1. Quitar modal de fecha **antes** de explorar; sucursal como chip, required al add.
2. Mini-cart al añadir: img, ±, delete, Continuar / Seguir.
3. Compactar cart/checkout; CTA sticky mobile; summary sticky desktop.
4. Fulfillment + fecha **en el flujo** (cart o checkout), no “ve al header”.
5. Delivery: cobertura sin GPS obligatorio; mostrar fee pronto.
6. Copy de indisponibilidad accionable + price delta en branch switch.
7. Analytics de funnel.
8. Home/listing utilizable sin slot elegido.

### P2 — ticket y polish

1. Cross-sell 2–3 en mini-cart/cart, misma sucursal/stock/fecha.
2. Cupón secundario.
3. Crear cuenta post-compra.
4. Prefetch / imagen / debounce search SPA.
5. A11y: focus trap dialogs, labels qty, contraste kickers.
6. Bottom sheets mobile para sucursal y slots.

---

## Criterios UX (hoy vs meta)

| Criterio | Hoy | Meta |
|----------|-----|------|
| Add simple desde catálogo | 1 **después** de 3–4 clicks de contexto | 1 acción (contexto lazy) |
| Modificar cantidad | 1 en cart; 0 en mini-cart | 1 también en mini-cart |
| Entender total | Subtotal <5s; total real al create | Preview server <5s |
| Pickup | Slot ya elegido al inicio; checkout rápido | <30s cuando se pide |
| Checkout | Corta si pickup; delivery+GPS fricciona | <2 min |
| Pago fallido | No aplica (pago no existe) | Sin reconstruir pedido |

---

## No hacer (reafirmado vs código)

- No más pasos tipo WooCommerce (el carrito extra + header date ya son de más).
- No registro obligatorio (ya OK).
- No dirección en pickup (ya OK).
- No vaciar carrito en silencio (ya casi OK; completar precios).
- No ocultar delivery fee (parcial: se ve en checkout, no antes).
- No cross-sell catálogo dentro del cart (PDP ya se pasa: 6 ítems).
- No precios/stock solo en frontend.
- No segundo create por retry (cart unique ayuda; pago no).
- No sacrificar mobile por display 7xl en checkout.

---

## Principio final

Hoy el cliente siente: **“Dime sucursal y horario, luego te dejo ver pasteles, luego te confirmo un pedido que quizá se cancele solo.”**

Debe sentir: **“Elijo lo que quiero → digo cómo/cuándo → pago → listo.”**

Sucursal, reservas, lead time, slots, promos y delivery se resuelven **debajo**, con los mismos servicios que el pedido manual del admin.
