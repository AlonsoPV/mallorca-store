import { useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  useListAdminOrders,
  useListAdminBranches,
  useUpdateAdminOrder,
  getListAdminOrdersQueryKey,
  type OrderStatusUpdateStatus,
  type OrderSummary,
} from "@workspace/api-client-react";
import {
  AdminEmptyState,
  AdminError,
  AdminFilterBar,
  AdminFilterSelect,
  AdminLoading,
  AdminPageHeader,
  AdminPageShell,
} from "@/components/admin";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  formatOrderDate,
  formatOrderTime,
  getPrimaryNextStatus,
  getValidNextStatuses,
  ORDER_STATUS_LABELS,
  formatPriceMx,
  startOfDay,
  type OrderStatus,
} from "@/lib/order-status";
import { pendingPaymentAmount } from "@/lib/order-source";
import { cn } from "@/lib/utils";

const AGENDA_ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  paid: "Confirmar",
  preparing: "Preparar",
  ready: "Listo",
  completed: "Entregar",
  cancelled: "Cancelar",
};

type AgendaOrder = OrderSummary;
type FulfillmentFilter = "all" | "pickup" | "delivery";

type AgendaFilters = {
  date: string;
  branchId: string;
  fulfillment: FulfillmentFilter;
  showDone: boolean;
};

function toDateInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function isValidDateParam(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
}

function parseAgendaSearch(search: string): AgendaFilters {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const fulfillment = params.get("fulfillment");
  return {
    date: isValidDateParam(params.get("date")) ? params.get("date")! : toDateInputValue(new Date()),
    branchId: params.get("branchId") || "all",
    fulfillment: fulfillment === "pickup" || fulfillment === "delivery" ? fulfillment : "all",
    showDone: params.get("showDone") === "1",
  };
}

function buildAgendaHref(filters: AgendaFilters) {
  const params = new URLSearchParams();
  params.set("date", filters.date);
  if (filters.branchId !== "all") params.set("branchId", filters.branchId);
  if (filters.fulfillment !== "all") params.set("fulfillment", filters.fulfillment);
  if (filters.showDone) params.set("showDone", "1");
  return `/admin/agenda?${params.toString()}`;
}

function fulfillmentLabel(method?: string) {
  return method === "delivery" ? "Delivery" : "Recogida";
}

function pieceCount(order: AgendaOrder) {
  const items = order.items ?? [];
  if (items.length > 0) return items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);
  return order.itemCount ?? 0;
}

function itemsCaption(order: AgendaOrder) {
  const items = order.items ?? [];
  if (items.length > 0) {
    return items.map((item) => `${item.quantity}× ${item.name}`).join(", ");
  }
  const count = order.itemCount ?? 0;
  return count > 0 ? `${count} piezas` : "Sin líneas";
}

