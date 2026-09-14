import type { OrderStatusUpdateStatus } from "@workspace/api-client-react";

export type OrderStatus = OrderStatusUpdateStatus;

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["paid", "cancelled"],
  paid: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "Pago pendiente",
  paid: "Confirmado",
  preparing: "Preparando",
  ready: "Listo",
  completed: "Entregado",
  cancelled: "Cancelado",
};

/** Preferred primary action label for the main CTA (non-cancel next step). */
export const ORDER_STATUS_ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  paid: "Confirmar pago",
  preparing: "Pasar a preparación",
  ready: "Marcar como listo",
  completed: "Marcar entregado",
  cancelled: "Cancelar",
};

export function getValidNextStatuses(status: string): OrderStatus[] {
  return ORDER_STATUS_TRANSITIONS[status as OrderStatus] ?? [];
}

export function getPrimaryNextStatus(status: string): OrderStatus | null {
  const next = getValidNextStatuses(status).filter((s) => s !== "cancelled");
  return next[0] ?? null;
}

export function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function dayRange(day: "today" | "tomorrow" | "week") {
  const today = startOfDay();
  if (day === "today") {
    return { from: today.toISOString(), to: addDays(today, 1).toISOString() };
  }
  if (day === "tomorrow") {
    return { from: addDays(today, 1).toISOString(), to: addDays(today, 2).toISOString() };
  }
  return { from: today.toISOString(), to: addDays(today, 7).toISOString() };
}

export function formatOrderTime(value?: string | Date | null) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

export function formatOrderDate(value?: string | Date | null) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "long" });
}

export function formatPriceMx(price: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(price);
}
