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

const router: IRouter = Router();

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
  const query = ListProductsQueryParams.safeParse(req.query);
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
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const product = await getProductDetailBySlug(params.data.slug);
  if (!product || product.status !== "active") {
    res.status(404).json({ error: "Producto no encontrado" });
    return;
  }

  res.json(GetProductResponse.parse(product));
});

export default router;