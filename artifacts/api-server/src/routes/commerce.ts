import { Router, type IRouter } from "express";
import { and, eq, sql, desc, lt } from "drizzle-orm";
import {
  db, branchesTable, cartsTable, cartItemsTable, productsTable, categoriesTable,
  productVariantsTable, branchProductsTable, ordersTable, orderItemsTable,
  inventoryReservationsTable, inventoryLedgerTable, inventoryAlertsTable, internalNotificationsTable, usersTable, categoryResponsibleAssignmentsTable, branchUserAssignmentsTable,
} from "@workspace/db";
import {
  CreateCartSessionBody, CreateCartSessionResponse, GetCartParams, GetCartResponse,
  AddCartItemParams, AddCartItemBody, AddCartItemResponse, UpdateCartItemParams,
  UpdateCartItemBody, UpdateCartItemResponse, DeleteCartItemParams, DeleteCartItemResponse,
  ValidateDeliveryBody, ValidateDeliveryResponse, ListFulfillmentSlotsQueryParams,
  ListFulfillmentSlotsResponse, CreateOrderBody, CreateOrderResponse, StartOrderPaymentBody,
  StartOrderPaymentResponse,
  PreviewFulfillmentBody, PreviewFulfillmentResponse,
  PreviewCartBranchParams, PreviewCartBranchBody, PreviewCartBranchResponse,
  GetOrderDetailsParams, GetOrderDetailsResponse, GetGuestOrderDetailsParams,
  GetGuestOrderDetailsResponse, GetMeResponse, UpdateMeBody, UpdateMeResponse,
  ListMyOrdersResponse, type Cart as CartShape,
} from "@workspace/api-zod";
import {
  calculatePromotionPrice,
  getActivePromotion,
  resolveCatalogPrice,
  serializeBranch,
} from "../lib/catalog";
import { buildBranchPreviewItems } from "../lib/branch-preview";
import { getRequestUser, requireAuth } from "../middlewares/auth";
import crypto from "node:crypto";
import { stockState, enteredAlertState } from "../lib/inventory";

const router: IRouter = Router();
const id = () => crypto.randomUUID();
const num = (v: number | null) => v ?? 0;

export async function applyInventoryAlert(tx: any, bp: typeof branchProductsTable.$inferSelect, nextInventory: number): Promise<void> {
  const nextState = stockState(nextInventory, bp.minStock);
  const previous = bp.alertState as "NORMAL" | "LOW_STOCK" | "OUT_OF_STOCK";
  await tx.update(branchProductsTable).set({ alertState: nextState }).where(eq(branchProductsTable.id, bp.id));
  if (nextState === "NORMAL" && previous !== "NORMAL") {
    await tx.update(inventoryAlertsTable).set({ resolvedAt: new Date() })
      .where(and(eq(inventoryAlertsTable.branchProductId, bp.id), sql`${inventoryAlertsTable.resolvedAt} is null`));
  }
  if (!enteredAlertState(previous, nextState)) return;
  const [branch] = await tx.select().from(branchesTable).where(eq(branchesTable.id, bp.branchId));
  const [responsible] = bp.responsibleUserId
    ? await tx.select().from(usersTable).where(eq(usersTable.id, bp.responsibleUserId))
    : [];
  const [product] = responsible ? [] : await tx.select({ categoryId: productsTable.categoryId }).from(productsTable).where(eq(productsTable.id, bp.productId));
  const [categoryResponsible] = responsible || !product ? [] : await tx.select({ user: usersTable })
    .from(categoryResponsibleAssignmentsTable)
    .innerJoin(usersTable, eq(categoryResponsibleAssignmentsTable.userId, usersTable.id))
    .where(and(eq(categoryResponsibleAssignmentsTable.branchId, bp.branchId), eq(categoryResponsibleAssignmentsTable.categoryId, product.categoryId)));
  const [branchManager] = responsible || categoryResponsible ? [] : await tx.select({ user: usersTable })
    .from(branchUserAssignmentsTable)
    .innerJoin(usersTable, eq(branchUserAssignmentsTable.userId, usersTable.id))
    .where(and(eq(branchUserAssignmentsTable.branchId, bp.branchId), eq(usersTable.role, "branch_manager"))).limit(1);
  const [fallback] = responsible || categoryResponsible || branchManager ? [] : await tx.select().from(usersTable).where(eq(usersTable.role, "admin")).limit(1);
  const recipient = responsible ?? categoryResponsible?.user ?? branchManager?.user ?? fallback;
  const prefs = branch?.notificationPreferences ?? { email: false, inApp: true };
  const channels = [prefs.inApp !== false ? "in_app" : null, prefs.email ? "email_pending" : null].filter(Boolean) as string[];
  const [alert] = await tx.insert(inventoryAlertsTable).values({
    branchProductId: bp.id, branchId: bp.branchId, productId: bp.productId,
    state: nextState as "LOW_STOCK" | "OUT_OF_STOCK", type: nextState as "LOW_STOCK" | "OUT_OF_STOCK",
    stock: nextInventory, minStock: bp.minStock,
    responsibleName: responsible ? `${responsible.firstName ?? ""} ${responsible.lastName ?? ""}`.trim() : branch?.managerName,
    responsibleEmail: responsible?.email ?? branch?.managerEmail,
    responsibleUserId: recipient?.id, channels,
    deliveryState: channels.some((channel) => channel === "email_pending") ? "pending" : "not_sent",
  }).returning();
  if (recipient) await tx.insert(internalNotificationsTable).values({
    userId: recipient.id, branchId: bp.branchId, alertId: alert.id,
    title: `Inventory ${nextState.toLowerCase().replace("_", " ")}`,
    message: `Product inventory requires attention (${nextInventory} remaining).`,
  });
}

