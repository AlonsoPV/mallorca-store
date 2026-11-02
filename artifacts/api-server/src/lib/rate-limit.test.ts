import assert from "node:assert/strict";
import test from "node:test";
import { consumeRateLimit } from "./rate-limit.ts";

test("rate limit allows up to max then blocks until window resets", () => {
  const store = new Map();
  const now = 1_000;
  assert.equal(consumeRateLimit("ip", 2, 1_000, now, store).allowed, true);
  assert.equal(consumeRateLimit("ip", 2, 1_000, now + 1, store).allowed, true);
  assert.equal(consumeRateLimit("ip", 2, 1_000, now + 2, store).allowed, false);
  assert.equal(consumeRateLimit("ip", 2, 1_000, now + 1_000, store).allowed, true);
});
