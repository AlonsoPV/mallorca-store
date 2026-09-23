import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Save, LockKeyhole } from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";
import { AdminLayout } from "@/components/layout/admin-layout";
import { AdminPageShell, AdminPageHeader, AdminLoading, AdminError } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { accessKey, customFetch, modules, roles, type Policy, type RoleAccessResponse } from "@/lib/role-access";

export default function AdminRoles() {
  const me = useGetMe();
  const canManage = me.data?.role === "admin";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState("staff");
  const [draft, setDraft] = useState<RoleAccessResponse | null>(null);
  const query = useQuery({ queryKey: [...accessKey, "roles"], queryFn: () => customFetch<RoleAccessResponse>("/api/admin/access/roles"), enabled: canManage, retry: 1 });
  const current = draft ?? query.data;
  const policy = current?.policy;
  const changed = !!draft && JSON.stringify(draft.policy) !== JSON.stringify(query.data?.policy);
  const role = roles.find(r => r.id === selected)!;
  const locked = selected === "admin";
  const save = useMutation({
    mutationFn: (value: RoleAccessResponse) => customFetch<RoleAccessResponse>("/api/admin/access/roles", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ policy: value.policy, version: value.version }) }),
    onSuccess: (result) => {
      qc.setQueryData([...accessKey, "roles"], result);
      setDraft(null);
      void qc.invalidateQueries({ queryKey: accessKey });
      toast({ title: "Accesos guardados", description: "La configuración se aplica a todos los usuarios de cada rol." });
    },
    onError: (error: Error) => toast({ title: "No se pudieron guardar los accesos", description: error.message, variant: "destructive" }),
  });
  useEffect(() => {
    if (!changed) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);
  function update(values: Record<string, boolean>) {
    if (!current || locked || save.isPending) return;
    setDraft({ ...current, policy: { ...current.policy, [selected]: { ...current.policy[selected], ...values } } as Policy });
  }
  const enabledCount = modules.filter(m => policy?.[selected]?.[m.id]).length;
  return <AdminLayout><AdminPageShell>
    <AdminPageHeader title="Roles y accesos" description="Define qué módulos puede utilizar cada rol del equipo." actions={<Button disabled={!canManage || !changed || save.isPending} onClick={() => current && save.mutate(current)}><Save className="mr-2 h-4 w-4" />{save.isPending ? "Guardando…" : "Guardar cambios"}</Button>} />
    {!canManage ? <p role="alert" className="border p-6">Solo Admin puede configurar los accesos de los roles.</p> : query.isLoading ? <AdminLoading /> : query.isError ? <AdminError title="No se pudo cargar la configuración de accesos" onRetry={() => query.refetch()} /> : policy ? <>
      <div className="flex items-start gap-3 border bg-muted/30 p-4 text-sm"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-medium">Acceso por módulo</p><p className="mt-1 text-muted-foreground">Los cambios afectan a todos los usuarios del rol. Se mantienen los límites de sucursal y las autorizaciones de edición existentes. Pedidos y agenda comparten acceso; catálogo, inventario e importaciones también.</p></div></div>
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <nav aria-label="Roles del equipo" className="space-y-2">
          {roles.map(item => <button key={item.id} type="button" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)} className={`flex w-full items-center justify-between gap-3 border p-4 text-left text-sm ${selected === item.id ? "border-primary bg-primary/5 text-primary" : "bg-background hover:bg-muted"}`}><span className="font-medium">{item.label}</span><span className="shrink-0 text-xs">{modules.filter(m => policy[item.id]?.[m.id]).length}/{modules.length}</span></button>)}
        </nav>
        <section className="border bg-background" aria-label={`Accesos de ${role.label}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h2 className="text-xl font-semibold">{role.label}</h2><p className="mt-1 text-sm text-muted-foreground">{enabledCount} de {modules.length} módulos habilitados</p></div>{locked ? <span className="inline-flex items-center gap-2 text-sm"><LockKeyhole className="h-4 w-4" />Acceso completo protegido</span> : <div className="flex gap-2"><Button variant="outline" size="sm" disabled={save.isPending} onClick={() => update(Object.fromEntries(modules.map(m => [m.id, true])))}>Habilitar todos</Button><Button variant="outline" size="sm" disabled={save.isPending} onClick={() => update(Object.fromEntries(modules.map(m => [m.id, false])))}>Deshabilitar todos</Button></div>}</div>
          <div className="divide-y">{modules.map(module => <div key={module.id} className="flex items-center justify-between gap-6 p-5"><div><label htmlFor={`access-${module.id}`} className="cursor-pointer text-sm font-medium">{module.label}</label><p className="mt-1 text-sm text-muted-foreground">{module.description}</p></div><Switch id={`access-${module.id}`} aria-label={`${module.label} para ${role.label}`} checked={policy[selected]?.[module.id] === true} disabled={locked || save.isPending} onCheckedChange={checked => update({ [module.id]: checked })} /></div>)}</div>
          {locked && <p className="border-t bg-muted/30 p-5 text-sm text-muted-foreground">Admin conserva todos los accesos y es el único rol que puede administrar esta pantalla.</p>}
        </section>
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border bg-background p-4 shadow-sm"><p role="status" className="text-sm text-muted-foreground">{changed ? "Tienes cambios sin guardar." : query.data?.updatedAt ? `Última actualización: ${new Date(query.data.updatedAt).toLocaleString("es-MX")}` : "Configuración inicial: se conservan los accesos existentes."}</p><div className="flex gap-2"><Button variant="outline" disabled={!changed || save.isPending} onClick={() => { setDraft(null); void query.refetch(); }}>Descartar cambios</Button><Button disabled={!changed || save.isPending} onClick={() => current && save.mutate(current)}>{save.isPending ? "Guardando…" : "Guardar accesos"}</Button></div></div>
    </> : null}
  </AdminPageShell></AdminLayout>;
}
