import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, UserPlus, Users } from "lucide-react";
import { readSearchParam, withSearchParams } from "@/lib/admin-search-params";
import AdminAssignmentsPanel from "@/pages/admin/responsibles";
import {
  useCreateAdminUser,
  useGetMe,
  useListAdminBranches,
  useListAdminUsers,
  useUpdateAdminUser,
  getListAdminUsersQueryKey,
  type AdminStaffRole,
  type AdminUserCreate,
  type SafeUser,
} from "@workspace/api-client-react";
import {
  AdminEmptyState,
  AdminError,
  AdminFilterBar,
  AdminFilterSelect,
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
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  staff: "Staff",
  branch_manager: "Gerente de sucursal",
  operations: "Operaciones",
  operations_manager: "Gerente de operaciones",
  manager: "Manager",
  admin: "Admin",
};

const CREATABLE_ROLES: AdminStaffRole[] = [
  "staff",
  "branch_manager",
  "operations",
  "operations_manager",
  "manager",
  "admin",
];

type CreateForm = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: AdminStaffRole;
  branchId: string;
  branchRole: "staff" | "branch_manager" | "operations";
  isPrimary: boolean;
  sendInvite: boolean;
};

const emptyCreate = (): CreateForm => ({
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
  role: "staff",
  branchId: "none",
  branchRole: "staff",
  isPrimary: false,
  sendInvite: true,
});

function errorMessage(error: unknown) {
  const e = error as { error?: string; message?: string; data?: { error?: string } };
  return e?.data?.error || e?.error || e?.message || "La operación no pudo completarse.";
}

type UsersTab = "directorio" | "asignaciones";

function parseUsersTab(search: string): UsersTab {
  return readSearchParam(search, "tab") === "asignaciones" ? "asignaciones" : "directorio";
}