function isClosedStatus(status: string) {
  return status === "cancelled" || status === "completed";
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "pending_payment":
      return "border-transparent bg-amber-100 text-amber-900";
    case "confirmed":
      return "border-transparent bg-sky-100 text-sky-900";
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

export default function AdminAgenda() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const filters = useMemo(() => parseAgendaSearch(search), [search]);
  const { date: dateValue, branchId, fulfillment, showDone } = filters;
  const todayValue = toDateInputValue(new Date());
  const tomorrowValue = toDateInputValue(addDays(startOfDay(new Date()), 1));
  const isToday = dateValue === todayValue;
  const isTomorrow = dateValue === tomorrowValue;

  const branches = useListAdminBranches();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateOrder = useUpdateAdminOrder();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const range = useMemo(() => {
    const day = startOfDay(new Date(`${dateValue}T12:00:00`));
    return { from: day.toISOString(), to: addDays(day, 1).toISOString() };
  }, [dateValue]);

  const query = useListAdminOrders({
    branchId: branchId === "all" ? undefined : Number(branchId),
    from: range.from,
    to: range.to,
    fulfillmentMethod: fulfillment === "all" ? undefined : fulfillment,
  });
  const { data: orders, isLoading, isError, refetch } = query;

  const updateFilters = (patch: Partial<AgendaFilters>) => {
    setLocation(buildAgendaHref({ ...filters, ...patch }), { replace: true });
  };

  const shiftDay = (days: number) => {
    const day = startOfDay(new Date(`${dateValue}T12:00:00`));
    updateFilters({ date: toDateInputValue(addDays(day, days)) });
  };

  const visibleOrders = useMemo(() => {
    return (orders ?? []).filter((order) => showDone || !isClosedStatus(order.status));
  }, [orders, showDone]);

  const closedCount = useMemo(
    () => (orders ?? []).filter((order) => isClosedStatus(order.status)).length,
    [orders],
  );

  const dayPieces = visibleOrders.reduce((sum, order) => sum + pieceCount(order), 0);

  const slots = useMemo(() => {
    const map = new Map<string, AgendaOrder[]>();
    for (const order of visibleOrders) {
      const key = formatOrderTime(order.scheduledStart);
      const list = map.get(key) ?? [];
      list.push(order);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort(([, a], [, b]) => {
      const first = new Date(a[0]?.scheduledStart ?? 0).getTime();
      const second = new Date(b[0]?.scheduledStart ?? 0).getTime();
      return first - second;
    });
  }, [visibleOrders]);

  const newOrderHref =
    branchId !== "all" ? `/admin/pedidos/nuevo?branchId=${branchId}` : "/admin/pedidos/nuevo";

  const advance = async (orderId: string, status: OrderStatusUpdateStatus) => {
    setPendingId(orderId);
    try {
      await updateOrder.mutateAsync({ id: orderId, data: { status } });
      toast({ title: "Estado actualizado" });
      queryClient.invalidateQueries({ queryKey: getListAdminOrdersQueryKey() });
    } catch {
      toast({ title: "Transición no válida", variant: "destructive" });
    } finally {
      setPendingId(null);
    }
  };

  return (
    <AdminLayout>
      <AdminPageShell className="mx-auto w-full max-w-[1800px]">
        <AdminPageHeader
          title="Agenda"
          description="Producción y mostrador por fecha y hora."
          actions={
            <Button asChild className="rounded-none">
              <Link href={newOrderHref}>+ Nuevo pedido</Link>
            </Button>
          }
        />

        <div className="sticky top-0 z-10 -mx-6 space-y-3 border-b border-border bg-background/95 px-6 py-3 backdrop-blur md:-mx-10 md:px-10">
          <AdminFilterBar>
            <button
              type="button"
              onClick={() => updateFilters({ date: todayValue })}
              className={cn(
                "border px-3 py-1.5 text-sm transition-colors",
                isToday
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted",
              )}
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => updateFilters({ date: tomorrowValue })}
              className={cn(
                "border px-3 py-1.5 text-sm transition-colors",
                isTomorrow
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted",
              )}
            >
              Mañana
            </button>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-none"
                aria-label="Día anterior"
                onClick={() => shiftDay(-1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                type="date"
                value={dateValue}
                onChange={(e) => {
                  if (isValidDateParam(e.target.value)) updateFilters({ date: e.target.value });
                }}
                className="h-10 w-[10.5rem] rounded-none bg-background"
                aria-label="Fecha"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-none"
                aria-label="Día siguiente"
                onClick={() => shiftDay(1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <span className="text-sm text-muted-foreground">
              {formatOrderDate(new Date(`${dateValue}T12:00:00`))}
            </span>
            <AdminFilterSelect
              value={branchId}
              onValueChange={(value) => updateFilters({ branchId: value })}
              placeholder="Sucursal"
              options={[
                { value: "all", label: "Todas las sucursales" },
                ...(branches.data?.map((branch) => ({
                  value: String(branch.id),
                  label: branch.name,
                })) ?? []),
                ...(branchId !== "all" &&
                !branches.data?.some((branch) => String(branch.id) === branchId)
                  ? [{ value: branchId, label: `Sucursal ${branchId}` }]
                  : []),
              ]}
            />
            <AdminFilterSelect
              value={fulfillment}
              onValueChange={(value) => updateFilters({ fulfillment: value as FulfillmentFilter })}
              placeholder="Tipo"
              options={[
                { value: "all", label: "Recogida / Delivery" },
                { value: "pickup", label: "Recogida" },
                { value: "delivery", label: "Delivery" },
              ]}
            />
          </AdminFilterBar>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="agenda-show-done"
                checked={showDone}
                onCheckedChange={(checked) => updateFilters({ showDone: checked === true })}
                className="rounded-none"
              />
              <Label htmlFor="agenda-show-done" className="cursor-pointer font-normal text-muted-foreground">
                Mostrar entregados y cancelados
              </Label>
            </div>
            {!isLoading && !isError ? (
              <p className="text-sm text-muted-foreground">
                {visibleOrders.length} {visibleOrders.length === 1 ? "pedido" : "pedidos"} · {dayPieces}{" "}
                {dayPieces === 1 ? "pieza" : "piezas"}
              </p>
            ) : null}
          </div>
        </div>

        {isLoading ? <AdminLoading label="Cargando agenda…" /> : null}
        {isError ? (
          <AdminError title="No se pudo cargar la agenda" onRetry={() => refetch()} />
        ) : null}

        {!isLoading && !isError && slots.length === 0 ? (
          <AdminEmptyState
            icon={CalendarDays}
            title="No hay pedidos programados para esta fecha."
            description={
              !showDone && closedCount > 0
                ? `Hay ${closedCount} ${closedCount === 1 ? "pedido cerrado" : "pedidos cerrados"} (entregados o cancelados).`
                : "Cambia la fecha o registra un pedido para este día."
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {!showDone && closedCount > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-none"
                    onClick={() => updateFilters({ showDone: true })}
                  >
                    Mostrar entregados y cancelados
                  </Button>
                ) : null}
                {!isToday ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-none"
                    onClick={() => updateFilters({ date: todayValue })}
                  >
                    Ver hoy
                  </Button>
                ) : null}
                <Button asChild className="rounded-none">
                  <Link href={newOrderHref}>Nuevo pedido</Link>
                </Button>
              </div>
            }
          />
        ) : null}

        {!isLoading && !isError && slots.length > 0 ? (
          <div className="space-y-3">
            {slots.map(([time, slotOrders]) => {
              const active = (slotOrders ?? []).filter((order) => !isClosedStatus(order.status));
              const closed = (slotOrders ?? []).filter((order) => isClosedStatus(order.status));
              const slotPieces = (slotOrders ?? []).reduce((sum, order) => sum + pieceCount(order), 0);
              return (
                <section key={time} className="space-y-2">
                  <h2 className="font-serif text-lg">
                    {time}
                    <span className="ml-2 font-sans text-sm text-muted-foreground">
                      · {(slotOrders ?? []).length} {(slotOrders ?? []).length === 1 ? "pedido" : "pedidos"} ·{" "}
                      {slotPieces} {slotPieces === 1 ? "pieza" : "piezas"}
                    </span>
                  </h2>
                  <div className="border border-border bg-background">
                    {active.map((order) => (
                      <AgendaOrderRow
                        key={order.id}
                        order={order}
                        showBranch={branchId === "all"}
                        pending={pendingId === order.id}
                        onAdvance={advance}
                      />
                    ))}
                    {showDone && closed.length > 0 ? (
                      <>
                        <p className="border-t border-border px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                          Cerrados
                        </p>
                        {closed.map((order) => (
                          <AgendaOrderRow
                            key={order.id}
                            order={order}
                            showBranch={branchId === "all"}
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
        ) : null}
      </AdminPageShell>
    </AdminLayout>
  );
}

function AgendaOrderRow({
  order,
  showBranch,
  pending,
  closed,
  onAdvance,
}: {
  order: AgendaOrder;
  showBranch: boolean;
  pending: boolean;
  closed?: boolean;
  onAdvance?: (orderId: string, status: OrderStatusUpdateStatus) => void;
}) {
  const primary = closed ? null : getPrimaryNextStatus(order.status);
  const next = closed ? [] : getValidNextStatuses(order.status);
  const statusLabel = ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-b border-border px-3 py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between",
        closed && "bg-muted/20",
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <Link href={`/admin/pedidos/${order.id}`} className="font-medium text-primary hover:underline">
            #{order.orderNumber}
          </Link>
          <span className="text-sm text-muted-foreground">{fulfillmentLabel(order.fulfillmentMethod)}</span>
          <span className="text-sm">{order.customerName}</span>
          {showBranch ? (
            <span className="text-xs text-muted-foreground">
              {order.branchName ?? `Sucursal ${order.branchId}`}
            </span>
          ) : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">{itemsCaption(order)}</p>
        {order.fulfillmentMethod === "pickup" &&
        (order.paymentStatus === "unpaid" || order.paymentStatus === "processing") ? (
          <p className="text-xs font-medium text-amber-800">
            Efectivo · {formatPriceMx(pendingPaymentAmount(order.total, order.amountPaid))} por cobrar
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={cn("rounded-none font-medium shadow-none", statusBadgeClass(order.status))}>
          {statusLabel}
        </Badge>
        {primary && onAdvance ? (
          <Button
            size="sm"
            className="h-8 rounded-none"
            disabled={pending}
            onClick={() => onAdvance(order.id, primary)}
          >
            {AGENDA_ACTION_LABELS[primary] ?? ORDER_STATUS_LABELS[primary]}
          </Button>
        ) : null}
        {next
          .filter((status) => status !== primary)
          .map((status) => (
            <Button
              key={status}
              size="sm"
              variant="outline"
              className="h-8 rounded-none"
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
