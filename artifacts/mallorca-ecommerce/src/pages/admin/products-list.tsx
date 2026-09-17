import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
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
import {
  Search,
  Plus,
  Edit,
  Download,
  Upload,
  Copy,
  Archive,
  MoreHorizontal,
  Package,
  Pencil,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
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
import { ImageWithFallback } from "@/components/image-with-fallback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ProductQuickEdit } from "@/pages/admin/product-quick-edit";

type ViewChip = "all" | "active" | "draft" | "low" | "out";

const VIEW_CHIPS: { id: ViewChip; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "active", label: "Activos" },
  { id: "draft", label: "Borradores" },
  { id: "low", label: "Stock bajo" },
  { id: "out", label: "Agotados" },
];

const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  draft: "Borrador",
  inactive: "Inactivo",
};

const PRODUCTS_LIST_QUERY_KEY = "admin.productos.search";

function parseView(value: string | null): ViewChip {
  if (value === "active" || value === "draft" || value === "low" || value === "out") {
    return value;
  }
  return "all";
}

function filtersFromSearch(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return {
    view: parseView(params.get("view")),
    q: params.get("q") ?? "",
    categoryId: params.get("categoryId") ?? "all",
    branchId: params.get("branchId") ?? "all",
  };
}

function buildSearchString(filters: {
  view: ViewChip;
  q: string;
  categoryId: string;
  branchId: string;
}) {
  const params = new URLSearchParams();
  if (filters.view !== "all") params.set("view", filters.view);
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (filters.categoryId !== "all") params.set("categoryId", filters.categoryId);
  if (filters.branchId !== "all") params.set("branchId", filters.branchId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(price);
}

function isLowStock(avail: NonNullable<AdminProduct["availability"]>[number]) {
  if (!avail.available || avail.inventory <= 0) return false;
  const threshold = avail.minStock ?? 5;
  return avail.inventory <= threshold;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "active":
      return "border-transparent bg-emerald-100 text-emerald-800";
    case "draft":
      return "border-transparent bg-amber-100 text-amber-900";
    case "inactive":
      return "border-transparent bg-muted text-muted-foreground";
    default:
      return "border-transparent bg-muted text-muted-foreground";
  }
}

function inventoryHref(opts: {
  branchId: number;
  state: "LOW_STOCK" | "OUT_OF_STOCK";
  sku?: string;
}) {
  const params = new URLSearchParams();
  params.set("branchId", String(opts.branchId));
  params.set("state", opts.state);
  if (opts.sku) params.set("search", opts.sku);
  return `/admin/inventario?${params.toString()}`;
}

