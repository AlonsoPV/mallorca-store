import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  FilePenLine,
  LayoutDashboard,
  Package,
  Settings2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const BRANCH_WORKSPACE_TABS = [
  { key: "resumen", label: "Resumen", icon: LayoutDashboard, group: "ops" },
  { key: "pedidos", label: "Pedidos", icon: ClipboardList, group: "ops" },
  { key: "productos", label: "Productos", icon: Package, group: "ops" },
  { key: "alertas", label: "Alertas", icon: Bell, group: "ops" },
  { key: "horarios", label: "Horarios", icon: Clock3, group: "admin" },
  { key: "equipo", label: "Equipo", icon: Users, group: "admin" },
  { key: "configuracion", label: "Configuración", icon: Settings2, group: "admin" },
  { key: "ficha", label: "Ficha", icon: FilePenLine, group: "ficha" },
] as const;

export type BranchWorkspaceTabKey = (typeof BRANCH_WORKSPACE_TABS)[number]["key"];
export type BranchPedidosVista = "lista" | "agenda";

const TAB_ALIASES: Record<string, BranchWorkspaceTabKey> = {
  agenda: "pedidos",
  inventario: "productos",
};

function searchParams(search: string) {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}

export function branchWorkspaceHref(
  branchId: number,
  tab: BranchWorkspaceTabKey,
  extra?: string | { seccion?: string; vista?: string },
) {
  const opts = typeof extra === "string" ? { seccion: extra } : extra ?? {};
  if (tab === "ficha") {
    return opts.seccion
      ? `/admin/sucursales/${branchId}/editar?seccion=${opts.seccion}`
      : `/admin/sucursales/${branchId}/editar`;
  }
  const params = new URLSearchParams();
  if (tab !== "resumen") params.set("tab", tab);
  if (opts.vista) params.set("vista", opts.vista);
  const query = params.toString();
  return query ? `/admin/sucursales/${branchId}?${query}` : `/admin/sucursales/${branchId}`;
}

export function branchTabFromSearch(search: string): Exclude<BranchWorkspaceTabKey, "ficha"> {
  const raw = searchParams(search).get("tab");
  const key = raw ? (TAB_ALIASES[raw] ?? raw) : "resumen";
  if (key && key !== "ficha" && BRANCH_WORKSPACE_TABS.some((item) => item.key === key)) {
    return key as Exclude<BranchWorkspaceTabKey, "ficha">;
  }
  return "resumen";
}

export function branchPedidosVistaFromSearch(search: string): BranchPedidosVista {
  const params = searchParams(search);
  if (params.get("tab") === "agenda" || params.get("vista") === "agenda") return "agenda";
  return "lista";
}

export function BranchWorkspaceNav({
  branchId,
  active,
  ordersToday = 0,
  alertsOpen = 0,
}: {
  branchId: number;
  active: BranchWorkspaceTabKey;
  ordersToday?: number;
  alertsOpen?: number;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateScrollState();
    const onScroll = () => updateScrollState();
    el.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    const onWheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      el.scrollLeft += event.deltaY;
      event.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    const selected = el?.querySelector<HTMLElement>('[aria-current="page"]');
    selected?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [active]);

  const scrollByPage = (direction: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(180, el.clientWidth * 0.7), behavior: "smooth" });
  };

  const overflowing = canScrollLeft || canScrollRight;

  return (
    <div className="sticky top-0 z-10 -mx-1 flex items-center gap-1 bg-muted/30 px-1 py-1">
      {overflowing ? (
        <button
          type="button"
          onClick={() => scrollByPage(-1)}
          disabled={!canScrollLeft}
          aria-label="Ver secciones anteriores"
          className="inline-flex h-10 w-8 shrink-0 items-center justify-center bg-background text-foreground disabled:text-muted-foreground/40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      ) : null}
      <nav
        ref={scrollerRef}
        aria-label="Secciones de la sucursal"
        className="flex min-w-0 flex-1 gap-1 overflow-x-auto scroll-smooth py-0.5 [scrollbar-width:thin]"
      >
        {BRANCH_WORKSPACE_TABS.map((item, i) => {
          const Icon = item.icon;
          const selected = active === item.key;
          const showDivider = i > 0 && BRANCH_WORKSPACE_TABS[i - 1].group !== item.group;
          const badge =
            item.key === "alertas" && alertsOpen > 0
              ? alertsOpen
              : item.key === "pedidos" && ordersToday > 0
                ? ordersToday
                : null;
          return (
            <div key={item.key} className="flex shrink-0 items-center gap-1">
              {showDivider ? (
                <span className="mx-0.5 h-6 w-px shrink-0 bg-border" aria-hidden />
              ) : null}
              <Link
                href={branchWorkspaceHref(branchId, item.key)}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center gap-2 px-3 text-sm font-medium whitespace-nowrap transition-colors",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span>{item.label}</span>
                {badge != null ? (
                  <span
                    className={cn(
                      "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums",
                      selected
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-amber-100 text-amber-900",
                    )}
                  >
                    {badge}
                  </span>
                ) : null}
              </Link>
            </div>
          );
        })}
      </nav>
      {overflowing ? (
        <button
          type="button"
          onClick={() => scrollByPage(1)}
          disabled={!canScrollRight}
          aria-label="Ver más secciones"
          className="inline-flex h-10 w-8 shrink-0 items-center justify-center bg-background text-foreground disabled:text-muted-foreground/40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
