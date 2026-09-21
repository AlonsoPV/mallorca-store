import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Package,
  LayoutDashboard,
  LogOut,
  ShoppingCart,
  Boxes,
  Upload,
  Store,
  Bell,
  BarChart3,
  Users,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetMe, useListInventoryAlerts } from "@workspace/api-client-react";
import { useAppSignOut } from "@/lib/app-auth";

const primaryNav = [
  { href: "/admin", label: "Inicio", icon: LayoutDashboard },
  { href: "/admin/pedidos", label: "Pedidos", icon: ShoppingCart },
  { href: "/admin/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/admin/productos", label: "Productos", icon: Package },
  { href: "/admin/inventario", label: "Inventario", icon: Boxes },
  { href: "/admin/sucursales", label: "Sucursales", icon: Store },
  { href: "/admin/alertas", label: "Alertas", icon: Bell },
];

const configNav = [
  { href: "/admin/usuarios", label: "Usuarios", icon: Users },
  { href: "/admin/formas-de-pago", label: "Formas de pago", icon: CreditCard },
  { href: "/admin/importar", label: "Importar", icon: Upload },
  { href: "/admin/reportes", label: "Reportes", icon: BarChart3 },
];

function NavLink({
  href,
  label,
  icon: Icon,
  location,
  badge,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  location: string;
  badge?: number;
}) {
  const isActive = location === href || (href !== "/admin" && location.startsWith(href));
  return (
    <Link href={href}>
      <span
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-foreground/70 hover:bg-muted hover:text-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1">{label}</span>
        {badge != null && badge > 0 ? (
          <span className="text-[10px] bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded-full">
            {badge}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: user, isLoading } = useGetMe();
  const signOut = useAppSignOut();
  const { data: alerts } = useListInventoryAlerts({ status: "OPEN" });
  const [configOpen, setConfigOpen] = useState(() =>
    configNav.some((item) => location.startsWith(item.href)),
  );
  const alertCount = Array.isArray(alerts) ? alerts.length : 0;

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

  if (
    !user ||
    !["staff", "branch_manager", "operations_manager", "operations", "manager", "admin"].includes(
      user.role,
    )
  ) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-4 text-center">
        <h1 className="text-4xl font-serif text-foreground mb-4">Acceso Denegado</h1>
        <p className="text-muted-foreground mb-8">
          No tienes permisos para acceder a la administración.
        </p>
        <div className="flex gap-4">
          <Link href="/">
            <span className="px-6 py-2 bg-primary text-primary-foreground font-medium cursor-pointer">
              Volver a Tienda
            </span>
          </Link>
          <button
            onClick={() => signOut({ redirectUrl: "/" })}
            className="px-6 py-2 border border-border text-foreground hover:bg-muted font-medium cursor-pointer"
          >
            Cerrar Sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-muted/30">
      <aside className="w-full md:w-64 bg-background border-r border-border flex-shrink-0 flex flex-col sticky top-0 md:h-[100dvh]">
        <div className="h-16 flex items-center px-6 border-b border-border bg-foreground text-background">
          <Link
            href="/"
            className="font-serif text-xl font-bold tracking-tight flex items-center gap-2"
          >
            MALLORCA{" "}
            <span className="font-sans text-xs font-normal opacity-70 mt-1">ADMIN</span>
          </Link>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4 mt-2 px-2">
            Operación
          </div>
          {primaryNav.map((item) => (
            <NavLink
              key={item.href}
              {...item}
              location={location}
              badge={item.href === "/admin/alertas" ? alertCount : undefined}
            />
          ))}

          <button
            type="button"
            onClick={() => setConfigOpen((open) => !open)}
            className="w-full flex items-center gap-2 px-2 pt-6 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
          >
            {configOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Más / Configuración
          </button>
          {configOpen
            ? configNav.map((item) => (
                <NavLink key={item.href} {...item} location={location} />
              ))
            : null}
        </nav>

        <div className="p-4 border-t border-border">
          <button
            onClick={() => signOut({ redirectUrl: "/" })}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-md text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">{children}</main>
    </div>
  );
}
