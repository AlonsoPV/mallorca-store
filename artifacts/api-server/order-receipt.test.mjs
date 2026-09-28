import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  canRetryOnlinePayment,
  money,
  purchaseResult,
  receiptSnapshot,
  selectBranchEmail,
  scheduleLabel,
} from "../../lib/purchase-result.mjs";
import { buildReceiptPdf, buildOrderEmail } from "./order-receipt.mjs";
const order = {
  id: "receipt-test",
  orderNumber: "M-PRUEBA-001",
  status: "confirmed",
  paymentStatus: "unpaid",
  paymentMethod: "CASH_ON_PICKUP",
  amountPaid: 0,
  fulfillmentMethod: "pickup",
  scheduledStart: "2026-09-25T17:30:00Z",
  createdAt: "2026-09-22T15:00:00Z",
  customerName: "María Pérez",
  customerEmail: "cliente@example.com",
  customerPhone: "5550000000",
  subtotal: 790,
  discountAmount: 50,
  couponDiscount: 20,
  deliveryFee: 0,
  total: 720,
  items: [
    {
      name: "Pastel de chocolate",
      variantLabel: "Mediano",
      quantity: 1,
      unitPrice: 680,
      lineTotal: 680,
    },
    {
      name: "Croissant de mantequilla",
      quantity: 2,
      unitPrice: 55,
      lineTotal: 110,
    },
  ],
  internalNotes: "DO NOT EXPOSE",
  productionNotes: "PRIVATE",
  guestAccessToken: "PRIVATE_TOKEN",
};
const branch = {
  name: "Mallorca Lomas",
  address: "Av. Ejemplo 100, Ciudad de México",
  phone: "5550000001",
};

test("purchase result distinguishes paid, unpaid, processing, cancellation and refunds", () => {
  assert.equal(purchaseResult(order).balance, 720);
  assert.match(purchaseResult(order).message, /recoger/);
  assert.equal(purchaseResult({ ...order, paymentStatus: "paid" }).balance, 0);
  assert.equal(
    purchaseResult({ ...order, status: "cancelled", paymentStatus: "paid" })
      .title,
    "Pedido cancelado",
  );
  assert.equal(
    purchaseResult({ ...order, paymentStatus: "refunded" }).balance,
    0,
  );
  assert.equal(
    purchaseResult({
      ...order,
      paymentStatus: "partially_paid",
      amountPaid: 300,
    }).balance,
    420,
  );
  assert.match(
    purchaseResult({ ...order, paymentStatus: "processing" }).message,
    /proceso/,
  );
  assert.match(
    purchaseResult({ ...order, paymentMethod: "ONLINE" }).message,
    /pago en línea/,
  );
  assert.match(
    purchaseResult({ ...order, paymentMethod: "PAYPAL", paymentStatus: "failed" }).message,
    /intentarlo de nuevo/,
  );
  assert.match(
    purchaseResult({ ...order, paymentMethod: "TRANSFER" }).message,
    /completarlo/,
  );
  assert.equal(canRetryOnlinePayment({ ...order, paymentMethod: "PAYPAL", paymentStatus: "failed" }), true);
  assert.equal(canRetryOnlinePayment({ ...order, paymentMethod: "PAYPAL", paymentStatus: "paid" }), false);
  assert.equal(canRetryOnlinePayment(order), false);
  assert.match(scheduleLabel(order.scheduledStart), /11:30/);
});
test("branch recipient uses only assigned active responsibles and prefers primary", () => {
  const assigned = (email, role, isPrimary, active = true) => ({
    email,
    role,
    isPrimary,
    active,
    userId: email,
  });
  assert.equal(
    selectBranchEmail([
      assigned("inactive@example.com", "branch_manager", true, false),
      assigned("staff@example.com", "staff", false),
      assigned("manager@example.com", "branch_manager", false),
      assigned("primary@example.com", "staff", true),
    ]),
    "primary@example.com",
  );
  assert.equal(
    selectBranchEmail([assigned("staff@example.com", "staff", false)]),
    null,
  );
  assert.equal(selectBranchEmail([]), null);
});
test("receipt excludes private fields, renders valid PDFs and escapes email content", async () => {
  const snapshot = receiptSnapshot(order, branch);
  assert.equal(snapshot.internalNotes, undefined);
  assert.equal(snapshot.guestAccessToken, undefined);
  const pdf = await buildReceiptPdf(snapshot);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const email = await buildOrderEmail(
    { ...snapshot, customerName: '<img src=x onerror="alert(1)">' },
    "customer",
    "https://example.com/pedido/receipt-test/token",
  );
  assert.match(email.html, /&lt;img/);
  assert.ok(!email.html.includes("<img"));
  assert.ok(!email.html.includes("DO NOT EXPOSE"));
  assert.equal(email.attachments[0].content_type, "application/pdf");
  assert.ok(email.html.includes(money(order.total)));
  mkdirSync("tmp/pdfs", { recursive: true });
  writeFileSync("tmp/pdfs/comprobante-mallorca-prueba.pdf", pdf);
  const many = await buildReceiptPdf({
    ...snapshot,
    items: Array.from({ length: 45 }, (_, i) => ({
      ...order.items[0],
      name: `Artículo ${i + 1}: Pastel de chocolate con descripción extensa y presentación especial para compartir`,
    })),
  });
  writeFileSync("tmp/pdfs/comprobante-mallorca-multipagina.pdf", many);
});

