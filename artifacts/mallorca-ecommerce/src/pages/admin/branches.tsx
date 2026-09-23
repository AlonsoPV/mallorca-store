import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminBranches,
  useDeactivateAdminBranch,
  useArchiveAdminBranch,
  useDuplicateAdminBranch,
  useDeleteAdminBranch,
  getListAdminBranchesQueryKey,
  type AdminBranch,
} from "@workspace/api-client-react";
import {
  AdminEmptyState,
  AdminError,
  AdminFilterBar,
  AdminLoading,
  AdminPageHeader,
  AdminPageShell,
} from "@/components/admin";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { branchFulfillmentLabel } from "@/lib/availability-copy";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  Archive,
  Copy,
  MapPin,
  MoreHorizontal,
  Phone,
  Plus,
  Power,
  Search,
  Store,
  User,
} from "lucide-react";

type StatusChip = "all" | "active" | "inactive" | "archived";

const STATUS_LABEL: Record<string, string> = {
  active: "Activa",
  inactive: "Inactiva",
  archived: "Archivada",
};

const STATUS_CHIPS: { id: StatusChip; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "active", label: "Activas" },
  { id: "inactive", label: "Inactivas" },
  { id: "archived", label: "Archivadas" },
];

function statusOf(b: AdminBranch) {
  return (b.status as string) || (b.active ? "active" : "inactive");
}

function branchLocationLine(branch: AdminBranch) {
  const parts = [branch.neighborhood, branch.city].filter(Boolean);
  if (parts.length) return parts.join(" · ");
  return branch.address || "Sin ubicación";
}

function branchStreetLine(branch: AdminBranch) {
  const line = [branch.street, branch.externalNumber].filter(Boolean).join(" ");
  return line || null;
}

function responsibleName(branch: AdminBranch) {
  return (
    (branch.primaryResponsible as { name?: string } | null | undefined)?.name ||
    branch.managerName ||
    null
  );
}

