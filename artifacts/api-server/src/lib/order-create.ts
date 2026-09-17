import crypto from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import {
  db,
  branchesTable,
  cartsTable,
  cartItemsTable,
  productsTable,
  productVariantsTable,
  branchProductsTable,
  ordersTable,
  orderItemsTable,
  orderPaymentsTable,
  inventoryReservationsTable,
  couponsTable,
  type User,
} from "@workspace/db";
import { validateDeliveryCoverage, computeDeliveryFee } from "./delivery-validation";
import {
  resolveDeliveryAddress,
  type DeliveryAddressSnapshot,
} from "./delivery-address";
import {
  releaseOrderReservations,
  reserveBranchProduct,
} from "./inventory-hold";
import { logger } from "./logger";
import {
  fulfillmentSchedule,
  isValidSlotTime,
  mexicoDate,
  reservationTtlMinutesUntil,
} from "./fulfillment-schedule";
import { writeOrderAudit } from "./order-audit";
import {
  canAddManualLineItem,
  canOverrideAvailability,
  canUseCourtesyPayment,
  type StaffRole,
} from "./order-permissions";
import {
  priceOrderLines,
  type ManualDiscountInput,
  type OrderLineRequest,
  type OrderTotals,
} from "./order-pricing";
import { getActivePromotion, resolveCatalogPrice } from "./catalog";
import { resolveAvailableMethods, resolveCreateOrderPaymentState } from "./payments";

const id = () => crypto.randomUUID();

export class OrderCreateError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 409, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function releaseExpiredReservations(): Promise<void> {
  await db.transaction(async (tx) => {
    const candidates = await tx
      .select({ orderId: inventoryReservationsTable.orderId })
      .from(inventoryReservationsTable)
      .where(
        and(
          eq(inventoryReservationsTable.status, "active"),
          lt(inventoryReservationsTable.expiresAt, new Date()),
        ),
      )
      .groupBy(inventoryReservationsTable.orderId);
    for (const candidate of candidates) {
      const [order] = await tx
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, candidate.orderId))
        .for("update");
      if (!order || order.status !== "pending_payment") continue;
      await releaseOrderReservations(tx, order.id, "Reservation expired");
      await tx
        .update(ordersTable)
        .set({ status: "cancelled" })
        .where(
          and(eq(ordersTable.id, order.id), eq(ordersTable.status, "pending_payment")),
        );
    }
  });
}

export type CreateOrderInput = {
  orderSource:
    | "STOREFRONT"
    | "PHONE"
    | "WHATSAPP"
    | "POS"
    | "CORPORATE"
    | "ADMIN"
    | "OTHER";
  branchId: number;
  cartId?: string | null;
  userId?: string | null;
  createdByUserId?: string | null;
  actorRole?: StaffRole;
  fulfillmentMethod: "pickup" | "delivery";
  scheduledStart: Date | string;
  customerEmail: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress?: string | null;
  deliveryAddressSnapshot?: DeliveryAddressSnapshot | null;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
  customerNotes?: string | null;
  productionNotes?: string | null;
  internalNotes?: string | null;
  lines?: OrderLineRequest[];
  manualDiscount?: ManualDiscountInput | null;
  couponCode?: string | null;
  paymentMethod?:
    | "ONLINE"
    | "CASH"
    | "TERMINAL"
    | "TRANSFER"
    | "PAYMENT_LINK"
    | "PENDING"
    | "COURTESY"
    | "CASH_ON_PICKUP"
    | null;
  markPaid?: boolean;
  paymentReference?: string | null;
  paymentNote?: string | null;
  amountPaid?: number | null;
  overrides?: {
    stock?: boolean;
    slot?: boolean;
    delivery?: boolean;
    reason?: string;
  } | null;
  reservationTtlMinutes?: number;
  previewOnly?: boolean;
};

export type CreateOrderResult = OrderTotals & {
  order?: typeof ordersTable.$inferSelect;
  items?: Array<typeof orderItemsTable.$inferSelect>;
  errors: string[];
};

