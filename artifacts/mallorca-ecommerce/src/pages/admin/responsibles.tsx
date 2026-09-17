import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import {
  useListAdminUsers,
  useListAdminBranches,
  useListCategories,
  useListBranchAssignments,
  useCreateBranchAssignment,
  useDeleteBranchAssignment,
  useListCategoryResponsibles,
  useUpsertCategoryResponsible,
  useDeleteCategoryResponsible,
  getListBranchAssignmentsQueryKey,
  getListCategoryResponsiblesQueryKey,
} from "@workspace/api-client-react";
import {
  AdminEmptyState,
  AdminFilterBar,
  AdminFilterSelect,
  AdminLoading,
  AdminPageHeader,
  AdminPageShell,
} from "@/components/admin";
import { AdminLayout } from "@/components/layout/admin-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

function errorMessage(error: unknown) {
  const e = error as { error?: string; message?: string };
  return e?.error || e?.message || "La operación no pudo completarse.";
}

export default function AdminResponsibles() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const users = useListAdminUsers();
  const branches = useListAdminBranches();
  const categories = useListCategories();

  const [branchId, setBranchId] = useState("none");
  const [userId, setUserId] = useState("none");
  const branchIdNum = branchId !== "none" ? Number(branchId) : 0;
  const assignments = useListBranchAssignments(branchIdNum, {
    query: {
      queryKey: getListBranchAssignmentsQueryKey(branchIdNum),
      enabled: branchId !== "none",
    },
  });
  const create = useCreateBranchAssignment();
  const remove = useDeleteBranchAssignment();

  const [catBranch, setCatBranch] = useState("none");
  const [catId, setCatId] = useState("none");
  const [catUser, setCatUser] = useState("none");
  const catBranchNum = catBranch !== "none" ? Number(catBranch) : undefined;
  const responsibles = useListCategoryResponsibles(
    { branchId: catBranchNum },
    {
      query: {
        queryKey: getListCategoryResponsiblesQueryKey({ branchId: catBranchNum }),
        enabled: catBranch !== "none",
      },
    },
  );
  const upsert = useUpsertCategoryResponsible();
  const delCat = useDeleteCategoryResponsible();

  const run = async (fn: () => Promise<unknown>, success: string, refresh: () => void) => {
    try {
      await fn();
      toast({ title: success });
      refresh();
    } catch (e) {
      toast({ title: errorMessage(e), variant: "destructive" });
    }
  };

  const loadingUsers = users.isLoading || branches.isLoading;

  return (
    <AdminLayout>
      <AdminPageShell>
        <AdminPageHeader
          title="Responsables"
          description="Asigna usuarios a sucursales y categorías."
        />

        {loadingUsers ? <AdminLoading label="Cargando responsables…" /> : null}

        {!loadingUsers ? (
          <>
            <Card className="rounded-none">
              <CardHeader>
                <CardTitle>Usuarios por sucursal</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <AdminFilterBar className="items-end">
                  <AdminFilterSelect
                    value={branchId}
                    onValueChange={setBranchId}
                    placeholder="Sucursal"
                    triggerClassName="min-w-[12rem]"
                    options={[
                      { value: "none", label: "Selecciona sucursal" },
                      ...(branches.data?.map((b) => ({
                        value: String(b.id),
                        label: b.name,
                      })) ?? []),
                    ]}
                  />
                  <AdminFilterSelect
                    value={userId}
                    onValueChange={setUserId}
                    placeholder="Usuario"
                    triggerClassName="min-w-[14rem]"
                    options={[
                      { value: "none", label: "Selecciona usuario" },
                      ...(users.data?.map((u) => ({
                        value: u.id,
                        label: `${u.name} · ${u.email}`,
                      })) ?? []),
                    ]}
                  />
                  <Button
                    className="rounded-none"
                    disabled={branchId === "none" || userId === "none"}
                    onClick={() =>
                      run(
                        () =>
                          create.mutateAsync({
                            id: branchIdNum,
                            data: { userId },
                          }),
                        "Usuario asignado",
                        () =>
                          qc.invalidateQueries({
                            queryKey: getListBranchAssignmentsQueryKey(branchIdNum),
                          }),
                      )
                    }
                  >
                    Asignar
                  </Button>
                </AdminFilterBar>

                {branchId !== "none" ? (
                  assignments.isLoading ? (
                    <AdminLoading className="min-h-[120px]" label="Cargando asignaciones…" />
                  ) : !assignments.data?.length ? (
                    <AdminEmptyState
                      icon={Users}
                      title="Sin asignaciones"
                      description="Asigna un usuario a esta sucursal."
                      className="min-h-[120px] py-8 md:p-8"
                    />
                  ) : (
                    <div className="divide-y border border-border">
                      {assignments.data.map((a: any, i: number) => (
                        <div
                          className="flex justify-between px-3 py-2 text-sm"
                          key={a.id ?? a.userId ?? i}
                        >
                          <span>{a.name || a.email || a.userId || JSON.stringify(a)}</span>
                          {a.userId ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="rounded-none"
                              onClick={() =>
                                run(
                                  () =>
                                    remove.mutateAsync({
                                      id: branchIdNum,
                                      userId: a.userId,
                                    }),
                                  "Asignación eliminada",
                                  () =>
                                    qc.invalidateQueries({
                                      queryKey: getListBranchAssignmentsQueryKey(branchIdNum),
                                    }),
                                )
                              }
                            >
                              Quitar
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )
                ) : null}
              </CardContent>
            </Card>

            <Card className="rounded-none">
              <CardHeader>
                <CardTitle>Responsables de categoría</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <AdminFilterBar className="items-end">
                  <AdminFilterSelect
                    value={catBranch}
                    onValueChange={setCatBranch}
                    placeholder="Sucursal"
                    triggerClassName="min-w-[10rem]"
                    options={[
                      { value: "none", label: "Sucursal" },
                      ...(branches.data?.map((b) => ({
                        value: String(b.id),
                        label: b.name,
                      })) ?? []),
                    ]}
                  />
                  <AdminFilterSelect
                    value={catId}
                    onValueChange={setCatId}
                    placeholder="Categoría"
                    triggerClassName="min-w-[10rem]"
                    options={[
                      { value: "none", label: "Categoría" },
                      ...(categories.data?.map((c) => ({
                        value: String(c.id),
                        label: c.name,
                      })) ?? []),
                    ]}
                  />
                  <AdminFilterSelect
                    value={catUser}
                    onValueChange={setCatUser}
                    placeholder="Usuario"
                    triggerClassName="min-w-[10rem]"
                    options={[
                      { value: "none", label: "Usuario" },
                      ...(users.data?.map((u) => ({
                        value: u.id,
                        label: u.name,
                      })) ?? []),
                    ]}
                  />
                  <Button
                    className="rounded-none"
                    disabled={catBranch === "none" || catId === "none" || catUser === "none"}
                    onClick={() =>
                      run(
                        () =>
                          upsert.mutateAsync({
                            data: {
                              branchId: Number(catBranch),
                              categoryId: Number(catId),
                              userId: catUser,
                            },
                          }),
                        "Responsable guardado",
                        () =>
                          qc.invalidateQueries({
                            queryKey: getListCategoryResponsiblesQueryKey({
                              branchId: Number(catBranch),
                            }),
                          }),
                      )
                    }
                  >
                    Guardar
                  </Button>
                </AdminFilterBar>

                {catBranch !== "none" ? (
                  responsibles.isLoading ? (
                    <AdminLoading className="min-h-[120px]" label="Cargando…" />
                  ) : !responsibles.data?.length ? (
                    <AdminEmptyState
                      icon={Users}
                      title="Sin responsables de categoría"
                      description="Guarda un responsable para esta sucursal."
                      className="min-h-[120px] py-8 md:p-8"
                    />
                  ) : (
                    <div className="divide-y border border-border">
                      {responsibles.data.map((r: any, i: number) => (
                        <div
                          className="flex justify-between px-3 py-2 text-sm"
                          key={r.id ?? i}
                        >
                          <span>
                            {r.categoryName || r.categoryId} ·{" "}
                            {r.userName || r.userEmail || r.userId}
                          </span>
                          {r.id ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="rounded-none"
                              onClick={() =>
                                run(
                                  async () => {
                                    await delCat.mutateAsync({ id: r.id });
                                  },
                                  "Responsable eliminado",
                                  () =>
                                    qc.invalidateQueries({
                                      queryKey: getListCategoryResponsiblesQueryKey({
                                        branchId: Number(catBranch),
                                      }),
                                    }),
                                )
                              }
                            >
                              Eliminar
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )
                ) : null}
              </CardContent>
            </Card>
          </>
        ) : null}
      </AdminPageShell>
    </AdminLayout>
  );
}
