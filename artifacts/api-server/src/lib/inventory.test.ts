import test from "node:test";
import assert from "node:assert/strict";
import { enteredAlertState, stockState, validateInventoryCsv } from "./inventory.ts";

test("stock state transitions follow minimum stock thresholds", () => {
  assert.equal(stockState(8, 5), "NORMAL");
  assert.equal(stockState(5, 5), "LOW_STOCK");
  assert.equal(stockState(0, 5), "OUT_OF_STOCK");
  assert.equal(enteredAlertState("NORMAL", "LOW_STOCK"), true);
  assert.equal(enteredAlertState("LOW_STOCK", "NORMAL"), false);
});

test("CSV validation rejects duplicate and malformed rows", () => {
  const result = validateInventoryCsv(
    "sku,branch_code,quantity\nA-1,CENTRO,4\nA-1,CENTRO,6\nB-2,CENTRO,-1",
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0].message, /Duplicate/);
});