async function loadCartLines(cartId: string, branchId: number): Promise<{
  lines: OrderLineRequest[];
  maxLeadTimeMinutes: number;
}> {
  const rows = await db
    .select({
      item: cartItemsTable,
      product: productsTable,
      variant: productVariantsTable,
      bp: branchProductsTable,
    })
    .from(cartItemsTable)
    .innerJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
    .leftJoin(productVariantsTable, eq(cartItemsTable.variantId, productVariantsTable.id))
    .innerJoin(cartsTable, eq(cartItemsTable.cartId, cartsTable.id))
    .innerJoin(
      branchProductsTable,
      and(
        eq(branchProductsTable.branchId, cartsTable.branchId),
        eq(branchProductsTable.productId, cartItemsTable.productId),
      ),
    )
    .where(eq(cartItemsTable.cartId, cartId));

  const lines: OrderLineRequest[] = rows.map((row) => ({
    productId: row.item.productId,
    variantId: row.item.variantId,
    quantity: row.item.quantity,
  }));

  const maxLeadTimeMinutes = rows.reduce(
    (s, x) =>
      Math.max(
        s,
        (x.product.minimumLeadTimeHours ?? 0) * 60,
        x.bp?.preparationTimeMinutes ?? 0,
      ),
    0,
  );

  if (rows.some((r) => r.bp.branchId !== branchId)) {
    throw new OrderCreateError("Cart branch mismatch");
  }

  return { lines, maxLeadTimeMinutes };
}

async function computeLeadMinutes(
  branchId: number,
  lines: OrderLineRequest[],
  branchPrep: number,
): Promise<number> {
  let maxLead = branchPrep;
  for (const line of lines) {
    if (line.manualLineItem || line.productId == null) continue;
    const [row] = await db
      .select({
        product: productsTable,
        bp: branchProductsTable,
      })
      .from(productsTable)
      .leftJoin(
        branchProductsTable,
        and(
          eq(branchProductsTable.productId, productsTable.id),
          eq(branchProductsTable.branchId, branchId),
        ),
      )
      .where(eq(productsTable.id, line.productId));
    if (!row) continue;
    maxLead = Math.max(
      maxLead,
      (row.product.minimumLeadTimeHours ?? 0) * 60,
      row.bp?.preparationTimeMinutes ?? 0,
      branchPrep,
    );
  }
  return maxLead;
}

