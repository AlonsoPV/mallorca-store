import {
  asNumber,
  asRecord,
  asString,
  assertProviderOk,
  assertRedirectUrl,
  defaultGatewayHttp,
  readJson,
  toMoneyString,
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

type CachedToken = { token: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();

export function clearPayPalTokenCache(): void {
  tokenCache.clear();
}

export function payPalApiBase(sandbox: boolean): string {
  return sandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
}

function requireClient(credentials: GatewayCredentials): { clientId: string; secret: string } {
  const clientId = credentials.publicKey?.trim() ?? "";
  const secret = credentials.secret?.trim() ?? "";
  if (!clientId || !secret) {
    throw new PaymentGatewayError("PAYMENT_PROVIDER_NOT_CONFIGURED", "PayPal is not configured", 503);
  }
  return { clientId, secret };
}

function mapOrderStatus(status: string): GatewayPayment["status"] {
  switch (status) {
    case "COMPLETED":
      return "approved";
    case "APPROVED":
    case "CREATED":
    case "SAVED":
    case "PAYER_ACTION_REQUIRED":
      return "pending";
    case "VOIDED":
      return "cancelled";
    case "DECLINED":
      return "rejected";
    default:
      return "unknown";
  }
}

function mapCaptureStatus(status: string): GatewayPayment["status"] {
  switch (status) {
    case "COMPLETED":
      return "approved";
    case "PENDING":
      return "pending";
    case "DECLINED":
    case "FAILED":
      return "rejected";
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
      return "refunded";
    default:
      return "unknown";
  }
}

function paymentFromOrder(payload: Record<string, unknown>): GatewayPayment {
  const units = Array.isArray(payload.purchase_units) ? payload.purchase_units : [];
  const unit = asRecord(units[0]);
  const payments = asRecord(unit?.payments);
  const captures = Array.isArray(payments?.captures) ? payments.captures : [];
  const capture = asRecord(captures[0]);
  const amount = asRecord(capture?.amount) ?? asRecord(unit?.amount);
  const rawStatus = asString(capture?.status) ?? asString(payload.status) ?? "unknown";
  const status = capture ? mapCaptureStatus(rawStatus) : mapOrderStatus(rawStatus);
  return {
    provider: "PAYPAL",
    checkoutId: asString(payload.id) ?? "",
    providerPaymentId: asString(capture?.id) ?? asString(payload.id) ?? "",
    status,
    amount: asNumber(amount?.value),
    currency: asString(amount?.currency_code)?.toUpperCase() ?? null,
    externalReference: asString(capture?.custom_id) ?? asString(unit?.custom_id) ?? asString(unit?.reference_id),
    rawStatus,
  };
}

async function accessToken(
  http: GatewayHttp,
  credentials: GatewayCredentials,
): Promise<{ token: string; base: string }> {
  const { clientId, secret } = requireClient(credentials);
  const base = payPalApiBase(credentials.sandbox);
  const cacheKey = `${base}:${clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return { token: cached.token, base };
  const payload = assertProviderOk(
    await http({
      method: "POST",
      url: `${base}/v1/oauth2/token`,
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    }),
    "token",
  ) as Record<string, unknown>;
  const token = asString(payload.access_token);
  if (!token) {
    throw new PaymentGatewayError("PAYMENT_PROVIDER_REJECTED", "PayPal did not return an access token", 502);
  }
  const expiresIn = asNumber(payload.expires_in) ?? 300;
  tokenCache.set(cacheKey, { token, expiresAt: Date.now() + Math.max(30, expiresIn - 60) * 1000 });
  return { token, base };
}

async function readOrder(http: GatewayHttp, credentials: GatewayCredentials, orderId: string): Promise<GatewayPayment> {
  const { token, base } = await accessToken(http, credentials);
  const payload = assertProviderOk(
    await http({
      method: "GET",
      url: `${base}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
      headers: { Authorization: `Bearer ${token}` },
    }),
    "payment",
  ) as Record<string, unknown>;
  return paymentFromOrder(payload);
}

