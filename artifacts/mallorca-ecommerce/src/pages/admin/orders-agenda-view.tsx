import { Link } from "wouter";
import {
  type OrderStatusUpdateStatus,
  type OrderSummary,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatOrderTime,
  getPrimaryNextStatus,
  getValidNextStatuses,
  ORDER_STATUS_LABELS,
  formatPriceMx,
  type OrderStatus,
} from "@/lib/order-status";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  pendingPaymentAmount,
} from "@/lib/order-source";
import { cn } from "@/lib/utils";

const AGENDA_ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  paid: "Confirmar",
  preparing: "Preparar",
  ready: "Listo",
  completed: "Entregar",
  cancelled: "Cancelar",
};

function fulfillmentLabel(method?: string) {
  return method === "delivery" ? "Delivery" : "Recogida";
}

function pieceCount(order: OrderSummary) {
  const items = order.items ?? [];
  if (items.length > 0)
    return items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
  return order.itemCount ?? 0;
}

function itemsCaption(order: OrderSummary) {
  const items = order.items ?? [];
  if (items.length > 0) {
    return items.map((item) => `${item.quantity}× ${item.name}`).join(", ");
  }
  const count = order.itemCount ?? 0;
  return count > 0 ? `${count} piezas` : "Sin líneas";
}

export function isClosedOrderStatus(status: string) {
  return status === "cancelled" || status === "completed";
}

export function isCancelledOrderStatus(status: string) {
  return status === "cancelled";
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "pending_payment":
      return "border-transparent bg-amber-100 text-amber-900";
    case "confirmed":
    case "paid":
      return "border-transparent bg-sky-100 text-sky-900";
    case "preparing":
      return "border-transparent bg-orange-100 text-orange-900";
    case "ready":
      return "border-transparent bg-emerald-100 text-emerald-800";
    case "completed":
      return "border-transparent bg-muted text-muted-foreground";
    case "cancelled":
      return "border-transparent bg-destructive/10 text-destructive";
    default:
      return "border-transparent bg-muted text-muted-foreground";
  }
}

