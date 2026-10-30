import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAdminBranch,
  useListBranchAssignments,
  useListAdminUsers,
  useCreateBranchAssignment,
  useUpdateBranchAssignment,
  useDeleteBranchAssignment,
  useUpdateAdminBranch,
  useListBranchAudit,
  getGetAdminBranchQueryKey,
  getListBranchAssignmentsQueryKey,
  getListBranchAuditQueryKey,
} from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { formatOrderTime, formatPriceMx, ORDER_STATUS_LABELS } from "@/lib/order-status";
import { cn } from "@/lib/utils";
import { sanitizeErrorCopy } from "@/lib/cart-recovery";
import {
  ArrowLeft,
  Bell,
  Boxes,
  CalendarDays,
  ClipboardList,
  Clock3,
  LayoutDashboard,
  Package,
  Settings2,
  Users,
} from "lucide-react";

const BRANCH_TABS = [
  { label: "Resumen", icon: LayoutDashboard, group: "ops" },
  { label: "Pedidos", icon: ClipboardList, group: "ops" },
  { label: "Agenda", icon: CalendarDays, group: "ops" },
  { label: "Inventario", icon: Boxes, group: "ops" },
  { label: "Alertas", icon: Bell, group: "ops" },
  { label: "Productos", icon: Package, group: "catalog" },
  { label: "Horarios", icon: Clock3, group: "admin" },
  { label: "Equipo", icon: Users, group: "admin" },
  { label: "Configuración", icon: Settings2, group: "admin" },
] as const;

/** Tab indices after operational reordering (Inventario/Alertas before Productos). */
const TAB = {
  resumen: 0,
  pedidos: 1,
  agenda: 2,
  inventario: 3,
  alertas: 4,
  productos: 5,
  horarios: 6,
  equipo: 7,
  configuracion: 8,
} as const;

const BRANCH_STATUS_LABEL: Record<string, string> = {
  active: "Activa",
  inactive: "Inactiva",
  archived: "Archivada",
};

function branchStatus(branch: { status?: string | null; active?: boolean | null }) {
  return branch.status || (branch.active ? "active" : "inactive");
}

