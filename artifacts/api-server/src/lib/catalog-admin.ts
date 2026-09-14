import crypto from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  branchProductsTable,
  branchesTable,
  categoriesTable,
  db,
  importJobsTable,
  productCategoriesTable,
  productCrossSellsTable,
  productTagsTable,
  productsTable,
  promotionsTable,
  promotionBranchesTable,
  tagsTable,
} from "@workspace/db";
import {
  addProductCategories,
  addProductTags,
  loadProductCategorySummaries,
  loadProductCrossSellIds,
  removeProductCategories,
  removeProductTags,
  syncProductCategories,
  syncProductCrossSells,
  syncProductTags,
  upsertProductAggregate,
} from "./product-aggregate";

export function csvEscape(value: unknown): string {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function translateImportMessage(message: string): string {
  const map: Record<string, string> = {
    "CSV is empty": "El archivo CSV está vacío.",
    "Header must be sku,branch_code,quantity": "La cabecera debe ser sku,branch_code,quantity (min_stock opcional).",
    "Expected non-empty sku, branch_code and quantity": "Se esperaban sku, branch_code y quantity no vacíos.",
    "Quantity must be a non-negative integer": "El inventario no puede ser negativo y debe ser un entero.",
    "Duplicate SKU + branch_code row": "Fila duplicada para el mismo SKU y sucursal.",
    "Unknown SKU": "SKU desconocido.",
    "SKU is not configured for branch": "El SKU no está configurado en esa sucursal.",
    "Invalid branch_code or access": "Código de sucursal inválido o sin acceso.",
    "New SKU requires name, price and categoryId": "Un SKU nuevo requiere nombre, precio e ID de categoría (o categories).",
    "Unknown categoryId": "ID de categoría desconocido.",
    "Unknown category name": "Nombre de categoría desconocido.",
    "Unknown branchCode": "Código de sucursal desconocido.",
    "Branch access denied": "Sin acceso a esa sucursal.",
    "Existing SKU skipped (updateExisting=false)": "SKU existente omitido (actualizar existentes desactivado).",
    "primary_category must be included in categories": "primary_category debe estar incluida en categories.",
    "Unknown cross-sell SKU": "SKU de cross-sell desconocido.",
  };
  if (map[message]) return map[message];
  if (message.includes("must be an integer")) {
    return message.replace("must be an integer", "debe ser un entero");
  }
  if (message.includes("inventory must be")) {
    return "El inventario no puede ser negativo.";
  }
  return message;
}

export async function createImportJob(input: {
  userId?: string | null;
  type: "product" | "inventory";
  filename?: string | null;
  idempotencyKey?: string | null;
}) {
  if (input.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(importJobsTable)
      .where(eq(importJobsTable.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing) return { job: existing, reused: true as const };
  }
  const id = crypto.randomUUID();
  const [job] = await db
    .insert(importJobsTable)
    .values({
      id,
      userId: input.userId ?? null,
      type: input.type,
      filename: input.filename ?? null,
      status: "running",
      idempotencyKey: input.idempotencyKey ?? null,
    })
    .returning();
  return { job, reused: false as const };
}

export async function completeImportJob(
  jobId: string,
  data: {
    status: "completed" | "failed";
    createdCount?: number;
    updatedCount?: number;
    errorCount?: number;
    errorLog?: Array<Record<string, unknown>>;
  },
) {
  await db
    .update(importJobsTable)
    .set({
      status: data.status,
      createdCount: data.createdCount ?? 0,
      updatedCount: data.updatedCount ?? 0,
      errorCount: data.errorCount ?? 0,
      errorLog: data.errorLog ?? [],
      completedAt: new Date(),
    })
    .where(eq(importJobsTable.id, jobId));
}

export async function buildProductExportCsv(options: {
  search?: string;
  status?: string;
  ids?: number[];
  reimportable?: boolean;
  columns?: string[];
}): Promise<string> {
  const filters = [];
  if (options.status) filters.push(eq(productsTable.status, options.status as any));
  if (options.ids?.length) filters.push(inArray(productsTable.id, options.ids));
  if (options.search) {
    const q = `%${options.search.toLowerCase()}%`;
    filters.push(
      sql`(lower(${productsTable.name}) like ${q} or lower(${productsTable.sku}) like ${q})`,
    );
  }

  const products = await db
    .select()
    .from(productsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(productsTable.id);

  const productIds = products.map((p) => p.id);
  const categoryMap = await loadProductCategorySummaries(productIds);
  const allCats = await db.select().from(categoriesTable);
  const catById = new Map(allCats.map((c) => [c.id, c]));

  const tagRows = productIds.length
    ? await db
        .select({
          productId: productTagsTable.productId,
          name: tagsTable.name,
        })
        .from(productTagsTable)
        .innerJoin(tagsTable, eq(tagsTable.id, productTagsTable.tagId))
        .where(inArray(productTagsTable.productId, productIds))
    : [];
  const tagsByProduct = new Map<number, string[]>();
  for (const row of tagRows) {
    const list = tagsByProduct.get(row.productId) ?? [];
    list.push(row.name);
    tagsByProduct.set(row.productId, list);
  }

  const crossLinks = productIds.length
    ? await db
        .select({
          productId: productCrossSellsTable.productId,
          crossSellProductId: productCrossSellsTable.crossSellProductId,
          sortOrder: productCrossSellsTable.sortOrder,
        })
        .from(productCrossSellsTable)
        .where(inArray(productCrossSellsTable.productId, productIds))
        .orderBy(productCrossSellsTable.sortOrder)
    : [];
  const skuById = new Map(products.map((p) => [p.id, p.sku]));
  if (crossLinks.length) {
    const missingIds = [
      ...new Set(
        crossLinks
          .map((row) => row.crossSellProductId)
          .filter((id) => !skuById.has(id)),
      ),
    ];
    if (missingIds.length) {
      const extras = await db
        .select({ id: productsTable.id, sku: productsTable.sku })
        .from(productsTable)
        .where(inArray(productsTable.id, missingIds));
      for (const row of extras) skuById.set(row.id, row.sku);
    }
  }
  const crossByProduct = new Map<number, string[]>();
  for (const row of crossLinks) {
    const sku = skuById.get(row.crossSellProductId);
    if (!sku) continue;
    const list = crossByProduct.get(row.productId) ?? [];
    list.push(sku);
    crossByProduct.set(row.productId, list);
  }

  const promoRows = productIds.length
    ? await db
        .select({
          promotion: promotionsTable,
          branchCode: branchesTable.branchCode,
        })
        .from(promotionsTable)
        .leftJoin(
          promotionBranchesTable,
          eq(promotionBranchesTable.promotionId, promotionsTable.id),
        )
        .leftJoin(branchesTable, eq(branchesTable.id, promotionBranchesTable.branchId))
        .where(
          and(
            inArray(promotionsTable.productId, productIds),
            sql`${promotionsTable.cancelledAt} is null`,
            sql`${promotionsTable.endsAt} > now()`,
          ),
        )
    : [];
  const promoByProduct = new Map<
    number,
    { type: string; value: number; startsAt: Date; endsAt: Date; branches: string[] }
  >();
  for (const row of promoRows) {
    const current = promoByProduct.get(row.promotion.productId);
    if (!current) {
      promoByProduct.set(row.promotion.productId, {
        type: row.promotion.type,
        value: row.promotion.value,
        startsAt: row.promotion.startsAt,
        endsAt: row.promotion.endsAt,
        branches: row.branchCode ? [row.branchCode] : [],
      });
    } else if (row.branchCode && !current.branches.includes(row.branchCode)) {
      current.branches.push(row.branchCode);
    }
  }

  const branchRows = productIds.length
    ? await db
        .select({
          productId: branchProductsTable.productId,
          branchId: branchProductsTable.branchId,
          branchCode: branchesTable.branchCode,
          inventory: branchProductsTable.inventory,
          minStock: branchProductsTable.minStock,
          available: branchProductsTable.available,
        })
        .from(branchProductsTable)
        .innerJoin(branchesTable, eq(branchesTable.id, branchProductsTable.branchId))
        .where(inArray(branchProductsTable.productId, productIds))
    : [];

  const exportType = (type: string) => {
    if (type === "amount") return "fixed_amount";
    if (type === "fixed") return "fixed_price";
    return "percentage";
  };

  const reimportable = options.reimportable !== false;
  if (reimportable) {
    const headers = [
      "sku",
      "name",
      "slug",
      "shortDescription",
      "description",
      "price",
      "salePrice",
      "categoryId",
      "categories",
      "primary_category",
      "tags",
      "imageUrl",
      "featured",
      "seasonal",
      "status",
      "minimumLeadTimeHours",
      "branchCode",
      "available",
      "inventory",
      "minStock",
      "discount_type",
      "discount_value",
      "discount_start",
      "discount_end",
      "discount_branches",
      "cross_sell_skus",
    ];
    const lines = [headers.join(",")];
    for (const product of products) {
      const cats = categoryMap.get(product.id) ?? [];
      const primary =
        cats.find((c) => c.isPrimary)?.name ??
        catById.get(product.categoryId)?.name ??
        "";
      const categoryNames =
        cats.map((c) => c.name).join("|") ||
        (catById.get(product.categoryId)?.name ?? "");
      const tagNames = (tagsByProduct.get(product.id) ?? product.tags ?? []).join("|");
      const promo = promoByProduct.get(product.id);
      const cross = (crossByProduct.get(product.id) ?? []).join("|");
      const branches = branchRows.filter((b) => b.productId === product.id);
      const targets = branches.length
        ? branches
        : [{ branchCode: "", available: false, inventory: 0, minStock: 0 } as any];
      for (const branch of targets) {
        lines.push(
          [
            product.sku,
            product.name,
            product.slug,
            product.shortDescription,
            product.description,
            product.price,
            product.salePrice ?? "",
            product.categoryId,
            categoryNames,
            primary,
            tagNames,
            product.imageUrl ?? "",
            product.featured,
            product.seasonal,
            product.status,
            product.minimumLeadTimeHours,
            branch.branchCode ?? "",
            branch.available ?? "",
            branch.inventory ?? "",
            branch.minStock ?? "",
            promo ? exportType(promo.type) : "",
            promo?.value ?? "",
            promo?.startsAt?.toISOString?.() ?? promo?.startsAt ?? "",
            promo?.endsAt?.toISOString?.() ?? promo?.endsAt ?? "",
            promo?.branches?.join("|") ?? "",
            cross,
          ]
            .map(csvEscape)
            .join(","),
        );
      }
    }
    return lines.join("\n");
  }

  const headers = options.columns?.length
    ? options.columns
    : ["id", "sku", "name", "categoryId", "price", "status"];
  const lines = [headers.join(",")];
  for (const product of products) {
    lines.push(
      headers
        .map((col) => csvEscape((product as Record<string, unknown>)[col]))
        .join(","),
    );
  }
  return lines.join("\n");
}

export async function duplicateProductById(productId: number) {
  const [source] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!source) return null;
  const suffix = Date.now().toString(36);
  const sku = `${source.sku}-COPY-${suffix}`.slice(0, 64);
  const slug = `${source.slug}-copy-${suffix}`.slice(0, 120);

  const catRows = await db
    .select()
    .from(productCategoriesTable)
    .where(eq(productCategoriesTable.productId, productId));
  const categoryIds = catRows.length
    ? catRows.map((row) => row.categoryId)
    : [source.categoryId];
  const primaryCategoryId =
    catRows.find((row) => row.isPrimary)?.categoryId ?? source.categoryId;

  const tagRows = await db
    .select({ name: tagsTable.name })
    .from(productTagsTable)
    .innerJoin(tagsTable, eq(tagsTable.id, productTagsTable.tagId))
    .where(eq(productTagsTable.productId, productId));
  const tags = tagRows.length ? tagRows.map((row) => row.name) : source.tags;

  const crossSellProductIds = await loadProductCrossSellIds(productId);

  const configs = await db
    .select()
    .from(branchProductsTable)
    .where(eq(branchProductsTable.productId, productId));

  return upsertProductAggregate({
    fields: {
      sku,
      slug,
      name: `${source.name} (copia)`,
      shortDescription: source.shortDescription,
      description: source.description,
      price: source.price,
      salePrice: source.salePrice,
      imageUrl: source.imageUrl,
      gallery: source.gallery,
      featured: source.featured,
      seasonal: source.seasonal,
      status: "draft",
      minimumLeadTimeHours: source.minimumLeadTimeHours,
      ingredients: source.ingredients,
      allergens: source.allergens,
      conservation: source.conservation,
      weight: source.weight,
      portions: source.portions,
    },
    categoryIds,
    primaryCategoryId,
    tags,
    crossSellProductIds,
    branchConfigurations: configs.map((config) => ({
      branchId: config.branchId,
      available: config.available,
      inventory: config.inventory,
      minStock: config.minStock,
      priceOverride: config.priceOverride,
      salePriceOverride: config.salePriceOverride,
      preparationTimeMinutes: config.preparationTimeMinutes,
      pickupAvailable: config.pickupAvailable,
      deliveryAvailable: config.deliveryAvailable,
    })),
    seedAllBranches: false,
    inventoryReason: "Duplicado de producto",
  });
}

export async function bulkUpdateProducts(input: {
  ids: number[];
  action: string;
  status?: string;
  categoryId?: number;
  categoryIds?: number[];
  tagNames?: string[];
  branchId?: number;
  minStock?: number;
  price?: number;
  featured?: boolean;
  crossSellProductIds?: number[];
  promotion?: {
    name: string;
    type: "fixed" | "percentage" | "amount";
    value: number;
    startsAt: string | Date;
    endsAt: string | Date;
    branchIds: number[];
  };
  actorUserId?: string | null;
}) {
  const errors: Array<{ id: number; message: string }> = [];
  let updated = 0;

  for (const id of input.ids) {
    try {
      await db.transaction(async (tx) => {
        const [product] = await tx.select().from(productsTable).where(eq(productsTable.id, id));
        if (!product) throw new Error("Producto no encontrado");

        switch (input.action) {
          case "set_status":
            if (!input.status) throw new Error("status requerido");
            await tx
              .update(productsTable)
              .set({ status: input.status as any, updatedAt: new Date() })
              .where(eq(productsTable.id, id));
            break;
          case "archive":
            await tx
              .update(productsTable)
              .set({ status: "inactive", updatedAt: new Date() })
              .where(eq(productsTable.id, id));
            break;
          case "set_category":
          case "replace_categories": {
            const categoryIds = input.categoryIds?.length
              ? input.categoryIds
              : input.categoryId != null
                ? [input.categoryId]
                : [];
            if (!categoryIds.length) throw new Error("categoryId requerido");
            const primary = input.categoryId ?? categoryIds[0];
            await syncProductCategories(tx, id, categoryIds, primary);
            break;
          }
          case "add_categories": {
            const ids =
              input.categoryIds ?? (input.categoryId != null ? [input.categoryId] : []);
            if (!ids.length) throw new Error("categoryIds requerido");
            await addProductCategories(tx, id, ids);
            break;
          }
          case "remove_categories": {
            const ids =
              input.categoryIds ?? (input.categoryId != null ? [input.categoryId] : []);
            if (!ids.length) throw new Error("categoryIds requerido");
            await removeProductCategories(tx, id, ids);
            break;
          }
          case "add_tags":
            if (!input.tagNames?.length) throw new Error("tagNames requerido");
            await addProductTags(tx, id, input.tagNames);
            break;
          case "remove_tags":
            if (!input.tagNames?.length) throw new Error("tagNames requerido");
            await removeProductTags(tx, id, input.tagNames);
            break;
          case "replace_tags":
            if (!input.tagNames) throw new Error("tagNames requerido");
            await syncProductTags(tx, id, input.tagNames);
            break;
          case "add_cross_sell":
            if (!input.crossSellProductIds?.length) {
              throw new Error("crossSellProductIds requerido");
            }
            await syncProductCrossSells(tx, id, input.crossSellProductIds, "add");
            break;
          case "replace_cross_sell":
            if (!input.crossSellProductIds) {
              throw new Error("crossSellProductIds requerido");
            }
            await syncProductCrossSells(tx, id, input.crossSellProductIds, "replace");
            break;
          case "set_price":
            if (input.price == null) throw new Error("price requerido");
            await tx
              .update(productsTable)
              .set({ price: input.price, updatedAt: new Date() })
              .where(eq(productsTable.id, id));
            break;
          case "set_featured":
            await tx
              .update(productsTable)
              .set({ featured: !!input.featured, updatedAt: new Date() })
              .where(eq(productsTable.id, id));
            break;
          case "assign_branch": {
            if (input.branchId == null) throw new Error("branchId requerido");
            const [existing] = await tx
              .select()
              .from(branchProductsTable)
              .where(
                and(
                  eq(branchProductsTable.productId, id),
                  eq(branchProductsTable.branchId, input.branchId),
                ),
              );
            if (existing) {
              await tx
                .update(branchProductsTable)
                .set({
                  available: true,
                  ...(input.minStock != null ? { minStock: input.minStock } : {}),
                })
                .where(eq(branchProductsTable.id, existing.id));
            } else {
              await tx.insert(branchProductsTable).values({
                productId: id,
                branchId: input.branchId,
                available: true,
                inventory: 0,
                minStock: input.minStock ?? 0,
              });
            }
            break;
          }
          case "unassign_branch": {
            if (input.branchId == null) throw new Error("branchId requerido");
            await tx
              .update(branchProductsTable)
              .set({ available: false })
              .where(
                and(
                  eq(branchProductsTable.productId, id),
                  eq(branchProductsTable.branchId, input.branchId),
                ),
              );
            break;
          }
          case "set_min_stock": {
            if (input.branchId == null || input.minStock == null) {
              throw new Error("branchId y minStock requeridos");
            }
            await tx
              .update(branchProductsTable)
              .set({ minStock: input.minStock })
              .where(
                and(
                  eq(branchProductsTable.productId, id),
                  eq(branchProductsTable.branchId, input.branchId),
                ),
              );
            break;
          }
          case "create_promotion": {
            if (!input.promotion) throw new Error("promotion requerida");
            const [promo] = await tx
              .insert(promotionsTable)
              .values({
                productId: id,
                name: input.promotion.name,
                type: input.promotion.type,
                value: input.promotion.value,
                startsAt: new Date(input.promotion.startsAt),
                endsAt: new Date(input.promotion.endsAt),
                createdBy: input.actorUserId ?? null,
              })
              .returning();
            if (input.promotion.branchIds?.length) {
              await tx.insert(promotionBranchesTable).values(
                input.promotion.branchIds.map((branchId) => ({
                  promotionId: promo.id,
                  branchId,
                })),
              );
            }
            break;
          }
          case "cancel_promotions": {
            await tx
              .update(promotionsTable)
              .set({ cancelledAt: new Date(), cancelledBy: input.actorUserId ?? null })
              .where(
                and(
                  eq(promotionsTable.productId, id),
                  sql`${promotionsTable.cancelledAt} is null`,
                ),
              );
            break;
          }
          default:
            throw new Error("Acción no soportada");
        }
      });
      updated += 1;
    } catch (error) {
      errors.push({
        id,
        message: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  }

  return { updated, errors };
}
