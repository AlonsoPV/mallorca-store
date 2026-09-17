import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { useGetBranchReport } from "@workspace/api-client-react";
import {
  AdminEmptyState,
  AdminError,
  AdminLoading,
  AdminPageHeader,
  AdminPageShell,
} from "@/components/admin";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function AdminReports() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const q = useGetBranchReport({ from: from || undefined, to: to || undefined });

  return (
    <AdminLayout>
      <AdminPageShell>
        <AdminPageHeader
          title="Reportes"
          description="Compara el desempeño de tus sucursales."
        />

        <Card className="rounded-none">
          <CardHeader>
            <CardTitle>Periodo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid max-w-xl gap-4 sm:grid-cols-2">
              <label className="text-sm">
                Desde
                <Input
                  type="date"
                  className="mt-1 rounded-none"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Hasta
                <Input
                  type="date"
                  className="mt-1 rounded-none"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
            </div>
          </CardContent>
        </Card>

        {q.isLoading ? <AdminLoading label="Cargando reporte…" /> : null}
        {q.isError ? (
          <AdminError title="No se pudo cargar el reporte" onRetry={() => q.refetch()} />
        ) : null}
        {!q.isLoading && !q.isError && (!q.data || q.data.length === 0) ? (
          <AdminEmptyState
            icon={BarChart3}
            title="Sin datos de reporte"
            description="No hay métricas para el periodo seleccionado."
          />
        ) : null}
        {!q.isLoading && !q.isError && q.data && q.data.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {q.data.map((r) => (
              <Card key={r.branchId} className="rounded-none">
                <CardHeader>
                  <CardTitle>{r.branchName}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-sm">
                  <Metric label="Pedidos" value={r.orderCount} />
                  <Metric label="Ingresos" value={`$${r.revenue}`} />
                  <Metric label="Inventario" value={r.inventoryCount} />
                  <Metric label="Valor inventario" value={`$${r.inventoryValue}`} />
                  <Metric label="Stock bajo" value={r.lowStockCount} />
                  <Metric label="Agotados" value={r.outOfStockCount} />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}
      </AdminPageShell>
    </AdminLayout>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
