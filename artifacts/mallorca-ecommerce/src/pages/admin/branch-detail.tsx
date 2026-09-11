import { AdminLayout } from "@/components/layout/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGetAdminBranch } from "@workspace/api-client-react";
import { useParams } from "wouter";
import { useState } from "react";

const tabs = ["General","Contacto","Horarios","Productos","Inventario","Pedidos","Alertas","Configuración"] as const;
const dataKeys = ["general","contact","hours","products","inventory","orders","alerts","notificationSettings"] as const;
export default function AdminBranchDetail() {
  const { id } = useParams<{id:string}>();
  const query = useGetAdminBranch(Number(id));
  const [tab,setTab] = useState(0);
  const value = query.data?.[dataKeys[tab]];
  return <AdminLayout><div className="p-6 md:p-10 space-y-6 overflow-auto">
    {query.isLoading ? <p>Cargando sucursal...</p> : query.error ? <p className="text-destructive">No se pudo cargar la sucursal.</p> : query.data && <>
      <div><h1 className="text-3xl font-bold">{query.data.branch.name}</h1><p className="text-muted-foreground">{query.data.branch.address} · {query.data.branch.phone}</p></div>
      <div className="flex gap-1 overflow-x-auto border-b">{tabs.map((name,i)=><button key={name} onClick={()=>setTab(i)} className={`whitespace-nowrap px-3 py-2 text-sm ${tab===i?"border-b-2 border-primary text-primary font-medium":"text-muted-foreground"}`}>{name}</button>)}</div>
      <Card><CardHeader><CardTitle>{tabs[tab]}</CardTitle></CardHeader><CardContent>
        {Array.isArray(value) ? (value.length ? <div className="grid gap-3 md:grid-cols-2">{value.map((row,i)=><pre key={i} className="rounded bg-muted p-3 text-xs whitespace-pre-wrap">{JSON.stringify(row,null,2)}</pre>)}</div> : <p className="text-muted-foreground">Sin datos.</p>) : <pre className="rounded bg-muted p-4 text-sm whitespace-pre-wrap">{JSON.stringify(value ?? {},null,2)}</pre>}
      </CardContent></Card>
    </>}
  </div></AdminLayout>;
}