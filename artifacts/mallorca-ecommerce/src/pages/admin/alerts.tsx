import { useMemo } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import {
  getListInventoryAlertsQueryKey,
  useGetMe,
  useListAdminBranches,
  useListInventoryAlerts,
  useUpdateInventoryAlert,
  type ListInventoryAlertsParams,
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
import { useToast } from "@/hooks/use-toast";
import { readSearchParam, withSearchParams } from "@/lib/admin-search-params";

const TYPE_LABEL: Record<string, string> = {
  LOW_STOCK: "Stock bajo",
  CRITICAL_STOCK: "Crítico",
  OUT_OF_STOCK: "Agotado",
  INVENTORY_REVIEW: "Revisión",
  RESTOCK_REQUEST: "Reposición",
  INVENTORY_MISMATCH: "Descuadre",
  CUSTOM: "Personalizada",
};

type AlertsFilters = {
  branchId: string;
  status: string;
  source: string;
  type: string;
};

function parseAlertsSearch(search: string): AlertsFilters {
  return {
    branchId: readSearchParam(search, "branchId") || "all",
    status: readSearchParam(search, "status") || "OPEN",
    source: readSearchParam(search, "source") || "all",
    type: readSearchParam(search, "type") || "all",
  };
}

export default function AdminAlerts() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const filters = useMemo(() => parseAlertsSearch(search), [search]);

  const patchFilters = (patch: Partial<AlertsFilters>) => {
    const next = { ...filters, ...patch };
    setLocation(
      withSearchParams("/admin/alertas", search, {
        branchId: next.branchId,
        status: next.status === "OPEN" ? null : next.status,
        source: next.source,
        type: next.type,
      }),
      { replace: true },
    );
  };

  const params: ListInventoryAlertsParams = {
    branchId: filters.branchId !== "all" ? Number(filters.branchId) : undefined,
    status: (filters.status !== "all"
      ? filters.status
      : undefined) as ListInventoryAlertsParams["status"],
    source: (filters.source !== "all"
      ? filters.source
      : undefined) as ListInventoryAlertsParams["source"],
    type: filters.type !== "all" ? filters.type : undefined,
  };
  const q = useListInventoryAlerts(params);
  const branches = useListAdminBranches();
  const me = useGetMe();
  const canResolve = me.data?.role !== "staff";
  const update = useUpdateInventoryAlert();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const grouped = useMemo(() => {
    const rows = q.data ?? [];
    const critical = rows.filter(
      (r) =>
        r.alert?.type === "CRITICAL_STOCK" ||
        r.alert?.type === "OUT_OF_STOCK" ||
        r.alert?.priority === "CRITICAL",
    );
    const attention = rows.filter(
      (r) =>
        !critical.includes(r) &&
        (r.alert?.status === "OPEN" || r.alert?.status === "IN_PROGRESS"),
    );
    const resolved = rows.filter(
      (r) => r.alert?.status === "RESOLVED" || r.alert?.status === "DISMISSED",
    );
    return { critical, attention, resolved };
  }, [q.data]);

  const totalVisible =
    grouped.critical.length +
    grouped.attention.length +
    (filters.status === "RESOLVED" ||
    filters.status === "DISMISSED" ||
    filters.status === "all"
      ? grouped.resolved.length
      : 0);

  const patch = async (
    id: number,
    body: { status?: "IN_PROGRESS" | "RESOLVED" | "DISMISSED"; resolutionNote?: string },
  ) => {
    try {
      await update.mutateAsync({ id, data: body });
      await queryClient.invalidateQueries({ queryKey: getListInventoryAlertsQueryKey() });
      toast({ title: "Alerta actualizada" });
    } catch {
      toast({ title: "No se pudo actualizar", variant: "destructive" });
    }
  };

  return (
    <AdminLayout>
      <AdminPageShell>
        <AdminPageHeader
          title="Alertas de inventario"
          description="Automáticas y manuales, con acciones de seguimiento."
        />

        <div className="sticky top-0 z-10 -mx-6 border-b border-border bg-background/95 px-6 py-3 backdrop-blur md:-mx-10 md:px-10">
          <AdminFilterBar>
            <AdminFilterSelect
              value={filters.branchId}
              onValueChange={(branchId) => patchFilters({ branchId })}
              placeholder="Sucursal"
              options={[
                { value: "all", label: "Todas las sucursales" },
                ...(branches.data?.map((branch) => ({
                  value: String(branch.id),
                  label: branch.name,
                })) ?? []),
              ]}
            />
            <AdminFilterSelect
              value={filters.status}
              onValueChange={(status) => patchFilters({ status })}
              placeholder="Estado"
              options={[
                { value: "all", label: "Todos los estados" },
                { value: "OPEN", label: "Abiertas" },
                { value: "IN_PROGRESS", label: "En atención" },
                { value: "RESOLVED", label: "Resueltas" },
                { value: "DISMISSED", label: "Descartadas" },
              ]}
            />
            <AdminFilterSelect
              value={filters.source}
              onValueChange={(source) => patchFilters({ source })}
              placeholder="Origen"
              options={[
                { value: "all", label: "Origen" },
                { value: "AUTOMATIC", label: "Automática" },
                { value: "MANUAL", label: "Manual" },
              ]}
            />
            <AdminFilterSelect
              value={filters.type}
              onValueChange={(type) => patchFilters({ type })}
              placeholder="Tipo"
              options={[
                { value: "all", label: "Tipo" },
                ...Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label })),
              ]}
            />
          </AdminFilterBar>
        </div>

        {q.isLoading ? <AdminLoading label="Cargando alertas…" /> : null}
        {q.isError ? (
          <AdminError
            title="No se pudieron cargar las alertas"
            onRetry={() => q.refetch()}
          />
        ) : null}

        {!q.isLoading && !q.isError && totalVisible === 0 ? (
          <AdminEmptyState
            icon={Bell}
            title="No hay alertas abiertas"
            description="Cuando el stock cruce umbrales o se generen alertas manuales, aparecerán aquí."
            action={
              <Button asChild className="rounded-none">
                <Link href="/admin/inventario">Ir a inventario</Link>
              </Button>
            }
          />
        ) : null}

        {!q.isLoading && !q.isError && totalVisible > 0 ? (
          <>
            <AlertSection
              title="Críticas"
              rows={grouped.critical}
              onPatch={patch}
              canResolve={canResolve}
            />
            <AlertSection
              title="Atención"
              rows={grouped.attention}
              onPatch={patch}
              canResolve={canResolve}
            />
            {filters.status === "RESOLVED" ||
            filters.status === "DISMISSED" ||
            filters.status === "all" ? (
              <AlertSection
                title="Resueltas / descartadas"
                rows={grouped.resolved}
                onPatch={patch}
                canResolve={canResolve}
              />
            ) : null}
          </>
        ) : null}
      </AdminPageShell>
    </AdminLayout>
  );
}

