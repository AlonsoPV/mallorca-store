import { Router, type IRouter } from "express";
import { and, eq, lt, sql, inArray, desc } from "drizzle-orm";
import {
  branchProductsTable,
  branchesTable,
  db,
  productsTable,
} from "@workspace/db";
import {
  CreateProductBody,
  CreateProductResponse,
  GetAdminSummaryResponse,
  ListAdminProductsQueryParams,
  ListAdminProductsResponse,
  UpdateProductBody,
  UpdateProductParams,
  UpdateProductResponse,
} from "@workspace/api-zod";
import { ordersTable, orderItemsTable, inventoryReservationsTable, inventoryLedgerTable, inventoryAlertsTable, usersTable, branchUserAssignmentsTable, categoryResponsibleAssignmentsTable, categoriesTable } from "@workspace/db";
import { ListAdminOrdersQueryParams, ListAdminOrdersResponse, UpdateAdminOrderParams, UpdateAdminOrderBody, UpdateAdminOrderResponse } from "@workspace/api-zod";
import {
  getProductDetailBySlug,
  listProductCards,
} from "../lib/catalog";
import { canAccessBranch, getAccessibleBranchIds, getRequestUser, hasGlobalBranchAccess } from "../middlewares/auth";
import { stockState, enteredAlertState, validateInventoryCsv } from "../lib/inventory";
import { z } from "zod/v4";
import { applyInventoryAlert } from "./commerce";

const router: IRouter = Router();

async function assignmentActor(req: Parameters<typeof getRequestUser>[0]) {
  const user = await getRequestUser(req);
  return user && hasGlobalBranchAccess(user) ? user : undefined;
}

// Assignment administration deliberately returns no authentication/provider fields.
router.get("/admin/users", async (req, res): Promise<void> => {
  if (!(await assignmentActor(req))) { res.status(403).json({ error: "Global assignment access required" }); return; }
  const rows = await db.select({ id: usersTable.id, name: sql<string>`trim(concat(${usersTable.firstName}, ' ', ${usersTable.lastName}))`, email: usersTable.email, role: usersTable.role })
    .from(usersTable).where(sql`${usersTable.role} <> 'customer'`).orderBy(usersTable.email);
  res.json(rows);
});

router.get("/admin/branches/:id/assignments", async (req, res): Promise<void> => {
  const branchId = Number(req.params.id);
  if (!Number.isInteger(branchId) || !(await canAccessBranch(req, branchId))) { res.status(403).json({ error: "Branch access denied" }); return; }
  const rows = await db.select({ id: branchUserAssignmentsTable.id, branchId: branchUserAssignmentsTable.branchId, user: { id: usersTable.id, name: sql<string>`trim(concat(${usersTable.firstName}, ' ', ${usersTable.lastName}))`, email: usersTable.email, role: usersTable.role } })
    .from(branchUserAssignmentsTable).innerJoin(usersTable, eq(branchUserAssignmentsTable.userId, usersTable.id))
    .where(eq(branchUserAssignmentsTable.branchId, branchId));
  res.json(rows);
});

const assignmentBody = z.object({ userId: z.string().min(1) });
router.put("/admin/branches/:id/assignments", async (req, res): Promise<void> => {
  const branchId = Number(req.params.id), body = assignmentBody.safeParse(req.body);
  if (!Number.isInteger(branchId) || !body.success) { res.status(400).json({ error: "Invalid assignment" }); return; }
  if (!(await assignmentActor(req))) { res.status(403).json({ error: "Global assignment access required" }); return; }
  const [row] = await db.insert(branchUserAssignmentsTable).values({ branchId, userId: body.data.userId }).onConflictDoNothing().returning();
  if (!row) { res.status(409).json({ error: "Assignment already exists" }); return; }
  res.status(201).json(row);
});

