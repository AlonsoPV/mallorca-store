import type { ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function AdminFilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}

export type AdminFilterOption = {
  value: string;
  label: string;
};

/** Shadcn Select pre-styled for admin ops (rounded-none). */
export function AdminFilterSelect({
  value,
  onValueChange,
  placeholder,
  options,
  className,
  triggerClassName,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  options: AdminFilterOption[];
  className?: string;
  triggerClassName?: string;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={cn(
          "h-10 w-auto min-w-[10rem] rounded-none bg-background",
          triggerClassName,
        )}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={cn("rounded-none", className)}>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
