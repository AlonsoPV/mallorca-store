import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import {
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
    /completarlo/,
  );
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

test("email transport preserves idempotency keys on retry and rejects failed sends", async () => {
  const { sendReceiptEmail } = await import("./order-email-transport.mjs");
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url, ...options });
    return { ok: true, json: async () => ({ id: "provider-test" }) };
  };
  const payload = { to: ["cliente@example.com"], subject: "Comprobante" };
  assert.equal(
    await sendReceiptEmail(payload, "job-1", { apiKey: "test-key", fetcher }),
    "provider-test",
  );
  await sendReceiptEmail(payload, "job-1", { apiKey: "test-key", fetcher });
  assert.equal(
    requests[0].headers["Idempotency-Key"],
    requests[1].headers["Idempotency-Key"],
  );
  assert.equal(requests[0].body, requests[1].body);
  await assert.rejects(
    sendReceiptEmail(payload, "job-1", {
      apiKey: "test-key",
      fetcher: async () => ({ ok: false, status: 503 }),
    }),
    /EMAIL_PROVIDER_HTTP_503/,
  );
  await assert.rejects(
    sendReceiptEmail(payload, "job-1", {}),
    /NOT_CONFIGURED/,
  );
});
