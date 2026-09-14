import { and, asc, count, eq, gte, inArray, ne, sql } from "drizzle-orm";
import {
  branchAuditLogsTable,
  branchHoursTable,
  branchImagesTable,
  branchLinksTable,
  branchProductsTable,
  branchSpecialHoursTable,
  branchUserAssignmentsTable,
  branchesTable,
  db,
  inventoryAlertsTable,
  ordersTable,
  promotionBranchesTable,
  usersTable,
  type Branch,
  type BranchHour,
} from "@workspace/db";

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

export function statusToActive(status: "active" | "inactive" | "archived"): boolean {
  return status === "active";
}

export function syncStatusFields(input: {
  status?: "active" | "inactive" | "archived";
  active?: boolean;
}): { status: "active" | "inactive" | "archived"; active: boolean } {
  if (input.status) {
    return { status: input.status, active: statusToActive(input.status) };
  }
  if (input.active === false) {
    return { status: "inactive", active: false };
  }
  if (input.active === true) {
    return { status: "active", active: true };
  }
  return { status: "active", active: true };
}

export function buildFormattedAddress(parts: {
  street?: string | null;
  externalNumber?: string | null;
  internalNumber?: string | null;
  neighborhood?: string | null;
  borough?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  fallback?: string | null;
}): string {
  const line1 = [
    parts.street,
    parts.externalNumber,
    parts.internalNumber ? `Int. ${parts.internalNumber}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const rest = [
    parts.neighborhood,
    parts.borough,
    parts.city,
    parts.state,
    parts.postalCode,
    parts.country,
  ]
    .filter(Boolean)
    .join(", ");
  const built = [line1, rest].filter(Boolean).join(", ");
  return built || parts.fallback || "";
}

export function normalizeWhatsapp(value?: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("52") && digits.length >= 12) return `+${digits}`;
  if (digits.length === 10) return `+52${digits}`;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

export function whatsappUrl(number?: string | null, message?: string | null): string | null {
  const normalized = normalizeWhatsapp(number);
  if (!normalized) return null;
  const digits = normalized.replace(/\D/g, "");
  const base = `https://wa.me/${digits}`;
  if (!message?.trim()) return base;
  return `${base}?text=${encodeURIComponent(message.trim())}`;
}

export function slugifyBranch(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

export function hoursJsonFromRows(
  rows: Array<{
    weekday: number;
    openTime: string | null;
    closeTime: string | null;
    closed: boolean;
    slotOrder: number;
  }>,
): BranchHour[] {
  return [...rows]
    .sort((a, b) => a.weekday - b.weekday || a.slotOrder - b.slotOrder)
    .map((row) => ({
      day: WEEKDAY_KEYS[row.weekday] ?? String(row.weekday),
      label: WEEKDAY_LABELS[row.weekday] ?? String(row.weekday),
      open: row.openTime ?? "",
      close: row.closeTime ?? "",
      closed: row.closed,
      slotOrder: row.slotOrder,
    }));
}

export function weekdayFromHour(hour: BranchHour): number | null {
  const key = (hour.day || hour.label || "").toLowerCase();
  const idx = WEEKDAY_KEYS.findIndex((d) => d === key);
  if (idx >= 0) return idx;
  const labelIdx = WEEKDAY_LABELS.findIndex((d) => d.toLowerCase() === key);
  return labelIdx >= 0 ? labelIdx : null;
}

export async function replaceBranchHours(branchId: number, hours: BranchHour[]) {
  await db.delete(branchHoursTable).where(eq(branchHoursTable.branchId, branchId));
  await db.delete(branchSpecialHoursTable).where(eq(branchSpecialHoursTable.branchId, branchId));

  const weekly: Array<{
    branchId: number;
    weekday: number;
    openTime: string | null;
    closeTime: string | null;
    closed: boolean;
    slotOrder: number;
  }> = [];
  const special: Array<{
    branchId: number;
    date: string;
    openTime: string | null;
    closeTime: string | null;
    closed: boolean;
    label: string | null;
  }> = [];

  for (const hour of hours) {
    if (hour.date) {
      special.push({
        branchId,
        date: hour.date,
        openTime: hour.closed ? null : hour.open || null,
        closeTime: hour.closed ? null : hour.close || null,
        closed: hour.closed,
        label: hour.label || null,
      });
      continue;
    }
    const weekday = weekdayFromHour(hour);
    if (weekday == null) continue;
    weekly.push({
      branchId,
      weekday,
      openTime: hour.closed ? null : hour.open || null,
      closeTime: hour.closed ? null : hour.close || null,
      closed: hour.closed,
      slotOrder: hour.slotOrder ?? 0,
    });
  }

  if (weekly.length) await db.insert(branchHoursTable).values(weekly);
  if (special.length) await db.insert(branchSpecialHoursTable).values(special);

  const json = hoursJsonFromRows(weekly);
  for (const s of special) {
    json.push({
      day: s.date,
      label: s.label || s.date,
      open: s.openTime || "",
      close: s.closeTime || "",
      closed: s.closed,
      date: s.date,
    });
  }
  return json;
}

export async function loadBranchSatellite(branchId: number) {
  const [hours, specialHours, links, images, primary] = await Promise.all([
    db
      .select()
      .from(branchHoursTable)
      .where(eq(branchHoursTable.branchId, branchId))
      .orderBy(asc(branchHoursTable.weekday), asc(branchHoursTable.slotOrder)),
    db
      .select()
      .from(branchSpecialHoursTable)
      .where(eq(branchSpecialHoursTable.branchId, branchId))
      .orderBy(asc(branchSpecialHoursTable.date)),
    db
      .select()
      .from(branchLinksTable)
      .where(eq(branchLinksTable.branchId, branchId))
      .orderBy(asc(branchLinksTable.sortOrder)),
    db
      .select()
      .from(branchImagesTable)
      .where(eq(branchImagesTable.branchId, branchId))
      .orderBy(asc(branchImagesTable.sortOrder)),
    db
      .select({
        id: branchUserAssignmentsTable.id,
        userId: branchUserAssignmentsTable.userId,
        role: branchUserAssignmentsTable.role,
        isPrimary: branchUserAssignmentsTable.isPrimary,
        name: sql<string>`trim(concat(${usersTable.firstName}, ' ', ${usersTable.lastName}))`,
        email: usersTable.email,
      })
      .from(branchUserAssignmentsTable)
      .innerJoin(usersTable, eq(branchUserAssignmentsTable.userId, usersTable.id))
      .where(
        and(
          eq(branchUserAssignmentsTable.branchId, branchId),
          eq(branchUserAssignmentsTable.isPrimary, true),
          eq(branchUserAssignmentsTable.active, true),
        ),
      )
      .limit(1),
  ]);

  return {
    hours,
    specialHours,
    links,
    images,
    primaryResponsible: primary[0] ?? null,
  };
}

export function serializeAdminBranch(
  branch: Branch,
  extras?: {
    links?: Array<Record<string, unknown>>;
    images?: Array<Record<string, unknown>>;
    specialHours?: Array<Record<string, unknown>>;
    primaryResponsible?: Record<string, unknown> | null;
    ordersToday?: number;
    alertsOpen?: number;
    whatsappUrl?: string | null;
  },
) {
  const wa = whatsappUrl(branch.whatsapp, branch.whatsappDefaultMessage);
  return {
    ...branch,
    status: branch.status ?? (branch.active ? "active" : "inactive"),
    active: branch.active ?? statusToActive(branch.status ?? "active"),
    whatsappUrl: extras?.whatsappUrl ?? wa,
    links: extras?.links ?? [],
    images: extras?.images ?? [],
    specialHours: extras?.specialHours ?? [],
    primaryResponsible: extras?.primaryResponsible ?? null,
    ordersToday: extras?.ordersToday ?? 0,
    alertsOpen: extras?.alertsOpen ?? 0,
  };
}

export async function writeBranchAudit(input: {
  branchId: number;
  actorUserId?: string | null;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}) {
  await db.insert(branchAuditLogsTable).values({
    branchId: input.branchId,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    before: input.before ?? null,
    after: input.after ?? null,
  });
}

export async function countFutureOrders(branchId: number): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.branchId, branchId),
        gte(ordersTable.scheduledStart, new Date()),
        ne(ordersTable.status, "cancelled"),
        ne(ordersTable.status, "completed"),
      ),
    );
  return row?.value ?? 0;
}

