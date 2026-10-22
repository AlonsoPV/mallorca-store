import assert from "node:assert/strict";
import test from "node:test";
import { isCartNotFoundError, isStaleCartMutationError } from "./cart-recovery.ts";

test("treats converted-cart codes as a missing cart", () => {
  assert.equal(isCartNotFoundError({ data: { code: "CART_ALREADY_CONVERTED" } }), true);
  assert.equal(isCartNotFoundError({ status: 404, data: { error: "Cart not found", code: "CART_NOT_FOUND" } }), true);
  assert.equal(
    isCartNotFoundError({ status: 409, message: "HTTP 409 Conflict: Cart is empty or already converted" }),
    true,
  );
});

test("does not treat a real unavailable product as a missing cart", () => {
  const unavailable = { status: 409, data: { error: "Product unavailable" }, message: "HTTP 409 Conflict: Product unavailable" };
  assert.equal(isCartNotFoundError(unavailable), false);
  assert.equal(isStaleCartMutationError(unavailable), true);
});