router.delete("/admin/branches/:id/assignments/:userId", async (req, res): Promise<void> => {
  const branchId = Number(req.params.id);
  if (!Number.isInteger(branchId) || !(await assignmentActor(req))) { res.status(403).json({ error: "Global assignment access required" }); return; }
  await db.delete(branchUserAssignmentsTable).where(and(eq(branchUserAssignmentsTable.branchId, branchId), eq(branchUserAssignmentsTable.userId, req.params.userId)));
  res.status(204).end();
});

router.get("/admin/category-responsibles", async (req, res): Promise<void> => {
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  if (branchId != null && !(await canAccessBranch(req, branchId))) { res.status(403).json({ error: "Branch access denied" }); return; }
  const filters = branchId == null ? undefined : eq(categoryResponsibleAssignmentsTable.branchId, branchId);
  const rows = await db.select({ id: categoryResponsibleAssignmentsTable.id, branchId: categoryResponsibleAssignmentsTable.branchId, categoryId: categoryResponsibleAssignmentsTable.categoryId, category: categoriesTable.name, user: { id: usersTable.id, name: sql<string>`trim(concat(${usersTable.firstName}, ' ', ${usersTable.lastName}))`, email: usersTable.email, role: usersTable.role } })
    .from(categoryResponsibleAssignmentsTable).innerJoin(categoriesTable, eq(categoryResponsibleAssignmentsTable.categoryId, categoriesTable.id)).innerJoin(usersTable, eq(categoryResponsibleAssignmentsTable.userId, usersTable.id)).where(filters);
  res.json(rows);
});

const categoryResponsibleBody = z.object({ branchId: z.number().int(), categoryId: z.number().int(), userId: z.string().min(1) });
router.put("/admin/category-responsibles", async (req, res): Promise<void> => {
  const body = categoryResponsibleBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }
  if (!(await assignmentActor(req))) { res.status(403).json({ error: "Global assignment access required" }); return; }
  const [row] = await db.insert(categoryResponsibleAssignmentsTable).values(body.data).onConflictDoUpdate({ target: [categoryResponsibleAssignmentsTable.branchId, categoryResponsibleAssignmentsTable.categoryId], set: { userId: body.data.userId } }).returning();
  res.json(row);
});

router.delete("/admin/category-responsibles/:id", async (req, res): Promise<void> => {
  if (!(await assignmentActor(req))) { res.status(403).json({ error: "Global assignment access required" }); return; }
  await db.delete(categoryResponsibleAssignmentsTable).where(eq(categoryResponsibleAssignmentsTable.id, Number(req.params.id)));
  res.status(204).end();
});
const branchConfigurationSchema = z.object({
  branchId: z.number().int(),
  available: z.boolean().optional(),
  inventory: z.number().int().min(0).optional(),
  minStock: z.number().int().min(0).optional(),
  priceOverride: z.number().min(0).nullable().optional(),
  salePriceOverride: z.number().min(0).nullable().optional(),
  preparationTimeMinutes: z.number().int().min(0).nullable().optional(),
  pickupAvailable: z.boolean().optional(),
  deliveryAvailable: z.boolean().optional(),
});
const branchConfigurationsSchema = z.array(branchConfigurationSchema).optional();

router.get("/admin/orders", async (req, res): Promise<void> => {
  const q = ListAdminOrdersQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  const branchIds = await getAccessibleBranchIds(req);
  const filters = [];
  if (q.data.status) filters.push(eq(ordersTable.status, q.data.status as any));
  if (q.data.branchId != null && !(await canAccessBranch(req, q.data.branchId))) { res.status(403).json({ error: "Branch access denied" }); return; }
  if (q.data.branchId != null) filters.push(eq(ordersTable.branchId, q.data.branchId));
  if (branchIds) filters.push(branchIds.length ? sql`${ordersTable.branchId} = ANY(${branchIds})` : sql`false`);
  const rows = await db.select({ id: ordersTable.id, orderNumber: ordersTable.orderNumber, status: ordersTable.status, total: ordersTable.total, createdAt: ordersTable.createdAt, branchId: ordersTable.branchId, customerName: ordersTable.customerName, customerEmail: ordersTable.customerEmail, fulfillmentMethod: ordersTable.fulfillmentMethod })
    .from(ordersTable).where(filters.length ? and(...filters) : undefined).orderBy(desc(ordersTable.createdAt));
  res.json(ListAdminOrdersResponse.parse(rows));
});

