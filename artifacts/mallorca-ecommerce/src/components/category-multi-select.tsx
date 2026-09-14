import { useMemo, useState } from "react";
import { X, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

type CategoryOption = { id: number; name: string; slug?: string };

type Props = {
  categories: CategoryOption[];
  selectedIds: number[];
  primaryId?: number | null;
  onChange: (ids: number[], primaryId: number | null) => void;
  onCreate?: (name: string) => Promise<CategoryOption | null> | CategoryOption | null;
  required?: boolean;
};

export function CategoryMultiSelect({
  categories,
  selectedIds,
  primaryId,
  onChange,
  onCreate,
  required,
}: Props) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((category) => category.name.toLowerCase().includes(q));
  }, [categories, query]);

  const selected = categories.filter((category) => selectedIds.includes(category.id));

  function toggle(id: number) {
    if (selectedIds.includes(id)) {
      const next = selectedIds.filter((item) => item !== id);
      const nextPrimary =
        primaryId === id ? (next[0] ?? null) : primaryId && next.includes(primaryId) ? primaryId : next[0] ?? null;
      onChange(next, nextPrimary);
      return;
    }
    const next = [...selectedIds, id];
    onChange(next, primaryId && next.includes(primaryId) ? primaryId : next[0] ?? null);
  }

  async function handleCreate() {
    if (!onCreate || !query.trim()) return;
    setCreating(true);
    try {
      const created = await onCreate(query.trim());
      if (created) {
        const next = selectedIds.includes(created.id) ? selectedIds : [...selectedIds, created.id];
        onChange(next, primaryId ?? created.id);
        setQuery("");
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label>
          Categorías{required ? " *" : ""}
        </Label>
        {selected.length > 0 && (
          <select
            className="h-8 rounded-md border px-2 text-sm"
            value={primaryId ?? ""}
            onChange={(event) =>
              onChange(selectedIds, event.target.value ? Number(event.target.value) : null)
            }
          >
            <option value="">Categoría principal</option>
            {selected.map((category) => (
              <option key={category.id} value={category.id}>
                Principal: {category.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {selected.map((category) => (
          <Badge key={category.id} variant="secondary" className="gap-1 pr-1">
            {category.name}
            {primaryId === category.id ? " · principal" : ""}
            <button
              type="button"
              className="rounded-sm p-0.5 hover:bg-muted"
              onClick={() => toggle(category.id)}
              aria-label={`Quitar ${category.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Buscar categoría..."
      />
      <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
        {filtered.map((category) => (
          <label key={category.id} className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              checked={selectedIds.includes(category.id)}
              onCheckedChange={() => toggle(category.id)}
            />
            <span>{category.name}</span>
          </label>
        ))}
        {!filtered.length && (
          <p className="text-sm text-muted-foreground">Sin coincidencias</p>
        )}
      </div>
      {onCreate && query.trim() && (
        <Button type="button" variant="outline" size="sm" disabled={creating} onClick={handleCreate}>
          <Plus className="mr-1 h-4 w-4" />
          Crear categoría “{query.trim()}”
        </Button>
      )}
    </div>
  );
}
