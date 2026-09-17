import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  branchProductsTable,
  inventoryLedgerTable,
  inventoryReservationsTable,
} from "@workspace/db";
import { applyInventoryAlert } from "./inventory-alerts.ts";
import { sellableUnits } from "./reserved-stock.ts";
import { shouldRestockOnRelease } from "./inventory-hold-pure.ts";

export { nextInventoryOnCommit, shouldRestockOnRelease } from "./inventory-hold-pure.ts";

type Executor = typeof db | any;

async function reservedActive(
  executor: Executor,
  branchProductId: number,
): Promise<number> {
  const [row] = await executor
    .select({
      quantity: sql<number>`coalesce(sum(${inventoryReservationsTable.quantity}), 0)::int`,
    })
    .from(inventoryReservationsTable)
    .where(
      and(
        eq(inventoryReservationsTable.branchProductId, branchProductId),
        eq(inventoryReservationsTable.status, "active"),
      ),
    );
  return Number(row?.quantity ?? 0);
}

export async function reserveBranchProduct(
  tx: Executor,
  input: {
    branchProduct: typeof branchProductsTable.$inferSelect;
    quantity: number;
    orderId: string;
    immediatePaid: boolean;
    expiresAt: Date;
    actorUserId?: string | null;
    reason: string;
    allowOverride?: boolean;
  },
): Promise<void> {
  const qty = input.quantity;
  if (qty <= 0) return;

  const [locked] = await tx
    .select()
    .from(branchProductsTable)
    .where(eq(branchProductsTable.id, input.branchProduct.id))
    .for("update");
  if (!locked) throw new Error("OUT_OF_STOCK");

  const reserved = await reservedActive(tx, locked.id);
  const sellable = sellableUnits(locked.inventory, reserved);
  const consumeQty = input.allowOverride ? Math.min(qty, Math.max(0, sellable)) : qty;
  if (!input.allowOverride && consumeQty > sellable) throw new Error("OUT_OF_STOCK");
  if (input.allowOverride && consumeQty <= 0) return;

  if (input.immediatePaid) {
    const updated = await tx
      .update(branchProductsTable)
      .set({ inventory: sql`${branchProductsTable.inventory} - ${consumeQty}` })
      .where(
        and(
          eq(branchProductsTable.id, locked.id),
          sql`${branchProductsTable.inventory} >= ${consumeQty}`,
        ),
      )
      .returning();
    if (!updated.length) throw new Error("OUT_OF_STOCK");
    await tx.insert(inventoryReservationsTable).values({
      orderId: input.orderId,
      branchProductId: locked.id,
      quantity: consumeQty,
      status: "committed",
      consumedPhysical: true,
      expiresAt: input.expiresAt,
    });
    await applyInventoryAlert(tx, { ...locked, inventory: updated[0].inventory }, updated[0].inventory);
    await tx.insert(inventoryLedgerTable).values({
      branchProductId: locked.id,
      orderId: input.orderId,
      movement: "reserve",
      quantityDelta: -consumeQty,
      balanceAfter: updated[0].inventory,
      actorUserId: input.actorUserId ?? null,
      reason: input.reason,
    });
    return;
  }

  await tx.insert(inventoryReservationsTable).values({
    orderId: input.orderId,
    branchProductId: locked.id,
    quantity: consumeQty,
    status: "active",
    consumedPhysical: false,
    expiresAt: input.expiresAt,
  });
  await applyInventoryAlert(tx, locked, locked.inventory);
  await tx.insert(inventoryLedgerTable).values({
    branchProductId: locked.id,
    orderId: input.orderId,
    movement: "reserve",
    quantityDelta: 0,
    balanceAfter: locked.inventory,
    actorUserId: input.actorUserId ?? null,
    reason: `${input.reason} (hold)`,
  });
}

export async function commitOrderReservations(
  tx: Executor,
  orderId: string,
  actorUserId?: string | null,
): Promise<void> {
  const holds = await tx
    .select()
    .from(inventoryReservationsTable)
    .where(
      and(
        eq(inventoryReservationsTable.orderId, orderId),
        eq(inventoryReservationsTable.status, "active"),
      ),
    );
  for (const hold of holds) {
    if (!hold.consumedPhysical) {
      const updated = await tx
        .update(branchProductsTable)
        .set({ inventory: sql`${branchProductsTable.inventory} - ${hold.quantity}` })
        .where(
          and(
            eq(branchProductsTable.id, hold.branchProductId),
            sql`${branchProductsTable.inventory} >= ${hold.quantity}`,
          ),
        )
        .returning();
      if (!updated.length) throw new Error("OUT_OF_STOCK");
      const [bp] = await tx
        .select()
        .from(branchProductsTable)
        .where(eq(branchProductsTable.id, hold.branchProductId));
      if (bp) await applyInventoryAlert(tx, bp, updated[0].inventory);
      await tx.insert(inventoryLedgerTable).values({
        branchProductId: hold.branchProductId,
        orderId,
        movement: "reserve",
        quantityDelta: -hold.quantity,
        balanceAfter: updated[0].inventory,
        actorUserId: actorUserId ?? null,
        reason: "Inventory committed",
      });
    }
    await tx
      .update(inventoryReservationsTable)
      .set({ status: "committed", consumedPhysical: true })
      .where(eq(inventoryReservationsTable.id, hold.id));
  }
}

export async function releaseOrderReservations(
  tx: Executor,
  orderId: string,
  reason: string,
): Promise<void> {
  const reservations = await tx
    .update(inventoryReservationsTable)
    .set({ status: "released" })
    .where(
      and(
        eq(inventoryReservationsTable.orderId, orderId),
        inArray(inventoryReservationsTable.status, ["active", "committed"]),
      ),
    )
    .returning();

  for (const reservation of reservations) {
    if (!shouldRestockOnRelease(Boolean(reservation.consumedPhysical))) {
      const [bp] = await tx
        .select()
        .from(branchProductsTable)
        .where(eq(branchProductsTable.id, reservation.branchProductId));
      if (bp) await applyInventoryAlert(tx, bp, bp.inventory);
      continue;
    }
    const [bp] = await tx
      .update(branchProductsTable)
      .set({ inventory: sql`${branchProductsTable.inventory} + ${reservation.quantity}` })
      .where(eq(branchProductsTable.id, reservation.branchProductId))
      .returning();
    if (!bp) continue;
    await applyInventoryAlert(tx, bp, bp.inventory);
    await tx.insert(inventoryLedgerTable).values({
      branchProductId: reservation.branchProductId,
      orderId,
      movement: "release",
      quantityDelta: reservation.quantity,
      balanceAfter: bp.inventory,
      reason,
    });
  }
}
