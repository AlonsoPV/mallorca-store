import { availableStock } from "./inventory-status.ts";

export function shouldRestockOnRelease(consumedPhysical: boolean): boolean {
  return consumedPhysical;
}

export function nextInventoryOnCommit(physical: number, quantity: number): number {
  return Math.max(0, physical - quantity);
}

export function canHold(physical: number, reserved: number, quantity: number): boolean {
  return quantity > 0 && availableStock(physical, reserved) >= quantity;
}

export function applySequentialHolds(physical: number, quantities: number[]) {
  let reserved = 0;
  const accepted = quantities.map((quantity) => {
    if (!canHold(physical, reserved, quantity)) return false;
    reserved += quantity;
    return true;
  });
  return { accepted, reserved, physical };
}
