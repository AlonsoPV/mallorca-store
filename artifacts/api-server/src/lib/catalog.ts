import {
  and,
  asc,
  eq,
  gt,
  ilike,
  inArray,
  lte,
  or,
  type SQL,
} from "drizzle-orm";
import {
  branchProductsTable,
  branchesTable,
  categoriesTable,
  db,
  productsTable,
  productVariantsTable,
  promotionBranchesTable,
  promotionsTable,
  type Branch,
  type Promotion,
} from "@workspace/db";

export function serializeBranch(branch: Branch) {
  return {
    id: branch.id,
    name: branch.name,
    slug: branch.slug,
    shortName: branch.shortName,
    description: branch.description,
    address: branch.address,
    neighborhood: branch.neighborhood,
    borough: branch.borough,
    city: branch.city,
    state: branch.state,
    postalCode: branch.postalCode,
    country: branch.country,
    latitude: branch.latitude,
    longitude: branch.longitude,
    phone: branch.phone,
    whatsapp: branch.whatsapp,
    email: branch.email,
    mapsUrl: branch.mapsUrl,
    openTableUrl: branch.openTableUrl,
    instagramUrl: branch.instagramUrl,
    imageUrl: branch.imageUrl,
    gallery: branch.gallery,
    hours: branch.hours,
    pickupAvailable: branch.pickupAvailable,
    deliveryAvailable: branch.deliveryAvailable,
    deliveryRadiusKm: branch.deliveryRadiusKm,
    minimumOrder: branch.minimumOrder,
    preparationTimeMinutes: branch.preparationTimeMinutes,
    deliveryTimeMinutes: branch.deliveryTimeMinutes,
    active: branch.active,
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

export type PromotionStatus = "scheduled" | "active" | "finished";

export function promotionStatus(
  promotion: Pick<Promotion, "startsAt" | "endsAt">,
  now = new Date(),
): PromotionStatus {
  if (promotion.startsAt.getTime() > now.getTime()) return "scheduled";
  if (promotion.endsAt.getTime() <= now.getTime()) return "finished";
  return "active";
}

export function calculatePromotionPrice(
  basePrice: number,
  promotion: Pick<Promotion, "type" | "value">,
) {
  const safeBase = Math.max(0, Number(basePrice) || 0);
  const value = Math.max(0, Number(promotion.value) || 0);
  const rawPrice =
    promotion.type === "fixed"
      ? value
      : promotion.type === "percentage"
        ? safeBase * (1 - Math.min(100, value) / 100)
        : safeBase - value;
  const finalPrice = Math.round(Math.max(0, Math.min(safeBase, rawPrice)) * 100) / 100;
  return {
    finalPrice,
    savings: Math.round((safeBase - finalPrice) * 100) / 100,
  };
}

type PromotionCandidate = {
  promotion: Promotion;
  branchIds: number[];
};

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

export function selectPromotionForBranch(
  candidates: PromotionCandidate[] | undefined,
  branchId: number,
): PromotionCandidate | undefined {
  return [...(candidates ?? [])]
    .filter(
      ({ branchIds }) => branchIds.length === 0 || branchIds.includes(branchId),
    )
    .sort((a, b) => {
      const aSpecific = a.branchIds.length > 0 ? 1 : 0;
      const bSpecific = b.branchIds.length > 0 ? 1 : 0;
      return (
        bSpecific - aSpecific ||
        b.promotion.createdAt.getTime() - a.promotion.createdAt.getTime() ||
        b.promotion.id - a.promotion.id
      );
    })[0];
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
    conditions.push(eq(categoriesTable.slug, filters.categorySlug));
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

export async function getProductDetailBySlug(slug: string) {
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
    variants: variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      value: variant.value,
      sku: variant.sku,
      price: variant.price,
      salePrice: variant.salePrice,
    })),
  };
}