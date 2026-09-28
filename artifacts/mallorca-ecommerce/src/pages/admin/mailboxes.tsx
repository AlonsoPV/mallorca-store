import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const MAILBOXES_KEY = ["admin", "mailboxes"] as const;

type MailboxRole = "system" | "customer" | "branch" | "contact";

type PublicMailbox = {
  role: MailboxRole;
  address: string;
  displayName: string;
  smtpUser: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  passwordConfigured: boolean;
  configured: boolean;
};

type MailboxCatalog = {
  ready: boolean;
  source: "app" | "env" | "none";
  mailboxes: PublicMailbox[];
};

const PURPOSES: {
  role: MailboxRole;
  title: string;
  hint: string;
  example: string;
  needsPassword: boolean;
}[] = [
  {
    role: "system",
    title: "Sistema / desarrollo",
    hint: "Correo de la tienda para recuperación de contraseña y avisos internos.",
    example: "ecomm@pasteleria-mallorca.mx",
    needsPassword: true,
  },
  {
    role: "customer",
    title: "Pedidos al cliente",
    hint: "Envía el comprobante después de comprar.",
    example: "pedidos@tu-dominio",
    needsPassword: true,
  },
  {
    role: "branch",
    title: "Avisos a sucursal",
    hint: "Avisa al responsable. Debe ser distinto al de pedidos.",
    example: "sucursal@tu-dominio",
    needsPassword: true,
  },
  {
    role: "contact",
    title: "Respuestas del cliente",
    hint: "El cliente escribe a esta dirección. Sin contraseña SMTP.",
    example: "contacto@tu-dominio",
    needsPassword: false,
  },
];

type FormState = {
  role: MailboxRole;
  address: string;
  displayName: string;
  password: string;
  smtpHost: string;
  smtpPort: string;
};

const emptyForm = (role: MailboxRole = "system"): FormState => ({
  role,
  address: role === "system" ? "ecomm@pasteleria-mallorca.mx" : "",
  displayName: role === "system" ? "Mallorca Ecommerce" : "",
  password: "",
  smtpHost: "smtp.hostinger.com",
  smtpPort: "465",
});

function errorMessage(error: unknown) {
  const e = error as { error?: string; message?: string; data?: { error?: string } };
  return e?.data?.error || e?.error || e?.message || "No se pudo guardar el correo.";
}

