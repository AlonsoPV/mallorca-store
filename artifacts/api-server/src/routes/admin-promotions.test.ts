import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import express, { type Express } from "express";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import {
  branchesTable,
  branchProductsTable,
  categoriesTable,
  db,
  pool,
  productsTable,
  promotionBranchesTable,
  promotionsTable,
  type User,
} from "@workspace/db";
import apiRouter from "./index.ts";

type PromotionInput = {
  name: string;
  type: "fixed" | "percentage" | "amount";
  value: number;
  startsAt: string;
  endsAt: string;
  branchIds: number[];
};

const testKey = `${Date.now()}-${process.pid}`;
let app: Express;
let server: Server;
let baseUrl: string;
let productId: number;
let productSlug: string;
let branchId: number;
let branchSlug: string;

function promotionInput(overrides: Partial<PromotionInput> = {}): PromotionInput {
  const startsAt = new Date(Date.now() + 60 * 60_000);
  const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
  return {
    name: `Promoción de prueba ${testKey}`,
    type: "percentage",
    value: 20,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    branchIds: [branchId],
    ...overrides,
  };
}

async function request(
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json();
  return { response, body };
}

async function createPromotion(
  overrides: Partial<{
    name: string;
    type: "fixed" | "percentage" | "amount";
    value: number;
    startsAt: Date;
    endsAt: Date;
    cancelledAt: Date | null;
    cancelledBy: string | null;
  }> = {},
) {
  const [promotion] = await db
    .insert(promotionsTable)
    .values({
      productId,
      name: overrides.name ?? `Promoción ${testKey}`,
      type: overrides.type ?? "percentage",
      value: overrides.value ?? 20,
      startsAt: overrides.startsAt ?? new Date(Date.now() + 60 * 60_000),
      endsAt: overrides.endsAt ?? new Date(Date.now() + 2 * 60 * 60_000),
      cancelledAt: overrides.cancelledAt ?? null,
      cancelledBy: overrides.cancelledBy ?? null,
      createdBy: "task-26-test",
    })
    .returning();

  await db.insert(promotionBranchesTable).values({
    promotionId: promotion.id,
    branchId,
  });
  return promotion;
}

async function startTestServer() {
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.localUser = {
      id: `task-26-admin-${testKey}`,
      email: "task-26@example.invalid",
      role: "admin",
    } as User;
    next();
  });
  app.use("/api", apiRouter);

  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine test server address");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function stopTestServer() {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

test.before(async () => {
  const [category] = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .limit(1);
  const [branch] = await db
    .select({ id: branchesTable.id, slug: branchesTable.slug })
    .from(branchesTable)
    .where(eq(branchesTable.active, true))
    .limit(1);
  if (!category || !branch) {
    throw new Error("Promotion integration test requires a category and active branch");
  }

  branchId = branch.id;
  branchSlug = branch.slug;
  productSlug = `task-26-${testKey}`;
  const [product] = await db
    .insert(productsTable)
    .values({
      sku: `TASK-26-${testKey}`,
      name: `Producto de prueba ${testKey}`,
      slug: productSlug,
      shortDescription: "Producto aislado para pruebas de promociones",
      description: "Producto aislado para pruebas de promociones",
      price: 100,
      salePrice: 90,
      categoryId: category.id,
      status: "active",
    })
    .returning({ id: productsTable.id });
  if (!product) throw new Error("Could not create promotion integration test product");
  productId = product.id;

  await db.insert(branchProductsTable).values({
    branchId,
    productId,
    available: true,
    inventory: 10,
  });
  await startTestServer();
});

test.after(async () => {
  await stopTestServer();
  await db.delete(productsTable).where(eq(productsTable.id, productId));
  await pool.end();
});

test.afterEach(async () => {
  await db.delete(promotionsTable).where(eq(promotionsTable.productId, productId));
});

test("allows editing a scheduled promotion before it starts", async () => {
  const original = await createPromotion({
    name: `Programada ${testKey}`,
    startsAt: new Date(Date.now() + 60 * 60_000),
    endsAt: new Date(Date.now() + 2 * 60 * 60_000),
  });
  const edited = promotionInput({
    name: `Programada editada ${testKey}`,
    value: 35,
    startsAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
    endsAt: new Date(Date.now() + 4 * 60 * 60_000).toISOString(),
  });

  const response = await request(
    `/api/admin/products/${productId}/promotions/${original.id}`,
    {
      method: "PATCH",
      body: JSON.stringify(edited),
    },
  );
  assert.equal(response.response.status, 200);
  assert.equal(response.body.name, edited.name);
  assert.equal(response.body.value, edited.value);
  assert.equal(response.body.status, "scheduled");

  const [after] = await db
    .select()
    .from(promotionsTable)
    .where(eq(promotionsTable.id, original.id));
  assert.ok(after);
  assert.equal(after.name, edited.name);
  assert.equal(after.value, edited.value);
  assert.equal(after.startsAt.toISOString(), edited.startsAt);
  assert.equal(after.endsAt.toISOString(), edited.endsAt);
});

