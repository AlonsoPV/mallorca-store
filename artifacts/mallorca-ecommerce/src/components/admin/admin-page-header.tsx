import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function AdminPageHeader({
  title,
  description,
  meta,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("@container", className)}>
      <div className="flex flex-col gap-3 sm:gap-4 @3xl:flex-row @3xl:items-start @3xl:justify-between @3xl:gap-8">
        <div className="min-w-0 @3xl:flex-1">
          <h1 className="text-balance font-serif text-2xl leading-tight tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 hidden max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:block">
              {description}
            </p>
          ) : null}
          {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="flex w-full flex-wrap items-center gap-2 @3xl:w-auto @3xl:shrink-0 @3xl:justify-end @3xl:pt-1">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
