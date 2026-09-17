import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AdminPageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex-1 space-y-6 overflow-auto p-6 md:p-10",
        className,
      )}
    >
      {children}
    </div>
  );
}
