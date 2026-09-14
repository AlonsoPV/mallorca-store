import type { branchesTable } from "@workspace/db";

export type BranchHoursRow = typeof branchesTable.$inferSelect;

export function mexicoDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export type FulfillmentSchedule = {
  anchor: number;
  first: number;
  close: number;
  intervalMs: number;
  capacity: number;
};

export function fulfillmentSchedule(
  branch: BranchHoursRow,
  date: string,
  method: "pickup" | "delivery",
  cartLeadMinutes: number,
  now = Date.now(),
): FulfillmentSchedule | undefined {
  const day = new Date(`${date}T12:00:00Z`)
    .toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Mexico_City" })
    .toLowerCase();
  const hours =
    branch.hours.find((entry) => entry.date === date) ??
    branch.hours.find(
      (entry) => entry.day.toLowerCase() === day || entry.label.toLowerCase() === day,
    );
  if (!hours || hours.closed) return undefined;

  const intervalMs = branch.pickupSlotIntervalMinutes * 60_000;
  const open = new Date(`${date}T${hours.open}:00-06:00`).getTime();
  const close = new Date(`${date}T${hours.close}:00-06:00`).getTime();
  const leadMinutes =
    Math.max(cartLeadMinutes, branch.preparationTimeMinutes) +
    (method === "delivery" ? branch.deliveryTimeMinutes : 0);
  const anchor = open + leadMinutes * 60_000;
  const earliest = Math.max(anchor, now + leadMinutes * 60_000);
  const first =
    anchor + Math.max(0, Math.ceil((earliest - anchor) / intervalMs)) * intervalMs;

  return { anchor, first, close, intervalMs, capacity: branch.pickupSlotCapacity };
}

export function isValidSlotTime(
  schedule: FulfillmentSchedule,
  scheduled: Date,
): boolean {
  return (
    scheduled.getTime() >= schedule.first &&
    scheduled.getTime() + schedule.intervalMs <= schedule.close &&
    (scheduled.getTime() - schedule.anchor) % schedule.intervalMs === 0
  );
}
