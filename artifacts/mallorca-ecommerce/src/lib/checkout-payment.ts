export type CheckoutFulfillment = "pickup" | "delivery";

export type CheckoutPaymentOption = {
  code: string;
};

const ONLINE_CODES = new Set(["PAYPAL", "MERCADO_PAGO", "ONLINE"]);
const CASH_CODES = new Set(["CASH_ON_PICKUP", "CASH"]);

export function isOnlineCheckoutPayment(code: string | null | undefined): boolean {
  return Boolean(code && ONLINE_CODES.has(code));
}

export function selectCheckoutPaymentMethod(
  fulfillmentMethod: CheckoutFulfillment,
  available: CheckoutPaymentOption[],
  current: string,
): string {
  if (available.some((method) => method.code === current)) return current;
  if (available[0]) return available[0].code;
  return fulfillmentMethod === "pickup" ? "CASH_ON_PICKUP" : "PENDING";
}

export function deliveryPaymentBlocked(available: CheckoutPaymentOption[]): boolean {
  return available.length === 0;
}

export function checkoutPayCopy(
  fulfillmentMethod: CheckoutFulfillment,
  selected: string,
  availableCount: number,
): string {
  if (fulfillmentMethod === "delivery") {
    if (availableCount === 0) return "El envío se paga en línea";
    if (selected === "PAYPAL") return "Pagas con PayPal antes del envío";
    if (selected === "MERCADO_PAGO" || selected === "ONLINE") return "Pagas con Mercado Pago antes del envío";
    return "Pagas en línea antes del envío";
  }
  if (selected === "PAYPAL") return "Pagas con PayPal";
  if (selected === "MERCADO_PAGO" || selected === "ONLINE") return "Pagas con Mercado Pago";
  return "Efectivo al recoger";
}

export function checkoutCtaLabel(
  fulfillmentMethod: CheckoutFulfillment,
  selected: string,
  availableCount: number,
): string {
  if (fulfillmentMethod === "delivery" && availableCount === 0) {
    return "No hay pago en línea para envío";
  }
  if (selected === "PAYPAL") return "Pagar con PayPal";
  if (selected === "MERCADO_PAGO" || selected === "ONLINE") return "Pagar con Mercado Pago";
  if (fulfillmentMethod === "delivery") return "Pagar en línea";
  return "Confirmar pedido";
}

export function isSettledPaymentError(error: unknown): boolean {
  const e = error as { status?: number; data?: { code?: string } | null };
  const code = e?.data?.code ?? "";
  return (
    e.status === 409 &&
    (code === "PAYMENT_ALREADY_RECORDED" || code === "PAYMENT_CAPTURE_PENDING")
  );
}

export function assertDeliveryPaymentAllowed(
  fulfillmentMethod: CheckoutFulfillment,
  requested: string | null | undefined,
): boolean {
  if (fulfillmentMethod !== "delivery") return true;
  if (!requested || requested === "PENDING" || CASH_CODES.has(requested)) return false;
  return true;
}
