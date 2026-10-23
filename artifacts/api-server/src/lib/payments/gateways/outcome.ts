import { amountsMatch } from "./http.ts";
import type { GatewayPayment } from "./types.ts";

export function shouldReuseCheckoutSession(payment: GatewayPayment): boolean {
  return (
    payment.status === "pending" &&
    ["CREATED", "SAVED", "PAYER_ACTION_REQUIRED"].includes(payment.rawStatus)
  );
}

export type GatewayOutcome =
  | { action: "ignore"; reason: string }
  | { action: "mark_paid"; amount: number }
  | { action: "mark_failed" }
  | { action: "mark_processing" }
  | { action: "mark_refunded" };

export function decideGatewayOutcome(input: {
  orderTotal: number;
  paymentStatus: string;
  payment: GatewayPayment;
}): GatewayOutcome {
  const { payment } = input;
  if (payment.status === "approved") {
    if (input.paymentStatus === "paid") return { action: "ignore", reason: "already_paid" };
    const currency = (payment.currency ?? "MXN").toUpperCase();
    if (currency !== "MXN") return { action: "ignore", reason: "currency" };
    const expected = Number(input.orderTotal);
    const captured = payment.amount == null ? expected : Number(payment.amount);
    if (!Number.isFinite(expected) || !Number.isFinite(captured) || !amountsMatch(expected, captured)) {
      return { action: "ignore", reason: "amount" };
    }
    return { action: "mark_paid", amount: expected };
  }
  if (payment.status === "refunded") {
    if (input.paymentStatus !== "paid" && input.paymentStatus !== "refunded") {
      return { action: "ignore", reason: "not_paid" };
    }
    if (input.paymentStatus === "refunded") return { action: "ignore", reason: "already_refunded" };
    return { action: "mark_refunded" };
  }
  if (payment.status === "rejected" || payment.status === "cancelled") {
    if (input.paymentStatus === "paid" || input.paymentStatus === "refunded") {
      return { action: "ignore", reason: "already_settled" };
    }
    if (input.paymentStatus === "failed") return { action: "ignore", reason: "already_failed" };
    return { action: "mark_failed" };
  }
  if (payment.status === "pending") {
    if (input.paymentStatus === "paid" || input.paymentStatus === "processing") {
      return { action: "ignore", reason: "in_progress" };
    }
    return { action: "mark_processing" };
  }
  return { action: "ignore", reason: "unknown_status" };
}
