import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertDeliveryPaymentAllowed,
  checkoutCtaLabel,
  checkoutPayCopy,
  isSettledPaymentError,
  paymentSyncShouldStop,
  paypalReturnCheckoutId,
  selectCheckoutPaymentMethod,
} from "./checkout-payment.ts";

describe("selectCheckoutPaymentMethod", () => {
  it("keeps PayPal when switching to delivery instead of PENDING", () => {
    const next = selectCheckoutPaymentMethod(
      "delivery",
      [{ code: "PAYPAL" }],
      "CASH_ON_PICKUP",
    );
    assert.equal(next, "PAYPAL");
  });

  it("does not reset a selected online method on delivery", () => {
    const next = selectCheckoutPaymentMethod(
      "delivery",
      [{ code: "PAYPAL" }, { code: "MERCADO_PAGO" }],
      "PAYPAL",
    );
    assert.equal(next, "PAYPAL");
  });

  it("falls back to cash only for pickup", () => {
    assert.equal(selectCheckoutPaymentMethod("pickup", [], "PAYPAL"), "CASH_ON_PICKUP");
    assert.equal(selectCheckoutPaymentMethod("delivery", [], "CASH_ON_PICKUP"), "PENDING");
  });
});

describe("delivery payment copy", () => {
  it("never promises cash on delivery", () => {
    assert.match(checkoutPayCopy("delivery", "PAYPAL", 1), /PayPal/);
    assert.match(checkoutCtaLabel("delivery", "PAYPAL", 1), /PayPal/);
    assert.doesNotMatch(checkoutPayCopy("delivery", "PENDING", 0), /recibirlo/i);
    assert.equal(assertDeliveryPaymentAllowed("delivery", "PENDING"), false);
    assert.equal(assertDeliveryPaymentAllowed("delivery", "CASH_ON_PICKUP"), false);
    assert.equal(assertDeliveryPaymentAllowed("delivery", "PAYPAL"), true);
  });

  it("reads the PayPal order id from the return URL without confusing it with the guest token", () => {
    assert.equal(
      paypalReturnCheckoutId("pago=ok&token=1R758157Y4884364X&PayerID=ABC"),
      "1R758157Y4884364X",
    );
    assert.equal(
      paypalReturnCheckoutId(`pago=ok&token=${"a".repeat(48)}`),
      null,
    );
  });

  it("treats a 409 already-recorded payment as settled, not as a new checkout", () => {
    assert.equal(
      isSettledPaymentError({ status: 409, data: { code: "PAYMENT_ALREADY_RECORDED" } }),
      true,
    );
    assert.equal(
      isSettledPaymentError({ status: 409, data: { code: "PAYMENT_CAPTURE_PENDING" } }),
      true,
    );
    assert.equal(isSettledPaymentError({ status: 400, data: { code: "PAYMENT_ALREADY_RECORDED" } }), false);
  });
});

describe("paymentSyncShouldStop", () => {
  it("stops polling after a confirmed result, a missing checkout, or a 500", () => {
    assert.equal(paymentSyncShouldStop({ paymentStatus: "paid" }, null), true);
    assert.equal(paymentSyncShouldStop({ paymentStatus: "unpaid", reason: "missing_checkout" }, null), true);
    assert.equal(paymentSyncShouldStop({ paymentStatus: "unpaid", reason: "in_progress" }, null), false);
    assert.equal(paymentSyncShouldStop(null, { status: 500, data: { code: "PAYMENT_SYNC_FAILED" } }), true);
    assert.equal(paymentSyncShouldStop(null, { status: 502, data: { code: "PAYMENT_PROVIDER_REJECTED" } }), false);
  });
});
