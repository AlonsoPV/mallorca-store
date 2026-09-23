import { Link, useSearch } from "wouter";
import { Boxes, Package } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProductWorkspaceNav({ inventory = false }: { inventory?: boolean }) {
  const search = useSearch();
  const source = new URLSearchParams(search);
  function href(toInventory: boolean) {
    if (toInventory === inventory) {
      return `/admin/productos${source.size ? `?${source}` : ""}`;
    }
    const params = new URLSearchParams();
    for (const key of ["branchId", "categoryId"]) {
      const value = source.get(key);
      if (value) params.set(key, value);
    }
    const query = source.get("q") || source.get("search");
    if (query) params.set(toInventory ? "search" : "q", query);
    const state = source.get("state");
    const view = source.get("view");
    if (toInventory) {
      params.set("tab", "inventario");
      if (view === "low") params.set("state", "LOW_STOCK");
      if (view === "out") params.set("state", "OUT_OF_STOCK");
    } else {
      if (state === "LOW_STOCK") params.set("view", "low");
      if (state === "OUT_OF_STOCK") params.set("view", "out");
    }
    return `/admin/productos${params.size ? `?${params}` : ""}`;
  }
  return (
    <nav
      aria-label="Vistas de productos e inventario"
      className="flex gap-2 border-b border-border pb-3"
    >
      {(
        [
          { label: "Catálogo", inventory: false, icon: Package },
          { label: "Inventario", inventory: true, icon: Boxes },
        ] as const
      ).map((item) => (
        <Link
          key={item.label}
          href={href(item.inventory)}
          aria-current={inventory === item.inventory ? "page" : undefined}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium sm:flex-none sm:px-4",
            inventory === item.inventory
              ? "bg-primary text-primary-foreground"
              : "bg-muted hover:bg-muted/70",
          )}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