test("rejects PATCH and cancellation for active, finished, and cancelled promotions", async () => {
  const now = Date.now();
  const active = await createPromotion({
    name: `Activa ${testKey}`,
    startsAt: new Date(now - 60_000),
    endsAt: new Date(now + 60 * 60_000),
  });
  const finished = await createPromotion({
    name: `Finalizada ${testKey}`,
    startsAt: new Date(now - 2 * 60 * 60_000),
    endsAt: new Date(now - 60_000),
  });
  const cancelled = await createPromotion({
    name: `Cancelada ${testKey}`,
    startsAt: new Date(now + 60 * 60_000),
    endsAt: new Date(now + 2 * 60 * 60_000),
    cancelledAt: new Date(now - 30_000),
    cancelledBy: "previous-admin",
  });

  for (const original of [active, finished, cancelled]) {
    const edit = await request(
      `/api/admin/products/${productId}/promotions/${original.id}`,
      {
        method: "PATCH",
        body: JSON.stringify(
          promotionInput({
            name: `Intento de cambio ${testKey}`,
            startsAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
            endsAt: new Date(Date.now() + 4 * 60 * 60_000).toISOString(),
          }),
        ),
      },
    );
    assert.equal(edit.response.status, 409);
    assert.equal(edit.body.error, "Only scheduled promotions can be edited");

    const cancel = await request(
      `/api/admin/products/${productId}/promotions/${original.id}/cancel`,
      { method: "POST" },
    );
    assert.equal(cancel.response.status, 409);
    assert.equal(cancel.body.error, "Only scheduled promotions can be cancelled");

    const [after] = await db
      .select()
      .from(promotionsTable)
      .where(eq(promotionsTable.id, original.id));
    assert.ok(after);
    assert.deepEqual(
      {
        name: after.name,
        type: after.type,
        value: after.value,
        startsAt: after.startsAt.toISOString(),
        endsAt: after.endsAt.toISOString(),
        cancelledAt: after.cancelledAt?.toISOString() ?? null,
        cancelledBy: after.cancelledBy,
      },
      {
        name: original.name,
        type: original.type,
        value: original.value,
        startsAt: original.startsAt.toISOString(),
        endsAt: original.endsAt.toISOString(),
        cancelledAt: original.cancelledAt?.toISOString() ?? null,
        cancelledBy: original.cancelledBy,
      },
    );
  }
});

test("rejects a PATCH that arrives when a promotion has just started", async () => {
  const startsAt = new Date(Date.now() + 250);
  const promotion = await createPromotion({
    name: `Inicio inmediato ${testKey}`,
    startsAt,
    endsAt: new Date(startsAt.getTime() + 60 * 60_000),
  });

  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, startsAt.getTime() - Date.now() + 10)),
  );

  const edit = await request(
    `/api/admin/products/${productId}/promotions/${promotion.id}`,
    {
      method: "PATCH",
      body: JSON.stringify(
        promotionInput({
          name: `Cambio después del inicio ${testKey}`,
          startsAt: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
          endsAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
        }),
      ),
    },
  );
  assert.equal(edit.response.status, 409);

  const cancel = await request(
    `/api/admin/products/${productId}/promotions/${promotion.id}/cancel`,
    { method: "POST" },
  );
  assert.equal(cancel.response.status, 409);

  const [after] = await db
    .select()
    .from(promotionsTable)
    .where(eq(promotionsTable.id, promotion.id));
  assert.ok(after);
  assert.equal(after.name, promotion.name);
  assert.equal(after.startsAt.toISOString(), promotion.startsAt.toISOString());
  assert.equal(after.endsAt.toISOString(), promotion.endsAt.toISOString());
  assert.equal(after.cancelledAt, null);
});

test("cancelling a scheduled promotion removes its public discount", async () => {
  const promotion = await createPromotion({
    name: `Precio cancelado ${testKey}`,
    startsAt: new Date(Date.now() + 60 * 60_000),
    endsAt: new Date(Date.now() + 2 * 60 * 60_000),
  });

  const cancel = await request(
    `/api/admin/products/${productId}/promotions/${promotion.id}/cancel`,
    { method: "POST" },
  );
  assert.equal(cancel.response.status, 200);
  assert.equal(cancel.body.status, "cancelled");
  assert.equal(cancel.body.cancelledBy, `task-26-admin-${testKey}`);

  const catalog = await request(
    `/api/products?branchSlug=${encodeURIComponent(branchSlug)}`,
  );
  assert.equal(catalog.response.status, 200);
  const product = catalog.body.find((item: { slug: string }) => item.slug === productSlug);
  assert.ok(product);
  const availability = product.availability.find(
    (item: { branchId: number }) => item.branchId === branchId,
  );
  assert.ok(availability);
  assert.equal(availability.salePrice, 90);
  assert.equal(availability.promotion, null);

  const [after] = await db
    .select({ cancelledAt: promotionsTable.cancelledAt })
    .from(promotionsTable)
    .where(
      and(
        eq(promotionsTable.id, promotion.id),
        eq(promotionsTable.productId, productId),
      ),
    );
  assert.ok(after?.cancelledAt);
});