export async function createOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  await releaseExpiredReservations();

  const [branch] = await db
    .select()
    .from(branchesTable)
    .where(eq(branchesTable.id, input.branchId));
  if (!branch) throw new OrderCreateError("Branch not found", 404);

  let lines = input.lines ?? [];
  let maxLeadTimeMinutes = branch.preparationTimeMinutes;
  let cartId = input.cartId ?? null;

  if (cartId) {
    const [cart] = await db.select().from(cartsTable).where(eq(cartsTable.id, cartId));
    if (!cart || cart.status !== "active") {
      throw new OrderCreateError("Cart is empty or already converted");
    }
    if (cart.branchId !== input.branchId) {
      throw new OrderCreateError("Cart branch mismatch");
    }
    const loaded = await loadCartLines(cartId, input.branchId);
    lines = loaded.lines;
    maxLeadTimeMinutes = Math.max(maxLeadTimeMinutes, loaded.maxLeadTimeMinutes);
  } else {
    maxLeadTimeMinutes = await computeLeadMinutes(
      input.branchId,
      lines,
      branch.preparationTimeMinutes,
    );
  }

  if (!lines.length) throw new OrderCreateError("Cart is empty");

  const role = input.actorRole ?? "customer";
  const hasOverride =
    Boolean(input.overrides?.stock) ||
    Boolean(input.overrides?.slot) ||
    Boolean(input.overrides?.delivery);
  if (hasOverride) {
    if (!canOverrideAvailability(role)) {
      throw new OrderCreateError("Override no permitido para este rol", 403);
    }
    if (!input.overrides?.reason?.trim()) {
      throw new OrderCreateError("Motivo de override requerido", 400);
    }
  }

  for (const line of lines) {
    if (line.manualLineItem && !canAddManualLineItem(role)) {
      throw new OrderCreateError("Línea manual no permitida para este rol", 403);
    }
  }

  if (input.paymentMethod === "COURTESY" && !canUseCourtesyPayment(role)) {
    throw new OrderCreateError("Pago cortesía no permitido para este rol", 403);
  }

  const allowUnavailable = Boolean(input.overrides?.stock);
  const priced = await priceOrderLines({
    branchId: branch.id,
    lines,
    fulfillmentMethod: input.fulfillmentMethod,
    branch,
    manualDiscount: input.manualDiscount,
    couponCode: input.couponCode,
    actorRole: role === "customer" ? undefined : role,
    allowUnavailable,
  });

  if (priced.errors.length && !input.previewOnly) {
    throw new OrderCreateError(priced.errors[0], 409);
  }
  if (priced.errors.length && input.previewOnly) {
    return { ...priced, errors: priced.errors };
  }

  const deliveryResolved = resolveDeliveryAddress({
    fulfillmentMethod: input.fulfillmentMethod,
    snapshot: input.deliveryAddressSnapshot,
    deliveryAddress: input.deliveryAddress,
  });

  if (
    input.fulfillmentMethod === "pickup" && !branch.pickupAvailable
  ) {
    throw new OrderCreateError("Invalid fulfillment");
  }
  if (input.fulfillmentMethod === "delivery") {
    if (!branch.deliveryAvailable) throw new OrderCreateError("Invalid fulfillment");
    if (
      !deliveryResolved.formatted ||
      input.deliveryLatitude == null ||
      input.deliveryLongitude == null
    ) {
      throw new OrderCreateError("Invalid fulfillment");
    }
    const delivery = validateDeliveryCoverage({
      branch,
      latitude: input.deliveryLatitude,
      longitude: input.deliveryLongitude,
      subtotal: Math.max(0, priced.subtotal - priced.discountAmount - priced.couponDiscount),
    });
    if (!delivery.eligible && !input.overrides?.delivery) {
      throw new OrderCreateError(delivery.reason ?? "Delivery address outside radius");
    }
    priced.deliveryFee = input.overrides?.delivery
      ? computeDeliveryFee({
          branch,
          method: "delivery",
          subtotal: Math.max(0, priced.subtotal - priced.discountAmount - priced.couponDiscount),
        })
      : delivery.deliveryFee;
    priced.total = Math.round((Math.max(0, priced.subtotal - priced.discountAmount - priced.couponDiscount) + priced.deliveryFee) * 100) / 100;
  }

  if (
    branch.minimumOrder != null &&
    Math.max(0, priced.subtotal - priced.discountAmount - priced.couponDiscount) <
      branch.minimumOrder &&
    !input.overrides?.delivery
  ) {
    throw new OrderCreateError("Minimum order not met");
  }

  const scheduled = new Date(input.scheduledStart);
  const schedule = Number.isFinite(scheduled.getTime())
    ? fulfillmentSchedule(
        branch,
        mexicoDate(scheduled),
        input.fulfillmentMethod,
        maxLeadTimeMinutes,
      )
    : undefined;
  const slotOk = schedule && isValidSlotTime(schedule, scheduled);
  if (!slotOk && !input.overrides?.slot) {
    throw new OrderCreateError("Fulfillment slot unavailable");
  }
  if (!schedule && input.overrides?.slot) {
    throw new OrderCreateError("Fulfillment slot unavailable");
  }

  if (input.orderSource === "STOREFRONT") {
    const available = await resolveAvailableMethods({
      branchId: branch.id,
      fulfillmentMethod: input.fulfillmentMethod,
      audience: "storefront",
    });
    const requested =
      input.paymentMethod ??
      (input.fulfillmentMethod === "pickup" ? "CASH_ON_PICKUP" : "PENDING");
    if (available.length === 0) {
      if (requested !== "PENDING") {
        throw new OrderCreateError("Payment method not available", 400, "PAYMENT_METHOD_NOT_ALLOWED");
      }
    } else if (!available.some((method) => method.code === requested)) {
      throw new OrderCreateError("Payment method not available", 400, "PAYMENT_METHOD_NOT_ALLOWED");
    }
  }

  let paymentState;
  try {
    paymentState = resolveCreateOrderPaymentState({
      orderSource: input.orderSource,
      fulfillmentMethod: input.fulfillmentMethod,
      paymentMethod: input.paymentMethod,
      markPaid: input.markPaid,
      amountPaid: input.amountPaid,
      total: priced.total,
    });
  } catch (error) {
    const coded = error as Error & { status?: number; code?: string };
    if (coded.code === "PAYMENT_METHOD_NOT_ALLOWED") {
      throw new OrderCreateError(coded.message, coded.status ?? 400, coded.code);
    }
    throw error;
  }

  if (input.previewOnly) {
    return { ...priced, maxLeadTimeMinutes, errors: [] };
  }

  const immediatePaid = paymentState.immediatePaid;

  const orderId = id();
  const guestAccessToken = crypto.randomBytes(24).toString("hex");
  const intervalMs = schedule!.intervalMs;
  const scheduledEnd = new Date(scheduled.getTime() + intervalMs);
  const ttlMinutes =
    input.reservationTtlMinutes ??
    (input.orderSource === "STOREFRONT"
      ? reservationTtlMinutesUntil(scheduledEnd)
      : 15);
  const reservationExpiresAt = paymentState.skipTtlCancel
    ? new Date("2099-12-31T00:00:00.000Z")
    : new Date(Date.now() + ttlMinutes * 60_000);

  try {
    const created = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`${branch.id}:${scheduled.toISOString()}:${input.fulfillmentMethod}`}))`,
      );

      if (cartId) {
        const claimed = await tx
          .update(cartsTable)
          .set({ status: "converted" })
          .where(and(eq(cartsTable.id, cartId), eq(cartsTable.status, "active")))
          .returning({ id: cartsTable.id });
        if (!claimed.length) throw new OrderCreateError("Cart already converted", 409, "CART_ALREADY_CONVERTED");
      }

      if (!input.overrides?.slot) {
        const [{ count: booked }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(ordersTable)
          .where(
            and(
              eq(ordersTable.branchId, branch.id),
              eq(ordersTable.scheduledStart, scheduled),
              sql`${ordersTable.fulfillmentMethod} = ${input.fulfillmentMethod}`,
              sql`${ordersTable.status} <> 'cancelled'`,
            ),
          );
        if (booked >= schedule!.capacity) throw new Error("SLOT_FULL");
      }

      const status = paymentState.status;
      const paymentStatus = paymentState.paymentStatus;
      const amountPaid = paymentState.amountPaid;
      const now = new Date();

      const inserted = await tx
        .insert(ordersTable)
        .values({
          id: orderId,
          orderNumber: `M-${crypto.randomBytes(8).toString("hex").toUpperCase()}`,
          guestAccessToken,
          userId: input.userId ?? null,
          createdByUserId: input.createdByUserId ?? null,
          branchId: branch.id,
          cartId,
          orderSource: input.orderSource,
          status,
          paymentStatus,
          paymentMethod: paymentState.paymentMethod,
          paymentReference: input.paymentReference ?? null,
          paymentNote: input.paymentNote ?? null,
          amountPaid,
          paidAt: immediatePaid ? now : null,
          paidByUserId: immediatePaid ? input.createdByUserId ?? null : null,
          fulfillmentMethod: input.fulfillmentMethod,
          scheduledStart: scheduled,
          scheduledEnd,
          customerEmail: input.customerEmail,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          deliveryAddress: deliveryResolved.formatted,
          deliveryAddressSnapshot: deliveryResolved.snapshot,
          deliveryLatitude: input.deliveryLatitude ?? null,
          deliveryLongitude: input.deliveryLongitude ?? null,
          customerNotes: input.customerNotes ?? null,
          productionNotes: input.productionNotes ?? null,
          internalNotes: input.internalNotes ?? null,
          subtotal: priced.subtotal,
          promotionDiscountTotal: priced.promotionDiscountTotal,
          discountAmount: priced.discountAmount,
          discountPercent: priced.discountPercent,
          discountReason: input.manualDiscount?.reason ?? null,
          discountAppliedBy: priced.discountAmount > 0 ? input.createdByUserId ?? null : null,
          couponCode: priced.couponCode,
          couponDiscount: priced.couponDiscount,
          deliveryFee: priced.deliveryFee,
          total: priced.total,
          availabilityOverride: hasOverride,
          overrideReason: hasOverride ? input.overrides?.reason ?? null : null,
          overrideByUserId: hasOverride ? input.createdByUserId ?? null : null,
          overrideAt: hasOverride ? new Date() : null,
          inventoryCommittedAt: immediatePaid ? new Date() : null,
        })
        .returning();

      const order = inserted[0];

      await tx.insert(orderPaymentsTable).values({
        orderId,
        method: paymentState.paymentMethod,
        provider: paymentState.paymentMethod === "CASH_ON_PICKUP" ? "CASH_ON_PICKUP" : "MANUAL",
        amount: priced.total,
        currency: "MXN",
        status: immediatePaid ? "paid" : "unpaid",
        recordedByUserId: immediatePaid ? input.createdByUserId ?? null : null,
        note: input.paymentNote ?? null,
        paidAt: immediatePaid ? now : null,
      });

      for (const line of priced.lines) {
        await tx.insert(orderItemsTable).values({
          orderId,
          productId: line.productId,
          variantId: line.variantId,
          sku: line.sku,
          name: line.name,
          variantLabel: line.variantLabel,
          quantity: line.quantity,
          listUnitPrice: line.listUnitPrice,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
          promotionId: line.promotionId,
          manualLineItem: line.manualLineItem,
        });

        if (line.manualLineItem || line.productId == null) continue;

        const [bp] = await tx
          .select()
          .from(branchProductsTable)
          .where(
            and(
              eq(branchProductsTable.branchId, branch.id),
              eq(branchProductsTable.productId, line.productId),
            ),
          );
        if (!bp) throw new Error("OUT_OF_STOCK");

        await reserveBranchProduct(tx, {
          branchProduct: bp,
          quantity: line.quantity,
          orderId,
          immediatePaid,
          expiresAt: reservationExpiresAt,
          actorUserId: input.createdByUserId,
          reason: input.overrides?.stock ? "Order reservation (override)" : "Order reservation",
          allowOverride: Boolean(input.overrides?.stock),
        });
      }

      if (priced.couponCode) {
        await tx
          .update(couponsTable)
          .set({ redemptionCount: sql`${couponsTable.redemptionCount} + 1` })
          .where(eq(couponsTable.code, priced.couponCode));
      }

      await writeOrderAudit({
        tx,
        orderId,
        actorUserId: input.createdByUserId,
        action: input.orderSource === "STOREFRONT" ? "CREATED_STOREFRONT" : "CREATED_MANUAL",
        reason: input.overrides?.reason,
        payload: {
          orderSource: input.orderSource,
          paymentMethod: input.paymentMethod,
          total: priced.total,
        },
      });

      if (priced.discountAmount > 0) {
        await writeOrderAudit({
          tx,
          orderId,
          actorUserId: input.createdByUserId,
          action: "MANUAL_DISCOUNT",
          reason: input.manualDiscount?.reason,
          payload: {
            discountAmount: priced.discountAmount,
            discountPercent: priced.discountPercent,
          },
        });
      }

      if (hasOverride) {
        await writeOrderAudit({
          tx,
          orderId,
          actorUserId: input.createdByUserId,
          action: "AVAILABILITY_OVERRIDE",
          reason: input.overrides?.reason,
          payload: input.overrides,
        });
      }

      if (immediatePaid) {
        await writeOrderAudit({
          tx,
          orderId,
          actorUserId: input.createdByUserId,
          action: "PAYMENT_RECORDED",
          reason: input.paymentNote,
          payload: {
            paymentMethod: input.paymentMethod,
            paymentReference: input.paymentReference,
            amountPaid,
          },
        });
      }

      return order;
    });

    const items = await db
      .select()
      .from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, created.id));

    logger.info({
      event: "order_created",
      orderId: created.id,
      branchId: branch.id,
      total: priced.total,
      paymentStatus: created.paymentStatus,
      fulfillmentMethod: created.fulfillmentMethod,
      lineCount: items.length,
    }, "Order created");

    return { ...priced, maxLeadTimeMinutes, order: created, items, errors: [] };
  } catch (error) {
    if (error instanceof OrderCreateError) throw error;
    if (error instanceof Error && error.message === "SLOT_FULL") {
      throw new OrderCreateError("Fulfillment slot unavailable");
    }
    if (error instanceof Error && error.message === "OUT_OF_STOCK") {
      throw new OrderCreateError("Item unavailable");
    }
    if ((error as { code?: string })?.code === "23505") {
      throw new OrderCreateError("Cart already converted", 409, "CART_ALREADY_CONVERTED");
    }
    throw error;
  }
}

/** Reprice helper used by cart views to stay consistent with order pricing. */
export async function resolveLineServerPrice(params: {
  productId: number;
  branchId: number;
  basePrice: number;
  legacySalePrice: number | null;
}): Promise<number> {
  const promotion = await getActivePromotion(params.productId, params.branchId);
  return resolveCatalogPrice(
    params.basePrice,
    params.legacySalePrice,
    promotion?.promotion,
  ).finalPrice;
}

export async function findOrderWithItems(orderId: string) {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) return undefined;
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
  return { ...order, items };
}

export type { User };
