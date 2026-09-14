import type { branchesTable } from "@workspace/db";

export type DeliveryBranch = Pick<
  typeof branchesTable.$inferSelect,
  | "id"
  | "latitude"
  | "longitude"
  | "deliveryAvailable"
  | "deliveryRadiusKm"
  | "deliveryFee"
  | "freeDeliveryFrom"
  | "minimumOrder"
>;

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  return (
    6371 *
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin(((lat2 - lat1) * Math.PI) / 360) ** 2 +
          Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(((lon2 - lon1) * Math.PI) / 360) ** 2,
      ),
    )
  );
}

export type DeliveryValidationResult = {
  eligible: boolean;
  distanceKm: number;
  radiusKm: number;
  deliveryFee: number;
  reason: string | null;
};

export function validateDeliveryCoverage(params: {
  branch: DeliveryBranch | undefined;
  latitude: number;
  longitude: number;
  subtotal: number;
}): DeliveryValidationResult {
  const { branch, latitude, longitude, subtotal } = params;
  const radius = branch?.deliveryRadiusKm ?? 0;
  const rawDistance =
    branch?.latitude == null || branch.longitude == null
      ? NaN
      : haversineKm(branch.latitude, branch.longitude, latitude, longitude);
  const distanceKm = Number.isFinite(rawDistance) ? rawDistance : 0;
  const reason = !branch
    ? "Branch not found"
    : !branch.deliveryAvailable
      ? "Delivery unavailable"
      : !Number.isFinite(rawDistance)
        ? "Branch location unavailable"
        : distanceKm > radius
          ? "Outside delivery radius"
          : branch.minimumOrder != null && subtotal < branch.minimumOrder
            ? "Minimum order not met"
            : null;

  const baseFee = branch?.deliveryFee ?? 0;
  const freeFrom = branch?.freeDeliveryFrom;
  const deliveryFee =
    !reason && freeFrom != null && subtotal >= freeFrom ? 0 : baseFee;

  return {
    eligible: !reason,
    distanceKm,
    radiusKm: radius,
    deliveryFee: reason ? baseFee : deliveryFee,
    reason,
  };
}

export function computeDeliveryFee(params: {
  branch: DeliveryBranch;
  method: "pickup" | "delivery";
  subtotal: number;
}): number {
  if (params.method !== "delivery") return 0;
  const freeFrom = params.branch.freeDeliveryFrom;
  if (freeFrom != null && params.subtotal >= freeFrom) return 0;
  return params.branch.deliveryFee;
}
