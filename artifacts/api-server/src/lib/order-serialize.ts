type OrderItemRow = {
  id: number;
  productId: number | null;
  variantId: number | null;
  sku: string;
  name: string;
  variantLabel: string | null;
  quantity: number;
  listUnitPrice: number | null;
  unitPrice: number;
  lineTotal: number;
  promotionId: number | null;
  manualLineItem?: boolean | null;
  imageUrl?: string | null;
};

type OrderRow = {
  id: string;
  orderNumber: string;
  guestAccessToken: string;
  orderSource?: string | null;
  status: string;
  paymentStatus: string;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  paymentNote?: string | null;
  paymentLinkUrl?: string | null;
  amountPaid?: number | null;
  paidAt?: Date | null;
  paidByUserId?: string | null;
  fulfillmentMethod: "pickup" | "delivery";
  scheduledStart: Date;
  scheduledEnd: Date;
  customerEmail: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string | null;
  deliveryAddressSnapshot?: unknown;
  customerNotes?: string | null;
  productionNotes?: string | null;
  internalNotes?: string | null;
  subtotal: number;
  promotionDiscountTotal?: number | null;
  discountAmount?: number | null;
  discountPercent?: number | null;
  discountReason?: string | null;
  couponCode?: string | null;
  couponDiscount?: number | null;
  deliveryFee: number;
  total: number;
  availabilityOverride?: boolean | null;
  overrideReason?: string | null;
  branchId: number;
  createdByUserId?: string | null;
  createdAt?: Date;
};

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function serializeOrderItems(items: Array<OrderItemRow & { imageUrl?: string | null }>) {
  return items.map((item) => ({
    id: item.id,
    productId: item.productId,
    variantId: item.variantId,
    sku: item.sku,
    name: item.name,
    variantLabel: item.variantLabel ?? null,
    quantity: item.quantity,
    listUnitPrice: item.listUnitPrice == null ? null : asNumber(item.listUnitPrice),
    unitPrice: asNumber(item.unitPrice),
    lineTotal: asNumber(item.lineTotal),
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
  order: OrderRow,
  items: Array<OrderItemRow & { imageUrl?: string | null }>,
  branchName?: string | null,
  audit: ReturnType<typeof serializeAuditEvents> = [],
  payment?: { providerCheckoutId?: string | null; providerPaymentId?: string | null } | null,
) {
  const snapshot = order.deliveryAddressSnapshot;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    guestAccessToken: order.guestAccessToken,
    orderSource: order.orderSource ?? "STOREFRONT",
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod ?? null,
    paymentReference: order.paymentReference ?? payment?.providerPaymentId ?? null,
    providerCheckoutId: payment?.providerCheckoutId ?? null,
    providerPaymentId: payment?.providerPaymentId ?? order.paymentReference ?? null,
    paymentNote: order.paymentNote ?? null,
    paymentLinkUrl: order.paymentLinkUrl ?? null,
    amountPaid: asNumber(order.amountPaid, 0),
    paidAt: order.paidAt ?? null,
    paidByUserId: order.paidByUserId ?? null,
    fulfillmentMethod: order.fulfillmentMethod,
    scheduledStart: order.scheduledStart,
    scheduledEnd: order.scheduledEnd,
    customerEmail: order.customerEmail,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    deliveryAddress: order.deliveryAddress ?? null,
    deliveryAddressSnapshot: snapshot && typeof snapshot === "object" ? snapshot : undefined,
    customerNotes: order.customerNotes ?? null,
    productionNotes: order.productionNotes ?? null,
    internalNotes: order.internalNotes ?? null,
    subtotal: asNumber(order.subtotal),
    promotionDiscountTotal: asNumber(order.promotionDiscountTotal, 0),
    discountAmount: asNumber(order.discountAmount, 0),
    discountPercent: order.discountPercent == null ? null : asNumber(order.discountPercent),
    discountReason: order.discountReason ?? null,
    couponCode: order.couponCode ?? null,
    couponDiscount: asNumber(order.couponDiscount, 0),
    deliveryFee: asNumber(order.deliveryFee, 0),
    total: asNumber(order.total),
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

export function serializeStorefrontOrderDetails(
  order: OrderRow,
  items: Array<OrderItemRow & { imageUrl?: string | null }>,
  branchName?: string | null,
) {
  return serializeAdminOrder(order, items, branchName);
}
