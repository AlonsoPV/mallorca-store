import { useRoleAccess, pageModule } from "@/lib/role-access";
import { ReactNode, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Package,
  LayoutDashboard,
  LogOut,
  ShoppingCart,
  Upload,
  Store,
  Bell,
  BarChart3,
  Users,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CreditCard,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetMe, useListInventoryAlerts, getListInventoryAlertsQueryKey } from "@workspace/api-client-react";
import { useAppSignOut } from "@/lib/app-auth";

const primaryNav = [
  { href: "/admin", label: "Inicio", icon: LayoutDashboard },
  { href: "/admin/pedidos", label: "Pedidos", icon: ShoppingCart },
  { href: "/admin/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/admin/productos", label: "Productos e inventario", icon: Package },
  { href: "/admin/sucursales", label: "Sucursales", icon: Store },
  { href: "/admin/alertas", label: "Alertas", icon: Bell },
];

const configNav = [
  { href: "/admin/roles", label: "Roles y accesos", icon: ShieldCheck },
  { href: "/admin/usuarios", label: "Usuarios", icon: Users },
  { href: "/admin/formas-de-pago", label: "Formas de pago", icon: CreditCard },
  { href: "/admin/importar", label: "Importar", icon: Upload },
  { href: "/admin/reportes", label: "Reportes", icon: BarChart3 },
];

function shortLabel(label: string) {
  if (label.startsWith("Productos")) return "Productos";
  if (label.startsWith("Formas")) return "Pagos";
  return label.split(" ")[0] ?? label;
}

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
          "relative flex shrink-0 cursor-pointer items-center rounded-md font-medium transition-colors",
          "flex-col gap-0.5 px-2.5 py-2 text-[10px]",
          "md:flex-row md:gap-3 md:px-3 md:py-2.5 md:text-sm",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-foreground/70 hover:bg-muted hover:text-foreground",
        )}
        title={label}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="max-w-[4.25rem] truncate text-center md:max-w-none md:flex-1 md:text-left">
          <span className="md:hidden">{shortLabel(label)}</span>
          <span className="hidden md:inline">{label}</span>
        </span>
        {badge != null && badge > 0 ? (
          <span className="absolute right-0.5 top-0.5 rounded-full bg-destructive px-1 py-0.5 text-[9px] text-destructive-foreground md:static md:px-1.5 md:text-[10px]">
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
  const access = useRoleAccess(!!user);
  const visible = (item: { href: string }) => user?.role === "admin" || (pageModule(item.href) !== "roles" && access.data?.modules[pageModule(item.href) ?? ""] === true);
  const signOut = useAppSignOut();
  const { data: alerts } = useListInventoryAlerts({ status: "OPEN" }, { query: { queryKey: getListInventoryAlertsQueryKey({ status: "OPEN" }), enabled: user?.role === "admin" || access.data?.modules.alerts === true || access.data?.modules.products === true } });
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
    <div className="flex min-h-[100dvh] flex-col bg-muted/30 md:flex-row">
      <aside className="sticky top-0 z-30 flex w-full flex-shrink-0 flex-col border-b border-border bg-background md:h-[100dvh] md:w-64 md:border-b-0 md:border-r">
        <div className="flex h-14 items-center justify-between border-b border-border bg-foreground px-4 text-background sm:h-16 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 font-serif text-lg font-bold tracking-tight sm:text-xl"
          >
            MALLORCA{" "}
            <span className="mt-0.5 font-sans text-[10px] font-normal opacity-70 sm:mt-1 sm:text-xs">ADMIN</span>
          </Link>
          <button
            type="button"
            onClick={() => signOut({ redirectUrl: "/" })}
            className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium opacity-80 transition-opacity hover:opacity-100 md:hidden"
            aria-label="Cerrar Sesión"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex gap-1 overflow-x-auto p-2 md:flex-1 md:flex-col md:space-y-1 md:overflow-y-auto md:p-4">
          <div className="mb-4 mt-2 hidden px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:block">
            Operación
          </div>
          {primaryNav.filter(visible).map((item) => (
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
            className="hidden w-full items-center gap-2 px-2 pb-2 pt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:flex"
          >
            {configOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Más / Configuración
          </button>
          <div className="hidden md:block">
            {configOpen
              ? configNav.filter(visible).map((item) => (
                  <NavLink key={item.href} {...item} location={location} />
                ))
              : null}
          </div>
          <div className="flex gap-1 md:hidden">
            {configNav.filter(visible).map((item) => (
              <NavLink key={item.href} {...item} location={location} />
            ))}
          </div>
        </nav>

        <div className="hidden border-t border-border p-4 md:block">
          <button
            onClick={() => signOut({ redirectUrl: "/" })}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
    </div>
  );
}
