import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PAYMENT_METHOD_CONFIGS,
  resolveAvailableMethods,
} from "./catalog.ts";
import { createMercadoPagoProvider, createPayPalProvider } from "./providers.ts";
import {
  decideCancelPayment,
  decideCompleteUnpaid,
  decideRecordPayment,
  resolveCreateOrderPaymentState,
} from "./order-payment-state.ts";
import { applySequentialHolds } from "../inventory-hold-pure.ts";

describe("resolveAvailableMethods", () => {
  it("lists cash on pickup for pickup and omits Mercado Pago when not configured", () => {
    const methods = resolveAvailableMethods({
      fulfillmentMethod: "pickup",
      configs: DEFAULT_PAYMENT_METHOD_CONFIGS,
      providerAvailability: {
        CASH_ON_PICKUP: { provider: "CASH_ON_PICKUP", available: true, configurationStatus: "configured" },
        MERCADO_PAGO: { provider: "MERCADO_PAGO", available: false, configurationStatus: "not_configured" },
        TERMINAL: { provider: "TERMINAL", available: true, configurationStatus: "configured" },
        TRANSFER: { provider: "TRANSFER", available: true, configurationStatus: "configured" },
      },
      audience: "storefront",
    });
    assert.deepEqual(methods.map((m) => m.code), ["CASH_ON_PICKUP"]);
  });

  it("does not list cash for delivery", () => {
    const methods = resolveAvailableMethods({
      fulfillmentMethod: "delivery",
      configs: DEFAULT_PAYMENT_METHOD_CONFIGS,
      providerAvailability: {
        CASH_ON_PICKUP: { provider: "CASH_ON_PICKUP", available: true, configurationStatus: "configured" },
        MERCADO_PAGO: { provider: "MERCADO_PAGO", available: false, configurationStatus: "not_configured" },
      },
      audience: "storefront",
    });
    assert.equal(methods.some((m) => m.code === "CASH_ON_PICKUP"), false);
    assert.equal(methods.length, 0);
  });
});

describe("createOrder payment state", () => {
  it("pickup + cash → confirmed unpaid without TTL cancel", () => {
    const state = resolveCreateOrderPaymentState({
      orderSource: "STOREFRONT",
      fulfillmentMethod: "pickup",
      paymentMethod: "CASH_ON_PICKUP",
      markPaid: false,
      total: 680,
    });
    assert.equal(state.status, "confirmed");
    assert.equal(state.paymentStatus, "unpaid");
    assert.equal(state.paymentMethod, "CASH_ON_PICKUP");
    assert.equal(state.immediatePaid, false);
    assert.equal(state.skipTtlCancel, true);
    assert.equal(state.writePendingPaymentRow, true);
  });

  it("rejects delivery + cash", () => {
    assert.throws(
      () =>
        resolveCreateOrderPaymentState({
          orderSource: "STOREFRONT",
          fulfillmentMethod: "delivery",
          paymentMethod: "CASH_ON_PICKUP",
          total: 100,
        }),
      (error: Error & { status?: number; code?: string }) =>
        error.code === "PAYMENT_METHOD_NOT_ALLOWED" && error.status === 400,
    );
  });

  it("does not auto-pay CASH_ON_PICKUP on admin create", () => {
    const state = resolveCreateOrderPaymentState({
      orderSource: "PHONE",
      fulfillmentMethod: "pickup",
      paymentMethod: "CASH_ON_PICKUP",
      total: 200,
    });
    assert.equal(state.immediatePaid, false);
    assert.equal(state.status, "confirmed");
    assert.equal(state.paymentStatus, "unpaid");
  });
});

describe("record and cancel payment", () => {
  it("records full amount as paid without changing confirmed status", () => {
    const decision = decideRecordPayment({
      paymentStatus: "unpaid",
      orderStatus: "confirmed",
      total: 680,
      amountPaid: 0,
      recordedAmount: 680,
    });
    assert.equal(decision.ok, true);
    if (decision.ok) {
      assert.equal(decision.paymentStatus, "paid");
      assert.equal(decision.orderStatus, "confirmed");
      assert.equal(decision.commitInventory, true);
    }
  });

  it("rejects a second charge", () => {
    const decision = decideRecordPayment({
      paymentStatus: "paid",
      orderStatus: "confirmed",
      total: 680,
      amountPaid: 680,
      recordedAmount: 680,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.status, 409);
      assert.equal(decision.code, "PAYMENT_ALREADY_RECORDED");
    }
  });

  it("cancels unpaid cash without refund and releases holds", () => {
    const decision = decideCancelPayment({ paymentStatus: "unpaid", paymentMethod: "CASH_ON_PICKUP" });
    assert.equal(decision.paymentStatus, "cancelled");
    assert.equal(decision.refund, false);
    assert.equal(decision.releaseHolds, true);
  });

  it("blocks completing unpaid without override", () => {
    const blocked = decideCompleteUnpaid({
      paymentStatus: "unpaid",
      canOverride: true,
    });
    assert.equal(blocked.ok, false);
    const allowed = decideCompleteUnpaid({
      paymentStatus: "unpaid",
      confirmUnpaidComplete: true,
      canOverride: true,
      reason: "Cliente pagará después",
    });
    assert.equal(allowed.ok, true);
  });
});

describe("inventory hold with cash reservation", () => {
  it("last unit: first cash hold wins, second create fails", () => {
    const result = applySequentialHolds(1, [1, 1]);
    assert.deepEqual(result.accepted, [true, false]);
    assert.equal(result.reserved, 1);
  });
});

describe("online providers", () => {
  it("stays unavailable until credentials exist", async () => {
    const mercadoPago = await createMercadoPagoProvider({ configured: false }).getAvailability();
    const paypal = await createPayPalProvider({ configured: false }).getAvailability();
    assert.equal(mercadoPago.available, false);
    assert.equal(paypal.configurationStatus, "not_configured");
    const ready = await createPayPalProvider({ configured: true }).getAvailability();
    assert.equal(ready.available, true);
  });

  it("keeps Mercado Pago and PayPal unpaid until the gateway confirms", () => {
    for (const paymentMethod of ["MERCADO_PAGO", "PAYPAL"] as const) {
      const state = resolveCreateOrderPaymentState({
        orderSource: "STOREFRONT",
        fulfillmentMethod: "delivery",
        paymentMethod,
        total: 100,
      });
      assert.equal(state.immediatePaid, false);
      assert.equal(state.status, "pending_payment");
      assert.equal(state.paymentStatus, "unpaid");
    }
  });
});
