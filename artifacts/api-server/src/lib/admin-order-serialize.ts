import { eq } from "drizzle-orm";
import { db, branchesTable, orderItemsTable, ordersTable } from "@workspace/db";

export function serializeOrderItems(
  items: Array<typeof orderItemsTable.$inferSelect>,
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
  }));
}

export function serializeAdminOrder(
  order: typeof ordersTable.$inferSelect,
  items: Array<typeof orderItemsTable.$inferSelect>,
  branchName?: string | null,
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
    fulfillmentMethod: order.fulfillmentMethod,
    scheduledStart: order.scheduledStart,
    scheduledEnd: order.scheduledEnd,
    customerEmail: order.customerEmail,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    deliveryAddress: order.deliveryAddress,
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
    items: serializeOrderItems(items),
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
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, order.id));
  return serializeAdminOrder(order, items, branch?.name);
}
