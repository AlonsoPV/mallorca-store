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
        "min-w-0 flex-1 space-y-5 overflow-auto p-4 sm:space-y-6 sm:p-6 md:p-10",
        className,
      )}
    >
      {children}
    </div>
  );
}
