import {
  and,
  asc,
  eq,
  gt,
  ilike,
  inArray,
  lte,
  or,
  isNull,
  type SQL,
} from "drizzle-orm";
import {
  branchProductsTable,
  branchesTable,
  categoriesTable,
  db,
  productCategoriesTable,
  productsTable,
  productVariantsTable,
  promotionBranchesTable,
  promotionsTable,
  type Branch,
} from "@workspace/db";
import {
  calculatePromotionPrice,
  promotionStatus,
  resolveCatalogPrice,
  selectPromotionForBranch,
  type PromotionCandidate,
} from "./catalog-promotions.ts";
import { loadProductCategorySummaries, loadProductCrossSellIds } from "./product-aggregate";

export function serializeBranch(branch: Branch) {
  const status = (branch as Branch & { status?: string }).status;
  const active = branch.active ?? status === "active";
  return {
    id: branch.id,
    name: branch.name,
    slug: branch.slug,
    shortName: branch.shortName,
    shortDescription: (branch as Branch & { shortDescription?: string | null }).shortDescription ?? null,
    description: branch.description,
    address: branch.address,
    street: (branch as Branch & { street?: string | null }).street ?? null,
    externalNumber: (branch as Branch & { externalNumber?: string | null }).externalNumber ?? null,
    internalNumber: (branch as Branch & { internalNumber?: string | null }).internalNumber ?? null,
    neighborhood: branch.neighborhood,
    borough: branch.borough,
    city: branch.city,
    state: branch.state,
    postalCode: branch.postalCode,
    country: branch.country,
    latitude: branch.latitude,
    longitude: branch.longitude,
    placeId: (branch as Branch & { placeId?: string | null }).placeId ?? null,
    phone: branch.phone,
    secondaryPhone: (branch as Branch & { secondaryPhone?: string | null }).secondaryPhone ?? null,
    whatsapp: branch.whatsapp,
    whatsappDefaultMessage:
      (branch as Branch & { whatsappDefaultMessage?: string | null }).whatsappDefaultMessage ?? null,
    email: branch.email,
    ordersEmail: (branch as Branch & { ordersEmail?: string | null }).ordersEmail ?? null,
    reservationsEmail: (branch as Branch & { reservationsEmail?: string | null }).reservationsEmail ?? null,
    mapsUrl: branch.mapsUrl,
    openTableUrl: branch.openTableUrl,
    instagramUrl: branch.instagramUrl,
    reservationProvider:
      (branch as Branch & { reservationProvider?: string }).reservationProvider ?? "none",
    reservationUrl: (branch as Branch & { reservationUrl?: string | null }).reservationUrl ?? null,
    reservationCta: (branch as Branch & { reservationCta?: string | null }).reservationCta ?? "Reservar mesa",
    imageUrl: branch.imageUrl,
    gallery: branch.gallery,
    hours: branch.hours,
    pickupAvailable: branch.pickupAvailable,
    deliveryAvailable: branch.deliveryAvailable,
    deliveryRadiusKm: branch.deliveryRadiusKm,
    minimumOrder: branch.minimumOrder,
    freeDeliveryFrom: (branch as Branch & { freeDeliveryFrom?: number | null }).freeDeliveryFrom ?? null,
    preparationTimeMinutes: branch.preparationTimeMinutes,
    deliveryTimeMinutes: branch.deliveryTimeMinutes,
    featured: (branch as Branch & { featured?: boolean }).featured ?? false,
    seoTitle: (branch as Branch & { seoTitle?: string | null }).seoTitle ?? null,
    metaDescription: (branch as Branch & { metaDescription?: string | null }).metaDescription ?? null,
    ogImageUrl: (branch as Branch & { ogImageUrl?: string | null }).ogImageUrl ?? null,
    status: status ?? (active ? "active" : "inactive"),
    active,
  };
}

type ProductFilters = {
  search?: string;
  categorySlug?: string;
  branchSlug?: string;
  featured?: boolean;
  scheduledStart?: Date;
  includeUnavailable?: boolean;
  branchIds?: number[];
  status?: "draft" | "active" | "inactive";
  publicOnly?: boolean;
};

export {
  calculatePromotionPrice,
  promotionStatus,
  resolveCatalogPrice,
  selectPromotionForBranch,
  type PromotionStatus,
} from "./catalog-promotions.ts";

