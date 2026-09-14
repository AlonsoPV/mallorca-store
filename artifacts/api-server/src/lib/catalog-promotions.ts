export type PromotionType = "fixed" | "percentage" | "amount";

export type PromotionCandidate = {
  promotion: {
    id: number;
    productId: number;
    name: string;
    type: PromotionType;
    value: number;
    startsAt: Date;
    endsAt: Date;
    createdAt: Date;
    cancelledAt?: Date | null;
  };
  branchIds: number[];
};

export type PromotionStatus = "scheduled" | "active" | "finished" | "cancelled";

export function promotionStatus(
  promotion: Pick<PromotionCandidate["promotion"], "startsAt" | "endsAt" | "cancelledAt">,
  now = new Date(),
): PromotionStatus {
  if (promotion.cancelledAt) return "cancelled";
  if (promotion.startsAt.getTime() > now.getTime()) return "scheduled";
  if (promotion.endsAt.getTime() <= now.getTime()) return "finished";
  return "active";
}

export function calculatePromotionPrice(
  basePrice: number,
  promotion: Pick<PromotionCandidate["promotion"], "type" | "value">,
) {
  const safeBase = Math.max(0, Number(basePrice) || 0);
  const value = Math.max(0, Number(promotion.value) || 0);
  const rawPrice =
    promotion.type === "fixed"
      ? value
      : promotion.type === "percentage"
        ? safeBase * (1 - Math.min(100, value) / 100)
        : safeBase - value;
  const finalPrice = Math.round(Math.max(0, Math.min(safeBase, rawPrice)) * 100) / 100;
  return {
    finalPrice,
    savings: Math.round((safeBase - finalPrice) * 100) / 100,
  };
}

export function selectPromotionForBranch(
  candidates: PromotionCandidate[] | undefined,
  branchId: number,
): PromotionCandidate | undefined {
  return [...(candidates ?? [])]
    .filter(
      ({ branchIds }) => branchIds.length === 0 || branchIds.includes(branchId),
    )
    .sort((a, b) => {
      const aSpecific = a.branchIds.length > 0 ? 1 : 0;
      const bSpecific = b.branchIds.length > 0 ? 1 : 0;
      return (
        bSpecific - aSpecific ||
        b.promotion.createdAt.getTime() - a.promotion.createdAt.getTime() ||
        b.promotion.id - a.promotion.id
      );
    })[0];
}