router.patch("/admin/orders/:id", async (req, res): Promise<void> => {
  const p = UpdateAdminOrderParams.safeParse(req.params), b = UpdateAdminOrderBody.safeParse(req.body);
  if (!p.success || !b.success) { res.status(400).json({ error: "Invalid order update" }); return; }
  let updated;
  try {
    updated = await db.transaction(async (tx) => {
    const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, p.data.id)).for("update");
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (!(await canAccessBranch(req, order.branchId))) throw new Error("FORBIDDEN_BRANCH");
    const valid: Record<string, string[]> = { pending_payment: ["paid", "cancelled"], paid: ["preparing", "cancelled"], preparing: ["ready", "cancelled"], ready: ["completed", "cancelled"], completed: [], cancelled: [] };
    if (!valid[order.status].includes(b.data.status) && order.status !== b.data.status) throw new Error("INVALID_TRANSITION");
    if (b.data.status === "paid" && order.status !== "paid") {
      await tx.update(inventoryReservationsTable)
        .set({ status: "committed" })
        .where(and(eq(inventoryReservationsTable.orderId, order.id), eq(inventoryReservationsTable.status, "active")));
    }
    if (b.data.status === "cancelled" && order.status !== "cancelled") {
      const reservations = await tx.update(inventoryReservationsTable).set({ status: "released" }).where(and(eq(inventoryReservationsTable.orderId, order.id), sql`${inventoryReservationsTable.status} in ('active','committed')`)).returning();
      for (const r of reservations) {
        const [bp] = await tx.update(branchProductsTable).set({ inventory: sql`${branchProductsTable.inventory} + ${r.quantity}` }).where(eq(branchProductsTable.id, r.branchProductId)).returning({ inventory: branchProductsTable.inventory });
        const [fullBp] = await tx.select().from(branchProductsTable).where(eq(branchProductsTable.id, r.branchProductId));
        if (fullBp) await applyInventoryAlert(tx, fullBp, bp.inventory);
        await tx.insert(inventoryLedgerTable).values({ branchProductId: r.branchProductId, orderId: order.id, movement: "release", quantityDelta: r.quantity, balanceAfter: bp.inventory, reason: "Order cancelled" });
      }
    }
    const [o] = await tx.update(ordersTable).set({ status: b.data.status, paymentStatus: b.data.status === "paid" ? "paid" : order.paymentStatus }).where(and(eq(ordersTable.id, order.id), eq(ordersTable.status, order.status))).returning();
    if (!o) throw new Error("INVALID_TRANSITION");
    return o;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ORDER_NOT_FOUND") { res.status(404).json({ error: "Order not found" }); return; }
    if (error instanceof Error && error.message === "FORBIDDEN_BRANCH") { res.status(403).json({ error: "Branch access denied" }); return; }
    if (error instanceof Error && error.message === "INVALID_TRANSITION") { res.status(409).json({ error: "Invalid status transition" }); return; }
    throw error;
  }
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, updated.id));
  res.json(UpdateAdminOrderResponse.parse({ ...updated, items }));
});

const branchUpdateSchema = z.object({
  name: z.string().min(1).optional(), branchCode: z.string().min(1).optional(),
  managerName: z.string().nullable().optional(), managerEmail: z.string().email().nullable().optional(),
  managerPhone: z.string().nullable().optional(), notificationPreferences: z.object({ email: z.boolean().optional(), inApp: z.boolean().optional() }).optional(),
  active: z.boolean().optional(),
});

router.get("/admin/branches", async (req, res): Promise<void> => {
  const ids = await getAccessibleBranchIds(req);
  const rows = await db.select().from(branchesTable)
    .where(ids ? (ids.length ? inArray(branchesTable.id, ids) : sql`false`) : undefined)
    .orderBy(branchesTable.id);
  res.json(rows);
});

