import type { User } from "@workspace/db";

export type StaffRole = User["role"];

const DISCOUNT_PERCENT_LIMITS: Record<string, number | null> = {
  staff: 0,
  branch_manager: 10,
  operations: 20,
  operations_manager: 20,
  manager: 20,
  admin: null,
  customer: 0,
};

export function maxManualDiscountPercent(role: StaffRole): number | null {
  if (Object.prototype.hasOwnProperty.call(DISCOUNT_PERCENT_LIMITS, role)) {
    return DISCOUNT_PERCENT_LIMITS[role] as number | null;
  }
  return 0;
}

export function canApplyManualDiscount(role: StaffRole, percentEquivalent: number): boolean {
  const limit = maxManualDiscountPercent(role);
  if (limit === null) return true;
  return percentEquivalent <= limit + 1e-9;
}

export function canOverrideAvailability(role: StaffRole): boolean {
  return (
    role === "branch_manager" ||
    role === "operations" ||
    role === "operations_manager" ||
    role === "manager" ||
    role === "admin"
  );
}

export function canAddManualLineItem(role: StaffRole): boolean {
  return canOverrideAvailability(role);
}

export function canUseCourtesyPayment(role: StaffRole): boolean {
  return (
    role === "operations" ||
    role === "operations_manager" ||
    role === "manager" ||
    role === "admin" ||
    role === "branch_manager"
  );
}

export function discountPercentEquivalent(params: {
  type: "percent" | "amount";
  value: number;
  subtotal: number;
}): number {
  if (params.type === "percent") return params.value;
  if (params.subtotal <= 0) return 0;
  return (params.value / params.subtotal) * 100;
}
