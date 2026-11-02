import assert from "node:assert/strict";
import test from "node:test";
import { filterByAccessibleBranches, productVisibleInScope } from "./branch-scope.ts";

test("staff only see assigned branches; global roles see all", () => {
  const rows = [
    { id: "a", branchId: 1 },
    { id: "b", branchId: 2 },
    { id: "g", branchId: null },
  ];
  assert.deepEqual(
    filterByAccessibleBranches(rows, [1]).map((row) => row.id),
    ["a"],
  );
  assert.deepEqual(
    filterByAccessibleBranches(rows, null, { includeUnscoped: true }).map((row) => row.id),
    ["a", "b", "g"],
  );
  assert.deepEqual(
    filterByAccessibleBranches(rows, [1], { includeUnscoped: true }).map((row) => row.id),
    ["a", "g"],
  );
});

test("product detail is hidden when staff has no overlapping branch", () => {
  assert.equal(productVisibleInScope([1, 2], null), true);
  assert.equal(productVisibleInScope([1, 2], [2]), true);
  assert.equal(productVisibleInScope([1, 2], [3]), false);
  assert.equal(productVisibleInScope([1], []), false);
  assert.equal(productVisibleInScope([], [1]), false);
});
