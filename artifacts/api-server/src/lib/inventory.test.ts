import test from "node:test";
import assert from "node:assert/strict";
import {
  enteredAlertState,
  parseProductImportCsv,
  stockState,
  validateInventoryCsv,
} from "./inventory.ts";

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

test("product CSV parser supports quoted values, branch rows and reusable mappings", () => {
  const result = parseProductImportCsv(
    [
      "code,product_name,amount,category,store",
      'PAN-001,"Pan, artesanal",95,1,CENTRO',
      "PAN-001,,,1,REFORMA",
    ].join("\n"),
    { sku: "code", name: "product_name", price: "amount", categoryId: "category", branchCode: "store" },
  );
  assert.equal(result.errors.length, 0);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].name, "Pan, artesanal");
  assert.equal(result.rows[1].branchCode, "REFORMA");
});

test("product CSV parser rejects duplicate SKU and branch rows without rejecting other rows", () => {
  const result = parseProductImportCsv(
    "sku,name,price,category_id,branch_code\nPAN-001,Pan,95,1,CENTRO\nPAN-001,Pan,95,1,CENTRO\nPAN-002,Concha,30,1,CENTRO",
  );
  assert.equal(result.rows.length, 2);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /Duplicate/);
});

test("unified CSV preserves multiline descriptions and branch alert settings", () => {
  const csv = 'sku,name,description,branchCode,inventory,minStock,criticalStock,autoAlertEnabled\n001,"Pan, especial","Primera línea\nSegunda ""línea""",REF,0,5,2,false\n001,,,LOM,12,4,1,true';
  const parsed = parseProductImportCsv(csv);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].sku, "001");
  assert.equal(parsed.rows[0].description, 'Primera línea\nSegunda "línea"');
  assert.equal(parsed.rows[0].inventory, 0);
  assert.equal(parsed.rows[0].criticalStock, 2);
  assert.equal(parsed.rows[0].autoAlertEnabled, false);
});

test("unified CSV rejects fractional stock, missing branch and broken quotes", () => {
  for (const csv of ['sku,branchCode,inventory\nA,REF,1.5', 'sku,inventory\nA,2', 'sku,name\nA,"unfinished']) {
    assert.ok(parseProductImportCsv(csv).errors.length);
  }
  assert.ok(parseProductImportCsv('sku,branchCode,minStock,criticalStock\nA,REF,2,5').errors.length);
});

test("explicitly skipped columns do not silently import by header", () => {
  const parsed = parseProductImportCsv('sku,price\nA,12', { price: "" });
  assert.equal(parsed.rows[0].price, undefined);
});
