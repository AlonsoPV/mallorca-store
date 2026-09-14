import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/layout/admin-layout";
import {
  useListAdminProducts,
  useListAdminBranches,
  useListCategories,
  useUpdateProduct,
  useDuplicateProduct,
  useExportProducts,
  useBulkUpdateProducts,
  getListAdminProductsQueryKey,
  type AdminProduct,
  type ListAdminProductsStatus,
  type ProductBulkInputAction,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Plus,
  Edit,
  Download,
  Upload,
  Copy,
  Archive,
  MoreHorizontal,
} from "lucide-react";
import { ImageWithFallback } from "@/components/image-with-fallback";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ProductQuickEdit } from "@/pages/admin/product-quick-edit";
import * as XLSX from "xlsx";

type ViewChip = "all" | "active" | "draft" | "low" | "out";

function formatPrice(price: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(price);
}

function stockForBranch(product: AdminProduct, branchId: number) {
  const avail = product.availability?.find((a) => a.branchId === branchId);
  if (!avail || !avail.available) return null;
  return avail.inventory;
}

function promoLabel(product: AdminProduct) {
  const promo = product.availability?.find((a) => a.promotion)?.promotion;
  if (!promo) return "—";
  if (promo.type === "percentage") return `-${promo.value}%`;
  if (promo.type === "amount") return `-$${promo.value}`;
  return `$${promo.value}`;
}

