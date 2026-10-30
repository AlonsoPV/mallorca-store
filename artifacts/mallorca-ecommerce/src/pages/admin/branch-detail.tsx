import { useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAdminBranch,
  useListBranchAssignments,
  useListAdminUsers,
  useListAdminProducts,
  useListAdminBranches,
  useListCategories,
  useUpdateAdminInventory,
  useCreateBranchAssignment,
  useUpdateBranchAssignment,
  useDeleteBranchAssignment,
  useUpdateAdminBranch,
  useListBranchAudit,
  getGetAdminBranchQueryKey,
  getListAdminProductsQueryKey,
  getListBranchAssignmentsQueryKey,
  getListBranchAuditQueryKey,
  type AdminProduct,
} from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import {
  BranchWorkspaceNav,
  branchPedidosVistaFromSearch,
  branchTabFromSearch,
  branchWorkspaceHref,
} from "@/components/admin/branch-workspace-nav";
import { ProductStockSheet } from "@/components/admin/product-stock-sheet";
import { ProductQuickEdit } from "@/pages/admin/product-quick-edit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { formatOrderTime, formatPriceMx, ORDER_STATUS_LABELS } from "@/lib/order-status";
import { cn } from "@/lib/utils";
import { sanitizeErrorCopy } from "@/lib/cart-recovery";
import { ArrowLeft, Minus, Plus } from "lucide-react";

const TAB = {
  resumen: "resumen",
  pedidos: "pedidos",
  productos: "productos",
  alertas: "alertas",
  horarios: "horarios",
  equipo: "equipo",
  configuracion: "configuracion",
} as const;

const BRANCH_STATUS_LABEL: Record<string, string> = {
  active: "Activa",
  inactive: "Inactiva",
  archived: "Archivada",
};

function branchStatus(branch: { status?: string | null; active?: boolean | null }) {
  return branch.status || (branch.active ? "active" : "inactive");
}

function productEditorHref(branchId: number, productId?: number) {
  const from = encodeURIComponent(`/admin/sucursales/${branchId}?tab=productos`);
  return productId
    ? `/admin/productos/${productId}?from=${from}`
    : `/admin/productos/nuevo?from=${from}`;
}

function stockStatusLabel(status?: string | null) {
  if (status === "OUT_OF_STOCK") return "Agotado";
  if (status === "CRITICAL_STOCK") return "Crítico";
  if (status === "LOW_STOCK") return "Stock bajo";
  return "Normal";
}

function stockStatusClass(status?: string | null) {
  if (status === "OUT_OF_STOCK") return "text-destructive";
  if (status === "CRITICAL_STOCK") return "text-orange-900";
  if (status === "LOW_STOCK") return "text-amber-800";
  return "text-emerald-800";
}

function mergeBranchCatalog(data: {
  products?: Array<{ product?: { id?: number }; configuration?: Record<string, unknown> }>;
  inventory?: Array<{ product?: { id?: number }; configuration?: Record<string, unknown> }>;
}) {
  const byId = new Map<number, any>();
  for (const row of [...(data.products ?? []), ...(data.inventory ?? [])]) {
    const id = row.product?.id ?? Number((row.configuration as { productId?: number } | undefined)?.productId);
    if (!Number.isInteger(id) || id < 1) continue;
    const previous = byId.get(id) ?? {};
    byId.set(id, {
      ...previous,
      ...row,
      product: row.product ?? previous.product,
      configuration: { ...previous.configuration, ...row.configuration },
    });
  }
  return [...byId.values()];
}

