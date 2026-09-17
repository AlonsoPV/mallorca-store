export type FulfillmentMethod = "pickup" | "delivery";

export type PaymentConfigurationStatus = "configured" | "not_configured";

export type StorefrontPaymentMethod =
  | "ONLINE"
  | "CASH"
  | "TERMINAL"
  | "TRANSFER"
  | "PAYMENT_LINK"
  | "PENDING"
  | "COURTESY"
  | "CASH_ON_PICKUP";

export type PaymentMethodConfig = {
  code: string;
  name: string;
  provider: string;
  enabled: boolean;
  sortOrder: number;
  allowPickup: boolean;
  allowDelivery: boolean;
  configurationStatus: PaymentConfigurationStatus;
  customerLabel: string;
  customerDescription: string | null;
};

export type CheckoutPaymentMethod = {
  code: string;
  name: string;
  provider: string;
  customerLabel: string;
  customerDescription: string | null;
  allowPickup: boolean;
  allowDelivery: boolean;
};

export type ProviderAvailability = {
  provider: string;
  available: boolean;
  configurationStatus: PaymentConfigurationStatus;
  reason?: string;
};

export type PaymentProvider = {
  code: string;
  getAvailability(): ProviderAvailability | Promise<ProviderAvailability>;
  createPayment?(input: unknown): Promise<unknown>;
  recordPayment?(input: unknown): Promise<unknown>;
  cancelPayment?(input: unknown): Promise<unknown>;
  handleWebhook?(input: unknown): Promise<unknown>;
};

export type ResolveMethodsInput = {
  fulfillmentMethod: FulfillmentMethod;
  configs: PaymentMethodConfig[];
  branchOverlay?: Record<string, boolean>;
  providerAvailability: Record<string, ProviderAvailability>;
  audience: "storefront" | "admin";
};
