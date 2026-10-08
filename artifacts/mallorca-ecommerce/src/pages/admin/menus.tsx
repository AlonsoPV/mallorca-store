import { useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, useListBranches } from "@workspace/api-client-react";
import {
  AdminError,
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
import { useToast } from "@/hooks/use-toast";

const MENUS_KEY = ["admin", "menus"] as const;
const MAX_MENU_BYTES = 8 * 1024 * 1024;

type StoreMenu = {
  key: string;
  scope: "global" | "branch";
  branchId: number | null;
  fileName: string;
  updatedAt: string;
};

type MenuCatalog = { menus: StoreMenu[] };

function errorMessage(error: unknown) {
  const value = error as { error?: string; message?: string; data?: { error?: string } };
  return value?.data?.error || value?.error || value?.message || "No se pudo guardar el menú.";
}

function formatUpdated(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

export default function AdminMenus() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingKey = useRef<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const catalog = useQuery({
    queryKey: MENUS_KEY,
    queryFn: () => customFetch<MenuCatalog>("/api/admin/menus"),
    retry: 1,
  });
  const branches = useListBranches();
  const byKey = new Map((catalog.data?.menus ?? []).map((menu) => [menu.key, menu]));

  function remember(result: MenuCatalog) {
    queryClient.setQueryData(MENUS_KEY, result);
    queryClient.setQueryData(["store-menus"], result);
  }

  const upload = useMutation({
    mutationFn: ({ key, file }: { key: string; file: File }) =>
      customFetch<MenuCatalog>(`/api/admin/menus/${key}?fileName=${encodeURIComponent(file.name)}`, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/pdf" },
        body: file,
      }),
    onSuccess: (result) => {
      remember(result);
      toast({ title: "Menú actualizado" });
    },
    onError: (error) => {
      toast({ title: errorMessage(error), variant: "destructive" });
    },
    onSettled: () => setBusyKey(null),
  });

  const remove = useMutation({
    mutationFn: (key: string) =>
      customFetch<MenuCatalog>(`/api/admin/menus/${key}`, { method: "DELETE" }),
    onSuccess: (result) => {
      remember(result);
      toast({ title: "Menú eliminado" });
    },
    onError: (error) => {
      toast({ title: errorMessage(error), variant: "destructive" });
    },
    onSettled: () => setBusyKey(null),
  });

  function chooseFile(key: string) {
    pendingKey.current = key;
    fileRef.current?.click();
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const key = pendingKey.current;
    event.target.value = "";
    pendingKey.current = null;
    if (!file || !key) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      toast({ title: "El menú tiene que ser un PDF.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_MENU_BYTES) {
      toast({ title: "El PDF no puede pasar de 8 MB.", variant: "destructive" });
      return;
    }
    setBusyKey(key);
    upload.mutate({ key, file });
  }

  function removeMenu(key: string) {
    if (!window.confirm("¿Quitar este menú? La tienda volverá al menú global o a la carta incluida.")) return;
    setBusyKey(key);
    remove.mutate(key);
  }

  const rows = [
    { key: "global", label: "Global", hint: "Se usa en toda la tienda si la sucursal no tiene carta propia." },
    ...((Array.isArray(branches.data) ? branches.data : []).map((branch) => ({
      key: `branch-${branch.id}`,
      label: branch.shortName || branch.name,
      hint: "Solo para esta sucursal.",
    }))),
  ];

  return (
    <AdminLayout>
      <AdminPageShell>
        <AdminPageHeader
          title="Menús"
          description="Sube la carta en PDF para toda la tienda o para una sucursal. Si una sucursal no tiene menú, se muestra el global."
        />
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={onFile}
        />
        {catalog.isLoading || branches.isLoading ? <AdminLoading label="Cargando menús…" /> : null}
        {catalog.isError ? (
          <AdminError title="No se pudieron cargar los menús" onRetry={() => catalog.refetch()} />
        ) : null}
        {catalog.data ? (
          <AdminTable>
            <AdminTableHeader>
              <AdminTableRow>
                <AdminTableHead>Alcance</AdminTableHead>
                <AdminTableHead>Archivo</AdminTableHead>
                <AdminTableHead>Actualizado</AdminTableHead>
                <AdminTableHead className="text-right">Acciones</AdminTableHead>
              </AdminTableRow>
            </AdminTableHeader>
            <AdminTableBody>
              {rows.map((row) => {
                const menu = byKey.get(row.key);
                const busy = busyKey === row.key;
                return (
                  <AdminTableRow key={row.key}>
                    <AdminTableCell>
                      <div className="font-medium text-foreground">{row.label}</div>
                      <div className="mt-1 max-w-sm text-xs text-muted-foreground">{row.hint}</div>
                    </AdminTableCell>
                    <AdminTableCell>{menu?.fileName || "Sin archivo"}</AdminTableCell>
                    <AdminTableCell>{menu ? formatUpdated(menu.updatedAt) : "—"}</AdminTableCell>
                    <AdminTableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => chooseFile(row.key)}>
                          {busy ? "Guardando…" : menu ? "Reemplazar" : "Subir PDF"}
                        </Button>
                        {menu ? (
                          <>
                            <Button variant="outline" size="sm" asChild>
                              <a href={`/api/menus/${menu.key}/file`} target="_blank" rel="noopener noreferrer">
                                Ver
                              </a>
                            </Button>
                            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => removeMenu(row.key)}>
                              Quitar
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </AdminTableCell>
                  </AdminTableRow>
                );
              })}
            </AdminTableBody>
          </AdminTable>
        ) : null}
      </AdminPageShell>
    </AdminLayout>
  );
}
