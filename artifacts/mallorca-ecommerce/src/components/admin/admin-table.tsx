import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function AdminTable({
  className,
  containerClassName,
  children,
  ...props
}: React.ComponentProps<typeof Table> & { containerClassName?: string }) {
  return (
    <div
      className={cn(
        "overflow-x-auto border border-border bg-background",
        containerClassName,
      )}
    >
      <Table className={cn("min-w-full", className)} {...props}>
        {children}
      </Table>
    </div>
  );
}

export function AdminTableHeader({
  className,
  ...props
}: React.ComponentProps<typeof TableHeader>) {
  return (
    <TableHeader
      className={cn(
        "sticky top-0 z-10 bg-muted/80 backdrop-blur supports-[backdrop-filter]:bg-muted/60 [&_tr]:border-b",
        className,
      )}
      {...props}
    />
  );
}

export function AdminTableBody(props: React.ComponentProps<typeof TableBody>) {
  return <TableBody {...props} />;
}

export function AdminTableRow({
  className,
  ...props
}: React.ComponentProps<typeof TableRow>) {
  return (
    <TableRow
      className={cn("h-[52px] border-b border-border", className)}
      {...props}
    />
  );
}

export function AdminTableHead({
  className,
  ...props
}: React.ComponentProps<typeof TableHead>) {
  return (
    <TableHead
      className={cn(
        "h-[52px] px-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function AdminTableCell({
  className,
  ...props
}: React.ComponentProps<typeof TableCell>) {
  return <TableCell className={cn("px-3 py-2 align-middle", className)} {...props} />;
}
