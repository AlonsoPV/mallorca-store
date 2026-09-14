import { AdminLayout } from "@/components/layout/admin-layout";
import { useGetAdminSummary, useListAdminOrders } from "@workspace/api-client-react";
import { AlertTriangle, CalendarDays, Package, ShoppingCart } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import {
  dayRange,
  formatOrderTime,
  formatPriceMx,
  ORDER_STATUS_LABELS,
} from "@/lib/order-status";

export default function AdminDashboard() {
  const { data: summary, isLoading, isError } = useGetAdminSummary();
  const upcomingRange = dayRange("today");
  const { data: upcomingOrders } = useListAdminOrders({
    from: upcomingRange.from,
    to: upcomingRange.to,
  });

  const greetingHour = new Date().getHours();
  const greeting =
    greetingHour < 12 ? "Buenos días" : greetingHour < 19 ? "Buenas tardes" : "Buenas noches";

  const nextOrders = (upcomingOrders ?? [])
    .filter((o) => !["cancelled", "completed"].includes(o.status))
    .sort(
      (a, b) =>
        new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime(),
    )
    .slice(0, 6);

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-8">
          <div className="h-10 w-64 bg-muted animate-pulse mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-muted animate-pulse" />
            ))}
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (isError || !summary) {
    return (
      <AdminLayout>
        <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-2xl font-bold mb-2">Error al cargar datos</h2>
          <p className="text-muted-foreground mb-6">
            No pudimos conectar con el servidor para obtener el resumen.
          </p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex-1 overflow-y-auto bg-muted/20">
        <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
          <div>
            <h1 className="text-3xl font-serif tracking-tight text-foreground">
              {greeting}. Esto requiere tu atención.
            </h1>
            <p className="text-muted-foreground mt-1">Centro de acción del día.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <ActionCard
              href="/admin/pedidos?day=today"
              title="Pedidos hoy"
              lines={[
                `${summary.ordersToday} pedidos`,
                `${summary.ordersPending} pendientes`,
                `${summary.ordersNextHour} próximos en 60 min`,
              ]}
              icon={<ShoppingCart className="h-5 w-5" />}
            />
            <ActionCard
              href="/admin/inventario?state=LOW_STOCK"
              title="Inventario"
              lines={[
                `${summary.lowStockProducts} con stock bajo`,
                `${summary.criticalStockProducts ?? 0} críticos`,
                `${summary.outOfStockProducts} agotados`,
              ]}
              icon={<Package className="h-5 w-5" />}
              alert={
                summary.lowStockProducts +
                  (summary.criticalStockProducts ?? 0) +
                  summary.outOfStockProducts >
                0
              }
            />
            <ActionCard
              href="/admin/alertas"
              title="Alertas"
              lines={[`${summary.alertsCount} requieren atención`]}
              icon={<AlertTriangle className="h-5 w-5" />}
              alert={summary.alertsCount > 0}
            />
            <ActionCard
              href="/admin/reportes"
              title="Ventas"
              lines={[formatPriceMx(summary.salesToday) + " hoy"]}
              icon={<CalendarDays className="h-5 w-5" />}
            />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild className="rounded-none">
              <Link href="/admin/pedidos/nuevo">+ Nuevo pedido</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-none">
              <Link href="/admin/agenda">Ver agenda</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-none">
              <Link href="/admin/pedidos?day=today">Ver pedidos</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-none">
              <Link href="/admin/inventario?state=LOW_STOCK">Revisar inventario</Link>
            </Button>
          </div>

          <section className="bg-background border border-border">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-medium">Próximos pedidos</h2>
              <Link href="/admin/agenda" className="text-sm text-primary hover:underline">
                Abrir agenda
              </Link>
            </div>
            {nextOrders.length === 0 ? (
              <p className="p-6 text-muted-foreground text-sm">No hay pedidos activos para hoy.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                    <tr>
                      <th className="text-left px-5 py-3 font-medium">Hora</th>
                      <th className="text-left px-5 py-3 font-medium">Pedido</th>
                      <th className="text-left px-5 py-3 font-medium">Sucursal</th>
                      <th className="text-left px-5 py-3 font-medium">Tipo</th>
                      <th className="text-left px-5 py-3 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {nextOrders.map((order) => (
                      <tr key={order.id} className="hover:bg-muted/30">
                        <td className="px-5 py-3">{formatOrderTime(order.scheduledStart)}</td>
                        <td className="px-5 py-3">
                          <Link
                            href={`/admin/pedidos/${order.id}`}
                            className="text-primary hover:underline"
                          >
                            #{order.orderNumber}
                          </Link>
                        </td>
                        <td className="px-5 py-3">
                          {order.branchName ?? `Sucursal ${order.branchId}`}
                        </td>
                        <td className="px-5 py-3 capitalize">{order.fulfillmentMethod}</td>
                        <td className="px-5 py-3">
                          {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ??
                            order.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="bg-background border border-border p-5">
            <h2 className="font-medium mb-4">Estado por sucursal</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {summary.branchSummaries.map((branch) => (
                <Link
                  key={branch.branchId}
                  href={`/admin/sucursales/${branch.branchId}`}
                  className="border border-border p-4 hover:bg-muted/40 transition-colors block"
                >
                  <div className="font-medium">{branch.branchName}</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {branch.activeProducts} productos activos · {branch.lowStockProducts} stock bajo
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}

function ActionCard({
  href,
  title,
  lines,
  icon,
  alert,
}: {
  href: string;
  title: string;
  lines: string[];
  icon: ReactNode;
  alert?: boolean;
}) {
  return (
    <Link href={href}>
      <div
        className={`h-full border bg-background p-5 hover:border-primary/40 transition-colors cursor-pointer ${
          alert ? "border-amber-500/50" : "border-border"
        }`}
      >
        <div className="flex items-center justify-between mb-3 text-muted-foreground">
          <span className="text-sm font-medium uppercase tracking-wide">{title}</span>
          {icon}
        </div>
        <div className="space-y-1">
          {lines.map((line) => (
            <p key={line} className="text-lg font-medium leading-tight">
              {line}
            </p>
          ))}
        </div>
      </div>
    </Link>
  );
}
