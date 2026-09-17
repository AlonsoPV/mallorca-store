import { Router, type IRouter } from "express";
import { and, eq, sql, desc } from "drizzle-orm";
import {
  db, branchesTable, cartsTable, cartItemsTable, productsTable,
  productVariantsTable, branchProductsTable, ordersTable, usersTable,
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
  ListMyOrdersResponse, ListCheckoutPaymentMethodsQueryParams, ListCheckoutPaymentMethodsResponse,
  type Cart as CartShape,
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
import { applyInventoryAlert } from "../lib/inventory-alerts";
import { validateDeliveryCoverage } from "../lib/delivery-validation";
import {
  fulfillmentSchedule,
  isValidSlotTime,
  mexicoDate,
  reservationTtlMinutesUntil,
} from "../lib/fulfillment-schedule";
import {
  createOrder,
  findOrderWithItems,
  OrderCreateError,
  releaseExpiredReservations,
} from "../lib/order-create";
import { loadReservedByBranchProductIds, sellableUnits } from "../lib/reserved-stock";
import { resolveAvailableMethods } from "../lib/payments";

const router: IRouter = Router();
const id = () => crypto.randomUUID();

export { applyInventoryAlert };

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
    const resolved = resolveCatalogPrice(
      basePrice,
      legacySalePrice,
      promotion?.promotion,
    );
    const unitPrice = resolved.finalPrice;
    return {
      id: item.id, productId: item.productId, variantId: item.variantId, sku: variant?.sku ?? product.sku,
      name: product.name, variantLabel: variant ? `${variant.name}: ${variant.value}` : null,
      quantity: item.quantity, unitPrice, listUnitPrice: basePrice, lineTotal: unitPrice * item.quantity,
      imageUrl: product.imageUrl ?? null,
      promotionId: promotion?.promotion.id ?? null,
      promotionName: promotion?.promotion.name ?? null,
      savings: resolved.savings * item.quantity,
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
  const reservedByBp = await loadReservedByBranchProductIds(
    rows.flatMap((row) => (row.branchProduct?.id ? [row.branchProduct.id] : [])),
  );
  const sellableItems = previewItems.map((item, index) => {
    const bp = rows[index]?.branchProduct;
    if (!bp) return item;
    const inventory = sellableUnits(bp.inventory, reservedByBp.get(bp.id) ?? 0);
    return {
      ...item,
      inventory,
      available: Boolean(bp.available && inventory >= item.quantity && rows[index]?.product.status === "active"),
    };
  });
  const items = await Promise.all(sellableItems.map(async (item) => {
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
  const reserved = await loadReservedByBranchProductIds([product.bp.id]);
  const sellable = sellableUnits(product.bp.inventory, reserved.get(product.bp.id) ?? 0);
  if (resulting > sellable) { res.status(409).json({ error: "Insufficient inventory" }); return; }
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
  if (!row) { res.status(409).json({ error: "Insufficient inventory or item not found" }); return; }
  const reserved = await loadReservedByBranchProductIds([row.bp.id]);
  const sellable = sellableUnits(row.bp.inventory, reserved.get(row.bp.id) ?? 0);
  if (b.data.quantity > sellable) { res.status(409).json({ error: "Insufficient inventory or item not found" }); return; }
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
  const result = validateDeliveryCoverage({
    branch: b,
    latitude: p.data.latitude,
    longitude: p.data.longitude,
    subtotal: p.data.subtotal,
  });
  res.json(ValidateDeliveryResponse.parse(result));
});

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
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(ordersTable).where(and(
      eq(ordersTable.branchId, b.id),
      eq(ordersTable.scheduledStart, s),
      eq(ordersTable.fulfillmentMethod, p.data.method),
      sql`${ordersTable.status} <> 'cancelled'`,
    ));
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
  const slotWindowValid = Boolean(schedule && isValidSlotTime(schedule, scheduled));
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

  const reservedByBp = await loadReservedByBranchProductIds(rows.map(({ branchProduct }) => branchProduct.id));

  const items = rows.map(({ item, product, branchProduct }) => {
    const requiredLeadMinutes = Math.max(
      product.minimumLeadTimeHours * 60,
      branchProduct.preparationTimeMinutes ?? branch.preparationTimeMinutes,
    );
    const sellable = sellableUnits(branchProduct.inventory, reservedByBp.get(branchProduct.id) ?? 0);
    const available = Boolean(
      slotAvailable &&
      product.status === "active" &&
      branchProduct.available &&
      sellable >= item.quantity &&
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

function orderShape(order: NonNullable<Awaited<ReturnType<typeof findOrderWithItems>>>) {
  return order;
}

function storefrontOrderInput(
  cart: { branchId: number; id: string },
  body: {
    fulfillmentMethod: "pickup" | "delivery";
    scheduledStart: string | Date;
    customerEmail: string;
    customerName: string;
    customerPhone: string;
    notes?: string | null;
    paymentMethod?: "ONLINE" | "CASH" | "TERMINAL" | "TRANSFER" | "PAYMENT_LINK" | "PENDING" | "COURTESY" | "CASH_ON_PICKUP" | null;
    deliveryAddress?: string | null;
    deliveryAddressSnapshot?: {
      street?: string | null;
      externalNumber?: string | null;
      internalNumber?: string | null;
      neighborhood?: string | null;
      municipality?: string | null;
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
      references?: string | null;
    } | null;
    deliveryLatitude?: number | null;
    deliveryLongitude?: number | null;
  },
  userId?: string,
) {
  return {
    orderSource: "STOREFRONT" as const,
    branchId: cart.branchId,
    cartId: cart.id,
    userId,
    fulfillmentMethod: body.fulfillmentMethod,
    scheduledStart: body.scheduledStart,
    customerEmail: body.customerEmail,
    customerName: body.customerName,
    customerPhone: body.customerPhone,
    customerNotes: body.notes ?? null,
    deliveryAddress: body.fulfillmentMethod === "delivery" ? body.deliveryAddress ?? null : null,
    deliveryAddressSnapshot: body.fulfillmentMethod === "delivery" ? body.deliveryAddressSnapshot ?? null : null,
    deliveryLatitude: body.fulfillmentMethod === "delivery" ? body.deliveryLatitude ?? null : null,
    deliveryLongitude: body.fulfillmentMethod === "delivery" ? body.deliveryLongitude ?? null : null,
    paymentMethod: body.paymentMethod ?? (body.fulfillmentMethod === "pickup" ? "CASH_ON_PICKUP" : "PENDING"),
    markPaid: false as const,
  };
}

router.get("/checkout/payment-methods", async (req, res): Promise<void> => {
  const q = ListCheckoutPaymentMethodsQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  const methods = await resolveAvailableMethods({
    branchId: q.data.branchId,
    fulfillmentMethod: q.data.fulfillmentMethod,
    audience: "storefront",
  });
  res.json(ListCheckoutPaymentMethodsResponse.parse(methods));
});

router.post("/orders/preview", async (req, res): Promise<void> => {
  const b = CreateOrderBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: b.error.message }); return; }
  const requestUser = await getRequestUser(req);
  const [cart] = await db.select().from(cartsTable).where(eq(cartsTable.id, b.data.cartId));
  if (!cart) { res.status(409).json({ error: "Cart is empty" }); return; }
  try {
    const result = await createOrder({
      ...storefrontOrderInput(cart, b.data, requestUser?.id),
      previewOnly: true,
    });
    res.json({
      lines: result.lines,
      subtotal: result.subtotal,
      promotionDiscountTotal: result.promotionDiscountTotal,
      discountAmount: result.discountAmount,
      discountPercent: result.discountPercent,
      couponCode: result.couponCode,
      couponDiscount: result.couponDiscount,
      deliveryFee: result.deliveryFee,
      total: result.total,
      errors: result.errors,
    });
  } catch (error) {
    if (error instanceof OrderCreateError) {
      res.status(error.status).json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
      return;
    }
    throw error;
  }
});

router.post("/orders", async (req, res): Promise<void> => {
  const b = CreateOrderBody.safeParse(req.body);
  if (!b.success) { res.status(400).json({ error: b.error.message }); return; }
  const requestUser = await getRequestUser(req);
  const [cart] = await db.select().from(cartsTable).where(eq(cartsTable.id, b.data.cartId));
  if (!cart) { res.status(409).json({ error: "Cart is empty" }); return; }
  try {
    const result = await createOrder(storefrontOrderInput(cart, b.data, requestUser?.id));
    if (!result.order) { res.status(500).json({ error: "Order create failed" }); return; }
    const full = await findOrderWithItems(result.order.id);
    res.status(201).json(CreateOrderResponse.parse(orderShape(full!)));
  } catch (error) {
    if (error instanceof OrderCreateError) {
      res.status(error.status).json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
      return;
    }
    throw error;
  }
});

router.post("/orders/:id/payment", async (req, res): Promise<void> => {
  const body = StartOrderPaymentBody.safeParse(req.body ?? {});
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  const order = await findOrderWithItems(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
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
  const order = await findOrderWithItems(p.data.id); if (!order || (guest ? order.guestAccessToken !== token : (await getRequestUser(req))?.id !== order.userId)) { res.status(404).json({ error: "Order not found" }); return; }
  res.json((guest ? GetGuestOrderDetailsResponse : GetOrderDetailsResponse).parse(order));
}
router.get("/orders/:id", requireAuth, (req, res) => sendOrder(req, res));
router.get("/guest/orders/:id/:token", (req, res) => sendOrder(req, res, true));
router.get("/me", requireAuth, async (req, res): Promise<void> => { const u = await getRequestUser(req); res.json(GetMeResponse.parse(u)); });
router.patch("/me", requireAuth, async (req, res): Promise<void> => { const b = UpdateMeBody.safeParse(req.body); if (!b.success) { res.status(400).json({ error: b.error.message }); return; } const u = await getRequestUser(req); const [updated] = await db.update(usersTable).set(b.data).where(eq(usersTable.id, u!.id)).returning(); res.json(UpdateMeResponse.parse(updated)); });
router.get("/me/orders", requireAuth, async (req, res): Promise<void> => {
  const u = await getRequestUser(req);
  const rows = await db.select({
    id: ordersTable.id,
    orderNumber: ordersTable.orderNumber,
    status: ordersTable.status,
    total: ordersTable.total,
    createdAt: ordersTable.createdAt,
    scheduledStart: ordersTable.scheduledStart,
    branchId: ordersTable.branchId,
    branchName: branchesTable.name,
    customerName: ordersTable.customerName,
    customerEmail: ordersTable.customerEmail,
    customerPhone: ordersTable.customerPhone,
    fulfillmentMethod: ordersTable.fulfillmentMethod,
  })
    .from(ordersTable)
    .innerJoin(branchesTable, eq(ordersTable.branchId, branchesTable.id))
    .where(eq(ordersTable.userId, u!.id))
    .orderBy(desc(ordersTable.createdAt));
  res.json(ListMyOrdersResponse.parse(rows));
});

export default router;
