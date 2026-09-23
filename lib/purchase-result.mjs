export const money = (value) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(
    Number(value) || 0,
  );
export const paymentLabels = {
  CASH_ON_PICKUP: "Efectivo al recoger",
  CASH: "Efectivo",
  TERMINAL: "Terminal",
  TRANSFER: "Transferencia",
  ONLINE: "Pago en línea",
  PAYMENT_LINK: "Liga de pago",
  PENDING: "Pago pendiente",
  COURTESY: "Cortesía",
};
export const statusLabels = {
  pending_payment: "Pago pendiente",
  confirmed: "Confirmado",
  paid: "Pagado",
  preparing: "En preparación",
  ready: "Listo",
  completed: "Completado",
  cancelled: "Cancelado",
};
export function purchaseResult(order) {
  const paid = order.paymentStatus === "paid";
  const refunded =
    order.paymentStatus === "refunded" ||
    order.paymentStatus === "partially_refunded";
  const amountPaid = paid ? Number(order.total) : Number(order.amountPaid || 0);
  const balance =
    order.status === "cancelled" || refunded
      ? 0
      : Math.max(0, Number(order.total) - amountPaid);
  let title = "Pedido recibido";
  let message =
    "Conserva tu número de pedido y el comprobante para consultar tu compra.";
  let tone = "pending";
  if (order.status === "cancelled") {
    title = "Pedido cancelado";
    message =
      "Este pedido está cancelado. Contacta a la sucursal si necesitas ayuda con tu pago.";
    tone = "error";
  } else if (refunded) {
    title = "Pedido con reembolso";
    message =
      order.paymentStatus === "refunded"
        ? "El pago está marcado como reembolsado."
        : "Se registró un reembolso parcial. Contacta a la sucursal para consultar el detalle.";
  } else if (
    order.paymentStatus === "failed" ||
    order.paymentStatus === "cancelled"
  ) {
    title = "Pago no completado";
    message =
      "No se confirmó el pago. Contacta a la sucursal antes de realizar otro pedido.";
    tone = "error";
  } else if (order.status === "completed") {
    title = "Pedido completado";
    message = paid
      ? "Gracias por tu compra. Tu pedido fue completado."
      : "Tu pedido fue completado. Revisa el saldo pendiente con la sucursal.";
    tone = paid ? "success" : "pending";
  } else if (paid) {
    title = "¡Gracias por tu compra!";
    message =
      "Tu pago está confirmado. Aquí puedes consultar y descargar el comprobante de tu pedido.";
    tone = "success";
  } else if (order.paymentStatus === "processing") {
    title = "Estamos verificando tu pago";
    message =
      "La confirmación del pago está en proceso. No necesitas crear otro pedido.";
  } else if (order.paymentStatus === "partially_paid") {
    title = "Pago parcial recibido";
    message = `Saldo pendiente: ${money(balance)}. Conserva el comprobante para completar tu pago.`;
  } else if (
    ["CASH_ON_PICKUP", "CASH"].includes(order.paymentMethod) ||
    (order.paymentMethod === "PENDING" &&
      order.fulfillmentMethod === "delivery")
  ) {
    title = "Pedido recibido";
    message =
      order.fulfillmentMethod === "delivery"
        ? "Tu pago está pendiente. Pagarás al recibir el pedido en tu domicilio."
        : "Tu pago está pendiente. Pagarás al recoger el pedido en sucursal.";
  } else {
    message =
      "Tu pedido fue registrado, pero el pago está pendiente. Consulta con la sucursal cómo completarlo.";
  }
  const paymentStatus =
    {
      paid: "Pagado",
      unpaid: "Pendiente de pago",
      processing: "En verificación",
      failed: "Fallido",
      cancelled: "Cancelado",
      partially_paid: "Pago parcial",
      refunded: "Reembolsado",
      partially_refunded: "Reembolso parcial",
    }[order.paymentStatus] || "Por confirmar";
  return { title, message, tone, paymentStatus, amountPaid, balance };
}
export function scheduleLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Por confirmar"
    : new Intl.DateTimeFormat("es-MX", {
        timeZone: "America/Mexico_City",
        dateStyle: "long",
        timeStyle: "short",
      }).format(date);
}
export function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
}
export function receiptSnapshot(order, branch) {
  const keys = [
    "id",
    "orderNumber",
    "status",
    "paymentStatus",
    "paymentMethod",
    "amountPaid",
    "fulfillmentMethod",
    "scheduledStart",
    "scheduledEnd",
    "createdAt",
    "customerName",
    "customerEmail",
    "customerPhone",
    "deliveryAddress",
    "customerNotes",
    "subtotal",
    "promotionDiscountTotal",
    "discountAmount",
    "couponDiscount",
    "deliveryFee",
    "total",
  ];
  return {
    ...Object.fromEntries(keys.map((key) => [key, order[key] ?? null])),
    branchName: branch?.name ?? order.branchName ?? "Sucursal",
    branchAddress: branch?.address ?? "",
    branchPhone: branch?.phone ?? "",
    items: order.items.map((item) => ({
      name: item.name,
      variantLabel: item.variantLabel,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
  };
}
export function selectBranchEmail(assignments) {
  const valid = assignments.filter(
    (a) =>
      a.active &&
      (a.isPrimary || a.role === "branch_manager") &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email ?? ""),
  );
  valid.sort(
    (a, b) =>
      Number(b.isPrimary) - Number(a.isPrimary) ||
      String(a.userId).localeCompare(String(b.userId)),
  );
  return valid[0]?.email?.trim().toLowerCase() ?? null;
}
