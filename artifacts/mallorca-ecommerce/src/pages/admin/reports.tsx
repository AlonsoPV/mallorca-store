import { useMemo, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Download,
  Package,
  ShoppingCart,
} from "lucide-react";
import { useGetBranchReport, type BranchReport } from "@workspace/api-client-react";
import {
  AdminEmptyState,
  AdminError,
  AdminFilterBar,
  AdminLoading,
  AdminPageHeader,
  AdminPageShell,
  AdminTable,
  AdminTableBody,
  AdminTableCell,
  AdminTableHead,
  AdminTableHeader,
  AdminTableRow,
} from "@/components/admin";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readSearchParam, withSearchParams } from "@/lib/admin-search-params";
import { formatPriceMx } from "@/lib/order-status";
import { cn } from "@/lib/utils";

type PeriodPreset = "today" | "7d" | "30d" | "month" | "custom";
type SortKey = "revenue" | "orders" | "alerts" | "name";

function mexicoDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addDaysIso(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T12:00:00-06:00`);
  d.setDate(d.getDate() + days);
  return mexicoDateString(d);
}

function startOfMonthIso() {
  const today = mexicoDateString();
  return `${today.slice(0, 8)}01`;
}

function resolvePresetRange(preset: PeriodPreset): { from: string; to: string } {
  const today = mexicoDateString();
  if (preset === "today") return { from: today, to: today };
  if (preset === "7d") return { from: addDaysIso(today, -6), to: today };
  if (preset === "30d") return { from: addDaysIso(today, -29), to: today };
  if (preset === "month") return { from: startOfMonthIso(), to: today };
  return { from: addDaysIso(today, -29), to: today };
}

function parsePeriod(search: string): PeriodPreset {
  const value = readSearchParam(search, "period");
  if (value === "today" || value === "7d" || value === "30d" || value === "month" || value === "custom") {
    return value;
  }
  return "30d";
}

function parseSort(search: string): SortKey {
  const value = readSearchParam(search, "sort");
  if (value === "revenue" || value === "orders" || value === "alerts" || value === "name") {
    return value;
  }
  return "revenue";
}

function money(value: string | number) {
  const n = typeof value === "number" ? value : Number(value);
  return formatPriceMx(Number.isFinite(n) ? n : 0);
}

function alertScore(row: BranchReport) {
  return row.outOfStockCount * 2 + row.lowStockCount;
}

function downloadCsv(rows: BranchReport[], from: string, to: string) {
  const header = [
    "Sucursal",
    "Pedidos",
    "Ingresos",
    "Unidades inventario",
    "Valor inventario",
    "Stock bajo",
    "Agotados",
  ];
  const lines = rows.map((r) =>
    [
      `"${r.branchName.replace(/"/g, '""')}"`,
      r.orderCount,
      r.revenue,
      r.inventoryCount,
      r.inventoryValue,
      r.lowStockCount,
      r.outOfStockCount,
    ].join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reportes-sucursales_${from || "inicio"}_${to || "hoy"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminReports() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const period = parsePeriod(search);
  const sort = parseSort(search);

  const presetRange = resolvePresetRange(period === "custom" ? "30d" : period);
  const from =
    period === "custom"
      ? readSearchParam(search, "from") || presetRange.from
      : presetRange.from;
  const to =
    period === "custom"
      ? readSearchParam(search, "to") || presetRange.to
      : presetRange.to;

  // API uses exclusive upper bound → send next day for inclusive "hasta"
  const apiTo = addDaysIso(to, 1);

  const patch = (next: Record<string, string | null | undefined>) => {
    setLocation(withSearchParams("/admin/reportes", search, next), { replace: true });
  };

  const setPeriod = (next: PeriodPreset) => {
    if (next === "custom") {
      patch({ period: "custom", from, to, sort });
      return;
    }
    patch({ period: next, from: null, to: null, sort });
  };

  const q = useGetBranchReport({ from, to: apiTo });

  const sorted = useMemo(() => {
    const rows = [...(q.data ?? [])];
    rows.sort((a, b) => {
      if (sort === "name") return a.branchName.localeCompare(b.branchName, "es");
      if (sort === "orders") return b.orderCount - a.orderCount;
      if (sort === "alerts") return alertScore(b) - alertScore(a);
      return Number(b.revenue) - Number(a.revenue);
    });
    return rows;
  }, [q.data, sort]);

  const totals = useMemo(() => {
    const rows = q.data ?? [];
    return {
      branches: rows.length,
      orders: rows.reduce((sum, r) => sum + r.orderCount, 0),
      revenue: rows.reduce((sum, r) => sum + Number(r.revenue || 0), 0),
      lowStock: rows.reduce((sum, r) => sum + r.lowStockCount, 0),
      outOfStock: rows.reduce((sum, r) => sum + r.outOfStockCount, 0),
      inventoryValue: rows.reduce((sum, r) => sum + Number(r.inventoryValue || 0), 0),
    };
  }, [q.data]);

  const topBranch = sorted[0];
  const attention = sorted.filter((r) => alertScore(r) > 0).slice(0, 3);

  const periodLabel =
    period === "today"
      ? "Hoy"
      : period === "7d"
        ? "Últimos 7 días"
        : period === "30d"
          ? "Últimos 30 días"
          : period === "month"
            ? "Este mes"
            : `${from} → ${to}`;

  return (
    <AdminLayout>
      <AdminPageShell>
        <AdminPageHeader
          title="Reportes"
          description="Comparativo operativo por sucursal: ventas, pedidos e inventario."
          actions={
            <Button
              variant="outline"
              className="rounded-none"
              disabled={!sorted.length}
              onClick={() => downloadCsv(sorted, from, to)}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
          }
        />

        <div className="sticky top-0 z-10 -mx-6 space-y-3 border-b border-border bg-background/95 px-6 py-3 backdrop-blur md:-mx-10 md:px-10">
          <AdminFilterBar>
            {(
              [
                { id: "today", label: "Hoy" },
                { id: "7d", label: "7 días" },
                { id: "30d", label: "30 días" },
                { id: "month", label: "Este mes" },
                { id: "custom", label: "Personalizado" },
              ] as { id: PeriodPreset; label: string }[]
            ).map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setPeriod(chip.id)}
                className={cn(
                  "border px-3 py-1.5 text-sm transition-colors",
                  period === chip.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:bg-muted",
                )}
              >
                {chip.label}
              </button>
            ))}
          </AdminFilterBar>

          {period === "custom" ? (
            <AdminFilterBar className="items-end">
              <label className="text-xs text-muted-foreground">
                Desde
                <Input
                  type="date"
                  className="mt-1 h-9 w-40 rounded-none"
                  value={from}
                  onChange={(e) => patch({ period: "custom", from: e.target.value, to, sort })}
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Hasta
                <Input
                  type="date"
                  className="mt-1 h-9 w-40 rounded-none"
                  value={to}
                  onChange={(e) => patch({ period: "custom", from, to: e.target.value, sort })}
                />
              </label>
            </AdminFilterBar>
          ) : (
            <p className="text-xs text-muted-foreground">Periodo: {periodLabel}</p>
          )}
        </div>

        {q.isLoading ? <AdminLoading label="Cargando reporte…" /> : null}
        {q.isError ? (
          <AdminError title="No se pudo cargar el reporte" onRetry={() => q.refetch()} />
        ) : null}

        {!q.isLoading && !q.isError ? (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi
                label="Ingresos"
                value={money(totals.revenue)}
                hint={periodLabel}
                icon={<ArrowUpRight className="h-4 w-4" />}
              />
              <Kpi
                label="Pedidos"
                value={totals.orders}
                hint={`${totals.branches} sucursales`}
                icon={<ShoppingCart className="h-4 w-4" />}
              />
              <Kpi
                label="Valor inventario"
                value={money(totals.inventoryValue)}
                hint="Stock actual"
                icon={<Package className="h-4 w-4" />}
              />
              <Kpi
                label="Alertas stock"
                value={totals.lowStock + totals.outOfStock}
                hint={`${totals.outOfStock} agotados · ${totals.lowStock} bajos`}
                icon={<AlertTriangle className="h-4 w-4" />}
                tone={totals.outOfStock + totals.lowStock > 0 ? "warn" : "default"}
              />
            </div>

            {(topBranch || attention.length > 0) && (
              <div className="grid gap-3 lg:grid-cols-2">
                {topBranch ? (
                  <div className="border border-border bg-background px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Mejor desempeño
                    </p>
                    <p className="mt-1 font-medium">{topBranch.branchName}</p>
                    <p className="text-sm text-muted-foreground">
                      {money(topBranch.revenue)} · {topBranch.orderCount} pedidos
                    </p>
                    <Button variant="outline" size="sm" className="mt-3 h-8 rounded-none" asChild>
                      <Link href={`/admin/sucursales/${topBranch.branchId}`}>Ver sucursal</Link>
                    </Button>
                  </div>
                ) : null}
                <div className="border border-border bg-background px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Requiere atención
                  </p>
                  {attention.length === 0 ? (
                    <p className="mt-1 text-sm text-muted-foreground">Sin alertas de inventario en el corte.</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {attention.map((row) => (
                        <li key={row.branchId} className="flex items-center justify-between gap-2">
                          <span className="truncate">{row.branchName}</span>
                          <span className="shrink-0 text-xs text-amber-800">
                            {row.outOfStockCount} agot. · {row.lowStockCount} bajos
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button variant="outline" size="sm" className="mt-3 h-8 rounded-none" asChild>
                    <Link href="/admin/inventario">Ir a inventario</Link>
                  </Button>
                </div>
              </div>
            )}

            {sorted.length === 0 ? (
              <AdminEmptyState
                icon={BarChart3}
                title="Sin datos de reporte"
                description="No hay métricas para el periodo seleccionado."
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">Comparativo por sucursal</h2>
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        { id: "revenue", label: "Ingresos" },
                        { id: "orders", label: "Pedidos" },
                        { id: "alerts", label: "Alertas" },
                        { id: "name", label: "Nombre" },
                      ] as { id: SortKey; label: string }[]
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => patch({ sort: opt.id, period, from: period === "custom" ? from : null, to: period === "custom" ? to : null })}
                        className={cn(
                          "border px-2.5 py-1 text-xs",
                          sort === opt.id
                            ? "border-foreground bg-foreground text-background"
                            : "border-border hover:bg-muted",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <AdminTable>
                  <AdminTableHeader>
                    <AdminTableRow>
                      {[
                        "Sucursal",
                        "Pedidos",
                        "Ingresos",
                        "Ticket prom.",
                        "Inventario",
                        "Valor inv.",
                        "Stock bajo",
                        "Agotados",
                        "",
                      ].map((h) => (
                        <AdminTableHead key={h || "actions"}>{h}</AdminTableHead>
                      ))}
                    </AdminTableRow>
                  </AdminTableHeader>
                  <AdminTableBody>
                    {sorted.map((row) => {
                      const avg =
                        row.orderCount > 0 ? Number(row.revenue) / row.orderCount : 0;
                      const needsAttention = alertScore(row) > 0;
                      return (
                        <AdminTableRow
                          key={row.branchId}
                          className={cn(needsAttention && "bg-amber-50/40")}
                        >
                          <AdminTableCell className="font-medium">
                            <Link
                              href={`/admin/sucursales/${row.branchId}`}
                              className="hover:underline"
                            >
                              {row.branchName}
                            </Link>
                          </AdminTableCell>
                          <AdminTableCell className="tabular-nums">{row.orderCount}</AdminTableCell>
                          <AdminTableCell className="font-medium tabular-nums">
                            {money(row.revenue)}
                          </AdminTableCell>
                          <AdminTableCell className="tabular-nums text-muted-foreground">
                            {money(avg)}
                          </AdminTableCell>
                          <AdminTableCell className="tabular-nums">{row.inventoryCount}</AdminTableCell>
                          <AdminTableCell className="tabular-nums text-muted-foreground">
                            {money(row.inventoryValue)}
                          </AdminTableCell>
                          <AdminTableCell>
                            <span
                              className={cn(
                                "tabular-nums",
                                row.lowStockCount > 0 ? "font-medium text-amber-800" : "text-muted-foreground",
                              )}
                            >
                              {row.lowStockCount}
                            </span>
                          </AdminTableCell>
                          <AdminTableCell>
                            <span
                              className={cn(
                                "tabular-nums",
                                row.outOfStockCount > 0
                                  ? "font-medium text-destructive"
                                  : "text-muted-foreground",
                              )}
                            >
                              {row.outOfStockCount}
                            </span>
                          </AdminTableCell>
                          <AdminTableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" className="h-7 rounded-none px-2 text-xs" asChild>
                                <Link href={`/admin/pedidos?branchId=${row.branchId}&day=all`}>
                                  Pedidos
                                </Link>
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 rounded-none px-2 text-xs" asChild>
                                <Link href={`/admin/inventario?branchId=${row.branchId}`}>
                                  Stock
                                </Link>
                              </Button>
                            </div>
                          </AdminTableCell>
                        </AdminTableRow>
                      );
                    })}
                  </AdminTableBody>
                </AdminTable>

                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                  <ArrowDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Ingresos y pedidos excluyen cancelados. Inventario refleja el stock actual (no histórico del periodo).
                </p>
              </>
            )}
          </>
        ) : null}
      </AdminPageShell>
    </AdminLayout>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  tone?: "default" | "warn";
}) {
  return (
    <div
      className={cn(
        "border border-border px-4 py-3",
        tone === "warn" ? "border-amber-600/30 bg-amber-50/50" : "bg-background",
      )}
    >
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <p className="text-[11px] font-semibold uppercase tracking-wide">{label}</p>
        {icon}
      </div>
      <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
