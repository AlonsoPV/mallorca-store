import { and, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  branchesTable,
  branchProductsTable,
  inventoryAlertsTable,
  inventoryAlertEventsTable,
  inventoryReservationsTable,
  internalNotificationsTable,
  usersTable,
  categoryResponsibleAssignmentsTable,
  branchUserAssignmentsTable,
  productsTable,
} from "@workspace/db";
import {
  alertTypeForStatus,
  availableStock,
  defaultPriorityForType,
  deriveInventoryStatus,
  enteredAlertState,
  type InventoryStatus,
} from "./inventory-status.ts";
import {
  isAlertTypeEnabled,
  resolveAlertChannels,
} from "./notification-prefs.ts";

type Executor = typeof db | any;

async function reservedForBranchProduct(
  executor: Executor,
  branchProductId: number,
): Promise<number> {
  const [row] = await executor
    .select({
      reserved: sql<number>`coalesce(sum(${inventoryReservationsTable.quantity}), 0)`,
    })
    .from(inventoryReservationsTable)
    .where(
      and(
        eq(inventoryReservationsTable.branchProductId, branchProductId),
        eq(inventoryReservationsTable.status, "active"),
      ),
    );
  return Number(row?.reserved ?? 0);
}

async function writeAlertEvent(
  executor: Executor,
  alertId: number,
  event: string,
  userId?: string | null,
  metadata?: Record<string, unknown> | null,
) {
  await executor.insert(inventoryAlertEventsTable).values({
    alertId,
    event,
    userId: userId ?? null,
    metadata: metadata ?? null,
  });
}

async function resolveAssignee(
  executor: Executor,
  bp: typeof branchProductsTable.$inferSelect,
) {
  const [branch] = await executor
    .select()
    .from(branchesTable)
    .where(eq(branchesTable.id, bp.branchId));
  const [responsible] = bp.responsibleUserId
    ? await executor.select().from(usersTable).where(eq(usersTable.id, bp.responsibleUserId))
    : [];
  const [product] = responsible
    ? []
    : await executor
        .select({ categoryId: productsTable.categoryId, name: productsTable.name })
        .from(productsTable)
        .where(eq(productsTable.id, bp.productId));
  const [categoryResponsible] =
    responsible || !product
      ? []
      : await executor
          .select({ user: usersTable })
          .from(categoryResponsibleAssignmentsTable)
          .innerJoin(usersTable, eq(categoryResponsibleAssignmentsTable.userId, usersTable.id))
          .where(
            and(
              eq(categoryResponsibleAssignmentsTable.branchId, bp.branchId),
              eq(categoryResponsibleAssignmentsTable.categoryId, product.categoryId),
            ),
          );
  const [branchManager] =
    responsible || categoryResponsible
      ? []
      : await executor
          .select({ user: usersTable })
          .from(branchUserAssignmentsTable)
          .innerJoin(usersTable, eq(branchUserAssignmentsTable.userId, usersTable.id))
          .where(
            and(
              eq(branchUserAssignmentsTable.branchId, bp.branchId),
              eq(usersTable.role, "branch_manager"),
            ),
          )
          .limit(1);
  const [ops] =
    responsible || categoryResponsible || branchManager
      ? []
      : await executor
          .select()
          .from(usersTable)
          .where(eq(usersTable.role, "operations"))
          .limit(1);
  const [fallback] =
    responsible || categoryResponsible || branchManager || ops
      ? []
      : await executor.select().from(usersTable).where(eq(usersTable.role, "admin")).limit(1);
  const recipient =
    responsible ?? categoryResponsible?.user ?? branchManager?.user ?? ops ?? fallback;
  return { branch, recipient, productName: product?.name as string | undefined };
}

