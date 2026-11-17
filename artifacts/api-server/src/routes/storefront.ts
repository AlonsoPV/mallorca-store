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
import { listStoreMenus, readStoreMenuFile } from "../lib/store-menus";

const router: IRouter = Router();

function sitemapOrigin() {
  const raw = String(process.env.PUBLIC_APP_URL || process.env.STOREFRONT_PUBLIC_URL || "")
    .trim()
    .replace(/\/$/, "");
  if (raw && /^https?:\/\//i.test(raw)) return raw;
  return "https://pasteleria-mallorca.mx";
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

router.get("/sitemap.xml", async (_req, res): Promise<void> => {
  try {
    const origin = sitemapOrigin();
    const [branches, products] = await Promise.all([
      db
        .select({ slug: branchesTable.slug })
        .from(branchesTable)
        .where(eq(branchesTable.active, true))
        .orderBy(asc(branchesTable.id)),
      db
        .select({ slug: productsTable.slug })
        .from(productsTable)
        .where(eq(productsTable.status, "active"))
        .orderBy(asc(productsTable.id)),
    ]);

    const staticPaths = [
      { path: "/", priority: "1.0", changefreq: "weekly" },
      { path: "/tienda", priority: "0.9", changefreq: "daily" },
      { path: "/sucursales", priority: "0.8", changefreq: "weekly" },
      { path: "/panettone", priority: "0.9", changefreq: "weekly" },
      { path: "/terminos-y-condiciones", priority: "0.2", changefreq: "yearly" },
      { path: "/aviso-de-privacidad", priority: "0.2", changefreq: "yearly" },
    ];

    const urls = [
      ...staticPaths.map((item) => ({
        loc: `${origin}${item.path}`,
        priority: item.priority,
        changefreq: item.changefreq,
      })),
      ...branches.map((branch) => ({
        loc: `${origin}/sucursales/${encodeURIComponent(branch.slug)}`,
        priority: "0.8",
        changefreq: "weekly",
      })),
      ...products.map((product) => ({
        loc: `${origin}/producto/${encodeURIComponent(product.slug)}`,
        priority: "0.7",
        changefreq: "daily",
      })),
    ];

    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${xmlEscape(url.loc)}</loc>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>
`;
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.status(200).send(body);
  } catch {
    res.status(503).type("text/plain").send("Sitemap unavailable");
  }
});

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
  res.setHeader("Cache-Control", "no-store");
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
  res.setHeader("Cache-Control", "no-store");
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

router.get("/menus", async (_req, res): Promise<void> => {
  try {
    res.json({ menus: await listStoreMenus() });
  } catch {
    res.json({ menus: [] });
  }
});

router.get("/menus/:key/file", async (req, res): Promise<void> => {
  try {
    const file = await readStoreMenuFile(String(req.params.key || ""));
    if (!file) {
      res.status(404).json({ error: "Menú no encontrado" });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", file.disposition);
    res.setHeader("Cache-Control", "no-cache");
    res.send(file.data);
  } catch {
    res.status(503).json({ error: "Aplica la migración de menús (009_store_menus.sql)." });
  }
});

export default router;