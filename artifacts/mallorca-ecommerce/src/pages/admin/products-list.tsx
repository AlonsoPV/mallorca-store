import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/layout/admin-layout";
import {
  useListAdminProducts,
  type ListAdminProductsStatus,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Edit, Filter } from "lucide-react";
import { ImageWithFallback } from "@/components/image-with-fallback";

export default function AdminProductsList() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ListAdminProductsStatus | "">("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
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
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#F5F0E8] text-[#4B3028] dark:bg-[#4B3028] dark:text-[#F5F0E8] uppercase tracking-widest border border-[#E8DED0] dark:border-[#7D8360]">Activo</span>;
      case 'draft':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-muted text-muted-foreground uppercase tracking-widest border border-border">Borrador</span>;
      case 'inactive':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-[#FBFAF7] text-muted-foreground uppercase tracking-widest border border-border opacity-70">Inactivo</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-muted text-muted-foreground uppercase tracking-widest">{status}</span>;
    }
  };

  return (
    <AdminLayout>
      <div className="flex-1 flex flex-col h-full bg-[#FBFAF7] dark:bg-background">
        {/* Header & Actions */}
        <div className="px-8 py-6 border-b border-[#E8DED0] dark:border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-card">
          <div>
            <h1 className="text-2xl font-serif text-[#25211E] dark:text-foreground tracking-tight">Catálogo de Productos</h1>
            <p className="text-sm text-muted-foreground mt-1 font-sans">Gestiona productos, precios y visibilidad para Lomas y Reforma.</p>
          </div>
          <Button asChild className="rounded-none bg-[#D43B2B] hover:bg-[#B83225] text-white font-medium px-6">
            <Link href="/admin/productos/nuevo">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Producto
            </Link>
          </Button>
        </div>

        {/* Filters */}
        <div className="px-8 py-4 border-b border-[#E8DED0] dark:border-border bg-[#F5F0E8]/50 dark:bg-muted/10 flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white dark:bg-background border-[#E8DED0] dark:border-border rounded-none h-10 focus-visible:ring-[#D43B2B]"
            />
          </div>
          <div className="relative w-full sm:w-48 shrink-0 flex items-center">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <select
              className="flex h-10 w-full items-center justify-between rounded-none border border-[#E8DED0] dark:border-border bg-white dark:bg-background pl-9 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#D43B2B] disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="draft">Borradores</option>
              <option value="inactive">Inactivos</option>
            </select>
          </div>
        </div>

        {/* Table/List */}
        <div className="flex-1 overflow-auto p-8">
          <div className="bg-white dark:bg-card border border-[#E8DED0] dark:border-border shadow-sm overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground bg-[#FBFAF7] dark:bg-muted/30 border-b border-[#E8DED0] dark:border-border">
                <tr>
                  <th className="px-6 py-4 font-semibold font-sans uppercase tracking-wider w-16">Img</th>
                  <th className="px-6 py-4 font-semibold font-sans uppercase tracking-wider">Producto</th>
                  <th className="px-6 py-4 font-semibold font-sans uppercase tracking-wider hidden md:table-cell">Categoría</th>
                  <th className="px-6 py-4 font-semibold font-sans uppercase tracking-wider text-right">Precio</th>
                  <th className="px-6 py-4 font-semibold font-sans uppercase tracking-wider text-center">Estado</th>
                  <th className="px-6 py-4 font-semibold font-sans uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8DED0] dark:divide-border">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4"><div className="h-12 w-12 bg-muted rounded animate-pulse" /></td>
                      <td className="px-6 py-4">
                        <div className="h-4 w-48 bg-muted rounded animate-pulse mb-2" />
                        <div className="h-3 w-24 bg-muted rounded animate-pulse" />
                      </td>
                      <td className="px-6 py-4 hidden md:table-cell"><div className="h-4 w-24 bg-muted rounded animate-pulse" /></td>
                      <td className="px-6 py-4"><div className="h-4 w-16 ml-auto bg-muted rounded animate-pulse" /></td>
                      <td className="px-6 py-4"><div className="h-5 w-16 mx-auto bg-muted rounded animate-pulse" /></td>
                      <td className="px-6 py-4"><div className="h-8 w-8 ml-auto bg-muted rounded animate-pulse" /></td>
                    </tr>
                  ))
                ) : products?.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center">
                      <p className="text-muted-foreground text-sm font-medium">No se encontraron productos con estos filtros.</p>
                      {(search || statusFilter) && (
                        <Button variant="link" onClick={() => { setSearch(""); setStatusFilter(""); }} className="mt-2 text-[#D43B2B]">
                          Limpiar filtros
                        </Button>
                      )}
                    </td>
                  </tr>
                ) : (
                  products?.map((product) => (
                    <tr key={product.id} className="hover:bg-[#F5F0E8]/40 dark:hover:bg-muted/30 transition-colors group">
                      <td className="px-6 py-3">
                        <div className="h-12 w-12 bg-[#F5F0E8] dark:bg-muted overflow-hidden flex items-center justify-center shrink-0">
                          <ImageWithFallback
                            src={product.imageUrl}
                            alt={product.name}
                            className="h-full w-full object-cover"
                            fallback={<div role="img" aria-label={`${product.name}: imagen no disponible`} className="flex h-full w-full items-center justify-center bg-[#F5F0E8] text-center text-[10px] text-muted-foreground">Imagen no disponible</div>}
                          />
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <div className="font-semibold text-[#25211E] dark:text-foreground">{product.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 font-mono tracking-tight">{product.sku}</div>
                      </td>
                      <td className="px-6 py-3 text-muted-foreground hidden md:table-cell">
                        {product.categoryName || "—"}
                      </td>
                      <td className="px-6 py-3 font-medium text-right text-[#25211E] dark:text-foreground">
                        {formatPrice(product.price)}
                      </td>
                      <td className="px-6 py-3 text-center">
                        {getStatusBadge(product.status)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-none hover:bg-[#E8DED0] dark:hover:bg-muted text-[#4B3028] dark:text-foreground">
                          <Link href={`/admin/productos/${product.id}`}>
                            <Edit className="h-4 w-4" />
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