export default function AdminBranches() {
  const query = useListAdminBranches();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const deactivate = useDeactivateAdminBranch();
  const archive = useArchiveAdminBranch();
  const duplicate = useDuplicateAdminBranch();
  const remove = useDeleteAdminBranch();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusChip>("all");
  const [dupOpen, setDupOpen] = useState<AdminBranch | null>(null);
  const [dupForm, setDupForm] = useState({
    name: "",
    branchCode: "",
    copyHours: true,
    copyPickupDelivery: true,
    copyNotifications: true,
    copyProductAssignments: false,
    copyTeamStructure: false,
  });

  const branches = useMemo(() => query.data ?? [], [query.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return branches.filter((branch) => {
      const status = statusOf(branch);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        branch.name,
        branch.shortName,
        branch.branchCode,
        branch.neighborhood,
        branch.city,
        branch.address,
        responsibleName(branch),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [branches, search, statusFilter]);

  const summary = useMemo(() => {
    const active = branches.filter((b) => statusOf(b) === "active").length;
    const withAlerts = branches.filter((b) => (b.alertsOpen ?? 0) > 0).length;
    const ordersToday = branches.reduce((sum, b) => sum + (b.ordersToday ?? 0), 0);
    const alertsOpen = branches.reduce((sum, b) => sum + (b.alertsOpen ?? 0), 0);
    return { active, withAlerts, ordersToday, alertsOpen, total: branches.length };
  }, [branches]);

  async function invalidate() {
    await qc.invalidateQueries({ queryKey: getListAdminBranchesQueryKey() });
  }

  async function onDeactivate(branch: AdminBranch) {
    try {
      await deactivate.mutateAsync({ id: branch.id, data: { confirmFutureOrders: true } });
      toast({ title: "Sucursal desactivada" });
      await invalidate();
    } catch (err: any) {
      const msg = err?.payload?.error || err?.message || "No se pudo desactivar";
      const ok = window.confirm(`${msg}\n\n¿Continuar de todos modos?`);
      if (!ok) return;
      try {
        await deactivate.mutateAsync({ id: branch.id, data: { confirmFutureOrders: true } });
        toast({ title: "Sucursal desactivada" });
        await invalidate();
      } catch {
        toast({ title: "Error al desactivar", variant: "destructive" });
      }
    }
  }

  async function onArchive(branch: AdminBranch) {
    if (!window.confirm(`¿Archivar ${branch.name}? Se ocultará del storefront.`)) return;
    try {
      await archive.mutateAsync({ id: branch.id });
      toast({ title: "Sucursal archivada" });
      await invalidate();
    } catch {
      toast({ title: "Error al archivar", variant: "destructive" });
    }
  }

  async function onDelete(branch: AdminBranch) {
    if (!window.confirm(`¿Eliminar ${branch.name}? Solo es posible sin historial operativo.`)) return;
    try {
      await remove.mutateAsync({ id: branch.id });
      toast({ title: "Sucursal eliminada" });
      await invalidate();
    } catch (err: any) {
      toast({
        title: err?.payload?.error || "No se puede eliminar. Usa Archivar.",
        variant: "destructive",
      });
    }
  }

  async function onDuplicate() {
    if (!dupOpen) return;
    try {
      const created = await duplicate.mutateAsync({
        id: dupOpen.id,
        data: {
          name: dupForm.name,
          branchCode: dupForm.branchCode.toUpperCase(),
          copyHours: dupForm.copyHours,
          copyPickupDelivery: dupForm.copyPickupDelivery,
          copyNotifications: dupForm.copyNotifications,
          copyProductAssignments: dupForm.copyProductAssignments,
          copyTeamStructure: dupForm.copyTeamStructure,
        },
      });
      toast({ title: "Configuración duplicada" });
      setDupOpen(null);
      await invalidate();
      if (created?.id) setLocation(`/admin/sucursales/${created.id}/editar`);
    } catch (err: any) {
      toast({ title: err?.payload?.error || "Error al duplicar", variant: "destructive" });
    }
  }

  function openDuplicate(branch: AdminBranch) {
    setDupForm({
      name: `${branch.name} (copia)`,
      branchCode: `${(branch.branchCode || "NEW").slice(0, 2)}X`,
      copyHours: true,
      copyPickupDelivery: true,
      copyNotifications: true,
      copyProductAssignments: false,
      copyTeamStructure: false,
    });
    setDupOpen(branch);
  }

  return (
    <AdminLayout>
      <AdminPageShell>
        <AdminPageHeader
          title="Sucursales"
          description="Unidades operativas independientes: identidad, equipo, pedidos e inventario."
          actions={
            <>
              <Button variant="outline" className="rounded-none" asChild>
                <a href="/api/admin/branches/export">Exportar</a>
              </Button>
              <Button className="rounded-none" asChild>
                <Link href="/admin/sucursales/nueva">
                  <Plus className="mr-2 h-4 w-4" /> Nueva sucursal
                </Link>
              </Button>
            </>
          }
        />

        {query.isLoading ? (
          <AdminLoading label="Cargando sucursales…" />
        ) : query.error ? (
          <AdminError
            title="No se pudieron cargar las sucursales"
            onRetry={() => query.refetch()}
          />
        ) : branches.length === 0 ? (
          <AdminEmptyState
            icon={Store}
            title="Aún no hay sucursales"
            description="Crea la primera para operar pedidos e inventario."
            action={
              <Button className="rounded-none" asChild>
                <Link href="/admin/sucursales/nueva">Crear sucursal</Link>
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SummaryStat label="Total" value={summary.total} />
              <SummaryStat label="Activas" value={summary.active} />
              <SummaryStat label="Pedidos hoy" value={summary.ordersToday} />
              <SummaryStat
                label="Alertas abiertas"
                value={summary.alertsOpen}
                alert={summary.alertsOpen > 0}
                hint={summary.withAlerts > 0 ? `${summary.withAlerts} sucursales` : undefined}
              />
            </div>

            <div className="sticky top-0 z-10 -mx-6 space-y-3 border-b border-border bg-background/95 px-6 py-3 backdrop-blur md:-mx-10 md:px-10">
              <AdminFilterBar>
                {STATUS_CHIPS.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setStatusFilter(chip.id)}
                    className={cn(
                      "h-9 rounded-none border px-3 text-sm transition-colors",
                      statusFilter === chip.id
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                    )}
                  >
                    {chip.label}
                  </button>
                ))}
                <div className="relative min-w-[14rem] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por nombre, código o colonia…"
                    className="h-9 rounded-none border-border pl-9"
                  />
                </div>
              </AdminFilterBar>
            </div>

            {filtered.length === 0 ? (
              <AdminEmptyState
                icon={Store}
                title="Ninguna sucursal coincide"
                description="Prueba otro filtro o limpia la búsqueda."
                action={
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-none"
                    onClick={() => {
                      setSearch("");
                      setStatusFilter("all");
                    }}
                  >
                    Limpiar filtros
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-3">
                {filtered.map((branch) => {
                  const status = statusOf(branch);
                  const responsible = responsibleName(branch);
                  const alerts = branch.alertsOpen ?? 0;
                  const ordersToday = branch.ordersToday ?? 0;
                  const street = branchStreetLine(branch);
                  const fulfillment = branchFulfillmentLabel(branch);

                  return (
                    <article
                      key={branch.id}
                      className="group relative overflow-hidden border border-border bg-background transition-colors hover:border-foreground/30"
                    >
                      <div
                        className={cn(
                          "absolute inset-y-0 left-0 w-1",
                          status === "active" && (alerts > 0 ? "bg-amber-500" : "bg-emerald-500"),
                          status === "inactive" && "bg-amber-400",
                          status === "archived" && "bg-muted-foreground/40",
                        )}
                        aria-hidden
                      />

                      <div className="flex flex-col pl-1 md:flex-row md:items-stretch">
                        <div className="min-w-0 flex-1 space-y-3 px-4 py-4 md:px-5 md:py-5">
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <Link
                              href={`/admin/sucursales/${branch.id}`}
                              className="font-serif text-[1.35rem] leading-none tracking-tight text-foreground transition-colors hover:text-primary"
                            >
                              {branch.name}
                            </Link>
                            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                              <span
                                className={cn(
                                  "font-medium uppercase tracking-[0.12em]",
                                  status === "active" && "text-emerald-700",
                                  status === "inactive" && "text-amber-800",
                                  status === "archived" && "text-muted-foreground",
                                )}
                              >
                                {STATUS_LABEL[status] || status}
                              </span>
                              {branch.branchCode ? (
                                <>
                                  <span className="text-border">·</span>
                                  <span className="font-mono tracking-wide">{branch.branchCode}</span>
                                </>
                              ) : null}
                            </span>
                          </div>

                          <p className="flex items-start gap-2 text-sm leading-snug text-muted-foreground">
                            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
                            <span>
                              {street ? (
                                <>
                                  <span className="text-foreground/90">{street}</span>
                                  <span> · {branchLocationLine(branch)}</span>
                                </>
                              ) : (
                                branchLocationLine(branch)
                              )}
                            </span>
                          </p>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
                            {branch.phone ? (
                              <span className="inline-flex items-center gap-1.5">
                                <Phone className="h-3.5 w-3.5 opacity-70" />
                                {branch.phone}
                              </span>
                            ) : null}
                            {branch.phone ? <span className="hidden text-border sm:inline">·</span> : null}
                            <span>{fulfillment}</span>
                            <span className="text-border">·</span>
                            <span className="inline-flex items-center gap-1.5">
                              <User className="h-3.5 w-3.5 opacity-70" />
                              <span className={cn(!responsible && "italic")}>
                                {responsible || "Sin responsable"}
                              </span>
                            </span>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col border-t border-border md:w-[19.5rem] md:border-l md:border-t-0">
                          <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
                            <Metric
                              label="Pedidos hoy"
                              value={ordersToday}
                              href={`/admin/pedidos?day=today&branchId=${branch.id}`}
                            />
                            <Metric
                              label="Alertas"
                              value={alerts}
                              href={`/admin/alertas?branchId=${branch.id}`}
                              alert={alerts > 0}
                            />
                          </div>

                          <div className="flex flex-1 items-center gap-2 bg-muted/20 px-3 py-3">
                            <Button asChild className="h-9 flex-1 rounded-none">
                              <Link href={`/admin/sucursales/${branch.id}`}>Ver operación</Link>
                            </Button>
                            <Button asChild variant="outline" className="h-9 rounded-none bg-background">
                              <Link href={`/admin/sucursales/${branch.id}/editar`}>Editar</Link>
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-9 w-9 rounded-none bg-background"
                                  aria-label={`Más acciones para ${branch.name}`}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="rounded-none">
                                <DropdownMenuItem onClick={() => openDuplicate(branch)}>
                                  <Copy className="mr-2 h-3.5 w-3.5" />
                                  Duplicar configuración
                                </DropdownMenuItem>
                                {status === "active" ? (
                                  <DropdownMenuItem onClick={() => void onDeactivate(branch)}>
                                    <Power className="mr-2 h-3.5 w-3.5" />
                                    Desactivar
                                  </DropdownMenuItem>
                                ) : null}
                                {status !== "archived" ? (
                                  <DropdownMenuItem onClick={() => void onArchive(branch)}>
                                    <Archive className="mr-2 h-3.5 w-3.5" />
                                    Archivar
                                  </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => void onDelete(branch)}
                                >
                                  Eliminar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </>
        )}
      </AdminPageShell>

      <Dialog open={!!dupOpen} onOpenChange={(o) => !o && setDupOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicar configuración</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm">
              Nombre *
              <Input
                value={dupForm.name}
                onChange={(e) => setDupForm({ ...dupForm, name: e.target.value })}
                className="mt-1 rounded-none"
              />
            </label>
            <label className="block text-sm">
              Código *
              <Input
                value={dupForm.branchCode}
                onChange={(e) =>
                  setDupForm({ ...dupForm, branchCode: e.target.value.toUpperCase() })
                }
                className="mt-1 rounded-none"
              />
            </label>
            <div className="space-y-2 text-sm">
              {(
                [
                  ["copyHours", "Copiar horarios"],
                  ["copyPickupDelivery", "Copiar pickup / delivery"],
                  ["copyNotifications", "Copiar alertas / notificaciones"],
                  ["copyProductAssignments", "Copiar asignaciones de productos (sin stock)"],
                  ["copyTeamStructure", "Copiar estructura de equipo (sin marcar responsable)"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <Checkbox
                    checked={dupForm[key]}
                    onCheckedChange={(v) => setDupForm({ ...dupForm, [key]: !!v })}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              No se copian pedidos, ventas ni inventario.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-none" onClick={() => setDupOpen(null)}>
              Cancelar
            </Button>
            <Button
              className="rounded-none"
              onClick={() => void onDuplicate()}
              disabled={!dupForm.name || !dupForm.branchCode}
            >
              Duplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}

function SummaryStat({
  label,
  value,
  alert,
  hint,
}: {
  label: string;
  value: number;
  alert?: boolean;
  hint?: string;
}) {
  return (
    <div
      className={cn(
        "border border-border bg-background px-4 py-3",
        alert && "border-amber-300/80 bg-amber-50/40",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {alert ? <AlertTriangle className="h-3.5 w-3.5 text-amber-700" /> : null}
        {label}
      </div>
      <div className="mt-1 font-serif text-2xl tracking-tight tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function Metric({
  label,
  value,
  href,
  alert,
}: {
  label: string;
  value: number;
  href: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "block px-4 py-3 transition-colors hover:bg-muted/40",
        alert && "bg-amber-50/70 hover:bg-amber-50",
      )}
    >
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {alert ? <AlertTriangle className="h-3 w-3 text-amber-700" /> : null}
        {label}
      </div>
      <div
        className={cn(
          "mt-1 font-serif text-2xl leading-none tabular-nums tracking-tight",
          alert ? "text-amber-950" : "text-foreground",
        )}
      >
        {value}
      </div>
    </Link>
  );
}
