import { AdminLayout } from "@/components/layout/admin-layout";
import { useListAdminOrders, useUpdateAdminOrder, getListAdminOrdersQueryKey, useListAdminBranches } from "@workspace/api-client-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Package } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function AdminOrdersList() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const { data: orders, isLoading } = useListAdminOrders({ 
    status: statusFilter === "all" ? undefined : statusFilter,
    branchId: branchFilter === "all" ? undefined : Number(branchFilter),
  });
  const branches = useListAdminBranches();
  
  const updateOrder = useUpdateAdminOrder();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleStatusChange = async (orderId: string, newStatus: any) => {
    try {
      await updateOrder.mutateAsync({
        id: orderId,
        data: { status: newStatus }
      });
      toast({ title: "Estado actualizado" });
      queryClient.invalidateQueries({ queryKey: getListAdminOrdersQueryKey() });
    } catch (err) {
      toast({ title: "Error actualizando estado", variant: "destructive" });
    }
  };

  const formatPrice = (price: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(price);

  return (
    <AdminLayout>
      <div className="p-6 md:p-10 flex-1 overflow-y-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div>
            <h1 className="font-serif text-3xl mb-2 text-foreground">Pedidos</h1>
            <p className="text-muted-foreground text-sm">Gestiona y actualiza el estado de los pedidos.</p>
          </div>
          <div className="w-full md:w-64 flex gap-2">
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="bg-background rounded-none"><SelectValue placeholder="Sucursal" /></SelectTrigger>
              <SelectContent className="rounded-none"><SelectItem value="all">Todas las sucursales</SelectItem>{branches.data?.map(b=><SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="bg-background rounded-none">
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="all">Todos los pedidos</SelectItem>
                <SelectItem value="pending_payment">Pago pendiente</SelectItem>
                <SelectItem value="paid">Pagado</SelectItem>
                <SelectItem value="preparing">En preparación</SelectItem>
                <SelectItem value="ready">Listo</SelectItem>
                <SelectItem value="completed">Completado</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
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
                  <th className="px-6 py-4 font-medium">Pedido</th>
                  <th className="px-6 py-4 font-medium">Sucursal</th>
                  <th className="px-6 py-4 font-medium">Cliente</th>
                  <th className="px-6 py-4 font-medium">Entrega</th>
                  <th className="px-6 py-4 font-medium">Fecha</th>
                  <th className="px-6 py-4 font-medium">Total</th>
                  <th className="px-6 py-4 font-medium w-48">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((order) => {
                  const date = new Date(order.createdAt).toLocaleDateString('es-MX', {
                    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                  });
                  return (
                    <tr key={order.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4 font-medium">#{order.orderNumber}</td>
                       <td className="px-6 py-4">{branches.data?.find(b=>b.id===order.branchId)?.name || `Sucursal ${order.branchId}`}</td>
                       <td className="px-6 py-4">
                        <div className="font-medium text-foreground">{(order as any).customerName || 'Cliente'}</div>
                        <div className="text-muted-foreground text-xs">{(order as any).fulfillmentMethod || 'N/A'} - {(order as any).branchName || 'Sucursal'}</div>
                      </td>
                       <td className="px-6 py-4 text-muted-foreground">{order.fulfillmentMethod} · {(order as any).scheduledStart ? new Date((order as any).scheduledStart).toLocaleString('es-MX') : "—"}</td>
                       <td className="px-6 py-4 text-muted-foreground">{date}</td>
                      <td className="px-6 py-4 font-medium">{formatPrice(order.total)}</td>
                      <td className="px-6 py-4">
                        <Select 
                          value={order.status} 
                          onValueChange={(val) => handleStatusChange(order.id, val)}
                          disabled={updateOrder.isPending}
                        >
                          <SelectTrigger className="h-8 rounded-none border-border bg-background">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-none">
                            <SelectItem value="pending_payment">Pago pendiente</SelectItem>
                            <SelectItem value="paid">Pagado</SelectItem>
                            <SelectItem value="preparing">En preparación</SelectItem>
                            <SelectItem value="ready">Listo</SelectItem>
                            <SelectItem value="completed">Completado</SelectItem>
                            <SelectItem value="cancelled">Cancelado</SelectItem>
                          </SelectContent>
                        </Select>
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
