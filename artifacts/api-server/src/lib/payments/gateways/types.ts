export const GATEWAY_CODES = ["MERCADO_PAGO", "PAYPAL"] as const;

export type GatewayCode = (typeof GATEWAY_CODES)[number];

export type GatewayCredentials = {
  provider: GatewayCode;
  sandbox: boolean;
  publicKey: string | null;
  secret: string | null;
  webhookSecret: string | null;
};

export type CreateCheckoutInput = {
  orderId: string;
  orderNumber: string;
  invoiceId: string;
  amount: number;
  currency: "MXN";
  description: string;
  payerEmail?: string | null;
  returnUrl: string;
  cancelUrl: string;
  pendingUrl?: string | null;
  notificationUrl?: string | null;
};

export type CheckoutSession = {
  provider: GatewayCode;
  redirectUrl: string;
  providerReference: string;
  mode: "redirect";
};

export type GatewayPaymentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "refunded"
  | "unknown";

export type GatewayPayment = {
  provider: GatewayCode;
  checkoutId: string;
  providerPaymentId: string;
  status: GatewayPaymentStatus;
  amount: number | null;
  currency: string | null;
  externalReference: string | null;
  rawStatus: string;
};

export type GatewayWebhookRequest = {
  headers: Record<string, string | undefined>;
  body: unknown;
  query: Record<string, string | undefined>;
};

export type GatewayWebhookEvent =
  | { kind: "ignored" }
  | {
      kind: "payment";
      lookupId: string;
      externalReference: string | null;
    };

export type GatewayHttpRequest = {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  body?: string;
};

export type GatewayHttpResponse = {
  status: number;
  body: string;
};

export type GatewayHttp = (request: GatewayHttpRequest) => Promise<GatewayHttpResponse>;

export type PaymentGateway = {
  code: GatewayCode;
  createCheckout(credentials: GatewayCredentials, input: CreateCheckoutInput): Promise<CheckoutSession>;
  fetchPayment(credentials: GatewayCredentials, lookupId: string): Promise<GatewayPayment>;
  parseWebhook(input: GatewayWebhookRequest): GatewayWebhookEvent;
  verifyWebhook(credentials: GatewayCredentials, input: GatewayWebhookRequest): Promise<boolean>;
};

export class PaymentGatewayError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = "PaymentGatewayError";
    this.code = code;
    this.status = status;
  }
}

export function isGatewayCode(value: string | null | undefined): value is GatewayCode {
  return value === "MERCADO_PAGO" || value === "PAYPAL";
}

export function gatewayCodeForMethod(method: string | null | undefined): GatewayCode | null {
  if (method === "PAYPAL") return "PAYPAL";
  if (method === "MERCADO_PAGO" || method === "ONLINE") return "MERCADO_PAGO";
  return null;
}

export function gatewayCodeFromPath(value: string): GatewayCode | null {
  const normalized = value.trim().toLowerCase().replace(/_/g, "-");
  if (normalized === "mercado-pago" || normalized === "mercadopago") return "MERCADO_PAGO";
  if (normalized === "paypal") return "PAYPAL";
  return null;
}

export function gatewayCredentialsReady(credentials: GatewayCredentials | null | undefined): boolean {
  if (!credentials) return false;
  if (credentials.provider === "PAYPAL") {
    return Boolean(credentials.publicKey?.trim() && credentials.secret?.trim());
  }
  return Boolean(credentials.secret?.trim());
}