async function releaseExpiredReservations(): Promise<void> {
  await db.transaction(async (tx) => {
    const candidates = await tx.select({ orderId: inventoryReservationsTable.orderId })
      .from(inventoryReservationsTable)
      .where(and(eq(inventoryReservationsTable.status, "active"), lt(inventoryReservationsTable.expiresAt, new Date())))
      .groupBy(inventoryReservationsTable.orderId);
    for (const candidate of candidates) {
      const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, candidate.orderId)).for("update");
      if (!order || order.status !== "pending_payment") continue;
      const expired = await tx.update(inventoryReservationsTable).set({ status: "released" })
        .where(and(eq(inventoryReservationsTable.orderId, order.id), eq(inventoryReservationsTable.status, "active"))).returning();
      for (const r of expired) {
        const [bp] = await tx.update(branchProductsTable).set({ inventory: sql`${branchProductsTable.inventory} + ${r.quantity}` })
          .where(eq(branchProductsTable.id, r.branchProductId)).returning();
        if (!bp) continue;
        await applyInventoryAlert(tx, bp, bp.inventory);
        await tx.insert(inventoryLedgerTable).values({ branchProductId: r.branchProductId, orderId: r.orderId, movement: "release", quantityDelta: r.quantity, balanceAfter: bp.inventory, reason: "Reservation expired" });
      }
      if (expired.length) await tx.update(ordersTable).set({ status: "cancelled" }).where(and(eq(ordersTable.id, order.id), eq(ordersTable.status, "pending_payment")));
    }
  });
}

async function cartView(cartId: string): Promise<CartShape | undefined> {
  const [row] = await db.select({ cart: cartsTable, branch: branchesTable }).from(cartsTable)
    .innerJoin(branchesTable, eq(cartsTable.branchId, branchesTable.id)).where(eq(cartsTable.id, cartId));
  if (!row) return undefined;
  const items = await db.select({ item: cartItemsTable, product: productsTable, variant: productVariantsTable, branchProduct: branchProductsTable })
    .from(cartItemsTable).innerJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
    .leftJoin(productVariantsTable, eq(cartItemsTable.variantId, productVariantsTable.id))
    .leftJoin(branchProductsTable, and(
      eq(branchProductsTable.productId, cartItemsTable.productId),
      eq(branchProductsTable.branchId, row.cart.branchId),
    ))
    .where(eq(cartItemsTable.cartId, cartId));
  const lines = await Promise.all(items.map(async ({ item, product, variant, branchProduct }) => {
    const basePrice = variant?.price ?? branchProduct?.priceOverride ?? product.price;
    const legacySalePrice =
      variant?.salePrice ??
      branchProduct?.salePriceOverride ??
      product.salePrice;
    const promotion = branchProduct
      ? await getActivePromotion(product.id, row.cart.branchId)
      : undefined;
    const unitPrice = resolveCatalogPrice(
      basePrice,
      legacySalePrice,
      promotion?.promotion,
    ).finalPrice;
    return {
      id: item.id, productId: item.productId, variantId: item.variantId, sku: variant?.sku ?? product.sku,
      name: product.name, variantLabel: variant ? `${variant.name}: ${variant.value}` : null,
      quantity: item.quantity, unitPrice, lineTotal: unitPrice * item.quantity,
    };
  }));
  return { id: cartId, branch: serializeBranch(row.branch), items: lines, subtotal: lines.reduce((s, x) => s + x.lineTotal, 0),
    quantity: lines.reduce((s, x) => s + x.quantity, 0),
    maxLeadTimeMinutes: items.reduce((s, x) => Math.max(
      s,
      (x.product.minimumLeadTimeHours ?? 0) * 60,
      x.branchProduct?.preparationTimeMinutes ?? 0,
    ), 0) };
}

