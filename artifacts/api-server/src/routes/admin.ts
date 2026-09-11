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
import {
  getProductDetailBySlug,
  listProductCards,
} from "../lib/catalog";

const router: IRouter = Router();

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