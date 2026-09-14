import { and, eq, inArray, sql } from "drizzle-orm";
import {
  branchProductsTable,
  branchesTable,
  catalogChangeLogTable,
  categoriesTable,
  db,
  inventoryLedgerTable,
  productCategoriesTable,
  productCrossSellsTable,
  productTagsTable,
  productsTable,
  promotionBranchesTable,
  promotionsTable,
  tagsTable,
  type Product,
} from "@workspace/db";
import { stockState } from "./inventory";
import { applyInventoryAlert } from "./inventory-alerts";
import {
  mapImportDiscountType,
  normalizeTagSlug,
  resolvePrimaryCategoryId,
  splitPipeList,
} from "./product-aggregate-pure.ts";

export {
  mapImportDiscountType,
  normalizeTagSlug,
  resolvePrimaryCategoryId,
  splitPipeList,
} from "./product-aggregate-pure.ts";
export const MAX_CROSS_SELL = 6;

export type BranchConfigurationInput = {
  branchId: number;
  available?: boolean;
  inventory?: number;
  minStock?: number;
  criticalStock?: number | null;
  autoAlertEnabled?: boolean;
  priceOverride?: number | null;
  salePriceOverride?: number | null;
  preparationTimeMinutes?: number | null;
  pickupAvailable?: boolean;
  deliveryAvailable?: boolean;
};

export type PromotionAggregateInput = {
  name: string;
  type: "fixed" | "percentage" | "amount";
  value: number;
  startsAt: Date;
  endsAt: Date;
  branchIds: number[];
};

export type ProductAggregateFields = {
  sku?: string;
  name?: string;
  slug?: string;
  shortDescription?: string;
  description?: string;
  price?: number;
  salePrice?: number | null;
  imageUrl?: string | null;
  gallery?: string[];
  featured?: boolean;
  seasonal?: boolean;
  status?: "draft" | "active" | "inactive";
  minimumLeadTimeHours?: number;
  ingredients?: string | null;
  allergens?: string | null;
  conservation?: string | null;
  weight?: string | null;
  portions?: string | null;
};

export type UpsertProductAggregateInput = {
  productId?: number;
  fields: ProductAggregateFields;
  categoryId?: number;
  categoryIds?: number[];
  primaryCategoryId?: number;
  tags?: string[];
  crossSellProductIds?: number[];
  crossSellMode?: "replace" | "add";
  branchConfigurations?: BranchConfigurationInput[];
  seedAllBranches?: boolean;
  promotions?: PromotionAggregateInput[];
  actorUserId?: string | null;
  inventoryReason?: string;
  categoryMode?: "replace" | "add" | "remove";
  tagMode?: "replace" | "add" | "remove";
};

type DbLike = typeof db;
type Tx = Parameters<Parameters<DbLike["transaction"]>[0]>[0];
type Executor = DbLike | Tx;

export async function resolveOrCreateTags(
  executor: Executor,
  names: string[],
): Promise<Array<{ id: number; name: string; slug: string }>> {
  const cleaned = names
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name, slug: normalizeTagSlug(name) }));
  const bySlug = new Map<string, string>();
  for (const item of cleaned) {
    if (!bySlug.has(item.slug)) bySlug.set(item.slug, item.name);
  }
  if (!bySlug.size) return [];

  const slugs = [...bySlug.keys()];
  const existing = await executor
    .select()
    .from(tagsTable)
    .where(inArray(tagsTable.slug, slugs));
  const existingBySlug = new Map(existing.map((tag) => [tag.slug, tag]));
  const missing = slugs.filter((slug) => !existingBySlug.has(slug));
  if (missing.length) {
    const inserted = await executor
      .insert(tagsTable)
      .values(missing.map((slug) => ({ slug, name: bySlug.get(slug)! })))
      .onConflictDoNothing()
      .returning();
    for (const tag of inserted) existingBySlug.set(tag.slug, tag);
    if (inserted.length < missing.length) {
      const refreshed = await executor
        .select()
        .from(tagsTable)
        .where(inArray(tagsTable.slug, missing));
      for (const tag of refreshed) existingBySlug.set(tag.slug, tag);
    }
  }
  return slugs.map((slug) => {
    const tag = existingBySlug.get(slug)!;
    return { id: tag.id, name: tag.name, slug: tag.slug };
  });
}