router.post("/cart/session", async (req, res): Promise<void> => {
  await releaseExpiredReservations();
  const parsed = CreateCartSessionBody.safeParse(req.body); if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const user = await getRequestUser(req);
  let cart = parsed.data.cartId ? (await db.select().from(cartsTable).where(eq(cartsTable.id, parsed.data.cartId)))[0] : undefined;
  if (cart && (cart.branchId !== parsed.data.branchId || cart.status !== "active")) { res.status(409).json({ error: "Cart branch mismatch" }); return; }
  if (!cart) [cart] = await db.insert(cartsTable).values({ id: id(), branchId: parsed.data.branchId, userId: user?.id }).returning();
  const view = await cartView(cart.id); res.json(CreateCartSessionResponse.parse(view));
});

router.get("/cart/:id", async (req, res): Promise<void> => {
  const p = GetCartParams.safeParse(req.params); if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const view = await cartView(p.data.id); if (!view) { res.status(404).json({ error: "Cart not found" }); return; } res.json(GetCartResponse.parse(view));
});

router.post("/cart/:id/branch-preview", async (req, res): Promise<void> => {
  const p = PreviewCartBranchParams.safeParse(req.params);
  const b = PreviewCartBranchBody.safeParse(req.body);
  if (!p.success || !b.success) { res.status(400).json({ error: "Invalid branch preview" }); return; }

  const [targetBranch] = await db.select().from(branchesTable)
    .where(and(eq(branchesTable.id, b.data.branchId), eq(branchesTable.active, true)));
  const [cart] = await db.select().from(cartsTable).where(eq(cartsTable.id, p.data.id));
  if (!targetBranch || !cart) { res.status(404).json({ error: "Cart or branch not found" }); return; }

  const rows = await db.select({
    item: cartItemsTable,
    product: productsTable,
    branchProduct: branchProductsTable,
  })
    .from(cartItemsTable)
    .innerJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
    .leftJoin(
      branchProductsTable,
      and(
        eq(branchProductsTable.productId, cartItemsTable.productId),
        eq(branchProductsTable.branchId, targetBranch.id),
      ),
    )
    .where(eq(cartItemsTable.cartId, cart.id));

  const previewItems = buildBranchPreviewItems(rows);
  const items = await Promise.all(previewItems.map(async (item) => {
    const promotion = await getActivePromotion(item.productId, b.data.branchId);
    if (!promotion) return item;
    return {
      ...item,
      salePrice: calculatePromotionPrice(item.price, promotion.promotion).finalPrice,
    };
  }));

  res.json(PreviewCartBranchResponse.parse({
    branch: serializeBranch(targetBranch),
    items,
    unavailableItems: items.filter((item) => !item.available),
  }));
});

