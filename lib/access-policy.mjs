export const roles = [
  { id: "staff", label: "Staff" },
  { id: "branch_manager", label: "Gerente de sucursal" },
  { id: "operations", label: "Operaciones" },
  { id: "operations_manager", label: "Gerente de operaciones" },
  { id: "manager", label: "Manager" },
  { id: "admin", label: "Admin" },
];
export const modules = [
  { id: "dashboard", label: "Inicio", description: "Indicadores y resumen operativo." },
  { id: "orders", label: "Pedidos y agenda", description: "Pedidos, cobros y programación de entregas." },
  { id: "products", label: "Productos e inventario", description: "Catálogo, existencias, promociones e importaciones." },
  { id: "branches", label: "Sucursales", description: "Configuración y operación de sucursales." },
  { id: "alerts", label: "Alertas", description: "Seguimiento y atención de alertas de inventario." },
  { id: "users", label: "Usuarios y asignaciones", description: "Directorio y responsables por sucursal o categoría." },
  { id: "payments", label: "Formas de pago", description: "Métodos y proveedores de pago." },
  { id: "reports", label: "Reportes", description: "Consulta de resultados por sucursal." },
];
export function defaultPolicy() {
  return Object.fromEntries(roles.map(({ id }) => [id, Object.fromEntries(modules.map(m => [m.id, true]))]));
}
export function validatePolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== roles.length) return false;
  return roles.every(({ id }) => {
    const row = value[id];
    return row && typeof row === "object" && !Array.isArray(row)
      && Object.keys(row).length === modules.length
      && modules.every(m => typeof row[m.id] === "boolean" && (id !== "admin" || row[m.id]));
  });
}
export function canAccess(policy, role, module) {
  if (!roles.some(r => r.id === role)) return false;
  if (module === "roles") return role === "admin";
  if (!modules.some(m => m.id === module)) return false;
  return role === "admin" || policy?.[role]?.[module] === true;
}
export function pageModule(path) {
  const segment = path.split("?")[0].split("/")[2] || "";
  return ({ "": "dashboard", pedidos: "orders", agenda: "orders", productos: "products", inventario: "products", importar: "products", sucursales: "branches", alertas: "alerts", usuarios: "users", responsables: "users", "formas-de-pago": "payments", reportes: "reports", roles: "roles" })[segment] || null;
}
export function apiModules(path, method = "GET") {
  const clean = path.replace(/^\/api/, "").replace(/\/+$/, "");
  if (clean.startsWith("/admin/access")) return ["roles"];
  if (/^\/admin\/branches\/[^/]+\/assignments/.test(clean) || clean.startsWith("/admin/category-responsibles") || clean.startsWith("/admin/users")) return ["users"];
  // Shared lookups used by selectors and order entry. Mutations stay module-gated.
  if (method === "GET" && clean === "/admin/branches") return modules.map(m => m.id);
  if (method === "GET" && /^\/admin\/products(?:\/\d+)?$/.test(clean)) return ["products", "orders"];
  if (clean.startsWith("/admin/inventory/alerts")) return ["alerts", "products"];
  if (/^\/admin\/(products|inventory|import-jobs)(\/|$)/.test(clean)) return ["products"];
  if (/^\/admin\/(orders|customers|coupons)(\/|$)/.test(clean)) return ["orders"];
  if (clean.startsWith("/admin/branches")) return ["branches"];
  if (clean.startsWith("/admin/payment-")) return method === "GET" && clean === "/admin/payment-methods" ? ["payments", "orders"] : ["payments"];
  if (clean.startsWith("/admin/reports")) return ["reports"];
  if (clean === "/admin/summary") return ["dashboard"];
  return [];
}
