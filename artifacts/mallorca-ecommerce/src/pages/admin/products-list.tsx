import AdminImport from "@/pages/admin/import";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ProductStockSheet } from "@/components/admin/product-stock-sheet";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminProducts,
  useListAdminInventory,
  useListAdminBranches,
  useListCategories,
  useUpdateProduct,
  useDuplicateProduct,
  useExportProducts,
  useBulkUpdateProducts,
  getListAdminProductsQueryKey,
  getListAdminInventoryQueryKey,
  getGetInventoryMatrixQueryKey,
  getListProductsQueryKey,
  getGetProductQueryKey,
  type AdminProduct,
  type ListAdminProductsStatus,
  type ProductBulkInputAction,
} from "@workspace/api-client-react";
import {
  Search,
  Plus,
  Download,
  Upload,
  Copy,
  Trash2,
  MoreHorizontal,
  Package,
  Pencil,
  SquarePen,
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

type ViewChip = "all" | "active" | "draft" | "inactive" | "low" | "out" | "critical" | "normal";

const VIEW_CHIPS: { id: ViewChip; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "active", label: "Activos" },
  { id: "draft", label: "Borradores" },
  { id: "inactive", label: "Inactivos" },
  { id: "normal", label: "Stock normal" },
  { id: "low", label: "Stock bajo" },
  { id: "critical", label: "Crítico" },
  { id: "out", label: "Agotados" },
];

const STATUS_LABEL: Record<string, string> = {
  active: "Activo",
  draft: "Borrador",
  inactive: "Inactivo",
};

const PRODUCTS_LIST_QUERY_KEY = "admin.productos.search";

