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
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MEXICO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function mexicoTodayLocalDate(now = new Date()): Date {
  const [year, month, day] = mexicoToday(now).split("-").map(Number);
  return new Date(year, month - 1, day);
}