export function createPayPalGateway(http: GatewayHttp = defaultGatewayHttp): PaymentGateway {
  return {
    code: "PAYPAL",
    async createCheckout(credentials, input: CreateCheckoutInput) {
      const value = toMoneyString(input.amount);
      if (!(Number(value) > 0)) {
        throw new PaymentGatewayError("INVALID_AMOUNT", "Invalid payment amount", 400);
      }
      const { token, base } = await accessToken(http, credentials);
      const payload = assertProviderOk(
        await http({
          method: "POST",
          url: `${base}/v2/checkout/orders`,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "PayPal-Request-Id": input.invoiceId,
          },
          body: JSON.stringify({
            intent: "CAPTURE",
            purchase_units: [
              {
                reference_id: input.orderId,
                custom_id: input.orderId,
                invoice_id: input.invoiceId.slice(0, 127),
                description: input.description.slice(0, 127),
                amount: { currency_code: "MXN", value },
              },
            ],
            payment_source: {
              paypal: {
                experience_context: {
                  brand_name: "Pastelería Mallorca",
                  user_action: "PAY_NOW",
                  shipping_preference: "NO_SHIPPING",
                  return_url: input.returnUrl,
                  cancel_url: input.cancelUrl,
                },
              },
            },
          }),
        }),
        "checkout",
      ) as Record<string, unknown>;
      const reference = asString(payload.id);
      const links = Array.isArray(payload.links) ? payload.links : [];
      const approve = links
        .map((link) => asRecord(link))
        .find((link) => link && (link.rel === "payer-action" || link.rel === "approve"));
      const redirect = asString(approve?.href);
      if (!reference || !redirect) {
        throw new PaymentGatewayError("PAYMENT_PROVIDER_REJECTED", "PayPal did not return a checkout URL", 502);
      }
      return {
        provider: "PAYPAL",
        providerReference: reference,
        redirectUrl: assertRedirectUrl(redirect),
        mode: "redirect",
      };
    },
    async fetchPayment(credentials, lookupId) {
      const current = await readOrder(http, credentials, lookupId);
      if (current.rawStatus !== "APPROVED") return current;
      const { token, base } = await accessToken(http, credentials);
      const response = await http({
        method: "POST",
        url: `${base}/v2/checkout/orders/${encodeURIComponent(lookupId)}/capture`,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "PayPal-Request-Id": `capture:${lookupId}`,
        },
        body: "{}",
      });
      if (response.status === 422) return readOrder(http, credentials, lookupId);
      const payload = assertProviderOk(response, "capture") as Record<string, unknown>;
      return paymentFromOrder(payload);
    },
    parseWebhook(input): GatewayWebhookEvent {
      const body = asRecord(input.body);
      const eventType = asString(body?.event_type) ?? "";
      const resource = asRecord(body?.resource);
      if (!resource) return { kind: "ignored" };
      if (eventType === "CHECKOUT.ORDER.APPROVED" || eventType === "CHECKOUT.ORDER.COMPLETED") {
        const lookupId = asString(resource.id);
        if (!lookupId) return { kind: "ignored" };
        const unit = asRecord(Array.isArray(resource.purchase_units) ? resource.purchase_units[0] : null);
        return {
          kind: "payment",
          lookupId,
          externalReference: asString(unit?.custom_id) ?? asString(unit?.reference_id),
        };
      }
      if (
        eventType === "PAYMENT.CAPTURE.COMPLETED" ||
        eventType === "PAYMENT.CAPTURE.DENIED" ||
        eventType === "PAYMENT.CAPTURE.REFUNDED" ||
        eventType === "PAYMENT.CAPTURE.PENDING"
      ) {
        const related = asRecord(asRecord(resource.supplementary_data)?.related_ids);
        const lookupId = asString(related?.order_id) ?? asString(resource.id);
        if (!lookupId) return { kind: "ignored" };
        return {
          kind: "payment",
          lookupId,
          externalReference: asString(resource.custom_id),
        };
      }
      return { kind: "ignored" };
    },
    async verifyWebhook(credentials, input) {
      const webhookId = credentials.webhookSecret?.trim();
      const transmissionId = input.headers["paypal-transmission-id"];
      const transmissionTime = input.headers["paypal-transmission-time"];
      const transmissionSig = input.headers["paypal-transmission-sig"];
      const certUrl = input.headers["paypal-cert-url"];
      const authAlgo = input.headers["paypal-auth-algo"];
      if (!webhookId || !transmissionId || !transmissionTime || !transmissionSig || !certUrl || !authAlgo) {
        return false;
      }
      let parsedCert: URL;
      try {
        parsedCert = new URL(certUrl);
      } catch {
        return false;
      }
      if (parsedCert.protocol !== "https:" || !parsedCert.hostname.endsWith("paypal.com")) return false;
      const { token, base } = await accessToken(http, credentials);
      const response = await http({
        method: "POST",
        url: `${base}/v1/notifications/verify-webhook-signature`,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSig,
          transmission_time: transmissionTime,
          webhook_id: webhookId,
          webhook_event: input.body,
        }),
      });
      const payload = readJson(response.body);
      return response.status >= 200 && response.status < 300 && asRecord(payload)?.verification_status === "SUCCESS";
    },
  };
}
