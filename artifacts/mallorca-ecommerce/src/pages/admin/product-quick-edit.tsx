import { useMemo, useState } from "react";
import {
  useUpdateProduct,
  useUpdateAdminInventory,
  type AdminProduct,
  type AdminBranch,
  type Category,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CategoryMultiSelect } from "@/components/category-multi-select";
import { TagInput } from "@/components/tag-input";

type Props = {
  product: AdminProduct;
  branches: AdminBranch[];
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
};

export function ProductQuickEdit({ product, branches, categories, onClose, onSaved }: Props) {
  const [name, setName] = useState(product.name);
  const [sku, setSku] = useState(product.sku);
  const [price, setPrice] = useState(String(product.price));
  const [status, setStatus] = useState(product.status);
  const initialCategories = useMemo(() => {
    const fromCard = (product as any).categories as
      | Array<{ id: number; isPrimary?: boolean; slug: string }>
      | undefined;
    if (fromCard?.length) {
      return {
        ids: fromCard.map((c) => c.id),
        primary: fromCard.find((c) => c.isPrimary)?.id ?? fromCard[0].id,
      };
    }
    const primary = categories.find((c) => c.slug === product.categorySlug)?.id ?? null;
    return { ids: primary ? [primary] : [], primary };
  }, [categories, product]);
  const [categoryIds, setCategoryIds] = useState<number[]>(initialCategories.ids);
  const [primaryCategoryId, setPrimaryCategoryId] = useState<number | null>(
    initialCategories.primary,
  );
  const [tagNames, setTagNames] = useState<string[]>(() => (product as any).tags ?? []);
  const [stocks, setStocks] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    for (const branch of branches) {
      const avail = product.availability?.find((a) => a.branchId === branch.id);
      initial[branch.id] = avail ? String(avail.inventory) : "";
    }
    return initial;
  });
  const updateProduct = useUpdateProduct();
  const updateInventory = useUpdateAdminInventory();
  const { toast } = useToast();

  const save = async () => {
    try {
      await updateProduct.mutateAsync({
        id: product.id,
        data: {
          name,
          sku,
          price: Number(price),
          status: status as any,
          categoryId: primaryCategoryId ?? undefined,
          categoryIds: categoryIds.length ? categoryIds : undefined,
          primaryCategoryId: primaryCategoryId ?? undefined,
          tags: tagNames,
        } as any,
      });

      for (const branch of branches) {
        const avail = product.availability?.find((a) => a.branchId === branch.id);
        const next = stocks[branch.id];
        if (!avail || next === "" || next == null) continue;
        const quantity = Number(next);
        if (!Number.isFinite(quantity) || quantity === avail.inventory) continue;
        await updateInventory.mutateAsync({
          data: {
            branchId: branch.id,
            productId: product.id,
            quantity,
            reason: "Edición rápida desde listado",
          },
        });
      }

      toast({ title: "Cambios guardados" });
      onSaved();
    } catch {
      toast({ title: "No se pudo guardar", variant: "destructive" });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="w-full max-w-md h-full bg-background border-l border-border p-6 overflow-y-auto space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-serif">Edición rápida</h2>
          <Button variant="ghost" onClick={onClose} className="rounded-none">
            Cerrar
          </Button>
        </div>

        <label className="block text-sm space-y-1">
          <span>Nombre</span>
          <Input className="rounded-none" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-sm space-y-1">
          <span>SKU</span>
          <Input className="rounded-none" value={sku} onChange={(e) => setSku(e.target.value)} />
        </label>
        <label className="block text-sm space-y-1">
          <span>Precio</span>
          <Input
            type="number"
            className="rounded-none"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>

        <CategoryMultiSelect
          categories={categories}
          selectedIds={categoryIds}
          primaryId={primaryCategoryId}
          onChange={(ids, primary) => {
            setCategoryIds(ids);
            setPrimaryCategoryId(primary);
          }}
        />

        <TagInput value={tagNames} onChange={setTagNames} />

        <label className="block text-sm space-y-1">
          <span>Estado</span>
          <select
            className="flex h-10 w-full border border-border bg-background px-3 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
          >
            <option value="active">Activo</option>
            <option value="draft">Borrador</option>
            <option value="inactive">Inactivo</option>
          </select>
        </label>

        <div className="space-y-2 border-t border-border pt-4">
          <h3 className="font-medium text-sm">Stock por sucursal</h3>
          {branches.map((branch) => {
            const avail = product.availability?.find((a) => a.branchId === branch.id);
            const value = Number(stocks[branch.id] ?? avail?.inventory ?? 0);
            return (
              <div key={branch.id} className="flex items-center justify-between gap-3 text-sm">
                <span>{branch.shortName || branch.name}</span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 rounded-none px-0"
                    onClick={() =>
                      setStocks((prev) => ({
                        ...prev,
                        [branch.id]: String(Math.max(0, value - 1)),
                      }))
                    }
                  >
                    -
                  </Button>
                  <Input
                    type="number"
                    className="rounded-none w-20"
                    value={stocks[branch.id] ?? ""}
                    onChange={(e) =>
                      setStocks((prev) => ({ ...prev, [branch.id]: e.target.value }))
                    }
                    placeholder="—"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 rounded-none px-0"
                    onClick={() =>
                      setStocks((prev) => ({
                        ...prev,
                        [branch.id]: String(value + 1),
                      }))
                    }
                  >
                    +
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 pt-4">
          <Button variant="outline" className="rounded-none flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button className="rounded-none flex-1" onClick={() => void save()}>
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}
