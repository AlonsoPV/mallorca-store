import { AdminLayout } from "@/components/layout/admin-layout";
import {
  useListAdminOrders,
  useListAdminBranches,
  useUpdateAdminOrder,
  getListAdminOrdersQueryKey,
  type OrderStatusUpdateStatus,
} from "@workspace/api-client-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  formatOrderTime,
  getPrimaryNextStatus,
  getValidNextStatuses,
  ORDER_STATUS_ACTION_LABELS,
  ORDER_STATUS_LABELS,
  startOfDay,
} from "@/lib/order-status";

function toDateInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export default function AdminAgenda() {
  const [branchId, setBranchId] = useState<string>("all");
  const [dateValue, setDateValue] = useState(() => toDateInputValue(new Date()));
  const branches = useListAdminBranches();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateOrder = useUpdateAdminOrder();

  const range = useMemo(() => {
    const day = startOfDay(new Date(`${dateValue}T12:00:00`));
    return { from: day.toISOString(), to: addDays(day, 1).toISOString() };
  }, [dateValue]);

  const { data: orders, isLoading } = useListAdminOrders({
    branchId: branchId === "all" ? undefined : Number(branchId),
    from: range.from,
    to: range.to,
  });

  const slots = useMemo(() => {
    const map = new Map<string, typeof orders>();
    for (const order of orders ?? []) {
      if (order.status === "cancelled" || order.status === "completed") continue;
      const key = formatOrderTime(order.scheduledStart);
      const list = map.get(key) ?? [];
      list.push(order);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [orders]);

  const advance = async (orderId: string, status: OrderStatusUpdateStatus) => {
    try {
      await updateOrder.mutateAsync({ id: orderId, data: { status } });
      toast({ title: "Estado actualizado" });
      queryClient.invalidateQueries({ queryKey: getListAdminOrdersQueryKey() });
    } catch {
      toast({ title: "Transición no válida", variant: "destructive" });
    }
  };

  return (
    <AdminLayout>
      <div className="p-6 md:p-10 flex-1 overflow-y-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="font-serif text-3xl mb-2">Agenda</h1>
          <p className="text-muted-foreground text-sm">
            Producción y mostrador por fecha y hora.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 mb-8">
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="w-56 rounded-none bg-background">
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
          <Input
            type="date"
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
            className="w-48 rounded-none bg-background"
          />
          <Button
            type="button"
            variant="outline"
            className="rounded-none"
            onClick={() => setDateValue(toDateInputValue(new Date()))}
          >
            Hoy
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : slots.length === 0 ? (
          <div className="border border-border bg-background p-10 text-center text-muted-foreground">
            No hay pedidos programados para esta fecha.
          </div>
        ) : (
          <div className="space-y-8">
            {slots.map(([time, slotOrders]) => (
              <section key={time} className="space-y-3">
                <h2 className="text-xl font-serif">{time}</h2>
                <div className="space-y-3">
                  {(slotOrders ?? []).map((order) => {
                    const primary = getPrimaryNextStatus(order.status);
                    const next = getValidNextStatuses(order.status);
                    return (
                      <div
                        key={order.id}
                        className="border border-border bg-background p-4 flex flex-col gap-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <Link
                              href={`/admin/pedidos/${order.id}`}
                              className="font-medium text-primary hover:underline"
                            >
                              Pedido #{order.orderNumber}
                            </Link>
                            <span className="text-muted-foreground ml-2 capitalize">
                              · {order.fulfillmentMethod}
                            </span>
                            <p className="mt-1">{order.customerName}</p>
                            <p className="text-xs text-muted-foreground">
                              {order.branchName ?? `Sucursal ${order.branchId}`}
                            </p>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ??
                              order.status}
                          </span>
                        </div>
                        <ul className="text-sm text-muted-foreground space-y-0.5">
                          {(order.items ?? []).map((item, idx) => (
                            <li key={`${order.id}-${idx}`}>
                              {item.quantity} × {item.name}
                            </li>
                          ))}
                        </ul>
                        <div className="flex flex-wrap gap-2">
                          {primary ? (
                            <Button
                              size="sm"
                              className="rounded-none"
                              disabled={updateOrder.isPending}
                              onClick={() => advance(order.id, primary)}
                            >
                              {ORDER_STATUS_ACTION_LABELS[primary] ?? ORDER_STATUS_LABELS[primary]}
                            </Button>
                          ) : null}
                          {next
                            .filter((s) => s !== primary)
                            .map((status) => (
                              <Button
                                key={status}
                                size="sm"
                                variant="outline"
                                className="rounded-none"
                                disabled={updateOrder.isPending}
                                onClick={() => advance(order.id, status)}
                              >
                                {ORDER_STATUS_ACTION_LABELS[status] ?? ORDER_STATUS_LABELS[status]}
                              </Button>
                            ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
