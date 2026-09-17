import type { PaymentProvider, ProviderAvailability } from "./types.ts";

export class PaymentProviderNotImplementedError extends Error {
  code = "PAYMENT_PROVIDER_NOT_IMPLEMENTED";
  status = 503;
  constructor(provider: string, action: string) {
    super(`${provider} ${action} is not implemented`);
  }
}

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
    async createPayment() {
      throw new PaymentProviderNotImplementedError("MERCADO_PAGO", "createPayment");
    },
    async handleWebhook() {
      throw new PaymentProviderNotImplementedError("MERCADO_PAGO", "handleWebhook");
    },
    async cancelPayment() {
      throw new PaymentProviderNotImplementedError("MERCADO_PAGO", "cancelPayment");
    },
  };
}

const providers = new Map<string, PaymentProvider>([
  ["CASH_ON_PICKUP", CashOnPickupProvider],
  ["MERCADO_PAGO", createMercadoPagoProvider()],
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