router.post("/cart/:id/items", async (req, res): Promise<void> => {
  await releaseExpiredReservations();
  const p = AddCartItemParams.safeParse(req.params), b = AddCartItemBody.safeParse(req.body);
  if (!p.success || !b.success) { res.status(400).json({ error: "Invalid cart item" }); return; }
  const [cart] = await db.select({ cart: cartsTable, branch: branchesTable }).from(cartsTable).innerJoin(branchesTable, eq(cartsTable.branchId, branchesTable.id)).where(eq(cartsTable.id, p.data.id));
  const [product] = await db.select({ product: productsTable, bp: branchProductsTable }).from(branchProductsTable)
    .innerJoin(productsTable, eq(branchProductsTable.productId, productsTable.id))
    .where(and(eq(branchProductsTable.branchId, cart?.cart.branchId ?? -1), eq(productsTable.id, b.data.productId)));
  if (!cart || cart.cart.status !== "active" || !cart.branch.active || !product?.bp.available || product.product.status !== "active") { res.status(409).json({ error: "Product unavailable" }); return; }
  const variant = b.data.variantId ? (await db.select().from(productVariantsTable).where(and(eq(productVariantsTable.id, b.data.variantId), eq(productVariantsTable.productId, b.data.productId), eq(productVariantsTable.active, true))))[0] : undefined;
  if (b.data.variantId && !variant) { res.status(409).json({ error: "Variant unavailable" }); return; }
  const basePrice = variant?.price ?? product.bp.priceOverride ?? product.product.price;
  const legacySalePrice = variant?.salePrice ?? product.bp.salePriceOverride ?? product.product.salePrice;
  const promotion = await getActivePromotion(product.product.id, cart.cart.branchId);
  const price = resolveCatalogPrice(
    basePrice,
    legacySalePrice,
    promotion?.promotion,
  ).finalPrice;
  const existing = await db.select().from(cartItemsTable).where(and(eq(cartItemsTable.cartId, cart.cart.id), eq(cartItemsTable.productId, b.data.productId), b.data.variantId == null ? sql`${cartItemsTable.variantId} is null` : eq(cartItemsTable.variantId, b.data.variantId as number)));
  const resulting = (existing[0]?.quantity ?? 0) + b.data.quantity;
  if (resulting > product.bp.inventory) { res.status(409).json({ error: "Insufficient inventory" }); return; }
  if (existing[0]) await db.update(cartItemsTable).set({ quantity: resulting, unitPrice: price }).where(eq(cartItemsTable.id, existing[0].id));
  else await db.insert(cartItemsTable).values({ cartId: cart.cart.id, productId: b.data.productId, variantId: b.data.variantId ?? null, quantity: b.data.quantity, unitPrice: price });
  res.json(AddCartItemResponse.parse(await cartView(cart.cart.id)));
});

router.patch("/cart/:id/items/:itemId", async (req, res): Promise<void> => {
  await releaseExpiredReservations();
  const p = UpdateCartItemParams.safeParse(req.params), b = UpdateCartItemBody.safeParse(req.body);
  if (!p.success || !b.success) { res.status(400).json({ error: "Invalid item" }); return; }
  const [row] = await db.select({ item: cartItemsTable, bp: branchProductsTable }).from(cartItemsTable)
    .innerJoin(cartsTable, eq(cartItemsTable.cartId, cartsTable.id))
    .innerJoin(branchProductsTable, and(eq(branchProductsTable.branchId, cartsTable.branchId), eq(branchProductsTable.productId, cartItemsTable.productId)))
    .where(and(eq(cartItemsTable.id, p.data.itemId), eq(cartItemsTable.cartId, p.data.id)));
  if (!row || b.data.quantity > row.bp.inventory) { res.status(409).json({ error: "Insufficient inventory or item not found" }); return; }
  await db.update(cartItemsTable).set({ quantity: b.data.quantity }).where(eq(cartItemsTable.id, p.data.itemId));
  res.json(UpdateCartItemResponse.parse(await cartView(p.data.id)));
});
router.delete("/cart/:id/items/:itemId", async (req, res): Promise<void> => {
  const p = DeleteCartItemParams.safeParse(req.params); if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  await db.delete(cartItemsTable).where(and(eq(cartItemsTable.id, p.data.itemId), eq(cartItemsTable.cartId, p.data.id)));
  res.json(DeleteCartItemResponse.parse(await cartView(p.data.id)));
});

router.post("/fulfillment/delivery-validation", async (req, res): Promise<void> => {
  const p = ValidateDeliveryBody.safeParse(req.body); if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const [b] = await db.select().from(branchesTable).where(eq(branchesTable.id, p.data.branchId));
  const rawDistance = b?.latitude == null || b.longitude == null ? NaN : 6371 * 2 * Math.asin(Math.sqrt(Math.sin((p.data.latitude - b.latitude) * Math.PI / 360) ** 2 + Math.cos(b.latitude * Math.PI / 180) * Math.cos(p.data.latitude * Math.PI / 180) * Math.sin((p.data.longitude - b.longitude) * Math.PI / 360) ** 2));
  const distanceKm = Number.isFinite(rawDistance) ? rawDistance : 0;
  const radius = b?.deliveryRadiusKm ?? 0, reason = !b ? "Branch not found" : !b.deliveryAvailable ? "Delivery unavailable" : !Number.isFinite(rawDistance) ? "Branch location unavailable" : distanceKm > radius ? "Outside delivery radius" : b.minimumOrder != null && p.data.subtotal < b.minimumOrder ? "Minimum order not met" : null;
  res.json(ValidateDeliveryResponse.parse({ eligible: !reason, distanceKm, radiusKm: radius, deliveryFee: b?.deliveryFee ?? 0, reason }));
});

function mexicoDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function fulfillmentSchedule(
  branch: typeof branchesTable.$inferSelect,
  date: string,
  method: "pickup" | "delivery",
  cartLeadMinutes: number,
  now = Date.now(),
) {
  const day = new Date(`${date}T12:00:00Z`)
    .toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Mexico_City" })
    .toLowerCase();
  const hours = branch.hours.find((entry) => entry.date === date) ??
    branch.hours.find(
    (entry) => entry.day.toLowerCase() === day || entry.label.toLowerCase() === day,
  );
  if (!hours || hours.closed) return undefined;

  const intervalMs = branch.pickupSlotIntervalMinutes * 60_000;
  const open = new Date(`${date}T${hours.open}:00-06:00`).getTime();
  const close = new Date(`${date}T${hours.close}:00-06:00`).getTime();
  const leadMinutes =
    Math.max(cartLeadMinutes, branch.preparationTimeMinutes) +
    (method === "delivery" ? branch.deliveryTimeMinutes : 0);
  const anchor = open + leadMinutes * 60_000;
  const earliest = Math.max(anchor, now + leadMinutes * 60_000);
  const first =
    anchor + Math.max(0, Math.ceil((earliest - anchor) / intervalMs)) * intervalMs;

  return { anchor, first, close, intervalMs, capacity: branch.pickupSlotCapacity };
}

router.get("/fulfillment/slots", async (req, res): Promise<void> => {
  await releaseExpiredReservations();
  const p = ListFulfillmentSlotsQueryParams.safeParse(req.query); if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const [b] = await db.select().from(branchesTable).where(eq(branchesTable.id, p.data.branchId)); if (!b) { res.status(404).json({ error: "Branch not found" }); return; }
  if ((p.data.method === "pickup" && !b.pickupAvailable) || (p.data.method === "delivery" && !b.deliveryAvailable)) { res.json([]); return; }
  const cart = p.data.cartId ? await cartView(p.data.cartId) : undefined;
  if (cart && cart.branch.id !== b.id) { res.status(409).json({ error: "Cart branch mismatch" }); return; }
  const schedule = fulfillmentSchedule(b, p.data.date, p.data.method, cart?.maxLeadTimeMinutes ?? 0);
  if (!schedule) { res.json([]); return; }
  const slots = []; for (let t = schedule.first; t + schedule.intervalMs <= schedule.close; t += schedule.intervalMs) {
    const s = new Date(t), e = new Date(t + schedule.intervalMs);
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(ordersTable).where(and(eq(ordersTable.branchId, b.id), eq(ordersTable.scheduledStart, s), sql`${ordersTable.status} <> 'cancelled'`));
    slots.push({ start: s, end: e, available: count < schedule.capacity, remainingCapacity: Math.max(0, schedule.capacity - count) });
  } res.json(ListFulfillmentSlotsResponse.parse(slots));
});