async function writeCatalogLog(
  executor: Executor,
  input: {
    actorUserId?: string | null;
    entityType: string;
    entityId: number;
    action: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  },
) {
  await executor.insert(catalogChangeLogTable).values({
    actorUserId: input.actorUserId ?? null,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    before: input.before ?? null,
    after: input.after ?? null,
  });
}

export async function syncProductCategories(
  executor: Executor,
  productId: number,
  categoryIds: number[],
  primaryCategoryId: number,
) {
  if (!categoryIds.length) throw new Error("CATEGORIES_REQUIRED");
  if (!categoryIds.includes(primaryCategoryId)) throw new Error("PRIMARY_NOT_IN_CATEGORIES");
  const existingCats = await executor
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(inArray(categoriesTable.id, categoryIds));
  if (existingCats.length !== categoryIds.length) throw new Error("UNKNOWN_CATEGORY");

  await executor
    .delete(productCategoriesTable)
    .where(eq(productCategoriesTable.productId, productId));
  await executor.insert(productCategoriesTable).values(
    categoryIds.map((categoryId) => ({
      productId,
      categoryId,
      isPrimary: categoryId === primaryCategoryId,
    })),
  );
  await executor
    .update(productsTable)
    .set({ categoryId: primaryCategoryId, updatedAt: new Date() })
    .where(eq(productsTable.id, productId));
}

export async function addProductCategories(
  executor: Executor,
  productId: number,
  categoryIds: number[],
  primaryCategoryId?: number,
) {
  if (!categoryIds.length) return;
  const existing = await executor
    .select()
    .from(productCategoriesTable)
    .where(eq(productCategoriesTable.productId, productId));
  const have = new Set(existing.map((row) => row.categoryId));
  const toAdd = categoryIds.filter((id) => !have.has(id));
  if (toAdd.length) {
    await executor.insert(productCategoriesTable).values(
      toAdd.map((categoryId) => ({
        productId,
        categoryId,
        isPrimary: false,
      })),
    );
  }
  if (primaryCategoryId != null) {
    await executor
      .update(productCategoriesTable)
      .set({ isPrimary: false })
      .where(eq(productCategoriesTable.productId, productId));
    await executor
      .update(productCategoriesTable)
      .set({ isPrimary: true })
      .where(
        and(
          eq(productCategoriesTable.productId, productId),
          eq(productCategoriesTable.categoryId, primaryCategoryId),
        ),
      );
    await executor
      .update(productsTable)
      .set({ categoryId: primaryCategoryId, updatedAt: new Date() })
      .where(eq(productsTable.id, productId));
  }
}

export async function removeProductCategories(
  executor: Executor,
  productId: number,
  categoryIds: number[],
) {
  if (!categoryIds.length) return;
  const [product] = await executor
    .select({ categoryId: productsTable.categoryId })
    .from(productsTable)
    .where(eq(productsTable.id, productId));
  await executor
    .delete(productCategoriesTable)
    .where(
      and(
        eq(productCategoriesTable.productId, productId),
        inArray(productCategoriesTable.categoryId, categoryIds),
      ),
    );
  const remaining = await executor
    .select()
    .from(productCategoriesTable)
    .where(eq(productCategoriesTable.productId, productId));
  if (!remaining.length) throw new Error("CATEGORIES_REQUIRED");
  if (product && categoryIds.includes(product.categoryId)) {
    const nextPrimary = remaining.find((row) => row.isPrimary) ?? remaining[0];
    await syncProductCategories(
      executor,
      productId,
      remaining.map((row) => row.categoryId),
      nextPrimary.categoryId,
    );
  }
}

export async function syncProductTags(
  executor: Executor,
  productId: number,
  tagNames: string[],
) {
  const tags = await resolveOrCreateTags(executor, tagNames);
  await executor.delete(productTagsTable).where(eq(productTagsTable.productId, productId));
  if (tags.length) {
    await executor.insert(productTagsTable).values(
      tags.map((tag) => ({ productId, tagId: tag.id })),
    );
  }
  await executor
    .update(productsTable)
    .set({ tags: tags.map((tag) => tag.name), updatedAt: new Date() })
    .where(eq(productsTable.id, productId));
  return tags;
}

