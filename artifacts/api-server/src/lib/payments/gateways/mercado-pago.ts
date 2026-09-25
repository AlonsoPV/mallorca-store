import { createHmac, timingSafeEqual } from "node:crypto";
import {
  asId,
  asNumber,
  asRecord,
  asString,
  assertProviderOk,
  assertRedirectUrl,
  defaultGatewayHttp,
  toMoneyNumber,
} from "./http.ts";
import {
  PaymentGatewayError,
  type CreateCheckoutInput,
  type GatewayCredentials,
  type GatewayHttp,
  type GatewayPayment,
  type GatewayWebhookEvent,
  type GatewayWebhookRequest,
  type PaymentGateway,
} from "./types.ts";

const API_BASE = "https://api.mercadopago.com";

function authHeaders(credentials: GatewayCredentials): Record<string, string> {
  if (!credentials.secret?.trim()) {
    throw new PaymentGatewayError(
      "PAYMENT_PROVIDER_NOT_CONFIGURED",
      "Mercado Pago is not configured",
      503,
    );
  }
  return {
    Authorization: `Bearer ${credentials.secret}`,
    "Content-Type": "application/json",
  };
}

export function mercadoPagoManifestId(id: string): string {
  return /[a-z]/i.test(id) ? id.toLowerCase() : id;
}

export function verifyMercadoPagoSignature(input: {
  secret: string;
  xSignature: string | undefined;
  xRequestId: string | undefined;
  dataId: string | undefined;
}): boolean {
  if (!input.secret || !input.xSignature || !input.dataId) return false;
  const parts = Object.fromEntries(
    input.xSignature.split(",").map((part) => {
      const [key, ...rest] = part.split("=");
      return [key?.trim() ?? "", rest.join("=").trim()];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1?.toLowerCase();
  if (!ts || !v1 || v1.length !== 64) return false;
  const manifest = `id:${mercadoPagoManifestId(input.dataId)};request-id:${input.xRequestId ?? ""};ts:${ts};`;
  const digest = createHmac("sha256", input.secret).update(manifest).digest("hex");
  const actual = Buffer.from(digest);
  const expected = Buffer.from(v1);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

function mapStatus(status: string): GatewayPayment["status"] {
  switch (status) {
    case "approved":
      return "approved";
    case "pending":
    case "authorized":
    case "in_process":
    case "in_mediation":
      return "pending";
    case "rejected":
      return "rejected";
    case "cancelled":
      return "cancelled";
    case "refunded":
    case "charged_back":
      return "refunded";
    default:
      return "unknown";
  }
}

function paymentFromPayload(payload: Record<string, unknown>, checkoutId: string): GatewayPayment {
  const rawStatus = asString(payload.status) ?? "unknown";
  return {
    provider: "MERCADO_PAGO",
    checkoutId,
    providerPaymentId: asId(payload.id) ?? checkoutId,
    status: mapStatus(rawStatus),
    amount: asNumber(payload.transaction_amount),
    currency: asString(payload.currency_id)?.toUpperCase() ?? null,
    externalReference: asString(payload.external_reference),
    rawStatus,
  };
}

function notificationId(input: GatewayWebhookRequest): string | null {
  return (
    input.query["data.id"] ??
    input.query.id ??
    asId(asRecord(asRecord(input.body)?.data)?.id) ??
    null
  );
}

export function createMercadoPagoGateway(http: GatewayHttp = defaultGatewayHttp): PaymentGateway {
  return {
    code: "MERCADO_PAGO",
    async createCheckout(credentials, input: CreateCheckoutInput) {
      const amount = toMoneyNumber(input.amount);
      if (!(amount > 0)) {
        throw new PaymentGatewayError("INVALID_AMOUNT", "Invalid payment amount", 400);
      }
      const preference: Record<string, unknown> = {
        items: [
          {
            title: input.description.slice(0, 256),
            quantity: 1,
            currency_id: "MXN",
            unit_price: amount,
          },
        ],
        external_reference: input.orderId,
        metadata: { order_id: input.orderId },
        back_urls: {
          success: input.returnUrl,
          pending: input.pendingUrl || input.returnUrl,
          failure: input.cancelUrl,
        },
        auto_return: "approved",
        statement_descriptor: "MALLORCA",
        binary_mode: false,
      };
      if (input.payerEmail?.includes("@")) preference.payer = { email: input.payerEmail };
      if (input.notificationUrl) preference.notification_url = input.notificationUrl;
      const payload = assertProviderOk(
        await http({
          method: "POST",
          url: `${API_BASE}/checkout/preferences`,
          headers: authHeaders(credentials),
          body: JSON.stringify(preference),
        }),
        "checkout",
      ) as Record<string, unknown>;
      const reference = asString(payload.id);
      const redirect = credentials.sandbox
        ? asString(payload.sandbox_init_point) ?? asString(payload.init_point)
        : asString(payload.init_point);
      if (!reference || !redirect) {
        throw new PaymentGatewayError(
          "PAYMENT_PROVIDER_REJECTED",
          "Mercado Pago did not return a checkout URL",
          502,
        );
      }
      return {
        provider: "MERCADO_PAGO",
        providerReference: reference,
        redirectUrl: assertRedirectUrl(redirect),
        mode: "redirect",
      };
    },
    async fetchPayment(credentials, lookupId) {
      const payload = assertProviderOk(
        await http({
          method: "GET",
          url: `${API_BASE}/v1/payments/${encodeURIComponent(lookupId)}`,
          headers: authHeaders(credentials),
        }),
        "payment",
      ) as Record<string, unknown>;
      return paymentFromPayload(payload, lookupId);
    },
    parseWebhook(input): GatewayWebhookEvent {
      const lookupId = notificationId(input);
      const type = input.query.type ?? input.query.topic ?? asString(asRecord(input.body)?.type);
      if (!lookupId || (type && type !== "payment")) return { kind: "ignored" };
      return { kind: "payment", lookupId, externalReference: null };
    },
    async verifyWebhook(credentials, input) {
      if (!credentials.webhookSecret?.trim()) return false;
      return verifyMercadoPagoSignature({
        secret: credentials.webhookSecret,
        xSignature: input.headers["x-signature"],
        xRequestId: input.headers["x-request-id"],
        dataId: notificationId(input) ?? undefined,
      });
    },
  };
}
