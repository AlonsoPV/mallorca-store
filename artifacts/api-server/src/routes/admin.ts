import { Router, type IRouter } from "express";
import { and, eq, lt, sql } from "drizzle-orm";
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
import { ordersTable, orderItemsTable, inventoryReservationsTable, inventoryLedgerTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { ListAdminOrdersQueryParams, ListAdminOrdersResponse, UpdateAdminOrderParams, UpdateAdminOrderBody, UpdateAdminOrderResponse } from "@workspace/api-zod";
import {
  getProductDetailBySlug,
  listProductCards,
} from "../lib/catalog";

const router: IRouter = Router();

router.get("/admin/orders", async (req, res): Promise<void> => {
  const q = ListAdminOrdersQueryParams.safeParse(req.query);
  if (!q.success) { res.status(400).json({ error: q.error.message }); return; }
  const rows = await db.select({ id: ordersTable.id, orderNumber: ordersTable.orderNumber, status: ordersTable.status, total: ordersTable.total, createdAt: ordersTable.createdAt })
    .from(ordersTable).where(q.data.status ? eq(ordersTable.status, q.data.status as any) : undefined).orderBy(desc(ordersTable.createdAt));
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
        await tx.insert(inventoryLedgerTable).values({ branchProductId: r.branchProductId, orderId: order.id, movement: "release", quantityDelta: r.quantity, balanceAfter: bp.inventory, reason: "Order cancelled" });
      }
    }
    const [o] = await tx.update(ordersTable).set({ status: b.data.status, paymentStatus: b.data.status === "paid" ? "paid" : order.paymentStatus }).where(and(eq(ordersTable.id, order.id), eq(ordersTable.status, order.status))).returning();
    if (!o) throw new Error("INVALID_TRANSITION");
    return o;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ORDER_NOT_FOUND") { res.status(404).json({ error: "Order not found" }); return; }
    if (error instanceof Error && error.message === "INVALID_TRANSITION") { res.status(409).json({ error: "Invalid status transition" }); return; }
    throw error;
  }
  const items = await db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, updated.id));
  res.json(UpdateAdminOrderResponse.parse({ ...updated, items }));
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
  if (!body.success) {
    req.log.warn({ errors: body.error.message }, "Invalid product");
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [product] = await db
    .insert(productsTable)
    .values({
      ...body.data,
      gallery: body.data.imageUrl ? [body.data.imageUrl] : [],
      tags: [],
    })
    .returning();

  const branches = await db
    .select({ id: branchesTable.id })
    .from(branchesTable)
    .where(eq(branchesTable.active, true));

  if (branches.length) {
    await db.insert(branchProductsTable).values(
      branches.map((branch) => ({
        branchId: branch.id,
        productId: product.id,
        available: false,
        inventory: 0,
      })),
    );
  }

  const detail = await getProductDetailBySlug(product.slug);
  res.status(201).json(CreateProductResponse.parse(detail));
});

router.patch("/admin/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  const body = UpdateProductBody.safeParse(req.body);

  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  if (!body.success) {
    res.status(400).json({ error: body.error.message });
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

  const detail = await getProductDetailBySlug(product.slug);
  res.json(UpdateProductResponse.parse(detail));
});

export default router;