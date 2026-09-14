/** Pure helpers extracted for unit tests (no DB). */
export function normalizeTagSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function resolvePrimaryCategoryId(input: {
  categoryId?: number;
  categoryIds?: number[];
  primaryCategoryId?: number;
}): { categoryIds: number[]; primaryCategoryId: number } {
  const fromList = input.categoryIds?.filter((id) => Number.isInteger(id) && id > 0) ?? [];
  const unique = [...new Set(fromList)];
  const primary = input.primaryCategoryId ?? input.categoryId ?? unique[0];
  if (primary == null) {
    throw new Error("PRIMARY_CATEGORY_REQUIRED");
  }
  const categoryIds = unique.length ? unique : [primary];
  if (!categoryIds.includes(primary)) {
    categoryIds.unshift(primary);
  }
  return { categoryIds: [...new Set(categoryIds)], primaryCategoryId: primary };
}

export function splitPipeList(value: string | undefined): string[] | undefined {
  if (value == null || !value.trim()) return undefined;
  return value
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function mapImportDiscountType(
  value: string | undefined,
): "fixed" | "percentage" | "amount" | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === "percentage") return "percentage";
  if (normalized === "fixed_amount" || normalized === "amount") return "amount";
  if (normalized === "fixed_price" || normalized === "fixed") return "fixed";
  return undefined;
}
