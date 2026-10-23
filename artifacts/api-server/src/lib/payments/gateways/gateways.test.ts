import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { amountsMatch, defaultGatewayHttp, providerErrorSummary } from "./http.ts";
import { createMercadoPagoGateway, verifyMercadoPagoSignature } from "./mercado-pago.ts";
import { decideGatewayOutcome, shouldReuseCheckoutSession } from "./outcome.ts";
import { clearPayPalTokenCache, createPayPalGateway } from "./paypal.ts";
import type { GatewayCredentials, GatewayHttp } from "./types.ts";
import { PaymentGatewayError } from "./types.ts";

const mercadoPagoCredentials: GatewayCredentials = {
  provider: "MERCADO_PAGO",
  sandbox: true,
  publicKey: "TEST-public",
  secret: "TEST-token",
  webhookSecret: "whsec_test",
};

const payPalCredentials: GatewayCredentials = {
  provider: "PAYPAL",
  sandbox: true,
  publicKey: "client-id",
  secret: "client-secret",
  webhookSecret: "webhook-id",
};

function scripted(handlers: Record<string, (url: string, body?: string) => { status: number; body: string }>): GatewayHttp {
  return async (request) => {
    const match = Object.entries(handlers).find(([path]) => request.url.includes(path));
    if (!match) return { status: 404, body: "" };
    return match[1](request.url, request.body);
  };
}

describe("provider error summary", () => {
  it("maps a dropped provider connection to 502 instead of an unhandled 500", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("fetch failed");
    }) as typeof fetch;
    try {
      await assert.rejects(
        () => defaultGatewayHttp({ method: "GET", url: "https://api-m.sandbox.paypal.com/v2/checkout/orders/x" }),
        (error: unknown) =>
          error instanceof PaymentGatewayError &&
          error.status === 502 &&
          error.code === "PAYMENT_PROVIDER_UNAVAILABLE",
      );
    } finally {
      globalThis.fetch = original;
    }
  });

  it("exposes PayPal issue names and debug id without the raw body", () => {
    const summary = providerErrorSummary({
      name: "UNPROCESSABLE_ENTITY",
      debug_id: "abc123",
      details: [{ issue: "INVALID_RETURN_URL" }, { issue: "PAYEE_ACCOUNT_RESTRICTED" }],
    });
    assert.equal(summary, " (INVALID_RETURN_URL, PAYEE_ACCOUNT_RESTRICTED, debug_id=abc123)");
  });
});

