import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  useListAdminOrders,
  useUpdateAdminOrder,
  getListAdminOrdersQueryKey,
  useListAdminBranches,
  type OrderStatusUpdateStatus,
} from "@workspace/api-client-react";
import {
  AdminEmptyState,
  AdminError,
  AdminFilterSelect,
  AdminLoading,
  AdminPageHeader,
  AdminPageShell,
} from "@/components/admin";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  normalizeSearch,
  readSearchParam,
  withSearchParams,
} from "@/lib/admin-search-params";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/lib/order-source";
import {
  addDays,
  dayRange,
  ORDER_STATUS_LABELS,
  startOfDay,
} from "@/lib/order-status";
import { cn } from "@/lib/utils";
import {
  groupOrdersBySlot,
  isCancelledOrderStatus,
  orderPieceCount,
  OrdersAgendaView,
} from "./orders-agenda-view";

type DayChip = "today" | "tomorrow" | "week" | "all";

const FILTER_TRIGGER = "h-9 w-full min-w-0";

type OrdersFilters = {
  day: DayChip;
  date: string;
  branchId: string;
  status: string;
  fulfillment: string;
  paymentStatus: string;
  paymentMethod: string;
  q: string;
  showDone: boolean;
};

function toDateInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function isValidDateParam(value: string | null): value is string {
  return (
    !!value &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(new Date(`${value}T12:00:00`).getTime())
  );
}

function parseDay(value: string | null): DayChip {
  if (
    value === "today" ||
    value === "tomorrow" ||
    value === "week" ||
    value === "all"
  ) {
    return value;
  }
  return "today";
}

function dateFromDayChip(day: DayChip): string {
  if (day === "tomorrow")
    return toDateInputValue(addDays(startOfDay(new Date()), 1));
  return toDateInputValue(new Date());
}

function dayFromDate(date: string): DayChip {
  const today = toDateInputValue(new Date());
  const tomorrow = toDateInputValue(addDays(startOfDay(new Date()), 1));
  if (date === today) return "today";
  if (date === tomorrow) return "tomorrow";
  return "all";
}

function parseOrdersSearch(search: string): OrdersFilters {
  const day = parseDay(readSearchParam(search, "day"));
  const dateParam = readSearchParam(search, "date");
  return {
    day,
    date: isValidDateParam(dateParam) ? dateParam : dateFromDayChip(day),
    branchId: readSearchParam(search, "branchId") || "all",
    status: readSearchParam(search, "status") || "all",
    fulfillment: readSearchParam(search, "fulfillment") || "all",
    paymentStatus: readSearchParam(search, "paymentStatus") || "all",
    paymentMethod: readSearchParam(search, "paymentMethod") || "all",
    q: readSearchParam(search, "q") || "",
    showDone: readSearchParam(search, "showDone") === "1",
  };
}

