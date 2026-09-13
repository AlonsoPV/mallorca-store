export const SELECTED_BRANCH_STORAGE_KEY = "selected_branch_id";
const LEGACY_BRANCH_STORAGE_KEY = "mallorca_branch_id";

export interface BranchChoice {
  id: number;
  slug: string;
}

export interface BranchCartItem {
  productId: number;
  variantId: number | null;
  quantity: number;
}

export interface BranchPreviewAvailability {
  productId: number;
  variantId: number | null;
  available: boolean;
}

export function readStoredBranchId(storage: Pick<Storage, "getItem">): number | null {
  const value =
    storage.getItem(SELECTED_BRANCH_STORAGE_KEY) ??
    storage.getItem(LEGACY_BRANCH_STORAGE_KEY);
  if (!value) return null;
  const branchId = Number(value);
  return Number.isInteger(branchId) && branchId > 0 ? branchId : null;
}

export function persistSelectedBranchId(
  storage: Pick<Storage, "setItem" | "removeItem">,
  branchId: number | null,
): void {
  if (branchId === null) {
    storage.removeItem(SELECTED_BRANCH_STORAGE_KEY);
    storage.removeItem(LEGACY_BRANCH_STORAGE_KEY);
    return;
  }
  storage.setItem(SELECTED_BRANCH_STORAGE_KEY, String(branchId));
  storage.removeItem(LEGACY_BRANCH_STORAGE_KEY);
}

export function getCampaignBranchId(
  search: string,
  branches: readonly BranchChoice[],
): number | null {
  const branchSlug = new URLSearchParams(search).get("branch");
  if (!branchSlug) return null;
  return branches.find((branch) => branch.slug === branchSlug)?.id ?? null;
}

export function shouldPreviewBranchChange(input: {
  currentBranchId: number | null;
  targetBranchId: number;
  cartId: string | null;
  cartItemCount: number;
}): boolean {
  return Boolean(
    input.currentBranchId &&
      input.cartId &&
      input.cartItemCount > 0 &&
      input.targetBranchId !== input.currentBranchId,
  );
}

function itemKey(item: Pick<BranchCartItem, "productId" | "variantId">): string {
  return `${item.productId}:${item.variantId ?? "standard"}`;
}

/**
 * Keeps only lines explicitly confirmed as available by the target branch.
 * Missing preview lines are discarded rather than silently carried over.
 */
export function keepAvailableCartItems<T extends BranchCartItem>(
  cartItems: readonly T[],
  previewItems: readonly BranchPreviewAvailability[],
): T[] {
  const available = new Set(
    previewItems
      .filter((item) => item.available)
      .map((item) => itemKey(item)),
  );
  return cartItems.filter((item) => available.has(itemKey(item)));
}