router.post("/fulfillment/preview", async (req, res): Promise<void> => {
  await releaseExpiredReservations();
  const body = PreviewFulfillmentBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const cart = await cartView(body.data.cartId);
  if (!cart || !cart.items.length) { res.status(409).json({ error: "Cart is empty" }); return; }

  const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, cart.branch.id));
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }

  const scheduled = new Date(body.data.scheduledStart);
  const schedule = Number.isFinite(scheduled.getTime())
    ? fulfillmentSchedule(branch, mexicoDate(scheduled), body.data.fulfillmentMethod, cart.maxLeadTimeMinutes)
    : undefined;
  const slotWindowValid = Boolean(
    schedule &&
    scheduled.getTime() >= schedule.first &&
    scheduled.getTime() + schedule.intervalMs <= schedule.close &&
    (scheduled.getTime() - schedule.anchor) % schedule.intervalMs === 0,
  );
  const methodAvailable = body.data.fulfillmentMethod === "pickup"
    ? branch.pickupAvailable
    : branch.deliveryAvailable;
  const [{ count: booked }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(and(
      eq(ordersTable.branchId, branch.id),
      eq(ordersTable.scheduledStart, scheduled),
      eq(ordersTable.fulfillmentMethod, body.data.fulfillmentMethod),
      sql`${ordersTable.status} <> 'cancelled'`,
    ));
  const slotAvailable = Boolean(slotWindowValid && methodAvailable && schedule && booked < schedule.capacity);
  const slotReason = !methodAvailable
    ? body.data.fulfillmentMethod === "delivery"
      ? "Esta sucursal no ofrece delivery."
      : "Esta sucursal no ofrece pickup."
    : !slotWindowValid
    ? "Este horario ya no está disponible para la sucursal."
    : booked >= (schedule?.capacity ?? 0)
      ? "Este horario está lleno."
      : null;

  const rows = await db.select({ item: cartItemsTable, product: productsTable, branchProduct: branchProductsTable })
    .from(cartItemsTable)
    .innerJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
    .innerJoin(branchProductsTable, and(
      eq(branchProductsTable.productId, cartItemsTable.productId),
      eq(branchProductsTable.branchId, branch.id),
    ))
    .where(eq(cartItemsTable.cartId, cart.id));

  const items = rows.map(({ item, product, branchProduct }) => {
    const requiredLeadMinutes = Math.max(
      product.minimumLeadTimeHours * 60,
      branchProduct.preparationTimeMinutes ?? branch.preparationTimeMinutes,
    );
    const available = Boolean(
      slotAvailable &&
      product.status === "active" &&
      branchProduct.available &&
      branchProduct.inventory >= item.quantity &&
      scheduled.getTime() >= Date.now() + requiredLeadMinutes * 60_000,
    );
    return {
      cartItemId: item.id,
      productId: product.id,
      name: product.name,
      quantity: item.quantity,
      available,
      reason: available
        ? null
        : !slotAvailable
          ? slotReason
          : scheduled.getTime() < Date.now() + requiredLeadMinutes * 60_000
          ? `Requiere ${Math.ceil(requiredLeadMinutes / 60)} h de preparación.`
            : "No disponible para esta sucursal.",
    };
  });

  res.json(PreviewFulfillmentResponse.parse({
    scheduledStart: scheduled,
    slotAvailable,
    slotReason,
    items,
    unavailableItems: items.filter((item) => !item.available),
  }));
});

function orderShape(order: typeof ordersTable.$inferSelect, items: Array<typeof orderItemsTable.$inferSelect>) {
  return { ...order, items };
}
async function findOrder(orderId: string) {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) return undefined;
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
  return orderShape(order, items);
}

