import type { StorefrontPaymentMethod } from "./types.ts";

export type OrderPaymentCreateInput = {
  orderSource: string;
  fulfillmentMethod: "pickup" | "delivery";
  paymentMethod?: StorefrontPaymentMethod | null;
  markPaid?: boolean;
  amountPaid?: number | null;
  total: number;
};

export type OrderPaymentCreateState = {
  paymentMethod: StorefrontPaymentMethod;
  status: "pending_payment" | "confirmed" | "paid";
  paymentStatus: "unpaid" | "paid";
  amountPaid: number;
  immediatePaid: boolean;
  skipTtlCancel: boolean;
  writePendingPaymentRow: boolean;
};

const AUTO_PAID = new Set(["CASH", "TERMINAL", "COURTESY"]);
const DEFERRED_PAYMENT = new Set([
  "PENDING",
  "ONLINE",
  "PAYMENT_LINK",
  "CASH_ON_PICKUP",
  "MERCADO_PAGO",
  "PAYPAL",
]);

export function resolveCreateOrderPaymentState(
  input: OrderPaymentCreateInput,
): OrderPaymentCreateState {
  if (input.paymentMethod === "CASH_ON_PICKUP" && input.fulfillmentMethod !== "pickup") {
    const error = new Error("CASH_ON_PICKUP is only available for pickup");
    (error as Error & { status: number; code: string }).status = 400;
    (error as Error & { status: number; code: string }).code = "PAYMENT_METHOD_NOT_ALLOWED";
    throw error;
  }

  const paymentMethod: StorefrontPaymentMethod =
    input.paymentMethod ??
    (input.orderSource === "STOREFRONT"
      ? input.fulfillmentMethod === "pickup"
        ? "CASH_ON_PICKUP"
        : "PENDING"
      : "PENDING");

  const autoPaid =
    input.orderSource !== "STOREFRONT" &&
    !DEFERRED_PAYMENT.has(paymentMethod) &&
    (input.markPaid === true || (input.markPaid !== false && AUTO_PAID.has(paymentMethod)));

  const immediatePaid = Boolean(input.markPaid === true || autoPaid);

  if (paymentMethod === "CASH_ON_PICKUP") {
    return {
      paymentMethod,
      status: "confirmed",
      paymentStatus: immediatePaid ? "paid" : "unpaid",
      amountPaid: immediatePaid ? (input.amountPaid != null ? input.amountPaid : input.total) : (input.amountPaid ?? 0),
      immediatePaid,
      skipTtlCancel: !immediatePaid,
      writePendingPaymentRow: !immediatePaid,
    };
  }

  return {
    paymentMethod,
    status: immediatePaid ? "paid" : "pending_payment",
    paymentStatus: immediatePaid ? "paid" : "unpaid",
    amountPaid: immediatePaid
      ? (input.amountPaid != null ? input.amountPaid : input.total)
      : (input.amountPaid ?? 0),
    immediatePaid,
    skipTtlCancel: false,
    writePendingPaymentRow: paymentMethod === "PENDING" && input.orderSource === "STOREFRONT",
  };
}

export type RecordPaymentInput = {
  paymentStatus: string;
  orderStatus: string;
  total: number;
  amountPaid: number;
  markPaid?: boolean;
  recordedAmount?: number | null;
};

export type RecordPaymentDecision =
  | { ok: false; status: number; code: string; error: string }
  | {
      ok: true;
      paymentStatus: "paid" | "partially_paid";
      amountPaid: number;
      orderStatus: string;
      commitInventory: boolean;
      paidAt: boolean;
    };

export function decideRecordPayment(input: RecordPaymentInput): RecordPaymentDecision {
  if (input.paymentStatus === "paid") {
    return { ok: false, status: 409, code: "PAYMENT_ALREADY_RECORDED", error: "Payment already recorded" };
  }
  const markPaid = input.markPaid !== false;
  const amountPaid = input.recordedAmount ?? (markPaid ? input.total : input.amountPaid);
  if (!Number.isFinite(amountPaid) || amountPaid < 0) {
    return { ok: false, status: 400, code: "INVALID_AMOUNT", error: "Invalid payment amount" };
  }
  const paymentStatus = markPaid
    ? (amountPaid + 1e-9 < input.total ? "partially_paid" : "paid")
    : (input.paymentStatus as "paid" | "partially_paid");
  const keepStatus = ["confirmed", "preparing", "ready", "completed"].includes(input.orderStatus);
  const orderStatus =
    markPaid && input.orderStatus === "pending_payment" && paymentStatus === "paid"
      ? "paid"
      : keepStatus
        ? input.orderStatus
        : input.orderStatus;
  return {
    ok: true,
    paymentStatus: paymentStatus as "paid" | "partially_paid",
    amountPaid,
    orderStatus,
    commitInventory: markPaid && paymentStatus === "paid" && input.paymentStatus !== "paid",
    paidAt: paymentStatus === "paid",
  };
}

export type CancelPaymentDecision = {
  orderStatus: "cancelled";
  paymentStatus: "cancelled" | "paid" | "refunded";
  refund: boolean;
  releaseHolds: boolean;
};

export function decideCancelPayment(input: {
  paymentStatus: string;
  paymentMethod?: string | null;
}): CancelPaymentDecision {
  const unpaid = input.paymentStatus === "unpaid" || input.paymentStatus === "processing";
  return {
    orderStatus: "cancelled",
    paymentStatus: unpaid ? "cancelled" : (input.paymentStatus as "paid" | "refunded"),
    refund: false,
    releaseHolds: true,
  };
}

export function decideCompleteUnpaid(input: {
  paymentStatus: string;
  confirmUnpaidComplete?: boolean;
  canOverride: boolean;
  reason?: string | null;
}): { ok: true } | { ok: false; status: number; code: string; error: string } {
  const unpaid = input.paymentStatus !== "paid" && input.paymentStatus !== "cancelled";
  if (!unpaid) return { ok: true };
  if (!input.confirmUnpaidComplete) {
    return {
      ok: false,
      status: 409,
      code: "UNPAID_ON_COMPLETE",
      error: "Order is still unpaid",
    };
  }
  if (!input.canOverride) {
    return { ok: false, status: 403, code: "FORBIDDEN_OVERRIDE", error: "Override not allowed" };
  }
  if (!input.reason?.trim()) {
    return { ok: false, status: 400, code: "REASON_REQUIRED", error: "Override reason required" };
  }
  return { ok: true };
}
