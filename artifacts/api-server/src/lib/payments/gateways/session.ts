import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, orderPaymentsTable, ordersTable, paymentEventsTable } from "@workspace/db";
import { commitOrderReservations, releaseOrderReservations } from "../../inventory-hold.ts";
import { logger } from "../../logger.ts";
import { writeOrderAudit } from "../../order-audit.ts";
import { decideGatewayOutcome } from "./outcome.ts";
import { createMercadoPagoGateway } from "./mercado-pago.ts";
import { createPayPalGateway } from "./paypal.ts";
import { enforceSandboxCredentials } from "../sandbox-lock.ts";
import { webhookEventInsertResult, webhookEventKey } from "./webhook-event.ts";
import {
  gatewayCodeForMethod,
  gatewayCredentialsReady,
  type CheckoutSession,
  type GatewayCode,
  type GatewayCredentials,
  type GatewayPayment,
  type GatewayWebhookRequest,
  type PaymentGateway,
} from "./types.ts";
import { PaymentGatewayError } from "./types.ts";
import { pgCode } from "../../pg-code.ts";

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

async function safeAudit(
  params: Parameters<typeof writeOrderAudit>[0],
): Promise<void> {
  try {
    await writeOrderAudit(params);
  } catch (error) {
    logger.warn(
      { orderId: params.orderId, action: params.action, pgCode: pgCode(error) },
      "order audit write failed",
    );
  }
}

type ExistingCheckout = {
  order: typeof ordersTable.$inferSelect;
  payment: typeof orderPaymentsTable.$inferSelect | undefined;
  session: CheckoutSession | null;
};

async function loadCheckoutLock(
  orderId: string,
  provider: GatewayCode,
): Promise<ExistingCheckout> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId)).for("update");
    if (!order) throw new PaymentGatewayError("ORDER_NOT_FOUND", "Order not found", 404);
    const methodProvider = gatewayCodeForMethod(order.paymentMethod);
    if (!methodProvider || methodProvider !== provider) {
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
        order,
        payment,
        session: {
          provider,
          redirectUrl: order.paymentLinkUrl,
          providerReference: payment.providerCheckoutId,
          mode: "redirect" as const,
        },
      };
    }
    return { order, payment, session: null };
  });
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
  const credentials = enforceSandboxCredentials(input.credentials);
  const provider = credentials.provider;
  const locked = await loadCheckoutLock(input.orderId, provider);
  if (locked.session) {
    logger.info(
      {
        orderId: locked.order.id,
        provider,
        paypalOrderId: locked.session.providerReference,
        stage: "checkout_reuse",
      },
      "payment checkout reused",
    );
    return locked.session;
  }
  const urls = storefrontReturnUrls(input.storefrontBase, locked.order.id, locked.order.guestAccessToken);
  logger.info(
    {
      orderId: locked.order.id,
      provider,
      stage: "checkout_create",
      amount: locked.order.total,
      currency: "MXN",
    },
    "payment checkout creating",
  );
  const session = await getPaymentGateway(provider).createCheckout(credentials, {
    orderId: locked.order.id,
    orderNumber: locked.order.orderNumber,
    invoiceId: `${locked.order.id}-${randomBytes(3).toString("hex")}`,
    amount: locked.order.total,
    currency: "MXN",
    description: `Pedido ${locked.order.orderNumber}`,
    payerEmail: locked.order.customerEmail,
    notificationUrl: notificationUrl(input.apiBase, provider),
    ...urls,
  });
  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, locked.order.id)).for("update");
    if (!order) throw new PaymentGatewayError("ORDER_NOT_FOUND", "Order not found", 404);
    if (order.paymentStatus === "paid") {
      throw new PaymentGatewayError("PAYMENT_ALREADY_RECORDED", "Payment already recorded", 409);
    }
    const [payment] = await tx
      .select()
      .from(orderPaymentsTable)
      .where(eq(orderPaymentsTable.orderId, order.id))
      .orderBy(desc(orderPaymentsTable.id))
      .limit(1);
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
    await safeAudit({
      tx,
      orderId: order.id,
      action: "PAYMENT_GATEWAY_STARTED",
      payload: { provider, providerReference: session.providerReference },
    });
  });
  logger.info(
    {
      orderId: locked.order.id,
      provider,
      paypalOrderId: session.providerReference,
      stage: "checkout_created",
    },
    "payment checkout created",
  );
  return session;
}

