import type {
  CheckoutPaymentMethod,
  PaymentMethodConfig,
  ProviderAvailability,
  ResolveMethodsInput,
} from "./types.ts";

export const DEFAULT_PAYMENT_METHOD_CONFIGS: PaymentMethodConfig[] = [
  {
    code: "CASH_ON_PICKUP",
    name: "Efectivo al recoger",
    provider: "CASH_ON_PICKUP",
    enabled: true,
    sortOrder: 10,
    allowPickup: true,
    allowDelivery: false,
    configurationStatus: "configured",
    customerLabel: "Efectivo al recoger",
    customerDescription: "Pagas en sucursal al recoger tu pedido.",
  },
  {
    code: "MERCADO_PAGO",
    name: "Mercado Pago",
    provider: "MERCADO_PAGO",
    enabled: false,
    sortOrder: 20,
    allowPickup: true,
    allowDelivery: true,
    configurationStatus: "not_configured",
    customerLabel: "Mercado Pago",
    customerDescription: "Pago en línea. Disponible cuando el comercio lo configure.",
  },
  {
    code: "ONLINE",
    name: "En línea",
    provider: "MERCADO_PAGO",
    enabled: false,
    sortOrder: 30,
    allowPickup: true,
    allowDelivery: true,
    configurationStatus: "not_configured",
    customerLabel: "Pago en línea",
    customerDescription: null,
  },
  {
    code: "TERMINAL",
    name: "Terminal",
    provider: "TERMINAL",
    enabled: true,
    sortOrder: 40,
    allowPickup: true,
    allowDelivery: false,
    configurationStatus: "configured",
    customerLabel: "Terminal en sucursal",
    customerDescription: null,
  },
  {
    code: "TRANSFER",
    name: "Transferencia",
    provider: "TRANSFER",
    enabled: true,
    sortOrder: 50,
    allowPickup: true,
    allowDelivery: true,
    configurationStatus: "configured",
    customerLabel: "Transferencia",
    customerDescription: null,
  },
  {
    code: "PAYPAL",
    name: "PayPal",
    provider: "PAYPAL",
    enabled: false,
    sortOrder: 25,
    allowPickup: true,
    allowDelivery: true,
    configurationStatus: "not_configured",
    customerLabel: "PayPal",
    customerDescription: "Pago en línea con PayPal. Disponible cuando el comercio lo configure.",
  },
];

const STOREFRONT_CODES = new Set(["CASH_ON_PICKUP", "MERCADO_PAGO", "ONLINE", "PAYPAL"]);

export function providerCodeForMethod(method: string | null | undefined): string {
  if (method === "CASH" || method === "CASH_ON_PICKUP") return "CASH_ON_PICKUP";
  if (method === "PAYPAL") return "PAYPAL";
  if (method === "MERCADO_PAGO" || method === "ONLINE") return "MERCADO_PAGO";
  if (method === "TERMINAL") return "TERMINAL";
  if (method === "TRANSFER") return "TRANSFER";
  return "MANUAL";
}

export function mergePaymentConfigs(
  stored: PaymentMethodConfig[],
): PaymentMethodConfig[] {
  const byCode = new Map(DEFAULT_PAYMENT_METHOD_CONFIGS.map((row) => [row.code, { ...row }]));
  for (const row of stored) {
    byCode.set(row.code, { ...byCode.get(row.code), ...row });
  }
  return [...byCode.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function resolveAvailableMethods(input: ResolveMethodsInput): CheckoutPaymentMethod[] {
  return input.configs
    .filter((config) => {
      if (!config.enabled) return false;
      if (config.configurationStatus !== "configured") return false;
      if (input.fulfillmentMethod === "pickup" && !config.allowPickup) return false;
      if (input.fulfillmentMethod === "delivery" && !config.allowDelivery) return false;
      if (input.branchOverlay && input.branchOverlay[config.code] === false) return false;
      const availability = input.providerAvailability[config.provider];
      if (availability && !availability.available) return false;
      if (input.audience === "storefront" && !STOREFRONT_CODES.has(config.code)) return false;
      return true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((config) => ({
      code: config.code,
      name: config.name,
      provider: config.provider,
      customerLabel: config.customerLabel,
      customerDescription: config.customerDescription,
      allowPickup: config.allowPickup,
      allowDelivery: config.allowDelivery,
    }));
}

export function assertCashDeliveryBlocked(method: string | null | undefined, fulfillment: string): void {
  if (method === "CASH_ON_PICKUP" && fulfillment !== "pickup") {
    throw Object.assign(new Error("CASH_ON_PICKUP is only available for pickup"), {
      status: 400,
      code: "PAYMENT_METHOD_NOT_ALLOWED",
    });
  }
}

export function providerAvailabilityMap(
  rows: ProviderAvailability[],
): Record<string, ProviderAvailability> {
  return Object.fromEntries(rows.map((row) => [row.provider, row]));
}
