import assert from "node:assert/strict";
import test from "node:test";
import {
  SELECTED_BRANCH_STORAGE_KEY,
  getCampaignBranchId,
  keepAvailableCartItems,
  persistSelectedBranchId,
  readStoredBranchId,
  shouldPreviewBranchChange,
} from "./branch-flow.ts";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const branches = [
  { id: 1, slug: "lomas" },
  { id: 2, slug: "reforma" },
];

test("persists the selected branch and restores it on the next session", () => {
  const storage = new MemoryStorage();

  assert.equal(readStoredBranchId(storage), null);
  persistSelectedBranchId(storage, 2);

  assert.equal(storage.getItem(SELECTED_BRANCH_STORAGE_KEY), "2");
  assert.equal(readStoredBranchId(storage), 2);
});

test("migrates the previous branch storage key when reading an existing session", () => {
  const storage = new MemoryStorage();
  storage.setItem("mallorca_branch_id", "1");

  assert.equal(readStoredBranchId(storage), 1);
  persistSelectedBranchId(storage, 2);
  assert.equal(storage.getItem("mallorca_branch_id"), null);
  assert.equal(storage.getItem(SELECTED_BRANCH_STORAGE_KEY), "2");
});

test("selects Reforma from a campaign query string", () => {
  assert.equal(getCampaignBranchId("?branch=reforma", branches), 2);
  assert.equal(getCampaignBranchId("?utm_source=mail&branch=unknown", branches), null);
});

test("does not preview a branch change when the cart is empty", () => {
  assert.equal(
    shouldPreviewBranchChange({
      currentBranchId: 1,
      targetBranchId: 2,
      cartId: "cart-1",
      cartItemCount: 0,
    }),
    false,
  );
  assert.equal(
    shouldPreviewBranchChange({
      currentBranchId: null,
      targetBranchId: 2,
      cartId: null,
      cartItemCount: 0,
    }),
    false,
  );
});

test("requires inventory revalidation before changing a non-empty cart", () => {
  assert.equal(
    shouldPreviewBranchChange({
      currentBranchId: 1,
      targetBranchId: 2,
      cartId: "cart-1",
      cartItemCount: 2,
    }),
    true,
  );
});

test("keeps only cart lines confirmed available by the target branch", () => {
  const cartItems = [
    { productId: 10, variantId: null, quantity: 1 },
    { productId: 20, variantId: 3, quantity: 2 },
    { productId: 20, variantId: 4, quantity: 1 },
  ];

  assert.deepEqual(
    keepAvailableCartItems(cartItems, [
      { productId: 10, variantId: null, available: true },
      { productId: 20, variantId: 3, available: false },
      { productId: 20, variantId: 4, available: true },
    ]),
    [
      { productId: 10, variantId: null, quantity: 1 },
      { productId: 20, variantId: 4, quantity: 1 },
    ],
  );
});