function DataTable({
  columns,
  rows,
  empty,
  emptyAction,
}: {
  columns: string[];
  rows: React.ReactNode[][];
  empty: string;
  emptyAction?: React.ReactNode;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center space-y-3">
        <p className="text-muted-foreground text-sm">{empty}</p>
        {emptyAction}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            {columns.map((c) => (
              <th key={c} className="text-left px-3 py-2 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminBranchDetail() {
  const { id } = useParams<{ id: string }>();
  const branchId = Number(id);
  const query = useGetAdminBranch(branchId);
  const assignments = useListBranchAssignments(branchId, {
    query: { enabled: Number.isFinite(branchId), queryKey: getListBranchAssignmentsQueryKey(branchId) },
  });
  const users = useListAdminUsers();
  const audit = useListBranchAudit(branchId, {
    query: {
      enabled: Number.isFinite(branchId),
      queryKey: getListBranchAuditQueryKey(branchId),
    },
  });
  const createAssign = useCreateBranchAssignment();
  const updateAssign = useUpdateBranchAssignment();
  const deleteAssign = useDeleteBranchAssignment();
  const updateBranch = useUpdateAdminBranch();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState(0);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignRole, setAssignRole] = useState<"branch_manager" | "staff" | "operations">("staff");

  const data = query.data;
  const summary = (data as any)?.summary;
  const branch = data?.branch;
  const status = branch ? branchStatus(branch) : "inactive";

  const agendaOrders = useMemo(() => {
    const orders = Array.isArray(data?.orders) ? [...data.orders] : [];
    return orders
      .filter((o: any) => !["cancelled", "completed"].includes(o.status))
      .sort(
        (a: any, b: any) =>
          new Date(a.scheduledStart ?? 0).getTime() - new Date(b.scheduledStart ?? 0).getTime(),
      )
      .slice(0, 20);
  }, [data]);

  async function refresh() {
    await qc.invalidateQueries({ queryKey: getGetAdminBranchQueryKey(branchId) });
    await qc.invalidateQueries({ queryKey: getListBranchAssignmentsQueryKey(branchId) });
  }

  async function saveConfig(patch: Record<string, unknown>) {
    try {
      await updateBranch.mutateAsync({ id: branchId, data: patch as any });
      toast({ title: "Configuración guardada" });
      await refresh();
    } catch (err: any) {
      toast({ title: "No se pudo guardar", description: sanitizeErrorCopy(err, "Inténtalo de nuevo."), variant: "notice" });
    }
  }

  return (
    <AdminLayout>
      <div className="@container space-y-6 overflow-auto p-4 sm:p-6 md:p-10">
        {query.isLoading ? (
          <p>Cargando sucursal…</p>
        ) : query.error || !data || !branch ? (
          <p className="text-destructive">No se pudo cargar la sucursal.</p>
        ) : (
          <>
            <div className="space-y-4">
              <Link
                href="/admin/sucursales"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                Sucursales
              </Link>
              <div className="flex flex-col gap-4 @min-[46rem]:flex-row @min-[46rem]:items-end @min-[46rem]:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h1 className="font-serif text-[1.75rem] font-bold leading-tight sm:text-3xl">{branch.name}</h1>
                    {branch.branchCode ? (
                      <span className="font-mono text-xs tracking-wide text-muted-foreground">{branch.branchCode}</span>
                    ) : null}
                    <span
                      className={cn(
                        "text-[11px] font-semibold uppercase tracking-[0.12em]",
                        status === "active" && "text-emerald-700",
                        status === "inactive" && "text-amber-800",
                        status === "archived" && "text-muted-foreground",
                      )}
                    >
                      {BRANCH_STATUS_LABEL[status] || status}
                    </span>
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                    {branch.address}
                    {branch.phone ? <span className="whitespace-nowrap"> · {branch.phone}</span> : null}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 @min-[24rem]:grid-cols-3 @min-[46rem]:flex @min-[46rem]:shrink-0">
                  <Button variant="outline" className="h-9 rounded-none px-3" asChild>
                    <Link href={`/admin/sucursales/${branchId}/editar`}>Editar</Link>
                  </Button>
                  <Button variant="outline" className="h-9 rounded-none px-3" asChild>
                    <Link href={`/admin/pedidos/nuevo?branchId=${branchId}`}>Nuevo pedido</Link>
                  </Button>
                  <Button className="col-span-2 h-9 rounded-none px-3 @min-[24rem]:col-span-1" asChild>
                    <Link href={`/admin/pedidos?view=agenda&branchId=${branchId}`}>Abrir agenda</Link>
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 @min-[34rem]:grid-cols-4 @min-[34rem]:gap-3">
              {(
                [
                  {
                    label: "Pedidos hoy",
                    value: String(summary?.ordersToday ?? 0),
                    goTo: TAB.pedidos,
                  },
                  {
                    label: "Ventas hoy",
                    value: formatPriceMx(summary?.salesToday ?? 0),
                    goTo: TAB.pedidos,
                  },
                  {
                    label: "Alertas",
                    value: String(summary?.alertsOpen ?? 0),
                    goTo: TAB.alertas,
                    emphasize: (summary?.alertsOpen ?? 0) > 0,
                  },
                  {
                    label: "Agotados",
                    value: String(summary?.outOfStock ?? 0),
                    goTo: TAB.inventario,
                    emphasize: (summary?.outOfStock ?? 0) > 0,
                  },
                ] as const
              ).map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setTab(item.goTo)}
                  className={cn(
                    "min-w-0 border border-border bg-background px-3 py-3 text-left transition-colors hover:border-foreground/30 hover:bg-muted/40",
                    tab === item.goTo && "border-foreground/40 bg-muted/30",
                  )}
                >
                  <div className="text-[10px] font-semibold uppercase leading-tight tracking-[0.06em] text-muted-foreground @min-[34rem]:text-[11px]">
                    {item.label}
                  </div>
                  <div
                    className={cn(
                      "mt-2 text-2xl font-semibold leading-none tracking-tight tabular-nums",
                      "emphasize" in item && item.emphasize && "text-amber-800",
                    )}
                  >
                    {item.value}
                  </div>
                </button>
              ))}
            </div>

            <nav
              role="tablist"
              aria-label="Secciones de la sucursal"
              className="sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto bg-muted/30 px-1 py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {BRANCH_TABS.map((item, i) => {
                const Icon = item.icon;
                const selected = tab === i;
                const showDivider = i > 0 && BRANCH_TABS[i - 1].group !== item.group;
                const badge =
                  item.label === "Alertas" && (summary?.alertsOpen ?? 0) > 0
                    ? summary.alertsOpen
                    : item.label === "Pedidos" && (summary?.ordersToday ?? 0) > 0
                      ? summary.ordersToday
                      : null;
                return (
                  <div key={item.label} className="flex shrink-0 items-center gap-1">
                    {showDivider ? (
                      <span className="mx-0.5 h-6 w-px shrink-0 bg-border" aria-hidden />
                    ) : null}
                    <button
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setTab(i)}
                      className={cn(
                        "inline-flex h-10 items-center gap-2 px-3 text-sm font-medium whitespace-nowrap transition-colors",
                        selected
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span>{item.label}</span>
                      {badge != null ? (
                        <span
                          className={cn(
                            "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums",
                            selected
                              ? "bg-primary-foreground/20 text-primary-foreground"
                              : "bg-amber-100 text-amber-900",
                          )}
                        >
                          {badge}
                        </span>
                      ) : null}
                    </button>
                  </div>
                );
              })}
            </nav>

            {tab === TAB.resumen && (
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h2 className="font-semibold">Próximos pedidos</h2>
                  {(summary?.upcoming?.length ? summary.upcoming : []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay pedidos programados para hoy.</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {summary.upcoming.map((o: any) => (
                        <li key={o.id} className="flex justify-between border rounded-md px-3 py-2">
                          <Link href={`/admin/pedidos/${o.id}`} className="hover:text-primary">
                            {formatOrderTime(o.scheduledStart)} · #{o.orderNumber ?? o.id}
                          </Link>
                          <span>{formatPriceMx(o.total)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="space-y-3">
                  <h2 className="font-semibold">Stock crítico</h2>
                  {(summary?.lowStockProducts?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin productos en stock crítico.</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {summary.lowStockProducts.map((name: string) => (
                        <li key={name} className="border rounded-md px-3 py-2">
                          {name}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/admin/pedidos?branchId=${branchId}`}>Ver pedidos</Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/admin/inventario?branchId=${branchId}`}>Ver inventario</Link>
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {tab === TAB.pedidos && (
              <DataTable
                columns={["#", "Cliente", "Total", "Estado", ""]}
                empty="No hay pedidos en esta sucursal."
                emptyAction={
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/pedidos?branchId=${branchId}`}>Ir a pedidos</Link>
                  </Button>
                }
                rows={(Array.isArray(data.orders) ? data.orders : []).slice(0, 30).map((o: any) => [
                  `#${o.id}`,
                  o.customerName || o.userId || "—",
                  formatPriceMx(o.total),
                  ORDER_STATUS_LABELS[o.status as keyof typeof ORDER_STATUS_LABELS] || o.status,
                  <Link key="l" href={`/admin/pedidos/${o.id}`} className="text-primary text-xs">
                    Ver
                  </Link>,
                ])}
              />
            )}

            {tab === TAB.agenda && (
              <DataTable
                columns={["Hora", "Pedido", "Estado", ""]}
                empty="No hay pedidos activos en agenda."
                emptyAction={
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/pedidos?view=agenda&branchId=${branchId}`}>Abrir agenda completa</Link>
                  </Button>
                }
                rows={agendaOrders.map((o: any) => [
                  formatOrderTime(o.scheduledStart),
                  `#${o.orderNumber ?? o.id}`,
                  ORDER_STATUS_LABELS[o.status as keyof typeof ORDER_STATUS_LABELS] || o.status,
                  <Link key="l" href={`/admin/pedidos/${o.id}`} className="text-primary text-xs">
                    Ver
                  </Link>,
                ])}
              />
            )}

            {tab === TAB.inventario && (
              <DataTable
                columns={["Producto", "SKU", "Stock", "Mínimo", "Estado"]}
                empty="No hay inventario en esta sucursal."
                emptyAction={
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/inventario?branchId=${branchId}`}>Abrir inventario</Link>
                  </Button>
                }
                rows={(Array.isArray(data.inventory) ? data.inventory : []).map((row: any) => [
                  row.product?.name || "—",
                  row.product?.sku || "—",
                  row.configuration?.inventory ?? 0,
                  row.configuration?.minStock ?? 0,
                  row.configuration?.alertState || "NORMAL",
                ])}
              />
            )}

            {tab === TAB.alertas && (
              <DataTable
                columns={["Producto", "Estado", "Stock", "Fecha"]}
                empty="No hay alertas abiertas."
                emptyAction={
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/alertas?branchId=${branchId}`}>Ver módulo de alertas</Link>
                  </Button>
                }
                rows={(Array.isArray(data.alerts) ? data.alerts : []).map((row: any) => [
                  row.product?.name || "—",
                  row.alert?.state || row.alert?.type || "—",
                  row.alert?.stock ?? "—",
                  row.alert?.createdAt ? new Date(row.alert.createdAt).toLocaleString("es-MX") : "—",
                ])}
              />
            )}

            {tab === TAB.productos && (
              <DataTable
                columns={["Producto", "Disponible", "Stock"]}
                empty="No hay productos asignados."
                emptyAction={
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/admin/productos">Asignar productos</Link>
                  </Button>
                }
                rows={(Array.isArray(data.products) ? data.products : []).map((row: any) => [
                  row.product?.name || "—",
                  row.configuration?.available ? "Sí" : "No",
                  row.configuration?.inventory ?? 0,
                ])}
              />
            )}

            {tab === TAB.horarios && (
              <div className="space-y-6">
                <div>
                  <h2 className="font-semibold mb-3">Horario semanal</h2>
                  <DataTable
                    columns={["Día", "Horario"]}
                    empty="No hay horarios configurados."
                    emptyAction={
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/admin/sucursales/${branchId}/editar`}>Configurar horarios</Link>
                      </Button>
                    }
                    rows={(branch.hours || []).map((h: any) => [
                      h.label || h.day,
                      h.closed ? "Cerrado" : `${h.open} — ${h.close}`,
                    ])}
                  />
                </div>
                <div>
                  <h2 className="font-semibold mb-3">Días especiales</h2>
                  <DataTable
                    columns={["Fecha", "Label", "Horario"]}
                    empty="No hay días especiales."
                    rows={((data as any).specialHours || []).map((h: any) => [
                      h.date,
                      h.label || "—",
                      h.closed ? "Cerrado" : `${h.openTime || ""} — ${h.closeTime || ""}`,
                    ])}
                  />
                </div>
              </div>
            )}

            {tab === TAB.equipo && (
              <div className="space-y-6">
                <div className="rounded-lg border p-4 space-y-3">
                  <h2 className="font-semibold">Asignar usuario</h2>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      className="h-10 rounded-md border px-3 bg-background flex-1 text-sm"
                      value={assignUserId}
                      onChange={(e) => setAssignUserId(e.target.value)}
                    >
                      <option value="">Buscar por nombre, correo o rol…</option>
                      {(users.data || []).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} · {u.role} · {u.email}
                        </option>
                      ))}
                    </select>
                    <select
                      className="h-10 rounded-md border px-3 bg-background text-sm"
                      value={assignRole}
                      onChange={(e) => setAssignRole(e.target.value as typeof assignRole)}
                    >
                      <option value="branch_manager">Branch Manager</option>
                      <option value="staff">Staff</option>
                      <option value="operations">Operations</option>
                    </select>
                    <Button
                      disabled={!assignUserId}
                      onClick={async () => {
                        try {
                          await createAssign.mutateAsync({
                            id: branchId,
                            data: { userId: assignUserId, role: assignRole, isPrimary: false },
                          });
                          setAssignUserId("");
                          toast({ title: "Usuario asignado" });
                          await refresh();
                        } catch (err: any) {
                          toast({ title: "No se pudo asignar", description: sanitizeErrorCopy(err, "Inténtalo de nuevo."), variant: "notice" });
                        }
                      }}
                    >
                      Asignar
                    </Button>
                  </div>
                </div>

                <DataTable
                  columns={["Nombre", "Rol sucursal", "Responsable", "Acciones"]}
                  empty="No hay usuarios asignados."
                  emptyAction={<p className="text-xs text-muted-foreground">Usa el selector de arriba.</p>}
                  rows={(assignments.data || []).map((row: any) => [
                    <div key="n">
                      <div className="font-medium">{row.user?.name}</div>
                      <div className="text-xs text-muted-foreground">{row.user?.email}</div>
                    </div>,
                    row.role || "staff",
                    row.isPrimary ? "Sí" : "—",
                    <div key="a" className="flex flex-wrap gap-1">
                      {!row.isPrimary && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            await updateAssign.mutateAsync({
                              id: branchId,
                              data: { userId: row.user.id, isPrimary: true, role: "branch_manager" },
                            });
                            toast({ title: "Responsable actualizado" });
                            await refresh();
                          }}
                        >
                          Hacer responsable
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await deleteAssign.mutateAsync({ id: branchId, userId: row.user.id });
                          toast({ title: "Asignación eliminada" });
                          await refresh();
                        }}
                      >
                        Quitar
                      </Button>
                    </div>,
                  ])}
                />
              </div>
            )}

            {tab === TAB.configuracion && (
              <div className="space-y-8 max-w-2xl">
                <section className="space-y-3">
                  <h2 className="font-semibold">Métodos de recolección y entrega</h2>
                  <p className="text-sm text-muted-foreground">
                    Enciende o apaga lo que esta sucursal ofrece al cliente.
                  </p>
                  <div className="flex flex-col gap-4 rounded-none border border-border p-4 text-sm">
                    <label className="flex items-center justify-between gap-4">
                      <span>
                        <span className="font-medium">Recolección (pickup)</span>
                        <span className="mt-0.5 block text-muted-foreground">Cliente puede recoger en sucursal</span>
                      </span>
                      <Switch
                        checked={!!branch.pickupAvailable}
                        onCheckedChange={(v) => void saveConfig({ pickupAvailable: v })}
                      />
                    </label>
                    <label className="flex items-center justify-between gap-4 border-t border-border pt-4">
                      <span>
                        <span className="font-medium">Entrega a domicilio</span>
                        <span className="mt-0.5 block text-muted-foreground">Cliente puede pedir envío</span>
                      </span>
                      <Switch
                        checked={!!branch.deliveryAvailable}
                        onCheckedChange={(v) => void saveConfig({ deliveryAvailable: v })}
                      />
                    </label>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <label className="text-sm">
                      Prep. (min)
                      <Input
                        type="number"
                        defaultValue={branch.preparationTimeMinutes}
                        onBlur={(e) => void saveConfig({ preparationTimeMinutes: Number(e.target.value) })}
                      />
                    </label>
                    <label className="text-sm">
                      Slot interval
                      <Input
                        type="number"
                        defaultValue={(branch as any).pickupSlotIntervalMinutes}
                        onBlur={(e) => void saveConfig({ pickupSlotIntervalMinutes: Number(e.target.value) })}
                      />
                    </label>
                    <label className="text-sm">
                      Capacidad slot
                      <Input
                        type="number"
                        defaultValue={(branch as any).pickupSlotCapacity}
                        onBlur={(e) => void saveConfig({ pickupSlotCapacity: Number(e.target.value) })}
                      />
                    </label>
                    <label className="text-sm">
                      Fee delivery
                      <Input
                        type="number"
                        defaultValue={(branch as any).deliveryFee}
                        onBlur={(e) => void saveConfig({ deliveryFee: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                </section>

                <section className="space-y-3">
                  <h2 className="font-semibold">Notificaciones</h2>
                  <p className="text-xs text-muted-foreground">Canales</p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <Checkbox
                        checked={!!data.notificationSettings?.inApp}
                        onCheckedChange={(v) =>
                          void saveConfig({
                            notificationPreferences: { ...data.notificationSettings, inApp: !!v },
                          })
                        }
                      />
                      En el sistema
                    </label>
                    <label className="flex items-center gap-2">
                      <Checkbox
                        checked={!!data.notificationSettings?.email}
                        onCheckedChange={(v) =>
                          void saveConfig({
                            notificationPreferences: { ...data.notificationSettings, email: !!v },
                          })
                        }
                      />
                      Email
                    </label>
                    <label className="flex items-center gap-2">
                      <Checkbox
                        checked={!!(data.notificationSettings as any)?.whatsapp}
                        onCheckedChange={(v) =>
                          void saveConfig({
                            notificationPreferences: {
                              ...data.notificationSettings,
                              whatsapp: !!v,
                            },
                          })
                        }
                      />
                      WhatsApp (cola)
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground pt-1">Alertas de inventario</p>
                  <div className="flex flex-wrap gap-4 text-sm">
                    {(
                      [
                        ["lowStock", "Stock bajo"],
                        ["criticalStock", "Crítico"],
                        ["outOfStock", "Agotado"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2">
                        <Checkbox
                          checked={(data.notificationSettings as any)?.[key] !== false}
                          onCheckedChange={(v) =>
                            void saveConfig({
                              notificationPreferences: {
                                ...data.notificationSettings,
                                [key]: !!v,
                              },
                            })
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </section>

                <section className="space-y-3">
                  <h2 className="font-semibold">Contacto rápido</h2>
                  <p className="text-sm text-muted-foreground">
                    {(data as any).contact?.whatsappUrl && (
                      <a className="text-primary underline" href={(data as any).contact.whatsappUrl} target="_blank" rel="noreferrer">
                        Abrir WhatsApp
                      </a>
                    )}
                    {!((data as any).contact?.whatsappUrl) && "Sin WhatsApp configurado."}
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/admin/sucursales/${branchId}/editar`}>Editar identidad y canales</Link>
                  </Button>
                </section>

                <section className="space-y-3">
                  <h2 className="font-semibold">Auditoría reciente</h2>
                  <DataTable
                    columns={["Acción", "Fecha"]}
                    empty="Sin eventos de auditoría."
                    rows={(audit.data || []).slice(0, 15).map((row: any) => [
                      row.action,
                      row.createdAt ? new Date(row.createdAt).toLocaleString("es-MX") : "—",
                    ])}
                  />
                </section>
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
