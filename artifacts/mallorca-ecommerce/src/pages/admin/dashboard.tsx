import { AdminLayout } from "@/components/layout/admin-layout";
import { useGetAdminSummary } from "@workspace/api-client-react";
import { Package, Store, AlertTriangle, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function AdminDashboard() {
  const { data: summary, isLoading, isError } = useGetAdminSummary();

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-8">
          <div className="h-10 w-64 bg-muted animate-pulse mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-muted rounded-xl animate-pulse" />
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
          <p className="text-muted-foreground mb-6">No pudimos conectar con el servidor para obtener el resumen.</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="flex-1 overflow-y-auto bg-muted/20">
        <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Panel de Control</h1>
              <p className="text-muted-foreground mt-1">Resumen operativo de Mallorca Ecommerce.</p>
            </div>
            <div className="flex gap-3">
              <Button asChild className="rounded-md">
                <Link href="/admin/productos/nuevo">Nuevo Producto</Link>
              </Button>
            </div>
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            <MetricCard 
              title="Total Productos" 
              value={summary.totalProducts} 
              icon={<Package className="h-5 w-5 text-primary" />} 
            />
            <MetricCard 
              title="Productos Activos" 
              value={summary.activeProducts} 
              icon={<TrendingUp className="h-5 w-5 text-green-600" />} 
            />
            <MetricCard 
              title="Sucursales" 
              value={summary.totalBranches} 
              icon={<Store className="h-5 w-5 text-blue-600" />} 
            />
            <MetricCard 
              title="Bajo Inventario" 
              value={summary.lowStockProducts} 
              icon={<AlertTriangle className="h-5 w-5 text-amber-500" />} 
              alert={summary.lowStockProducts > 0}
            />
          </div>

          {/* Branch Status */}
          <div>
            <h2 className="text-xl font-bold mb-4">Estado por Sucursal</h2>
            <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Sucursal</th>
                      <th className="px-6 py-4 font-semibold text-center">Productos Activos</th>
                      <th className="px-6 py-4 font-semibold text-center">Alertas de Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.branchSummaries.map((branch) => (
                      <tr key={branch.branchId} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4 font-medium">{branch.branchName}</td>
                        <td className="px-6 py-4 text-center">{branch.activeProducts}</td>
                        <td className="px-6 py-4 text-center">
                          {branch.lowStockProducts > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                              <AlertTriangle className="h-3 w-3" />
                              {branch.lowStockProducts} productos
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {summary.branchSummaries.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">
                          No hay sucursales registradas
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </AdminLayout>
  );
}

function MetricCard({ title, value, icon, alert = false }: { title: string, value: number, icon: React.ReactNode, alert?: boolean }) {
  return (
    <div className={`bg-card border rounded-xl p-6 shadow-sm flex flex-col gap-4 ${alert ? 'border-amber-300 bg-amber-50/30 dark:border-amber-900/50 dark:bg-amber-950/10' : 'border-border'}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <div className="p-2 bg-muted/50 rounded-lg">{icon}</div>
      </div>
      <div className="text-3xl font-bold tracking-tight">{value}</div>
    </div>
  );
}