export async function branchDependencyCounts(branchId: number) {
  const [[orders], [products], [alerts], [promos], [users]] = await Promise.all([
    db.select({ value: count() }).from(ordersTable).where(eq(ordersTable.branchId, branchId)),
    db
      .select({ value: count() })
      .from(branchProductsTable)
      .where(eq(branchProductsTable.branchId, branchId)),
    db
      .select({ value: count() })
      .from(inventoryAlertsTable)
      .where(eq(inventoryAlertsTable.branchId, branchId)),
    db
      .select({ value: count() })
      .from(promotionBranchesTable)
      .where(eq(promotionBranchesTable.branchId, branchId)),
    db
      .select({ value: count() })
      .from(branchUserAssignmentsTable)
      .where(eq(branchUserAssignmentsTable.branchId, branchId)),
  ]);
  return {
    orders: orders?.value ?? 0,
    products: products?.value ?? 0,
    alerts: alerts?.value ?? 0,
    promotions: promos?.value ?? 0,
    users: users?.value ?? 0,
  };
}

export async function enrichBranchesList(rows: Branch[]) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [orderRows, alertRows, primaryRows] = await Promise.all([
    db
      .select({
        branchId: ordersTable.branchId,
        value: count(),
      })
      .from(ordersTable)
      .where(
        and(
          inArray(ordersTable.branchId, ids),
          gte(ordersTable.scheduledStart, start),
          sql`${ordersTable.scheduledStart} < ${end}`,
          ne(ordersTable.status, "cancelled"),
        ),
      )
      .groupBy(ordersTable.branchId),
    db
      .select({
        branchId: inventoryAlertsTable.branchId,
        value: count(),
      })
      .from(inventoryAlertsTable)
      .where(
        and(inArray(inventoryAlertsTable.branchId, ids), sql`${inventoryAlertsTable.resolvedAt} is null`),
      )
      .groupBy(inventoryAlertsTable.branchId),
    db
      .select({
        branchId: branchUserAssignmentsTable.branchId,
        userId: branchUserAssignmentsTable.userId,
        role: branchUserAssignmentsTable.role,
        name: sql<string>`trim(concat(${usersTable.firstName}, ' ', ${usersTable.lastName}))`,
        email: usersTable.email,
      })
      .from(branchUserAssignmentsTable)
      .innerJoin(usersTable, eq(branchUserAssignmentsTable.userId, usersTable.id))
      .where(
        and(
          inArray(branchUserAssignmentsTable.branchId, ids),
          eq(branchUserAssignmentsTable.isPrimary, true),
          eq(branchUserAssignmentsTable.active, true),
        ),
      ),
  ]);

  const ordersMap = new Map(orderRows.map((r) => [r.branchId, r.value]));
  const alertsMap = new Map(alertRows.map((r) => [r.branchId, r.value]));
  const primaryMap = new Map(primaryRows.map((r) => [r.branchId, r]));

  return rows.map((branch) =>
    serializeAdminBranch(branch, {
      ordersToday: ordersMap.get(branch.id) ?? 0,
      alertsOpen: alertsMap.get(branch.id) ?? 0,
      primaryResponsible: primaryMap.get(branch.id)
        ? {
            userId: primaryMap.get(branch.id)!.userId,
            name: primaryMap.get(branch.id)!.name,
            email: primaryMap.get(branch.id)!.email,
            role: primaryMap.get(branch.id)!.role,
          }
        : branch.managerName
          ? {
              userId: null,
              name: branch.managerName,
              email: branch.managerEmail,
              role: "branch_manager",
              legacy: true,
            }
          : null,
    }),
  );
}

