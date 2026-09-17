import assert from "node:assert/strict";
import test from "node:test";
import { filterCrossSellCards } from "./catalog-cross-sell.ts";

test("cross-sell API filter drops inactive, OOS and wrong-branch cards", () => {
  const filtered = filterCrossSellCards(
    [1, 2, 3, 4],
    [
      {
        id: 1,
        availability: [{ branchId: 10, available: true, inventory: 4 }],
      },
      {
        id: 2,
        availability: [{ branchId: 10, available: false, inventory: 8 }],
      },
      {
        id: 3,
        availability: [{ branchId: 10, available: true, inventory: 0 }],
      },
      {
        id: 4,
        availability: [{ branchId: 99, available: true, inventory: 5 }],
      },
    ],
    10,
  );
  assert.deepEqual(filtered.map((card) => card.id), [1]);
});
