import { ProductWorkspaceNav } from "@/components/admin/product-workspace-nav";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListAdminProductsQueryKey,
  getGetInventoryMatrixQueryKey,
  getListAdminInventoryQueryKey,
  useGetInventoryMatrix,
  useListAdminBranches,
  useListAdminInventory,
  useListCategories,
  useUpdateAdminInventory,
  type InventoryRow,
  type ListAdminInventoryParams,
} from "@workspace/api-client-react";
import { Boxes, Grid2X2, List, Minus, Plus, Upload } from "lucide-react";
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
import { GenerateInventoryAlertDialog } from "@/components/generate-inventory-alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type LooseInventoryRow = InventoryRow & {
  branchProduct: {
    id?: number;
    inventory?: number;
    minStock?: number;
    criticalStock?: number | null;
    alertState?: string;
    available?: boolean;
    autoAlertEnabled?: boolean;
  };
  availableStock?: number;
  openAlertCount?: number;
  inventoryStatus?: string;
};

const INVENTORY_STATES = ["NORMAL", "LOW_STOCK", "CRITICAL_STOCK", "OUT_OF_STOCK"] as const;
const MATRIX_TIMEOUT_MS = 12_000;

function searchParamsFromUrl(search: string) {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

function parseIdParam(value: string | null) {
  if (!value || value === "all") return "all";
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : "all";
}

function parseStateParam(value: string | null) {
  if (!value || value === "all") return "all";
  return INVENTORY_STATES.includes(value as (typeof INVENTORY_STATES)[number]) ? value : "all";
}

function filtersFromSearch(search: string) {
  const params = searchParamsFromUrl(search);
  return {
    searchText: params.get("search") || params.get("q") || "",
    branchId: parseIdParam(params.get("branchId")),
    state: parseStateParam(params.get("state")),
    categoryId: parseIdParam(params.get("categoryId")),
  };
}

function buildInventorySearch(filters: {
  searchText: string;
  branchId: string;
  state: string;
  categoryId: string;
}) {
  const params = new URLSearchParams({ tab: "inventario" });
  if (filters.searchText.trim()) params.set("search", filters.searchText.trim());
  if (filters.branchId !== "all") params.set("branchId", filters.branchId);
  if (filters.state !== "all") params.set("state", filters.state);
  if (filters.categoryId !== "all") params.set("categoryId", filters.categoryId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

function rowStatus(row: LooseInventoryRow) {
  return row.inventoryStatus ?? row.branchProduct.alertState;
}

function statusLabel(status?: string) {
  if (status === "OUT_OF_STOCK") return "Agotado";
  if (status === "CRITICAL_STOCK") return "Crítico";
  if (status === "LOW_STOCK") return "Stock bajo";
  return "Normal";
}

function statusClass(status?: string) {
  if (status === "OUT_OF_STOCK") return "bg-destructive/10 text-destructive";
  if (status === "CRITICAL_STOCK") return "bg-orange-100 text-orange-900";
  if (status === "LOW_STOCK") return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

export default function AdminInventory() {
  const urlSearch = useSearch();
  const [, setLocation] = useLocation();
  const initial = filtersFromSearch(urlSearch);
  const [searchText, setSearchText] = useState(initial.searchText);
  const [debouncedSearch, setDebouncedSearch] = useState(initial.searchText);
  const [branchId, setBranchId] = useState(initial.branchId);
  const [state, setState] = useState(initial.state);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [matrix, setMatrix] = useState(false);
  const [matrixTimedOut, setMatrixTimedOut] = useState(false);
  const [alertTarget, setAlertTarget] = useState<LooseInventoryRow | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    const fromUrl = filtersFromSearch(urlSearch);
    setBranchId((current) => (current === fromUrl.branchId ? current : fromUrl.branchId));
    setState((current) => (current === fromUrl.state ? current : fromUrl.state));
    setCategoryId((current) => (current === fromUrl.categoryId ? current : fromUrl.categoryId));
    setSearchText((current) => (current === fromUrl.searchText ? current : fromUrl.searchText));
    setDebouncedSearch((current) =>
      current === fromUrl.searchText ? current : fromUrl.searchText,
    );
  }, [urlSearch]);

  useEffect(() => {
    const next = buildInventorySearch({
      searchText: debouncedSearch,
      branchId,
      state,
      categoryId,
    });
    const current = urlSearch.startsWith("?") ? urlSearch : urlSearch ? `?${urlSearch}` : "";
    if (next !== current) {
      setLocation(`/admin/productos${next}`, { replace: true });
    }
  }, [debouncedSearch, branchId, state, categoryId, setLocation, urlSearch]);

  const params: ListAdminInventoryParams = {
    search: debouncedSearch || undefined,
    branchId: branchId !== "all" ? Number(branchId) : undefined,
    state: (state !== "all" ? state : undefined) as ListAdminInventoryParams["state"],
    categoryId: categoryId !== "all" ? Number(categoryId) : undefined,
  };
  const attentionParams: ListAdminInventoryParams = {
    search: debouncedSearch || undefined,
    branchId: branchId !== "all" ? Number(branchId) : undefined,
    categoryId: categoryId !== "all" ? Number(categoryId) : undefined,
  };
  const rows = useListAdminInventory(params);
  const attention = useListAdminInventory(attentionParams);
  const matrixQuery = useGetInventoryMatrix({
    query: {
      enabled: matrix,
      retry: 1,
      queryKey: getGetInventoryMatrixQueryKey(),
    },
  });
  const branches = useListAdminBranches();
  const categories = useListCategories();
  const update = useUpdateAdminInventory();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!matrix || !matrixQuery.isLoading) {
      setMatrixTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setMatrixTimedOut(true), MATRIX_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [matrix, matrixQuery.isLoading]);

  const change = async (row: LooseInventoryRow, value: number, delta?: number) => {
    const previous = row.branchProduct.inventory ?? 0;
    const next = delta === undefined ? value : previous + delta;
    if (!Number.isSafeInteger(next) || next < 0 || update.isPending) return;
    try {
      await update.mutateAsync({
        data: {
          branchProductId: row.branchProduct.id,
          branchId: row.branch.id,
          productId: row.product.id,
          quantity: delta === undefined ? next : undefined,
          delta,
          reason: "Ajuste desde panel de inventario",
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListAdminInventoryQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetInventoryMatrixQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListAdminProductsQueryKey() }),
      ]);
      toast({
        title: `${row.product.name} · ${row.branch.name}`,
        description: `${previous} → ${next}`,
      });
    } catch {
      toast({ title: "No se pudo actualizar", variant: "destructive" });
    }
  };

  const matchingRows = new Set(((rows.data ?? []) as LooseInventoryRow[]).map(row => `${row.product.id}-${row.branch.id}`));
  const matrixRows = ((matrixQuery.data ?? []) as unknown as LooseInventoryRow[])
    .filter(row => matchingRows.has(`${row.product.id}-${row.branch.id}`));
  const listRows = (rows.data as LooseInventoryRow[] | undefined) ?? [];
  const attentionRows = (attention.data as LooseInventoryRow[] | undefined) ?? listRows;
  const attentionCounts = useMemo(() => {
    const counts = { low: 0, critical: 0, out: 0 };
    for (const row of attentionRows) {
      const status = rowStatus(row);
      if (status === "LOW_STOCK") counts.low += 1;
      if (status === "CRITICAL_STOCK") counts.critical += 1;
      if (status === "OUT_OF_STOCK") counts.out += 1;
    }
    return counts;
  }, [attentionRows]);

  const matrixFailed = matrixQuery.isError || rows.isError || matrixTimedOut;
  const retryMatrix = () => {
    setMatrixTimedOut(false);
    void matrixQuery.refetch();
    void rows.refetch();
  };

  return (
    <AdminLayout>
      <AdminPageShell>
        <AdminPageHeader
          title="Productos e inventario"
          description="Existencias independientes por sucursal y producto."
          meta={
            <>
              <AttentionPill
                active={state === "LOW_STOCK"}
                label={`${attentionCounts.low} stock bajo`}
                tone="warning"
                onClick={() => setState((current) => (current === "LOW_STOCK" ? "all" : "LOW_STOCK"))}
              />
              <AttentionPill
                active={state === "CRITICAL_STOCK"}
                label={`${attentionCounts.critical} crítico`}
                tone="orange"
                onClick={() =>
                  setState((current) => (current === "CRITICAL_STOCK" ? "all" : "CRITICAL_STOCK"))
                }
              />
              <AttentionPill
                active={state === "OUT_OF_STOCK"}
                label={`${attentionCounts.out} agotado`}
                tone="danger"
                onClick={() =>
                  setState((current) => (current === "OUT_OF_STOCK" ? "all" : "OUT_OF_STOCK"))
                }
              />
            </>
          }
          actions={
            <>
              <Button asChild variant="outline" className="rounded-none">
                <Link href="/admin/importar">
                  <Upload className="mr-2 h-4 w-4" />
                  Importar stock
                </Link>
              </Button>
              <Button
                variant="outline"
                className="rounded-none"
                onClick={() => setMatrix((current) => !current)}
              >
                {matrix ? <List className="mr-2 h-4 w-4" /> : <Grid2X2 className="mr-2 h-4 w-4" />}
                {matrix ? "Vista lista" : "Vista matriz"}
              </Button>
            </>
          }
        />
        <ProductWorkspaceNav inventory />

        <div className="sticky top-0 z-10 -mx-6 border-b border-border bg-background/95 px-6 py-3 backdrop-blur md:-mx-10 md:px-10">
          <AdminFilterBar>
            <Input
              className="h-10 min-w-[12rem] flex-1 rounded-none"
              placeholder="Buscar producto o SKU"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <AdminFilterSelect
              value={branchId}
              onValueChange={setBranchId}
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
              value={state}
              onValueChange={setState}
              placeholder="Estado"
              options={[
                { value: "all", label: "Todos los estados" },
                { value: "NORMAL", label: "Normal" },
                { value: "LOW_STOCK", label: "Stock bajo" },
                { value: "CRITICAL_STOCK", label: "Crítico" },
                { value: "OUT_OF_STOCK", label: "Agotado" },
              ]}
            />
            <AdminFilterSelect
              value={categoryId}
              onValueChange={setCategoryId}
              placeholder="Categoría"
              options={[
                { value: "all", label: "Todas las categorías" },
                ...(categories.data?.map((category) => ({
                  value: String(category.id),
                  label: category.name,
                })) ?? []),
              ]}
            />
          </AdminFilterBar>
        </div>

        {matrix ? (
          <>
            {(matrixQuery.isLoading || rows.isLoading) && !matrixTimedOut ? <AdminLoading label="Cargando matriz…" /> : null}
            {matrixFailed ? (
              <AdminError
                title="No se pudo cargar la matriz"
                description={
                  matrixTimedOut
                    ? "La matriz tardó demasiado. Reintenta o vuelve a la vista lista."
                    : "Revisa la conexión e inténtalo de nuevo."
                }
                onRetry={retryMatrix}
              />
            ) : null}
            {!matrixQuery.isLoading && !matrixFailed ? (
              matrixRows.length ? (
                <InventoryMatrix data={matrixRows} onChange={change} pending={update.isPending} />
              ) : (
                <AdminEmptyState
                  icon={Boxes}
                  title="Sin datos de matriz"
                  description="No hay productos asignados a sucursales para mostrar."
                />
              )
            ) : null}
          </>
        ) : (
          <>
            {rows.isLoading ? <AdminLoading label="Cargando inventario…" /> : null}
            {rows.isError ? (
              <AdminError
                title="No se pudo cargar el inventario"
                onRetry={() => rows.refetch()}
              />
            ) : null}
            {!rows.isLoading && !rows.isError && listRows.length === 0 ? (
              <AdminEmptyState
                icon={Boxes}
                title="No hay registros para estos filtros"
                description="Prueba otro filtro o importa existencias desde un archivo."
                action={
                  <Button asChild className="rounded-none">
                    <Link href="/admin/importar">Importar stock</Link>
                  </Button>
                }
              />
            ) : null}
            {!rows.isLoading && !rows.isError && listRows.length > 0 ? (
              <AdminTable>
                <AdminTableHeader>
                  <AdminTableRow>
                    {["Producto", "SKU", "Sucursal", "Stock", "Reservado", "Disponible", "Mínimo", "Estado", "Alertas"].map(
                      (heading) => (
                        <AdminTableHead key={heading}>{heading}</AdminTableHead>
                      ),
                    )}
                  </AdminTableRow>
                </AdminTableHeader>
                <AdminTableBody>
                  {listRows.map((row) => {
                    const stock = row.branchProduct.inventory ?? 0;
                    const minStock = row.branchProduct.minStock ?? 0;
                    const reserved = row.reservedStock ?? 0;
                    const available = row.availableStock ?? Math.max(0, stock - reserved);
                    const status = rowStatus(row);
                    return (
                      <AdminTableRow key={`${row.product.id}-${row.branch.id}`}>
                        <AdminTableCell className="font-medium">
                          <Link href={`/admin/productos/${row.product.id}`} className="hover:underline" title="Editar producto">
                            {row.product.name}
                          </Link>
                        </AdminTableCell>
                        <AdminTableCell className="font-mono text-xs">{row.product.sku}</AdminTableCell>
                        <AdminTableCell>{row.branch.name}</AdminTableCell>
                        <AdminTableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              aria-label={`Disminuir stock de ${row.product.name} en ${row.branch.name}`}
                              size="icon"
                              variant="outline"
                              className="h-9 w-9 shrink-0 rounded-none"
                              disabled={stock === 0 || update.isPending}
                              onClick={() => change(row, 0, -1)}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <Input
                              key={`${row.product.id}-${row.branch.id}-${stock}`}
                              className="h-9 w-16 rounded-none text-center"
                              type="number"
                              min="0"
                              defaultValue={stock}
                              disabled={update.isPending}
                              aria-label={`Existencias de ${row.product.name} en ${row.branch.name}`}
                              onBlur={(event) => {
                                const next = Number(event.target.value);
                                if (!event.target.value.trim() || !Number.isSafeInteger(next) || next < 0) {
                                  event.target.value = String(stock);
                                  return;
                                }
                                if (next === stock) return;
                                void change(row, next);
                              }}
                            />
                            <Button
                              aria-label={`Aumentar stock de ${row.product.name} en ${row.branch.name}`}
                              size="icon"
                              variant="outline"
                              className="h-9 w-9 shrink-0 rounded-none"
                              disabled={update.isPending}
                              onClick={() => change(row, 0, 1)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </AdminTableCell>
                        <AdminTableCell>{reserved}</AdminTableCell>
                        <AdminTableCell>{available}</AdminTableCell>
                        <AdminTableCell>{minStock}</AdminTableCell>
                        <AdminTableCell>
                          <span
                            className={`inline-flex px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}
                          >
                            {statusLabel(status)}
                          </span>
                        </AdminTableCell>
                        <AdminTableCell>
                          <div className="flex items-center gap-2">
                            <span>{row.openAlertCount ?? 0}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="rounded-none"
                              onClick={() => setAlertTarget(row)}
                            >
                              Alerta
                            </Button>
                          </div>
                        </AdminTableCell>
                      </AdminTableRow>
                    );
                  })}
                </AdminTableBody>
              </AdminTable>
            ) : null}
          </>
        )}
      </AdminPageShell>

      {alertTarget ? (
        <GenerateInventoryAlertDialog
          open={Boolean(alertTarget)}
          onOpenChange={(open) => !open && setAlertTarget(null)}
          productId={alertTarget.product.id}
          branchId={alertTarget.branch.id}
          productLabel={`${alertTarget.product.name} · ${alertTarget.branch.name}`}
        />
      ) : null}
    </AdminLayout>
  );
}

function AttentionPill({
  active,
  label,
  tone,
  onClick,
}: {
  active: boolean;
  label: string;
  tone: "warning" | "orange" | "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? tone === "danger"
            ? "border-destructive bg-destructive text-destructive-foreground"
            : tone === "orange"
              ? "border-orange-700 bg-orange-700 text-white"
              : "border-amber-700 bg-amber-700 text-white"
          : tone === "danger"
            ? "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15"
            : tone === "orange"
              ? "border-orange-200 bg-orange-50 text-orange-900 hover:bg-orange-100"
              : "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100",
      )}
    >
      {label}
    </button>
  );
}

function InventoryMatrix({
  data,
  onChange,
  pending,
}: {
  data: LooseInventoryRow[];
  onChange: (row: LooseInventoryRow, value: number) => void;
  pending?: boolean;
}) {
  const branches = useMemo(() => {
    const byId = new Map<number, LooseInventoryRow["branch"]>();
    data.forEach((row) => {
      if (row.branch?.id) byId.set(row.branch.id, row.branch);
    });
    return Array.from(byId.values());
  }, [data]);
  const products = useMemo(() => {
    const byId = new Map<number, LooseInventoryRow["product"]>();
    data.forEach((row) => {
      if (row.product?.id) byId.set(row.product.id, row.product);
    });
    return Array.from(byId.values());
  }, [data]);

  return (
    <AdminTable>
      <AdminTableHeader>
        <AdminTableRow>
          <AdminTableHead className="sticky left-0 z-20 bg-muted">Producto</AdminTableHead>
          {branches.map((branch) => (
            <AdminTableHead key={branch.id}>{branch.name}</AdminTableHead>
          ))}
        </AdminTableRow>
      </AdminTableHeader>
      <AdminTableBody>
        {products.map((product) => (
          <AdminTableRow key={product.id}>
            <AdminTableCell className="sticky left-0 z-10 bg-background font-medium">
              {product.name}
            </AdminTableCell>
            {branches.map((branch) => {
              const row = data.find(
                (candidate) =>
                  candidate.product.id === product.id && candidate.branch.id === branch.id,
              );
              const stock = row?.branchProduct.inventory ?? 0;
              return (
                <AdminTableCell key={branch.id}>
                  {row ? (
                    <Input
                      key={`${product.id}-${branch.id}-${stock}`}
                      className="h-9 w-24 rounded-none"
                      type="number"
                      min="0"
                      defaultValue={stock}
                      disabled={pending}
                      onBlur={(event) => {
                        const next = Number(event.target.value);
                        if (!event.target.value.trim() || !Number.isSafeInteger(next) || next < 0) {
                                  event.target.value = String(stock);
                                  return;
                                }
                                if (next === stock) return;
                        onChange(row, next);
                      }}
                    />
                  ) : (
                    <span className="text-muted-foreground">No asignado</span>
                  )}
                </AdminTableCell>
              );
            })}
          </AdminTableRow>
        ))}
      </AdminTableBody>
    </AdminTable>
  );
}
