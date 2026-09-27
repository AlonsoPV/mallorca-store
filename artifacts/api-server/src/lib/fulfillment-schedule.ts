import { WEEKDAY_KEYS, weekdayFromHour } from "./branch-legacy.ts";

export type FulfillmentHours = {
  date?: string;
  day: string;
  label: string;
  open: string;
  close: string;
  closed: boolean;
};

export type FulfillmentBranch = {
  hours: FulfillmentHours[];
  pickupSlotIntervalMinutes: number;
  preparationTimeMinutes: number;
  deliveryTimeMinutes: number;
  pickupSlotCapacity: number;
};

/** @deprecated Use FulfillmentBranch. Kept so existing call sites type-check. */
export type BranchHoursRow = FulfillmentBranch;

export function itemLeadMinutes(input: {
  minimumLeadTimeHours?: number | null;
  itemPreparationTimeMinutes?: number | null;
  branchPreparationTimeMinutes?: number | null;
}): number {
  const fromHours = Math.max(0, Math.round((input.minimumLeadTimeHours ?? 0) * 60));
  const fromPrep = Math.max(
    0,
    input.itemPreparationTimeMinutes ?? input.branchPreparationTimeMinutes ?? 0,
  );
  return Math.max(fromHours, fromPrep);
}

export function cartLeadMinutes(
  items: Array<{
    minimumLeadTimeHours?: number | null;
    itemPreparationTimeMinutes?: number | null;
  }>,
  branchPreparationTimeMinutes: number,
): number {
  const floor = Math.max(0, branchPreparationTimeMinutes);
  return items.reduce(
    (max, item) =>
      Math.max(
        max,
        itemLeadMinutes({
          minimumLeadTimeHours: item.minimumLeadTimeHours,
          itemPreparationTimeMinutes: item.itemPreparationTimeMinutes,
          branchPreparationTimeMinutes: floor,
        }),
      ),
    floor,
  );
}

export function isReadyForLead(
  scheduledStart: Date | number,
  leadMinutes: number,
  now = Date.now(),
): boolean {
  const at = typeof scheduledStart === "number" ? scheduledStart : scheduledStart.getTime();
  if (!Number.isFinite(at)) return false;
  return at >= now + Math.max(0, leadMinutes) * 60_000;
}

export function leadRequirementReason(leadMinutes: number): string {
  const minutes = Math.max(0, Math.round(leadMinutes));
  if (minutes < 60) return `Requiere ${minutes} min de preparación.`;
  return `Requiere ${Math.ceil(minutes / 60)} h de preparación.`;
}

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

/** Accepts `9:00`, `09:00`, and `09:00:00` as Mexico local time. */
export function parseMexicoDateTime(date: string, time: string): number {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(time ?? "").trim());
  if (!match) return Number.NaN;
  const hours = match[1].padStart(2, "0");
  const minutes = match[2];
  const seconds = match[3] ?? "00";
  return new Date(`${date}T${hours}:${minutes}:${seconds}-06:00`).getTime();
}

export type FulfillmentSchedule = {
  anchor: number;
  first: number;
  close: number;
  intervalMs: number;
  capacity: number;
};

export function fulfillmentSchedule(
  branch: FulfillmentBranch,
  date: string,
  method: "pickup" | "delivery",
  cartLeadMinutes: number,
  now = Date.now(),
): FulfillmentSchedule | undefined {
  const day = new Date(`${date}T12:00:00Z`)
    .toLocaleDateString("en-US", { weekday: "long", timeZone: "America/Mexico_City" })
    .toLowerCase();
  const weekday = WEEKDAY_KEYS.indexOf(day as (typeof WEEKDAY_KEYS)[number]);
  const hours =
    branch.hours.find((entry) => entry.date === date) ??
    branch.hours.find((entry) => weekdayFromHour(entry) === weekday) ??
    branch.hours.find(
      (entry) => entry.day.toLowerCase() === day || entry.label.toLowerCase() === day,
    );
  if (!hours || hours.closed) return undefined;

  const intervalMs = branch.pickupSlotIntervalMinutes * 60_000;
  const open = parseMexicoDateTime(date, hours.open);
  const close = parseMexicoDateTime(date, hours.close);
  if (!Number.isFinite(open) || !Number.isFinite(close) || close <= open) return undefined;
  const deliveryMinutes = method === "delivery" ? branch.deliveryTimeMinutes : 0;
  const leadMinutes = Math.max(cartLeadMinutes, branch.preparationTimeMinutes) + deliveryMinutes;
  // Product lead time starts when the order is placed, not at each future day's opening.
  const anchor = open + (branch.preparationTimeMinutes + deliveryMinutes) * 60_000;
  const earliest = Math.max(anchor, now + leadMinutes * 60_000);
  const first =
    anchor + Math.max(0, Math.ceil((earliest - anchor) / intervalMs)) * intervalMs;

  return { anchor, first, close, intervalMs, capacity: branch.pickupSlotCapacity };
}

/** Hold unpaid storefront stock at least 15 minutes and until the slot ends. */
export function reservationTtlMinutesUntil(expiresAt: Date, now = new Date()): number {
  return Math.max(15, Math.ceil((expiresAt.getTime() - now.getTime()) / 60_000));
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
