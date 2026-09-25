export const ORDER_SOURCE_LABELS: Record<string, string> = {
  STOREFRONT: "Web",
  PHONE: "Teléfono",
  WHATSAPP: "WhatsApp",
  POS: "Mostrador",
  CORPORATE: "Corporativo",
  ADMIN: "Interno",
  OTHER: "Otro",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  ONLINE: "En línea",
  CASH: "Efectivo",
  TERMINAL: "Terminal",
  TRANSFER: "Transferencia",
  PAYMENT_LINK: "Link de pago",
  PENDING: "Pendiente",
  COURTESY: "Cortesía / Interno",
  CASH_ON_PICKUP: "Efectivo al recoger",
  MERCADO_PAGO: "Mercado Pago",
  PAYPAL: "PayPal",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "Por cobrar",
  processing: "Procesando",
  paid: "Pagado",
  failed: "Fallido",
  refunded: "Reembolsado",
  partially_paid: "Parcialmente pagado",
  partially_refunded: "Parcialmente reembolsado",
  cancelled: "Cancelado",
};

export function pendingPaymentAmount(total: number, amountPaid?: number | null) {
  return Math.max(0, total - (amountPaid ?? 0));
}

export const ORDER_AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATED_MANUAL: "Pedido creado",
  CREATED_STOREFRONT: "Pedido creado (web)",
  ORDER_CREATED: "Pedido creado",
  STATUS_CHANGED: "Cambio de estado",
  PAYMENT_RECORDED: "Pago registrado",
  PAYMENT_GATEWAY_STARTED: "Pago en línea iniciado",
  PAYMENT_LINK_CREATED: "Link de pago generado",
  CANCELLED: "Pedido cancelado",
  ORDER_CANCELLED: "Pedido cancelado",
  MANUAL_DISCOUNT: "Descuento manual",
  AVAILABILITY_OVERRIDE: "Override de disponibilidad",
  LINES_CHANGED: "Productos modificados",
  SCHEDULE_CHANGED: "Fecha/hora modificada",
  DUPLICATED: "Pedido duplicado",
  ORDER_UPDATED: "Pedido actualizado",
  OVERRIDE: "Override autorizado",
  NOTE_UPDATED: "Nota actualizada",
  ITEMS_UPDATED: "Productos modificados",
  REFUND: "Reembolso",
};

export function formatAuditAction(action: string) {
  return ORDER_AUDIT_ACTION_LABELS[action] ?? action.replace(/_/g, " ").toLowerCase();
}

export function fulfillmentLabel(method?: string | null) {
  if (method === "delivery") return "Delivery";
  if (method === "pickup") return "Pickup";
  return method ?? "—";
}

export function isUnpaidCashOrder(order: {
  paymentMethod?: string | null;
  paymentStatus?: string | null;
}) {
  return (
    (order.paymentMethod === "CASH_ON_PICKUP" || order.paymentMethod === "CASH") &&
    (order.paymentStatus === "unpaid" || order.paymentStatus === "processing")
  );
}

export function buildWhatsAppOrderMessage(params: {
  customerName: string;
  orderNumber: string;
  branchName?: string | null;
  scheduledStart: string | Date;
  total: number;
  paymentStatus?: string | null;
  link?: string | null;
}): string {
  const date = new Date(params.scheduledStart);
  const fecha = date.toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Mexico_City",
  });
  const hora = date.toLocaleTimeString("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Mexico_City",
  });
  const total = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(params.total);
  const pago =
    params.paymentStatus === "paid"
      ? "Pagado"
      : params.paymentStatus === "partially_paid"
        ? "Parcialmente pagado"
        : "Pendiente";

  return [
    `Hola ${params.customerName}, tu pedido #${params.orderNumber}${params.branchName ? ` de ${params.branchName}` : ""} quedó registrado.`,
    "",
    `Fecha: ${fecha}`,
    `Hora: ${hora}`,
    `Total: ${total}`,
    `Pago: ${pago}`,
    params.link ? `\n${params.link}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function whatsappComposeUrl(phone: string | null | undefined, message: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const text = encodeURIComponent(message);
  if (!digits) return `https://wa.me/?text=${text}`;
  const withCountry = digits.startsWith("52") ? digits : `52${digits}`;
  return `https://wa.me/${withCountry}?text=${text}`;
}