test("Hostinger SMTP requires separate pedidos and sucursal mailboxes", async () => {
  const {
    HOSTINGER_SMTP_HOST,
    emailFromAddress,
    emailReplyTo,
    sendReceiptEmail,
    smtpConfigured,
    smtpTransportOptions,
  } = await import("./order-email-transport.mjs");
  const env = {
    SMTP_PEDIDOS_USER: "pedidos@pasteleriamallorca.mx",
    SMTP_PEDIDOS_PASS: "secret-pedidos",
    SMTP_SUCURSAL_USER: "sucursal@pasteleriamallorca.mx",
    SMTP_SUCURSAL_PASS: "secret-sucursal",
    ORDER_EMAIL_FROM: "Mallorca <pedidos@pasteleriamallorca.mx>",
    ORDER_EMAIL_FROM_BRANCH: "Mallorca Sucursal <sucursal@pasteleriamallorca.mx>",
    ORDER_EMAIL_REPLY_TO: "Mallorca <contacto@pasteleriamallorca.mx>",
  };
  assert.equal(smtpConfigured(env), true);
  assert.equal(smtpConfigured({ SMTP_PEDIDOS_USER: "pedidos@x.com", SMTP_PEDIDOS_PASS: "x" }), false);
  assert.equal(smtpConfigured({}), false);
  assert.deepEqual(smtpTransportOptions(env, "customer").auth, {
    user: "pedidos@pasteleriamallorca.mx",
    pass: "secret-pedidos",
  });
  assert.deepEqual(smtpTransportOptions(env, "branch").auth, {
    user: "sucursal@pasteleriamallorca.mx",
    pass: "secret-sucursal",
  });
  assert.equal(smtpTransportOptions(env, "customer").host, HOSTINGER_SMTP_HOST);
  assert.equal(emailFromAddress("customer", env), "Mallorca <pedidos@pasteleriamallorca.mx>");
  assert.equal(
    emailFromAddress("branch", env),
    "Mallorca Sucursal <sucursal@pasteleriamallorca.mx>",
  );
  assert.equal(emailReplyTo("customer", env), "Mallorca <contacto@pasteleriamallorca.mx>");

  const sent = [];
  const payload = {
    from: emailFromAddress("branch", env),
    to: ["gerente@example.com"],
    subject: "Nuevo pedido",
    html: "<p>Hola</p>",
    attachments: [{ filename: "c.pdf", content: "AAA=", content_type: "application/pdf" }],
  };
  const id = await sendReceiptEmail(payload, "job-smtp", {
    env,
    audience: "branch",
    transporter: {
      sendMail: async (message) => {
        sent.push(message);
        return { messageId: "<job-smtp@smtp.hostinger.com>" };
      },
    },
  });
  assert.equal(id, "<job-smtp@smtp.hostinger.com>");
  assert.equal(sent[0].from, payload.from);
  assert.equal(sent[0].messageId, "<order-receipt.job-smtp@hostinger>");
  assert.equal(sent[0].attachments[0].contentType, "application/pdf");
  assert.equal(sent[0].attachments[0].encoding, "base64");
  await assert.rejects(
    sendReceiptEmail(payload, "job-smtp", {
      env,
      audience: "branch",
      transporter: {
        sendMail: async () => {
          const error = new Error("Invalid login");
          error.code = "EAUTH";
          throw error;
        },
      },
    }),
    /EMAIL_PROVIDER_AUTH/,
  );
});

test("email transport preserves Resend idempotency keys on retry and rejects failed sends", async () => {
  const { sendReceiptEmail } = await import("./order-email-transport.mjs");
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, ...options });
    return { ok: true, json: async () => ({ id: "provider-test" }) };
  };
  const payload = { to: ["cliente@example.com"], subject: "Comprobante" };
  const resend = { env: {}, apiKey: "test-key", fetcher };
  assert.equal(await sendReceiptEmail(payload, "job-1", resend), "provider-test");
  await sendReceiptEmail(payload, "job-1", resend);
  assert.equal(
    requests[0].headers["Idempotency-Key"],
    requests[1].headers["Idempotency-Key"],
  );
  assert.equal(requests[0].body, requests[1].body);
  await assert.rejects(
    sendReceiptEmail(payload, "job-1", {
      env: {},
      apiKey: "test-key",
      fetcher: async () => ({ ok: false, status: 503 }),
    }),
    /EMAIL_PROVIDER_HTTP_503/,
  );
  await assert.rejects(
    sendReceiptEmail(payload, "job-1", { env: {} }),
    /NOT_CONFIGURED/,
  );
});
