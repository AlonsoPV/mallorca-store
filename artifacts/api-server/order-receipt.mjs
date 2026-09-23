import PDFDocument from "pdfkit";
import {
  money,
  purchaseResult,
  scheduleLabel,
  paymentLabels,
  statusLabels,
  escapeHtml,
} from "../../lib/purchase-result.mjs";

export function receiptFilename(order) {
  return `Mallorca-${String(order.orderNumber).replace(/[^a-zA-Z0-9_-]/g, "") || "pedido"}.pdf`;
}
export function buildReceiptPdf(order) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      bufferPages: true,
      info: {
        Title: `Comprobante ${order.orderNumber}`,
        Author: "Mallorca",
        CreationDate: new Date(order.createdAt || "2026-01-01"),
      },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const width = 499;
    const ink = "#362521",
      wine = "#713645";
    const text = (value) => String(value ?? "").replace(/[\r\n]+/g, " ");
    const room = (height) => {
      if (doc.y + height > 745) doc.addPage();
    };
    const section = (label) => {
      room(48);
      doc
        .moveDown(0.8)
        .font("Helvetica-Bold")
        .fontSize(11)
        .fillColor(wine)
        .text(label.toUpperCase(), 48, doc.y, { width });
      doc.moveDown(0.5).fillColor(ink).font("Helvetica").fontSize(10);
    };
    const line = (label, value) => {
      room(40);
      doc.font("Helvetica-Bold").text(`${label}: `, { continued: true });
      doc.font("Helvetica").text(text(value), { width });
      doc.moveDown(0.3);
    };
    doc.fillColor(wine).font("Times-Bold").fontSize(30).text("MALLORCA");
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor(ink)
      .text("COMPROBANTE DE PEDIDO", { characterSpacing: 1.2 });
    doc
      .moveDown()
      .font("Helvetica-Bold")
      .fontSize(17)
      .text(`Pedido #${text(order.orderNumber)}`);
    const result = purchaseResult(order);
    doc
      .moveDown(0.4)
      .font("Helvetica")
      .fontSize(10)
      .text(result.message, { width });
    section("Tu compra");
    line("Pedido", statusLabels[order.status] || order.status);
    line(
      "Pago",
      `${result.paymentStatus} - ${paymentLabels[order.paymentMethod] || "Por confirmar"}`,
    );
    line("Fecha de compra", scheduleLabel(order.createdAt));
    section(
      order.fulfillmentMethod === "delivery"
        ? "Entrega a domicilio"
        : "Recolección en sucursal",
    );
    line("Sucursal", order.branchName);
    line("Horario (Ciudad de México)", scheduleLabel(order.scheduledStart));
    line(
      order.fulfillmentMethod === "delivery"
        ? "Dirección de entrega"
        : "Dirección",
      order.fulfillmentMethod === "delivery"
        ? order.deliveryAddress
        : order.branchAddress,
    );
    if (order.branchPhone) line("Teléfono sucursal", order.branchPhone);
    section("Cliente");
    line("Nombre", order.customerName);
    line("Correo", order.customerEmail);
    line("Teléfono", order.customerPhone);
    section("Artículos");
    for (const item of order.items) {
      const label = `${item.quantity} x ${text(item.name)}${item.variantLabel ? ` (${text(item.variantLabel)})` : ""}`;
      doc.font("Helvetica").fontSize(10);
      const height = Math.max(
        30,
        doc.heightOfString(label, { width: 360 }) + 18,
      );
      room(height);
      const y = doc.y;
      doc.text(label, 48, y, { width: 360 });
      doc.text(money(item.lineTotal), 423, y, { width: 124, align: "right" });
      doc.y = y + height;
      doc
        .moveTo(48, doc.y - 7)
        .lineTo(547, doc.y - 7)
        .strokeColor("#e6ded8")
        .stroke();
    }
    room(150);
    section("Resumen");
    const totalLine = (label, value, bold = false) => {
      const y = doc.y;
      doc
        .font(bold ? "Helvetica-Bold" : "Helvetica")
        .fontSize(bold ? 12 : 10)
        .text(label, 48, y, { width: 350 });
      doc.text(money(value), 410, y, { width: 137, align: "right" });
      doc.y = y + 22;
    };
    totalLine("Subtotal", order.subtotal);
    if (order.discountAmount > 0) totalLine("Descuento", -order.discountAmount);
    if (order.couponDiscount > 0) totalLine("Cupón", -order.couponDiscount);
    totalLine("Envío", order.deliveryFee);
    totalLine("Total del pedido", order.total, true);
    totalLine("Saldo pendiente", result.balance);
    if (order.customerNotes) {
      section("Indicaciones del cliente");
      doc.text(text(order.customerNotes), 48, doc.y, { width });
    }
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor("#777777")
        .text(
          `Comprobante de pedido. No es factura fiscal. | ${i + 1} / ${range.count}`,
          48,
          780,
          { width, align: "center", lineBreak: false },
        );
    }
    doc.end();
  });
}
export async function buildOrderEmail(order, audience, orderUrl) {
  const e = escapeHtml;
  const result = purchaseResult(order);
  const title =
    audience === "branch"
      ? `Nuevo pedido #${order.orderNumber} - ${order.branchName}`
      : `Tu pedido #${order.orderNumber} en Mallorca`;
  const rows = order.items
    .map(
      (item) =>
        `<tr><td style="padding:10px;border-bottom:1px solid #eee">${e(item.quantity)} x ${e(item.name)}${item.variantLabel ? `<br><small>${e(item.variantLabel)}</small>` : ""}</td><td style="text-align:right;padding:10px">${e(money(item.lineTotal))}</td></tr>`,
    )
    .join("");
  const url = new URL(orderUrl);
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("INVALID_PUBLIC_URL");
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#362521"><h1 style="color:#713645">MALLORCA</h1><h2>${e(title)}</h2><p>${e(result.message)}</p><p><strong>Estado del pedido:</strong> ${e(statusLabels[order.status] || order.status)}<br><strong>Pago:</strong> ${e(result.paymentStatus)}<br><strong>Cliente:</strong> ${e(order.customerName)}<br><strong>Sucursal:</strong> ${e(order.branchName)}<br><strong>${order.fulfillmentMethod === "delivery" ? "Entrega" : "Recolección"}:</strong> ${e(scheduleLabel(order.scheduledStart))} (Ciudad de México)<br><strong>Dirección:</strong> ${e(order.fulfillmentMethod === "delivery" ? order.deliveryAddress : order.branchAddress)}</p><table style="width:100%;border-collapse:collapse">${rows}</table><p>Subtotal: ${e(money(order.subtotal))}<br>Descuentos: ${e(money(Number(order.discountAmount || 0) + Number(order.couponDiscount || 0)))}<br>Envío: ${e(money(order.deliveryFee))}</p><h3>Total: ${e(money(order.total))}</h3><p>Saldo pendiente: ${e(money(result.balance))}</p>${audience === "branch" ? `<p>Contacto del cliente: ${e(order.customerEmail)} / ${e(order.customerPhone)}</p>` : ""}<p><a href="${e(url.toString())}" style="display:inline-block;background:#713645;color:white;padding:14px 20px;text-decoration:none">Consultar pedido</a></p><p>Adjuntamos tu comprobante PDF. No es factura fiscal.</p></div>`;
  const pdf = await buildReceiptPdf(order);
  return {
    subject: title,
    html,
    text: `${title}\n${result.message}\nTotal: ${money(order.total)}\nSucursal: ${order.branchName}\nHorario: ${scheduleLabel(order.scheduledStart)}\nConsultar: ${orderUrl}`,
    attachments: [
      {
        filename: receiptFilename(order),
        content: pdf.toString("base64"),
        content_type: "application/pdf",
      },
    ],
  };
}
