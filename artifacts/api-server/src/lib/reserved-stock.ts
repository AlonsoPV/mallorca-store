import { and, eq, inArray, sql } from "drizzle-orm";
import { db, inventoryReservationsTable } from "@workspace/db";
import { availableStock } from "./inventory-status";

export async function loadReservedByBranchProductIds(
  ids: number[],
): Promise<Map<number, number>> {
  const reserved = new Map<number, number>();
  if (!ids.length) return reserved;
  const rows = await db
    .select({
      branchProductId: inventoryReservationsTable.branchProductId,
      quantity: sql<number>`coalesce(sum(${inventoryReservationsTable.quantity}), 0)::int`,
    })
    .from(inventoryReservationsTable)
    .where(
      and(
        inArray(inventoryReservationsTable.branchProductId, ids),
        eq(inventoryReservationsTable.status, "active"),
      ),
    )
    .groupBy(inventoryReservationsTable.branchProductId);
  for (const row of rows) {
    reserved.set(row.branchProductId, Number(row.quantity));
  }
  return reserved;
}

export function sellableUnits(physical: number, reserved = 0): number {
  return availableStock(physical, reserved);
}
