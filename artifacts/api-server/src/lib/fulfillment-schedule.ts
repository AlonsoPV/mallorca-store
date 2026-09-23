import type { branchesTable } from "@workspace/db";
import { WEEKDAY_KEYS, weekdayFromHour } from "./branch-legacy.ts";

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
  branch: BranchHoursRow,
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
  const leadMinutes =
    Math.max(cartLeadMinutes, branch.preparationTimeMinutes) +
    (method === "delivery" ? branch.deliveryTimeMinutes : 0);
  const anchor = open + leadMinutes * 60_000;
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