async function rememberPaymentEvent(
  tx: any,
  input: {
    provider: GatewayCode;
    eventKey: string;
    orderId: string;
    lookupId: string;
    rawStatus: string;
  },
): Promise<"applied" | "duplicate_event"> {
  try {
    const inserted = await tx
      .insert(paymentEventsTable)
      .values({
        provider: input.provider,
        eventKey: input.eventKey,
        orderId: input.orderId,
        outcome: "received",
        payload: {
          lookupId: input.lookupId,
          rawStatus: input.rawStatus,
        },
      })
      .onConflictDoNothing({
        target: [paymentEventsTable.provider, paymentEventsTable.eventKey],
      })
      .returning({ id: paymentEventsTable.id });
    return webhookEventInsertResult(inserted.length);
  } catch (error) {
    if (pgCode(error) === "23505") return "duplicate_event";
    logger.warn(
      { provider: input.provider, eventKey: input.eventKey, pgCode: pgCode(error) },
      "payment_events persist failed",
    );
    return "applied";
  }
}

async function settleFetchedPayment(input: {
  provider: GatewayCode;
  payment: GatewayPayment;
  orderId: string;
  eventKey: string | null;
  lookupId: string;
  source: "webhook" | "return";
}): Promise<{ applied: boolean; reason: string; paymentStatus?: string }> {
  return db.transaction(async (tx) => {
    if (input.eventKey) {
      const remembered = await rememberPaymentEvent(tx, {
        provider: input.provider,
        eventKey: input.eventKey,
        orderId: input.orderId,
        lookupId: input.lookupId,
        rawStatus: input.payment.rawStatus,
      });
      if (remembered === "duplicate_event") {
        return { applied: false, reason: "duplicate_event" };
      }
    }
    const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, input.orderId)).for("update");
    if (!order) return { applied: false, reason: "order_not_found" };
    const methodProvider = gatewayCodeForMethod(order.paymentMethod);
    if (methodProvider !== input.provider) return { applied: false, reason: "provider_mismatch" };
    const outcome = decideGatewayOutcome({
      orderTotal: order.total,
      paymentStatus: order.paymentStatus,
      payment: input.payment,
    });
    if (outcome.action === "ignore") {
      if (outcome.reason === "amount" || outcome.reason === "currency") {
        logger.warn(
          {
            orderId: order.id,
            provider: input.provider,
            reason: outcome.reason,
            paypalOrderId: input.payment.checkoutId,
            stage: "settle_ignored",
          },
          "payment gateway confirmation ignored",
        );
      }
      return { applied: false, reason: outcome.reason, paymentStatus: order.paymentStatus };
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
          paymentReference: input.payment.providerPaymentId,
          inventoryCommittedAt: order.inventoryCommittedAt ?? now,
        })
        .where(eq(ordersTable.id, order.id));
    } else if (outcome.action === "mark_failed") {
      await releaseOrderReservations(tx, order.id, "payment_failed");
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
          providerPaymentId: input.payment.providerPaymentId,
          providerCheckoutId: input.payment.checkoutId || existing.providerCheckoutId,
          paidAt: outcome.action === "mark_paid" ? now : existing.paidAt,
          amount: outcome.action === "mark_paid" ? outcome.amount : existing.amount,
        })
        .where(eq(orderPaymentsTable.id, existing.id));
    }
    if (input.eventKey) {
      try {
        await tx
          .update(paymentEventsTable)
          .set({
            orderId: order.id,
            outcome: outcome.action,
            payload: {
              lookupId: input.lookupId,
              rawStatus: input.payment.rawStatus,
              providerPaymentId: input.payment.providerPaymentId,
            },
          })
          .where(
            and(
              eq(paymentEventsTable.provider, input.provider),
              eq(paymentEventsTable.eventKey, input.eventKey),
            ),
          );
      } catch (error) {
        logger.warn({ orderId: order.id, pgCode: pgCode(error) }, "payment_events update failed");
      }
    }
    await safeAudit({
      tx,
      orderId: order.id,
      action: "PAYMENT_RECORDED",
      payload: {
        provider: input.provider,
        source: input.source,
        outcome: outcome.action,
        providerPaymentId: input.payment.providerPaymentId,
        paypalOrderId: input.payment.checkoutId,
        rawStatus: input.payment.rawStatus,
      },
    });
    logger.info(
      {
        orderId: order.id,
        provider: input.provider,
        outcome: outcome.action,
        paypalOrderId: input.payment.checkoutId,
        captureId: input.payment.providerPaymentId,
        stage: "settle",
        source: input.source,
      },
      "payment gateway settled",
    );
    return { applied: true, reason: outcome.action, paymentStatus: nextStatus };
  });
}

