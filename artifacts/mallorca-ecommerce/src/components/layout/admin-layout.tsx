import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Package, LayoutDashboard, MapPin, Store, LogOut, FilePlus } from "lucide-react";
import { cn } from "@/lib/utils";

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/admin", label: "Resumen", icon: LayoutDashboard },
    { href: "/admin/productos", label: "Productos", icon: Package },
    { href: "/admin/productos/nuevo", label: "Nuevo Producto", icon: FilePlus },
  ];

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
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-border mt-auto">
          <Link href="/">
            <span className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer">
              <LogOut className="h-4 w-4" />
              Volver a Tienda
            </span>
          </Link>
        </div>
      </aside>

      {/* Admin Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}