export default function AdminOrdersList() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const filters = useMemo(() => parseOrdersSearch(search), [search]);

  const [searchDraft, setSearchDraft] = useState(filters.q);
  useEffect(() => setSearchDraft(filters.q), [filters.q]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const todayValue = toDateInputValue(new Date());
  const tomorrowValue = toDateInputValue(addDays(startOfDay(new Date()), 1));
  const isToday = filters.date === todayValue;
  const dateParam = readSearchParam(search, "date");
  const selectedChip: DayChip | null = isValidDateParam(dateParam)
    ? dateParam === todayValue
      ? "today"
      : dateParam === tomorrowValue
        ? "tomorrow"
        : null
    : filters.day;
  const singleDay = selectedChip === "today" || selectedChip === "tomorrow" || selectedChip === null;

  const listaFilterCount = [
    filters.branchId,
    filters.fulfillment,
    filters.status,
    filters.paymentStatus,
    filters.paymentMethod,
  ].filter((value) => value !== "all").length;

  const activeFilterCount = listaFilterCount + (filters.showDone ? 1 : 0);

  const patchFilters = (patch: Partial<OrdersFilters>) => {
    const next = { ...filters, ...patch };
    const params = new URLSearchParams(normalizeSearch(search));
    if (patch.day) {
      params.delete("date");
      next.date = dateFromDayChip(patch.day);
    }
    if (patch.date) next.day = dayFromDate(patch.date);
    const exactDate = patch.date ?? params.get("date");
    setLocation(
      withSearchParams(
        "/admin/pedidos",
        search,
        {
          view: null,
          day: next.day === "today" ? null : next.day,
          date: patch.day ? null : exactDate,
          branchId: next.branchId === "all" ? null : next.branchId,
          status: next.status === "all" ? null : next.status,
          fulfillment: next.fulfillment === "all" ? null : next.fulfillment,
          paymentStatus:
            next.paymentStatus === "all" ? null : next.paymentStatus,
          paymentMethod:
            next.paymentMethod === "all" ? null : next.paymentMethod,
          q: next.q || null,
          showDone: next.showDone ? "1" : null,
        },
        { clearSentinel: "" },
      ),
      { replace: true },
    );
  };

  const range = useMemo(() => {
    if (isValidDateParam(readSearchParam(search, "date"))) {
      const day = startOfDay(new Date(`${filters.date}T12:00:00`));
      return { from: day.toISOString(), to: addDays(day, 1).toISOString() };
    }
    return filters.day === "all" ? undefined : dayRange(filters.day);
  }, [filters.date, filters.day, search]);

  const {
    data: orders,
    isLoading,
    isError,
    refetch,
  } = useListAdminOrders({
    status: filters.status === "all" ? undefined : filters.status,
    branchId: filters.branchId === "all" ? undefined : Number(filters.branchId),
    fulfillmentMethod:
      filters.fulfillment === "all"
        ? undefined
        : (filters.fulfillment as "pickup" | "delivery"),
    from: range?.from,
    to: range?.to,
  });
  const branches = useListAdminBranches();
  const updateOrder = useUpdateAdminOrder();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const filteredOrders = useMemo(() => {
    let list = orders ?? [];
    {
      if (filters.paymentStatus !== "all") {
        list = list.filter((o) => o.paymentStatus === filters.paymentStatus);
      }
      if (filters.paymentMethod !== "all") {
        list = list.filter((o) => o.paymentMethod === filters.paymentMethod);
      }
    }
    if (!filters.showDone && filters.status !== "cancelled") {
      list = list.filter((o) => !isCancelledOrderStatus(o.status));
    }
    const q = filters.q.trim().toLowerCase();
    if (q) {
      list = list.filter((o) => {
        const hay = [
          o.orderNumber,
          o.customerName,
          o.customerPhone,
          o.customerEmail,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  }, [
    orders,
    filters.paymentStatus,
    filters.paymentMethod,
    filters.showDone,
    filters.status,
    filters.q,
  ]);

  const cancelledCount = useMemo(
    () =>
      (orders ?? []).filter((order) => isCancelledOrderStatus(order.status))
        .length,
    [orders],
  );

  const dayPieces = filteredOrders.reduce(
    (sum, order) => sum + orderPieceCount(order),
    0,
  );
  const slots = useMemo(
    () =>
      groupOrdersBySlot(filteredOrders, {
        newestFirst: filters.day === "all",
      }),
    [filteredOrders, filters.day],
  );

  const advanceAgenda = async (
    orderId: string,
    status: OrderStatusUpdateStatus,
  ) => {
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

  const shiftDay = (days: number) => {
    const day = startOfDay(new Date(`${filters.date}T12:00:00`));
    patchFilters({ date: toDateInputValue(addDays(day, days)) });
  };

  const chips: { id: DayChip; label: string }[] = useMemo(
    () => [
      { id: "today", label: "Hoy" },
      { id: "tomorrow", label: "Mañana" },
      { id: "week", label: "Esta semana" },
      { id: "all", label: "Todos" },
    ],
    [],
  );

  const newOrderHref =
    filters.branchId !== "all"
      ? `/admin/pedidos/nuevo?branchId=${filters.branchId}`
      : "/admin/pedidos/nuevo";

  const clearFilters = () => {
    setSearchDraft("");
    patchFilters({
      branchId: "all",
      fulfillment: "all",
      status: "all",
      paymentStatus: "all",
      paymentMethod: "all",
      showDone: false,
      q: "",
    });
  };

  const canClear = activeFilterCount > 0 || !!filters.q;

  return (
    <AdminLayout>
      <AdminPageShell className="mx-auto w-full max-w-[1800px]">
        <AdminPageHeader
          title="Pedidos y agenda"
          description="Gestiona pedidos, pagos y entregas en una sola vista organizada por fecha y hora."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild className="rounded-none shrink-0">
                <Link href={newOrderHref}>+ Nuevo pedido</Link>
              </Button>
            </div>
          }
        />

        <div className="@container sticky top-0 z-10 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:-mx-10 md:px-10">
          <div className="flex flex-col gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <div
                role="group"
                aria-label="Rango de fechas"
                className="flex min-w-0 shrink-0 overflow-x-auto border border-border bg-background"
              >
                {chips.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    aria-pressed={selectedChip === chip.id}
                    onClick={() => patchFilters({ day: chip.id })}
                    className={cn(
                      "h-9 shrink-0 whitespace-nowrap border-l border-border px-3 text-sm transition-colors first:border-l-0",
                      selectedChip === chip.id
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-muted",
                    )}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              <form
                className="relative min-w-0 flex-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  patchFilters({ q: searchDraft.trim() });
                }}
              >
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  className="h-9 w-full min-w-0 rounded-none bg-background pl-8 shadow-none"
                  placeholder="Pedido, cliente, teléfono…"
                  aria-label="Buscar pedidos"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  onBlur={() => {
                    if (searchDraft.trim() !== filters.q)
                      patchFilters({ q: searchDraft.trim() });
                  }}
                />
              </form>

              {singleDay ? (
                <div className="hidden shrink-0 items-center border border-border bg-background @4xl:flex">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-none"
                    aria-label="Día anterior"
                    onClick={() => shiftDay(-1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <label className="relative flex h-9 min-w-[5.5rem] cursor-pointer items-center justify-center px-1 text-sm tabular-nums">
                    <span className="pointer-events-none">
                      {new Date(`${filters.date}T12:00:00`).toLocaleDateString(
                        "es-MX",
                        { day: "numeric", month: "short" },
                      )}
                    </span>
                    <Input
                      type="date"
                      value={filters.date}
                      onChange={(e) => {
                        if (isValidDateParam(e.target.value))
                          patchFilters({ date: e.target.value });
                      }}
                      className="absolute inset-0 h-full cursor-pointer opacity-0"
                      aria-label="Fecha"
                    />
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-none"
                    aria-label="Día siguiente"
                    onClick={() => shiftDay(1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label className="relative hidden h-9 w-9 shrink-0 cursor-pointer items-center justify-center border border-border bg-background @4xl:flex">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="date"
                    value=""
                    onChange={(e) => {
                      if (isValidDateParam(e.target.value))
                        patchFilters({ date: e.target.value });
                    }}
                    className="absolute inset-0 h-full cursor-pointer opacity-0"
                    aria-label="Elegir fecha"
                  />
                </label>
              )}

              <Button
                type="button"
                variant="outline"
                className="h-9 shrink-0 gap-2 rounded-none px-3 @5xl:hidden"
                aria-expanded={filtersOpen}
                aria-controls="orders-filters"
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden @sm:inline">Filtros</span>
                {activeFilterCount > 0 ? (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
                    {activeFilterCount}
                  </span>
                ) : null}
              </Button>
            </div>

            {singleDay ? (
              <div className="flex items-center border border-border bg-background @4xl:hidden">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-none"
                  aria-label="Día anterior"
                  onClick={() => shiftDay(-1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <label className="relative flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-center px-2 text-sm tabular-nums">
                  <span className="pointer-events-none">
                    {new Date(`${filters.date}T12:00:00`).toLocaleDateString(
                      "es-MX",
                      { weekday: "short", day: "numeric", month: "short" },
                    )}
                  </span>
                  <Input
                    type="date"
                    value={filters.date}
                    onChange={(e) => {
                      if (isValidDateParam(e.target.value))
                        patchFilters({ date: e.target.value });
                    }}
                    className="absolute inset-0 h-full cursor-pointer opacity-0"
                    aria-label="Fecha"
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-none"
                  aria-label="Día siguiente"
                  onClick={() => shiftDay(1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <label className="relative flex h-9 cursor-pointer items-center justify-center gap-2 border border-border bg-background px-3 text-sm text-muted-foreground @4xl:hidden">
                <CalendarDays className="h-4 w-4" />
                Elegir fecha
                <Input
                  type="date"
                  value=""
                  onChange={(e) => {
                    if (isValidDateParam(e.target.value))
                      patchFilters({ date: e.target.value });
                  }}
                  className="absolute inset-0 h-full cursor-pointer opacity-0"
                  aria-label="Elegir fecha"
                />
              </label>
            )}
          </div>

          <div
            id="orders-filters"
            className={cn(
              "mt-2 grid-cols-2 gap-2 @xl:grid-cols-3 @5xl:mt-3 @5xl:grid-cols-[repeat(5,minmax(0,1fr))_auto]",
              filtersOpen ? "grid" : "hidden @5xl:grid",
            )}
          >
            <AdminFilterSelect
              value={filters.branchId}
              onValueChange={(branchId) => patchFilters({ branchId })}
              placeholder="Sucursal"
              triggerClassName={FILTER_TRIGGER}
              options={[
                { value: "all", label: "Todas las sucursales" },
                ...(branches.data?.map((b) => ({
                  value: String(b.id),
                  label: b.name,
                })) ?? []),
                ...(filters.branchId !== "all" &&
                !branches.data?.some((b) => String(b.id) === filters.branchId)
                  ? [
                      {
                        value: filters.branchId,
                        label: `Sucursal ${filters.branchId}`,
                      },
                    ]
                  : []),
              ]}
            />
            <AdminFilterSelect
              value={filters.fulfillment}
              onValueChange={(fulfillment) => patchFilters({ fulfillment })}
              placeholder="Tipo"
              triggerClassName={FILTER_TRIGGER}
              options={[
                { value: "all", label: "Tipo de entrega" },
                { value: "pickup", label: "Recogida" },
                { value: "delivery", label: "Delivery" },
              ]}
            />
            {
              <>
                <AdminFilterSelect
                  value={filters.status}
                  onValueChange={(status) => patchFilters({ status })}
                  placeholder="Estado"
                  triggerClassName={FILTER_TRIGGER}
                  options={[
                    { value: "all", label: "Estado pedido" },
                    ...Object.entries(ORDER_STATUS_LABELS).map(
                      ([value, label]) => ({
                        value,
                        label,
                      }),
                    ),
                  ]}
                />
                <AdminFilterSelect
                  value={filters.paymentStatus}
                  onValueChange={(paymentStatus) =>
                    patchFilters({ paymentStatus })
                  }
                  placeholder="Pago"
                  triggerClassName={FILTER_TRIGGER}
                  options={[
                    { value: "all", label: "Estado pago" },
                    ...Object.entries(PAYMENT_STATUS_LABELS).map(
                      ([value, label]) => ({
                        value,
                        label,
                      }),
                    ),
                  ]}
                />
                <AdminFilterSelect
                  value={filters.paymentMethod}
                  onValueChange={(paymentMethod) =>
                    patchFilters({ paymentMethod })
                  }
                  placeholder="Forma de pago"
                  triggerClassName={FILTER_TRIGGER}
                  options={[
                    { value: "all", label: "Forma de pago" },
                    ...Object.entries(PAYMENT_METHOD_LABELS).map(
                      ([value, label]) => ({
                        value,
                        label,
                      }),
                    ),
                  ]}
                />
              </>
            }
            {
              <div className="col-span-2 flex items-center gap-2 @xl:col-span-1">
                <Checkbox
                  id="orders-show-done"
                  checked={filters.showDone}
                  onCheckedChange={(checked) =>
                    patchFilters({ showDone: checked === true })
                  }
                  className="rounded-none"
                />
                <Label
                  htmlFor="orders-show-done"
                  className="cursor-pointer font-normal text-sm text-muted-foreground"
                >
                  Mostrar cancelados
                </Label>
              </div>
            }
            <Button
              type="button"
              variant="ghost"
              className="h-9 rounded-none px-3 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
              disabled={!canClear}
              onClick={clearFilters}
            >
              Limpiar
            </Button>
          </div>

          {!isLoading && !isError ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {filteredOrders.length}{" "}
              {filteredOrders.length === 1 ? "pedido" : "pedidos"} · {dayPieces}{" "}
              {dayPieces === 1 ? "pieza" : "piezas"}
            </p>
          ) : null}
        </div>

        {isLoading ? <AdminLoading label="Cargando pedidos…" /> : null}
        {isError ? (
          <AdminError
            title="No se pudieron cargar los pedidos"
            onRetry={() => refetch()}
          />
        ) : null}

        {!isLoading && !isError && slots.length === 0 ? (
          <AdminEmptyState
            icon={CalendarDays}
            title="No hay pedidos para estos filtros"
            description={
              !filters.showDone && cancelledCount > 0
                ? `Hay ${cancelledCount} ${cancelledCount === 1 ? "pedido cancelado" : "pedidos cancelados"} ocultos.`
                : "Prueba otra fecha, ajusta los filtros o registra un pedido."
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {!filters.showDone && cancelledCount > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-none"
                    onClick={() => patchFilters({ showDone: true })}
                  >
                    Mostrar cancelados
                  </Button>
                ) : null}
                {!isToday ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-none"
                    onClick={() => patchFilters({ date: todayValue })}
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
          <OrdersAgendaView
            search={search}
            days={slots}
            showBranch={filters.branchId === "all"}
            showDone={filters.showDone || filters.status === "cancelled"}
            pendingId={pendingId}
            onAdvance={advanceAgenda}
          />
        ) : null}
      </AdminPageShell>
    </AdminLayout>
  );
}
