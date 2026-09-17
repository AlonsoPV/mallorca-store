import { availableStock } from "./inventory-status.ts";
import {
  calculatePromotionPrice,
  promotionStatus,
  resolveCatalogPrice,
  selectPromotionForBranch,
  type PromotionCandidate,
} from "./catalog-promotions.ts";

export type AdminAvailabilityInput = {
  branchId: number;
  branchSlug: string;
  branchName: string;
  available: boolean;
  inventory: number;
  reserved: number;
  minStock: number;
  criticalStock: number | null;
  autoAlertEnabled: boolean;
  alertState: string;
  priceOverride: number | null;
  salePriceOverride: number | null;
  basePrice: number;
  baseSalePrice: number | null;
  preparationTimeMinutes: number;
  pickupAvailable: boolean;
  deliveryAvailable: boolean;
  promotions?: PromotionCandidate[];
};

export function serializeAdminBranchAvailability(
  input: AdminAvailabilityInput,
  now = new Date(),
) {
  const physicalStock = input.inventory;
  const reservedStock = Math.max(0, input.reserved);
  const availableStockValue = availableStock(physicalStock, reservedStock);
  const resolvedBase = input.priceOverride ?? input.basePrice;
  const legacySalePrice =
    input.salePriceOverride !== null ? input.salePriceOverride : input.baseSalePrice;
  const promotion = selectPromotionForBranch(input.promotions, input.branchId);
  const promotionView = promotion
    ? {
        id: promotion.promotion.id,
        name: promotion.promotion.name,
        type: promotion.promotion.type,
        value: promotion.promotion.value,
        startsAt: promotion.promotion.startsAt,
        endsAt: promotion.promotion.endsAt,
        status: promotionStatus(promotion.promotion, now),
        ...calculatePromotionPrice(resolvedBase, promotion.promotion),
        branchIds: promotion.branchIds,
      }
    : null;
  const priced = resolveCatalogPrice(resolvedBase, legacySalePrice, promotion?.promotion);

  return {
    branchId: input.branchId,
    branchSlug: input.branchSlug,
    branchName: input.branchName,
    available: input.available,
    inventory: physicalStock,
    physicalStock,
    reservedStock,
    availableStock: availableStockValue,
    minStock: input.minStock,
    criticalStock: input.criticalStock,
    autoAlertEnabled: input.autoAlertEnabled,
    alertState: input.alertState,
    price: resolvedBase,
    salePrice: promotionView?.finalPrice ?? (priced.finalPrice === resolvedBase ? legacySalePrice : priced.finalPrice),
    priceOverride: input.priceOverride,
    salePriceOverride: input.salePriceOverride,
    preparationTimeMinutes: input.preparationTimeMinutes,
    pickupAvailable: input.pickupAvailable,
    deliveryAvailable: input.deliveryAvailable,
    promotion: promotionView,
  };
}

export function hydrateAdminBranchConfiguration(availability: {
  branchId: number;
  available: boolean;
  inventory: number;
  minStock?: number;
  criticalStock?: number | null;
  autoAlertEnabled?: boolean;
  priceOverride?: number | null;
  salePriceOverride?: number | null;
  price?: number;
  preparationTimeMinutes?: number;
  pickupAvailable?: boolean;
  deliveryAvailable?: boolean;
}) {
  return {
    available: availability.available,
    inventory: availability.inventory,
    minStock: availability.minStock ?? 0,
    criticalStock: availability.criticalStock ?? null,
    autoAlertEnabled: availability.autoAlertEnabled !== false,
    priceOverride: availability.priceOverride ?? null,
    salePriceOverride: availability.salePriceOverride ?? null,
    pickupAvailable: availability.pickupAvailable,
    deliveryAvailable: availability.deliveryAvailable,
    preparationTimeMinutes: availability.preparationTimeMinutes,
  };
}