export async function syncLegacyProjections(branchId: number) {
  const [links, images, hours] = await Promise.all([
    db.select().from(branchLinksTable).where(eq(branchLinksTable.branchId, branchId)),
    db
      .select()
      .from(branchImagesTable)
      .where(and(eq(branchImagesTable.branchId, branchId), eq(branchImagesTable.active, true)))
      .orderBy(asc(branchImagesTable.sortOrder)),
    db
      .select()
      .from(branchHoursTable)
      .where(eq(branchHoursTable.branchId, branchId))
      .orderBy(asc(branchHoursTable.weekday), asc(branchHoursTable.slotOrder)),
  ]);

  const maps = links.find((l) => l.type === "maps" && l.active);
  const openTable = links.find((l) => l.type === "opentable" && l.active);
  const instagram = links.find((l) => l.type === "instagram" && l.active);
  const hero = images.find((i) => i.type === "hero") ?? images[0];
  const gallery = images.filter((i) => i.type === "gallery").map((i) => i.url);

  await db
    .update(branchesTable)
    .set({
      mapsUrl: maps?.url ?? undefined,
      openTableUrl: openTable?.url ?? null,
      instagramUrl: instagram?.url ?? null,
      imageUrl: hero?.url ?? null,
      gallery,
      hours: hoursJsonFromRows(hours),
    })
    .where(eq(branchesTable.id, branchId));
}