export default function AdminUsers() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const tab = parseUsersTab(search);
  const me = useGetMe();
  const users = useListAdminUsers();
  const branches = useListAdminBranches();
  const createUser = useCreateAdminUser();
  const updateUser = useUpdateAdminUser();

  const [roleFilter, setRoleFilter] = useState("all");
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyCreate);
  const [editing, setEditing] = useState<SafeUser | null>(null);
  const [editForm, setEditForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    role: "staff" as AdminStaffRole,
  });

  const canManage =
    me.data?.role === "admin" || me.data?.role === "operations_manager";
  const roleOptions = useMemo(() => {
    if (me.data?.role === "admin") return CREATABLE_ROLES;
    return CREATABLE_ROLES.filter((r) => r !== "admin" && r !== "operations_manager");
  }, [me.data?.role]);

  const filtered = useMemo(() => {
    let list = users.data ?? [];
    if (roleFilter !== "all") list = list.filter((u) => u.role === roleFilter);
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter((u) =>
        [u.name, u.email, u.role, u.phone].filter(Boolean).join(" ").toLowerCase().includes(needle),
      );
    }
    return list;
  }, [users.data, roleFilter, q]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListAdminUsersQueryKey() });
  };

  const openCreate = () => {
    setForm(emptyCreate());
    setCreateOpen(true);
  };

  const openEdit = (user: SafeUser) => {
    setEditing(user);
    setEditForm({
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      phone: user.phone ?? "",
      role: (CREATABLE_ROLES.includes(user.role as AdminStaffRole)
        ? user.role
        : "staff") as AdminStaffRole,
    });
    setEditOpen(true);
  };

  const submitCreate = async () => {
    if (!form.email.trim()) {
      toast({ title: "El correo es obligatorio", variant: "destructive" });
      return;
    }
    const payload: AdminUserCreate = {
      email: form.email.trim(),
      firstName: form.firstName.trim() || null,
      lastName: form.lastName.trim() || null,
      phone: form.phone.trim() || null,
      role: form.role,
      sendInvite: form.sendInvite,
      branchId: form.branchId !== "none" ? Number(form.branchId) : null,
      branchRole: form.branchRole,
      isPrimary: form.isPrimary,
    };
    try {
      const result = await createUser.mutateAsync({ data: payload });
      toast({
        title: result.promoted
          ? "Cliente promovido a staff"
          : `Usuario ${result.user.name} creado`,
        description: result.message ?? undefined,
      });
      setCreateOpen(false);
      refresh();
    } catch (e) {
      toast({ title: errorMessage(e), variant: "destructive" });
    }
  };

  const submitEdit = async () => {
    if (!editing) return;
    try {
      await updateUser.mutateAsync({
        id: editing.id,
        data: {
          firstName: editForm.firstName.trim() || null,
          lastName: editForm.lastName.trim() || null,
          phone: editForm.phone.trim() || null,
          role: editForm.role,
        },
      });
      toast({ title: "Usuario actualizado" });
      setEditOpen(false);
      refresh();
    } catch (e) {
      toast({ title: errorMessage(e), variant: "destructive" });
    }
  };

  return (
    <AdminLayout>
      <AdminPageShell>
        <AdminPageHeader
          title="Usuarios"
          description="Crea el equipo operativo y asígnalo a sucursales o categorías. El acceso usa Clerk (o local-dev)."
          actions={
            canManage ? (
              <Button className="rounded-none" onClick={openCreate}>
                <UserPlus className="mr-2 h-4 w-4" />
                Nuevo usuario
              </Button>
            ) : null
          }
        />

        <div className="flex gap-1 overflow-x-auto border-b border-border">
          {(
            [
              { id: "directorio", label: "Directorio" },
              { id: "asignaciones", label: "Asignaciones" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() =>
                setLocation(
                  withSearchParams("/admin/usuarios", search, {
                    tab: item.id === "directorio" ? null : item.id,
                  }),
                  { replace: true },
                )
              }
              className={cn(
                "px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px",
                tab === item.id
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "asignaciones" ? (
          <AdminAssignmentsPanel />
        ) : (
          <>
            {!canManage ? (
              <p className="border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                Puedes consultar el directorio. Solo <strong>admin</strong> u{" "}
                <strong>operations manager</strong> pueden crear o editar usuarios.
              </p>
            ) : null}

            <div className="sticky top-0 z-10 -mx-6 space-y-3 border-b border-border bg-background/95 px-6 py-3 backdrop-blur md:-mx-10 md:px-10">
              <AdminFilterBar>
                <AdminFilterSelect
                  value={roleFilter}
                  onValueChange={setRoleFilter}
                  placeholder="Rol"
                  triggerClassName="w-48"
                  options={[
                    { value: "all", label: "Todos los roles" },
                    ...Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label })),
                  ]}
                />
                <Input
                  className="h-9 max-w-sm rounded-none"
                  placeholder="Buscar nombre, correo o teléfono…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </AdminFilterBar>
            </div>

            {users.isLoading ? <AdminLoading label="Cargando usuarios…" /> : null}
            {users.isError ? (
              <AdminError title="No se pudieron cargar los usuarios" onRetry={() => users.refetch()} />
            ) : null}
            {!users.isLoading && !users.isError && filtered.length === 0 ? (
              <AdminEmptyState
                icon={Users}
                title="No hay usuarios operativos"
                description="Crea el primer miembro del equipo o promociona un cliente existente por correo."
                action={
                  canManage ? (
                    <Button className="rounded-none" onClick={openCreate}>
                      + Nuevo usuario
                    </Button>
                  ) : null
                }
              />
            ) : null}

            {!users.isLoading && !users.isError && filtered.length > 0 ? (
              <AdminTable>
                <AdminTableHeader>
                  <AdminTableRow>
                    {["Nombre", "Correo", "Teléfono", "Rol", "Acciones"].map((h) => (
                      <AdminTableHead key={h}>{h}</AdminTableHead>
                    ))}
                  </AdminTableRow>
                </AdminTableHeader>
                <AdminTableBody>
                  {filtered.map((user) => (
                    <AdminTableRow key={user.id}>
                      <AdminTableCell className="font-medium">{user.name}</AdminTableCell>
                      <AdminTableCell className="text-sm text-muted-foreground">{user.email}</AdminTableCell>
                      <AdminTableCell className="text-sm">{user.phone || "—"}</AdminTableCell>
                      <AdminTableCell>
                        <span className="inline-flex border border-border px-2 py-0.5 text-xs font-medium">
                          {ROLE_LABELS[user.role] ?? user.role}
                        </span>
                      </AdminTableCell>
                      <AdminTableCell>
                        {canManage ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-none"
                            onClick={() => openEdit(user)}
                          >
                            <Pencil className="mr-1.5 h-3.5 w-3.5" />
                            Editar
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </AdminTableCell>
                    </AdminTableRow>
                  ))}
                </AdminTableBody>
              </AdminTable>
            ) : null}
          </>
        )}

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="rounded-none sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nuevo usuario</DialogTitle>
              <DialogDescription>
                Crea un usuario operativo o promociona un cliente existente con el mismo correo.
                No se guarda contraseña en la base de datos.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1">
                <Label>Correo *</Label>
                <Input
                  type="email"
                  className="rounded-none"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="nombre@mallorca.mx"
                />
              </div>
              <div className="space-y-1">
                <Label>Nombre</Label>
                <Input
                  className="rounded-none"
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Apellido</Label>
                <Input
                  className="rounded-none"
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Teléfono</Label>
                <Input
                  className="rounded-none"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Rol *</Label>
                <select
                  className="flex h-10 w-full border border-border bg-background px-3 text-sm"
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AdminStaffRole }))}
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Asignar a sucursal (opcional)</Label>
                <select
                  className="flex h-10 w-full border border-border bg-background px-3 text-sm"
                  value={form.branchId}
                  onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
                >
                  <option value="none">Sin asignar ahora</option>
                  {(branches.data ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              {form.branchId !== "none" ? (
                <>
                  <div className="space-y-1">
                    <Label>Rol en sucursal</Label>
                    <select
                      className="flex h-10 w-full border border-border bg-background px-3 text-sm"
                      value={form.branchRole}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          branchRole: e.target.value as CreateForm["branchRole"],
                        }))
                      }
                    >
                      <option value="staff">Staff</option>
                      <option value="branch_manager">Gerente</option>
                      <option value="operations">Operaciones</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 self-end pb-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.isPrimary}
                      onChange={(e) => setForm((f) => ({ ...f, isPrimary: e.target.checked }))}
                    />
                    Responsable principal
                  </label>
                </>
              ) : null}
              <label className={cn("flex items-start gap-2 text-sm sm:col-span-2")}>
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.sendInvite}
                  onChange={(e) => setForm((f) => ({ ...f, sendInvite: e.target.checked }))}
                />
                <span>
                  Enviar invitación de acceso (Clerk). En local-dev se omite y el usuario queda
                  disponible de inmediato en el directorio.
                </span>
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" className="rounded-none" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button
                className="rounded-none"
                disabled={createUser.isPending}
                onClick={submitCreate}
              >
                Crear usuario
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="rounded-none sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Editar usuario</DialogTitle>
              <DialogDescription>{editing?.email}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Nombre</Label>
                <Input
                  className="rounded-none"
                  value={editForm.firstName}
                  onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Apellido</Label>
                <Input
                  className="rounded-none"
                  value={editForm.lastName}
                  onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Teléfono</Label>
                <Input
                  className="rounded-none"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Rol</Label>
                <select
                  className="flex h-10 w-full border border-border bg-background px-3 text-sm"
                  value={editForm.role}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, role: e.target.value as AdminStaffRole }))
                  }
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" className="rounded-none" onClick={() => setEditOpen(false)}>
                Cancelar
              </Button>
              <Button
                className="rounded-none"
                disabled={updateUser.isPending}
                onClick={submitEdit}
              >
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AdminPageShell>
    </AdminLayout>
  );
}
