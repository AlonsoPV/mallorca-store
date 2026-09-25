import { randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db, orderPaymentsTable, ordersTable } from "@workspace/db";
import { commitOrderReservations } from "../../inventory-hold.ts";
import { logger } from "../../logger.ts";
import { writeOrderAudit } from "../../order-audit.ts";
import { decideGatewayOutcome } from "./outcome.ts";
import { createMercadoPagoGateway } from "./mercado-pago.ts";
import { createPayPalGateway } from "./paypal.ts";
import {
  gatewayCodeForMethod,
  gatewayCredentialsReady,
  type CheckoutSession,
  type GatewayCode,
  type GatewayCredentials,
  type GatewayWebhookRequest,
  type PaymentGateway,
} from "./types.ts";
import { PaymentGatewayError } from "./types.ts";

const gateways: Record<GatewayCode, PaymentGateway> = {
  MERCADO_PAGO: createMercadoPagoGateway(),
  PAYPAL: createPayPalGateway(),
};

export function getPaymentGateway(code: GatewayCode): PaymentGateway {
  return gateways[code];
}

function storefrontReturnUrls(base: string, orderId: string, token: string) {
  const root = `${base.replace(/\/$/, "")}/pedido/${orderId}/${token}`;
  return {
    returnUrl: `${root}?pago=ok`,
    pendingUrl: `${root}?pago=pendiente`,
    cancelUrl: `${root}?pago=cancelado`,
  };
}

function notificationUrl(apiBase: string, provider: GatewayCode): string | null {
  try {
    const url = new URL(apiBase);
    if (url.protocol !== "https:") return null;
    const path = provider === "PAYPAL" ? "paypal" : "mercado-pago";
    return `${apiBase.replace(/\/$/, "")}/api/webhooks/payments/${path}`;
  } catch {
    return null;
  }
}

export async function startGatewayCheckout(input: {
  orderId: string;
  storefrontBase: string;
  apiBase: string;
  credentials: GatewayCredentials;
}): Promise<CheckoutSession> {
  if (!gatewayCredentialsReady(input.credentials)) {
    throw new PaymentGatewayError(
      "PAYMENT_PROVIDER_NOT_CONFIGURED",
      "Payment provider is not configured",
      503,
    );
  }
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, input.orderId))
      .for("update");
    if (!order) throw new PaymentGatewayError("ORDER_NOT_FOUND", "Order not found", 404);
    const provider = gatewayCodeForMethod(order.paymentMethod);
    if (!provider || provider !== input.credentials.provider) {
      throw new PaymentGatewayError(
        "PAYMENT_METHOD_NOT_ONLINE",
        "This order does not use an online payment provider",
        400,
      );
    }
    if (order.paymentStatus === "paid") {
      throw new PaymentGatewayError("PAYMENT_ALREADY_RECORDED", "Payment already recorded", 409);
    }
    const [payment] = await tx
      .select()
      .from(orderPaymentsTable)
      .where(eq(orderPaymentsTable.orderId, order.id))
      .orderBy(desc(orderPaymentsTable.id))
      .limit(1);
    if (
      order.paymentStatus === "processing" &&
      order.paymentLinkUrl &&
      payment?.provider === provider &&
      payment.providerCheckoutId
    ) {
      return {
        provider,
        redirectUrl: order.paymentLinkUrl,
        providerReference: payment.providerCheckoutId,
        mode: "redirect" as const,
      };
    }
    const urls = storefrontReturnUrls(input.storefrontBase, order.id, order.guestAccessToken);
    const session = await getPaymentGateway(provider).createCheckout(input.credentials, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      invoiceId: `${order.id}-${randomBytes(3).toString("hex")}`,
      amount: order.total,
      currency: "MXN",
      description: `Pedido ${order.orderNumber}`,
      payerEmail: order.customerEmail,
      notificationUrl: notificationUrl(input.apiBase, provider),
      ...urls,
    });
    const now = new Date();
    await tx
      .update(ordersTable)
      .set({
        paymentStatus: "processing",
        paymentLinkUrl: session.redirectUrl,
      })
      .where(eq(ordersTable.id, order.id));
    if (payment) {
      await tx
        .update(orderPaymentsTable)
        .set({
          provider,
          status: "processing",
          providerCheckoutId: session.providerReference,
          providerPaymentId: session.providerReference,
        })
        .where(eq(orderPaymentsTable.id, payment.id));
    } else {
      await tx.insert(orderPaymentsTable).values({
        orderId: order.id,
        method: order.paymentMethod ?? provider,
        provider,
        amount: order.total,
        currency: "MXN",
        status: "processing",
        providerCheckoutId: session.providerReference,
        providerPaymentId: session.providerReference,
      });
    }
    await writeOrderAudit({
      tx,
      orderId: order.id,
      action: "PAYMENT_GATEWAY_STARTED",
      payload: { provider, providerReference: session.providerReference },
    });
    return session;
  });
}