router.post("/orders", async (req, res): Promise<void> => {
  await releaseExpiredReservations();
  const b = CreateOrderBody.safeParse(req.body); if (!b.success) { res.status(400).json({ error: b.error.message }); return; }
  const requestUser = await getRequestUser(req);
  const cart = await cartView(b.data.cartId); if (!cart || !cart.items.length) { res.status(409).json({ error: "Cart is empty" }); return; }
  const currentItemRows = await db.select({ item: cartItemsTable, product: productsTable, variant: productVariantsTable, bp: branchProductsTable })
    .from(cartItemsTable).innerJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
    .leftJoin(productVariantsTable, eq(cartItemsTable.variantId, productVariantsTable.id))
    .innerJoin(cartsTable, eq(cartItemsTable.cartId, cartsTable.id))
    .innerJoin(branchProductsTable, and(eq(branchProductsTable.branchId, cartsTable.branchId), eq(branchProductsTable.productId, cartItemsTable.productId)))
    .where(eq(cartItemsTable.cartId, b.data.cartId));
  const currentItems = await Promise.all(currentItemRows.map(async (row) => {
    const basePrice = row.variant?.price ?? row.bp.priceOverride ?? row.product.price;
    const legacySalePrice = row.variant?.salePrice ?? row.bp.salePriceOverride ?? row.product.salePrice;
    const promotion = await getActivePromotion(row.product.id, cart.branch.id);
    return {
      ...row,
      serverPrice: resolveCatalogPrice(
        basePrice,
        legacySalePrice,
        promotion?.promotion,
      ).finalPrice,
    };
  }));
  const serverSubtotal = currentItems.reduce((sum, x) => sum + x.item.quantity * x.serverPrice, 0);
  if (currentItems.length !== cart.items.length || currentItems.some((x) => !x.product.status || x.product.status !== "active" || !x.bp.available || x.item.quantity > x.bp.inventory)) { res.status(409).json({ error: "Cart items unavailable" }); return; }
  const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, (await db.select({ branchId: cartsTable.branchId }).from(cartsTable).where(eq(cartsTable.id, b.data.cartId)))[0]?.branchId ?? -1));
  if (!branch || (b.data.fulfillmentMethod === "pickup" && !branch.pickupAvailable) || (b.data.fulfillmentMethod === "delivery" && (!branch.deliveryAvailable || !b.data.deliveryAddress || b.data.deliveryLatitude == null || b.data.deliveryLongitude == null))) { res.status(409).json({ error: "Invalid fulfillment" }); return; }
  if (branch.minimumOrder != null && serverSubtotal < branch.minimumOrder) { res.status(409).json({ error: "Minimum order not met" }); return; }
  if (b.data.fulfillmentMethod === "delivery") {
    const distance = branch.latitude == null || branch.longitude == null ? NaN : 6371 * 2 * Math.asin(Math.sqrt(
      Math.sin((b.data.deliveryLatitude! - branch.latitude) * Math.PI / 360) ** 2 +
      Math.cos(branch.latitude * Math.PI / 180) * Math.cos(b.data.deliveryLatitude! * Math.PI / 180) *
      Math.sin((b.data.deliveryLongitude! - branch.longitude) * Math.PI / 360) ** 2
    ));
    if (!Number.isFinite(distance) || distance > (branch.deliveryRadiusKm ?? 0)) { res.status(409).json({ error: "Delivery address outside radius" }); return; }
  }
  const deliveryFee = b.data.fulfillmentMethod === "delivery" ? branch.deliveryFee : 0;
  const orderId = id(), guestAccessToken = crypto.randomBytes(24).toString("hex"), scheduled = new Date(b.data.scheduledStart);
  const reservationExpiresAt = new Date(Date.now() + 15 * 60_000);
  const schedule = Number.isFinite(scheduled.getTime())
    ? fulfillmentSchedule(branch, mexicoDate(scheduled), b.data.fulfillmentMethod, cart.maxLeadTimeMinutes)
    : undefined;
  const isValidSlot =
    schedule &&
    scheduled.getTime() >= schedule.first &&
    scheduled.getTime() + schedule.intervalMs <= schedule.close &&
    (scheduled.getTime() - schedule.anchor) % schedule.intervalMs === 0;
  if (!isValidSlot) { res.status(409).json({ error: "Fulfillment slot unavailable" }); return; }
  try {
    const created = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${branch.id}:${scheduled.toISOString()}:${b.data.fulfillmentMethod}`}))`);
      const claimed = await tx.update(cartsTable).set({ status: "converted" })
        .where(and(eq(cartsTable.id, b.data.cartId), eq(cartsTable.status, "active"))).returning({ id: cartsTable.id });
      if (!claimed.length) throw new Error("CART_ALREADY_CONVERTED");
      const [{ count: booked }] = await tx.select({ count: sql<number>`count(*)::int` }).from(ordersTable)
        .where(and(eq(ordersTable.branchId, branch.id), eq(ordersTable.scheduledStart, scheduled), sql`${ordersTable.fulfillmentMethod} = ${b.data.fulfillmentMethod}`, sql`${ordersTable.status} <> 'cancelled'`));
      if (booked >= schedule.capacity) throw new Error("SLOT_FULL");
      const inserted = await tx.insert(ordersTable).values({ id: orderId, orderNumber: `M-${crypto.randomBytes(8).toString("hex").toUpperCase()}`, guestAccessToken, userId: requestUser?.id, branchId: branch.id, cartId: b.data.cartId, fulfillmentMethod: b.data.fulfillmentMethod, scheduledStart: scheduled, scheduledEnd: new Date(scheduled.getTime() + schedule.intervalMs), customerEmail: b.data.customerEmail, customerName: b.data.customerName, customerPhone: b.data.customerPhone, deliveryAddress: b.data.deliveryAddress ?? null, deliveryLatitude: b.data.deliveryLatitude ?? null, deliveryLongitude: b.data.deliveryLongitude ?? null, customerNotes: b.data.notes ?? null, subtotal: serverSubtotal, deliveryFee, total: serverSubtotal + deliveryFee }).returning();
      const o = inserted[0];
      for (const item of cart.items) {
        const source = currentItems.find((x) => x.item.id === item.id);
        const serverPrice = source?.serverPrice ?? item.unitPrice;
        const [bp] = await tx.select().from(branchProductsTable).where(and(eq(branchProductsTable.branchId, branch.id), eq(branchProductsTable.productId, item.productId)));
        const updated = await tx.update(branchProductsTable).set({ inventory: sql`${branchProductsTable.inventory} - ${item.quantity}` }).where(and(eq(branchProductsTable.id, bp.id), sql`${branchProductsTable.inventory} >= ${item.quantity}`)).returning({ inventory: branchProductsTable.inventory });
        if (!updated.length) throw new Error("OUT_OF_STOCK");
        await tx.insert(orderItemsTable).values({ orderId, productId: item.productId, variantId: item.variantId, sku: item.sku, name: item.name, variantLabel: item.variantLabel, quantity: item.quantity, unitPrice: serverPrice, lineTotal: serverPrice * item.quantity });
        await applyInventoryAlert(tx, { ...bp, inventory: updated[0].inventory }, updated[0].inventory);
        await tx.insert(inventoryReservationsTable).values({ orderId, branchProductId: bp.id, quantity: item.quantity, expiresAt: reservationExpiresAt });
        await tx.insert(inventoryLedgerTable).values({ branchProductId: bp.id, orderId, movement: "reserve", quantityDelta: -item.quantity, balanceAfter: updated[0].inventory, reason: "Order reservation" });
      }
      return o;
    });
    res.status(201).json(CreateOrderResponse.parse(await findOrder(created.id)));
  } catch (error) {
    if (error instanceof Error && ["OUT_OF_STOCK", "SLOT_FULL"].includes(error.message)) { res.status(409).json({ error: error.message === "SLOT_FULL" ? "Fulfillment slot unavailable" : "Item unavailable" }); return; }
    if (error instanceof Error && error.message === "CART_ALREADY_CONVERTED") { res.status(409).json({ error: "Cart already converted", code: "CART_ALREADY_CONVERTED" }); return; }
    if ((error as { code?: string })?.code === "23505") { res.status(409).json({ error: "Cart already converted", code: "CART_ALREADY_CONVERTED" }); return; }
    throw error;
  }
});

