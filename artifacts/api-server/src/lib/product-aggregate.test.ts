import assert from "node:assert/strict";
import test from "node:test";
import {
  mapImportDiscountType,
  normalizeTagSlug,
  resolvePrimaryCategoryId,
  splitPipeList,
} from "./product-aggregate-pure.ts";

test("normalizeTagSlug collapses case and spaces", () => {
  assert.equal(normalizeTagSlug("  Navidad  "), normalizeTagSlug("navidad"));
  assert.equal(normalizeTagSlug("Regalo empresarial"), "regalo empresarial");
});

test("resolvePrimaryCategoryId uses categoryId as primary and merges lists", () => {
  const resolved = resolvePrimaryCategoryId({
    categoryId: 2,
    categoryIds: [1, 3],
  });
  assert.equal(resolved.primaryCategoryId, 2);
  assert.deepEqual(resolved.categoryIds.sort(), [1, 2, 3]);
});

test("resolvePrimaryCategoryId requires a primary", () => {
  assert.throws(() => resolvePrimaryCategoryId({}), /PRIMARY_CATEGORY_REQUIRED/);
});

test("primary must be includable in categories list", () => {
  const resolved = resolvePrimaryCategoryId({
    categoryIds: [1, 2],
    primaryCategoryId: 2,
  });
  assert.equal(resolved.primaryCategoryId, 2);
  assert.ok(resolved.categoryIds.includes(2));
});

test("splitPipeList parses pipe-separated values", () => {
  assert.deepEqual(splitPipeList("Panadería|Temporada|Chocolate"), [
    "Panadería",
    "Temporada",
    "Chocolate",
  ]);
  assert.equal(splitPipeList(""), undefined);
});

test("mapImportDiscountType maps brief enums to DB enums", () => {
  assert.equal(mapImportDiscountType("percentage"), "percentage");
  assert.equal(mapImportDiscountType("fixed_amount"), "amount");
  assert.equal(mapImportDiscountType("fixed_price"), "fixed");
  assert.equal(mapImportDiscountType("nope"), undefined);
});