router.get("/admin/branches/:id", async (req, res): Promise<void> => {
  const branchId = Number(req.params.id);
  if (!Number.isInteger(branchId) || !(await canAccessBranch(req, branchId))) { res.status(403).json({ error: "Branch access denied" }); return; }
  const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, branchId));
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  const [products, inventory, orders, alerts] = await Promise.all([
    db.select({ configuration: branchProductsTable, product: productsTable }).from(branchProductsTable).innerJoin(productsTable, eq(branchProductsTable.productId, productsTable.id)).where(eq(branchProductsTable.branchId, branchId)),
    db.select({ configuration: branchProductsTable, product: productsTable }).from(branchProductsTable).innerJoin(productsTable, eq(branchProductsTable.productId, productsTable.id)).where(eq(branchProductsTable.branchId, branchId)),
    db.select().from(ordersTable).where(eq(ordersTable.branchId, branchId)).orderBy(desc(ordersTable.createdAt)).limit(100),
    db.select({ alert: inventoryAlertsTable, product: productsTable }).from(inventoryAlertsTable).innerJoin(productsTable, eq(inventoryAlertsTable.productId, productsTable.id)).where(eq(inventoryAlertsTable.branchId, branchId)).orderBy(desc(inventoryAlertsTable.createdAt)),
  ]);
  res.json({ branch, general: branch, contact: { phone: branch.phone, whatsapp: branch.whatsapp, email: branch.email }, hours: branch.hours, products, inventory, orders, alerts, notificationSettings: branch.notificationPreferences });
});

const reportQuery = z.object({
  from: z.string().optional(), to: z.string().optional(),
});
router.get("/admin/reports/branches", async (req, res): Promise<void> => {
  const parsed = reportQuery.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const ids = await getAccessibleBranchIds(req);
  const dateFilters: ReturnType<typeof sql>[] = [];
  if (parsed.data.from) dateFilters.push(sql`${ordersTable.createdAt} >= ${new Date(parsed.data.from)}`);
  if (parsed.data.to) dateFilters.push(sql`${ordersTable.createdAt} < ${new Date(parsed.data.to)}`);
  const branchFilter = ids ? (ids.length ? inArray(branchesTable.id, ids) : sql`false`) : undefined;
  const branches = await db.select({ id: branchesTable.id, name: branchesTable.name }).from(branchesTable).where(branchFilter).orderBy(branchesTable.id);
  const rows = await Promise.all(branches.map(async (branch) => {
    const [sales] = await db.select({ orderCount: sql<number>`count(*)::int`, revenue: sql<string>`coalesce(sum(${ordersTable.total}), 0)::numeric` })
      .from(ordersTable).where(and(eq(ordersTable.branchId, branch.id), sql`${ordersTable.status} <> 'cancelled'`, ...dateFilters));
    const [stock] = await db.select({
      inventoryCount: sql<number>`coalesce(sum(${branchProductsTable.inventory}), 0)::int`,
      inventoryValue: sql<string>`coalesce(sum(${branchProductsTable.inventory} * coalesce(${branchProductsTable.priceOverride}, ${productsTable.price})), 0)::numeric`,
      lowStockCount: sql<number>`count(*) filter (where ${branchProductsTable.inventory} > 0 and ${branchProductsTable.inventory} <= ${branchProductsTable.minStock})::int`,
      outOfStockCount: sql<number>`count(*) filter (where ${branchProductsTable.inventory} = 0)::int`,
    }).from(branchProductsTable).innerJoin(productsTable, eq(branchProductsTable.productId, productsTable.id)).where(eq(branchProductsTable.branchId, branch.id));
    return { branchId: branch.id, branchName: branch.name, ...sales, ...stock };
  }));
  res.json(rows);
});

