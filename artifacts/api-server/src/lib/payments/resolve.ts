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

export async function loadPaymentMethodConfigs(): Promise<PaymentMethodConfig[]> {
  try {
    const rows = await db.select().from(paymentMethodConfigsTable);
    if (rows.length === 0) return DEFAULT_PAYMENT_METHOD_CONFIGS;
    return mergePaymentConfigs(rows.map(mapConfig));
  } catch {
    return DEFAULT_PAYMENT_METHOD_CONFIGS;
  }
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

export async function loadGatewayCredentials(provider: string): Promise<GatewayCredentials | null> {
  if (!isGatewayCode(provider)) return null;
  try {
    const [row] = await db
      .select()
      .from(paymentProviderSettingsTable)
      .where(eq(paymentProviderSettingsTable.provider, provider));
    return {
      provider,
      sandbox: row?.sandbox ?? true,
      publicKey: row?.publicKey ?? null,
      secret: decryptSecret(row?.accessTokenEncrypted),
      webhookSecret: decryptSecret(row?.webhookSecretEncrypted),
    };
  } catch {
    return null;
  }
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
  for (const provider of ["MERCADO_PAGO", "PAYPAL"] as const) {
    setOnlineProviderConfigured(provider, gatewayCredentialsReady(await loadGatewayCredentials(provider)));
  }

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