function ViewSwitch({
  options,
  value,
  onSelect,
  label,
}: {
  options: Array<{ id: string; label: string }>;
  value: string;
  onSelect: (id: string) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex overflow-hidden border border-border">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onSelect(option.id)}
          className={cn(
            "h-9 px-3 text-sm transition-colors",
            value === option.id
              ? "bg-primary text-primary-foreground"
              : "bg-background text-foreground hover:bg-muted",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
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
  const search = useSearch();
  const [, setLocation] = useLocation();
  const tab = branchTabFromSearch(search);
  const pedidosVista = branchPedidosVistaFromSearch(search);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignRole, setAssignRole] = useState<"branch_manager" | "staff" | "operations">("staff");
  const [quickEditId, setQuickEditId] = useState<number | null>(null);
  const [stockTarget, setStockTarget] = useState<AdminProduct | null>(null);
  const catalogQuery = useListAdminProducts(
    {},
    { query: { enabled: tab === TAB.productos && Number.isFinite(branchId) } },
  );
  const branchesQuery = useListAdminBranches({
    query: { enabled: tab === TAB.productos && Number.isFinite(branchId) },
  });
  const categoriesQuery = useListCategories({
    query: { enabled: tab === TAB.productos && Number.isFinite(branchId) },
  });
  const updateInventory = useUpdateAdminInventory();

  const data = query.data;
  const summary = (data as any)?.summary;
  const branch = data?.branch;
  const status = branch ? branchStatus(branch) : "inactive";

  const catalogById = useMemo(() => {
    const map = new Map<number, AdminProduct>();
    for (const product of catalogQuery.data ?? []) map.set(product.id, product);
    return map;
  }, [catalogQuery.data]);

  const branchCatalog = useMemo(
    () => mergeBranchCatalog({ products: (data as any)?.products, inventory: (data as any)?.inventory }),
    [data],
  );

  const quickProduct = quickEditId != null ? catalogById.get(quickEditId) ?? null : null;

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
    await qc.invalidateQueries({ queryKey: getListAdminProductsQueryKey() });
  }

  async function adjustStock(row: any, quantity: number) {
    const productId = row.product?.id;
    if (!Number.isInteger(productId) || quantity < 0 || updateInventory.isPending) return;
    try {
      await updateInventory.mutateAsync({
        data: {
          branchProductId: typeof row.configuration?.id === "number" ? row.configuration.id : undefined,
          branchId,
          productId,
          quantity,
          reason: "Ajuste desde sucursal",
        },
      });
      await refresh();
    } catch {
      toast({ title: "No se pudo actualizar el stock", variant: "destructive" });
    }
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
                <div className="grid grid-cols-2 gap-2 @min-[46rem]:flex @min-[46rem]:shrink-0">
                  <Button variant="outline" className="h-9 rounded-none px-3" asChild>
                    <Link href={`/admin/pedidos/nuevo?branchId=${branchId}`}>Nuevo pedido</Link>
                  </Button>
                  <Button className="h-9 rounded-none px-3" asChild>
                    <Link href={branchWorkspaceHref(branchId, "pedidos", { vista: "agenda" })}>Ver agenda</Link>
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
                    goTo: TAB.productos,
                    emphasize: (summary?.outOfStock ?? 0) > 0,
                  },
                ] as const
              ).map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setLocation(branchWorkspaceHref(branchId, item.goTo))}
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

            <BranchWorkspaceNav
              branchId={branchId}
              active={tab}
              ordersToday={summary?.ordersToday ?? 0}
              alertsOpen={summary?.alertsOpen ?? 0}
            />

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
                      <Link href={branchWorkspaceHref(branchId, "pedidos")}>Ver pedidos</Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={branchWorkspaceHref(branchId, "productos")}>Ver productos</Link>
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {tab === TAB.pedidos && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <ViewSwitch
                    label="Vista de pedidos"
                    value={pedidosVista}
                    onSelect={(id) =>
                      setLocation(
                        branchWorkspaceHref(branchId, "pedidos", id === "agenda" ? { vista: "agenda" } : undefined),
                      )
                    }
                    options={[
                      { id: "lista", label: "Lista" },
                      { id: "agenda", label: "Agenda" },
                    ]}
                  />
                  <Button variant="outline" size="sm" className="rounded-none" asChild>
                    <Link
                      href={
                        pedidosVista === "agenda"
                          ? `/admin/pedidos?view=agenda&branchId=${branchId}`
                          : `/admin/pedidos?branchId=${branchId}`
                      }
                    >
                      Abrir módulo
                    </Link>
                  </Button>
                </div>
                {pedidosVista === "agenda" ? (
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
                ) : (
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
              </div>
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
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Catálogo y existencias de esta sucursal. Edita el producto o ajusta el stock sin salir.
                  </p>
                  <Button size="sm" className="rounded-none" asChild>
                    <Link href={productEditorHref(branchId)}>Nuevo producto</Link>
                  </Button>
                </div>
                <DataTable
                  columns={["Producto", "SKU", "Disponible", "Stock", "Mínimo", "Estado", ""]}
                  empty="No hay productos asignados a esta sucursal."
                  emptyAction={
                    <Button size="sm" className="rounded-none" asChild>
                      <Link href={productEditorHref(branchId)}>Añadir producto</Link>
                    </Button>
                  }
                  rows={branchCatalog.map((row: any) => {
                    const productId = row.product?.id as number | undefined;
                    const listedProduct = productId ? catalogById.get(productId) : undefined;
                    const stockProduct =
                      listedProduct ??
                      (productId
                        ? ({
                            id: productId,
                            name: row.product?.name ?? "",
                            sku: row.product?.sku ?? "",
                          } as AdminProduct)
                        : undefined);
                    const stock = Number(row.configuration?.inventory ?? 0);
                    const alertState = String(row.configuration?.alertState || "NORMAL");
                    return [
                      productId ? (
                        <Link
                          key="name"
                          href={productEditorHref(branchId, productId)}
                          className="font-medium hover:text-primary"
                        >
                          {row.product?.name || "—"}
                        </Link>
                      ) : (
                        row.product?.name || "—"
                      ),
                      <span key="sku" className="font-mono text-xs">
                        {row.product?.sku || "—"}
                      </span>,
                      row.configuration?.available ? "Sí" : "No",
                      <div key="stock" className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-8 w-8 shrink-0 rounded-none"
                          disabled={stock === 0 || updateInventory.isPending}
                          aria-label={`Disminuir stock de ${row.product?.name || "producto"}`}
                          onClick={() => void adjustStock(row, stock - 1)}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <button
                          type="button"
                          className={cn(
                            "min-w-10 px-1 text-center text-sm font-medium underline decoration-dotted underline-offset-4",
                            stock === 0 && "text-destructive",
                          )}
                          disabled={!stockProduct}
                          onClick={() => stockProduct && setStockTarget(stockProduct)}
                          title="Ajustar existencias"
                        >
                          {stock}
                        </button>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="h-8 w-8 shrink-0 rounded-none"
                          disabled={updateInventory.isPending}
                          aria-label={`Aumentar stock de ${row.product?.name || "producto"}`}
                          onClick={() => void adjustStock(row, stock + 1)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>,
                      row.configuration?.minStock ?? 0,
                      <span key="state" className={cn("text-xs font-medium", stockStatusClass(alertState))}>
                        {stockStatusLabel(alertState)}
                      </span>,
                      productId ? (
                        <div key="actions" className="flex justify-end gap-3 text-xs">
                          <Link href={productEditorHref(branchId, productId)} className="text-primary">
                            Editar
                          </Link>
                          {listedProduct ? (
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={() => setQuickEditId(productId)}
                            >
                              Rápida
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        "—"
                      ),
                    ];
                  })}
                />
                {stockTarget ? (
                  <ProductStockSheet
                    product={stockTarget}
                    branchId={branchId}
                    onClose={() => {
                      setStockTarget(null);
                      void refresh();
                    }}
                  />
                ) : null}
                {quickProduct ? (
                  <ProductQuickEdit
                    product={quickProduct}
                    branches={branchesQuery.data ?? []}
                    categories={categoriesQuery.data ?? []}
                    onClose={() => setQuickEditId(null)}
                    onSaved={() => {
                      setQuickEditId(null);
                      void refresh();
                    }}
                  />
                ) : null}
              </div>
            )}

            {tab === TAB.horarios && (
              <div className="space-y-6">
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="font-semibold">Horario semanal</h2>
                    <Button variant="outline" size="sm" className="rounded-none" asChild>
                      <Link href={branchWorkspaceHref(branchId, "ficha", "horarios")}>Editar horarios</Link>
                    </Button>
                  </div>
                  <DataTable
                    columns={["Día", "Horario"]}
                    empty="No hay horarios configurados."
                    emptyAction={
                      <Button variant="outline" size="sm" asChild>
                        <Link href={branchWorkspaceHref(branchId, "ficha", "horarios")}>Editar horarios</Link>
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
                    <Link href={branchWorkspaceHref(branchId, "ficha", "identidad")}>Editar ficha</Link>
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