router.post("/orders/:id/payment", async (req, res): Promise<void> => {
  const body = StartOrderPaymentBody.safeParse(req.body ?? {});
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const order = await findOrder(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  const user = await getRequestUser(req);
  const canAccess =
    order &&
    ((order.userId != null && order.userId === user?.id) ||
      order.guestAccessToken === body.data.guestAccessToken);
  if (!canAccess) { res.status(404).json({ error: "Order not found" }); return; }
  res.status(503).json(StartOrderPaymentResponse.parse({ error: "Payment provider is not configured", code: "PAYMENT_PROVIDER_NOT_CONFIGURED" }));
});

async function sendOrder(req: any, res: any, guest = false): Promise<void> {
  const p = (guest ? GetGuestOrderDetailsParams : GetOrderDetailsParams).safeParse(req.params); if (!p.success) { res.status(400).json({ error: p.error.message }); return; }
  const token = guest ? (p.data as { id: string; token: string }).token : undefined;
  const order = await findOrder(p.data.id); if (!order || (guest ? order.guestAccessToken !== token : (await getRequestUser(req))?.id !== order.userId)) { res.status(404).json({ error: "Order not found" }); return; }
  res.json((guest ? GetGuestOrderDetailsResponse : GetOrderDetailsResponse).parse(order));
}
router.get("/orders/:id", requireAuth, (req, res) => sendOrder(req, res));
router.get("/guest/orders/:id/:token", (req, res) => sendOrder(req, res, true));
router.get("/me", requireAuth, async (req, res): Promise<void> => { const u = await getRequestUser(req); res.json(GetMeResponse.parse(u)); });
router.patch("/me", requireAuth, async (req, res): Promise<void> => { const b = UpdateMeBody.safeParse(req.body); if (!b.success) { res.status(400).json({ error: b.error.message }); return; } const u = await getRequestUser(req); const [updated] = await db.update(usersTable).set(b.data).where(eq(usersTable.id, u!.id)).returning(); res.json(UpdateMeResponse.parse(updated)); });
router.get("/me/orders", requireAuth, async (req, res): Promise<void> => { const u = await getRequestUser(req); const rows = await db.select({ id: ordersTable.id, orderNumber: ordersTable.orderNumber, status: ordersTable.status, total: ordersTable.total, createdAt: ordersTable.createdAt }).from(ordersTable).where(eq(ordersTable.userId, u!.id)).orderBy(desc(ordersTable.createdAt)); res.json(ListMyOrdersResponse.parse(rows)); });

export default router;
