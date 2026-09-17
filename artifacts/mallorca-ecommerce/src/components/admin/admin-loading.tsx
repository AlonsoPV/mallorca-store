import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function AdminLoading({
  label = "Cargando…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[200px] flex-col items-center justify-center gap-3 text-muted-foreground",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-8 w-8 animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function AdminTableSkeleton({
  rows = 5,
  cols = 6,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("space-y-2 border border-border p-3", className)}
      aria-hidden
    >
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-2">
          {Array.from({ length: cols }).map((__, col) => (
            <div
              key={col}
              className="h-8 flex-1 animate-pulse bg-muted"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
