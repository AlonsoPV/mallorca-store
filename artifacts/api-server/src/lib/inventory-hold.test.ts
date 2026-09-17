import assert from "node:assert/strict";
import test from "node:test";
import {
  applySequentialHolds,
  nextInventoryOnCommit,
  shouldRestockOnRelease,
} from "./inventory-hold-pure.ts";
import { availableStock } from "./inventory-status.ts";

test("unpaid hold does not reduce physical stock", () => {
  const physical = 10;
  const reserved = 2;
  assert.equal(availableStock(physical, reserved), 8);
  assert.equal(physical, 10);
});

test("commit consumes physical once", () => {
  assert.equal(nextInventoryOnCommit(10, 2), 8);
});

test("release restocks only when physical was consumed", () => {
  assert.equal(shouldRestockOnRelease(false), false);
  assert.equal(shouldRestockOnRelease(true), true);
});

test("happy-path Reforma 10 → hold 2 → available 8 → commit → physical 8", () => {
  const physical = 10;
  const reservedAfterHold = 2;
  assert.equal(availableStock(physical, reservedAfterHold), 8);
  const afterCommit = nextInventoryOnCommit(physical, 2);
  assert.equal(afterCommit, 8);
  assert.equal(availableStock(afterCommit, 0), 8);
});

test("concurrency stock=1 accepts only one unpaid hold", () => {
  const result = applySequentialHolds(1, [1, 1]);
  assert.deepEqual(result.accepted, [true, false]);
  assert.equal(result.physical, 1);
  assert.equal(result.reserved, 1);
  assert.equal(availableStock(result.physical, result.reserved), 0);
});

test("cancel unpaid hold restocks zero physical units", () => {
  assert.equal(shouldRestockOnRelease(false), false);
  assert.equal(nextInventoryOnCommit(10, 0), 10);
});