export async function addProductTags(executor: Executor, productId: number, tagNames: string[]) {
  const tags = await resolveOrCreateTags(executor, tagNames);
  if (!tags.length) return;
  await executor
    .insert(productTagsTable)
    .values(tags.map((tag) => ({ productId, tagId: tag.id })))
    .onConflictDoNothing();
  const all = await executor
    .select({ name: tagsTable.name })
    .from(productTagsTable)
    .innerJoin(tagsTable, eq(tagsTable.id, productTagsTable.tagId))
    .where(eq(productTagsTable.productId, productId));
  await executor
    .update(productsTable)
    .set({ tags: all.map((row) => row.name), updatedAt: new Date() })
    .where(eq(productsTable.id, productId));
}

export async function removeProductTags(
  executor: Executor,
  productId: number,
  tagNames: string[],
) {
  const slugs = tagNames.map(normalizeTagSlug).filter(Boolean);
  if (!slugs.length) return;
  const tags = await executor.select().from(tagsTable).where(inArray(tagsTable.slug, slugs));
  if (!tags.length) return;
  await executor
    .delete(productTagsTable)
    .where(
      and(
        eq(productTagsTable.productId, productId),
        inArray(
          productTagsTable.tagId,
          tags.map((tag) => tag.id),
        ),
      ),
    );
  const all = await executor
    .select({ name: tagsTable.name })
    .from(productTagsTable)
    .innerJoin(tagsTable, eq(tagsTable.id, productTagsTable.tagId))
    .where(eq(productTagsTable.productId, productId));
  await executor
    .update(productsTable)
    .set({ tags: all.map((row) => row.name), updatedAt: new Date() })
    .where(eq(productsTable.id, productId));
}

export async function syncProductCrossSells(
  executor: Executor,
  productId: number,
  crossSellProductIds: number[],
  mode: "replace" | "add" = "replace",
) {
  const cleaned = [...new Set(crossSellProductIds.filter((id) => id !== productId))].slice(
    0,
    MAX_CROSS_SELL,
  );

  if (mode === "replace") {
    await executor
      .delete(productCrossSellsTable)
      .where(
        and(
          eq(productCrossSellsTable.productId, productId),
          sql`${productCrossSellsTable.branchId} is null`,
        ),
      );
  }

  if (!cleaned.length) return;

  if (mode === "add") {
    const existing = await executor
      .select({ crossSellProductId: productCrossSellsTable.crossSellProductId })
      .from(productCrossSellsTable)
      .where(eq(productCrossSellsTable.productId, productId));
    const have = new Set(existing.map((row) => row.crossSellProductId));
    const toAdd = cleaned.filter((id) => !have.has(id));
    const room = Math.max(0, MAX_CROSS_SELL - have.size);
    const slice = toAdd.slice(0, room);
    if (!slice.length) return;
    const baseOrder = existing.length;
    await executor.insert(productCrossSellsTable).values(
      slice.map((crossSellProductId, index) => ({
        productId,
        crossSellProductId,
        sortOrder: baseOrder + index,
        active: true,
        branchId: null,
      })),
    );
    return;
  }

  await executor.insert(productCrossSellsTable).values(
    cleaned.map((crossSellProductId, index) => ({
      productId,
      crossSellProductId,
      sortOrder: index,
      active: true,
      branchId: null,
    })),
  );
}

