import { Redirect, useSearch } from "wouter";
import { normalizeSearch } from "@/lib/admin-search-params";

/** Legacy /admin/agenda → Pedidos en vista Agenda. */
export default function AdminAgendaRedirect() {
  const search = useSearch();
  const params = new URLSearchParams(normalizeSearch(search));
  params.delete("view");
  const qs = params.toString();
  return <Redirect replace to={qs ? `/admin/pedidos?${qs}` : "/admin/pedidos"} />;
}
