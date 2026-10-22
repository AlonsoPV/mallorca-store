import type { GatewayCode, GatewayCredentials } from "./gateways/types.ts";

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function paymentSandboxFromEnv(): boolean {
  const value = (
    process.env.PAYMENT_ENVIRONMENT ||
    process.env.PAYPAL_ENVIRONMENT ||
    ""
  )
    .trim()
    .toLowerCase();
  return value !== "live" && value !== "production";
}

export function credentialsFromEnv(provider: GatewayCode): GatewayCredentials {
  const sandbox = paymentSandboxFromEnv();
  if (provider === "PAYPAL") {
    return {
      provider,
      sandbox,
      publicKey: emptyToNull(process.env.PAYPAL_CLIENT_ID),
      secret: emptyToNull(process.env.PAYPAL_CLIENT_SECRET),
      webhookSecret: emptyToNull(process.env.PAYPAL_WEBHOOK_ID),
    };
  }
  return {
    provider,
    sandbox,
    publicKey: emptyToNull(process.env.MERCADOPAGO_PUBLIC_KEY),
    secret: emptyToNull(process.env.MERCADOPAGO_ACCESS_TOKEN),
    webhookSecret: emptyToNull(process.env.MERCADOPAGO_WEBHOOK_SECRET),
  };
}

export function overlayGatewayCredentials(
  stored: GatewayCredentials | null,
  env: GatewayCredentials,
): GatewayCredentials {
  const storedHasSecrets = Boolean(stored?.secret?.trim() || stored?.publicKey?.trim());
  return {
    provider: env.provider,
    sandbox: paymentSandboxFromEnv() ? true : storedHasSecrets ? (stored?.sandbox ?? true) : env.sandbox,
    publicKey: stored?.publicKey?.trim() || env.publicKey,
    secret: stored?.secret?.trim() || env.secret,
    webhookSecret: stored?.webhookSecret?.trim() || env.webhookSecret,
  };
}

export type PaymentCredentialSource = "none" | "replit_secrets" | "admin" | "mixed";

function hasCredentialValue(credentials: GatewayCredentials | null | undefined): boolean {
  if (!credentials) return false;
  return Boolean(
    credentials.publicKey?.trim() || credentials.secret?.trim() || credentials.webhookSecret?.trim(),
  );
}

export function describeCredentialSource(
  stored: GatewayCredentials | null,
  env: GatewayCredentials,
): PaymentCredentialSource {
  const fromAdmin = hasCredentialValue(stored);
  const fromEnv = hasCredentialValue(env);
  if (fromAdmin && fromEnv) return "mixed";
  if (fromAdmin) return "admin";
  if (fromEnv) return "replit_secrets";
  return "none";
}