async function upsertBranchConfigurations(
  executor: Executor,
  productId: number,
  configs: BranchConfigurationInput[],
  options: {
    seedAllBranches: boolean;
    isCreate: boolean;
    actorUserId?: string | null;
    inventoryReason?: string;
  },
) {
  const configByBranch = new Map(configs.map((config) => [config.branchId, config]));
  let branchIds: number[];
  if (options.seedAllBranches && options.isCreate) {
    const active = await executor
      .select({ id: branchesTable.id })
      .from(branchesTable)
      .where(eq(branchesTable.active, true));
    branchIds = active.map((branch) => branch.id);
  } else {
    branchIds = [...configByBranch.keys()];
  }

  for (const branchId of branchIds) {
    const config = configByBranch.get(branchId);
    const [existing] = await executor
      .select()
      .from(branchProductsTable)
      .where(
        and(
          eq(branchProductsTable.productId, productId),
          eq(branchProductsTable.branchId, branchId),
        ),
      );

    if (!existing) {
      const inventory = config?.inventory ?? 0;
      const minStock = config?.minStock ?? 0;
      const [created] = await executor
        .insert(branchProductsTable)
        .values({
          branchId,
          productId,
          available: config?.available ?? false,
          inventory,
          minStock,
          criticalStock: config?.criticalStock ?? null,
          autoAlertEnabled: config?.autoAlertEnabled ?? true,
          priceOverride: config?.priceOverride,
          salePriceOverride: config?.salePriceOverride,
          preparationTimeMinutes: config?.preparationTimeMinutes,
          pickupAvailable: config?.pickupAvailable ?? true,
          deliveryAvailable: config?.deliveryAvailable ?? true,
          alertState: stockState(inventory, minStock),
        })
        .returning();
      if (inventory > 0) {
        await executor.insert(inventoryLedgerTable).values({
          branchProductId: created.id,
          movement: "adjustment",
          quantityDelta: inventory,
          balanceAfter: inventory,
          previousBalance: 0,
          newBalance: inventory,
          actorUserId: options.actorUserId ?? null,
          category: "manual",
          reason: options.inventoryReason ?? "Alta de producto",
        });
      }
      await applyInventoryAlert(executor, created, inventory);
      continue;
    }

    const nextInventory =
      config?.inventory !== undefined ? config.inventory : existing.inventory;
    const nextMinStock = config?.minStock !== undefined ? config.minStock : existing.minStock;
    const patch: Record<string, unknown> = {
      updatedAt: new Date(),
      alertState: stockState(nextInventory, nextMinStock),
    };
    if (config?.available !== undefined) patch.available = config.available;
    if (config?.inventory !== undefined) patch.inventory = config.inventory;
    if (config?.minStock !== undefined) patch.minStock = config.minStock;
    if (config?.criticalStock !== undefined) patch.criticalStock = config.criticalStock;
    if (config?.autoAlertEnabled !== undefined) {
      patch.autoAlertEnabled = config.autoAlertEnabled;
    }
    if (config?.priceOverride !== undefined) patch.priceOverride = config.priceOverride;
    if (config?.salePriceOverride !== undefined) {
      patch.salePriceOverride = config.salePriceOverride;
    }
    if (config?.preparationTimeMinutes !== undefined) {
      patch.preparationTimeMinutes = config.preparationTimeMinutes;
    }
    if (config?.pickupAvailable !== undefined) patch.pickupAvailable = config.pickupAvailable;
    if (config?.deliveryAvailable !== undefined) {
      patch.deliveryAvailable = config.deliveryAvailable;
    }

    await executor
      .update(branchProductsTable)
      .set(patch as any)
      .where(eq(branchProductsTable.id, existing.id));

    if (config?.inventory !== undefined && config.inventory !== existing.inventory) {
      const delta = config.inventory - existing.inventory;
      await executor.insert(inventoryLedgerTable).values({
        branchProductId: existing.id,
        movement: "adjustment",
        quantityDelta: delta,
        balanceAfter: config.inventory,
        previousBalance: existing.inventory,
        newBalance: config.inventory,
        actorUserId: options.actorUserId ?? null,
        category: "manual",
        reason: options.inventoryReason ?? "Ajuste desde ficha de producto",
      });
    }

    const thresholdsChanged =
      config?.minStock !== undefined ||
      config?.criticalStock !== undefined ||
      config?.autoAlertEnabled !== undefined ||
      (config?.inventory !== undefined && config.inventory !== existing.inventory);
    if (thresholdsChanged) {
      await applyInventoryAlert(
        executor,
        {
          ...existing,
          minStock: nextMinStock,
          criticalStock:
            config?.criticalStock !== undefined
              ? config.criticalStock
              : (existing as any).criticalStock,
          autoAlertEnabled:
            config?.autoAlertEnabled !== undefined
              ? config.autoAlertEnabled
              : (existing as any).autoAlertEnabled,
        } as any,
        nextInventory,
      );
    }
  }
}

