import { AdminLayout } from "@/components/layout/admin-layout";
import {
  useListAdminOrders,
  useUpdateAdminOrder,
  getListAdminOrdersQueryKey,
  useListAdminBranches,
  type OrderStatusUpdateStatus,
} from "@workspace/api-client-react";
import { useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ORDER_SOURCE_LABELS } from "@/lib/order-source";
import { useQueryClient } from "@tanstack/react-query";
import {
  dayRange,
  formatOrderTime,
  formatPriceMx,
  getValidNextStatuses,
  ORDER_STATUS_LABELS,
} from "@/lib/order-status";
import { cn } from "@/lib/utils";

type DayChip = "today" | "tomorrow" | "week" | "all";

function parseDayFromSearch(search: string): DayChip {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const day = params.get("day");
  if (day === "today" || day === "tomorrow" || day === "week") return day;
  return "today";
}

export default function AdminOrdersList() {
  const search = useSearch();
  const [dayChip, setDayChip] = useState<DayChip>(() => parseDayFromSearch(search));
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState<string>("all");

  const range = dayChip === "all" ? undefined : dayRange(dayChip);
  const { data: orders, isLoading } = useListAdminOrders({
    status: statusFilter === "all" ? undefined : statusFilter,
    branchId: branchFilter === "all" ? undefined : Number(branchFilter),
    fulfillmentMethod:
      fulfillmentFilter === "all"
        ? undefined
        : (fulfillmentFilter as "pickup" | "delivery"),
    from: range?.from,
    to: range?.to,
  });
  const branches = useListAdminBranches();
  const updateOrder = useUpdateAdminOrder();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      <div className="p-6 md:p-10 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="font-serif text-3xl mb-2 text-foreground">Pedidos</h1>
              <p className="text-muted-foreground text-sm">
                Gestión operativa por fecha, sucursal y estado.
              </p>
            </div>
            <Button asChild className="rounded-none shrink-0">
              <Link href="/admin/pedidos/nuevo">+ Nuevo pedido</Link>
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setDayChip(chip.id)}
                className={cn(
                  "px-3 py-1.5 text-sm border transition-colors",
                  dayChip === chip.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-foreground hover:bg-muted",
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="bg-background rounded-none w-44">
                <SelectValue placeholder="Sucursal" />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="all">Todas las sucursales</SelectItem>
                {branches.data?.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fulfillmentFilter} onValueChange={setFulfillmentFilter}>
              <SelectTrigger className="bg-background rounded-none w-40">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="all">Pickup / Delivery</SelectItem>
                <SelectItem value="pickup">Pickup</SelectItem>
                <SelectItem value="delivery">Delivery</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-background rounded-none w-44">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="all">Todos los estados</SelectItem>
                {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !orders || orders.length === 0 ? (
          <div className="bg-background border border-border p-12 text-center text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>No se encontraron pedidos.</p>
          </div>
        ) : (
          <div className="bg-background border border-border overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Pedido</th>
                  <th className="px-4 py-3 font-medium">Origen</th>
                  <th className="px-4 py-3 font-medium">Hora</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Sucursal</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((order) => {
                  const nextStatuses = getValidNextStatuses(order.status);
                  return (
                    <tr key={order.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link href={`/admin/pedidos/${order.id}`} className="font-medium text-primary hover:underline">
                          #{order.orderNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {ORDER_SOURCE_LABELS[order.orderSource ?? "STOREFRONT"] ?? order.orderSource ?? "Web"}
                      </td>
                      <td className="px-4 py-3">{formatOrderTime(order.scheduledStart)}</td>
                      <td className="px-4 py-3">{order.customerName}</td>
                      <td className="px-4 py-3">{order.branchName ?? `Sucursal ${order.branchId}`}</td>
                      <td className="px-4 py-3 capitalize">{order.fulfillmentMethod}</td>
                      <td className="px-4 py-3">{formatPriceMx(order.total)}</td>
                      <td className="px-4 py-3 min-w-[180px]">
                        {nextStatuses.length === 0 ? (
                          <span className="text-muted-foreground">
                            {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ??
                              order.status}
                          </span>
                        ) : (
                          <Select
                            value={order.status}
                            onValueChange={(value) =>
                              handleStatusChange(order.id, value as OrderStatusUpdateStatus)
                            }
                          >
                            <SelectTrigger className="h-8 rounded-none bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-none">
                              <SelectItem value={order.status} disabled>
                                {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ??
                                  order.status}
                              </SelectItem>
                              {nextStatuses.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {ORDER_STATUS_LABELS[status]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
