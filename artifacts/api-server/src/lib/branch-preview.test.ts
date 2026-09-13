import assert from "node:assert/strict";
import test from "node:test";
import { buildBranchPreviewItems, type BranchPreviewRow } from "./branch-preview.ts";

type RowOverrides = Partial<BranchPreviewRow["item"]> & {
  branchProduct?: Partial<NonNullable<BranchPreviewRow["branchProduct"]>> | null;
  product?: Partial<BranchPreviewRow["product"]>;
};

const row = (
  overrides: RowOverrides = {},
): BranchPreviewRow => ({
  item: {
    productId: 10,
    variantId: null,
    quantity: 2,
    ...overrides,
  },
  product: {
    id: 10,
    name: "Croissant",
    status: "active",
    price: 75,
    salePrice: null,
    ...overrides.product,
  },
  branchProduct:
    overrides.branchProduct === null
      ? null
      : {
          available: true,
          inventory: 4,
          priceOverride: null,
          salePriceOverride: null,
          ...overrides.branchProduct,
        },
});

test("revalidates availability against the target branch inventory", () => {
  const items = buildBranchPreviewItems([
    row(),
    row({
      product: { id: 20, name: "Panettone" },
      branchProduct: { inventory: 1 },
    }),
    row({
      product: { id: 30, name: "Pastel inactivo", status: "inactive" },
    }),
    row({
      product: { id: 40, name: "No configurado" },
      branchProduct: null,
    }),
  ]);

  assert.deepEqual(
    items.map(({ productId, available, inventory }) => ({
      productId,
      available,
      inventory,
    })),
    [
      { productId: 10, available: true, inventory: 4 },
      { productId: 20, available: false, inventory: 1 },
      { productId: 30, available: false, inventory: 4 },
      { productId: 40, available: false, inventory: 0 },
    ],
  );
});

test("returns target-branch prices alongside the availability result", () => {
  const [item] = buildBranchPreviewItems([
    row({
      branchProduct: {
        priceOverride: 80,
        salePriceOverride: 70,
      },
    }),
  ]);

  assert.equal(item.price, 80);
  assert.equal(item.salePrice, 70);
});