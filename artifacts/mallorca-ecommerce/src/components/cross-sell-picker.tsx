import { useMemo, useState } from "react";
import { GripVertical, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type CrossSellOption = {
  id: number;
  name: string;
  sku: string;
};

type Props = {
  products: CrossSellOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  excludeId?: number | null;
  max?: number;
};

export function CrossSellPicker({
  products,
  selectedIds,
  onChange,
  excludeId,
  max = 6,
}: Props) {
  const [query, setQuery] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const selected = selectedIds
    .map((id) => products.find((product) => product.id === id))
    .filter((product): product is CrossSellOption => !!product);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((product) => product.id !== excludeId)
      .filter((product) => !selectedIds.includes(product.id))
      .filter(
        (product) =>
          !q ||
          product.name.toLowerCase().includes(q) ||
          product.sku.toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [excludeId, products, query, selectedIds]);

  function add(id: number) {
    if (selectedIds.includes(id) || selectedIds.length >= max) return;
    onChange([...selectedIds, id]);
    setQuery("");
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= selectedIds.length) return;
    const next = [...selectedIds];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <Label>Productos recomendados (cross-sell)</Label>
      <p className="text-xs text-muted-foreground">Máximo {max}. Arrastra para ordenar.</p>
      <div className="space-y-2">
        {selected.map((product, index) => (
          <div
            key={product.id}
            className="flex items-center gap-2 rounded-md border px-2 py-1.5"
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragIndex == null) return;
              move(dragIndex, index);
              setDragIndex(null);
            }}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{product.name}</div>
              <div className="text-xs text-muted-foreground">{product.sku}</div>
            </div>
            <button
              type="button"
              onClick={() => onChange(selectedIds.filter((id) => id !== product.id))}
              aria-label={`Quitar ${product.name}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        {!selected.length && (
          <p className="text-sm text-muted-foreground">Sin recomendaciones aún.</p>
        )}
      </div>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar productos por nombre o SKU..."
        disabled={selectedIds.length >= max}
      />
      <div className="flex flex-wrap gap-2">
        {results.map((product) => (
          <button key={product.id} type="button" onClick={() => add(product.id)}>
            <Badge variant="outline" className="cursor-pointer hover:bg-muted">
              {product.name} · {product.sku}
            </Badge>
          </button>
        ))}
      </div>
    </div>
  );
}