function AlertSection({
  title,
  rows,
  onPatch,
  canResolve,
}: {
  title: string;
  rows: Array<{
    alert: any;
    product?: { id?: number; name?: string; sku?: string } | null;
    branch?: { id?: number; name?: string } | null;
  }>;
  onPatch: (
    id: number,
    body: { status?: "IN_PROGRESS" | "RESOLVED" | "DISMISSED"; resolutionNote?: string },
  ) => void;
  canResolve: boolean;
}) {
  if (!rows?.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">
        {title}{" "}
        <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>
      </h2>
      <AdminTable>
        <AdminTableHeader>
          <AdminTableRow>
            {[
              "Fecha",
              "Producto",
              "Sucursal",
              "Tipo",
              "Prioridad",
              "Stock",
              "Estado",
              "Acciones",
            ].map((heading) => (
              <AdminTableHead key={heading}>{heading}</AdminTableHead>
            ))}
          </AdminTableRow>
        </AdminTableHeader>
        <AdminTableBody>
          {rows.map((row) => {
            const alert = row.alert as any;
            const branchId = row.branch?.id ?? alert?.branchId;
            const stockHref = branchId
              ? `/admin/inventario?branchId=${branchId}`
              : "/admin/inventario";
            return (
              <AdminTableRow key={alert.id}>
                <AdminTableCell>
                  {alert.createdAt
                    ? new Date(alert.createdAt).toLocaleString("es-MX")
                    : "—"}
                </AdminTableCell>
                <AdminTableCell>
                  <div className="font-medium">{row.product?.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {row.product?.sku}
                  </div>
                </AdminTableCell>
                <AdminTableCell>{row.branch?.name}</AdminTableCell>
                <AdminTableCell>
                  {TYPE_LABEL[alert.type] ?? alert.type}
                  <div className="text-xs text-muted-foreground">{alert.source}</div>
                </AdminTableCell>
                <AdminTableCell>{alert.priority ?? "—"}</AdminTableCell>
                <AdminTableCell>
                  {alert.availableStock ?? alert.stock ?? "—"}
                  {alert.minStock != null ? (
                    <span className="text-muted-foreground"> / min {alert.minStock}</span>
                  ) : null}
                </AdminTableCell>
                <AdminTableCell>{alert.status ?? "—"}</AdminTableCell>
                <AdminTableCell>
                  <div className="flex flex-wrap gap-1">
                    <Button asChild size="sm" variant="outline" className="rounded-none">
                      <Link href={`/admin/productos/${row.product?.id}`}>Ver producto</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="rounded-none">
                      <Link href={stockHref}>Stock</Link>
                    </Button>
                    {alert.status === "OPEN" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-none"
                        onClick={() => onPatch(alert.id, { status: "IN_PROGRESS" })}
                      >
                        En atención
                      </Button>
                    ) : null}
                    {canResolve &&
                    (alert.status === "OPEN" || alert.status === "IN_PROGRESS") ? (
                      <>
                        <Button
                          size="sm"
                          className="rounded-none"
                          onClick={() =>
                            onPatch(alert.id, {
                              status: "RESOLVED",
                              resolutionNote: "Resuelto desde centro de alertas",
                            })
                          }
                        >
                          Resolver
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="rounded-none"
                          onClick={() =>
                            onPatch(alert.id, {
                              status: "DISMISSED",
                              resolutionNote: "Descartada",
                            })
                          }
                        >
                          Descartar
                        </Button>
                      </>
                    ) : null}
                  </div>
                </AdminTableCell>
              </AdminTableRow>
            );
          })}
        </AdminTableBody>
      </AdminTable>
    </section>
  );
}