router.patch("/admin/branches/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const body = branchUpdateSchema.safeParse(req.body);
  if (!Number.isInteger(id) || !body.success) { res.status(400).json({ error: "Invalid branch update" }); return; }
  if (!(await canAccessBranch(req, id))) { res.status(403).json({ error: "Branch access denied" }); return; }
  const [branch] = await db.update(branchesTable).set(body.data).where(eq(branchesTable.id, id)).returning();
  if (!branch) { res.status(404).json({ error: "Branch not found" }); return; }
  res.json(branch);
});

const inventoryQuery = z.object({
  search: z.string().optional(), branchId: z.coerce.number().int().optional(),
  state: z.enum(["NORMAL", "LOW_STOCK", "OUT_OF_STOCK"]).optional(),
  categoryId: z.coerce.number().int().optional(),
});

async function scopedBranchId(req: Parameters<typeof canAccessBranch>[0], branchId: number): Promise<boolean> {
  return canAccessBranch(req, branchId);
}

router.get("/admin/inventory", async (req, res): Promise<void> => {
  const q = inventoryQuery.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  if (q.data.branchId != null && !(await scopedBranchId(req, q.data.branchId))) { res.status(403).json({ error: "Branch access denied" }); return; }
  const ids = await getAccessibleBranchIds(req);
  const filters = [];
  if (ids) filters.push(ids.length ? inArray(branchProductsTable.branchId, ids) : sql`false`);
  if (q.data.branchId != null) filters.push(eq(branchProductsTable.branchId, q.data.branchId));
  if (q.data.categoryId != null) filters.push(eq(productsTable.categoryId, q.data.categoryId));
  if (q.data.state) filters.push(eq(branchProductsTable.alertState, q.data.state));
  if (q.data.search) filters.push(sql`(${productsTable.sku} ilike ${`%${q.data.search}%`} or ${productsTable.name} ilike ${`%${q.data.search}%`})`);
  const rows = await db.select({ branchProduct: branchProductsTable, branch: branchesTable, product: productsTable,
    reservedStock: sql<number>`coalesce((select sum(${inventoryReservationsTable.quantity}) from ${inventoryReservationsTable} where ${inventoryReservationsTable.branchProductId} = ${branchProductsTable.id} and ${inventoryReservationsTable.status} = 'active'), 0)::int` })
    .from(branchProductsTable).innerJoin(branchesTable, eq(branchProductsTable.branchId, branchesTable.id))
    .innerJoin(productsTable, eq(branchProductsTable.productId, productsTable.id))
    .where(filters.length ? and(...filters) : undefined).orderBy(productsTable.name);
  res.json(rows);
});

router.get("/admin/inventory/matrix", async (req, res): Promise<void> => {
  const ids = await getAccessibleBranchIds(req);
  const rows = await db.select({ product: productsTable, branchProduct: branchProductsTable, branch: branchesTable,
    reservedStock: sql<number>`coalesce((select sum(${inventoryReservationsTable.quantity}) from ${inventoryReservationsTable} where ${inventoryReservationsTable.branchProductId} = ${branchProductsTable.id} and ${inventoryReservationsTable.status} = 'active'), 0)::int` })
    .from(productsTable).leftJoin(branchProductsTable, eq(branchProductsTable.productId, productsTable.id))
    .leftJoin(branchesTable, eq(branchProductsTable.branchId, branchesTable.id))
    .where(ids ? (ids.length ? inArray(branchProductsTable.branchId, ids) : sql`false`) : undefined);
  res.json(rows);
});

const stockUpdateSchema = z.object({
  branchProductId: z.number().int().optional(), branchId: z.number().int().optional(), productId: z.number().int().optional(),
  quantity: z.number().int().min(0).optional(), delta: z.number().int().optional(),
  reason: z.string().min(1), reference: z.string().optional(),
}).refine((v) => v.quantity != null || v.delta != null, "quantity or delta is required");

