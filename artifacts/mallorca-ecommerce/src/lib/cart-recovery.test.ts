import assert from "node:assert/strict";
import test from "node:test";
import {
  isCartNotFoundError,
  isInventoryShortageError,
  isLikelyCreatedOrderError,
  isStaleCartMutationError,
  sanitizeErrorCopy,
  storefrontNoticeFromError,
} from "./cart-recovery.ts";

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

test("treats a create 500 as a possible committed order", () => {
  assert.equal(isLikelyCreatedOrderError({ status: 500, data: { code: "ORDER_CREATE_FAILED" } }), true);
  assert.equal(isLikelyCreatedOrderError({ status: 500, message: "HTTP 500 Internal Server Error" }), true);
  assert.equal(isLikelyCreatedOrderError({ status: 400, message: "Invalid fulfillment" }), false);
});

test("maps cart and inventory API dumps to customer copy", () => {
  const lowStock = storefrontNoticeFromError({
    status: 409,
    data: { error: "Insufficient inventory" },
    message: "HTTP 409 Conflict: Insufficient inventory",
  });
  assert.equal(isInventoryShortageError({ message: "HTTP 409 Conflict: Insufficient inventory" }), true);
  assert.equal(lowStock.kind, "inventory");
  assert.equal(lowStock.title, "Quedan pocas piezas");
  assert.equal(/HTTP|409|Insufficient/i.test(lowStock.description), false);

  const missingCart = storefrontNoticeFromError({
    status: 404,
    data: { error: "Cart not found", code: "CART_NOT_FOUND" },
    message: "HTTP 404 Not Found: Cart not found",
  });
  assert.equal(missingCart.kind, "cart");
  assert.equal(/HTTP|404|not found/i.test(`${missingCart.title} ${missingCart.description}`), false);

  const leak = storefrontNoticeFromError(
    { status: 500, message: "HTTP 500 Internal Server Error" },
    { description: "HTTP 500 Internal Server Error" },
  );
  assert.equal(leak.kind, "generic");
  assert.equal(/HTTP|500/i.test(leak.description), false);

  const missingOrder = storefrontNoticeFromError({
    status: 404,
    data: { error: "Order not found" },
    message: "HTTP 404 Not Found: Order not found",
  });
  assert.equal(missingOrder.kind, "order");
  assert.equal(/HTTP|404|not found/i.test(`${missingOrder.title} ${missingOrder.description}`), false);

  assert.equal(
    sanitizeErrorCopy({ data: { error: "Menú no válido." } }, "fallback"),
    "Menú no válido.",
  );
  assert.equal(
    sanitizeErrorCopy({ message: "HTTP 404 Not Found: Branch not found" }, "No se pudo guardar"),
    "No se pudo guardar",
  );
});
