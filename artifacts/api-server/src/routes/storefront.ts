import { Router, type IRouter } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  branchesTable,
  categoriesTable,
  db,
  productsTable,
} from "@workspace/db";
import {
  GetBranchParams,
  GetBranchResponse,
  GetProductQueryParams,
  GetProductParams,
  GetProductResponse,
  ListBranchesResponse,
  ListCategoriesResponse,
  ListProductsQueryParams,
  ListProductsResponse,
} from "@workspace/api-zod";
import {
  getProductDetailBySlug,
  listProductCards,
  serializeBranch,
} from "../lib/catalog";
import { subscribeToCatalogChanges } from "../lib/catalog-events";

const router: IRouter = Router();

router.get("/catalog/events", (req, res): void => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write("retry: 3000\n\n");

  const unsubscribe = subscribeToCatalogChanges((event) => {
    res.write(`event: catalog-change\ndata: ${JSON.stringify(event)}\n\n`);
  });
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
});

router.get("/branches", async (_req, res): Promise<void> => {
  const branches = await db
    .select()
    .from(branchesTable)
    .where(eq(branchesTable.active, true))
    .orderBy(asc(branchesTable.id));

  res.json(ListBranchesResponse.parse(branches.map(serializeBranch)));
});

router.get("/branches/:slug", async (req, res): Promise<void> => {
  const params = GetBranchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [branch] = await db
    .select()
    .from(branchesTable)
    .where(
      and(
        eq(branchesTable.slug, params.data.slug),
        eq(branchesTable.active, true),
      ),
    );

  if (!branch) {
    res.status(404).json({ error: "Sucursal no encontrada" });
    return;
  }

  const products = await listProductCards({
    branchSlug: branch.slug,
    publicOnly: true,
  });

  res.json(
    GetBranchResponse.parse({
      ...serializeBranch(branch),
      products,
    }),
  );
});

router.get("/categories", async (_req, res): Promise<void> => {
  const categories = await db
    .select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      slug: categoriesTable.slug,
      description: categoriesTable.description,
      imageUrl: categoriesTable.imageUrl,
      productCount: sql<number>`count(${productsTable.id})::int`,
    })
    .from(categoriesTable)
    .leftJoin(
      productsTable,
      and(
        eq(productsTable.categoryId, categoriesTable.id),
        eq(productsTable.status, "active"),
      ),
    )
    .where(eq(categoriesTable.active, true))
    .groupBy(categoriesTable.id)
    .orderBy(asc(categoriesTable.sortOrder));

  res.json(ListCategoriesResponse.parse(categories));
});

router.get("/products", async (req, res): Promise<void> => {
  const rawQuery: Record<string, unknown> = { ...req.query };
  if (typeof rawQuery.scheduledStart === "string") {
    rawQuery.scheduledStart = new Date(rawQuery.scheduledStart);
  }
  const query = ListProductsQueryParams.safeParse(rawQuery);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const products = await listProductCards({
    ...query.data,
    publicOnly: true,
  });
  res.json(ListProductsResponse.parse(products));
});

router.get("/products/:slug", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const query = GetProductQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const product = await getProductDetailBySlug(params.data.slug, query.data.branchId);
  if (!product || product.status !== "active") {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }

  res.json(GetProductResponse.parse(product));
});

export default router;