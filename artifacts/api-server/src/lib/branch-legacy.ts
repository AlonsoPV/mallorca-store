export type LegacyBranchHour = {
  day: string;
  label: string;
  open: string;
  close: string;
  closed: boolean;
  slotOrder?: number;
  date?: string;
};

export const WEEKDAY_LABELS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

export const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export function hoursJsonFromRows(
  rows: Array<{
    weekday: number;
    openTime: string | null;
    closeTime: string | null;
    closed: boolean;
    slotOrder?: number | null;
  }>,
): LegacyBranchHour[] {
  return [...rows]
    .sort((a, b) => a.weekday - b.weekday || (a.slotOrder ?? 0) - (b.slotOrder ?? 0))
    .map((row) => ({
      day: WEEKDAY_KEYS[row.weekday] ?? String(row.weekday),
      label: WEEKDAY_LABELS[row.weekday] ?? String(row.weekday),
      open: row.openTime ?? "",
      close: row.closeTime ?? "",
      closed: row.closed,
      slotOrder: row.slotOrder ?? 0,
    }));
}

export function weekdayFromHour(hour: {
  day?: string;
  label?: string;
}): number | null {
  const key = (hour.day || hour.label || "").toLowerCase();
  const idx = WEEKDAY_KEYS.findIndex((d) => d === key);
  if (idx >= 0) return idx;
  const labelIdx = WEEKDAY_LABELS.findIndex((d) => d.toLowerCase() === key);
  return labelIdx >= 0 ? labelIdx : null;
}

/**
 * Build partial branch column updates from satellite tables.
 * Missing satellite rows omit keys so callers never null-out legacy scalars by accident.
 */
export function projectLegacyFromSatellites(
  links: Array<{ type: string; url: string; active?: boolean | null }>,
  images: Array<{ type: string; url: string; sortOrder?: number | null }>,
  hoursRows: Array<{
    weekday: number;
    openTime: string | null;
    closeTime: string | null;
    closed: boolean;
    slotOrder?: number | null;
  }>,
): {
  mapsUrl?: string;
  openTableUrl?: string;
  instagramUrl?: string;
  imageUrl?: string;
  gallery?: string[];
  hours: LegacyBranchHour[];
} {
  const activeLinks = links.filter((l) => l.active !== false);
  const maps = activeLinks.find((l) => l.type === "maps");
  const openTable = activeLinks.find((l) => l.type === "opentable");
  const instagram = activeLinks.find((l) => l.type === "instagram");
  const hero = images.find((i) => i.type === "hero") ?? images[0];
  const gallery = images.filter((i) => i.type === "gallery").map((i) => i.url);

  return {
    ...(maps?.url ? { mapsUrl: maps.url } : {}),
    ...(openTable?.url ? { openTableUrl: openTable.url } : {}),
    ...(instagram?.url ? { instagramUrl: instagram.url } : {}),
    ...(hero?.url ? { imageUrl: hero.url } : {}),
    ...(gallery.length ? { gallery } : {}),
    hours: hoursJsonFromRows(hoursRows),
  };
}
