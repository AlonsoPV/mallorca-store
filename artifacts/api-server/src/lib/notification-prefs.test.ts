import test from "node:test";
import assert from "node:assert/strict";
import {
  isAlertTypeEnabled,
  normalizeNotificationPreferences,
  resolveAlertChannels,
} from "./notification-prefs.ts";

test("defaults enable in-app and inventory types", () => {
  const prefs = normalizeNotificationPreferences(null);
  assert.equal(prefs.inApp, true);
  assert.equal(prefs.email, false);
  assert.equal(prefs.whatsapp, false);
  assert.equal(prefs.criticalStock, true);
});

test("type flags gate automatic alerts", () => {
  assert.equal(isAlertTypeEnabled({ lowStock: false }, "LOW_STOCK"), false);
  assert.equal(isAlertTypeEnabled({ criticalStock: false }, "CRITICAL_STOCK"), false);
  assert.equal(isAlertTypeEnabled({ outOfStock: true }, "OUT_OF_STOCK"), true);
  assert.equal(isAlertTypeEnabled({}, "LOW_STOCK"), true);
});

test("channels include pending email and whatsapp", () => {
  const resolved = resolveAlertChannels({
    inApp: true,
    email: true,
    whatsapp: true,
  });
  assert.deepEqual(resolved.channels, ["in_app", "email_pending", "whatsapp_pending"]);
  assert.equal(resolved.deliveryState, "pending");
  assert.equal(resolved.notifyInApp, true);
});

test("disabling in-app skips internal notify flag", () => {
  const resolved = resolveAlertChannels({ inApp: false, email: true });
  assert.equal(resolved.notifyInApp, false);
  assert.deepEqual(resolved.channels, ["email_pending"]);
});