export async function applyGatewayWebhook(input: {
  provider: GatewayCode;
  credentials: GatewayCredentials;
  request: GatewayWebhookRequest;
}): Promise<{ applied: boolean; reason: string }> {
  const gateway = getPaymentGateway(input.provider);
  const verified = await gateway.verifyWebhook(input.credentials, input.request);
  if (!verified) {
    throw new PaymentGatewayError("PAYMENT_WEBHOOK_INVALID", "Invalid payment webhook", 401);
  }
  const event = gateway.parseWebhook(input.request);
  if (event.kind === "ignored") return { applied: false, reason: "ignored" };
  const payment = await gateway.fetchPayment(input.credentials, event.lookupId);
  const orderId = payment.externalReference ?? event.externalReference;
  if (!orderId) return { applied: false, reason: "missing_order" };

  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId)).for("update");
    if (!order) return { applied: false, reason: "order_not_found" };
    const methodProvider = gatewayCodeForMethod(order.paymentMethod);
    if (methodProvider !== input.provider) return { applied: false, reason: "provider_mismatch" };
    const outcome = decideGatewayOutcome({
      orderTotal: order.total,
      paymentStatus: order.paymentStatus,
      payment,
    });
    if (outcome.action === "ignore") {
      if (outcome.reason === "amount" || outcome.reason === "currency") {
        logger.warn(
          { orderId: order.id, provider: input.provider, reason: outcome.reason },
          "payment gateway confirmation ignored",
        );
      }
      return { applied: false, reason: outcome.reason };
    }
    const now = new Date();
    const [existing] = await tx
      .select()
      .from(orderPaymentsTable)
      .where(eq(orderPaymentsTable.orderId, order.id))
      .orderBy(desc(orderPaymentsTable.id))
      .limit(1);

    if (outcome.action === "mark_paid") {
      if (!order.inventoryCommittedAt) {
        await commitOrderReservations(tx, order.id, null);
      }
      await tx
        .update(ordersTable)
        .set({
          paymentStatus: "paid",
          status: order.status === "pending_payment" ? "paid" : order.status,
          amountPaid: outcome.amount,
          paidAt: now,
          paymentReference: payment.providerPaymentId,
          inventoryCommittedAt: order.inventoryCommittedAt ?? now,
        })
        .where(eq(ordersTable.id, order.id));
    } else if (outcome.action === "mark_failed") {
      await tx
        .update(ordersTable)
        .set({ paymentStatus: "failed", paymentLinkUrl: null })
        .where(eq(ordersTable.id, order.id));
    } else if (outcome.action === "mark_processing") {
      await tx
        .update(ordersTable)
        .set({ paymentStatus: "processing" })
        .where(eq(ordersTable.id, order.id));
    } else if (outcome.action === "mark_refunded") {
      await tx
        .update(ordersTable)
        .set({ paymentStatus: "refunded" })
        .where(eq(ordersTable.id, order.id));
    }

    const nextStatus =
      outcome.action === "mark_paid"
        ? "paid"
        : outcome.action === "mark_failed"
          ? "failed"
          : outcome.action === "mark_refunded"
            ? "refunded"
            : "processing";
    if (existing) {
      await tx
        .update(orderPaymentsTable)
        .set({
          provider: input.provider,
          status: nextStatus,
          providerPaymentId: payment.providerPaymentId,
          providerCheckoutId: payment.checkoutId || existing.providerCheckoutId,
          paidAt: outcome.action === "mark_paid" ? now : existing.paidAt,
          amount: outcome.action === "mark_paid" ? outcome.amount : existing.amount,
        })
        .where(eq(orderPaymentsTable.id, existing.id));
    }
    await writeOrderAudit({
      tx,
      orderId: order.id,
      action: "PAYMENT_RECORDED",
      payload: {
        provider: input.provider,
        source: "webhook",
        outcome: outcome.action,
        providerPaymentId: payment.providerPaymentId,
        rawStatus: payment.rawStatus,
      },
    });
    logger.info(
      { orderId: order.id, provider: input.provider, outcome: outcome.action },
      "payment gateway webhook applied",
    );
    return { applied: true, reason: outcome.action };
  });
}