export async function applyInventoryAlert(
  tx: Executor,
  bp: typeof branchProductsTable.$inferSelect,
  nextInventory: number,
): Promise<void> {
  const reserved = await reservedForBranchProduct(tx, bp.id);
  const available = availableStock(nextInventory, reserved);
  const criticalStock = (bp as { criticalStock?: number | null }).criticalStock;
  const autoEnabled = (bp as { autoAlertEnabled?: boolean }).autoAlertEnabled !== false;
  const nextState = deriveInventoryStatus(available, bp.minStock, criticalStock);
  const previous = (bp.alertState as InventoryStatus) || "NORMAL";

  await tx
    .update(branchProductsTable)
    .set({ alertState: nextState })
    .where(eq(branchProductsTable.id, bp.id));

  if (previous !== nextState && nextState === "NORMAL") {
    const open = await tx
      .select()
      .from(inventoryAlertsTable)
      .where(
        and(
          eq(inventoryAlertsTable.branchProductId, bp.id),
          eq(inventoryAlertsTable.source, "AUTOMATIC"),
          eq(inventoryAlertsTable.status, "OPEN"),
          inArray(inventoryAlertsTable.type, ["LOW_STOCK", "CRITICAL_STOCK", "OUT_OF_STOCK"]),
        ),
      );
    for (const alert of open) {
      await tx
        .update(inventoryAlertsTable)
        .set({
          status: "RESOLVED",
          resolvedAt: new Date(),
          resolutionNote: "Inventario recuperado.",
        })
        .where(eq(inventoryAlertsTable.id, alert.id));
      await writeAlertEvent(tx, alert.id, "RESOLVED", null, {
        reason: "Inventario recuperado.",
        available,
      });
    }
  } else if (previous !== nextState) {
    const closeTypes: Array<"LOW_STOCK" | "CRITICAL_STOCK" | "OUT_OF_STOCK"> = [];
    if (nextState === "LOW_STOCK") closeTypes.push("CRITICAL_STOCK", "OUT_OF_STOCK");
    if (nextState === "CRITICAL_STOCK") closeTypes.push("OUT_OF_STOCK");
    if (closeTypes.length) {
      const open = await tx
        .select()
        .from(inventoryAlertsTable)
        .where(
          and(
            eq(inventoryAlertsTable.branchProductId, bp.id),
            eq(inventoryAlertsTable.source, "AUTOMATIC"),
            eq(inventoryAlertsTable.status, "OPEN"),
            inArray(inventoryAlertsTable.type, closeTypes),
          ),
        );
      for (const alert of open) {
        await tx
          .update(inventoryAlertsTable)
          .set({
            status: "RESOLVED",
            resolvedAt: new Date(),
            resolutionNote: "Inventario recuperado.",
          })
          .where(eq(inventoryAlertsTable.id, alert.id));
        await writeAlertEvent(tx, alert.id, "RESOLVED", null, { available });
      }
    }
  }

  if (!autoEnabled) return;
  if (!enteredAlertState(previous, nextState)) return;

  const alertType = alertTypeForStatus(nextState);
  if (!alertType) return;

  const { branch, recipient, productName } = await resolveAssignee(tx, bp);
  if (!isAlertTypeEnabled(branch?.notificationPreferences as any, alertType)) return;

  const [existing] = await tx
    .select({ id: inventoryAlertsTable.id })
    .from(inventoryAlertsTable)
    .where(
      and(
        eq(inventoryAlertsTable.productId, bp.productId),
        eq(inventoryAlertsTable.branchId, bp.branchId),
        eq(inventoryAlertsTable.type, alertType),
        eq(inventoryAlertsTable.source, "AUTOMATIC"),
        eq(inventoryAlertsTable.status, "OPEN"),
      ),
    )
    .limit(1);
  if (existing) return;

  const { channels, notifyInApp, deliveryState } = resolveAlertChannels(
    branch?.notificationPreferences as any,
  );

  const titleMap = {
    LOW_STOCK: "stock bajo",
    CRITICAL_STOCK: "nivel crítico",
    OUT_OF_STOCK: "agotado",
  } as const;
  const message = `${productName ?? "Producto"} tiene ${titleMap[alertType]} en ${branch?.name ?? "sucursal"}.`;

  try {
    const [alert] = await tx
      .insert(inventoryAlertsTable)
      .values({
        branchProductId: bp.id,
        branchId: bp.branchId,
        productId: bp.productId,
        state: nextState as any,
        type: alertType,
        source: "AUTOMATIC",
        status: "OPEN",
        priority: defaultPriorityForType(alertType),
        message,
        stock: nextInventory,
        availableStock: available,
        minStock: bp.minStock,
        criticalStock: criticalStock ?? null,
        responsibleName: recipient
          ? `${recipient.firstName ?? ""} ${recipient.lastName ?? ""}`.trim()
          : branch?.managerName,
        responsibleEmail: recipient?.email ?? branch?.managerEmail,
        responsibleUserId: recipient?.id,
        channels,
        deliveryState,
      })
      .returning();

    if (!alert) return;
    await writeAlertEvent(tx, alert.id, "CREATED", null, {
      source: "AUTOMATIC",
      type: alertType,
      available,
    });
    if (recipient && notifyInApp) {
      try {
        await tx.insert(internalNotificationsTable).values({
          userId: recipient.id,
          branchId: bp.branchId,
          alertId: alert.id,
          title: `Inventario: ${titleMap[alertType]}`,
          message,
        });
      } catch {
        /* notification must not block */
      }
    }
  } catch {
    /* unique conflict = idempotent skip */
  }
}