async function activePromotionCandidates(
  productIds: number[],
  now = new Date(),
): Promise<Map<number, PromotionCandidate[]>> {
  if (!productIds.length) return new Map();
  const rows = await db
    .select({
      promotion: promotionsTable,
      branchId: promotionBranchesTable.branchId,
    })
    .from(promotionsTable)
    .leftJoin(
      promotionBranchesTable,
      eq(promotionBranchesTable.promotionId, promotionsTable.id),
    )
    .where(
      and(
        inArray(promotionsTable.productId, productIds),
        isNull(promotionsTable.cancelledAt),
        lte(promotionsTable.startsAt, now),
        gt(promotionsTable.endsAt, now),
      ),
    )
    .orderBy(promotionsTable.createdAt, promotionsTable.id);

  const grouped = new Map<number, PromotionCandidate>();
  for (const row of rows) {
    const current = grouped.get(row.promotion.id);
    if (current) {
      if (row.branchId != null) current.branchIds.push(row.branchId);
    } else {
      grouped.set(row.promotion.id, {
        promotion: row.promotion,
        branchIds: row.branchId == null ? [] : [row.branchId],
      });
    }
  }
  const byProduct = new Map<number, PromotionCandidate[]>();
  for (const candidate of grouped.values()) {
    const candidates = byProduct.get(candidate.promotion.productId) ?? [];
    candidates.push(candidate);
    byProduct.set(candidate.promotion.productId, candidates);
  }
  return byProduct;
}

export function serializePromotion(
  candidate: PromotionCandidate,
  basePrice: number,
  now = new Date(),
) {
  const { finalPrice, savings } = calculatePromotionPrice(
    basePrice,
    candidate.promotion,
  );
  return {
    id: candidate.promotion.id,
    name: candidate.promotion.name,
    type: candidate.promotion.type,
    value: candidate.promotion.value,
    startsAt: candidate.promotion.startsAt,
    endsAt: candidate.promotion.endsAt,
    status: promotionStatus(candidate.promotion, now),
    finalPrice,
    savings,
    branchIds: candidate.branchIds,
  };
}

export async function getActivePromotion(
  productId: number,
  branchId: number,
  now = new Date(),
) {
  const candidates = await activePromotionCandidates([productId], now);
  return selectPromotionForBranch(candidates.get(productId), branchId);
}

export async function listProductCards(filters: ProductFilters = {}) {
  if (filters.branchIds?.length === 0) return [];
  const conditions: SQL[] = [];

  if (filters.publicOnly) {
    conditions.push(eq(productsTable.status, "active"));
  } else if (filters.status) {
    conditions.push(eq(productsTable.status, filters.status));
  }

  if (filters.categorySlug) {
    const matching = await db
      .select({ productId: productCategoriesTable.productId })
      .from(productCategoriesTable)
      .innerJoin(categoriesTable, eq(categoriesTable.id, productCategoriesTable.categoryId))
      .where(eq(categoriesTable.slug, filters.categorySlug));
    const legacy = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(eq(categoriesTable.slug, filters.categorySlug));
    const ids = [
      ...new Set([
        ...matching.map((row) => row.productId),
        ...legacy.map((row) => row.id),
      ]),
    ];
    if (!ids.length) return [];
    conditions.push(inArray(productsTable.id, ids));
  }

  if (filters.search) {
    const term = `%${filters.search}%`;
    const searchCondition = or(
      ilike(productsTable.name, term),
      ilike(productsTable.sku, term),
      ilike(productsTable.shortDescription, term),
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  if (filters.featured !== undefined) {
    conditions.push(eq(productsTable.featured, filters.featured));
  }

  const productRows = await db
    .select({
      product: productsTable,
      categoryName: categoriesTable.name,
      categorySlug: categoriesTable.slug,
    })
    .from(productsTable)
    .innerJoin(
      categoriesTable,
      eq(productsTable.categoryId, categoriesTable.id),
    )
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(productsTable.name));

  if (!productRows.length) return [];

  const productIds = productRows.map(({ product }) => product.id);
  const categoriesByProduct = await loadProductCategorySummaries(productIds);
  const promotionsByProduct = await activePromotionCandidates(productIds);
  const availabilityRows = await db
    .select({
      branchProduct: branchProductsTable,
      branchId: branchesTable.id,
      branchSlug: branchesTable.slug,
      branchName: branchesTable.name,
      branchPrep: branchesTable.preparationTimeMinutes,
    })
    .from(branchProductsTable)
    .innerJoin(
      branchesTable,
      eq(branchProductsTable.branchId, branchesTable.id),
    )
    .where(
      and(
        inArray(branchProductsTable.productId, productIds),
        eq(branchesTable.active, true),
        filters.branchIds ? inArray(branchesTable.id, filters.branchIds) : undefined,
      ),
    );

  return productRows
    .map(({ product, categoryName, categorySlug }) => {
      const availability = availabilityRows
        .filter(({ branchProduct }) => branchProduct.productId === product.id)
        .map(({ branchProduct, branchId, branchSlug, branchName, branchPrep }) => {
          const preparationTimeMinutes =
            branchProduct.preparationTimeMinutes ??
            branchPrep ??
            product.minimumLeadTimeHours * 60;
          const scheduleReady =
            !filters.scheduledStart ||
            filters.scheduledStart.getTime() >=
              Date.now() +
                Math.max(product.minimumLeadTimeHours * 60, preparationTimeMinutes) *
                60_000;
          const basePrice = branchProduct.priceOverride ?? product.price;
          const legacySalePrice =
            branchProduct.salePriceOverride !== null
              ? branchProduct.salePriceOverride
              : product.salePrice;
          const promotion = selectPromotionForBranch(
            promotionsByProduct.get(product.id),
            branchId,
          );
          const promotionView = promotion
            ? serializePromotion(promotion, basePrice)
            : null;
          return {
          branchId,
          branchSlug,
          branchName,
          available: branchProduct.available && scheduleReady,
          inventory: branchProduct.inventory,
          minStock: branchProduct.minStock,
          criticalStock: branchProduct.criticalStock ?? null,
          autoAlertEnabled: branchProduct.autoAlertEnabled !== false,
          alertState: branchProduct.alertState,
           price: basePrice,
           salePrice: promotionView?.finalPrice ?? legacySalePrice,
           promotion: promotionView,
          preparationTimeMinutes,
          pickupAvailable: branchProduct.pickupAvailable,
          deliveryAvailable: branchProduct.deliveryAvailable,
          };
        });

      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        slug: product.slug,
        shortDescription: product.shortDescription,
        price: product.price,
        salePrice: product.salePrice,
        categoryName,
        categorySlug,
        categories: (() => {
          const cats = categoriesByProduct.get(product.id) ?? [];
          if (cats.length) {
            return cats.map((c) => ({
              id: c.id,
              name: c.name,
              slug: c.slug,
              isPrimary: c.isPrimary,
            }));
          }
          return [
            {
              id: product.categoryId,
              name: categoryName,
              slug: categorySlug,
              isPrimary: true,
            },
          ];
        })(),
        imageUrl: product.imageUrl,
        featured: product.featured,
        seasonal: product.seasonal,
        minimumLeadTimeHours: product.minimumLeadTimeHours,
        availability,
        status: product.status,
        updatedAt: product.updatedAt,
      };
    })
    .filter((product) => {
      if (filters.branchIds) {
        return product.availability.length > 0;
      }
      if (!filters.branchSlug) return true;
      if (filters.includeUnavailable) return true;
      return product.availability.some(
        (item) =>
          item.branchSlug === filters.branchSlug &&
          item.available &&
          item.inventory > 0 &&
          (!filters.scheduledStart ||
            filters.scheduledStart.getTime() >=
              Date.now() +
                Math.max(
                  product.minimumLeadTimeHours * 60,
                  item.preparationTimeMinutes,
                ) *
                60_000),
      );
    });
}

