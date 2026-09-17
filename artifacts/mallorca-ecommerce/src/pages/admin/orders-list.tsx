import { useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Package, Search } from "lucide-react";
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
  AdminFilterBar,
  AdminFilterSelect,
  AdminLoading,
  AdminPageHeader,
  AdminPageShell,
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeader,
  AdminTableRow,
} from "@/components/admin";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { normalizeSearch, readSearchParam, withSearchParams } from "@/lib/admin-search-params";
import {
  fulfillmentLabel,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/lib/order-source";
import {
  dayRange,
  formatOrderTime,
  formatPriceMx,
  formatRelativeShort,
  getPrimaryNextStatus,
  getValidNextStatuses,
  ORDER_STATUS_ACTION_LABELS,
  ORDER_STATUS_LABELS,
} from "@/lib/order-status";
import { cn } from "@/lib/utils";

type DayChip = "today" | "tomorrow" | "week" | "all";

type OrdersFilters = {
  day: DayChip;
  branchId: string;
  status: string;
  fulfillment: string;
  paymentStatus: string;
  paymentMethod: string;
  q: string;
};

function parseDay(value: string | null): DayChip {
  if (value === "today" || value === "tomorrow" || value === "week" || value === "all") {
    return value;
  }
  return "today";
}

function parseOrdersSearch(search: string): OrdersFilters {
  return {
    day: parseDay(readSearchParam(search, "day")),
    branchId: readSearchParam(search, "branchId") || "all",
    status: readSearchParam(search, "status") || "all",
    fulfillment: readSearchParam(search, "fulfillment") || "all",
    paymentStatus: readSearchParam(search, "paymentStatus") || "all",
    paymentMethod: readSearchParam(search, "paymentMethod") || "all",
    q: readSearchParam(search, "q") || "",
  };
}

function orderDetailHref(orderId: string, search: string) {
  const qs = normalizeSearch(search);
  return qs ? `/admin/pedidos/${orderId}?${qs}` : `/admin/pedidos/${orderId}`;
}

export default function AdminOrdersList() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const filters = useMemo(() => parseOrdersSearch(search), [search]);
  const [searchDraft, setSearchDraft] = useState(filters.q);

  const patchFilters = (patch: Partial<OrdersFilters>) => {
    const next = { ...filters, ...patch };
    setLocation(
      withSearchParams("/admin/pedidos", search, {
        day: next.day === "today" ? null : next.day,
        branchId: next.branchId,
        status: next.status,
        fulfillment: next.fulfillment,
        paymentStatus: next.paymentStatus,
        paymentMethod: next.paymentMethod,
        q: next.q || null,
      }),
      { replace: true },
    );
  };

  const range = filters.day === "all" ? undefined : dayRange(filters.day);
  const { data: orders, isLoading, isError, refetch } = useListAdminOrders({
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
    if (filters.paymentStatus !== "all") {
      list = list.filter((o) => o.paymentStatus === filters.paymentStatus);
    }
    if (filters.paymentMethod !== "all") {
      list = list.filter((o) => o.paymentMethod === filters.paymentMethod);
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
  }, [orders, filters.paymentStatus, filters.paymentMethod, filters.q]);

  const handleStatusChange = async (orderId: string, newStatus: OrderStatusUpdateStatus) => {
    try {
      await updateOrder.mutateAsync({ id: orderId, data: { status: newStatus } });
      toast({ title: "Estado actualizado" });
      queryClient.invalidateQueries({ queryKey: getListAdminOrdersQueryKey() });
    } catch {
      toast({ title: "Error actualizando estado", variant: "destructive" });
    }
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

  return (
    <AdminLayout>
      <AdminPageShell>
        <AdminPageHeader
          title="Pedidos"
          description="Identifica, prioriza y abre pedidos que requieren atención."
          actions={
            <Button asChild className="rounded-none shrink-0">
              <Link href="/admin/pedidos/nuevo">+ Nuevo pedido</Link>
            </Button>
          }
        />

        <div className="sticky top-0 z-10 -mx-6 space-y-3 border-b border-border bg-background/95 px-6 py-3 backdrop-blur md:-mx-10 md:px-10">
          <AdminFilterBar>
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => patchFilters({ day: chip.id })}
                className={cn(
                  "border px-3 py-1.5 text-sm transition-colors",
                  filters.day === chip.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted",
                )}
              >
                {chip.label}
              </button>
            ))}
          </AdminFilterBar>

          <AdminFilterBar>
            <AdminFilterSelect
              value={filters.branchId}
              onValueChange={(branchId) => patchFilters({ branchId })}
              placeholder="Sucursal"
              triggerClassName="w-44"
              options={[
                { value: "all", label: "Todas las sucursales" },
                ...(branches.data?.map((b) => ({
                  value: String(b.id),
                  label: b.name,
                })) ?? []),
              ]}
            />
            <AdminFilterSelect
              value={filters.fulfillment}
              onValueChange={(fulfillment) => patchFilters({ fulfillment })}
              placeholder="Tipo"
              triggerClassName="w-36"
              options={[
                { value: "all", label: "Pickup / Delivery" },
                { value: "pickup", label: "Pickup" },
                { value: "delivery", label: "Delivery" },
              ]}
            />
            <AdminFilterSelect
              value={filters.status}
              onValueChange={(status) => patchFilters({ status })}
              placeholder="Estado"
              triggerClassName="w-40"
              options={[
                { value: "all", label: "Estado pedido" },
                ...Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
            />
            <AdminFilterSelect
              value={filters.paymentStatus}
              onValueChange={(paymentStatus) => patchFilters({ paymentStatus })}
              placeholder="Pago"
              triggerClassName="w-40"
              options={[
                { value: "all", label: "Estado pago" },
                ...Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
            />
            <AdminFilterSelect
              value={filters.paymentMethod}
              onValueChange={(paymentMethod) => patchFilters({ paymentMethod })}
              placeholder="Forma de pago"
              triggerClassName="w-44"
              options={[
                { value: "all", label: "Forma de pago" },
                ...Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({
                  value,
                  label,
                })),
              ]}
            />
            <form
              className="relative min-w-[200px] flex-1 max-w-sm"
              onSubmit={(e) => {
                e.preventDefault();
                patchFilters({ q: searchDraft.trim() });
              }}
            >
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="h-9 rounded-none pl-8"
                placeholder="Pedido, cliente, teléfono…"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onBlur={() => {
                  if (searchDraft.trim() !== filters.q) patchFilters({ q: searchDraft.trim() });
                }}
              />
            </form>
          </AdminFilterBar>
        </div>

        {isLoading ? <AdminLoading label="Cargando pedidos…" /> : null}
        {isError ? (
          <AdminError title="No se pudieron cargar los pedidos" onRetry={() => refetch()} />
        ) : null}
        {!isLoading && !isError && filteredOrders.length === 0 ? (
          <AdminEmptyState
            icon={Package}
            title="No se encontraron pedidos"
            description="Prueba otro rango de fechas o crea un pedido manual."
            action={
              <Button asChild className="rounded-none">
                <Link href="/admin/pedidos/nuevo">+ Nuevo pedido</Link>
              </Button>
            }
          />
        ) : null}

        {!isLoading && !isError && filteredOrders.length > 0 ? (
          <AdminTable>
            <AdminTableHeader>
              <AdminTableRow>
                {["Pedido", "Hora / Entrega", "Cliente", "Sucursal", "Total", "Pago", "Estado", "Acciones"].map(
                  (heading) => (
                    <AdminTableHead key={heading}>{heading}</AdminTableHead>
                  ),
                )}
              </AdminTableRow>
            </AdminTableHeader>
            <AdminTableBody>
              {filteredOrders.map((order) => {
                const primary = getPrimaryNextStatus(order.status);
                const href = orderDetailHref(order.id, search);
                const unpaidCash =
                  (order.paymentMethod === "CASH_ON_PICKUP" || order.paymentMethod === "CASH") &&
                  order.paymentStatus === "unpaid";
                return (
                  <AdminTableRow
                    key={order.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setLocation(href)}
                  >
                    <AdminTableCell>
                      <Link
                        href={href}
                        className="font-medium text-primary hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        #{order.orderNumber}
                      </Link>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {formatRelativeShort(order.createdAt)}
                      </div>
                    </AdminTableCell>
                    <AdminTableCell>
                      <div className="font-medium tabular-nums">{formatOrderTime(order.scheduledStart)}</div>
                      <div className="text-xs text-muted-foreground">{fulfillmentLabel(order.fulfillmentMethod)}</div>
                    </AdminTableCell>
                    <AdminTableCell>
                      <div className="font-medium leading-tight">{order.customerName}</div>
                      <div className="text-xs text-muted-foreground">{order.customerPhone}</div>
                    </AdminTableCell>
                    <AdminTableCell className="text-sm">
                      {order.branchName ?? `Sucursal ${order.branchId}`}
                    </AdminTableCell>
                    <AdminTableCell className="font-medium tabular-nums">
                      {formatPriceMx(order.total)}
                    </AdminTableCell>
                    <AdminTableCell>
                      <div className="text-sm">
                        {PAYMENT_METHOD_LABELS[order.paymentMethod ?? ""] ?? order.paymentMethod ?? "—"}
                      </div>
                      <div
                        className={cn(
                          "text-xs font-medium",
                          unpaidCash ? "text-amber-700" : "text-muted-foreground",
                        )}
                      >
                        {PAYMENT_STATUS_LABELS[order.paymentStatus ?? ""] ?? order.paymentStatus}
                      </div>
                    </AdminTableCell>
                    <AdminTableCell>
                      <span className="inline-flex border border-border px-2 py-0.5 text-xs font-medium">
                        {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ??
                          order.status}
                      </span>
                    </AdminTableCell>
                    <AdminTableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" className="h-8 rounded-none px-2" asChild>
                          <Link href={href}>Ver</Link>
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-none">
                            <DropdownMenuItem asChild>
                              <Link href={href}>Ver pedido</Link>
                            </DropdownMenuItem>
                            {primary ? (
                              <DropdownMenuItem
                                disabled={updateOrder.isPending}
                                onClick={() => handleStatusChange(order.id, primary)}
                              >
                                {ORDER_STATUS_ACTION_LABELS[primary] ?? ORDER_STATUS_LABELS[primary]}
                              </DropdownMenuItem>
                            ) : null}
                            {getValidNextStatuses(order.status).includes("cancelled") ? (
                              <DropdownMenuItem
                                disabled={updateOrder.isPending}
                                onClick={() => handleStatusChange(order.id, "cancelled")}
                              >
                                Cancelar
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/pedidos/nuevo?duplicateFrom=${order.id}`}>
                                Duplicar
                              </Link>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </AdminTableCell>
                  </AdminTableRow>
                );
              })}
            </AdminTableBody>
          </AdminTable>
        ) : null}
      </AdminPageShell>
    </AdminLayout>
  );
}