export async function createManualAlert(input: {
  productId: number;
  branchId: number;
  type:
    | "INVENTORY_REVIEW"
    | "RESTOCK_REQUEST"
    | "INVENTORY_MISMATCH"
    | "CUSTOM"
    | "LOW_STOCK"
    | "CRITICAL_STOCK"
    | "OUT_OF_STOCK";
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  message: string;
  assignedUserId?: string | null;
  createdByUserId?: string | null;
}) {
  const [bp] = await db
    .select()
    .from(branchProductsTable)
    .where(
      and(
        eq(branchProductsTable.productId, input.productId),
        eq(branchProductsTable.branchId, input.branchId),
      ),
    );
  if (!bp) throw new Error("BRANCH_PRODUCT_NOT_FOUND");

  const reserved = await reservedForBranchProduct(db, bp.id);
  const available = availableStock(bp.inventory, reserved);
  const { branch, recipient } = await resolveAssignee(db, {
    ...bp,
    responsibleUserId: input.assignedUserId ?? bp.responsibleUserId,
  });
  const assigneeId = input.assignedUserId ?? recipient?.id ?? null;
  const [assignee] = assigneeId
    ? await db.select().from(usersTable).where(eq(usersTable.id, assigneeId))
    : [];
  const { channels, notifyInApp, deliveryState } = resolveAlertChannels(
    branch?.notificationPreferences as any,
  );

  const [alert] = await db
    .insert(inventoryAlertsTable)
    .values({
      branchProductId: bp.id,
      branchId: bp.branchId,
      productId: bp.productId,
      state: (bp.alertState as any) || "NORMAL",
      type: input.type,
      source: "MANUAL",
      status: "OPEN",
      priority: input.priority ?? "MEDIUM",
      message: input.message,
      stock: bp.inventory,
      availableStock: available,
      minStock: bp.minStock,
      criticalStock: (bp as { criticalStock?: number | null }).criticalStock ?? null,
      responsibleUserId: assignee?.id ?? null,
      responsibleName: assignee
        ? `${assignee.firstName ?? ""} ${assignee.lastName ?? ""}`.trim()
        : branch?.managerName,
      responsibleEmail: assignee?.email ?? branch?.managerEmail,
      createdByUserId: input.createdByUserId ?? null,
      channels,
      deliveryState,
    })
    .returning();

  await writeAlertEvent(db, alert.id, "CREATED", input.createdByUserId, {
    source: "MANUAL",
    type: input.type,
  });

  if (assignee && notifyInApp) {
    try {
      await db.insert(internalNotificationsTable).values({
        userId: assignee.id,
        branchId: bp.branchId,
        alertId: alert.id,
        title: "Alerta de inventario",
        message: input.message,
      });
    } catch {
      /* ignore */
    }
  }

  return alert;
}

export async function updateAlertStatus(input: {
  alertId: number;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED";
  userId?: string | null;
  resolutionNote?: string | null;
  assignedUserId?: string | null;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}) {
  const [existing] = await db
    .select()
    .from(inventoryAlertsTable)
    .where(eq(inventoryAlertsTable.id, input.alertId));
  if (!existing) throw new Error("ALERT_NOT_FOUND");

  const patch: Record<string, unknown> = {
    status: input.status,
    updatedAt: new Date(),
  };
  if (input.priority) patch.priority = input.priority;
  if (input.assignedUserId !== undefined) patch.responsibleUserId = input.assignedUserId;
  if (input.status === "RESOLVED" || input.status === "DISMISSED") {
    patch.resolvedAt = new Date();
    patch.resolvedByUserId = input.userId ?? null;
    patch.resolutionNote = input.resolutionNote ?? null;
  }
  if (input.status === "OPEN" || input.status === "IN_PROGRESS") {
    patch.resolvedAt = null;
  }

  const [updated] = await db
    .update(inventoryAlertsTable)
    .set(patch as any)
    .where(eq(inventoryAlertsTable.id, input.alertId))
    .returning();

  await writeAlertEvent(db, input.alertId, input.status, input.userId, {
    resolutionNote: input.resolutionNote,
    assignedUserId: input.assignedUserId,
  });

  return updated;
}

export async function createManualAlertsBulk(
  productIds: number[],
  input: Omit<Parameters<typeof createManualAlert>[0], "productId">,
) {
  const created = [];
  const errors: Array<{ productId: number; message: string }> = [];
  for (const productId of productIds) {
    try {
      created.push(await createManualAlert({ ...input, productId }));
    } catch (error) {
      errors.push({
        productId,
        message: error instanceof Error ? error.message : "Error",
      });
    }
  }
  return { created, errors };
}
