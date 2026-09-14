import test from "node:test";
import assert from "node:assert/strict";
import {
  availableStock,
  deriveInventoryStatus,
  enteredAlertState,
  predictAlertOnStockChange,
} from "./inventory-status.ts";

test("CASO 1: 6→5 con min=5 dispara LOW una vez", () => {
  const pred = predictAlertOnStockChange({
    previousAvailable: 6,
    nextAvailable: 5,
    minStock: 5,
  });
  assert.equal(pred.willTriggerAlert, true);
  assert.equal(pred.type, "LOW_STOCK");
});

test("CASO 2: 5→4 dentro de LOW no re-dispara", () => {
  const pred = predictAlertOnStockChange({
    previousAvailable: 5,
    nextAvailable: 4,
    minStock: 5,
  });
  assert.equal(pred.willTriggerAlert, false);
  assert.equal(pred.nextStatus, "LOW_STOCK");
});

test("CASO 3: restock 4→12 sale de LOW", () => {
  const pred = predictAlertOnStockChange({
    previousAvailable: 4,
    nextAvailable: 12,
    minStock: 5,
  });
  assert.equal(pred.willTriggerAlert, false);
  assert.equal(pred.nextStatus, "NORMAL");
  assert.equal(enteredAlertState("LOW_STOCK", "NORMAL"), false);
});

test("CASO 5: import a critical=2 genera CRITICAL", () => {
  const pred = predictAlertOnStockChange({
    previousAvailable: 10,
    nextAvailable: 2,
    minStock: 5,
    criticalStock: 2,
  });
  assert.equal(pred.willTriggerAlert, true);
  assert.equal(pred.type, "CRITICAL_STOCK");
});

test("available stock usa inventory − reserved", () => {
  assert.equal(availableStock(10, 7), 3);
  assert.equal(
    deriveInventoryStatus(availableStock(10, 7), 5, null),
    "LOW_STOCK",
  );
});

test("min no definido no genera LOW; stock 0 sí OUT", () => {
  assert.equal(deriveInventoryStatus(3, 0, null), "NORMAL");
  assert.equal(deriveInventoryStatus(0, 0, null), "OUT_OF_STOCK");
});

test("auto_alert_enabled=false no predice alerta", () => {
  const pred = predictAlertOnStockChange({
    previousAvailable: 6,
    nextAvailable: 5,
    minStock: 5,
    autoAlertEnabled: false,
  });
  assert.equal(pred.willTriggerAlert, false);
});
