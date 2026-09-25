import { amountsMatch } from "./http.ts";
import type { GatewayPayment } from "./types.ts";

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
    const currency = payment.currency?.toUpperCase() ?? "";
    if (currency !== "MXN") return { action: "ignore", reason: "currency" };
    if (payment.amount == null || !amountsMatch(input.orderTotal, payment.amount)) {
      return { action: "ignore", reason: "amount" };
    }
    return { action: "mark_paid", amount: input.orderTotal };
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