export default function AdminMailboxes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const catalog = useQuery({
    queryKey: MAILBOXES_KEY,
    queryFn: () => customFetch<MailboxCatalog>("/api/admin/mailboxes"),
    retry: 1,
  });
  const byRole = Object.fromEntries((catalog.data?.mailboxes ?? []).map((row) => [row.role, row])) as Partial<
    Record<MailboxRole, PublicMailbox>
  >;
  const [open, setOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const purpose = PURPOSES.find((item) => item.role === form.role)!;
  const current = byRole[form.role];

  const save = useMutation({
    mutationFn: () =>
      customFetch<MailboxCatalog>(`/api/admin/mailboxes/${form.role}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: form.address.trim(),
          displayName: form.displayName.trim(),
          smtpUser: form.address.trim(),
          password: form.password.trim() || null,
          smtpHost: form.smtpHost.trim() || "smtp.hostinger.com",
          smtpPort: Number(form.smtpPort) || 465,
        }),
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(MAILBOXES_KEY, result);
      setOpen(false);
      toast({ title: "Correo de Hostinger guardado" });
    },
    onError: (error) => {
      toast({ title: errorMessage(error), variant: "destructive" });
    },
  });

  function openAdd(role?: MailboxRole) {
    const selected = role ?? PURPOSES.find((item) => !byRole[item.role]?.configured)?.role ?? "system";
    const row = byRole[selected];
    const defaults = emptyForm(selected);
    setForm({
      role: selected,
      address: row?.address || defaults.address,
      displayName: row?.displayName || defaults.displayName,
      password: "",
      smtpHost: row?.smtpHost ?? defaults.smtpHost,
      smtpPort: String(row?.smtpPort ?? defaults.smtpPort),
    });
    setAdvanced(false);
    setOpen(true);
  }

  function submit() {
    if (!form.address.includes("@")) {
      toast({ title: "Escribe el correo completo de Hostinger", variant: "destructive" });
      return;
    }
    if (purpose.needsPassword && !form.password.trim() && !current?.passwordConfigured) {
      toast({ title: "Pega la contraseña del buzón en Hostinger", variant: "destructive" });
      return;
    }
    save.mutate();
  }

  return (
    <AdminLayout>
      <AdminPageShell>
        <AdminPageHeader
          title="Correos"
          description="Registra los buzones de Hostinger. El de sistema (ecomm@pasteleria-mallorca.mx) envía la recuperación de contraseña; pedidos, sucursal y contacto cubren la compra."
          actions={
            <Button className="rounded-none" onClick={() => openAdd()}>
              <Plus className="mr-2 h-4 w-4" />
              Añadir correo de Hostinger
            </Button>
          }
        />

        {catalog.isLoading ? <AdminLoading label="Cargando correos…" /> : null}
        {catalog.isError ? (
          <AdminError title="No se pudieron cargar los correos" onRetry={() => catalog.refetch()} />
        ) : null}

        {!catalog.isLoading && !catalog.isError ? (
          <AdminTable>
            <AdminTableHeader>
              <AdminTableRow>
                <AdminTableHead>Uso</AdminTableHead>
                <AdminTableHead>Correo de Hostinger</AdminTableHead>
                <AdminTableHead>Estado</AdminTableHead>
                <AdminTableHead className="text-right"> </AdminTableHead>
              </AdminTableRow>
            </AdminTableHeader>
            <AdminTableBody>
              {PURPOSES.map((item) => {
                const row = byRole[item.role];
                return (
                  <AdminTableRow key={item.role}>
                    <AdminTableCell>
                      <div className="font-medium">{item.title}</div>
                      <p className="text-xs text-muted-foreground">{item.hint}</p>
                    </AdminTableCell>
                    <AdminTableCell>
                      {row?.address ? (
                        <div>
                          <div>{row.address}</div>
                          {row.displayName ? (
                            <p className="text-xs text-muted-foreground">{row.displayName}</p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Sin registrar</span>
                      )}
                    </AdminTableCell>
                    <AdminTableCell>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">
                        {row?.configured ? "Listo" : "Falta"}
                      </span>
                    </AdminTableCell>
                    <AdminTableCell className="text-right">
                      <Button variant="outline" className="rounded-none" size="sm" onClick={() => openAdd(item.role)}>
                        {row?.address ? (
                          <>
                            <Pencil className="mr-1.5 h-3.5 w-3.5" />
                            Cambiar
                          </>
                        ) : (
                          <>
                            <Plus className="mr-1.5 h-3.5 w-3.5" />
                            Añadir
                          </>
                        )}
                      </Button>
                    </AdminTableCell>
                  </AdminTableRow>
                );
              })}
            </AdminTableBody>
          </AdminTable>
        ) : null}

        {!catalog.isLoading && !catalog.isError && catalog.data?.ready ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {catalog.data.source === "app"
              ? "Los tres correos de Hostinger ya están registrados en la administración."
              : "El envío usa las variables del servidor. Puedes sustituirlas añadiendo los buzones aquí."}
          </p>
        ) : null}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="rounded-none sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Añadir correo de Hostinger</DialogTitle>
              <DialogDescription>
                Pega el buzón que ya existe en hPanel. El usuario SMTP es el mismo correo.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Este correo es para</Label>
                <Select
                  value={form.role}
                  onValueChange={(value) => {
                    const role = value as MailboxRole;
                    const row = byRole[role];
                    setForm((currentForm) => ({
                      ...currentForm,
                      role,
                      address: row?.address || currentForm.address,
                      displayName: row?.displayName || currentForm.displayName,
                      smtpHost: row?.smtpHost || currentForm.smtpHost,
                      smtpPort: String(row?.smtpPort || currentForm.smtpPort),
                    }));
                  }}
                >
                  <SelectTrigger className="mt-1 rounded-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PURPOSES.map((item) => (
                      <SelectItem key={item.role} value={item.role}>
                        {item.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Nombre para mostrar</Label>
                <Input
                  className="mt-1 rounded-none"
                  value={form.displayName}
                  onChange={(event) => setForm((currentForm) => ({ ...currentForm, displayName: event.target.value }))}
                  placeholder="Mallorca"
                />
              </div>
              <div>
                <Label>Correo</Label>
                <Input
                  className="mt-1 rounded-none"
                  type="email"
                  value={form.address}
                  onChange={(event) => setForm((currentForm) => ({ ...currentForm, address: event.target.value }))}
                  placeholder={purpose.example}
                />
              </div>
              {purpose.needsPassword ? (
                <div>
                  <Label>Contraseña del buzón</Label>
                  <Input
                    className="mt-1 rounded-none"
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm((currentForm) => ({ ...currentForm, password: event.target.value }))}
                    placeholder={
                      current?.passwordConfigured
                        ? "Dejar vacío para conservar la guardada"
                        : "La de Hostinger, no la de hPanel"
                    }
                    autoComplete="new-password"
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Este buzón no necesita contraseña SMTP.</p>
              )}
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() => setAdvanced((value) => !value)}
              >
                {advanced ? "Ocultar SMTP" : "Ajustes SMTP de Hostinger"}
              </button>
              {advanced ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Servidor</Label>
                    <Input
                      className="mt-1 rounded-none"
                      value={form.smtpHost}
                      onChange={(event) => setForm((currentForm) => ({ ...currentForm, smtpHost: event.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Puerto</Label>
                    <Input
                      className="mt-1 rounded-none"
                      inputMode="numeric"
                      value={form.smtpPort}
                      onChange={(event) => setForm((currentForm) => ({ ...currentForm, smtpPort: event.target.value }))}
                    />
                  </div>
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="outline" className="rounded-none" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button className="rounded-none" disabled={save.isPending} onClick={submit}>
                Guardar correo
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AdminPageShell>
    </AdminLayout>
  );
}
