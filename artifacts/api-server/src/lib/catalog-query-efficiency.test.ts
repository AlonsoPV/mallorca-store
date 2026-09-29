import assert from "node:assert/strict";
import test from "node:test";
import {
  detailProductCardFilters,
  groupAvailabilityRowsByProduct,
} from "./catalog.ts";

test("detail card lookup is pinned to the exact product ID", () => {
  assert.deepEqual(detailProductCardFilters(42), {
    productIds: [42],
    publicOnly: false,
  });
});

test("indexes branch availability once by product without cross-product rows", () => {
  const rows = [
    { branchProduct: { id: 1, productId: 10 } },
    { branchProduct: { id: 2, productId: 20 } },
    { branchProduct: { id: 3, productId: 10 } },
  ];
  const grouped = groupAvailabilityRowsByProduct(rows);
  assert.deepEqual(grouped.get(10), [rows[0], rows[2]]);
  assert.deepEqual(grouped.get(20), [rows[1]]);
  assert.equal(grouped.size, 2);
});