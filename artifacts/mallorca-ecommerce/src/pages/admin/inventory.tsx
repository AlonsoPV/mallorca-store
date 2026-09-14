import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
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
import { Grid2X2, List, Minus, Plus } from "lucide-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { GenerateInventoryAlertDialog } from "@/components/generate-inventory-alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useSearch } from "wouter";

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

function stateFromSearch(search: string) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("state") || "";
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
  const search = useSearch();
  const [searchText, setSearchText] = useState("");
  const [branchId, setBranchId] = useState("");
  const [state, setState] = useState(() => stateFromSearch(search));
  const [categoryId, setCategoryId] = useState("");
  const [matrix, setMatrix] = useState(false);
  const [alertTarget, setAlertTarget] = useState<LooseInventoryRow | null>(null);

  const params: ListAdminInventoryParams = {
    search: searchText || undefined,
    branchId: branchId ? Number(branchId) : undefined,
    state: (state || undefined) as ListAdminInventoryParams["state"],
    categoryId: categoryId ? Number(categoryId) : undefined,
  };
  const rows = useListAdminInventory(params);
  const matrixQuery = useGetInventoryMatrix({
    query: {
      enabled: matrix,
      queryKey: getGetInventoryMatrixQueryKey(),
    },
  });
  const branches = useListAdminBranches();
  const categories = useListCategories();
  const update = useUpdateAdminInventory();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const change = async (row: LooseInventoryRow, value: number, delta?: number) => {
    try {
      await update.mutateAsync({
        data: {
          branchProductId: row.branchProduct.id,
          branchId: row.branch.id,
          productId: row.product.id,
          quantity: delta === undefined ? Math.max(0, value) : undefined,
          delta,
          reason: "Ajuste desde panel de inventario",
        },
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListAdminInventoryQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetInventoryMatrixQueryKey() }),
      ]);
      toast({ title: "Inventario actualizado" });
    } catch {
      toast({ title: "No se pudo actualizar", variant: "destructive" });
    }
  };

  const matrixRows = (matrixQuery.data ?? []) as unknown as LooseInventoryRow[];

  return (
    <AdminLayout>
      <div className="space-y-6 overflow-auto p-6 md:p-10">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Inventario</h1>
            <p className="text-muted-foreground">Existencias independientes por sucursal y producto.</p>
          </div>
          <Button variant="outline" onClick={() => setMatrix((current) => !current)}>
            {matrix ? <List className="mr-2 h-4 w-4" /> : <Grid2X2 className="mr-2 h-4 w-4" />}
            {matrix ? "Vista lista" : "Vista matriz"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-3">
          <Input className="w-64" placeholder="Buscar producto o SKU" value={searchText} onChange={(event) => setSearchText(event.target.value)} />
          <FilterSelect value={branchId} onChange={setBranchId}>
            <option value="">Todas las sucursales</option>
            {branches.data?.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </FilterSelect>
          <FilterSelect value={state} onChange={setState}>
            <option value="">Todos los estados</option>
            <option value="NORMAL">Normal</option>
            <option value="LOW_STOCK">Stock bajo</option>
            <option value="CRITICAL_STOCK">Crítico</option>
            <option value="OUT_OF_STOCK">Agotado</option>
          </FilterSelect>
          <FilterSelect value={categoryId} onChange={setCategoryId}>
            <option value="">Todas las categorías</option>
            {categories.data?.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </FilterSelect>
        </div>

        {matrix ? (
          <InventoryMatrix data={matrixRows} onChange={change} />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {["Producto", "SKU", "Sucursal", "Stock", "Reservado", "Disponible", "Mínimo", "Estado", "Alertas", "Acciones"].map((heading) => (
                    <th className="p-3 text-left" key={heading}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(rows.data as LooseInventoryRow[] | undefined)?.map((row) => {
                  const stock = row.branchProduct.inventory ?? 0;
                  const minStock = row.branchProduct.minStock ?? 0;
                  const reserved = row.reservedStock ?? 0;
                  const available = row.availableStock ?? Math.max(0, stock - reserved);
                  const status = row.inventoryStatus ?? row.branchProduct.alertState;
                  return (
                    <tr className="border-t" key={`${row.product.id}-${row.branch.id}`}>
                      <td className="p-3 font-medium">{row.product.name}</td>
                      <td className="p-3 font-mono text-xs">{row.product.sku}</td>
                      <td className="p-3">{row.branch.name}</td>
                      <td className="p-3">
                        <Input className="w-20" type="number" min="0" defaultValue={stock} onBlur={(event) => change(row, Number(event.target.value))} />
                      </td>
                      <td className="p-3">{reserved}</td>
                      <td className="p-3">{available}</td>
                      <td className="p-3">{minStock}</td>
                      <td className="p-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}>
                          {statusLabel(status)}
                        </span>
                      </td>
                      <td className="p-3">{row.openAlertCount ?? 0}</td>
                      <td className="p-3">
                        <Button aria-label="Disminuir stock" size="icon" variant="outline" disabled={stock === 0 || update.isPending} onClick={() => change(row, 0, -1)}>
                          <Minus className="h-4 w-4" />
                        </Button>
                        <Button aria-label="Aumentar stock" size="icon" variant="outline" className="ml-2" disabled={update.isPending} onClick={() => change(row, 0, 1)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="ml-2" onClick={() => setAlertTarget(row)}>
                          Alerta
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!rows.isLoading && !rows.data?.length && <p className="p-8 text-center text-muted-foreground">No hay registros para estos filtros.</p>}
          </div>
        )}
      </div>

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

function FilterSelect({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <select className="h-10 rounded-md border bg-background px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>
      {children}
    </select>
  );
}

function InventoryMatrix({ data, onChange }: { data: LooseInventoryRow[]; onChange: (row: LooseInventoryRow, value: number) => void }) {
  const branches = useMemo(() => {
    const byId = new Map<number, LooseInventoryRow["branch"]>();
    data.forEach((row) => { if (row.branch?.id) byId.set(row.branch.id, row.branch); });
    return Array.from(byId.values());
  }, [data]);
  const products = useMemo(() => {
    const byId = new Map<number, LooseInventoryRow["product"]>();
    data.forEach((row) => { if (row.product?.id) byId.set(row.product.id, row.product); });
    return Array.from(byId.values());
  }, [data]);

  return (
    <div className="overflow-auto rounded-lg border bg-card">
      <table className="min-w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="sticky left-0 bg-muted p-3 text-left">Producto</th>
            {branches.map((branch) => <th className="p-3 text-left" key={branch.id}>{branch.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr className="border-t" key={product.id}>
              <td className="sticky left-0 bg-card p-3 font-medium">{product.name}</td>
              {branches.map((branch) => {
                const row = data.find((candidate) => candidate.product.id === product.id && candidate.branch.id === branch.id);
                return (
                  <td className="p-2" key={branch.id}>
                    {row ? (
                      <Input className="w-24" type="number" min="0" defaultValue={row.branchProduct.inventory ?? 0} onBlur={(event) => onChange(row, Number(event.target.value))} />
                    ) : <span className="text-muted-foreground">No asignado</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