router.post("/admin/inventory/update", async (req, res): Promise<void> => {
  const parsed = stockUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const input = parsed.data;
  try {
    const result = await db.transaction(async (tx) => {
      let bp;
      if (input.branchProductId) [bp] = await tx.select().from(branchProductsTable).where(eq(branchProductsTable.id, input.branchProductId)).for("update");
      else if (input.branchId && input.productId) [bp] = await tx.select().from(branchProductsTable).where(and(eq(branchProductsTable.branchId, input.branchId), eq(branchProductsTable.productId, input.productId))).for("update");
      if (!bp) throw new Error("INVENTORY_NOT_FOUND");
      if (!(await canAccessBranch(req, bp.branchId))) throw new Error("FORBIDDEN_BRANCH");
      const next = input.quantity != null ? input.quantity : bp.inventory + input.delta!;
      if (next < 0) throw new Error("NEGATIVE_INVENTORY");
      const nextState = stockState(next, bp.minStock);
      const [updated] = await tx.update(branchProductsTable).set({ inventory: next, alertState: nextState }).where(eq(branchProductsTable.id, bp.id)).returning();
      const [ledger] = await tx.insert(inventoryLedgerTable).values({
        branchProductId: bp.id, movement: "adjustment", category: "manual", quantityDelta: next - bp.inventory,
        balanceAfter: next, previousBalance: bp.inventory, newBalance: next, actorUserId: req.localUser?.id,
        reference: input.reference, reason: input.reason,
      }).returning();
      await applyInventoryAlert(tx, bp, next);
      return { inventory: updated, ledger };
    });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN_BRANCH") { res.status(403).json({ error: "Branch access denied" }); return; }
    if (message === "INVENTORY_NOT_FOUND") { res.status(404).json({ error: "Inventory record not found" }); return; }
    if (message === "NEGATIVE_INVENTORY") { res.status(409).json({ error: "Inventory cannot be negative" }); return; }
    throw error;
  }
});

router.get("/admin/inventory/movements", async (req, res): Promise<void> => {
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  if (branchId != null && !(await canAccessBranch(req, branchId))) { res.status(403).json({ error: "Branch access denied" }); return; }
  const ids = await getAccessibleBranchIds(req);
  const rows = await db.select().from(inventoryLedgerTable).innerJoin(branchProductsTable, eq(inventoryLedgerTable.branchProductId, branchProductsTable.id))
    .where(ids ? (ids.length ? inArray(branchProductsTable.branchId, ids) : sql`false`) : branchId ? eq(branchProductsTable.branchId, branchId) : undefined)
    .orderBy(desc(inventoryLedgerTable.createdAt));
  res.json(rows);
});

router.get("/admin/inventory/alerts", async (req, res): Promise<void> => {
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  if (branchId != null && !(await canAccessBranch(req, branchId))) { res.status(403).json({ error: "Branch access denied" }); return; }
  const ids = await getAccessibleBranchIds(req);
  const alertFilters = ids ? (ids.length ? inArray(inventoryAlertsTable.branchId, ids) : sql`false`) : branchId ? eq(inventoryAlertsTable.branchId, branchId) : undefined;
  const rows = await db.select({ alert: inventoryAlertsTable, branch: branchesTable, product: productsTable })
    .from(inventoryAlertsTable).innerJoin(branchesTable, eq(inventoryAlertsTable.branchId, branchesTable.id))
    .innerJoin(productsTable, eq(inventoryAlertsTable.productId, productsTable.id))
    .where(alertFilters).orderBy(desc(inventoryAlertsTable.createdAt));
  res.json(rows);
});

router.post("/admin/inventory/import/preview", async (req, res): Promise<void> => {
  const csv = typeof req.body?.csv === "string" ? req.body.csv : "";
  const result = validateInventoryCsv(csv);
  const ids = await getAccessibleBranchIds(req);
  const allowed = ids === null ? null : new Set(ids);
  const branches = await db.select({ id: branchesTable.id, code: branchesTable.branchCode }).from(branchesTable);
  const byCode = new Map(branches.map((b) => [b.code, b.id]));
  const products = await db.select({ sku: productsTable.sku }).from(productsTable);
  const skus = new Set(products.map((p) => p.sku));
  const errors = [...result.errors];
  result.rows.forEach((row, i) => { const branchId = byCode.get(row.branchCode); if (!branchId) errors.push({ row: i + 2, message: "Unknown branch_code" }); else if (allowed && !allowed.has(branchId)) errors.push({ row: i + 2, message: "Branch access denied" }); if (!skus.has(row.sku)) errors.push({ row: i + 2, message: "Unknown SKU" }); });
  res.json({ rows: result.rows, errors, valid: errors.length === 0 });
});