async function createPromotions(
  executor: Executor,
  productId: number,
  promotions: PromotionAggregateInput[],
  actorUserId?: string | null,
) {
  for (const input of promotions) {
    const [promotion] = await executor
      .insert(promotionsTable)
      .values({
        productId,
        name: input.name,
        type: input.type,
        value: input.value,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        createdBy: actorUserId ?? null,
      })
      .returning();
    if (input.branchIds.length) {
      await executor.insert(promotionBranchesTable).values(
        input.branchIds.map((branchId) => ({
          promotionId: promotion.id,
          branchId,
        })),
      );
    }
  }
}

export async function upsertProductAggregate(
  input: UpsertProductAggregateInput,
): Promise<Product> {
  return db.transaction(async (tx) => {
    const isCreate = input.productId == null;
    let product: Product;

    if (isCreate) {
      const { categoryIds, primaryCategoryId } = resolvePrimaryCategoryId({
        categoryId: input.categoryId,
        categoryIds: input.categoryIds,
        primaryCategoryId: input.primaryCategoryId,
      });
      if (!input.fields.sku || !input.fields.name || !input.fields.slug) {
        throw new Error("PRODUCT_FIELDS_REQUIRED");
      }
      const [created] = await tx
        .insert(productsTable)
        .values({
          sku: input.fields.sku,
          name: input.fields.name,
          slug: input.fields.slug,
          shortDescription: input.fields.shortDescription ?? "",
          description: input.fields.description ?? "",
          price: input.fields.price ?? 0,
          salePrice: input.fields.salePrice ?? null,
          categoryId: primaryCategoryId,
          imageUrl: input.fields.imageUrl ?? null,
          gallery: input.fields.gallery ?? [],
          tags: [],
          featured: input.fields.featured ?? false,
          seasonal: input.fields.seasonal ?? false,
          status: input.fields.status ?? "draft",
          minimumLeadTimeHours: input.fields.minimumLeadTimeHours ?? 0,
          ingredients: input.fields.ingredients ?? null,
          allergens: input.fields.allergens ?? null,
          conservation: input.fields.conservation ?? null,
          weight: input.fields.weight ?? null,
          portions: input.fields.portions ?? null,
        })
        .returning();
      product = created;
      await syncProductCategories(tx, product.id, categoryIds, primaryCategoryId);
      if (input.tags) await syncProductTags(tx, product.id, input.tags);
      if (input.crossSellProductIds) {
        await syncProductCrossSells(tx, product.id, input.crossSellProductIds, "replace");
      }
      await upsertBranchConfigurations(tx, product.id, input.branchConfigurations ?? [], {
        seedAllBranches: input.seedAllBranches !== false,
        isCreate: true,
        actorUserId: input.actorUserId,
        inventoryReason: input.inventoryReason,
      });
      if (input.promotions?.length) {
        await createPromotions(tx, product.id, input.promotions, input.actorUserId);
      }
      await writeCatalogLog(tx, {
        actorUserId: input.actorUserId,
        entityType: "product",
        entityId: product.id,
        action: "product_created",
        after: { sku: product.sku, name: product.name, categoryIds, tags: input.tags ?? [] },
      });
      return product;
    }

    const [existing] = await tx
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, input.productId!));
    if (!existing) throw new Error("PRODUCT_NOT_FOUND");

    const fieldPatch: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of [
      "name",
      "slug",
      "shortDescription",
      "description",
      "price",
      "salePrice",
      "imageUrl",
      "gallery",
      "featured",
      "seasonal",
      "status",
      "minimumLeadTimeHours",
      "ingredients",
      "allergens",
      "conservation",
      "weight",
      "portions",
    ] as const) {
      if (input.fields[key] !== undefined) fieldPatch[key] = input.fields[key];
    }

    const hasCategoryUpdate =
      input.categoryIds !== undefined ||
      input.categoryId !== undefined ||
      input.primaryCategoryId !== undefined;
    if (hasCategoryUpdate) {
      const mode = input.categoryMode ?? "replace";
      if (mode === "replace") {
        const resolved = resolvePrimaryCategoryId({
          categoryId: input.categoryId ?? existing.categoryId,
          categoryIds: input.categoryIds,
          primaryCategoryId: input.primaryCategoryId,
        });
        await syncProductCategories(
          tx,
          existing.id,
          resolved.categoryIds,
          resolved.primaryCategoryId,
        );
        fieldPatch.categoryId = resolved.primaryCategoryId;
      } else if (mode === "add" && input.categoryIds?.length) {
        await addProductCategories(
          tx,
          existing.id,
          input.categoryIds,
          input.primaryCategoryId ?? input.categoryId,
        );
      } else if (mode === "remove" && input.categoryIds?.length) {
        await removeProductCategories(tx, existing.id, input.categoryIds);
      }
    }

    if (Object.keys(fieldPatch).length > 1) {
      const [updated] = await tx
        .update(productsTable)
        .set(fieldPatch as any)
        .where(eq(productsTable.id, existing.id))
        .returning();
      product = updated;
    } else {
      product = existing;
    }

    if (input.tags !== undefined) {
      const mode = input.tagMode ?? "replace";
      if (mode === "replace") await syncProductTags(tx, product.id, input.tags);
      else if (mode === "add") await addProductTags(tx, product.id, input.tags);
      else if (mode === "remove") await removeProductTags(tx, product.id, input.tags);
    }

    if (input.crossSellProductIds !== undefined) {
      await syncProductCrossSells(
        tx,
        product.id,
        input.crossSellProductIds,
        input.crossSellMode ?? "replace",
      );
    }

    if (input.branchConfigurations?.length) {
      await upsertBranchConfigurations(tx, product.id, input.branchConfigurations, {
        seedAllBranches: false,
        isCreate: false,
        actorUserId: input.actorUserId,
        inventoryReason: input.inventoryReason,
      });
    }

    if (input.promotions?.length) {
      await createPromotions(tx, product.id, input.promotions, input.actorUserId);
    }

    await writeCatalogLog(tx, {
      actorUserId: input.actorUserId,
      entityType: "product",
      entityId: product.id,
      action: "product_updated",
      before: { name: existing.name, price: existing.price, categoryId: existing.categoryId },
      after: {
        name: product.name,
        price: product.price,
        categoryId: product.categoryId,
        tags: input.tags,
        crossSellProductIds: input.crossSellProductIds,
      },
    });

    return product;
  });
}

