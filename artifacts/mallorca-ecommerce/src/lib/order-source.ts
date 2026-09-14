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
};

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
