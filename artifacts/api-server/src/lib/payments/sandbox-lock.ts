import { paymentSandboxFromEnv } from "./credentials-env.ts";
import { PaymentGatewayError, type GatewayCredentials, type GatewayHttp } from "./gateways/types.ts";

export function livePaymentsBlocked(): boolean {
  return paymentSandboxFromEnv();
}

export function enforceSandboxCredentials(credentials: GatewayCredentials): GatewayCredentials {
  const sandbox = livePaymentsBlocked() ? true : credentials.sandbox;
  const next = { ...credentials, sandbox };
  if (!next.sandbox) return next;
  const secret = next.secret?.trim() ?? "";
  const publicKey = next.publicKey?.trim() ?? "";
  if (next.provider === "MERCADO_PAGO" && (secret.startsWith("APP_USR-") || publicKey.startsWith("APP_USR-"))) {
    throw new PaymentGatewayError(
      "PAYMENT_LIVE_BLOCKED",
      "Live Mercado Pago credentials are blocked while Sandbox is active",
      403,
    );
  }
  return next;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    throw new PaymentGatewayError("PAYMENT_PROVIDER_REJECTED", "Invalid payment URL", 502);
  }
}

function isLivePayPalHost(host: string): boolean {
  return host === "api-m.paypal.com" || host === "api.paypal.com" || host === "www.paypal.com";
}

function isLiveMercadoPagoCheckoutHost(host: string): boolean {
  return (
    host === "www.mercadopago.com" ||
    host === "www.mercadopago.com.mx" ||
    host === "www.mercadopago.com.ar" ||
    host === "mercadopago.com"
  );
}

export function assertSandboxSafeUrl(url: string, sandbox: boolean): void {
  if (!sandbox) return;
  const host = hostname(url);
  if (isLivePayPalHost(host) || isLiveMercadoPagoCheckoutHost(host)) {
    throw new PaymentGatewayError(
      "PAYMENT_LIVE_BLOCKED",
      "Live payment hosts are blocked while Sandbox is active",
      403,
    );
  }
}

export function assertSandboxSafeRedirect(credentials: GatewayCredentials, url: string): string {
  assertSandboxSafeUrl(url, credentials.sandbox || livePaymentsBlocked());
  return url;
}

export function sandboxGuardedHttp(http: GatewayHttp): GatewayHttp {
  return async (request) => {
    if (livePaymentsBlocked()) {
      assertSandboxSafeUrl(request.url, true);
    }
    return http(request);
  };
}
