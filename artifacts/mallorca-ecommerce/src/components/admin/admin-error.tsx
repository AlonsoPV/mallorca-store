import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AdminError({
  title = "No se pudo cargar",
  description = "Revisa la conexión e inténtalo de nuevo.",
  onRetry,
  action,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-[200px] flex-col items-center justify-center gap-3 border border-dashed border-border px-4 py-10 text-center",
        className,
      )}
      role="alert"
    >
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <div className="space-y-1">
        <p className="font-medium text-foreground">{title}</p>
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      </div>
      {onRetry ? (
        <Button type="button" variant="outline" className="rounded-none" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
      {action}
    </div>
  );
}
