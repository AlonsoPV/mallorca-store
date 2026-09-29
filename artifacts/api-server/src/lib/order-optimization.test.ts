import assert from "node:assert/strict";
import { test } from "node:test";
import { ORDER_EMAIL_WORKER_INTERVAL_MS } from "./order-emails.ts";

test("email worker keeps scheduled retries while polling less often", () => {
  assert.equal(ORDER_EMAIL_WORKER_INTERVAL_MS, 120_000);
  assert.ok(ORDER_EMAIL_WORKER_INTERVAL_MS > 30_000);
});