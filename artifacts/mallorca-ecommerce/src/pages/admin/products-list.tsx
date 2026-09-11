import { useState, useMemo } from "react";
import { AdminLayout } from "@/components/layout/admin-layout";
import {
  useListAdminProducts,
  type ListAdminProductsStatus,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Edit, MoreHorizontal, Image as ImageIcon } from "lucide-react";

export default function AdminProductsList() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ListAdminProductsStatus | "">("");

  useMemo(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: products, isLoading } = useListAdminProducts({
    search: debouncedSearch || undefined,
    status: statusFilter ? (statusFilter as ListAdminProductsStatus) : undefined,
  });

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(price);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 uppercase tracking-wider">Activo</span>;
      case 'draft':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 uppercase tracking-wider">Borrador</span>;
      case 'inactive':
        return <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 uppercase tracking-wider">Inactivo</span>;
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <AdminLayout>
      <div className="flex-1 flex flex-col h-full bg-background">
        {/* Header & Actions */}
        <div className="p-6 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Catálogo de Productos</h1>
            <p className="text-sm text-muted-foreground mt-1">Gestiona los productos, precios y visibilidad.</p>
          </div>
          <Button asChild className="rounded-md">
            <Link href="/admin/productos/nuevo">
              <Plus className="h-4 w-4 mr-2" />
              Crear Producto
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <div className="p-4 border-b border-border bg-muted/20 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por nombre o SKU..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background"
            />
          </div>
          <select 
            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-48"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="draft">Borradores</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>

        {/* Table/List */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                <tr>
                  <th className="px-6 py-4 font-semibold w-16">Img</th>
                  <th className="px-6 py-4 font-semibold">Producto</th>
                  <th className="px-6 py-4 font-semibold">Categoría</th>
                  <th className="px-6 py-4 font-semibold">Precio</th>
                  <th className="px-6 py-4 font-semibold text-center">Estado</th>
                  <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4"><div className="h-10 w-10 bg-muted rounded animate-pulse" /></td>
                      <td className="px-6 py-4">
                        <div className="h-4 w-32 bg-muted rounded animate-pulse mb-2" />
                        <div className="h-3 w-16 bg-muted rounded animate-pulse" />
                      </td>
                      <td className="px-6 py-4"><div className="h-4 w-24 bg-muted rounded animate-pulse" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-16 bg-muted rounded animate-pulse" /></td>
                      <td className="px-6 py-4"><div className="h-6 w-16 mx-auto bg-muted rounded-full animate-pulse" /></td>
                      <td className="px-6 py-4"><div className="h-8 w-8 ml-auto bg-muted rounded animate-pulse" /></td>
                    </tr>
                  ))
                ) : products?.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                      No se encontraron productos con estos filtros.
                    </td>
                  </tr>
                ) : (
                  products?.map((product) => (
                    <tr key={product.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-6 py-3">
                        <div className="h-10 w-10 rounded border border-border bg-secondary overflow-hidden flex items-center justify-center shrink-0">
                          {product.imageUrl ? (
                            <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <div className="font-medium text-foreground">{product.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 font-mono">{product.sku}</div>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground">
                        {product.categoryName}
                      </td>
                      <td className="px-6 py-3 font-medium">
                        {formatPrice(product.price)}
                      </td>
                      <td className="px-6 py-3 text-center">
                        {getStatusBadge(product.status)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <Link href={`/admin/productos/${product.id}`}>
                            <Edit className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                            <span className="sr-only">Editar</span>
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}