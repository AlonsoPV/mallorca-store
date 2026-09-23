import { ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { ShoppingBag, Menu, X, User, Search, MapPin, ArrowUpRight, Instagram, Linkedin, Phone, Mail, MessageCircle, BriefcaseBusiness, FileText, Globe2, ChevronUp, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart-context";
import { BranchSelector } from "@/components/branch-selector";
import { FulfillmentSelector } from "@/components/fulfillment-selector";
import { MiniCart } from "@/components/mini-cart";
import { useGetCart, useGetMe, useListBranches, getGetCartQueryKey, getGetMeQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppAuth } from "@/lib/app-auth";
import { isCartNotFoundError } from "@/lib/cart-recovery";
import footerLogo from "@assets/MallorcaFooter_1789166205501.webp";

export function StoreLayout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isQuickLinksOpen, setIsQuickLinksOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const headerChromeRef = useRef<HTMLDivElement>(null);
  const { isSignedIn } = useAppAuth();
  const queryClient = useQueryClient();
  const { data: user } = useGetMe({ query: { enabled: !!isSignedIn, queryKey: getGetMeQueryKey() } });
  const { data: footerBranches } = useListBranches();
  
  const { cartId, openMiniCart, clearCartSession } = useCart();
  const { data: cart, isError: cartError, error: cartErrorValue } = useGetCart(cartId!, {
    query: {
      enabled: !!cartId,
      queryKey: getGetCartQueryKey(cartId!),
      retry: false,
    },
  });

  useEffect(() => {
    if (!cartId || !cartError) return;
    if (!isCartNotFoundError(cartErrorValue)) return;
    clearCartSession();
    queryClient.removeQueries({ queryKey: getGetCartQueryKey(cartId) });
  }, [cartId, cartError, cartErrorValue, clearCartSession, queryClient]);
  const toggleMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  const isAdmin = !!user && ["staff", "branch_manager", "operations_manager", "operations", "manager", "admin"].includes(user.role);
  const isHeroHeader = location === "/" && !isScrolled;

  const [isLargeHeader, setIsLargeHeader] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true,
  );

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      setIsLargeHeader(media.matches);
      if (media.matches) setIsMobileMenuOpen(false);
    };
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const chrome = headerChromeRef.current;
    if (!chrome) return;

    const publishHeight = () => {
      document.documentElement.style.setProperty(
        "--store-header-height",
        `${chrome.offsetHeight}px`,
      );
    };

    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(chrome);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--store-header-height");
    };
  }, [isHeroHeader, isLargeHeader, isScrolled]);

  useEffect(() => {
    const events = new EventSource("/api/catalog/events");
    const onChange = () => {
      void queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/products");
        },
      });
    };
    events.addEventListener("catalog-change", onChange);
    return () => {
      events.removeEventListener("catalog-change", onChange);
      events.close();
    };
  }, [queryClient]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = searchValue.trim();
    setLocation(query ? `/tienda?search=${encodeURIComponent(query)}` : "/tienda");
    setIsSearchOpen(false);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col overflow-x-hidden bg-background selection:bg-primary selection:text-white">
      <MiniCart />
      <header className={`${isHeroHeader ? "absolute text-white" : "sticky border-border/70 bg-background/90 text-foreground shadow-sm backdrop-blur-xl"} top-0 z-50 w-full border-b transition-all duration-300`}>
        <div ref={headerChromeRef}>
        <div className={`container mx-auto flex min-w-0 items-center gap-2 px-4 transition-all duration-300 md:gap-3 md:px-6 ${isScrolled ? "h-14" : "h-[4.5rem]"}`}>
          <div className="flex min-w-0 flex-1 items-center gap-3 lg:gap-6">
            <Link href="/" className={`group flex shrink-0 items-center gap-2 ${isHeroHeader ? "text-white" : "text-foreground"}`}>
              <span className="h-2 w-2 rounded-full bg-primary transition-transform group-hover:scale-150" />
              <span className="font-serif text-xl font-bold tracking-[-0.06em] sm:text-2xl">
                MALLORCA
              </span>
            </Link>
            <nav className={`hidden items-center gap-4 text-[0.65rem] font-bold tracking-[0.16em] xl:gap-7 xl:text-[0.68rem] xl:tracking-[0.18em] lg:flex ${isHeroHeader ? "text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.45)]" : "text-foreground"}`}>
              <Link href="/tienda" className={`transition-colors hover:text-primary ${location === "/tienda" ? "text-primary" : isHeroHeader ? "text-white" : "text-foreground"}`}>
                TIENDA
              </Link>
              <Link href="/tienda" className={`hidden transition-colors hover:text-primary xl:inline ${isHeroHeader ? "text-white" : "text-foreground"}`}>
                PASTELERÍA
              </Link>
              <Link href="/sucursales" className={`transition-colors hover:text-primary ${location === "/sucursales" ? "text-primary" : isHeroHeader ? "text-white" : "text-foreground"}`}>
                SUCURSALES
              </Link>
            </nav>
          </div>

          {isLargeHeader ? (
            <div className="ml-auto flex min-w-0 max-w-[42%] items-center justify-end gap-1 xl:max-w-none">
              <BranchSelector />
              <FulfillmentSelector />
            </div>
          ) : null}

          <div className="hidden shrink-0 items-center gap-0.5 md:flex">
            {isAdmin && (
              <Link href="/admin">
                <span className={`mr-2 cursor-pointer text-[0.65rem] font-bold tracking-widest transition-colors hover:text-primary ${isHeroHeader ? "text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.45)]" : "text-foreground"}`}>
                  ADMIN
                </span>
              </Link>
            )}
            <Button variant="ghost" size="icon" className={`hover:text-primary ${isHeroHeader ? "text-white hover:bg-white/10 hover:text-white" : "text-foreground"}`} onClick={() => setIsSearchOpen(true)}>
              <Search className="h-[1.05rem] w-[1.05rem]" />
              <span className="sr-only">Buscar</span>
            </Button>
            <Link href={isSignedIn ? "/cuenta" : "/sign-in"}>
              <Button variant="ghost" size="icon" className={`hover:text-primary ${isHeroHeader ? "text-white hover:bg-white/10 hover:text-white" : "text-foreground"}`}>
                <User className="h-[1.05rem] w-[1.05rem]" />
                <span className="sr-only">Cuenta</span>
              </Button>
            </Link>
            <Button variant="ghost" size="icon" className={`relative hover:text-primary ${isHeroHeader ? "text-white hover:bg-white/10 hover:text-white" : "text-foreground"}`} onClick={openMiniCart}>
              <ShoppingBag className="h-[1.05rem] w-[1.05rem]" />
              {cart && cart.quantity > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {cart.quantity}
                </span>
              )}
              <span className="sr-only">Carrito</span>
            </Button>
          </div>

          <div className="flex shrink-0 items-center gap-0.5 md:hidden">
            <Button variant="ghost" size="icon" className={`hover:text-primary ${isHeroHeader ? "text-white hover:bg-white/10 hover:text-white" : "text-foreground"}`} onClick={() => setIsSearchOpen(true)}>
              <Search className="h-5 w-5" />
              <span className="sr-only">Buscar</span>
            </Button>
            <Button variant="ghost" size="icon" className={`relative hover:text-primary ${isHeroHeader ? "text-white hover:bg-white/10 hover:text-white" : "text-foreground"}`} onClick={openMiniCart}>
              <ShoppingBag className="h-5 w-5" />
              {cart && cart.quantity > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {cart.quantity}
                </span>
              )}
              <span className="sr-only">Carrito</span>
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className={`shrink-0 lg:hidden ${isHeroHeader ? "text-white hover:bg-white/10 hover:text-white" : "text-foreground"}`}
            onClick={toggleMenu}
          >
            {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            <span className="sr-only">Menú</span>
          </Button>
        </div>

        {!isLargeHeader ? (
          <div className={`border-t px-4 py-2 md:px-6 ${isHeroHeader ? "border-white/15 bg-black/20" : "border-border/60 bg-background/80"}`}>
            <div className="container mx-auto flex min-w-0 items-center gap-4 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <BranchSelector />
              <FulfillmentSelector />
            </div>
          </div>
        ) : null}
        </div>

        {isMobileMenuOpen && (
          <div className="flex flex-col gap-2 border-b border-border bg-background px-5 py-4 text-foreground animate-in slide-in-from-top-2 lg:hidden">
            <Link href="/tienda" className="block border-b border-border py-2 text-lg font-serif text-foreground transition-colors hover:text-primary" onClick={toggleMenu}>
              Descubre la pastelería
            </Link>
            <Link href="/sucursales" className="block border-b border-border py-2 text-lg font-serif text-foreground transition-colors hover:text-primary" onClick={toggleMenu}>
              Sucursales
            </Link>
            <Link href={isSignedIn ? "/cuenta" : "/sign-in"} className="block border-b border-border py-2 text-lg font-serif text-foreground transition-colors hover:text-primary" onClick={toggleMenu}>
              Mi Cuenta
            </Link>
            {isAdmin && (
              <Link href="/admin" className="block py-2 text-lg font-serif text-foreground transition-colors hover:text-primary" onClick={toggleMenu}>
                Administración
              </Link>
            )}
          </div>
        )}

        {isSearchOpen && (
          <div className="absolute inset-x-0 top-full border-b border-border bg-[var(--mallorca-ivory)] px-5 py-8 text-foreground shadow-lg animate-in slide-in-from-top-2">
            <form onSubmit={submitSearch} className="container mx-auto max-w-4xl">
              <div className="mb-5 flex items-center justify-between">
                <span className="mallorca-kicker text-primary">Buscar en Mallorca</span>
                <button type="button" onClick={() => setIsSearchOpen(false)} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar búsqueda">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex items-center gap-4 border-b-2 border-foreground pb-3">
                <Search className="h-6 w-6 text-primary" />
                <input
                  autoFocus
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="¿Qué se te antoja?"
                  className="min-w-0 flex-1 bg-transparent font-serif text-3xl outline-none placeholder:text-muted-foreground/50 md:text-5xl"
                />
                <button type="submit" className="hidden items-center gap-2 text-xs font-bold tracking-widest md:flex">
                  BUSCAR <ArrowUpRight className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                {["Pasteles", "Panettone", "Croissant", "Chocolate"].map((term) => (
                  <button key={term} type="button" onClick={() => { setSearchValue(term); }} className="hover:text-primary">
                    {term}
                  </button>
                ))}
              </div>
            </form>
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="mt-auto bg-black text-white">
        <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8 sm:py-9 md:px-10 md:py-10">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,0.9fr)_minmax(0,1.5fr)] lg:gap-x-10 xl:gap-x-14">
            <div className="flex flex-col items-start gap-4 sm:col-span-2 lg:col-span-1">
              <Link href="/" aria-label="Pastelería Mallorca" className="inline-flex items-center">
                <img
                  src={footerLogo}
                  alt="Mallorca Pastelería"
                  className="h-auto w-[132px] max-w-full object-contain sm:w-[148px]"
                />
              </Link>
              <a
                href="https://www.tripadvisor.com.mx/Restaurant_Review-g150800-d11706469-Reviews-Pasteleria_Mallorca-Mexico_City_Central_Mexico_and_Gulf_Coast.html"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/55 px-3 py-1.5 text-[10px] font-medium tracking-wide text-white/90 transition-colors hover:border-[var(--mallorca-red)] hover:text-[var(--mallorca-red)]"
              >
                <MessageCircle className="h-3 w-3" />
                Déjanos tus comentarios
              </a>
            </div>

            <div>
              <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                Conoce más
              </h2>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] leading-tight text-white/80">
                {[
                  { href: "https://www.instagram.com/mallorcamx/?hl=es", icon: Instagram, label: "Instagram" },
                  { href: "https://www.linkedin.com/company/55180564/admin/", icon: Linkedin, label: "LinkedIn" },
                  {
                    href: "https://www.tripadvisor.com.mx/Restaurant_Review-g150800-d11706469-Reviews-Pasteleria_Mallorca-Mexico_City_Central_Mexico_and_Gulf_Coast.html",
                    icon: MessageCircle,
                    label: "Trip Advisor",
                  },
                  { href: "https://www.pasteleria-mallorca.com/", icon: Globe2, label: "Mallorca España" },
                  { href: "https://xetux-e.com/facturacion/webFact", icon: FileText, label: "Factura" },
                  {
                    href: "https://pasteleria-mallorca.mx/bolsa-de-trabajo",
                    icon: BriefcaseBusiness,
                    label: "Bolsa de trabajo",
                  },
                ].map((item) => (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 transition-colors hover:text-[var(--mallorca-red)]"
                    >
                      <item.icon className="h-3.5 w-3.5 shrink-0 text-white/55" />
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div className="sm:col-span-2 lg:col-span-1">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                  Sucursales
                </h2>
                <Link
                  href="/sucursales"
                  className="text-[10px] font-medium text-white/45 transition-colors hover:text-[var(--mallorca-red)]"
                >
                  Ver todas
                </Link>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-5">
                {(footerBranches || []).slice(0, 4).map((branch) => (
                  <div key={branch.id} className="min-w-0">
                    <h3 className="mb-1.5 text-[13px] font-semibold tracking-tight">
                      <Link
                        href={`/sucursales/${branch.slug}`}
                        className="transition-colors hover:text-[var(--mallorca-red)]"
                      >
                        {branch.name.replace(/^Mallorca\s+/i, "")}
                      </Link>
                    </h3>
                    <div className="space-y-1 text-[11px] leading-snug text-white/65">
                      {branch.phone && (
                        <a
                          href={`tel:${branch.phone}`}
                          className="flex items-center gap-1.5 truncate transition-colors hover:text-[var(--mallorca-red)]"
                        >
                          <Phone className="h-3 w-3 shrink-0 opacity-60" />
                          <span>{branch.phone}</span>
                        </a>
                      )}
                      {branch.email && (
                        <a
                          href={`mailto:${branch.email}`}
                          className="flex items-center gap-1.5 truncate transition-colors hover:text-[var(--mallorca-red)]"
                        >
                          <Mail className="h-3 w-3 shrink-0 opacity-60" />
                          <span>{branch.email}</span>
                        </a>
                      )}
                      <a
                        href={branch.mapsUrl || `/sucursales/${branch.slug}`}
                        target={branch.mapsUrl ? "_blank" : undefined}
                        rel={branch.mapsUrl ? "noreferrer" : undefined}
                        className="flex items-start gap-1.5 transition-colors hover:text-[var(--mallorca-red)]"
                      >
                        <MapPin className="mt-0.5 h-3 w-3 shrink-0 opacity-60" />
                        <span className="line-clamp-2">{branch.address}</span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-white/15 pt-4 text-[10px] text-white/40">
            <span>Aviso de Privacidad</span>
            <span>Términos y condiciones</span>
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              aria-label="Volver arriba"
              className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-white/60 transition-colors hover:border-[var(--mallorca-red)] hover:text-[var(--mallorca-red)]"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </footer>

      <nav aria-label="Accesos rápidos" className="pointer-events-none fixed bottom-24 right-4 z-40 flex flex-col items-end gap-2 sm:bottom-6 sm:right-6">
        {isQuickLinksOpen && (
          <div className="flex flex-col items-end gap-2 animate-in slide-in-from-bottom-2">
            <a
              href="https://pasteleria-mallorca.mx/bolsa-de-trabajo"
              target="_blank"
              rel="noreferrer"
              aria-label="Bolsa de trabajo"
              title="Bolsa de trabajo"
              className="pointer-events-auto flex items-center gap-2 transition-transform hover:-translate-x-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mallorca-red)]"
            >
              <span className="min-w-[142px] rounded-sm bg-[#4a4a4c] px-3 py-2 text-right text-xs font-medium text-white shadow-md">
                Bolsa de trabajo
              </span>
              <span className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-white/25 bg-[#e58c32] text-white shadow-lg">
                <BriefcaseBusiness className="h-5 w-5" />
              </span>
            </a>
            <a
              href="https://wa.me/525518827979"
              target="_blank"
              rel="noreferrer"
              aria-label="Escribir por WhatsApp al 55 1882 7979"
              title="WhatsApp 55 1882 7979"
              className="pointer-events-auto flex items-center gap-2 transition-transform hover:-translate-x-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]"
            >
              <span className="min-w-[142px] rounded-sm bg-[#4a4a4c] px-3 py-2 text-right text-xs font-medium text-white shadow-md">
                Información
              </span>
              <span className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-white/25 bg-[#25D366] text-white shadow-lg">
                <MessageCircle className="h-5 w-5" />
              </span>
            </a>
            <a
              href="https://xetux-e.com/facturacion/webFact"
              target="_blank"
              rel="noreferrer"
              aria-label="Facturación"
              title="Facturación"
              className="pointer-events-auto flex items-center gap-2 transition-transform hover:-translate-x-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e9a11a]"
            >
              <span className="min-w-[142px] rounded-sm bg-[#4a4a4c] px-3 py-2 text-right text-xs font-medium text-white shadow-md">
                Facturación
              </span>
              <span className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-white/25 bg-[#e9a11a] text-white shadow-lg">
                <FileText className="h-5 w-5" />
              </span>
            </a>
          </div>
        )}
        <button
          type="button"
          aria-label={isQuickLinksOpen ? "Ocultar accesos rápidos" : "Mostrar accesos rápidos"}
          aria-expanded={isQuickLinksOpen}
          onClick={() => setIsQuickLinksOpen((open) => !open)}
          className="group pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full border-4 border-white/20 bg-[var(--mallorca-red)] text-white shadow-[0_8px_24px_rgba(0,0,0,0.3)] transition-all hover:-translate-y-0.5 hover:bg-[var(--mallorca-red-dark)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mallorca-red)]"
        >
          <Info className={`h-6 w-6 transition-transform duration-300 ${isQuickLinksOpen ? "rotate-90" : "group-hover:scale-110"}`} />
        </button>
      </nav>
    </div>
  );
}
