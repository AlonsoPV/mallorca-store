import { asc, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  branchesTable,
  orderAuditLogsTable,
  orderItemsTable,
  orderPaymentsTable,
  ordersTable,
  productsTable,
  usersTable,
} from "@workspace/db";
import { serializeAdminOrder, serializeAuditEvents } from "./order-serialize";

export {
  serializeAdminOrder,
  serializeAuditEvents,
  serializeOrderItems,
  serializeStorefrontOrderDetails,
} from "./order-serialize";

export async function loadAdminOrder(orderId: string) {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  if (!order) return undefined;
  const [branch] = await db
    .select({ name: branchesTable.name })
    .from(branchesTable)
    .where(eq(branchesTable.id, order.branchId));
  const items = await db
    .select({
      item: orderItemsTable,
      imageUrl: productsTable.imageUrl,
    })
    .from(orderItemsTable)
    .leftJoin(productsTable, eq(productsTable.id, orderItemsTable.productId))
    .where(eq(orderItemsTable.orderId, order.id))
    .orderBy(asc(orderItemsTable.id));

  const auditRows = await db
    .select({
      id: orderAuditLogsTable.id,
      action: orderAuditLogsTable.action,
      reason: orderAuditLogsTable.reason,
      actorUserId: orderAuditLogsTable.actorUserId,
      createdAt: orderAuditLogsTable.createdAt,
      payload: orderAuditLogsTable.payload,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
    })
    .from(orderAuditLogsTable)
    .leftJoin(usersTable, eq(usersTable.id, orderAuditLogsTable.actorUserId))
    .where(eq(orderAuditLogsTable.orderId, order.id))
    .orderBy(desc(orderAuditLogsTable.createdAt));

  const audit = serializeAuditEvents(
    auditRows.map((row) => ({
      id: row.id,
      action: row.action,
      reason: row.reason,
      actorUserId: row.actorUserId,
      createdAt: row.createdAt,
      payload: row.payload,
      actorName: [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || null,
    })),
  );

  const [payment] = await db
    .select({
      providerCheckoutId: orderPaymentsTable.providerCheckoutId,
      providerPaymentId: orderPaymentsTable.providerPaymentId,
    })
    .from(orderPaymentsTable)
    .where(eq(orderPaymentsTable.orderId, order.id))
    .orderBy(desc(orderPaymentsTable.id))
    .limit(1);

  return serializeAdminOrder(
    order,
    items.map(({ item, imageUrl }) => ({ ...item, imageUrl })),
    branch?.name,
    audit,
    payment,
  );
}

/** Keep export for callers that only need item ids — unused helper reserved. */
export async function loadProductImageMap(productIds: number[]) {
  if (!productIds.length) return new Map<number, string | null>();
  const rows = await db
    .select({ id: productsTable.id, imageUrl: productsTable.imageUrl })
    .from(productsTable)
    .where(inArray(productsTable.id, productIds));
  return new Map(rows.map((row) => [row.id, row.imageUrl]));
}
