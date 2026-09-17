import { asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  branchesTable,
  orderAuditLogsTable,
  orderItemsTable,
  ordersTable,
  productsTable,
  usersTable,
} from "@workspace/db";

export function serializeOrderItems(
  items: Array<typeof orderItemsTable.$inferSelect & { imageUrl?: string | null }>,
) {
  return items.map((item) => ({
    id: item.id,
    productId: item.productId,
    variantId: item.variantId,
    sku: item.sku,
    name: item.name,
    variantLabel: item.variantLabel,
    quantity: item.quantity,
    listUnitPrice: item.listUnitPrice ?? null,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
    promotionId: item.promotionId ?? null,
    manualLineItem: item.manualLineItem ?? false,
    imageUrl: item.imageUrl ?? null,
  }));
}

export function serializeAuditEvents(
  rows: Array<{
    id: number;
    action: string;
    reason: string | null;
    actorUserId: string | null;
    createdAt: Date;
    payload: string | null;
    actorName?: string | null;
  }>,
) {
  return rows.map((row) => {
    let payload: Record<string, unknown> | null = null;
    if (row.payload) {
      try {
        payload = JSON.parse(row.payload) as Record<string, unknown>;
      } catch {
        payload = null;
      }
    }
    return {
      id: row.id,
      action: row.action,
      reason: row.reason,
      actorUserId: row.actorUserId,
      actorName: row.actorName ?? null,
      createdAt: row.createdAt,
      payload,
    };
  });
}

export function serializeAdminOrder(
  order: typeof ordersTable.$inferSelect,
  items: Array<typeof orderItemsTable.$inferSelect & { imageUrl?: string | null }>,
  branchName?: string | null,
  audit: ReturnType<typeof serializeAuditEvents> = [],
) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    guestAccessToken: order.guestAccessToken,
    orderSource: order.orderSource ?? "STOREFRONT",
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod ?? null,
    paymentReference: order.paymentReference ?? null,
    paymentNote: order.paymentNote ?? null,
    paymentLinkUrl: order.paymentLinkUrl ?? null,
    amountPaid: order.amountPaid ?? 0,
    paidAt: order.paidAt ?? null,
    paidByUserId: order.paidByUserId ?? null,
    fulfillmentMethod: order.fulfillmentMethod,
    scheduledStart: order.scheduledStart,
    scheduledEnd: order.scheduledEnd,
    customerEmail: order.customerEmail,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    deliveryAddress: order.deliveryAddress,
    deliveryAddressSnapshot: order.deliveryAddressSnapshot ?? null,
    customerNotes: order.customerNotes ?? null,
    productionNotes: order.productionNotes ?? null,
    internalNotes: order.internalNotes ?? null,
    subtotal: order.subtotal,
    promotionDiscountTotal: order.promotionDiscountTotal ?? 0,
    discountAmount: order.discountAmount ?? 0,
    discountPercent: order.discountPercent ?? null,
    discountReason: order.discountReason ?? null,
    couponCode: order.couponCode ?? null,
    couponDiscount: order.couponDiscount ?? 0,
    deliveryFee: order.deliveryFee,
    total: order.total,
    availabilityOverride: order.availabilityOverride ?? false,
    overrideReason: order.overrideReason ?? null,
    branchId: order.branchId,
    branchName: branchName ?? undefined,
    createdByUserId: order.createdByUserId ?? null,
    createdAt: order.createdAt,
    items: serializeOrderItems(items),
    audit,
  };
}

export async function loadAdminOrder(orderId: string) {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) return undefined;
  const [branch] = await db
    .select({ name: branchesTable.name })
    .from(branchesTable)
    .where(eq(branchesTable.id, order.branchId));
  const items = await db
    .select({
      item: orderItemsTable,
      imageUrl: productsTable.imageUrl,
    })
    .from(orderItemsTable)
    .leftJoin(productsTable, eq(productsTable.id, orderItemsTable.productId))
    .where(eq(orderItemsTable.orderId, order.id))
    .orderBy(asc(orderItemsTable.id));

  const auditRows = await db
    .select({
      id: orderAuditLogsTable.id,
      action: orderAuditLogsTable.action,
      reason: orderAuditLogsTable.reason,
      actorUserId: orderAuditLogsTable.actorUserId,
      createdAt: orderAuditLogsTable.createdAt,
      payload: orderAuditLogsTable.payload,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
    })
    .from(orderAuditLogsTable)
    .leftJoin(usersTable, eq(usersTable.id, orderAuditLogsTable.actorUserId))
    .where(eq(orderAuditLogsTable.orderId, order.id))
    .orderBy(desc(orderAuditLogsTable.createdAt));

  const audit = serializeAuditEvents(
    auditRows.map((row) => ({
      id: row.id,
      action: row.action,
      reason: row.reason,
      actorUserId: row.actorUserId,
      createdAt: row.createdAt,
      payload: row.payload,
      actorName: [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || null,
    })),
  );

  return serializeAdminOrder(
    order,
    items.map(({ item, imageUrl }) => ({ ...item, imageUrl })),
    branch?.name,
    audit,
  );
}

/** Keep export for callers that only need item ids — unused helper reserved. */
export async function loadProductImageMap(productIds: number[]) {
  if (!productIds.length) return new Map<number, string | null>();
  const rows = await db
    .select({ id: productsTable.id, imageUrl: productsTable.imageUrl })
    .from(productsTable)
    .where(inArray(productsTable.id, productIds));
  return new Map(rows.map((row) => [row.id, row.imageUrl]));
}
