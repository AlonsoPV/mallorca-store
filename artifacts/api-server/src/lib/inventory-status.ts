/**
 * Pure inventory status helpers (no DB) — used by InventoryAlertService and tests.
 */

export type InventoryStatus =
  | "NORMAL"
  | "LOW_STOCK"
  | "CRITICAL_STOCK"
  | "OUT_OF_STOCK";

export type AutomaticAlertType = "LOW_STOCK" | "CRITICAL_STOCK" | "OUT_OF_STOCK";

export function availableStock(inventory: number, reserved: number): number {
  return Math.max(0, inventory - Math.max(0, reserved));
}

/**
 * Derive inventory status from available stock + thresholds.
 * - minStock <= 0 means "no low threshold configured" (no LOW_STOCK).
 * - criticalStock null/undefined means no CRITICAL alerts.
 * OUT_OF_STOCK always when available <= 0.
 */
export function deriveInventoryStatus(
  available: number,
  minStock: number,
  criticalStock?: number | null,
): InventoryStatus {
  if (available <= 0) return "OUT_OF_STOCK";
  if (
    criticalStock != null &&
    criticalStock > 0 &&
    available <= criticalStock
  ) {
    return "CRITICAL_STOCK";
  }
  if (minStock > 0 && available <= minStock) return "LOW_STOCK";
  return "NORMAL";
}

/** @deprecated Prefer deriveInventoryStatus with available + critical. */
export function stockState(inventory: number, minStock: number): InventoryStatus {
  return deriveInventoryStatus(inventory, minStock, null);
}

export function enteredAlertState(
  previous: InventoryStatus,
  next: InventoryStatus,
): boolean {
  return previous !== next && next !== "NORMAL";
}

/** Alert types that should auto-resolve when status returns to NORMAL or above that severity. */
export function automaticTypesToResolve(
  previous: InventoryStatus,
  next: InventoryStatus,
): AutomaticAlertType[] {
  if (previous === next) return [];
  const resolve: AutomaticAlertType[] = [];
  if (previous === "OUT_OF_STOCK" && next !== "OUT_OF_STOCK") {
    resolve.push("OUT_OF_STOCK");
  }
  if (
    (previous === "CRITICAL_STOCK" || previous === "OUT_OF_STOCK") &&
    next !== "CRITICAL_STOCK" &&
    next !== "OUT_OF_STOCK"
  ) {
    resolve.push("CRITICAL_STOCK");
  }
  if (previous !== "NORMAL" && next === "NORMAL") {
    resolve.push("LOW_STOCK", "CRITICAL_STOCK", "OUT_OF_STOCK");
  } else if (previous === "LOW_STOCK" && (next === "NORMAL" || next === "CRITICAL_STOCK" || next === "OUT_OF_STOCK")) {
    if (next === "NORMAL") resolve.push("LOW_STOCK");
  }
  return [...new Set(resolve)];
}

export function alertTypeForStatus(
  status: InventoryStatus,
): AutomaticAlertType | null {
  if (status === "NORMAL") return null;
  return status;
}

export function defaultPriorityForType(
  type: AutomaticAlertType | string,
): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (type === "OUT_OF_STOCK" || type === "CRITICAL_STOCK") return "CRITICAL";
  if (type === "LOW_STOCK") return "HIGH";
  return "MEDIUM";
}

export function predictAlertOnStockChange(input: {
  previousAvailable: number;
  nextAvailable: number;
  minStock: number;
  criticalStock?: number | null;
  autoAlertEnabled?: boolean;
}): { willTriggerAlert: boolean; type: AutomaticAlertType | null; nextStatus: InventoryStatus } {
  const auto = input.autoAlertEnabled !== false;
  const prev = deriveInventoryStatus(
    input.previousAvailable,
    input.minStock,
    input.criticalStock,
  );
  const next = deriveInventoryStatus(
    input.nextAvailable,
    input.minStock,
    input.criticalStock,
  );
  if (!auto || !enteredAlertState(prev, next)) {
    return { willTriggerAlert: false, type: null, nextStatus: next };
  }
  return { willTriggerAlert: true, type: alertTypeForStatus(next), nextStatus: next };
}
