import { eq } from "drizzle-orm";
import {
  db,
  branchPaymentMethodsTable,
  paymentMethodConfigsTable,
  paymentProviderSettingsTable,
} from "@workspace/db";
import {
  DEFAULT_PAYMENT_METHOD_CONFIGS,
  mergePaymentConfigs,
  providerAvailabilityMap,
  resolveAvailableMethods as resolveAvailableMethodsPure,
} from "./catalog.ts";
import {
  credentialsFromEnv,
  describeCredentialSource,
  overlayGatewayCredentials,
  type PaymentCredentialSource,
} from "./credentials-env.ts";
import { gatewayCredentialsReady, isGatewayCode, type GatewayCredentials } from "./gateways/types.ts";
import { getPaymentProvider, setOnlineProviderConfigured } from "./providers.ts";
import { decryptSecret } from "./secrets.ts";
import type { CheckoutPaymentMethod, FulfillmentMethod, PaymentMethodConfig } from "./types.ts";

function mapConfig(row: typeof paymentMethodConfigsTable.$inferSelect): PaymentMethodConfig {
  return {
    code: row.code,
    name: row.name,
    provider: row.provider,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    allowPickup: row.allowPickup,
    allowDelivery: row.allowDelivery,
    configurationStatus: row.configurationStatus === "configured" ? "configured" : "not_configured",
    customerLabel: row.customerLabel,
    customerDescription: row.customerDescription ?? null,
  };
}

async function syncOnlineProviderConfiguration(configs: PaymentMethodConfig[]): Promise<void> {
  for (const provider of ["MERCADO_PAGO", "PAYPAL"] as const) {
    const ready = gatewayCredentialsReady(await loadGatewayCredentials(provider));
    setOnlineProviderConfigured(provider, ready);
    if (ready) {
      for (const config of configs) {
        if (config.provider === provider) config.configurationStatus = "configured";
      }
    }
  }
}

export async function loadPaymentMethodConfigs(): Promise<PaymentMethodConfig[]> {
  let configs: PaymentMethodConfig[];
  try {
    const rows = await db.select().from(paymentMethodConfigsTable);
    configs = rows.length === 0 ? DEFAULT_PAYMENT_METHOD_CONFIGS : mergePaymentConfigs(rows.map(mapConfig));
  } catch {
    configs = DEFAULT_PAYMENT_METHOD_CONFIGS;
  }
  await syncOnlineProviderConfiguration(configs);
  return configs;
}

async function loadBranchOverlay(branchId: number): Promise<Record<string, boolean>> {
  try {
    const rows = await db
      .select()
      .from(branchPaymentMethodsTable)
      .where(eq(branchPaymentMethodsTable.branchId, branchId));
    return Object.fromEntries(rows.map((row) => [row.methodCode, row.enabled]));
  } catch {
    return {};
  }
}

export async function inspectGatewayCredentials(provider: string): Promise<{
  credentials: GatewayCredentials;
  source: PaymentCredentialSource;
} | null> {
  if (!isGatewayCode(provider)) return null;
  const fromEnv = credentialsFromEnv(provider);
  let stored: GatewayCredentials | null = null;
  try {
    const [row] = await db
      .select()
      .from(paymentProviderSettingsTable)
      .where(eq(paymentProviderSettingsTable.provider, provider));
    stored = {
      provider,
      sandbox: row?.sandbox ?? true,
      publicKey: row?.publicKey ?? null,
      secret: decryptSecret(row?.accessTokenEncrypted),
      webhookSecret: decryptSecret(row?.webhookSecretEncrypted),
    };
  } catch {
    stored = null;
  }
  return {
    credentials: overlayGatewayCredentials(stored, fromEnv),
    source: describeCredentialSource(stored, fromEnv),
  };
}

export async function loadGatewayCredentials(provider: string): Promise<GatewayCredentials | null> {
  const inspected = await inspectGatewayCredentials(provider);
  return inspected?.credentials ?? null;
}

export async function loadMercadoPagoConfigured(): Promise<boolean> {
  return gatewayCredentialsReady(await loadGatewayCredentials("MERCADO_PAGO"));
}

export async function resolveAvailableMethods(input: {
  branchId: number;
  fulfillmentMethod: FulfillmentMethod;
  audience?: "storefront" | "admin";
}): Promise<CheckoutPaymentMethod[]> {
  const configs = await loadPaymentMethodConfigs();
  const overlay = await loadBranchOverlay(input.branchId);

  const uniqueProviders = [...new Set(configs.map((row) => row.provider))];
  const availability = await Promise.all(
    uniqueProviders.map(async (code) => {
      const provider = getPaymentProvider(code);
      if (!provider) {
        return { provider: code, available: true, configurationStatus: "configured" as const };
      }
      return provider.getAvailability();
    }),
  );

  return resolveAvailableMethodsPure({
    fulfillmentMethod: input.fulfillmentMethod,
    configs,
    branchOverlay: overlay,
    providerAvailability: providerAvailabilityMap(availability),
    audience: input.audience ?? "storefront",
  });
}
