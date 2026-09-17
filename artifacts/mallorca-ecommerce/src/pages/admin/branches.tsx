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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Archive, Copy, MoreHorizontal, Plus, Power, Store } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  active: "Activa",
  inactive: "Inactiva",
  archived: "Archivada",
};

function statusOf(b: AdminBranch) {
  return (b.status as string) || (b.active ? "active" : "inactive");
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
  const [menuId, setMenuId] = useState<number | null>(null);

  const branches = useMemo(() => query.data ?? [], [query.data]);

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
          <div className="grid gap-4">
            {branches.map((branch) => {
              const status = statusOf(branch);
              const responsible =
                (branch as any).primaryResponsible?.name ||
                branch.managerName ||
                "Sin responsable";
              return (
                <div key={branch.id} className="rounded-xl border bg-card p-5 space-y-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/sucursales/${branch.id}`} className="text-xl font-semibold hover:text-primary">
                          {branch.name}
                        </Link>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                            status === "active" && "bg-emerald-50 text-emerald-700",
                            status === "inactive" && "bg-amber-50 text-amber-800",
                            status === "archived" && "bg-slate-100 text-slate-600",
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              status === "active" && "bg-emerald-500",
                              status === "inactive" && "bg-amber-500",
                              status === "archived" && "bg-slate-400",
                            )}
                          />
                          {STATUS_LABEL[status] || status}
                        </span>
                        {branch.branchCode && (
                          <span className="text-xs text-muted-foreground font-mono">{branch.branchCode}</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{branch.address}</p>
                    </div>
                    <div className="relative">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setMenuId(menuId === branch.id ? null : branch.id)}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                      {menuId === branch.id && (
                        <div className="absolute right-0 z-20 mt-1 w-52 rounded-md border bg-popover shadow-md p-1 text-sm">
                          <button className="w-full text-left px-3 py-2 hover:bg-muted rounded" onClick={() => setLocation(`/admin/sucursales/${branch.id}/editar`)}>Editar</button>
                          <button className="w-full text-left px-3 py-2 hover:bg-muted rounded" onClick={() => setLocation(`/admin/sucursales/${branch.id}`)}>Ver operación</button>
                          <button
                            className="w-full text-left px-3 py-2 hover:bg-muted rounded flex items-center gap-2"
                            onClick={() => {
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
                              setMenuId(null);
                            }}
                          >
                            <Copy className="w-3.5 h-3.5" /> Duplicar configuración
                          </button>
                          {status === "active" && (
                            <button className="w-full text-left px-3 py-2 hover:bg-muted rounded flex items-center gap-2" onClick={() => { setMenuId(null); void onDeactivate(branch); }}>
                              <Power className="w-3.5 h-3.5" /> Desactivar
                            </button>
                          )}
                          {status !== "archived" && (
                            <button className="w-full text-left px-3 py-2 hover:bg-muted rounded flex items-center gap-2" onClick={() => { setMenuId(null); void onArchive(branch); }}>
                              <Archive className="w-3.5 h-3.5" /> Archivar
                            </button>
                          )}
                          <button className="w-full text-left px-3 py-2 hover:bg-muted rounded text-destructive" onClick={() => { setMenuId(null); void onDelete(branch); }}>
                            Eliminar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="rounded-lg bg-muted/40 px-3 py-2">
                      <div className="text-xs text-muted-foreground">Pedidos hoy</div>
                      <div className="font-semibold text-lg">{(branch as any).ordersToday ?? 0}</div>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-3 py-2">
                      <div className="text-xs text-muted-foreground">Alertas</div>
                      <div className="font-semibold text-lg">{(branch as any).alertsOpen ?? 0}</div>
                    </div>
                    <div className="rounded-lg bg-muted/40 px-3 py-2 col-span-2">
                      <div className="text-xs text-muted-foreground">Responsable</div>
                      <div className="font-medium truncate">{responsible}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AdminPageShell>

      <Dialog open={!!dupOpen} onOpenChange={(o) => !o && setDupOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicar configuración</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm block">Nombre *<Input value={dupForm.name} onChange={(e) => setDupForm({ ...dupForm, name: e.target.value })} /></label>
            <label className="text-sm block">Código *<Input value={dupForm.branchCode} onChange={(e) => setDupForm({ ...dupForm, branchCode: e.target.value.toUpperCase() })} /></label>
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
            <p className="text-xs text-muted-foreground">No se copian pedidos, ventas ni inventario.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDupOpen(null)}>Cancelar</Button>
            <Button onClick={() => void onDuplicate()} disabled={!dupForm.name || !dupForm.branchCode}>Duplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