describe("gateway money and outcome", () => {
  it("matches amounts by cents and refuses a short payment", () => {
    assert.equal(amountsMatch(680.5, 680.5), true);
    assert.equal(amountsMatch(680, 680.004), true);
    const short = decideGatewayOutcome({
      orderTotal: 680,
      paymentStatus: "processing",
      payment: {
        provider: "MERCADO_PAGO",
        checkoutId: "pref",
        providerPaymentId: "1",
        status: "approved",
        amount: 679.99,
        currency: "MXN",
        externalReference: "order",
        rawStatus: "approved",
      },
    });
    assert.equal(short.action, "ignore");
    if (short.action === "ignore") assert.equal(short.reason, "amount");
  });

  it("reuses a PayPal checkout only while the payer still has to approve", () => {
    const base = {
      provider: "PAYPAL" as const,
      checkoutId: "ORDER9",
      providerPaymentId: "ORDER9",
      amount: 10,
      currency: "MXN",
      externalReference: "order-9",
    };
    assert.equal(
      shouldReuseCheckoutSession({ ...base, status: "pending", rawStatus: "CREATED" }),
      true,
    );
    assert.equal(
      shouldReuseCheckoutSession({ ...base, status: "pending", rawStatus: "APPROVED" }),
      false,
    );
    assert.equal(
      shouldReuseCheckoutSession({ ...base, status: "approved", rawStatus: "COMPLETED" }),
      false,
    );
  });

  it("marks an approved PayPal capture paid even without currency or amount on the payload", () => {
    const paid = decideGatewayOutcome({
      orderTotal: "250" as unknown as number,
      paymentStatus: "processing",
      payment: {
        provider: "PAYPAL",
        checkoutId: "ORDER9",
        providerPaymentId: "CAP9",
        status: "approved",
        amount: null,
        currency: null,
        externalReference: "order-9",
        rawStatus: "COMPLETED",
      },
    });
    assert.equal(paid.action, "mark_paid");
    if (paid.action === "mark_paid") assert.equal(paid.amount, 250);
  });

  it("maps rejected, cancelled, pending and refunded outcomes", () => {
    const base = {
      provider: "MERCADO_PAGO" as const,
      checkoutId: "pref",
      providerPaymentId: "1",
      amount: 120,
      currency: "MXN",
      externalReference: "order",
      rawStatus: "rejected",
    };
    assert.equal(
      decideGatewayOutcome({
        orderTotal: 120,
        paymentStatus: "processing",
        payment: { ...base, status: "rejected" },
      }).action,
      "mark_failed",
    );
    assert.equal(
      decideGatewayOutcome({
        orderTotal: 120,
        paymentStatus: "processing",
        payment: { ...base, status: "cancelled", rawStatus: "cancelled" },
      }).action,
      "mark_failed",
    );
    assert.equal(
      decideGatewayOutcome({
        orderTotal: 120,
        paymentStatus: "unpaid",
        payment: { ...base, status: "pending", rawStatus: "pending" },
      }).action,
      "mark_processing",
    );
    assert.equal(
      decideGatewayOutcome({
        orderTotal: 120,
        paymentStatus: "paid",
        payment: { ...base, status: "refunded", rawStatus: "refunded" },
      }).action,
      "mark_refunded",
    );
    assert.equal(
      decideGatewayOutcome({
        orderTotal: 120,
        paymentStatus: "paid",
        payment: { ...base, status: "rejected" },
      }).action,
      "ignore",
    );
  });

  it("marks a matching approval as paid and ignores a second one", () => {
    const payment = {
      provider: "PAYPAL" as const,
      checkoutId: "ORDER1",
      providerPaymentId: "CAP1",
      status: "approved" as const,
      amount: 120,
      currency: "MXN",
      externalReference: "order",
      rawStatus: "COMPLETED",
    };
    const first = decideGatewayOutcome({ orderTotal: 120, paymentStatus: "processing", payment });
    assert.deepEqual(first, { action: "mark_paid", amount: 120 });
    const second = decideGatewayOutcome({ orderTotal: 120, paymentStatus: "paid", payment });
    assert.equal(second.action, "ignore");
    if (second.action === "ignore") assert.equal(second.reason, "already_paid");
  });
});