function StockCell({
  product,
  branchId,
}: {
  product: AdminProduct;
  branchId: number;
}) {
  const avail = product.availability?.find((a) => a.branchId === branchId);
  if (!avail || !avail.available) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (avail.inventory === 0) {
    return (
      <Link
        href={inventoryHref({ branchId, state: "OUT_OF_STOCK", sku: product.sku })}
        className="font-medium text-destructive hover:underline"
      >
        Agotado
      </Link>
    );
  }
  if (isLowStock(avail)) {
    return (
      <Link
        href={inventoryHref({ branchId, state: "LOW_STOCK", sku: product.sku })}
        className="font-medium text-amber-800 hover:underline"
        title="Stock bajo"
      >
        {avail.inventory}
        <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide">Bajo</span>
      </Link>
    );
  }
  return <span>{avail.inventory}</span>;
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

function productMatchesCategory(product: AdminProduct, categoryId: number, categories: { id: number; slug: string }[]) {
  const cats = (product as { categories?: Array<{ id: number }> }).categories;
  if (cats?.length) return cats.some((c) => c.id === categoryId);
  const slug = categories.find((c) => c.id === categoryId)?.slug;
  return slug ? product.categorySlug === slug : false;
}

export default function AdminProductsList() {
  const urlSearch = useSearch();
  const [, setLocation] = useLocation();
  const initial = filtersFromSearch(urlSearch);

  const [search, setSearch] = useState(initial.q);
  const [debouncedSearch, setDebouncedSearch] = useState(initial.q);
  const [view, setView] = useState<ViewChip>(initial.view);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [branchId, setBranchId] = useState(initial.branchId);
  const [selected, setSelected] = useState<number[]>([]);
  const [quickEditId, setQuickEditId] = useState<number | null>(null);
  const [bulkAction, setBulkAction] = useState("none");
  const [bulkValue, setBulkValue] = useState("none");
  const [bulkTagValue, setBulkTagValue] = useState("");
  const [bulkPromo, setBulkPromo] = useState({
    name: "Promo masiva",
    type: "percentage",
    value: "20",
    startsAt: "",
    endsAt: "",
  });
  const [bulkCrossSellId, setBulkCrossSellId] = useState("none");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const next = buildSearchString({
      view,
      q: debouncedSearch,
      categoryId,
      branchId,
    });
    const current = urlSearch.startsWith("?") ? urlSearch : urlSearch ? `?${urlSearch}` : "";
    if (next !== current) {
      setLocation(`/admin/productos${next}`, { replace: true });
    }
    try {
      sessionStorage.setItem(PRODUCTS_LIST_QUERY_KEY, next);
    } catch {
      /* ignore */
    }
  }, [view, debouncedSearch, categoryId, branchId, setLocation, urlSearch]);

  const statusFilter: ListAdminProductsStatus | undefined =
    view === "active" ? "active" : view === "draft" ? "draft" : undefined;

  const { data: products, isLoading, isError, refetch } = useListAdminProducts({
    search: debouncedSearch || undefined,
    status: statusFilter,
  });
  const branches = useListAdminBranches();
  const categories = useListCategories();
  const updateProduct = useUpdateProduct();
  const duplicate = useDuplicateProduct();
  const exportProducts = useExportProducts();
  const bulk = useBulkUpdateProducts();

  const categoryList = categories.data ?? [];
  const branchList = branches.data ?? [];

  const filtered = useMemo(() => {
    let list = products ?? [];
    const catId = categoryId !== "all" ? Number(categoryId) : null;
    const brId = branchId !== "all" ? Number(branchId) : null;

    if (catId != null && Number.isFinite(catId)) {
      list = list.filter((p) => productMatchesCategory(p, catId, categoryList));
    }
    if (brId != null && Number.isFinite(brId)) {
      list = list.filter((p) =>
        (p.availability ?? []).some((a) => a.branchId === brId && a.available),
      );
    }
    if (view === "low") {
      list = list.filter((p) =>
        (p.availability ?? []).some((a) => {
          if (brId != null && a.branchId !== brId) return false;
          return isLowStock(a);
        }),
      );
    }
    if (view === "out") {
      list = list.filter((p) =>
        (p.availability ?? []).some((a) => {
          if (brId != null && a.branchId !== brId) return false;
          return a.available && a.inventory === 0;
        }),
      );
    }
    return list;
  }, [products, view, categoryId, branchId, categoryList]);

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (view !== "all") {
      const label = VIEW_CHIPS.find((c) => c.id === view)?.label ?? view;
      chips.push({ key: "view", label: `Vista: ${label}`, clear: () => setView("all") });
    }
    if (debouncedSearch.trim()) {
      chips.push({
        key: "q",
        label: `Buscar: ${debouncedSearch.trim()}`,
        clear: () => {
          setSearch("");
          setDebouncedSearch("");
        },
      });
    }
    if (categoryId !== "all") {
      const name = categoryList.find((c) => String(c.id) === categoryId)?.name ?? categoryId;
      chips.push({
        key: "category",
        label: `Categoría: ${name}`,
        clear: () => setCategoryId("all"),
      });
    }
    if (branchId !== "all") {
      const name = branchList.find((b) => String(b.id) === branchId)?.name ?? branchId;
      chips.push({
        key: "branch",
        label: `Sucursal: ${name}`,
        clear: () => setBranchId("all"),
      });
    }
    return chips;
  }, [view, debouncedSearch, categoryId, branchId, categoryList, branchList]);

  const clearAllFilters = () => {
    setView("all");
    setSearch("");
    setDebouncedSearch("");
    setCategoryId("all");
    setBranchId("all");
  };

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListAdminProductsQueryKey() });

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? filtered.map((p) => p.id) : []);
  };

  const toggleOne = (id: number, checked: boolean) => {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  const archive = async (id: number, name?: string) => {
    const label = name ? `“${name}”` : "este producto";
    if (!window.confirm(`¿Archivar ${label}? Dejará de mostrarse en el catálogo.`)) return;
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
    if (!selected.length || bulkAction === "none") return;
    const action = bulkAction as ProductBulkInputAction;
    const data: any = { ids: selected, action };
    if (action === "set_status") data.status = bulkValue !== "none" ? bulkValue : "active";
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
      setBulkAction("none");
      invalidate();
    } catch {
      toast({ title: "Error en acción masiva", variant: "destructive" });
    }
  };

  const quickProduct = filtered.find((p) => p.id === quickEditId) ?? null;
  const stockBranches =
    branchId !== "all"
      ? branchList.filter((b) => String(b.id) === branchId)
      : branchList;

  const emptyCopy = (() => {
    if (debouncedSearch.trim()) {
      return {
        title: `Ningún resultado para “${debouncedSearch.trim()}”`,
        description: "Prueba otro término o limpia la búsqueda.",
        action: (
          <Button
            type="button"
            variant="outline"
            className="rounded-none"
            onClick={() => {
              setSearch("");
              setDebouncedSearch("");
            }}
          >
            Limpiar búsqueda
          </Button>
        ),
      };
    }
    if (view === "draft") {
      return {
        title: "No hay borradores",
        description: "Los productos en borrador aparecerán aquí hasta publicarlos.",
        action: (
          <Button asChild className="rounded-none">
            <Link href="/admin/productos/nuevo">Añadir producto</Link>
          </Button>
        ),
      };
    }
    if (view === "low") {
      return {
        title: "No hay productos con stock bajo",
        description: "Cuando el inventario cruce el mínimo por sucursal, los verás aquí.",
        action: (
          <Button asChild variant="outline" className="rounded-none">
            <Link
              href={
                branchId !== "all"
                  ? `/admin/inventario?state=LOW_STOCK&branchId=${branchId}`
                  : "/admin/inventario?state=LOW_STOCK"
              }
            >
              Ir a Inventario
            </Link>
          </Button>
        ),
      };
    }
    if (view === "out") {
      return {
        title: "No hay productos agotados",
        description: "Los productos con stock 0 en alguna sucursal aparecerán aquí.",
        action: (
          <Button asChild variant="outline" className="rounded-none">
            <Link
              href={
                branchId !== "all"
                  ? `/admin/inventario?state=OUT_OF_STOCK&branchId=${branchId}`
                  : "/admin/inventario?state=OUT_OF_STOCK"
              }
            >
              Ir a Inventario
            </Link>
          </Button>
        ),
      };
    }
    if (view === "active") {
      return {
        title: "No hay productos activos",
        description: "Publica un borrador o añade un producto nuevo al catálogo.",
        action: (
          <Button asChild className="rounded-none">
            <Link href="/admin/productos/nuevo">Añadir producto</Link>
          </Button>
        ),
      };
    }
    return {
      title: "No se encontraron productos",
      description: "Prueba otro filtro, importa un catálogo o añade un producto nuevo.",
      action: (
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild className="rounded-none">
            <Link href="/admin/productos/nuevo">Añadir producto</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-none">
            <Link href="/admin/importar">Importar</Link>
          </Button>
        </div>
      ),
    };
  })();

  return (
    <AdminLayout>
      <AdminPageShell>
        <AdminPageHeader
          title="Productos"
          description="Catálogo multi-sucursal con edición rápida, importación y exportación."
          actions={
            <>
              <Button asChild variant="outline" className="rounded-none">
                <Link href="/admin/importar">
                  <Upload className="mr-2 h-4 w-4" />
                  Importar
                </Link>
              </Button>
              <Button
                variant="outline"
                className="rounded-none"
                onClick={() => handleExport("csv")}
                disabled={exportProducts.isPending}
              >
                <Download className="mr-2 h-4 w-4" />
                Exportar
              </Button>
              <Button asChild className="rounded-none">
                <Link href="/admin/productos/nuevo">
                  <Plus className="mr-2 h-4 w-4" />
                  Añadir producto
                </Link>
              </Button>
            </>
          }
        />

        <div className="sticky top-0 z-10 -mx-6 space-y-3 border-b border-border bg-background/95 px-6 py-3 backdrop-blur md:-mx-10 md:px-10">
          <AdminFilterBar>
            {VIEW_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setView(chip.id)}
                className={cn(
                  "border px-3 py-1.5 text-sm transition-colors",
                  view === chip.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:bg-muted",
                )}
              >
                {chip.label}
              </button>
            ))}
            <AdminFilterSelect
              value={categoryId}
              onValueChange={setCategoryId}
              placeholder="Categoría"
              triggerClassName="min-w-[10rem]"
              options={[
                { value: "all", label: "Todas las categorías" },
                ...categoryList.map((c) => ({ value: String(c.id), label: c.name })),
              ]}
            />
            <AdminFilterSelect
              value={branchId}
              onValueChange={setBranchId}
              placeholder="Sucursal"
              triggerClassName="min-w-[10rem]"
              options={[
                { value: "all", label: "Todas las sucursales" },
                ...branchList.map((b) => ({ value: String(b.id), label: b.name })),
              ]}
            />
            <div className="relative min-w-[12rem] flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 rounded-none bg-background pl-9"
                aria-label="Buscar productos"
              />
            </div>
          </AdminFilterBar>

          {activeFilterChips.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.clear}
                  className="inline-flex items-center gap-1 border border-border bg-muted/30 px-2.5 py-1 text-xs hover:bg-muted"
                >
                  {chip.label}
                  <X className="h-3 w-3" />
                </button>
              ))}
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                Limpiar todo
              </button>
            </div>
          ) : null}
        </div>

        {selected.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border border-border bg-muted/20 p-3">
            <span className="text-sm font-medium">{selected.length} seleccionados</span>
            <AdminFilterSelect
              value={bulkAction}
              onValueChange={setBulkAction}
              placeholder="Acción masiva"
              triggerClassName="min-w-[12rem]"
              options={[
                { value: "none", label: "Acción masiva..." },
                { value: "set_status", label: "Cambiar estado" },
                { value: "add_categories", label: "Añadir categoría" },
                { value: "remove_categories", label: "Quitar categoría" },
                { value: "replace_categories", label: "Reemplazar categorías" },
                { value: "add_tags", label: "Añadir etiquetas" },
                { value: "remove_tags", label: "Quitar etiquetas" },
                { value: "replace_tags", label: "Reemplazar etiquetas" },
                { value: "assign_branch", label: "Asignar sucursal" },
                { value: "unassign_branch", label: "Quitar sucursal" },
                { value: "set_min_stock", label: "Actualizar stock mínimo" },
                { value: "set_price", label: "Modificar precio" },
                { value: "set_featured", label: "Destacar" },
                { value: "create_promotion", label: "Crear promoción" },
                { value: "add_cross_sell", label: "Añadir cross-sell" },
                { value: "replace_cross_sell", label: "Reemplazar cross-sell" },
                { value: "archive", label: "Archivar" },
                { value: "cancel_promotions", label: "Eliminar promociones" },
              ]}
            />
            {bulkAction === "set_status" ? (
              <AdminFilterSelect
                value={bulkValue === "none" ? "active" : bulkValue}
                onValueChange={setBulkValue}
                options={[
                  { value: "active", label: "Activo" },
                  { value: "draft", label: "Borrador" },
                  { value: "inactive", label: "Inactivo" },
                ]}
              />
            ) : null}
            {["set_category", "add_categories", "remove_categories", "replace_categories"].includes(
              bulkAction,
            ) ? (
              <AdminFilterSelect
                value={bulkValue}
                onValueChange={setBulkValue}
                placeholder="Categoría"
                options={[
                  { value: "none", label: "Categoría..." },
                  ...categoryList.map((c) => ({
                    value: String(c.id),
                    label: c.name,
                  })),
                ]}
              />
            ) : null}
            {["add_tags", "remove_tags", "replace_tags"].includes(bulkAction) ? (
              <Input
                className="h-10 w-56 rounded-none"
                value={bulkTagValue}
                onChange={(e) => setBulkTagValue(e.target.value)}
                placeholder="Etiquetas con |"
              />
            ) : null}
            {bulkAction === "assign_branch" ||
            bulkAction === "unassign_branch" ||
            bulkAction === "set_min_stock" ? (
              <AdminFilterSelect
                value={bulkValue}
                onValueChange={setBulkValue}
                placeholder="Sucursal"
                options={[
                  { value: "none", label: "Sucursal..." },
                  ...branchList.map((b) => ({ value: String(b.id), label: b.name })),
                ]}
              />
            ) : null}
            {bulkAction === "set_min_stock" ? (
              <Input
                type="number"
                className="h-10 w-28 rounded-none"
                value={bulkTagValue}
                onChange={(e) => setBulkTagValue(e.target.value)}
                placeholder="Mín."
              />
            ) : null}
            {bulkAction === "set_price" ? (
              <Input
                type="number"
                className="h-10 w-28 rounded-none"
                value={bulkValue === "none" ? "" : bulkValue}
                onChange={(e) => setBulkValue(e.target.value || "none")}
                placeholder="Precio"
              />
            ) : null}
            {bulkAction === "set_featured" ? (
              <AdminFilterSelect
                value={bulkValue === "none" ? "true" : bulkValue}
                onValueChange={setBulkValue}
                options={[
                  { value: "true", label: "Sí" },
                  { value: "false", label: "No" },
                ]}
              />
            ) : null}
            {bulkAction === "create_promotion" ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="h-10 w-28 rounded-none"
                  value={bulkPromo.value}
                  onChange={(e) => setBulkPromo((p) => ({ ...p, value: e.target.value }))}
                  placeholder="% o monto"
                />
                <AdminFilterSelect
                  value={bulkPromo.type}
                  onValueChange={(type) => setBulkPromo((p) => ({ ...p, type }))}
                  options={[
                    { value: "percentage", label: "%" },
                    { value: "amount", label: "Monto" },
                    { value: "fixed", label: "Precio fijo" },
                  ]}
                />
                <Input
                  type="datetime-local"
                  className="h-10 rounded-none"
                  value={bulkPromo.startsAt}
                  onChange={(e) => setBulkPromo((p) => ({ ...p, startsAt: e.target.value }))}
                />
                <Input
                  type="datetime-local"
                  className="h-10 rounded-none"
                  value={bulkPromo.endsAt}
                  onChange={(e) => setBulkPromo((p) => ({ ...p, endsAt: e.target.value }))}
                />
                <span className="text-xs text-muted-foreground">
                  Preview: {selected.length} productos
                </span>
              </div>
            ) : null}
            {bulkAction === "add_cross_sell" || bulkAction === "replace_cross_sell" ? (
              <AdminFilterSelect
                value={bulkCrossSellId}
                onValueChange={setBulkCrossSellId}
                placeholder="Producto"
                triggerClassName="min-w-[14rem]"
                options={[
                  { value: "none", label: "Producto recomendado..." },
                  ...filtered.map((p) => ({
                    value: String(p.id),
                    label: `${p.name} (${p.sku})`,
                  })),
                ]}
              />
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

        {isLoading ? <AdminLoading label="Cargando productos…" /> : null}
        {isError ? (
          <AdminError title="No se pudieron cargar los productos" onRetry={() => refetch()} />
        ) : null}
        {!isLoading && !isError && filtered.length === 0 ? (
          <AdminEmptyState
            icon={Package}
            title={emptyCopy.title}
            description={emptyCopy.description}
            action={emptyCopy.action}
          />
        ) : null}

        {!isLoading && !isError && filtered.length > 0 ? (
          <AdminTable>
            <AdminTableHeader>
              <AdminTableRow>
                <AdminTableHead className="w-10">
                  <Checkbox
                    checked={filtered.length > 0 && selected.length === filtered.length}
                    onCheckedChange={(checked) => toggleAll(checked === true)}
                    className="rounded-none"
                    aria-label="Seleccionar todos"
                  />
                </AdminTableHead>
                <AdminTableHead>Producto</AdminTableHead>
                <AdminTableHead>SKU</AdminTableHead>
                <AdminTableHead>Categoría</AdminTableHead>
                <AdminTableHead className="text-right">Precio</AdminTableHead>
                {stockBranches.map((b) => (
                  <AdminTableHead key={b.id} className="text-center">
                    {b.shortName || b.name}
                  </AdminTableHead>
                ))}
                <AdminTableHead className="text-center">Promo</AdminTableHead>
                <AdminTableHead className="text-center">Estado</AdminTableHead>
                <AdminTableHead className="text-right">Acciones</AdminTableHead>
              </AdminTableRow>
            </AdminTableHeader>
            <AdminTableBody>
              {filtered.map((product) => (
                <AdminTableRow key={product.id} className="h-[52px]">
                  <AdminTableCell>
                    <Checkbox
                      checked={selected.includes(product.id)}
                      onCheckedChange={(checked) => toggleOne(product.id, checked === true)}
                      className="rounded-none"
                      aria-label={`Seleccionar ${product.name}`}
                    />
                  </AdminTableCell>
                  <AdminTableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 shrink-0 overflow-hidden bg-muted">
                        <ImageWithFallback
                          src={product.imageUrl}
                          alt={product.name}
                          className="h-full w-full object-cover"
                          fallback={<div className="h-full w-full bg-muted" />}
                        />
                      </div>
                      <div className="font-medium">{product.name}</div>
                    </div>
                  </AdminTableCell>
                  <AdminTableCell className="font-mono text-xs">{product.sku}</AdminTableCell>
                  <AdminTableCell className="text-muted-foreground">
                    {product.categoryName || "—"}
                  </AdminTableCell>
                  <AdminTableCell className="text-right">
                    {formatPrice(product.price)}
                  </AdminTableCell>
                  {stockBranches.map((b) => (
                    <AdminTableCell key={b.id} className="text-center">
                      <StockCell product={product} branchId={b.id} />
                    </AdminTableCell>
                  ))}
                  <AdminTableCell className="text-center">{promoLabel(product)}</AdminTableCell>
                  <AdminTableCell className="text-center">
                    <Badge
                      className={cn(
                        "rounded-none font-medium shadow-none",
                        statusBadgeClass(product.status),
                      )}
                    >
                      {STATUS_LABEL[product.status] ?? product.status}
                    </Badge>
                  </AdminTableCell>
                  <AdminTableCell>
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="ghost" size="sm" className="h-8 rounded-none px-2">
                        <Link href={`/admin/productos/${product.id}`} title="Editar">
                          <Edit className="h-4 w-4" />
                          <span className="sr-only">Editar</span>
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 rounded-none px-2"
                        onClick={() => setQuickEditId(product.id)}
                        title="Edición rápida"
                      >
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edición rápida</span>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-none px-2"
                            title="Más acciones"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Más acciones</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-none">
                          <DropdownMenuItem onClick={() => handleDuplicate(product.id)}>
                            <Copy className="mr-2 h-4 w-4" />
                            Duplicar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => archive(product.id, product.name)}
                          >
                            <Archive className="mr-2 h-4 w-4" />
                            Archivar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
        ) : null}
      </AdminPageShell>

      {quickProduct ? (
        <ProductQuickEdit
          product={quickProduct}
          branches={branchList}
          categories={categoryList}
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
