import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ShoppingBag, Menu, X, User, Search, MapPin, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useCart } from "@/lib/cart-context";
import { useGetCart, useGetMe, useListBranches, getGetCartQueryKey, getGetMeQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@clerk/react";

export function StoreLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const { isSignedIn } = useAuth();
  const { data: user } = useGetMe({ query: { enabled: !!isSignedIn, queryKey: getGetMeQueryKey() } });
  
  const { cartId } = useCart();
  const { data: cart } = useGetCart(cartId!, { query: { enabled: !!cartId, queryKey: getGetCartQueryKey(cartId!) } });
  const { data: branches } = useListBranches();

  const toggleMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  const isAdmin = user?.role === "staff" || user?.role === "manager" || user?.role === "admin";
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
            <nav className="hidden md:flex gap-7 items-center text-[0.68rem] font-bold tracking-[0.18em]">
              <Link href="/tienda" className={`hover:text-primary transition-colors ${location === "/tienda" ? "text-primary" : isHeroHeader ? "text-white/80" : "text-muted-foreground"}`}>
                TIENDA
              </Link>
              <Link href="/tienda" className={`hover:text-primary transition-colors ${isHeroHeader ? "text-white/80" : "text-muted-foreground"}`}>
                PASTELERÍA
              </Link>
              <Link href="/sucursales" className={`hidden lg:block hover:text-primary transition-colors ${location === "/sucursales" ? "text-primary" : isHeroHeader ? "text-white/80" : "text-muted-foreground"}`}>
                RESTAURANTE
              </Link>
              <Link href="/nosotros" className={`hidden lg:block hover:text-primary transition-colors ${location === "/nosotros" ? "text-primary" : isHeroHeader ? "text-white/80" : "text-muted-foreground"}`}>
                HISTORIA
              </Link>
              <Link href="/sucursales" className={`hover:text-primary transition-colors ${location === "/sucursales" ? "text-primary" : isHeroHeader ? "text-white/80" : "text-muted-foreground"}`}>
                SUCURSALES
              </Link>
            </nav>
          </div>

          <div className="hidden md:flex items-center gap-1">
            {isAdmin && (
              <Link href="/admin">
                <span className="text-[0.65rem] font-bold tracking-widest text-muted-foreground hover:text-primary transition-colors cursor-pointer mr-3">
                  ADMIN
                </span>
              </Link>
            )}
            <Button variant="ghost" size="icon" className="hover:text-primary" onClick={() => setIsSearchOpen(true)}>
              <Search className="h-[1.05rem] w-[1.05rem]" />
              <span className="sr-only">Buscar</span>
            </Button>
            <Link href={isSignedIn ? "/cuenta" : "/sign-in"}>
              <Button variant="ghost" size="icon" className="hover:text-primary">
                <User className="h-[1.05rem] w-[1.05rem]" />
                <span className="sr-only">Cuenta</span>
              </Button>
            </Link>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="hover:text-primary relative">
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
            <Button variant="ghost" size="icon" className="hover:text-primary" onClick={() => setIsSearchOpen(true)}>
              <Search className="h-5 w-5" />
              <span className="sr-only">Buscar</span>
            </Button>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="hover:text-primary relative">
                <ShoppingBag className="h-5 w-5" />
                {cart && cart.quantity > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {cart.quantity}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <Button variant="ghost" size="icon" onClick={toggleMenu}>
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-b border-border bg-background px-5 py-4 flex flex-col gap-2 animate-in slide-in-from-top-2">
            <Link href="/tienda" className="block py-2 text-lg font-serif border-b border-border" onClick={toggleMenu}>
              Descubre la pastelería
            </Link>
            <Link href="/sucursales" className="block py-2 text-lg font-serif border-b border-border" onClick={toggleMenu}>
              Sucursales
            </Link>
            <Link href={isSignedIn ? "/cuenta" : "/sign-in"} className="block py-2 text-lg font-serif border-b border-border" onClick={toggleMenu}>
              Mi Cuenta
            </Link>
            {isAdmin && (
              <Link href="/admin" className="block py-2 text-lg font-serif" onClick={toggleMenu}>
                Administración
              </Link>
            )}
          </div>
        )}

        {isSearchOpen && (
          <div className="absolute inset-x-0 top-full border-b border-border bg-[var(--mallorca-ivory)] px-5 py-8 shadow-lg animate-in slide-in-from-top-2">
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

      <footer className="bg-foreground text-background py-16 mt-auto">
        <div className="container mx-auto px-4 md:px-6 grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="md:col-span-2">
            <Link href="/" className="font-serif text-3xl font-bold tracking-tight mb-4 inline-block">
              MALLORCA
            </Link>
            <p className="text-background/70 max-w-sm font-sans mt-4 text-sm leading-relaxed">
              Mallorca, de Madrid a México. Pastelería, panadería y sobremesa en Ciudad de México desde 2016.
            </p>
          </div>
          <div>
            <h4 className="font-serif text-lg mb-4">Navegación</h4>
            <ul className="space-y-3 text-sm text-background/70">
              <li><Link href="/tienda" className="hover:text-white transition-colors">Pastelería</Link></li>
              <li><Link href="/sucursales" className="hover:text-white transition-colors">Sucursales</Link></li>
              <li><Link href="/nosotros" className="hover:text-white transition-colors">Nuestra Historia</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-serif text-lg mb-4">Nuestras casas</h4>
            <ul className="space-y-3 text-sm text-background/70">
              {branches?.slice(0, 2).map((branch) => (
                <li key={branch.id}><Link href={`/sucursales/${branch.slug}`} className="hover:text-white transition-colors">{branch.name}</Link></li>
              ))}
              {!branches?.length && <li>Ciudad de México</li>}
            </ul>
          </div>
        </div>
        <div className="container mx-auto px-4 md:px-6 mt-16 pt-8 border-t border-background/10 text-xs text-background/50 flex flex-col md:flex-row justify-between items-center">
          <p>&copy; {new Date().getFullYear()} Pastelería Mallorca México. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
