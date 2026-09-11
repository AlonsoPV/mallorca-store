import { AdminLayout } from "@/components/layout/admin-layout";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useGetBranchReport } from "@workspace/api-client-react";
import { useState } from "react";
export default function AdminReports() {
 const [from,setFrom]=useState(""); const [to,setTo]=useState("");
 const q=useGetBranchReport({from:from||undefined,to:to||undefined});
 return <AdminLayout><div className="p-6 md:p-10 space-y-6 overflow-auto"><div><h1 className="text-3xl font-bold">Reportes</h1><p className="text-muted-foreground">Compara el desempeño de tus sucursales.</p></div>
 <Card><CardHeader><CardTitle>Periodo</CardTitle></CardHeader><CardContent><div className="grid gap-4 sm:grid-cols-2 max-w-xl"><label className="text-sm">Desde<Input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="text-sm">Hasta<Input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div></CardContent></Card>
 {q.isLoading?<p>Cargando reporte...</p>:q.error?<p className="text-destructive">No se pudo cargar el reporte.</p>:<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{q.data?.map(r=><Card key={r.branchId}><CardHeader><CardTitle>{r.branchName}</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3 text-sm"><Metric l="Pedidos" v={r.orderCount}/><Metric l="Ingresos" v={`$${r.revenue}`}/><Metric l="Inventario" v={r.inventoryCount}/><Metric l="Valor inventario" v={`$${r.inventoryValue}`}/><Metric l="Stock bajo" v={r.lowStockCount}/><Metric l="Agotados" v={r.outOfStockCount}/></CardContent></Card>)}</div>}</div></AdminLayout>
}
function Metric({l,v}:{l:string;v:React.ReactNode}){return <div><p className="text-muted-foreground">{l}</p><p className="font-semibold text-lg">{v}</p></div>}