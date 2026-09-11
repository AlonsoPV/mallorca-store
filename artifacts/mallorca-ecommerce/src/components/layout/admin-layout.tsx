import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Package, LayoutDashboard, FilePlus, LogOut, ShoppingCart, Boxes, Upload, Store, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetMe, useListInventoryAlerts } from "@workspace/api-client-react";
import { useClerk } from "@clerk/react";

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: user, isLoading } = useGetMe();
  const { signOut } = useClerk();
  const { data: alerts } = useListInventoryAlerts();

  const navItems = [
    { href: "/admin", label: "Resumen", icon: LayoutDashboard },
    { href: "/admin/productos", label: "Productos", icon: Package },
    { href: "/admin/productos/nuevo", label: "Nuevo Producto", icon: FilePlus },
    { href: "/admin/pedidos", label: "Pedidos", icon: ShoppingCart },
    { href: "/admin/inventario", label: "Inventario", icon: Boxes },
    { href: "/admin/importar", label: "Importar", icon: Upload },
    { href: "/admin/sucursales", label: "Sucursales", icon: Store },
    { href: "/admin/alertas", label: "Alertas", icon: Bell },
  ];

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-muted-foreground font-serif">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user || !["staff", "branch_manager", "operations_manager", "operations", "manager", "admin"].includes(user.role)) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-4 text-center">
        <h1 className="text-4xl font-serif text-foreground mb-4">Acceso Denegado</h1>
        <p className="text-muted-foreground mb-8">No tienes permisos para acceder a la administración.</p>
        <div className="flex gap-4">
          <Link href="/">
            <span className="px-6 py-2 bg-primary text-primary-foreground font-medium cursor-pointer">Volver a Tienda</span>
          </Link>
          <button onClick={() => signOut({ redirectUrl: "/" })} className="px-6 py-2 border border-border text-foreground hover:bg-muted font-medium cursor-pointer">
            Cerrar Sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-muted/30">
      {/* Admin Sidebar */}
      <aside className="w-full md:w-64 bg-background border-r border-border flex-shrink-0 flex flex-col sticky top-0 md:h-[100dvh]">
        <div className="h-16 flex items-center px-6 border-b border-border bg-foreground text-background">
          <Link href="/" className="font-serif text-xl font-bold tracking-tight flex items-center gap-2">
            MALLORCA <span className="font-sans text-xs font-normal opacity-70 mt-1">ADMIN</span>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 mt-2 px-2">
            Gestión
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/admin" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <span className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer",
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-foreground/70 hover:bg-muted hover:text-foreground"
                )}>
                  <Icon className="h-4 w-4" />
                   {item.label}{item.href === "/admin/alertas" && alerts?.length ? <span className="ml-auto rounded-full bg-destructive px-2 py-0.5 text-[10px] text-destructive-foreground">{alerts.length}</span> : null}
                </span>
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-border mt-auto">
          <button onClick={() => signOut({ redirectUrl: "/" })} className="w-full">
            <span className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer">
              <LogOut className="h-4 w-4" />
              Cerrar Sesión
            </span>
          </button>
        </div>
      </aside>

      {/* Admin Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