export async function loadProductCategorySummaries(productIds: number[]) {
  if (!productIds.length) {
    return new Map<
      number,
      Array<{ id: number; name: string; slug: string; isPrimary: boolean }>
    >();
  }
  const rows = await db
    .select({
      productId: productCategoriesTable.productId,
      id: categoriesTable.id,
      name: categoriesTable.name,
      slug: categoriesTable.slug,
      isPrimary: productCategoriesTable.isPrimary,
    })
    .from(productCategoriesTable)
    .innerJoin(categoriesTable, eq(categoriesTable.id, productCategoriesTable.categoryId))
    .where(inArray(productCategoriesTable.productId, productIds));
  const map = new Map<
    number,
    Array<{ id: number; name: string; slug: string; isPrimary: boolean }>
  >();
  for (const row of rows) {
    const list = map.get(row.productId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      slug: row.slug,
      isPrimary: row.isPrimary,
    });
    map.set(row.productId, list);
  }
  return map;
}

export async function loadProductCrossSellIds(productId: number): Promise<number[]> {
  const rows = await db
    .select({
      crossSellProductId: productCrossSellsTable.crossSellProductId,
    })
    .from(productCrossSellsTable)
    .where(
      and(
        eq(productCrossSellsTable.productId, productId),
        eq(productCrossSellsTable.active, true),
        sql`${productCrossSellsTable.branchId} is null`,
      ),
    )
    .orderBy(productCrossSellsTable.sortOrder);
  return rows.map((row) => row.crossSellProductId);
}
