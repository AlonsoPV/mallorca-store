import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  productsTable,
  productVariantsTable,
  branchProductsTable,
  couponsTable,
} from "@workspace/db";
import {
  getActivePromotionCandidates,
  resolveCatalogPrice,
  selectPromotionForBranch,
  type PromotionCandidate,
} from "./catalog";
import { computeDeliveryFee } from "./delivery-validation";
import { loadReservedByBranchProductIds, sellableUnits } from "./reserved-stock";
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
  return (await priceCatalogLines({
    branchId: params.branchId,
    lines: [params],
    allowUnavailable: params.allowUnavailable,
  }))[0];
}

async function priceCatalogLines(params: {
  branchId: number;
  lines: Array<{
    productId: number;
    variantId?: number | null;
    quantity: number;
  }>;
  allowUnavailable?: boolean;
}): Promise<PricedOrderLine[]> {
  if (!params.lines.length) return [];
  const productIds = [...new Set(params.lines.map((line) => line.productId))];
  const products = await db
    .select({ product: productsTable, bp: branchProductsTable })
    .from(branchProductsTable)
    .innerJoin(productsTable, eq(branchProductsTable.productId, productsTable.id))
    .where(
      and(
        eq(branchProductsTable.branchId, params.branchId),
        inArray(productsTable.id, productIds),
      ),
    );
  const productById = new Map(products.map((row) => [row.product.id, row]));
  const requestedVariantIds = [
    ...new Set(
      params.lines
        .filter((line) => line.variantId)
        .map((line) => line.variantId as number),
    ),
  ];
  const variants = requestedVariantIds.length
    ? await db
        .select()
        .from(productVariantsTable)
        .where(
          and(
            inArray(productVariantsTable.id, requestedVariantIds),
            eq(productVariantsTable.active, true),
          ),
        )
    : [];
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));
  const validItems = params.lines.flatMap((line) => {
    const product = productById.get(line.productId);
    const variant = line.variantId ? variantById.get(line.variantId) : undefined;
    return product && (!line.variantId || variant?.productId === line.productId)
      ? [{ line, product, variant }]
      : [];
  });
  const validProductIds = [...new Set(validItems.map(({ product }) => product.product.id))];
  const promotionsByProduct = validProductIds.length
    ? await getActivePromotionCandidates(validProductIds)
    : new Map();
  const branchProductIds = [
    ...new Set(validItems.map(({ product }) => product.bp.id)),
  ];
  const reservedByBranchProduct = await loadReservedByBranchProductIds(branchProductIds);

  return priceCatalogLinesFromLoadedData({
    ...params,
    products,
    variants,
    promotionsByProduct,
    reservedByBranchProduct,
  });
}

export function priceCatalogLinesFromLoadedData(params: {
  branchId: number;
  lines: Array<{
    productId: number;
    variantId?: number | null;
    quantity: number;
  }>;
  allowUnavailable?: boolean;
  products: Array<{
    product: typeof productsTable.$inferSelect;
    bp: typeof branchProductsTable.$inferSelect;
  }>;
  variants: Array<typeof productVariantsTable.$inferSelect>;
  promotionsByProduct: Map<number, PromotionCandidate[]>;
  reservedByBranchProduct: Map<number, number>;
}): PricedOrderLine[] {
  const productById = new Map(params.products.map((row) => [row.product.id, row]));
  const variantById = new Map(params.variants.map((variant) => [variant.id, variant]));

  return params.lines.map((line) => {
    const product = productById.get(line.productId);
    if (!product) {
      return {
        productId: line.productId,
        variantId: line.variantId ?? null,
        sku: "UNKNOWN",
        name: "Producto",
        variantLabel: null,
        quantity: line.quantity,
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

    const variant = line.variantId ? variantById.get(line.variantId) : undefined;
    if (line.variantId && variant?.productId !== line.productId) {
      return {
        productId: line.productId,
        variantId: line.variantId,
        sku: product.product.sku,
        name: product.product.name,
        variantLabel: null,
        quantity: line.quantity,
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
    const promotion = selectPromotionForBranch(
      params.promotionsByProduct.get(product.product.id),
      params.branchId,
    );
    const unitPrice = resolveCatalogPrice(
      listUnitPrice,
      legacySalePrice,
      promotion?.promotion,
    ).finalPrice;
    const reserved = params.reservedByBranchProduct.get(product.bp.id) ?? 0;
    const inventory = sellableUnits(product.bp.inventory, reserved);
    const available =
      product.product.status === "active" &&
      product.bp.available &&
      inventory >= line.quantity;
    const reason = available
      ? null
      : product.product.status !== "active"
        ? "Producto inactivo"
        : !product.bp.available
          ? "No disponible en esta sucursal"
          : inventory < line.quantity
            ? "Stock insuficiente"
            : null;

    return {
      productId: product.product.id,
      variantId: variant?.id ?? null,
      sku: variant?.sku ?? product.product.sku,
      name: product.product.name,
      variantLabel: variant ? `${variant.name}: ${variant.value}` : null,
      quantity: line.quantity,
      listUnitPrice,
      unitPrice,
      lineTotal: roundMoney(unitPrice * line.quantity),
      promotionId: promotion?.promotion.id ?? null,
      promotionDiscount: roundMoney(Math.max(0, listUnitPrice - unitPrice) * line.quantity),
      manualLineItem: false,
      available: available || Boolean(params.allowUnavailable),
      inventory,
      reason: params.allowUnavailable ? null : reason,
    };
  });
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
  const pricedByRequestIndex = new Map<number, PricedOrderLine>();
  const catalogIndexes: number[] = [];
  const catalogRequests: Array<{
    productId: number;
    variantId?: number | null;
    quantity: number;
  }> = [];

  for (const [index, line] of params.lines.entries()) {
    if (line.manualLineItem) {
      if (line.unitPrice == null || line.unitPrice < 0) {
        errors.push("Precio inválido en línea manual");
        continue;
      }
      pricedByRequestIndex.set(
        index,
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
    catalogIndexes.push(index);
    catalogRequests.push({
      productId: line.productId,
      variantId: line.variantId,
      quantity: line.quantity,
    });
  }

  const catalogLines = await priceCatalogLines({
    branchId: params.branchId,
    lines: catalogRequests,
    allowUnavailable: params.allowUnavailable,
  });
  catalogLines.forEach((line, index) => {
    pricedByRequestIndex.set(catalogIndexes[index], line);
  });
  const lines = [...pricedByRequestIndex.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, line]) => line);

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