function localDateKey(value?: string | Date | null) {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function agendaDayLabel(dateKey: string) {
  const now = new Date();
  const today = localDateKey(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (dateKey === today) return "Hoy";
  if (dateKey === localDateKey(tomorrow)) return "Mañana";
  const d = new Date(`${dateKey}T12:00:00`);
  const label = d.toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export type AgendaDayGroup = {
  dateKey: string;
  label: string;
  slots: [string, OrderSummary[]][];
};

export function groupOrdersBySlot(
  orders: OrderSummary[],
  options?: { newestFirst?: boolean },
): AgendaDayGroup[] {
  const newestFirst = options?.newestFirst === true;
  const days = new Map<string, Map<string, OrderSummary[]>>();
  for (const order of orders) {
    const dateKey = localDateKey(order.scheduledStart);
    const timeKey = formatOrderTime(order.scheduledStart);
    const daySlots = days.get(dateKey) ?? new Map<string, OrderSummary[]>();
    const list = daySlots.get(timeKey) ?? [];
    list.push(order);
    daySlots.set(timeKey, list);
    days.set(dateKey, daySlots);
  }
  const slotDirection = newestFirst ? -1 : 1;
  return Array.from(days.entries())
    .sort(([a], [b]) => (newestFirst ? b.localeCompare(a) : a.localeCompare(b)))
    .map(([dateKey, slotMap]) => ({
      dateKey,
      label: agendaDayLabel(dateKey),
      slots: Array.from(slotMap.entries()).sort(([, a], [, b]) => {
        const first = new Date(a[0]?.scheduledStart ?? 0).getTime();
        const second = new Date(b[0]?.scheduledStart ?? 0).getTime();
        return (first - second) * slotDirection;
      }),
    }));
}

export function OrdersAgendaView({
  search,
  days,
  showBranch,
  showDone,
  pendingId,
  onAdvance,
}: {
  search: string;
  days: AgendaDayGroup[];
  showBranch: boolean;
  showDone: boolean;
  pendingId: string | null;
  onAdvance: (orderId: string, status: OrderStatusUpdateStatus) => void;
}) {
  const showDayHeadings = days.length > 1;
  return (
    <div className="space-y-8">
      {days.map((day) => (
        <div key={day.dateKey} className="space-y-3">
          {showDayHeadings ? (
            <h2 className="font-serif text-lg text-foreground">{day.label}</h2>
          ) : null}
          {day.slots.map(([time, slotOrders]) => {
            const Heading = showDayHeadings ? "h3" : "h2";
            const active = slotOrders.filter(
              (order) => !isClosedOrderStatus(order.status),
            );
            const delivered = slotOrders.filter(
              (order) => order.status === "completed",
            );
            const cancelled = slotOrders.filter(
              (order) => order.status === "cancelled",
            );
            const slotPieces = slotOrders.reduce(
              (sum, order) => sum + pieceCount(order),
              0,
            );
            return (
              <section key={`${day.dateKey}-${time}`} className="space-y-2">
                <Heading className="flex items-baseline justify-between gap-3">
                  <time
                    dateTime={slotOrders[0]?.scheduledStart}
                    className="font-serif text-xl tabular-nums tracking-tight"
                  >
                    {time}
                  </time>
                  <span className="shrink-0 font-sans text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {slotOrders.length}{" "}
                    {slotOrders.length === 1 ? "pedido" : "pedidos"}
                    <span aria-hidden="true"> · </span>
                    {slotPieces} {slotPieces === 1 ? "pieza" : "piezas"}
                  </span>
                </Heading>
                <div className="border border-border bg-background">
                  {active.map((order) => (
                    <AgendaOrderRow
                      key={order.id}
                      search={search}
                      order={order}
                      showBranch={showBranch}
                      pending={pendingId === order.id}
                      onAdvance={onAdvance}
                    />
                  ))}
                  {delivered.map((order) => (
                    <AgendaOrderRow
                      key={order.id}
                      search={search}
                      order={order}
                      showBranch={showBranch}
                      pending={false}
                      closed
                    />
                  ))}
                  {showDone && cancelled.length > 0 ? (
                    <>
                      <p className="border-t border-border px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        Cancelados
                      </p>
                      {cancelled.map((order) => (
                        <AgendaOrderRow
                          key={order.id}
                          search={search}
                          order={order}
                          showBranch={showBranch}
                          pending={false}
                          closed
                        />
                      ))}
                    </>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function AgendaOrderRow({
  search,
  order,
  showBranch,
  pending,
  closed,
  onAdvance,
}: {
  search: string;
  order: OrderSummary;
  showBranch: boolean;
  pending: boolean;
  closed?: boolean;
  onAdvance?: (orderId: string, status: OrderStatusUpdateStatus) => void;
}) {
  const qs = search ? `?${search.replace(/^\?/, "")}` : "";
  const detailHref = `/admin/pedidos/${order.id}${qs}`;
  const primary = closed ? null : getPrimaryNextStatus(order.status);
  const next = closed ? [] : getValidNextStatuses(order.status);
  const statusLabel =
    ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status;
  const branch = order.branchName ?? `Sucursal ${order.branchId}`;
  const collectCash =
    order.fulfillmentMethod === "pickup" &&
    (order.paymentStatus === "unpaid" || order.paymentStatus === "processing");
  const secondary = next.filter((status) => status !== primary);

  return (
    <div
      className={cn(
        "grid grid-cols-1 border-b border-border last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-stretch",
        closed && "bg-muted/20",
      )}
    >
      <Link
        href={detailHref}
        className="min-w-0 px-3 py-2.5 outline-offset-[-2px] transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
      >
        <div className="flex min-w-0 items-baseline gap-x-2">
          <span className="shrink-0 font-medium text-primary">#{order.orderNumber}</span>
          <span className="truncate text-sm font-medium">
            {order.customerName}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {fulfillmentLabel(order.fulfillmentMethod)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {showBranch ? `${branch} · ` : ""}
          {itemsCaption(order)}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">
            {formatPriceMx(order.total)}
          </span>
          <span>
            {PAYMENT_METHOD_LABELS[
              order.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS
            ] ?? order.paymentMethod}
          </span>
          <span>
            {PAYMENT_STATUS_LABELS[
              order.paymentStatus as keyof typeof PAYMENT_STATUS_LABELS
            ] ?? order.paymentStatus}
          </span>
          {order.customerPhone && <span>{order.customerPhone}</span>}
        </p>
        {collectCash ? (
          <p className="mt-0.5 text-xs font-medium text-amber-800">
            Efectivo ·{" "}
            {formatPriceMx(pendingPaymentAmount(order.total, order.amountPaid))}{" "}
            por cobrar
          </p>
        ) : null}
      </Link>
      <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5 sm:justify-end sm:py-2.5 sm:pl-0">
        <Badge
          className={cn(
            "h-8 shrink-0 rounded-none px-2 font-medium shadow-none",
            statusBadgeClass(order.status),
          )}
        >
          {statusLabel}
        </Badge>
        <Button asChild size="sm" variant="outline" className="h-8 shrink-0 rounded-none px-2.5">
          <Link href={detailHref}>Ver</Link>
        </Button>
        {primary && onAdvance ? (
          <Button
            size="sm"
            className="h-8 shrink-0 rounded-none px-2.5"
            disabled={pending}
            onClick={() => onAdvance(order.id, primary)}
          >
            {AGENDA_ACTION_LABELS[primary] ?? ORDER_STATUS_LABELS[primary]}
          </Button>
        ) : null}
        <Button
          asChild
          size="sm"
          variant="ghost"
          className="h-8 rounded-none px-2"
        >
          <Link href={`/admin/pedidos/nuevo?duplicateFrom=${order.id}`}>
            Duplicar
          </Link>
        </Button>
        {secondary.map((status) => (
          <Button
            key={status}
            size="sm"
            variant="outline"
            className="h-8 shrink-0 rounded-none px-2.5"
            disabled={pending}
            onClick={() => onAdvance?.(order.id, status)}
          >
            {AGENDA_ACTION_LABELS[status] ?? ORDER_STATUS_LABELS[status]}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function orderPieceCount(order: OrderSummary) {
  return pieceCount(order);
}
