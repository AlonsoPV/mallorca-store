import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListInventoryAlertsQueryKey,
  useGetMe,
  useListAdminBranches,
  useListInventoryAlerts,
  useUpdateInventoryAlert,
  type ListInventoryAlertsParams,
} from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const TYPE_LABEL: Record<string, string> = {
  LOW_STOCK: "Stock bajo",
  CRITICAL_STOCK: "Crítico",
  OUT_OF_STOCK: "Agotado",
  INVENTORY_REVIEW: "Revisión",
  RESTOCK_REQUEST: "Reposición",
  INVENTORY_MISMATCH: "Descuadre",
  CUSTOM: "Personalizada",
};

export default function AdminAlerts() {
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState("OPEN");
  const [source, setSource] = useState("");
  const [type, setType] = useState("");
  const params: ListInventoryAlertsParams = {
    branchId: branchId ? Number(branchId) : undefined,
    status: (status || undefined) as ListInventoryAlertsParams["status"],
    source: (source || undefined) as ListInventoryAlertsParams["source"],
    type: type || undefined,
  };
  const q = useListInventoryAlerts(params);
  const branches = useListAdminBranches();
  const me = useGetMe();
  const canResolve =
    me.data?.role !== "staff";
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
      <div className="space-y-6 overflow-auto p-6 md:p-10">
        <div>
          <h1 className="text-3xl font-bold">Alertas de inventario</h1>
          <p className="text-muted-foreground">
            Automáticas y manuales, con acciones de seguimiento.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            <option value="">Todas las sucursales</option>
            {branches.data?.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Todos los estados</option>
            <option value="OPEN">Abiertas</option>
            <option value="IN_PROGRESS">En atención</option>
            <option value="RESOLVED">Resueltas</option>
            <option value="DISMISSED">Descartadas</option>
          </select>
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="">Origen</option>
            <option value="AUTOMATIC">Automática</option>
            <option value="MANUAL">Manual</option>
          </select>
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">Tipo</option>
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <AlertSection title="Críticas" rows={grouped.critical} onPatch={patch} canResolve={canResolve} />
        <AlertSection title="Atención" rows={grouped.attention} onPatch={patch} canResolve={canResolve} />
        {status === "RESOLVED" || status === "DISMISSED" || !status ? (
          <AlertSection title="Resueltas / descartadas" rows={grouped.resolved} onPatch={patch} canResolve={canResolve} />
        ) : null}
      </div>
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
  rows: NonNullable<ReturnType<typeof useListInventoryAlerts>["data"]>;
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
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
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
                <th className="p-3 text-left" key={heading}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const alert = row.alert as any;
              return (
                <tr className="border-t" key={alert.id}>
                  <td className="p-3">
                    {alert.createdAt
                      ? new Date(alert.createdAt).toLocaleString("es-MX")
                      : "—"}
                  </td>
                  <td className="p-3">
                    <div className="font-medium">{row.product?.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {row.product?.sku}
                    </div>
                  </td>
                  <td className="p-3">{row.branch?.name}</td>
                  <td className="p-3">
                    {TYPE_LABEL[alert.type] ?? alert.type}
                    <div className="text-xs text-muted-foreground">{alert.source}</div>
                  </td>
                  <td className="p-3">{alert.priority ?? "—"}</td>
                  <td className="p-3">
                    {alert.availableStock ?? alert.stock ?? "—"}
                    {alert.minStock != null ? (
                      <span className="text-muted-foreground"> / min {alert.minStock}</span>
                    ) : null}
                  </td>
                  <td className="p-3">{alert.status ?? "—"}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/productos/${row.product?.id}`}>Ver producto</Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link href="/admin/inventario">Stock</Link>
                      </Button>
                      {alert.status === "OPEN" ? (
                        <Button
                          size="sm"
                          variant="outline"
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
