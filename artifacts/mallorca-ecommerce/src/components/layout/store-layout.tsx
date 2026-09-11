import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ShoppingBag, Menu, X, User, Search, MapPin, ArrowUpRight, Instagram, Linkedin, Phone, Mail, MessageCircle, BriefcaseBusiness, FileText, Globe2, ChevronUp, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useCart } from "@/lib/cart-context";
import { useGetCart, useGetMe, getGetCartQueryKey, getGetMeQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@clerk/react";
import footerLogo from "@assets/MallorcaFooter_1789166205501.webp";

export function StoreLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isQuickLinksOpen, setIsQuickLinksOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const { isSignedIn } = useAuth();
  const { data: user } = useGetMe({ query: { enabled: !!isSignedIn, queryKey: getGetMeQueryKey() } });
  
  const { cartId } = useCart();
  const { data: cart } = useGetCart(cartId!, { query: { enabled: !!cartId, queryKey: getGetCartQueryKey(cartId!) } });
  const toggleMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  const isAdmin = !!user && ["staff", "branch_manager", "operations_manager", "operations", "manager", "admin"].includes(user.role);
  const isHeroHeader = location === "/" && !isScrolled;

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const query = searchValue.trim();
    window.location.href = query ? `/tienda?search=${encodeURIComponent(query)}` : "/tienda";
    setIsSearchOpen(false);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary selection:text-white">
      <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
      <header className={`${isHeroHeader ? "absolute text-white" : "sticky border-border/70 bg-background/90 text-foreground shadow-sm backdrop-blur-xl"} top-0 z-50 w-full border-b transition-all duration-300`}>
        <div className={`container mx-auto px-4 md:px-6 flex items-center justify-between transition-all duration-300 ${isScrolled ? "h-14" : "h-[4.5rem]"}`}>
          <div className="flex items-center gap-6">
            <Link href="/" className={`group flex items-center gap-2 ${isHeroHeader ? "text-white" : "text-foreground"}`}>
              <span className="h-2 w-2 rounded-full bg-primary transition-transform group-hover:scale-150" />
              <span className="font-serif text-2xl font-bold tracking-[-0.06em]">
              MALLORCA
              </span>
            </Link>
            <nav className={`hidden items-center gap-7 text-[0.68rem] font-bold tracking-[0.18em] md:flex ${isHeroHeader ? "text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.45)]" : "text-foreground"}`}>
              <Link href="/tienda" className={`transition-colors hover:text-primary ${location === "/tienda" ? "text-primary" : isHeroHeader ? "text-white" : "text-foreground"}`}>
                TIENDA
              </Link>
              <Link href="/tienda" className={`transition-colors hover:text-primary ${isHeroHeader ? "text-white" : "text-foreground"}`}>
                PASTELERÍA
              </Link>
              <Link href="/sucursales" className={`hidden transition-colors hover:text-primary lg:block ${location === "/sucursales" ? "text-primary" : isHeroHeader ? "text-white" : "text-foreground"}`}>
                RESTAURANTE
              </Link>
              <Link href="/nosotros" className={`hidden transition-colors hover:text-primary lg:block ${location === "/nosotros" ? "text-primary" : isHeroHeader ? "text-white" : "text-foreground"}`}>
                HISTORIA
              </Link>
              <Link href="/sucursales" className={`transition-colors hover:text-primary ${location === "/sucursales" ? "text-primary" : isHeroHeader ? "text-white" : "text-foreground"}`}>
                SUCURSALES
              </Link>
            </nav>
          </div>

          <div className="hidden md:flex items-center gap-1">
            {isAdmin && (
              <Link href="/admin">
                <span className={`mr-3 cursor-pointer text-[0.65rem] font-bold tracking-widest transition-colors hover:text-primary ${isHeroHeader ? "text-white drop-shadow-[0_1px_8px_rgba(0,0,0,0.45)]" : "text-foreground"}`}>
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
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className={`relative hover:text-primary ${isHeroHeader ? "text-white hover:bg-white/10 hover:text-white" : "text-foreground"}`}>
                <ShoppingBag className="h-[1.05rem] w-[1.05rem]" />
                {cart && cart.quantity > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {cart.quantity}
                  </span>
                )}
                <span className="sr-only">Carrito</span>
              </Button>
            </SheetTrigger>
          </div>

          <div className="md:hidden flex items-center gap-2">
              <Button variant="ghost" size="icon" className={`hover:text-primary ${isHeroHeader ? "text-white hover:bg-white/10 hover:text-white" : "text-foreground"}`} onClick={() => setIsSearchOpen(true)}>
              <Search className="h-5 w-5" />
              <span className="sr-only">Buscar</span>
            </Button>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className={`relative hover:text-primary ${isHeroHeader ? "text-white hover:bg-white/10 hover:text-white" : "text-foreground"}`}>
                <ShoppingBag className="h-5 w-5" />
                {cart && cart.quantity > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {cart.quantity}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <Button variant="ghost" size="icon" className={isHeroHeader ? "text-white hover:bg-white/10 hover:text-white" : "text-foreground"} onClick={toggleMenu}>
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden flex flex-col gap-2 border-b border-border bg-background px-5 py-4 text-foreground animate-in slide-in-from-top-2">
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
      <SheetContent className="flex h-full w-full flex-col border-l border-border bg-[var(--mallorca-white)] sm:max-w-md">
        <SheetHeader className="border-b border-border pb-5 pr-8 text-left">
          <SheetTitle className="mallorca-display text-4xl">Tu bolsa</SheetTitle>
          <SheetDescription>
            {cart ? `Preparando en ${cart.branch.name}` : "Todavía no has elegido qué llevarte."}
          </SheetDescription>
        </SheetHeader>
        {cart && cart.items.length > 0 ? (
          <>
            <div className="flex-1 divide-y divide-border overflow-y-auto py-2">
              {cart.items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-4 py-5">
                  <div>
                    <p className="font-serif text-xl leading-tight">{item.name}</p>
                    {item.variantLabel && <p className="mt-1 text-xs text-muted-foreground">{item.variantLabel}</p>}
                    <p className="mt-2 text-sm text-muted-foreground">{item.quantity} × {new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(item.unitPrice)}</p>
                  </div>
                  <span className="text-sm font-medium">{new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(item.lineTotal)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-5">
              <div className="mb-5 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Subtotal</span>
                <span className="font-serif text-2xl">{new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(cart.subtotal)}</span>
              </div>
              <Button asChild className="h-12 w-full rounded-md bg-[var(--mallorca-red)] text-white hover:bg-[var(--mallorca-red-dark)]" onClick={() => setIsCartOpen(false)}>
                <Link href="/carrito">Terminar compra <ArrowUpRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
            <ShoppingBag className="mb-5 h-12 w-12 text-[var(--mallorca-red)]/30" />
            <p className="font-serif text-2xl">Tu bolsa está esperando.</p>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">Elige algo recién horneado y lo preparamos para ti.</p>
            <Button asChild className="mt-7 rounded-md bg-[var(--mallorca-red)] text-white hover:bg-[var(--mallorca-red-dark)]" onClick={() => setIsCartOpen(false)}>
              <Link href="/tienda">Ver pastelería</Link>
            </Button>
          </div>
        )}
      </SheetContent>
      </Sheet>

      <main className="flex-1 flex flex-col">
        {children}
      </main>

      <footer className="mt-auto bg-black text-white">
        <div className="mx-auto max-w-[1180px] px-5 pb-6 pt-10 sm:px-8 sm:py-12 md:px-10 md:py-14">
          <div className="grid gap-9 sm:grid-cols-2 sm:gap-x-8 sm:gap-y-10 md:grid-cols-[1.05fr_1.05fr_1.55fr_1.55fr] md:gap-8 lg:gap-12">
            <div className="flex flex-col items-center text-center sm:col-span-2 md:col-span-1 md:items-start md:text-left">
              <Link href="/" aria-label="Pastelería Mallorca" className="inline-flex items-center">
                <img src={footerLogo} alt="Mallorca Pastelería" className="h-auto w-[170px] max-w-full object-contain md:w-[180px]" />
              </Link>
              <a
                href="https://www.tripadvisor.com.mx/Restaurant_Review-g150800-d11706469-Reviews-Pasteleria_Mallorca-Mexico_City_Central_Mexico_and_Gulf_Coast.html"
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/80 px-4 py-2 text-[11px] font-medium tracking-[0.02em] text-white transition-colors hover:border-[var(--mallorca-red)] hover:text-[var(--mallorca-red)] sm:px-5"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Déjanos tus comentarios
              </a>
            </div>

            <div className="sm:col-span-2 md:col-span-1">
              <h2 className="mb-4 text-[15px] font-semibold">Conoce más</h2>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px] leading-snug text-white/90 sm:grid-cols-3 sm:gap-x-8 md:block md:space-y-2.5">
                <li>
                  <a href="https://www.instagram.com/mallorcamx/?hl=es" target="_blank" rel="noreferrer" className="inline-flex items-center gap-3 transition-colors hover:text-[var(--mallorca-red)]">
                    <Instagram className="h-4 w-4" /> Instagram
                  </a>
                </li>
                <li>
                  <a href="https://www.linkedin.com/company/55180564/admin/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-3 transition-colors hover:text-[var(--mallorca-red)]">
                    <Linkedin className="h-4 w-4" /> LinkedIn
                  </a>
                </li>
                <li>
                  <a href="https://www.tripadvisor.com.mx/Restaurant_Review-g150800-d11706469-Reviews-Pasteleria_Mallorca-Mexico_City_Central_Mexico_and_Gulf_Coast.html" target="_blank" rel="noreferrer" className="inline-flex items-center gap-3 transition-colors hover:text-[var(--mallorca-red)]">
                    <MessageCircle className="h-4 w-4" /> Trip Advisor
                  </a>
                </li>
                <li>
                  <a href="https://www.pasteleria-mallorca.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-3 transition-colors hover:text-[var(--mallorca-red)]">
                    <Globe2 className="h-4 w-4" /> Mallorca España
                  </a>
                </li>
                <li>
                  <a href="https://xetux-e.com/facturacion/webFact" target="_blank" rel="noreferrer" className="inline-flex items-center gap-3 transition-colors hover:text-[var(--mallorca-red)]">
                    <FileText className="h-4 w-4" /> Factura
                  </a>
                </li>
                <li>
                  <a href="https://pasteleria-mallorca.mx/bolsa-de-trabajo" target="_blank" rel="noreferrer" className="inline-flex items-center gap-3 transition-colors hover:text-[var(--mallorca-red)]">
                    <BriefcaseBusiness className="h-4 w-4" /> Bolsa de trabajo
                  </a>
                </li>
              </ul>
            </div>

            <div className="sm:col-span-1">
              <h2 className="mb-4 text-[15px] font-semibold">Mallorca Lomas</h2>
              <div className="space-y-3 text-[12px] leading-relaxed text-white/90 sm:text-[13px]">
                <a href="tel:+525591317108" className="flex items-start gap-3 transition-colors hover:text-[var(--mallorca-red)]">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>55 9131 7108</span>
                </a>
                <a href="mailto:explanada@pasteleria-mallorca.mx" className="flex items-start gap-3 break-all transition-colors hover:text-[var(--mallorca-red)]">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>explanada@pasteleria-mallorca.mx</span>
                </a>
                <a href="https://www.google.com.mx/maps/place/Av.+Explanada+710,+Lomas+-+Virreyes,+Lomas+de+Chapultepec+IV+Secc,+Miguel+Hidalgo,+11000+Ciudad+de+M%C3%A9xico,+CDMX/@19.4208159,-99.2133058,17z/data=!3m1!4b1!4m5!3m4!1s0x85d201f326971107:0x100907e0f999f89c!8m2!3d19.4208109!4d-99.2111171" target="_blank" rel="noreferrer" className="flex items-start gap-3 transition-colors hover:text-[var(--mallorca-red)]">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Av. Explanada 710, Lomas - Virreyes, Lomas de Chapultepec IV Secc, Miguel Hidalgo, 11000</span>
                </a>
              </div>
            </div>

            <div className="sm:col-span-1">
              <h2 className="mb-4 text-[15px] font-semibold">Mallorca Reforma</h2>
              <div className="space-y-3 text-[12px] leading-relaxed text-white/90 sm:text-[13px]">
                <a href="tel:+525512685557" className="flex items-start gap-3 transition-colors hover:text-[var(--mallorca-red)]">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>55 1268 5557</span>
                </a>
                <a href="mailto:reforma@pasteleria-mallorca.mx" className="flex items-start gap-3 break-all transition-colors hover:text-[var(--mallorca-red)]">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>reforma@pasteleria-mallorca.mx</span>
                </a>
                <a href="https://www.google.com.mx/maps/search/Av.+Paseo+de+la+Reforma+365,+Cuauht%C3%A9moc,+06500,+Ciudad+de+M%C3%A9xico" target="_blank" rel="noreferrer" className="flex items-start gap-3 transition-colors hover:text-[var(--mallorca-red)]">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Av. Paseo de la Reforma 365, Cuauhtémoc, 06500</span>
                </a>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-white/45 pt-3 text-[10px] text-white/55 md:mt-9">
            <span>Aviso de Privacidad</span>
            <span>Términos y condiciones</span>
            <span className="ml-auto flex items-center gap-2">
              <Info className="h-5 w-5 rounded-full bg-[var(--mallorca-red)] p-0.5 text-white" />
              <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Volver arriba" className="text-white transition-colors hover:text-[var(--mallorca-red)]">
                <ChevronUp className="h-4 w-4" />
              </button>
            </span>
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