function parseView(value: string | null): ViewChip {
  if (value === "active" || value === "draft" || value === "inactive" || value === "low" || value === "out" || value === "critical" || value === "normal") {
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

function StockCell({ product, branchId, onManage }: {
  product: AdminProduct; branchId: number; onManage: () => void;
}) {
  const avail = product.availability?.find(a => a.branchId === branchId);
  if (!avail || !avail.available) return <span className="text-muted-foreground">—</span>;
  const low = isLowStock(avail);
  return <button type="button" onClick={onManage}
    className={cn("min-h-9 min-w-9 px-2 font-medium underline decoration-dotted underline-offset-4 hover:bg-muted focus-visible:outline focus-visible:outline-2", avail.inventory === 0 ? "text-destructive" : low ? "text-amber-800" : "text-foreground")}
    aria-label={`Gestionar existencias de ${product.name}: ${avail.inventory} unidades`}
    title="Ajustar existencias sin salir del catálogo">
    {avail.inventory === 0 ? "Agotado" : avail.inventory}
    {low && <span className="ml-1 text-[10px] uppercase">Bajo</span>}
  </button>;
}

function promoLabel(product: AdminProduct) {
  const promo = product.availability?.find((a) => a.promotion)?.promotion;
  if (!promo) return "—";
  if (promo.type === "percentage") return `-${promo.value}%`;
  if (promo.type === "amount") return `-$${promo.value}`;
  return `$${promo.value}`;
}

function ProductRowActions({
  product,
  size = "sm",
  fullWidth = false,
  onQuickEdit,
  onDuplicate,
  onRemove,
}: {
  product: AdminProduct;
  size?: "sm" | "md";
  fullWidth?: boolean;
  onQuickEdit: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const btn = size === "md" ? "h-9 w-9" : "h-8 w-8";
  return (
    <div
      className={cn(
        "inline-flex border border-border bg-background",
        fullWidth && "w-full",
      )}
    >
      <Button
        variant="ghost"
        size="icon"
        className={cn("rounded-none", btn, fullWidth && "flex-1")}
        asChild
      >
        <Link
          href={`/admin/productos/${product.id}`}
          aria-label={`Editar ${product.name}`}
          title="Editar"
        >
          <SquarePen className="h-3.5 w-3.5" />
        </Link>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("rounded-none border-l border-border", btn, fullWidth && "flex-1")}
        onClick={onQuickEdit}
        aria-label={`Edición rápida de ${product.name}`}
        title="Edición rápida"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("rounded-none border-l border-border", btn)}
            aria-label={`Más acciones para ${product.name}`}
            title="Más acciones"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="rounded-none">
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicar
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={onRemove}
            disabled={product.status === "inactive"}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {product.status === "inactive" ? "Ya está fuera del catálogo" : "Eliminar del catálogo"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
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
  const [importOpen, setImportOpen] = useState(false);
  const [stockTarget, setStockTarget] = useState<{ product: AdminProduct; branchId: number } | null>(null);
  const [quickEditId, setQuickEditId] = useState<number | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ id: number; name: string; slug: string } | null>(null);
  const [removalResult, setRemovalResult] = useState<{ success: boolean; message: string } | null>(null);
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
    view === "active" ? "active" : view === "draft" ? "draft" : view === "inactive" ? "inactive" : undefined;

  const { data: products, isLoading: productsLoading, isError: productsError, refetch } = useListAdminProducts({
    search: debouncedSearch || undefined,
    status: statusFilter,
  });
  const inventoryStates = { low: "LOW_STOCK", critical: "CRITICAL_STOCK", out: "OUT_OF_STOCK", normal: "NORMAL" } as const;
  const inventoryState = inventoryStates[view as keyof typeof inventoryStates];
  const inventoryParams = {
    state: inventoryState,
    branchId: branchId !== "all" ? Number(branchId) : undefined,
    categoryId: categoryId !== "all" ? Number(categoryId) : undefined,
    search: debouncedSearch || undefined,
  };
  const inventory = useListAdminInventory(inventoryParams, { query: { queryKey: getListAdminInventoryQueryKey(inventoryParams), enabled: Boolean(inventoryState) } });
  const isLoading = productsLoading || (Boolean(inventoryState) && inventory.isLoading);
  const isError = productsError || (Boolean(inventoryState) && inventory.isError);
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
    if (view === "all") {
      list = list.filter((product) => product.status !== "inactive");
    }
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
    if (inventoryState) {
      const ids = new Set((inventory.data ?? []).map(row => row.product.id));
      list = list.filter(product => ids.has(product.id));
    }
    return list;
  }, [products, view, inventoryState, inventory.data, categoryId, branchId, categoryList]);

  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
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
  }, [debouncedSearch, categoryId, branchId, categoryList, branchList]);

  const clearAllFilters = () => {
    setView("all");
    setSearch("");
    setDebouncedSearch("");
    setCategoryId("all");
    setBranchId("all");
  };

  const invalidate = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: getListAdminProductsQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getListAdminInventoryQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getGetInventoryMatrixQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() }),
  ]);

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? filtered.map((p) => p.id) : []);
  };

  const toggleOne = (id: number, checked: boolean) => {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  };

  const removeFromCatalog = async () => {
    if (!removeTarget || updateProduct.isPending) return;
    const { id, name, slug } = removeTarget;
    try {
      await updateProduct.mutateAsync({ id, data: { status: "inactive" } as any });
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: getGetProductQueryKey(slug) });
      setSelected((current) => current.filter((selectedId) => selectedId !== id));
      setRemovalResult({ success: true, message: `“${name}” se eliminó del catálogo de la tienda. Su registro se conserva para el historial de pedidos.` });
    } catch {
      setRemovalResult({ success: false, message: `No se pudo eliminar “${name}” del catálogo. Inténtalo de nuevo.` });
    } finally {
      setRemoveTarget(null);
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
    if (!filtered.length) { toast({ title: "No hay productos para exportar" }); return; }
    try {
      const result = await exportProducts.mutateAsync({
        data: {
          search: debouncedSearch || undefined,
          status: statusFilter,
          ids: selectedOnly && selected.length ? selected : filtered.map(product => product.id),
          format,
          reimportable: true,
        },
      });
      if (format === "xlsx") {
        const workbook = XLSX.read(result.content, { type: "string", raw: true });
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
          title="Productos e inventario"
          description="Edita productos y ajusta existencias desde un solo lugar. Pulsa el stock de una sucursal para gestionarlo."
          actions={
            <>
              <Button onClick={() => setImportOpen(true)} variant="outline" size="sm" className="rounded-none px-2.5 md:h-10 md:px-4" aria-label="Importar">
                  <Upload className="h-4 w-4 sm:mr-1.5 md:mr-2" />
                  <span className="hidden sm:inline">Importar</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="rounded-none px-2.5 md:h-10 md:px-4"
                onClick={() => handleExport("xlsx")}
                disabled={exportProducts.isPending}
                aria-label="Exportar"
              >
                <Download className="h-4 w-4 sm:mr-1.5 md:mr-2" />
                <span className="hidden sm:inline">Exportar</span>
              </Button>
              <Button asChild size="sm" className="min-w-0 flex-1 rounded-none md:h-10 md:flex-none md:px-4">
                <Link href="/admin/productos/nuevo">
                  <Plus className="mr-1.5 h-4 w-4 md:mr-2" />
                  <span className="sm:hidden">Añadir</span>
                  <span className="hidden sm:inline">Añadir producto</span>
                </Link>
              </Button>
            </>
          }
        />

        {removalResult ? (
          <div
            role="status"
            aria-live="polite"
            className={cn(
              "fixed bottom-5 left-4 right-4 z-[60] flex items-start justify-between gap-3 border px-4 py-3 text-sm shadow-lg sm:left-auto sm:right-6 sm:w-[28rem]",
              removalResult.success
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-destructive/40 bg-destructive/5 text-destructive",
            )}
          >
            <span>{removalResult.message}</span>
            <button type="button" onClick={() => setRemovalResult(null)} aria-label="Cerrar mensaje" className="shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <div className="sticky top-0 z-10 -mx-4 space-y-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 md:-mx-10 md:px-10">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div
              className="-mx-4 flex overflow-x-auto border-y border-border bg-background px-0 sm:mx-0 sm:border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="tablist"
              aria-label="Vista del catálogo"
            >
              {VIEW_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  role="tab"
                  aria-selected={view === chip.id}
                  onClick={() => setView(chip.id)}
                  className={cn(
                    "h-8 shrink-0 border-r border-border px-2.5 text-xs font-medium last:border-r-0 sm:px-3",
                    view === chip.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-foreground hover:bg-muted",
                  )}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Nombre o SKU"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 rounded-none bg-background pl-8 text-sm"
                aria-label="Buscar productos"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <AdminFilterSelect
              value={categoryId}
              onValueChange={setCategoryId}
              placeholder="Categoría"
              triggerClassName="h-8 min-w-0 w-full text-xs"
              options={[
                { value: "all", label: "Categorías" },
                ...categoryList.map((c) => ({ value: String(c.id), label: c.name })),
              ]}
            />
            <AdminFilterSelect
              value={branchId}
              onValueChange={setBranchId}
              placeholder="Sucursal"
              triggerClassName="h-8 min-w-0 w-full text-xs"
              options={[
                { value: "all", label: "Sucursales" },
                ...branchList.map((b) => ({ value: String(b.id), label: b.name })),
              ]}
            />
          </div>

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
          <div className="flex flex-col gap-2 border border-border bg-muted/20 p-3 sm:flex-row sm:flex-wrap sm:items-center">
            <span className="text-sm font-medium">{selected.length} seleccionados</span>
            <AdminFilterSelect
              value={bulkAction}
              onValueChange={setBulkAction}
              placeholder="Acción masiva"
              triggerClassName="min-w-0 w-full sm:min-w-[12rem] sm:w-auto"
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
                triggerClassName="min-w-0 w-full sm:w-auto"
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
                triggerClassName="min-w-0 w-full sm:w-auto"
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
                className="h-10 w-full rounded-none sm:w-56"
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
                triggerClassName="min-w-0 w-full sm:w-auto"
                options={[
                  { value: "none", label: "Sucursal..." },
                  ...branchList.map((b) => ({ value: String(b.id), label: b.name })),
                ]}
              />
            ) : null}
            {bulkAction === "set_min_stock" ? (
              <Input
                type="number"
                className="h-10 w-full rounded-none sm:w-28"
                value={bulkTagValue}
                onChange={(e) => setBulkTagValue(e.target.value)}
                placeholder="Mín."
              />
            ) : null}
            {bulkAction === "set_price" ? (
              <Input
                type="number"
                className="h-10 w-full rounded-none sm:w-28"
                value={bulkValue === "none" ? "" : bulkValue}
                onChange={(e) => setBulkValue(e.target.value || "none")}
                placeholder="Precio"
              />
            ) : null}
            {bulkAction === "set_featured" ? (
              <AdminFilterSelect
                value={bulkValue === "none" ? "true" : bulkValue}
                onValueChange={setBulkValue}
                triggerClassName="min-w-0 w-full sm:w-auto"
                options={[
                  { value: "true", label: "Sí" },
                  { value: "false", label: "No" },
                ]}
              />
            ) : null}
            {bulkAction === "create_promotion" ? (
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <Input
                  className="h-10 w-full rounded-none sm:w-28"
                  value={bulkPromo.value}
                  onChange={(e) => setBulkPromo((p) => ({ ...p, value: e.target.value }))}
                  placeholder="% o monto"
                />
                <AdminFilterSelect
                  value={bulkPromo.type}
                  onValueChange={(type) => setBulkPromo((p) => ({ ...p, type }))}
                  triggerClassName="min-w-0 w-full sm:w-auto"
                  options={[
                    { value: "percentage", label: "%" },
                    { value: "amount", label: "Monto" },
                    { value: "fixed", label: "Precio fijo" },
                  ]}
                />
                <Input
                  type="datetime-local"
                  className="h-10 w-full rounded-none sm:w-auto"
                  value={bulkPromo.startsAt}
                  onChange={(e) => setBulkPromo((p) => ({ ...p, startsAt: e.target.value }))}
                />
                <Input
                  type="datetime-local"
                  className="h-10 w-full rounded-none sm:w-auto"
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
                triggerClassName="min-w-0 w-full sm:min-w-[14rem] sm:w-auto"
                options={[
                  { value: "none", label: "Producto recomendado..." },
                  ...filtered.map((p) => ({
                    value: String(p.id),
                    label: `${p.name} (${p.sku})`,
                  })),
                ]}
              />
            ) : null}
            <div className="flex w-full gap-2 sm:w-auto">
              <Button size="sm" className="flex-1 rounded-none sm:flex-none" onClick={runBulk} disabled={bulk.isPending}>
                Aplicar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 rounded-none sm:flex-none"
                onClick={() => handleExport("xlsx", true)}
              >
                Exportar selección
              </Button>
            </div>
          </div>
        ) : null}

        {isLoading ? <AdminLoading label="Cargando productos…" /> : null}
        {isError ? (
          <AdminError title="No se pudieron cargar los productos" onRetry={() => { void refetch(); if (inventoryState) void inventory.refetch(); }} />
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
          <>
            {/* Mobile card list */}
            <div className="space-y-3 lg:hidden">
              <div className="flex items-center gap-2 px-0.5">
                <Checkbox
                  checked={filtered.length > 0 && selected.length === filtered.length}
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                  className="rounded-none"
                  aria-label="Seleccionar todos"
                />
                <span className="text-xs text-muted-foreground">
                  {selected.length > 0
                    ? `${selected.length} de ${filtered.length}`
                    : `${filtered.length} productos`}
                </span>
              </div>
              {filtered.map((product) => (
                <article
                  key={product.id}
                  className="border border-border bg-card p-3"
                >
                  <div className="flex gap-3">
                    <Checkbox
                      checked={selected.includes(product.id)}
                      onCheckedChange={(checked) => toggleOne(product.id, checked === true)}
                      className="mt-1 rounded-none"
                      aria-label={`Seleccionar ${product.name}`}
                    />
                    <div className="h-14 w-14 shrink-0 overflow-hidden bg-muted">
                      <ImageWithFallback
                        src={product.imageUrl}
                        alt={product.name}
                        className="h-full w-full object-cover"
                        fallback={<div className="h-full w-full bg-muted" />}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate font-medium leading-snug">{product.name}</h3>
                          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                            {product.sku}
                            {product.categoryName ? ` · ${product.categoryName}` : ""}
                          </p>
                        </div>
                        <Badge
                          className={cn(
                            "shrink-0 rounded-none font-medium shadow-none",
                            statusBadgeClass(product.status),
                          )}
                        >
                          {STATUS_LABEL[product.status] ?? product.status}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                        {product.salePrice != null && product.salePrice < product.price ? (
                          <>
                            <span className="font-medium">{formatPrice(product.salePrice)}</span>
                            <span className="text-xs text-muted-foreground line-through">
                              {formatPrice(product.price)}
                            </span>
                          </>
                        ) : (
                          <span className="font-medium">{formatPrice(product.price)}</span>
                        )}
                        {promoLabel(product) !== "—" ? (
                          <span className="text-xs text-primary">Promo {promoLabel(product)}</span>
                        ) : null}
                      </div>
                      {stockBranches.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          {stockBranches.map((b) => (
                            <span key={b.id} className="inline-flex items-center gap-1">
                              <span className="font-medium text-foreground/70">
                                {b.shortName || b.name}:
                              </span>
                              <StockCell product={product} branchId={b.id} onManage={() => setStockTarget({ product, branchId: b.id })} />
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 flex border-t border-border pt-3">
                    <ProductRowActions
                      product={product}
                      size="md"
                      fullWidth
                      onQuickEdit={() => setQuickEditId(product.id)}
                      onDuplicate={() => handleDuplicate(product.id)}
                      onRemove={() => {
                        setRemovalResult(null);
                        setRemoveTarget({ id: product.id, name: product.name, slug: product.slug });
                      }}
                    />
                  </div>
                </article>
              ))}
            </div>

            {/* Desktop table */}
            <AdminTable containerClassName="hidden lg:block">
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
                <AdminTableHead className="hidden xl:table-cell">SKU</AdminTableHead>
                <AdminTableHead className="hidden xl:table-cell">Categoría</AdminTableHead>
                <AdminTableHead className="text-right">Precio</AdminTableHead>
                {stockBranches.map((b) => (
                  <AdminTableHead key={b.id} className="text-center">
                    {b.shortName || b.name}
                  </AdminTableHead>
                ))}
                <AdminTableHead className="hidden xl:table-cell text-center">Promo</AdminTableHead>
                <AdminTableHead className="text-center">Estado</AdminTableHead>
                <AdminTableHead className="sticky right-0 z-20 w-px border-l border-border bg-muted text-right">
                  <span className="sr-only">Acciones</span>
                </AdminTableHead>
              </AdminTableRow>
            </AdminTableHeader>
            <AdminTableBody>
              {filtered.map((product) => (
                <AdminTableRow key={product.id} className="group">
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
                      <div className="min-w-0">
                        <div className="font-medium">{product.name}</div>
                        <div className="mt-0.5 font-mono text-[11px] text-muted-foreground xl:hidden">
                          {product.sku}
                          {product.categoryName ? ` · ${product.categoryName}` : ""}
                        </div>
                      </div>
                    </div>
                  </AdminTableCell>
                  <AdminTableCell className="hidden font-mono text-xs xl:table-cell">{product.sku}</AdminTableCell>
                  <AdminTableCell className="hidden text-muted-foreground xl:table-cell">
                    {product.categoryName || "—"}
                  </AdminTableCell>
                  <AdminTableCell className="text-right">
                    {product.salePrice != null && product.salePrice < product.price ? (
                      <div className="flex flex-col items-end leading-tight">
                        <span>{formatPrice(product.salePrice)}</span>
                        <span className="text-xs text-muted-foreground line-through">{formatPrice(product.price)}</span>
                      </div>
                    ) : (
                      formatPrice(product.price)
                    )}
                  </AdminTableCell>
                  {stockBranches.map((b) => (
                    <AdminTableCell key={b.id} className="text-center">
                      <StockCell product={product} branchId={b.id} onManage={() => setStockTarget({ product, branchId: b.id })} />
                    </AdminTableCell>
                  ))}
                  <AdminTableCell className="hidden text-center xl:table-cell">{promoLabel(product)}</AdminTableCell>
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
                  <AdminTableCell
                    onClick={(e) => e.stopPropagation()}
                    className="sticky right-0 z-10 w-px whitespace-nowrap border-l border-border bg-background py-1 text-right group-hover:bg-muted/50"
                  >
                    <ProductRowActions
                      product={product}
                      onQuickEdit={() => setQuickEditId(product.id)}
                      onDuplicate={() => handleDuplicate(product.id)}
                      onRemove={() => {
                        setRemovalResult(null);
                        setRemoveTarget({ id: product.id, name: product.name, slug: product.slug });
                      }}
                    />
                  </AdminTableCell>
                </AdminTableRow>
              ))}
            </AdminTableBody>
          </AdminTable>
          </>
        ) : null}
      </AdminPageShell>

      <Dialog open={removeTarget !== null} onOpenChange={(open) => {
        if (!open && !updateProduct.isPending) setRemoveTarget(null);
      }}>
        <DialogContent className="rounded-none">
          <DialogHeader>
            <DialogTitle>Eliminar del catálogo</DialogTitle>
            <DialogDescription>
              {removeTarget ? `“${removeTarget.name}” dejará de aparecer en la tienda. Se conservará su registro para el historial de pedidos y podrás reactivarlo desde su ficha.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setRemoveTarget(null)} disabled={updateProduct.isPending}>Cancelar</Button>
            <Button type="button" variant="destructive" onClick={() => void removeFromCatalog()} disabled={updateProduct.isPending}>
              {updateProduct.isPending ? "Eliminando..." : "Eliminar del catálogo"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Sheet open={importOpen} onOpenChange={setImportOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-4xl">
          <SheetHeader><SheetTitle>Importar productos e inventario</SheetTitle><SheetDescription>Actualiza el catálogo y las existencias con un solo archivo.</SheetDescription></SheetHeader>
          <AdminImport embedded />
        </SheetContent>
      </Sheet>
      {stockTarget && <ProductStockSheet product={stockTarget.product} branchId={stockTarget.branchId} onClose={() => setStockTarget(null)} />}

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
