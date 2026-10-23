const MEXICO_TZ = "America/Mexico_City";

export function slotTimestamp(value: string | Date | null | undefined): number | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

export function sameSlot(
  left: string | Date | null | undefined,
  right: string | Date | null | undefined,
): boolean {
  const leftTime = slotTimestamp(left);
  const rightTime = slotTimestamp(right);
  return leftTime != null && rightTime != null && leftTime === rightTime;
}

export function slotToIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

export function formatSlotTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: MEXICO_TZ,
  });
}

export function mexicoToday(now = new Date()): string {
  return mexicoDateKey(now);
}

/** Calendar date (YYYY-MM-DD) for an instant in America/Mexico_City. */
export function mexicoDateKey(value: string | Date = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MEXICO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function mexicoTodayLocalDate(now = new Date()): Date {
  const [year, month, day] = mexicoToday(now).split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Add calendar days to a YYYY-MM-DD key without browser timezone drift. */
export function addMexicoCalendarDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

/**
 * Inclusive start / exclusive end of a Mexico City calendar day as UTC ISO.
 * Matches how checkout/admin slots are persisted (`…T…:00-06:00`).
 */
export function mexicoDayBounds(dateKey: string): { from: string; to: string } {
  const next = addMexicoCalendarDays(dateKey, 1);
  return {
    from: new Date(`${dateKey}T00:00:00-06:00`).toISOString(),
    to: new Date(`${next}T00:00:00-06:00`).toISOString(),
  };
}

export function mexicoDayRange(
  day: "today" | "tomorrow" | "week",
  now = new Date(),
): { from: string; to: string } {
  const today = mexicoToday(now);
  if (day === "today") return mexicoDayBounds(today);
  if (day === "tomorrow") return mexicoDayBounds(addMexicoCalendarDays(today, 1));
  return {
    from: mexicoDayBounds(today).from,
    to: mexicoDayBounds(addMexicoCalendarDays(today, 7)).from,
  };
}