router.post("/admin/inventory/import", async (req, res): Promise<void> => {
  const parsed = validateInventoryCsv(typeof req.body?.csv === "string" ? req.body.csv : "");
  const branches = await db.select({ id: branchesTable.id, code: branchesTable.branchCode }).from(branchesTable);
  const products = await db.select({ id: productsTable.id, sku: productsTable.sku }).from(productsTable);
  const branchMap = new Map(branches.map((b) => [b.code, b.id])), productMap = new Map(products.map((p) => [p.sku, p.id]));
  const ids = await getAccessibleBranchIds(req), errors = [...parsed.errors];
  const existing = await db.select({ branchId: branchProductsTable.branchId, productId: branchProductsTable.productId }).from(branchProductsTable);
  const existingPairs = new Set(existing.map((row) => `${row.branchId}:${row.productId}`));
  for (const [i, row] of parsed.rows.entries()) {
    const branchId = branchMap.get(row.branchCode), productId = productMap.get(row.sku);
    if (!branchId || (ids && !ids.includes(branchId))) errors.push({ row: i + 2, message: "Invalid branch_code or access" });
    if (!productId) errors.push({ row: i + 2, message: "Unknown SKU" });
    else if (branchId && !existingPairs.has(`${branchId}:${productId}`)) errors.push({ row: i + 2, message: "SKU is not configured for branch" });
  }
  if (errors.length) { res.status(400).json({ imported: 0, errors }); return; }
  const imported = await db.transaction(async (tx) => {
    for (const row of parsed.rows) {
      const branchId = branchMap.get(row.branchCode)!, productId = productMap.get(row.sku)!;
      const [bp] = await tx.select().from(branchProductsTable).where(and(eq(branchProductsTable.branchId, branchId), eq(branchProductsTable.productId, productId))).for("update");
      if (!bp) throw new Error(`Missing branch product for ${row.sku}/${row.branchCode}`);
      const state = stockState(row.quantity, bp.minStock);
      await tx.update(branchProductsTable).set({ inventory: row.quantity, alertState: state }).where(eq(branchProductsTable.id, bp.id));
      await tx.insert(inventoryLedgerTable).values({ branchProductId: bp.id, movement: "adjustment", category: "import", quantityDelta: row.quantity - bp.inventory, balanceAfter: row.quantity, previousBalance: bp.inventory, newBalance: row.quantity, actorUserId: req.localUser?.id, reason: "Inventory CSV import" });
      await applyInventoryAlert(tx, bp, row.quantity);
    }
    return parsed.rows.length;
  });
  res.json({ imported, errors: [] });
});

router.get("/admin/summary", async (_req, res): Promise<void> => {
  const [productCounts] = await db
    .select({
      totalProducts: sql<number>`count(*)::int`,
      activeProducts:
        sql<number>`count(*) filter (where ${productsTable.status} = 'active')::int`,
    })
    .from(productsTable);

  const [branchCount] = await db
    .select({ totalBranches: sql<number>`count(*)::int` })
    .from(branchesTable)
    .where(eq(branchesTable.active, true));

  const [lowStock] = await db
    .select({ lowStockProducts: sql<number>`count(*)::int` })
    .from(branchProductsTable)
    .where(
      and(
        eq(branchProductsTable.available, true),
        lt(branchProductsTable.inventory, 6),
      ),
    );

  const branchSummaries = await db
    .select({
      branchId: branchesTable.id,
      branchName: branchesTable.name,
      activeProducts:
        sql<number>`count(${branchProductsTable.id}) filter (where ${branchProductsTable.available} = true)::int`,
      lowStockProducts:
        sql<number>`count(${branchProductsTable.id}) filter (where ${branchProductsTable.available} = true and ${branchProductsTable.inventory} < 6)::int`,
    })
    .from(branchesTable)
    .leftJoin(
      branchProductsTable,
      eq(branchProductsTable.branchId, branchesTable.id),
    )
    .where(eq(branchesTable.active, true))
    .groupBy(branchesTable.id)
    .orderBy(branchesTable.id);

  res.json(
    GetAdminSummaryResponse.parse({
      totalProducts: productCounts?.totalProducts ?? 0,
      activeProducts: productCounts?.activeProducts ?? 0,
      totalBranches: branchCount?.totalBranches ?? 0,
      lowStockProducts: lowStock?.lowStockProducts ?? 0,
      branchSummaries,
    }),
  );
});

