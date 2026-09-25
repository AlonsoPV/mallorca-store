import type { PaymentProvider, ProviderAvailability } from "./types.ts";

export const CashOnPickupProvider: PaymentProvider = {
  code: "CASH_ON_PICKUP",
  getAvailability(): ProviderAvailability {
    return {
      provider: "CASH_ON_PICKUP",
      available: true,
      configurationStatus: "configured",
    };
  },
  async createPayment() {
    return { status: "unpaid", provider: "CASH_ON_PICKUP" };
  },
  async recordPayment() {
    return { status: "paid", provider: "CASH_ON_PICKUP" };
  },
  async cancelPayment() {
    return { status: "cancelled", refunded: false };
  },
};

export function createMercadoPagoProvider(settings?: {
  configured?: boolean;
}): PaymentProvider {
  const configured = Boolean(settings?.configured);
  return {
    code: "MERCADO_PAGO",
    getAvailability(): ProviderAvailability {
      return {
        provider: "MERCADO_PAGO",
        available: configured,
        configurationStatus: configured ? "configured" : "not_configured",
        reason: configured ? undefined : "not_configured",
      };
    },
  };
}

export function createPayPalProvider(settings?: { configured?: boolean }): PaymentProvider {
  const configured = Boolean(settings?.configured);
  return {
    code: "PAYPAL",
    getAvailability(): ProviderAvailability {
      return {
        provider: "PAYPAL",
        available: configured,
        configurationStatus: configured ? "configured" : "not_configured",
        reason: configured ? undefined : "not_configured",
      };
    },
  };
}

const providers = new Map<string, PaymentProvider>([
  ["CASH_ON_PICKUP", CashOnPickupProvider],
  ["MERCADO_PAGO", createMercadoPagoProvider()],
  ["PAYPAL", createPayPalProvider()],
  ["TERMINAL", { code: "TERMINAL", getAvailability: () => ({ provider: "TERMINAL", available: true, configurationStatus: "configured" }) }],
  ["TRANSFER", { code: "TRANSFER", getAvailability: () => ({ provider: "TRANSFER", available: true, configurationStatus: "configured" }) }],
]);

export function registerPaymentProvider(provider: PaymentProvider): void {
  providers.set(provider.code, provider);
}

export function getPaymentProvider(code: string): PaymentProvider | undefined {
  return providers.get(code);
}

export function listPaymentProviders(): PaymentProvider[] {
  return [...providers.values()];
}

export function setMercadoPagoConfigured(configured: boolean): void {
  registerPaymentProvider(createMercadoPagoProvider({ configured }));
}

export function setOnlineProviderConfigured(provider: string, configured: boolean): void {
  if (provider === "MERCADO_PAGO") setMercadoPagoConfigured(configured);
  if (provider === "PAYPAL") registerPaymentProvider(createPayPalProvider({ configured }));
}
