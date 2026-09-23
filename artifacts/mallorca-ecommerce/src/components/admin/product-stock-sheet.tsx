import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  useListAdminInventory,
  useUpdateAdminInventory,
  getListAdminInventoryQueryKey,
  getListAdminProductsQueryKey,
  getGetInventoryMatrixQueryKey,
  type AdminProduct,
  type InventoryRow,
} from "@workspace/api-client-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminLoading, AdminError } from "@/components/admin";
import { GenerateInventoryAlertDialog } from "@/components/generate-inventory-alert-dialog";
import { useToast } from "@/hooks/use-toast";

export function ProductStockSheet({
  product,
  branchId,
  onClose,
}: {
  product: AdminProduct;
  branchId: number;
  onClose: () => void;
}) {
  const [allBranches, setAllBranches] = useState(false);
  const [alert, setAlert] = useState<InventoryRow | null>(null);
  const rows = useListAdminInventory({
    search: product.sku,
    branchId: allBranches ? undefined : branchId,
  });
  const update = useUpdateAdminInventory();
  const client = useQueryClient();
  const { toast } = useToast();
  const entries = (rows.data ?? []).filter(
    (row) => row.product.id === product.id,
  );
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: getListAdminInventoryQueryKey() }),
      client.invalidateQueries({ queryKey: getListAdminProductsQueryKey() }),
      client.invalidateQueries({ queryKey: getGetInventoryMatrixQueryKey() }),
    ]);

  async function save(row: InventoryRow, quantity: number, reason: string) {
    try {
      await update.mutateAsync({
        data: {
          branchProductId:
            typeof row.branchProduct.id === "number"
              ? row.branchProduct.id
              : undefined,
          branchId: row.branch.id,
          productId: product.id,
          quantity,
          reason: reason.trim() || "Ajuste desde productos e inventario",
        },
      });
      await refresh();
      toast({
        title: "Existencias actualizadas",
        description: `${row.branch.name}: ${quantity} unidades`,
      });
      return true;
    } catch {
      toast({
        title: "No se pudo guardar el ajuste",
        description: "Tus cambios siguen disponibles para reintentar.",
        variant: "destructive",
      });
      return false;
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !update.isPending) onClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="pr-7 text-left">
          <SheetTitle>{product.name}</SheetTitle>
          <SheetDescription>
            SKU {product.sku} · Existencias por sucursal. Los cambios se aplican
            al guardar cada ajuste.
          </SheetDescription>
        </SheetHeader>
        <div className="my-5 flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={update.isPending}
            onClick={() => setAllBranches(!allBranches)}
          >
            {allBranches
              ? "Ver sucursal seleccionada"
              : "Ver todas las sucursales"}
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/admin/productos/${product.id}`}>Editar ficha</Link>
          </Button>
        </div>
        {rows.isLoading && <AdminLoading label="Cargando existencias…" />}
        {rows.isError && (
          <AdminError
            title="No se pudieron cargar las existencias"
            onRetry={() => rows.refetch()}
          />
        )}
        {!rows.isLoading && !rows.isError && entries.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Sin existencias asignadas. Abre la ficha del producto para
            configurar sus sucursales.
          </p>
        )}
        <div className="space-y-4">
          {entries.map((row) => (
            <StockAdjustment
              key={`${row.branch.id}-${row.branchProduct.inventory}`}
              row={row}
              pending={update.isPending}
              onSave={save}
              onAlert={() => setAlert(row)}
            />
          ))}
        </div>
        {alert && (
          <GenerateInventoryAlertDialog
            open
            onOpenChange={(open) => {
              if (!open) {
                setAlert(null);
                void refresh();
              }
            }}
            productId={product.id}
            branchId={alert.branch.id}
            productLabel={`${product.name} · ${alert.branch.name}`}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function StockAdjustment({
  row,
  pending,
  onSave,
  onAlert,
}: {
  row: InventoryRow;
  pending: boolean;
  onSave: (
    row: InventoryRow,
    quantity: number,
    reason: string,
  ) => Promise<boolean>;
  onAlert: () => void;
}) {
  const stock = Number(row.branchProduct.inventory ?? 0);
  const [quantity, setQuantity] = useState(String(stock));
  const [reason, setReason] = useState("");
  const next = Number(quantity);
  const valid =
    quantity.trim() !== "" && Number.isSafeInteger(next) && next >= 0;
  const status = row.inventoryStatus;
  const label =
    status === "OUT_OF_STOCK"
      ? "Agotado"
      : status === "CRITICAL_STOCK"
        ? "Crítico"
        : status === "LOW_STOCK"
          ? "Stock bajo"
          : "Normal";
  return (
    <form
      className="space-y-4 border border-border p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (
          valid &&
          next !== stock &&
          !pending &&
          (await onSave(row, next, reason))
        )
          setReason("");
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{row.branch.name}</h3>
        <span
          className={`px-2 py-1 text-xs font-medium ${label === "Normal" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
        >
          {label}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-2 bg-muted/50 p-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Reservado</dt>
          <dd className="font-semibold">{row.reservedStock ?? 0}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Disponible</dt>
          <dd className="font-semibold">
            {row.availableStock ??
              Math.max(0, stock - (row.reservedStock ?? 0))}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Mínimo</dt>
          <dd className="font-semibold">
            {Number(row.branchProduct.minStock ?? 0)}
          </dd>
        </div>
      </dl>
      <label className="block space-y-1 text-sm">
        <span>Existencias físicas</span>
        <Input
          type="number"
          min="0"
          step="1"
          value={quantity}
          disabled={pending}
          onChange={(event) => setQuantity(event.target.value)}
          aria-invalid={!valid}
        />
      </label>
      {!valid && (
        <p role="alert" className="text-sm text-destructive">
          Introduce una cantidad entera igual o mayor que cero.
        </p>
      )}
      {valid && next !== stock && (
        <p className="text-sm text-muted-foreground">
          {stock} → {next} unidades ({next > stock ? "+" : ""}
          {next - stock})
        </p>
      )}
      <label className="block space-y-1 text-sm">
        <span>Motivo del ajuste (opcional)</span>
        <Input
          value={reason}
          disabled={pending}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Ej. Recepción de mercancía"
        />
      </label>
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={onAlert}
        >
          Crear alerta · {row.openAlertCount ?? 0} abiertas
        </Button>
        <Button disabled={pending || !valid || next === stock}>
          {pending ? "Guardando…" : "Guardar ajuste"}
        </Button>
      </div>
    </form>
  );
}