export async function getProductDetailBySlug(slug: string, branchId?: number) {
  const [row] = await db
    .select({
      product: productsTable,
      categoryName: categoriesTable.name,
      categorySlug: categoriesTable.slug,
    })
    .from(productsTable)
    .innerJoin(
      categoriesTable,
      eq(productsTable.categoryId, categoriesTable.id),
    )
    .where(eq(productsTable.slug, slug));

  if (!row) return null;

  const [card] = await listProductCards({
    search: row.product.sku,
    publicOnly: false,
  });

  if (!card) return null;

  const variants = await db
    .select()
    .from(productVariantsTable)
    .where(
      and(
        eq(productVariantsTable.productId, row.product.id),
        eq(productVariantsTable.active, true),
      ),
    )
    .orderBy(asc(productVariantsTable.id));

  const promotion = branchId == null
    ? undefined
    : await getActivePromotion(row.product.id, branchId);
  const branchAvailability = branchId == null
    ? undefined
    : card.availability.find((item) => item.branchId === branchId);
  const inheritedSalePrice = branchAvailability?.salePrice ?? row.product.salePrice;

  const crossSellProductIds = await loadProductCrossSellIds(row.product.id);

  return {
    ...card,
    description: row.product.description,
    tags: row.product.tags,
    gallery: row.product.gallery.filter((image) => image !== row.product.imageUrl),
    ingredients: row.product.ingredients,
    allergens: row.product.allergens,
    conservation: row.product.conservation,
    weight: row.product.weight,
    portions: row.product.portions,
    minimumLeadTimeHours: row.product.minimumLeadTimeHours,
    crossSellProductIds,
    variants: variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      value: variant.value,
      sku: variant.sku,
      price: variant.price,
      salePrice: resolveCatalogPrice(
        variant.price,
        variant.salePrice ?? inheritedSalePrice,
        promotion?.promotion,
      ).finalPrice,
    })),
  };
}