router.get("/admin/products", async (req, res): Promise<void> => {
  const query = ListAdminProductsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const products = await listProductCards({
    search: query.data.search,
    status: query.data.status,
  });
  res.json(ListAdminProductsResponse.parse(products));
});

router.post("/admin/products", async (req, res): Promise<void> => {
  const body = CreateProductBody.safeParse(req.body);
  const configurations = branchConfigurationsSchema.safeParse(req.body?.branchConfigurations);
  if (!body.success || !configurations.success) {
    const message = !body.success ? body.error.message : configurations.error?.message ?? "Invalid branch configuration";
    req.log.warn({ errors: message }, "Invalid product");
    res.status(400).json({ error: message });
    return;
  }
  for (const config of configurations.data ?? []) {
    if (!(await canAccessBranch(req, config.branchId))) { res.status(403).json({ error: "Branch access denied" }); return; }
  }

  const [product] = await db.insert(productsTable).values({ ...body.data, gallery: body.data.imageUrl ? [body.data.imageUrl] : [], tags: [] }).returning();

  const branches = await db
    .select({ id: branchesTable.id })
    .from(branchesTable)
    .where(eq(branchesTable.active, true));

  if (branches.length) {
    const configs = configurations.data ?? [];
    await db.insert(branchProductsTable).values(
      branches.map((branch) => {
        const config = configs.find((item) => item.branchId === branch.id);
        return ({
        branchId: branch.id,
        productId: product.id,
        available: config?.available ?? false,
        inventory: config?.inventory ?? 0,
        minStock: config?.minStock ?? 0,
        priceOverride: config?.priceOverride,
        salePriceOverride: config?.salePriceOverride,
        preparationTimeMinutes: config?.preparationTimeMinutes,
        pickupAvailable: config?.pickupAvailable ?? true,
        deliveryAvailable: config?.deliveryAvailable ?? true,
      }); }),
    );
  }

  const detail = await getProductDetailBySlug(product.slug);
  res.status(201).json(CreateProductResponse.parse(detail));
});

router.patch("/admin/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  const body = UpdateProductBody.safeParse(req.body);
  const configurations = branchConfigurationsSchema.safeParse(req.body?.branchConfigurations);

  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!body.success || !configurations.success) {
    res.status(400).json({ error: !body.success ? body.error.message : configurations.error?.message ?? "Invalid branch configuration" });
    return;
  }

  const [product] = await db
    .update(productsTable)
    .set(body.data)
    .where(eq(productsTable.id, params.data.id))
    .returning();

  if (!product) {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }

  for (const config of configurations.data ?? []) {
    if (!(await canAccessBranch(req, config.branchId))) { res.status(403).json({ error: "Branch access denied" }); return; }
    const { branchId, ...values } = config;
    await db.insert(branchProductsTable).values({ branchId, productId: product.id, ...values }).onConflictDoUpdate({
      target: [branchProductsTable.branchId, branchProductsTable.productId], set: values,
    });
  }

  const detail = await getProductDetailBySlug(product.slug);
  res.json(UpdateProductResponse.parse(detail));
});

export default router;