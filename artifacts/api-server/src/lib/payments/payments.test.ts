import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_PAYMENT_METHOD_CONFIGS,
  assertStorefrontPaymentAllowed,
  resolveAvailableMethods,
} from "./catalog.ts";
import {
  credentialsFromEnv,
  describeCredentialSource,
  overlayGatewayCredentials,
  paymentSandboxFromEnv,
} from "./credentials-env.ts";
import { enforceSandboxCredentials, livePaymentsBlocked } from "./sandbox-lock.ts";
import { PaymentGatewayError } from "./gateways/types.ts";
import { webhookEventInsertResult, webhookEventKey } from "./gateways/webhook-event.ts";
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

  it("hides PayPal on the storefront when the provider is not configured", () => {
    const methods = resolveAvailableMethods({
      fulfillmentMethod: "pickup",
      configs: DEFAULT_PAYMENT_METHOD_CONFIGS.map((row) =>
        row.code === "PAYPAL" ? { ...row, enabled: true } : row,
      ),
      providerAvailability: {
        CASH_ON_PICKUP: { provider: "CASH_ON_PICKUP", available: true, configurationStatus: "configured" },
        PAYPAL: { provider: "PAYPAL", available: false, configurationStatus: "not_configured" },
      },
      audience: "storefront",
    });
    assert.equal(methods.some((m) => m.code === "PAYPAL"), false);
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

  it("lists PayPal for delivery when enabled and never cash", () => {
    const methods = resolveAvailableMethods({
      fulfillmentMethod: "delivery",
      configs: DEFAULT_PAYMENT_METHOD_CONFIGS.map((row) =>
        row.code === "PAYPAL" ? { ...row, enabled: true, configurationStatus: "configured" } : row,
      ),
      providerAvailability: {
        CASH_ON_PICKUP: { provider: "CASH_ON_PICKUP", available: true, configurationStatus: "configured" },
        PAYPAL: { provider: "PAYPAL", available: true, configurationStatus: "configured" },
      },
      audience: "storefront",
    });
    assert.deepEqual(methods.map((m) => m.code), ["PAYPAL"]);
  });

  it("rejects PENDING and cash for storefront delivery", () => {
    const available = [{ code: "PAYPAL" }];
    assert.throws(
      () =>
        assertStorefrontPaymentAllowed({
          fulfillmentMethod: "delivery",
          requested: "PENDING",
          available,
        }),
      (error: Error & { code?: string }) => error.code === "PAYMENT_METHOD_NOT_ALLOWED",
    );
    assert.throws(
      () =>
        assertStorefrontPaymentAllowed({
          fulfillmentMethod: "delivery",
          requested: "CASH_ON_PICKUP",
          available,
        }),
      (error: Error & { code?: string }) => error.code === "PAYMENT_METHOD_NOT_ALLOWED",
    );
    assert.equal(
      assertStorefrontPaymentAllowed({
        fulfillmentMethod: "delivery",
        requested: "PAYPAL",
        available,
      }),
      "PAYPAL",
    );
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

  it("rejects a hold when there is no physical stock", () => {
    const result = applySequentialHolds(0, [1]);
    assert.deepEqual(result.accepted, [false]);
    assert.equal(result.reserved, 0);
  });
});

describe("environment credential overlay", () => {
  const previous = { ...process.env };

  function restoreEnv() {
    for (const key of Object.keys(process.env)) {
      if (!(key in previous)) delete process.env[key];
    }
    Object.assign(process.env, previous);
  }

  it("stays in sandbox unless PAYMENT_ENVIRONMENT is live", () => {
    process.env.PAYMENT_ENVIRONMENT = "sandbox";
    assert.equal(paymentSandboxFromEnv(), true);
    process.env.PAYMENT_ENVIRONMENT = "live";
    assert.equal(paymentSandboxFromEnv(), false);
    restoreEnv();
  });

  it("labels Replit Secrets as the source when admin is empty", () => {
    process.env.PAYPAL_CLIENT_ID = "env-client";
    process.env.PAYPAL_CLIENT_SECRET = "env-secret";
    const env = credentialsFromEnv("PAYPAL");
    assert.equal(describeCredentialSource(null, env), "replit_secrets");
    assert.equal(
      describeCredentialSource(
        { provider: "PAYPAL", sandbox: true, publicKey: "admin-client", secret: "admin-secret", webhookSecret: null },
        env,
      ),
      "mixed",
    );
    restoreEnv();
  });

  it("uses env credentials when admin has no stored row", () => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = "TEST-token";
    process.env.MERCADOPAGO_PUBLIC_KEY = "TEST-pub";
    process.env.PAYMENT_ENVIRONMENT = "sandbox";
    const overlaid = overlayGatewayCredentials(null, credentialsFromEnv("MERCADO_PAGO"));
    assert.equal(overlaid.secret, "TEST-token");
    assert.equal(overlaid.publicKey, "TEST-pub");
    assert.equal(overlaid.sandbox, true);
    restoreEnv();
  });

  it("fills missing admin secrets from env without inventing values", () => {
    process.env.PAYPAL_CLIENT_ID = "env-client";
    process.env.PAYPAL_CLIENT_SECRET = "env-secret";
    process.env.PAYMENT_ENVIRONMENT = "sandbox";
    const overlaid = overlayGatewayCredentials(
      {
        provider: "PAYPAL",
        sandbox: true,
        publicKey: null,
        secret: null,
        webhookSecret: null,
      },
      credentialsFromEnv("PAYPAL"),
    );
    assert.equal(overlaid.publicKey, "env-client");
    assert.equal(overlaid.secret, "env-secret");
    assert.equal(overlaid.sandbox, true);
    restoreEnv();
  });

  it("ignores an admin live switch while PAYMENT_ENVIRONMENT is sandbox", () => {
    process.env.PAYMENT_ENVIRONMENT = "sandbox";
    const overlaid = overlayGatewayCredentials(
      {
        provider: "PAYPAL",
        sandbox: false,
        publicKey: "live-client",
        secret: "live-secret",
        webhookSecret: "wh",
      },
      credentialsFromEnv("PAYPAL"),
    );
    assert.equal(overlaid.sandbox, true);
    assert.equal(overlaid.publicKey, "live-client");
    restoreEnv();
  });

  it("allows an admin live switch only when PAYMENT_ENVIRONMENT is live", () => {
    process.env.PAYMENT_ENVIRONMENT = "live";
    const overlaid = overlayGatewayCredentials(
      {
        provider: "PAYPAL",
        sandbox: false,
        publicKey: "live-client",
        secret: "live-secret",
        webhookSecret: "wh",
      },
      credentialsFromEnv("PAYPAL"),
    );
    assert.equal(overlaid.sandbox, false);
    restoreEnv();
  });

  it("blocks Mercado Pago live tokens while Sandbox is active", () => {
    process.env.PAYMENT_ENVIRONMENT = "sandbox";
    assert.equal(livePaymentsBlocked(), true);
    assert.throws(
      () =>
        enforceSandboxCredentials({
          provider: "MERCADO_PAGO",
          sandbox: true,
          publicKey: "TEST-pub",
          secret: "APP_USR-live-token",
          webhookSecret: "wh",
        }),
      (error: unknown) => error instanceof PaymentGatewayError && error.code === "PAYMENT_LIVE_BLOCKED",
    );
    restoreEnv();
  });
});

describe("webhook event keys", () => {
  it("uses PayPal transmission id and Mercado Pago request id", () => {
    assert.equal(
      webhookEventKey("PAYPAL", {
        headers: { "paypal-transmission-id": "txn-1" },
        query: {},
        body: {},
      }),
      "paypal:txn-1",
    );
    assert.equal(
      webhookEventKey("MERCADO_PAGO", {
        headers: { "x-request-id": "req-9" },
        query: { "data.id": "99" },
        body: {},
      }),
      "mp:req-9:99",
    );
    assert.equal(
      webhookEventKey("PAYPAL", { headers: {}, query: {}, body: {} }),
      null,
    );
  });

  it("treats a second insert of the same event_key as duplicate", () => {
    const request = {
      headers: { "paypal-transmission-id": "txn-1" },
      query: {},
      body: {},
    };
    const firstKey = webhookEventKey("PAYPAL", request);
    const secondKey = webhookEventKey("PAYPAL", request);
    assert.equal(firstKey, secondKey);
    assert.equal(webhookEventInsertResult(1), "applied");
    assert.equal(webhookEventInsertResult(0), "duplicate_event");
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

  it("lists PayPal on the storefront only when enabled and configured", () => {
    const methods = resolveAvailableMethods({
      fulfillmentMethod: "pickup",
      configs: DEFAULT_PAYMENT_METHOD_CONFIGS.map((row) =>
        row.code === "PAYPAL"
          ? { ...row, enabled: true, configurationStatus: "configured" as const }
          : row,
      ),
      providerAvailability: {
        CASH_ON_PICKUP: { provider: "CASH_ON_PICKUP", available: true, configurationStatus: "configured" },
        PAYPAL: { provider: "PAYPAL", available: true, configurationStatus: "configured" },
        MERCADO_PAGO: { provider: "MERCADO_PAGO", available: false, configurationStatus: "not_configured" },
      },
      audience: "storefront",
    });
    assert.deepEqual(methods.map((m) => m.code), ["CASH_ON_PICKUP", "PAYPAL"]);
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