export async function applyGatewayWebhook(input: {
  provider: GatewayCode;
  credentials: GatewayCredentials;
  request: GatewayWebhookRequest;
}): Promise<{ applied: boolean; reason: string }> {
  const credentials = enforceSandboxCredentials(input.credentials);
  const gateway = getPaymentGateway(input.provider);
  const verified = await gateway.verifyWebhook(credentials, input.request);
  if (!verified) {
    logger.warn({ provider: input.provider, stage: "webhook_verify" }, "payment webhook rejected");
    throw new PaymentGatewayError("PAYMENT_WEBHOOK_INVALID", "Invalid payment webhook", 401);
  }
  const event = gateway.parseWebhook(input.request);
  if (event.kind === "ignored") return { applied: false, reason: "ignored" };
  const eventKey = webhookEventKey(input.provider, input.request);
  logger.info(
    {
      provider: input.provider,
      lookupId: event.lookupId,
      eventKey,
      stage: "webhook_fetch",
    },
    "payment webhook accepted",
  );
  const payment = await gateway.fetchPayment(credentials, event.lookupId);
  const orderId = payment.externalReference ?? event.externalReference;
  if (!orderId) return { applied: false, reason: "missing_order" };
  return settleFetchedPayment({
    provider: input.provider,
    payment,
    orderId,
    eventKey,
    lookupId: event.lookupId,
    source: "webhook",
  });
}

export async function reconcileGatewayPayment(input: {
  orderId: string;
  credentials: GatewayCredentials;
}): Promise<{ applied: boolean; reason: string; paymentStatus: string }> {
  const credentials = enforceSandboxCredentials(input.credentials);
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, input.orderId));
  if (!order) throw new PaymentGatewayError("ORDER_NOT_FOUND", "Order not found", 404);
  const provider = gatewayCodeForMethod(order.paymentMethod);
  if (!provider || provider !== credentials.provider) {
    throw new PaymentGatewayError(
      "PAYMENT_METHOD_NOT_ONLINE",
      "This order does not use an online payment provider",
      400,
    );
  }
  if (order.paymentStatus === "paid") {
    return { applied: false, reason: "already_paid", paymentStatus: "paid" };
  }
  const [row] = await db
    .select()
    .from(orderPaymentsTable)
    .where(eq(orderPaymentsTable.orderId, order.id))
    .orderBy(desc(orderPaymentsTable.id))
    .limit(1);
  const lookupId = row?.providerCheckoutId?.trim();
  if (!lookupId) {
    return { applied: false, reason: "missing_checkout", paymentStatus: order.paymentStatus };
  }
  logger.info(
    {
      orderId: order.id,
      provider,
      paypalOrderId: lookupId,
      stage: "return_reconcile",
    },
    "payment return reconciling",
  );
  const payment = await getPaymentGateway(provider).fetchPayment(credentials, lookupId);
  const orderId = payment.externalReference || order.id;
  if (orderId !== order.id) {
    logger.warn(
      { orderId: order.id, externalReference: payment.externalReference, stage: "return_reconcile" },
      "payment return reference mismatch",
    );
    return { applied: false, reason: "reference_mismatch", paymentStatus: order.paymentStatus };
  }
  const result = await settleFetchedPayment({
    provider,
    payment,
    orderId: order.id,
    eventKey: `return:${order.id}:${lookupId}`,
    lookupId,
    source: "return",
  });
  return {
    applied: result.applied,
    reason: result.reason,
    paymentStatus: result.paymentStatus ?? order.paymentStatus,
  };
}
