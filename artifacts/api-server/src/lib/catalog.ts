import {
  and,
  asc,
  eq,
  ilike,
  inArray,
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
  type Branch,
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
  status?: "draft" | "active" | "inactive";
  publicOnly?: boolean;
};

export async function listProductCards(filters: ProductFilters = {}) {
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
          return {
          branchId,
          branchSlug,
          branchName,
          available: branchProduct.available && scheduleReady,
          inventory: branchProduct.inventory,
          price: branchProduct.priceOverride ?? product.price,
          salePrice:
            branchProduct.salePriceOverride !== null
              ? branchProduct.salePriceOverride
              : product.salePrice,
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
    gallery: row.product.gallery,
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