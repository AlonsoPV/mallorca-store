import { and, eq } from "drizzle-orm";
import {
  db,
  productsTable,
  productVariantsTable,
  branchProductsTable,
  couponsTable,
} from "@workspace/db";
import { getActivePromotion, resolveCatalogPrice } from "./catalog";
import { computeDeliveryFee } from "./delivery-validation";
import {
  canApplyManualDiscount,
  discountPercentEquivalent,
  type StaffRole,
} from "./order-permissions";

export type PricedOrderLine = {
  productId: number | null;
  variantId: number | null;
  sku: string;
  name: string;
  variantLabel: string | null;
  quantity: number;
  listUnitPrice: number;
  unitPrice: number;
  lineTotal: number;
  promotionId: number | null;
  promotionDiscount: number;
  manualLineItem: boolean;
  available: boolean;
  inventory: number | null;
  reason: string | null;
};

export type OrderLineRequest = {
  productId?: number | null;
  variantId?: number | null;
  quantity: number;
  manualLineItem?: boolean;
  description?: string;
  unitPrice?: number;
};

export type ManualDiscountInput = {
  type: "percent" | "amount";
  value: number;
  reason: string;
  scope?: "order" | "line";
  lineIndex?: number;
};

export type OrderTotals = {
  lines: PricedOrderLine[];
  subtotal: number;
  promotionDiscountTotal: number;
  discountAmount: number;
  discountPercent: number | null;
  couponCode: string | null;
  couponDiscount: number;
  deliveryFee: number;
  total: number;
  maxLeadTimeMinutes: number;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function priceCatalogLine(params: {
  branchId: number;
  productId: number;
  variantId?: number | null;
  quantity: number;
  allowUnavailable?: boolean;
}): Promise<PricedOrderLine> {
  const [product] = await db
    .select({ product: productsTable, bp: branchProductsTable })
    .from(branchProductsTable)
    .innerJoin(productsTable, eq(branchProductsTable.productId, productsTable.id))
    .where(
      and(
        eq(branchProductsTable.branchId, params.branchId),
        eq(productsTable.id, params.productId),
      ),
    );
  if (!product) {
    return {
      productId: params.productId,
      variantId: params.variantId ?? null,
      sku: "UNKNOWN",
      name: "Producto",
      variantLabel: null,
      quantity: params.quantity,
      listUnitPrice: 0,
      unitPrice: 0,
      lineTotal: 0,
      promotionId: null,
      promotionDiscount: 0,
      manualLineItem: false,
      available: false,
      inventory: null,
      reason: "Producto no encontrado en la sucursal",
    };
  }

  const variant = params.variantId
    ? (
        await db
          .select()
          .from(productVariantsTable)
          .where(
            and(
              eq(productVariantsTable.id, params.variantId),
              eq(productVariantsTable.productId, params.productId),
              eq(productVariantsTable.active, true),
            ),
          )
      )[0]
    : undefined;

  if (params.variantId && !variant) {
    return {
      productId: params.productId,
      variantId: params.variantId,
      sku: product.product.sku,
      name: product.product.name,
      variantLabel: null,
      quantity: params.quantity,
      listUnitPrice: 0,
      unitPrice: 0,
      lineTotal: 0,
      promotionId: null,
      promotionDiscount: 0,
      manualLineItem: false,
      available: false,
      inventory: product.bp.inventory,
      reason: "Variante no disponible",
    };
  }

  const listUnitPrice = variant?.price ?? product.bp.priceOverride ?? product.product.price;
  const legacySalePrice =
    variant?.salePrice ?? product.bp.salePriceOverride ?? product.product.salePrice;
  const promotion = await getActivePromotion(product.product.id, params.branchId);
  const resolved = resolveCatalogPrice(listUnitPrice, legacySalePrice, promotion?.promotion);
  const unitPrice = resolved.finalPrice;
  const available =
    product.product.status === "active" &&
    product.bp.available &&
    product.bp.inventory >= params.quantity;
  const reason = available
    ? null
    : product.product.status !== "active"
      ? "Producto inactivo"
      : !product.bp.available
        ? "No disponible en esta sucursal"
        : product.bp.inventory < params.quantity
          ? "Stock insuficiente"
          : null;

  return {
    productId: product.product.id,
    variantId: variant?.id ?? null,
    sku: variant?.sku ?? product.product.sku,
    name: product.product.name,
    variantLabel: variant ? `${variant.name}: ${variant.value}` : null,
    quantity: params.quantity,
    listUnitPrice,
    unitPrice,
    lineTotal: roundMoney(unitPrice * params.quantity),
    promotionId: promotion?.promotion.id ?? null,
    promotionDiscount: roundMoney(Math.max(0, listUnitPrice - unitPrice) * params.quantity),
    manualLineItem: false,
    available: available || Boolean(params.allowUnavailable),
    inventory: product.bp.inventory,
    reason: params.allowUnavailable ? null : reason,
  };
}

export function priceManualLine(params: {
  description: string;
  quantity: number;
  unitPrice: number;
}): PricedOrderLine {
  const unitPrice = roundMoney(params.unitPrice);
  return {
    productId: null,
    variantId: null,
    sku: "MANUAL",
    name: params.description.trim() || "Concepto manual",
    variantLabel: null,
    quantity: params.quantity,
    listUnitPrice: unitPrice,
    unitPrice,
    lineTotal: roundMoney(unitPrice * params.quantity),
    promotionId: null,
    promotionDiscount: 0,
    manualLineItem: true,
    available: true,
    inventory: null,
    reason: null,
  };
}

export async function resolveCouponDiscount(params: {
  code?: string | null;
  subtotal: number;
}): Promise<{ code: string | null; discount: number; error?: string }> {
  const raw = params.code?.trim();
  if (!raw) return { code: null, discount: 0 };
  const [coupon] = await db
    .select()
    .from(couponsTable)
    .where(eq(couponsTable.code, raw.toUpperCase()));
  if (!coupon || !coupon.active) return { code: null, discount: 0, error: "Cupón inválido" };
  const now = Date.now();
  if (coupon.startsAt && coupon.startsAt.getTime() > now) {
    return { code: null, discount: 0, error: "Cupón aún no vigente" };
  }
  if (coupon.endsAt && coupon.endsAt.getTime() < now) {
    return { code: null, discount: 0, error: "Cupón expirado" };
  }
  if (coupon.maxRedemptions != null && coupon.redemptionCount >= coupon.maxRedemptions) {
    return { code: null, discount: 0, error: "Cupón agotado" };
  }
  if (coupon.minSubtotal != null && params.subtotal < coupon.minSubtotal) {
    return { code: null, discount: 0, error: "Subtotal insuficiente para el cupón" };
  }
  const discount =
    coupon.type === "percentage"
      ? roundMoney(params.subtotal * (coupon.value / 100))
      : roundMoney(Math.min(coupon.value, params.subtotal));
  return { code: coupon.code, discount };
}

export async function priceOrderLines(params: {
  branchId: number;
  lines: OrderLineRequest[];
  fulfillmentMethod: "pickup" | "delivery";
  branch: {
    deliveryFee: number;
    freeDeliveryFrom: number | null;
    preparationTimeMinutes: number;
  };
  manualDiscount?: ManualDiscountInput | null;
  couponCode?: string | null;
  actorRole?: StaffRole;
  allowUnavailable?: boolean;
}): Promise<OrderTotals & { errors: string[] }> {
  const errors: string[] = [];
  const lines: PricedOrderLine[] = [];

  for (const line of params.lines) {
    if (line.manualLineItem) {
      if (line.unitPrice == null || line.unitPrice < 0) {
        errors.push("Precio inválido en línea manual");
        continue;
      }
      lines.push(
        priceManualLine({
          description: line.description ?? "Concepto manual",
          quantity: line.quantity,
          unitPrice: line.unitPrice,
        }),
      );
      continue;
    }
    if (line.productId == null) {
      errors.push("Producto requerido");
      continue;
    }
    lines.push(
      await priceCatalogLine({
        branchId: params.branchId,
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
        allowUnavailable: params.allowUnavailable,
      }),
    );
  }

  for (const line of lines) {
    if (!line.available && !line.manualLineItem) {
      errors.push(line.reason ?? `No disponible: ${line.name}`);
    }
  }

  const subtotal = roundMoney(lines.reduce((s, l) => s + l.lineTotal, 0));
  const promotionDiscountTotal = roundMoney(
    lines.reduce((s, l) => s + l.promotionDiscount, 0),
  );

  let discountAmount = 0;
  let discountPercent: number | null = null;
  if (params.manualDiscount) {
    const pct = discountPercentEquivalent({
      type: params.manualDiscount.type,
      value: params.manualDiscount.value,
      subtotal,
    });
    if (params.actorRole && !canApplyManualDiscount(params.actorRole, pct)) {
      errors.push("Descuento manual excede el límite del rol");
    } else if (!params.manualDiscount.reason?.trim()) {
      errors.push("Motivo de descuento requerido");
    } else {
      discountPercent = params.manualDiscount.type === "percent" ? params.manualDiscount.value : null;
      discountAmount =
        params.manualDiscount.type === "percent"
          ? roundMoney(subtotal * (params.manualDiscount.value / 100))
          : roundMoney(Math.min(params.manualDiscount.value, subtotal));
    }
  }

  const coupon = await resolveCouponDiscount({
    code: params.couponCode,
    subtotal: Math.max(0, subtotal - discountAmount),
  });
  if (coupon.error) errors.push(coupon.error);

  const afterDiscounts = Math.max(0, roundMoney(subtotal - discountAmount - coupon.discount));
  const deliveryFee = computeDeliveryFee({
    branch: params.branch as any,
    method: params.fulfillmentMethod,
    subtotal: afterDiscounts,
  });
  const total = roundMoney(afterDiscounts + deliveryFee);

  return {
    lines,
    subtotal,
    promotionDiscountTotal,
    discountAmount,
    discountPercent,
    couponCode: coupon.code,
    couponDiscount: coupon.discount,
    deliveryFee,
    total,
    maxLeadTimeMinutes: 0,
    errors,
  };
}