function downloadText(filename: string, content: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminProductsList() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [view, setView] = useState<ViewChip>("all");
  const [selected, setSelected] = useState<number[]>([]);
  const [quickEditId, setQuickEditId] = useState<number | null>(null);
  const [bulkAction, setBulkAction] = useState<string>("");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkTagValue, setBulkTagValue] = useState("");
  const [bulkPromo, setBulkPromo] = useState({
    name: "Promo masiva",
    type: "percentage",
    value: "20",
    startsAt: "",
    endsAt: "",
  });
  const [bulkCrossSellId, setBulkCrossSellId] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const statusFilter: ListAdminProductsStatus | undefined =
    view === "active" ? "active" : view === "draft" ? "draft" : undefined;

  const { data: products, isLoading } = useListAdminProducts({
    search: debouncedSearch || undefined,
    status: statusFilter,
  });
  const branches = useListAdminBranches();
  const categories = useListCategories();
  const updateProduct = useUpdateProduct();
  const duplicate = useDuplicateProduct();
  const exportProducts = useExportProducts();
  const bulk = useBulkUpdateProducts();

  const filtered = useMemo(() => {
    const list = products ?? [];
    if (view === "low") {
      return list.filter((p) =>
        (p.availability ?? []).some((a) => a.available && a.inventory > 0 && a.inventory <= 5),
      );
    }
    if (view === "out") {
      return list.filter((p) =>
        (p.availability ?? []).some((a) => a.available && a.inventory === 0),
      );
    }
    return list;
  }, [products, view]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListAdminProductsQueryKey() });

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? filtered.map((p) => p.id) : []);
  };

  const toggleOne = (id: number, checked: boolean) => {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  const archive = async (id: number) => {
    try {
      await updateProduct.mutateAsync({ id, data: { status: "inactive" } as any });
      toast({ title: "Producto archivado" });
      invalidate();
    } catch {
      toast({ title: "No se pudo archivar", variant: "destructive" });
    }
  };

  const handleDuplicate = async (id: number) => {
    try {
      const detail = await duplicate.mutateAsync({ id });
      toast({ title: "Producto duplicado" });
      invalidate();
      if (detail?.id) window.location.href = `/admin/productos/${detail.id}`;
    } catch {
      toast({ title: "No se pudo duplicar", variant: "destructive" });
    }
  };

  const handleExport = async (format: "csv" | "xlsx", selectedOnly = false) => {
    try {
      const result = await exportProducts.mutateAsync({
        data: {
          search: debouncedSearch || undefined,
          status: statusFilter,
          ids: selectedOnly && selected.length ? selected : undefined,
          format,
          reimportable: true,
        },
      });
      if (format === "xlsx") {
        const workbook = XLSX.read(result.content, { type: "string" });
        XLSX.writeFile(workbook, result.filename.replace(/\.csv$/i, ".xlsx"));
      } else {
        downloadText(result.filename, result.content);
      }
      toast({ title: "Exportación lista" });
    } catch {
      toast({ title: "No se pudo exportar", variant: "destructive" });
    }
  };

  const runBulk = async () => {
    if (!selected.length || !bulkAction) return;
    const action = bulkAction as ProductBulkInputAction;
    const data: any = { ids: selected, action };
    if (action === "set_status") data.status = bulkValue || "active";
    if (
      action === "set_category" ||
      action === "add_categories" ||
      action === "remove_categories" ||
      action === "replace_categories"
    ) {
      data.categoryId = Number(bulkValue);
      data.categoryIds = [Number(bulkValue)];
    }
    if (action === "add_tags" || action === "remove_tags" || action === "replace_tags") {
      data.tagNames = bulkTagValue
        .split("|")
        .map((tag) => tag.trim())
        .filter(Boolean);
    }
    if (action === "assign_branch" || action === "unassign_branch" || action === "set_min_stock") {
      data.branchId = Number(bulkValue);
    }
    if (action === "set_min_stock") data.minStock = Number(bulkTagValue || "0");
    if (action === "set_price") data.price = Number(bulkValue);
    if (action === "set_featured") data.featured = bulkValue !== "false";
    if (action === "add_cross_sell" || action === "replace_cross_sell") {
      data.crossSellProductIds = [Number(bulkCrossSellId)];
    }
    if (action === "create_promotion") {
      data.promotion = {
        name: bulkPromo.name,
        type: bulkPromo.type,
        value: Number(bulkPromo.value),
        startsAt: new Date(bulkPromo.startsAt).toISOString(),
        endsAt: new Date(bulkPromo.endsAt).toISOString(),
        branchIds: [],
      };
    }
    try {
      const result = await bulk.mutateAsync({ data });
      toast({
        title: `Actualizados: ${result.updated}`,
        description: result.errors.length ? `${result.errors.length} con error` : undefined,
      });
      setSelected([]);
      setBulkAction("");
      invalidate();
    } catch {
      toast({ title: "Error en acción masiva", variant: "destructive" });
    }
  };

  const chips: { id: ViewChip; label: string }[] = [
    { id: "all", label: "Todos" },
    { id: "active", label: "Activos" },
    { id: "draft", label: "Borradores" },
    { id: "low", label: "Stock bajo" },
    { id: "out", label: "Agotados" },
  ];

  const branchList = branches.data ?? [];
  const quickProduct = filtered.find((p) => p.id === quickEditId) ?? null;

  return (
    <AdminLayout>
      <div className="flex-1 flex flex-col h-full bg-[#FBFAF7] dark:bg-background">
        <div className="px-8 py-6 border-b border-[#E8DED0] dark:border-border flex flex-col gap-4 bg-white dark:bg-card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-serif text-[#25211E] dark:text-foreground tracking-tight">
                Productos
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Catálogo multi-sucursal con edición rápida, importación y exportación.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" className="rounded-none">
                <Link href="/admin/importar">
                  <Upload className="h-4 w-4 mr-2" />
                  Importar
                </Link>
              </Button>
              <Button
                variant="outline"
                className="rounded-none"
                onClick={() => handleExport("csv")}
                disabled={exportProducts.isPending}
              >
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Button>
              <Button asChild className="rounded-none bg-[#D43B2B] hover:bg-[#B83225] text-white">
                <Link href="/admin/productos/nuevo">
                  <Plus className="h-4 w-4 mr-2" />
                  Añadir producto
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setView(chip.id)}
                className={cn(
                  "px-3 py-1.5 text-sm border",
                  view === chip.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border",
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-none h-10"
            />
          </div>

          {selected.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 border border-border p-3 bg-muted/20">
              <span className="text-sm font-medium">{selected.length} seleccionados</span>
              <select
                className="h-9 border border-border bg-background px-2 text-sm"
                value={bulkAction}
                onChange={(e) => setBulkAction(e.target.value)}
              >
                <option value="">Acción masiva...</option>
                <option value="set_status">Cambiar estado</option>
                <option value="add_categories">Añadir categoría</option>
                <option value="remove_categories">Quitar categoría</option>
                <option value="replace_categories">Reemplazar categorías</option>
                <option value="add_tags">Añadir etiquetas</option>
                <option value="remove_tags">Quitar etiquetas</option>
                <option value="replace_tags">Reemplazar etiquetas</option>
                <option value="assign_branch">Asignar sucursal</option>
                <option value="unassign_branch">Quitar sucursal</option>
                <option value="set_min_stock">Actualizar stock mínimo</option>
                <option value="set_price">Modificar precio</option>
                <option value="set_featured">Destacar</option>
                <option value="create_promotion">Crear promoción</option>
                <option value="add_cross_sell">Añadir cross-sell</option>
                <option value="replace_cross_sell">Reemplazar cross-sell</option>
                <option value="archive">Archivar</option>
                <option value="cancel_promotions">Eliminar promociones</option>
              </select>
              {bulkAction === "set_status" ? (
                <select
                  className="h-9 border border-border bg-background px-2 text-sm"
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                >
                  <option value="active">Activo</option>
                  <option value="draft">Borrador</option>
                  <option value="inactive">Inactivo</option>
                </select>
              ) : null}
              {["set_category", "add_categories", "remove_categories", "replace_categories"].includes(
                bulkAction,
              ) ? (
                <select
                  className="h-9 border border-border bg-background px-2 text-sm"
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                >
                  <option value="">Categoría...</option>
                  {categories.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : null}
              {["add_tags", "remove_tags", "replace_tags"].includes(bulkAction) ? (
                <Input
                  className="h-9 w-56 rounded-none"
                  value={bulkTagValue}
                  onChange={(e) => setBulkTagValue(e.target.value)}
                  placeholder="Etiquetas con |"
                />
              ) : null}
              {bulkAction === "assign_branch" ||
              bulkAction === "unassign_branch" ||
              bulkAction === "set_min_stock" ? (
                <select
                  className="h-9 border border-border bg-background px-2 text-sm"
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                >
                  <option value="">Sucursal...</option>
                  {branchList.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              ) : null}
              {bulkAction === "set_min_stock" ? (
                <Input
                  type="number"
                  className="h-9 w-28 rounded-none"
                  value={bulkTagValue}
                  onChange={(e) => setBulkTagValue(e.target.value)}
                  placeholder="Mín."
                />
              ) : null}
              {bulkAction === "set_price" ? (
                <Input
                  type="number"
                  className="h-9 w-28 rounded-none"
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  placeholder="Precio"
                />
              ) : null}
              {bulkAction === "set_featured" ? (
                <select
                  className="h-9 border border-border bg-background px-2 text-sm"
                  value={bulkValue || "true"}
                  onChange={(e) => setBulkValue(e.target.value)}
                >
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              ) : null}
              {bulkAction === "create_promotion" ? (
                <div className="flex flex-wrap gap-2 items-center">
                  <Input
                    className="h-9 w-28 rounded-none"
                    value={bulkPromo.value}
                    onChange={(e) => setBulkPromo((p) => ({ ...p, value: e.target.value }))}
                    placeholder="% o monto"
                  />
                  <select
                    className="h-9 border px-2 text-sm"
                    value={bulkPromo.type}
                    onChange={(e) => setBulkPromo((p) => ({ ...p, type: e.target.value }))}
                  >
                    <option value="percentage">%</option>
                    <option value="amount">Monto</option>
                    <option value="fixed">Precio fijo</option>
                  </select>
                  <Input
                    type="datetime-local"
                    className="h-9 rounded-none"
                    value={bulkPromo.startsAt}
                    onChange={(e) => setBulkPromo((p) => ({ ...p, startsAt: e.target.value }))}
                  />
                  <Input
                    type="datetime-local"
                    className="h-9 rounded-none"
                    value={bulkPromo.endsAt}
                    onChange={(e) => setBulkPromo((p) => ({ ...p, endsAt: e.target.value }))}
                  />
                  <span className="text-xs text-muted-foreground">
                    Preview: {selected.length} productos
                  </span>
                </div>
              ) : null}
              {bulkAction === "add_cross_sell" || bulkAction === "replace_cross_sell" ? (
                <select
                  className="h-9 border border-border bg-background px-2 text-sm"
                  value={bulkCrossSellId}
                  onChange={(e) => setBulkCrossSellId(e.target.value)}
                >
                  <option value="">Producto recomendado...</option>
                  {filtered.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              ) : null}
              <Button size="sm" className="rounded-none" onClick={runBulk} disabled={bulk.isPending}>
                Aplicar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-none"
                onClick={() => handleExport("xlsx", true)}
              >
                Exportar selección
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex-1 overflow-auto p-8">
          <div className="bg-white dark:bg-card border border-[#E8DED0] dark:border-border overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[900px]">
              <thead className="text-xs text-muted-foreground bg-[#FBFAF7] dark:bg-muted/30 border-b">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selected.length === filtered.length}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </th>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3 text-right">Precio</th>
                  {branchList.map((b) => (
                    <th key={b.id} className="px-4 py-3 text-center">
                      {b.shortName || b.name}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center">Promo</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8 + branchList.length} className="px-4 py-6">
                        <div className="h-8 bg-muted animate-pulse" />
                      </td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8 + branchList.length} className="px-6 py-16 text-center text-muted-foreground">
                      No se encontraron productos.
                    </td>
                  </tr>
                ) : (
                  filtered.map((product) => (
                    <tr key={product.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.includes(product.id)}
                          onChange={(e) => toggleOne(product.id, e.target.checked)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-muted overflow-hidden shrink-0">
                            <ImageWithFallback
                              src={product.imageUrl}
                              alt={product.name}
                              className="h-full w-full object-cover"
                              fallback={<div className="h-full w-full bg-muted" />}
                            />
                          </div>
                          <div className="font-medium">{product.name}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{product.sku}</td>
                      <td className="px-4 py-3 text-muted-foreground">{product.categoryName || "—"}</td>
                      <td className="px-4 py-3 text-right">{formatPrice(product.price)}</td>
                      {branchList.map((b) => {
                        const stock = stockForBranch(product, b.id);
                        return (
                          <td key={b.id} className="px-4 py-3 text-center">
                            {stock == null ? (
                              <span className="text-muted-foreground">—</span>
                            ) : stock === 0 ? (
                              <span className="text-destructive font-medium">Agotado</span>
                            ) : (
                              stock
                            )}
                          </td>
                        );
                      })}
                      <td className="px-4 py-3 text-center">{promoLabel(product)}</td>
                      <td className="px-4 py-3 text-center capitalize text-xs">{product.status}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button asChild variant="ghost" size="sm" className="h-8 px-2 rounded-none">
                            <Link href={`/admin/productos/${product.id}`}>
                              <Edit className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 rounded-none"
                            onClick={() => setQuickEditId(product.id)}
                            title="Edición rápida"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 rounded-none"
                            onClick={() => handleDuplicate(product.id)}
                            title="Duplicar"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 rounded-none"
                            onClick={() => archive(product.id)}
                            title="Archivar"
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {quickProduct ? (
        <ProductQuickEdit
          product={quickProduct}
          branches={branchList}
          categories={categories.data ?? []}
          onClose={() => setQuickEditId(null)}
          onSaved={() => {
            setQuickEditId(null);
            invalidate();
          }}
        />
      ) : null}
    </AdminLayout>
  );
}
