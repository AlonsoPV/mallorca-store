import type { ReactNode } from "react";
import { Link } from "wouter";
import { AlertTriangle, CalendarDays, Package, ShoppingCart } from "lucide-react";
import {
  useGetAdminSummary,
  useListAdminInventory,
  useListAdminOrders,
  useListInventoryAlerts,
} from "@workspace/api-client-react";
import {
  AdminEmptyState,
  AdminError,
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
import {
  dayRange,
  formatOrderTime,
  formatPriceMx,
  ORDER_STATUS_LABELS,
} from "@/lib/order-status";

const TYPE_LABEL: Record<string, string> = {
  LOW_STOCK: "Stock bajo",
  CRITICAL_STOCK: "Crítico",
  OUT_OF_STOCK: "Agotado",
  INVENTORY_REVIEW: "Revisión",
  RESTOCK_REQUEST: "Reposición",
  INVENTORY_MISMATCH: "Descuadre",
  CUSTOM: "Personalizada",
};

export default function AdminDashboard() {
  const { data: summary, isLoading, isError, refetch } = useGetAdminSummary();
  const upcomingRange = dayRange("today");
  const { data: upcomingOrders } = useListAdminOrders({
    from: upcomingRange.from,
    to: upcomingRange.to,
  });
  const { data: openAlerts } = useListInventoryAlerts({ status: "OPEN" });
  const { data: lowStockRows } = useListAdminInventory({ state: "LOW_STOCK" });

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

  const alertQueue = (openAlerts ?? []).slice(0, 5);
  const stockQueue = (lowStockRows ?? []).slice(0, 5);

  if (isLoading) {
    return (
      <AdminLayout>
        <AdminPageShell>
          <AdminLoading label="Cargando resumen…" />
        </AdminPageShell>
      </AdminLayout>
    );
  }

  if (isError || !summary) {
    return (
      <AdminLayout>
        <AdminPageShell>
          <AdminError
            title="Error al cargar datos"
            description="No pudimos conectar con el servidor para obtener el resumen."
            onRetry={() => refetch()}
          />
        </AdminPageShell>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <AdminPageShell>
        <AdminPageHeader
          title={`${greeting}. Esto requiere tu atención.`}
          description="Centro de acción del día."
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <ActionCard
            href="/admin/pedidos?day=today"
            title="Pedidos hoy"
            primary={`${summary.ordersToday}`}
            secondary={`${summary.ordersPending} pendientes · ${summary.ordersNextHour} en 60 min`}
            icon={<ShoppingCart className="h-4 w-4" />}
          />
          <ActionCard
            href="/admin/inventario?state=LOW_STOCK"
            title="Inventario"
            primary={`${summary.lowStockProducts + (summary.criticalStockProducts ?? 0) + summary.outOfStockProducts}`}
            secondary={`${summary.lowStockProducts} bajo · ${summary.criticalStockProducts ?? 0} crítico · ${summary.outOfStockProducts} agotado`}
            icon={<Package className="h-4 w-4" />}
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
            primary={`${summary.alertsCount}`}
            secondary="requieren atención"
            icon={<AlertTriangle className="h-4 w-4" />}
            alert={summary.alertsCount > 0}
          />
          <ActionCard
            href="/admin/reportes"
            title="Ventas"
            primary={formatPriceMx(summary.salesToday)}
            secondary="hoy"
            icon={<CalendarDays className="h-4 w-4" />}
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

        <QueueSection
          title="Próximos pedidos"
          href="/admin/agenda"
          linkLabel="Abrir agenda"
          emptyIcon={ShoppingCart}
          emptyTitle="No hay pedidos activos para hoy"
          emptyDescription="Los próximos pedidos del día aparecerán aquí."
          isEmpty={nextOrders.length === 0}
        >
          <AdminTable containerClassName="border-0">
            <AdminTableHeader>
              <AdminTableRow>
                {["Hora", "Pedido", "Sucursal", "Tipo", "Estado"].map((heading) => (
                  <AdminTableHead key={heading}>{heading}</AdminTableHead>
                ))}
              </AdminTableRow>
            </AdminTableHeader>
            <AdminTableBody>
              {nextOrders.map((order) => (
                <AdminTableRow key={order.id}>
                  <AdminTableCell>{formatOrderTime(order.scheduledStart)}</AdminTableCell>
                  <AdminTableCell>
                    <Link
                      href={`/admin/pedidos/${order.id}`}
                      className="text-primary hover:underline"
                    >
                      #{order.orderNumber}
                    </Link>
                  </AdminTableCell>
                  <AdminTableCell>
                    {order.branchName ?? `Sucursal ${order.branchId}`}
                  </AdminTableCell>
                  <AdminTableCell className="capitalize">{order.fulfillmentMethod}</AdminTableCell>
                  <AdminTableCell>
                    {ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS] ??
                      order.status}
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        </QueueSection>

        <QueueSection
          title="Alertas abiertas"
          href="/admin/alertas"
          linkLabel="Ver alertas"
          emptyIcon={AlertTriangle}
          emptyTitle="Sin alertas abiertas"
          emptyDescription="Las alertas de inventario aparecerán aquí."
          isEmpty={alertQueue.length === 0}
        >
          <AdminTable containerClassName="border-0">
            <AdminTableHeader>
              <AdminTableRow>
                {["Producto", "Sucursal", "Tipo", "Prioridad"].map((heading) => (
                  <AdminTableHead key={heading}>{heading}</AdminTableHead>
                ))}
              </AdminTableRow>
            </AdminTableHeader>
            <AdminTableBody>
              {alertQueue.map((row) => {
                const alert = row.alert as any;
                const branchId = row.branch?.id ?? alert?.branchId;
                const stockHref = branchId
                  ? `/admin/inventario?branchId=${branchId}`
                  : "/admin/inventario";
                return (
                  <AdminTableRow key={alert.id}>
                    <AdminTableCell>
                      <Link
                        href={
                          row.product?.id
                            ? `/admin/productos/${row.product.id}`
                            : stockHref
                        }
                        className="font-medium text-primary hover:underline"
                      >
                        {row.product?.name ?? "Producto"}
                      </Link>
                    </AdminTableCell>
                    <AdminTableCell>
                      <Link href={stockHref} className="hover:underline">
                        {row.branch?.name ?? "—"}
                      </Link>
                    </AdminTableCell>
                    <AdminTableCell>
                      {TYPE_LABEL[alert.type] ?? alert.type ?? "—"}
                    </AdminTableCell>
                    <AdminTableCell>{alert.priority ?? "—"}</AdminTableCell>
                  </AdminTableRow>
                );
              })}
            </AdminTableBody>
          </AdminTable>
        </QueueSection>

        <QueueSection
          title="Stock a revisar"
          href="/admin/inventario?state=LOW_STOCK"
          linkLabel="Abrir inventario"
          emptyIcon={Package}
          emptyTitle="Sin stock bajo"
          emptyDescription="Los productos con stock bajo aparecerán aquí."
          isEmpty={stockQueue.length === 0}
        >
          <AdminTable containerClassName="border-0">
            <AdminTableHeader>
              <AdminTableRow>
                {["Producto", "Sucursal", "Disponible", "Mínimo"].map((heading) => (
                  <AdminTableHead key={heading}>{heading}</AdminTableHead>
                ))}
              </AdminTableRow>
            </AdminTableHeader>
            <AdminTableBody>
              {stockQueue.map((row) => {
                const stock = (row as any).branchProduct?.inventory ?? 0;
                const reserved = (row as any).reservedStock ?? 0;
                const available = (row as any).availableStock ?? Math.max(0, stock - reserved);
                const minStock = (row as any).branchProduct?.minStock ?? 0;
                return (
                  <AdminTableRow key={`${row.product.id}-${row.branch.id}`}>
                    <AdminTableCell>
                      <Link
                        href={`/admin/inventario?branchId=${row.branch.id}&state=LOW_STOCK`}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.product.name}
                      </Link>
                    </AdminTableCell>
                    <AdminTableCell>{row.branch.name}</AdminTableCell>
                    <AdminTableCell>{available}</AdminTableCell>
                    <AdminTableCell>{minStock}</AdminTableCell>
                  </AdminTableRow>
                );
              })}
            </AdminTableBody>
          </AdminTable>
        </QueueSection>

        <section className="border border-border bg-background">
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-medium">Estado por sucursal</h2>
          </div>
          <div className="divide-y divide-border">
            {summary.branchSummaries.map((branch) => (
              <Link
                key={branch.branchId}
                href={`/admin/sucursales/${branch.branchId}`}
                className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
              >
                <span className="font-medium">{branch.branchName}</span>
                <span className="text-sm text-muted-foreground">
                  {branch.activeProducts} activos · {branch.lowStockProducts} stock bajo
                </span>
              </Link>
            ))}
          </div>
        </section>
      </AdminPageShell>
    </AdminLayout>
  );
}

function QueueSection({
  title,
  href,
  linkLabel,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  isEmpty,
  children,
}: {
  title: string;
  href: string;
  linkLabel: string;
  emptyIcon: typeof ShoppingCart;
  emptyTitle: string;
  emptyDescription: string;
  isEmpty: boolean;
  children: ReactNode;
}) {
  return (
    <section className="border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-medium">{title}</h2>
        <Link href={href} className="text-sm text-primary hover:underline">
          {linkLabel}
        </Link>
      </div>
      {isEmpty ? (
        <AdminEmptyState
          icon={emptyIcon}
          title={emptyTitle}
          description={emptyDescription}
          className="border-0 py-8 md:p-8"
        />
      ) : (
        children
      )}
    </section>
  );
}

function ActionCard({
  href,
  title,
  primary,
  secondary,
  icon,
  alert,
}: {
  href: string;
  title: string;
  primary: string;
  secondary: string;
  icon: ReactNode;
  alert?: boolean;
}) {
  return (
    <Link href={href}>
      <div
        className={`h-full cursor-pointer border bg-background px-4 py-3 transition-colors hover:border-primary/40 ${
          alert ? "border-amber-500/50" : "border-border"
        }`}
      >
        <div className="mb-1 flex items-center justify-between text-muted-foreground">
          <span className="text-xs font-medium uppercase tracking-wide">{title}</span>
          {icon}
        </div>
        <p className="text-xl font-medium leading-tight">{primary}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{secondary}</p>
      </div>
    </Link>
  );
}