describe("Mercado Pago gateway", () => {
  it("creates a sandbox preference and reads an approved payment", async () => {
    const gateway = createMercadoPagoGateway(scripted({
      "/checkout/preferences": () => ({
        status: 201,
        body: JSON.stringify({
          id: "pref-1",
          init_point: "https://www.mercadopago.com/checkout/v1/redirect?pref_id=pref-1",
          sandbox_init_point: "https://sandbox.mercadopago.com/checkout/v1/redirect?pref_id=pref-1",
        }),
      }),
      "/v1/payments/": () => ({
        status: 200,
        body: JSON.stringify({
          id: 99,
          status: "approved",
          transaction_amount: 250,
          currency_id: "MXN",
          external_reference: "order-1",
        }),
      }),
    }));
    const session = await gateway.createCheckout(mercadoPagoCredentials, {
      orderId: "order-1",
      orderNumber: "M-1",
      invoiceId: "order-1-a",
      amount: 250,
      currency: "MXN",
      description: "Pedido M-1",
      payerEmail: "ana@example.com",
      returnUrl: "https://mallorca.test/ok",
      cancelUrl: "https://mallorca.test/cancel",
      pendingUrl: "https://mallorca.test/pending",
    });
    assert.equal(session.providerReference, "pref-1");
    assert.match(session.redirectUrl, /^https:\/\/sandbox\.mercadopago\.com\//);
    const payment = await gateway.fetchPayment(mercadoPagoCredentials, "99");
    assert.equal(payment.status, "approved");
    assert.equal(payment.providerPaymentId, "99");
    assert.equal(payment.externalReference, "order-1");
  });

  it("reads rejected and pending payments from Checkout Pro", async () => {
    const gateway = createMercadoPagoGateway(scripted({
      "/v1/payments/10": () => ({
        status: 200,
        body: JSON.stringify({
          id: 10,
          status: "rejected",
          transaction_amount: 250,
          currency_id: "MXN",
          external_reference: "order-1",
        }),
      }),
      "/v1/payments/11": () => ({
        status: 200,
        body: JSON.stringify({
          id: 11,
          status: "pending",
          transaction_amount: 250,
          currency_id: "MXN",
          external_reference: "order-1",
        }),
      }),
    }));
    const rejected = await gateway.fetchPayment(mercadoPagoCredentials, "10");
    assert.equal(rejected.status, "rejected");
    const pending = await gateway.fetchPayment(mercadoPagoCredentials, "11");
    assert.equal(pending.status, "pending");
  });

  it("does not fall back to a live checkout URL in sandbox", async () => {
    const gateway = createMercadoPagoGateway(scripted({
      "/checkout/preferences": () => ({
        status: 201,
        body: JSON.stringify({
          id: "pref-live",
          init_point: "https://www.mercadopago.com/checkout/v1/redirect?pref_id=pref-live",
        }),
      }),
    }));
    await assert.rejects(
      () => gateway.createCheckout(mercadoPagoCredentials, {
        orderId: "order-1",
        orderNumber: "M-1",
        invoiceId: "order-1-a",
        amount: 10,
        currency: "MXN",
        description: "Pedido",
        returnUrl: "https://mallorca.test/ok",
        cancelUrl: "https://mallorca.test/cancel",
      }),
      (error: unknown) => error instanceof PaymentGatewayError && error.status === 502,
    );
  });

  it("refuses checkout without an access token", async () => {
    const gateway = createMercadoPagoGateway();
    await assert.rejects(
      () => gateway.createCheckout({ ...mercadoPagoCredentials, secret: null }, {
        orderId: "order-1",
        orderNumber: "M-1",
        invoiceId: "order-1-a",
        amount: 10,
        currency: "MXN",
        description: "Pedido",
        returnUrl: "https://mallorca.test/ok",
        cancelUrl: "https://mallorca.test/cancel",
      }),
      (error: unknown) => error instanceof PaymentGatewayError && error.status === 503,
    );
  });

  it("fails closed when Mercado Pago is unreachable", async () => {
    const gateway = createMercadoPagoGateway(async () => {
      throw new Error("ECONNRESET");
    });
    await assert.rejects(
      () => gateway.fetchPayment(mercadoPagoCredentials, "10"),
      (error: unknown) => error instanceof Error && error.message === "ECONNRESET",
    );
  });

  it("verifies the webhook manifest and ignores other topics", () => {
    const dataId = "99";
    const requestId = "req-1";
    const ts = "1700000000";
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const v1 = createHmac("sha256", "whsec_test").update(manifest).digest("hex");
    assert.equal(verifyMercadoPagoSignature({
      secret: "whsec_test",
      xSignature: `ts=${ts},v1=${v1}`,
      xRequestId: requestId,
      dataId,
    }), true);
    assert.equal(verifyMercadoPagoSignature({
      secret: "other",
      xSignature: `ts=${ts},v1=${v1}`,
      xRequestId: requestId,
      dataId,
    }), false);
    const gateway = createMercadoPagoGateway();
    assert.deepEqual(gateway.parseWebhook({
      headers: {},
      query: { "data.id": "99", type: "payment" },
      body: { type: "payment", data: { id: "99" } },
    }), { kind: "payment", lookupId: "99", externalReference: null });
    assert.deepEqual(gateway.parseWebhook({
      headers: {},
      query: { topic: "merchant_order", id: "10" },
      body: {},
    }).kind, "ignored");
  });
});

describe("PayPal gateway", () => {
  it("gets a token, creates an order and captures an approved one", async () => {
    clearPayPalTokenCache();
    const calls: string[] = [];
    const gateway = createPayPalGateway(async (request) => {
      calls.push(`${request.method} ${request.url}`);
      if (request.url.endsWith("/v1/oauth2/token")) {
        return { status: 200, body: JSON.stringify({ access_token: "tok", expires_in: 3600 }) };
      }
      if (request.url.endsWith("/v2/checkout/orders")) {
        const body = JSON.parse(request.body ?? "{}");
        assert.equal(body.purchase_units[0].amount.value, "80.50");
        assert.equal(body.purchase_units[0].custom_id, "order-9");
        return {
          status: 201,
          body: JSON.stringify({
            id: "ORDER9",
            status: "CREATED",
            links: [{ rel: "payer-action", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER9" }],
          }),
        };
      }
      if (request.url.endsWith("/v2/checkout/orders/ORDER9")) {
        return {
          status: 200,
          body: JSON.stringify({
            id: "ORDER9",
            status: "APPROVED",
            purchase_units: [{ custom_id: "order-9", amount: { currency_code: "MXN", value: "80.50" } }],
          }),
        };
      }
      if (request.url.endsWith("/capture")) {
        return {
          status: 201,
          body: JSON.stringify({
            id: "ORDER9",
            status: "COMPLETED",
            purchase_units: [{
              custom_id: "order-9",
              payments: {
                captures: [{
                  id: "CAP9",
                  status: "COMPLETED",
                  custom_id: "order-9",
                  amount: { currency_code: "MXN", value: "80.50" },
                }],
              },
            }],
          }),
        };
      }
      return { status: 404, body: "" };
    });
    const session = await gateway.createCheckout(payPalCredentials, {
      orderId: "order-9",
      orderNumber: "M-9",
      invoiceId: "order-9-a",
      amount: 80.5,
      currency: "MXN",
      description: "Pedido M-9",
      returnUrl: "https://mallorca.test/ok",
      cancelUrl: "https://mallorca.test/cancel",
    });
    assert.equal(session.providerReference, "ORDER9");
    assert.match(session.redirectUrl, /^https:\/\/www\.sandbox\.paypal\.com\//);
    const payment = await gateway.fetchPayment(payPalCredentials, "ORDER9");
    assert.equal(payment.status, "approved");
    assert.equal(payment.providerPaymentId, "CAP9");
    assert.equal(calls.filter((call) => call.includes("/v1/oauth2/token")).length, 1);
  });

  it("looks up capture webhooks by PayPal order id, not capture id", () => {
    const gateway = createPayPalGateway();
    const parsed = gateway.parseWebhook({
      headers: {},
      query: {},
      body: {
        event_type: "PAYMENT.CAPTURE.COMPLETED",
        resource: {
          id: "CAP9",
          custom_id: "order-9",
          supplementary_data: { related_ids: { order_id: "ORDER9" } },
        },
      },
    });
    assert.deepEqual(parsed, {
      kind: "payment",
      lookupId: "ORDER9",
      externalReference: "order-9",
    });
  });

  it("reads a capture when the checkout order lookup is missing", async () => {
    clearPayPalTokenCache();
    const gateway = createPayPalGateway(async (request) => {
      if (request.url.endsWith("/v1/oauth2/token")) {
        return { status: 200, body: JSON.stringify({ access_token: "tok", expires_in: 3600 }) };
      }
      if (request.url.includes("/v2/checkout/orders/CAP9")) {
        return { status: 404, body: "" };
      }
      if (request.url.endsWith("/v2/payments/captures/CAP9")) {
        return {
          status: 200,
          body: JSON.stringify({
            id: "CAP9",
            status: "COMPLETED",
            custom_id: "order-9",
            amount: { currency_code: "MXN", value: "10.00" },
            supplementary_data: { related_ids: { order_id: "ORDER9" } },
          }),
        };
      }
      return { status: 404, body: "" };
    });
    const payment = await gateway.fetchPayment(payPalCredentials, "CAP9");
    assert.equal(payment.status, "approved");
    assert.equal(payment.checkoutId, "ORDER9");
    assert.equal(payment.externalReference, "order-9");
  });

  it("rejects a webhook without PayPal transmission headers", async () => {
    clearPayPalTokenCache();
    const gateway = createPayPalGateway();
    const verified = await gateway.verifyWebhook(payPalCredentials, {
      headers: {},
      query: {},
      body: { event_type: "PAYMENT.CAPTURE.COMPLETED" },
    });
    assert.equal(verified, false);
  });

  it("fails closed when PayPal token exchange is down", async () => {
    clearPayPalTokenCache();
    const gateway = createPayPalGateway(async () => ({ status: 500, body: "nope" }));
    await assert.rejects(
      () => gateway.createCheckout(payPalCredentials, {
        orderId: "order-9",
        orderNumber: "M-9",
        invoiceId: "order-9-a",
        amount: 10,
        currency: "MXN",
        description: "Pedido",
        returnUrl: "https://mallorca.test/ok",
        cancelUrl: "https://mallorca.test/cancel",
      }),
      (error: unknown) => error instanceof PaymentGatewayError && error.status === 502,
    );
  });

  it("reads pending and refunded PayPal captures without treating them as paid", async () => {
    clearPayPalTokenCache();
    const gateway = createPayPalGateway(async (request) => {
      if (request.url.endsWith("/v1/oauth2/token")) {
        return { status: 200, body: JSON.stringify({ access_token: "tok", expires_in: 3600 }) };
      }
      if (request.url.endsWith("/v2/checkout/orders/ORDER-PENDING")) {
        return {
          status: 200,
          body: JSON.stringify({
            id: "ORDER-PENDING",
            status: "APPROVED",
            purchase_units: [{
              custom_id: "order-9",
              amount: { currency_code: "MXN", value: "10.00" },
              payments: {
                captures: [{
                  id: "CAP-P",
                  status: "PENDING",
                  custom_id: "order-9",
                  amount: { currency_code: "MXN", value: "10.00" },
                }],
              },
            }],
          }),
        };
      }
      if (request.url.endsWith("/v2/checkout/orders/ORDER-REFUND")) {
        return {
          status: 200,
          body: JSON.stringify({
            id: "ORDER-REFUND",
            status: "COMPLETED",
            purchase_units: [{
              custom_id: "order-9",
              amount: { currency_code: "MXN", value: "10.00" },
              payments: {
                captures: [{
                  id: "CAP-R",
                  status: "REFUNDED",
                  custom_id: "order-9",
                  amount: { currency_code: "MXN", value: "10.00" },
                }],
              },
            }],
          }),
        };
      }
      return { status: 404, body: "" };
    });
    const pending = await gateway.fetchPayment(payPalCredentials, "ORDER-PENDING");
    assert.equal(pending.status, "pending");
    const refunded = await gateway.fetchPayment(payPalCredentials, "ORDER-REFUND");
    assert.equal(refunded.status, "refunded");
  });

  it("reads a cancelled PayPal order without capturing", async () => {
    clearPayPalTokenCache();
    const gateway = createPayPalGateway(async (request) => {
      if (request.url.endsWith("/v1/oauth2/token")) {
        return { status: 200, body: JSON.stringify({ access_token: "tok", expires_in: 3600 }) };
      }
      if (request.url.endsWith("/v2/checkout/orders/ORDER-VOID")) {
        return {
          status: 200,
          body: JSON.stringify({
            id: "ORDER-VOID",
            status: "VOIDED",
            purchase_units: [{ custom_id: "order-9", amount: { currency_code: "MXN", value: "10.00" } }],
          }),
        };
      }
      return { status: 404, body: "" };
    });
    const payment = await gateway.fetchPayment(payPalCredentials, "ORDER-VOID");
    assert.equal(payment.status, "cancelled");
  });

  it("blocks live PayPal API hosts while Sandbox is active", async () => {
    clearPayPalTokenCache();
    const previous = process.env.PAYMENT_ENVIRONMENT;
    process.env.PAYMENT_ENVIRONMENT = "sandbox";
    const gateway = createPayPalGateway(async () => ({ status: 200, body: "{}" }));
    await assert.rejects(
      () => gateway.createCheckout({ ...payPalCredentials, sandbox: false }, {
        orderId: "order-9",
        orderNumber: "M-9",
        invoiceId: "order-9-a",
        amount: 10,
        currency: "MXN",
        description: "Pedido",
        returnUrl: "https://mallorca.test/ok",
        cancelUrl: "https://mallorca.test/cancel",
      }),
      (error: unknown) => error instanceof PaymentGatewayError && error.code === "PAYMENT_LIVE_BLOCKED",
    );
    if (previous === undefined) delete process.env.PAYMENT_ENVIRONMENT;
    else process.env.PAYMENT_ENVIRONMENT = previous;
  });

  it("refuses checkout without a client id", async () => {
    const gateway = createPayPalGateway();
    await assert.rejects(
      () => gateway.createCheckout({ ...payPalCredentials, publicKey: null }, {
        orderId: "order-9",
        orderNumber: "M-9",
        invoiceId: "order-9-a",
        amount: 10,
        currency: "MXN",
        description: "Pedido",
        returnUrl: "https://mallorca.test/ok",
        cancelUrl: "https://mallorca.test/cancel",
      }),
      (error: unknown) => error instanceof PaymentGatewayError && error.status === 503,
    );
  });
});
