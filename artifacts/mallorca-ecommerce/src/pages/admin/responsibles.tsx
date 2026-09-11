import { AdminLayout } from "@/components/layout/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  useListAdminUsers, useListAdminBranches, useListCategories,
  useListBranchAssignments, useCreateBranchAssignment, useDeleteBranchAssignment,
  useListCategoryResponsibles, useUpsertCategoryResponsible, useDeleteCategoryResponsible,
  getListBranchAssignmentsQueryKey, getListCategoryResponsiblesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

function errorMessage(error: unknown) {
  const e = error as { error?: string; message?: string };
  return e?.error || e?.message || "La operación no pudo completarse.";
}
export default function AdminResponsibles() {
 const {toast}=useToast(); const qc=useQueryClient();
 const users=useListAdminUsers(); const branches=useListAdminBranches(); const categories=useListCategories();
 const [branchId,setBranchId]=useState<number>(); const [userId,setUserId]=useState("");
 const assignments=useListBranchAssignments(branchId || 0,{query:{queryKey:getListBranchAssignmentsQueryKey(branchId || 0),enabled:!!branchId}});
 const create=useCreateBranchAssignment(); const remove=useDeleteBranchAssignment();
 const [catBranch,setCatBranch]=useState<number>(); const [catId,setCatId]=useState<number>(); const [catUser,setCatUser]=useState("");
 const responsibles=useListCategoryResponsibles({branchId:catBranch},{query:{queryKey:getListCategoryResponsiblesQueryKey({branchId:catBranch}),enabled:!!catBranch}});
 const upsert=useUpsertCategoryResponsible(); const delCat=useDeleteCategoryResponsible();
 const run=async(fn:()=>Promise<unknown>,success:string,refresh:()=>void)=>{try{await fn();toast({title:success});refresh()}catch(e){toast({title:errorMessage(e),variant:"destructive"})}};
 return <AdminLayout><div className="p-6 md:p-10 space-y-6 overflow-auto"><div><h1 className="text-3xl font-bold">Responsables</h1><p className="text-muted-foreground">Asigna usuarios a sucursales y categorías.</p></div>
 <Card><CardHeader><CardTitle>Usuarios por sucursal</CardTitle></CardHeader><CardContent className="space-y-4">
  <div className="grid gap-3 sm:grid-cols-3"><select className="h-9 rounded-md border bg-background px-3 text-sm" value={branchId??""} onChange={e=>setBranchId(e.target.value?Number(e.target.value):undefined)}><option value="">Selecciona sucursal</option>{branches.data?.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><select className="h-9 rounded-md border bg-background px-3 text-sm" value={userId} onChange={e=>setUserId(e.target.value)}><option value="">Selecciona usuario</option>{users.data?.map(u=><option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</select><Button disabled={!branchId||!userId} onClick={()=>run(()=>create.mutateAsync({id:branchId!,data:{userId}}),"Usuario asignado",()=>qc.invalidateQueries({queryKey:getListBranchAssignmentsQueryKey(branchId!)}))}>Asignar</Button></div>
  {branchId&&<div className="divide-y">{assignments.data?.map((a:any,i)=><div className="flex justify-between py-2 text-sm" key={a.id??a.userId??i}><span>{a.name||a.email||a.userId||JSON.stringify(a)}</span>{a.userId&&<Button variant="ghost" size="sm" onClick={()=>run(()=>remove.mutateAsync({id:branchId,userId:a.userId}),"Asignación eliminada",()=>qc.invalidateQueries({queryKey:getListBranchAssignmentsQueryKey(branchId)}))}>Quitar</Button>}</div>)}</div>}
 </CardContent></Card>
 <Card><CardHeader><CardTitle>Responsables de categoría</CardTitle></CardHeader><CardContent className="space-y-4">
  <div className="grid gap-3 sm:grid-cols-4"><select className="h-9 rounded-md border bg-background px-3 text-sm" value={catBranch??""} onChange={e=>setCatBranch(e.target.value?Number(e.target.value):undefined)}><option value="">Sucursal</option>{branches.data?.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select><select className="h-9 rounded-md border bg-background px-3 text-sm" value={catId??""} onChange={e=>setCatId(e.target.value?Number(e.target.value):undefined)}><option value="">Categoría</option>{categories.data?.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select className="h-9 rounded-md border bg-background px-3 text-sm" value={catUser} onChange={e=>setCatUser(e.target.value)}><option value="">Usuario</option>{users.data?.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select><Button disabled={!catBranch||!catId||!catUser} onClick={()=>run(()=>upsert.mutateAsync({data:{branchId:catBranch!,categoryId:catId!,userId:catUser}}),"Responsable guardado",()=>qc.invalidateQueries({queryKey:getListCategoryResponsiblesQueryKey({branchId:catBranch})}))}>Guardar</Button></div>
  {catBranch && <div className="divide-y">{responsibles.data?.map((r: any, i: number) => <div className="flex justify-between py-2 text-sm" key={r.id ?? i}><span>{r.categoryName || r.categoryId} · {r.userName || r.userEmail || r.userId}</span>{r.id && <Button variant="ghost" size="sm" onClick={() => run(async () => { await delCat.mutateAsync({ id: r.id }); }, "Responsable eliminado", () => qc.invalidateQueries({ queryKey: getListCategoryResponsiblesQueryKey({ branchId: catBranch }) }))}>Eliminar</Button>}</div>)}</div>}
 </CardContent></Card>
 </div></AdminLayout>
}