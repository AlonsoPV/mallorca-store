import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ShoppingBag, Menu, X, User } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart-context";
import { useGetCart, useGetMe, getGetCartQueryKey, getGetMeQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@clerk/react";

export function StoreLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { isSignedIn } = useAuth();
  const { data: user } = useGetMe({ query: { enabled: !!isSignedIn, queryKey: getGetMeQueryKey() } });
  
  const { cartId, branchId } = useCart();
  const { data: cart } = useGetCart(cartId!, { query: { enabled: !!cartId, queryKey: getGetCartQueryKey(cartId!) } });

  const toggleMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  const isAdmin = user?.role === "staff" || user?.role === "manager" || user?.role === "admin";

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background selection:bg-primary selection:text-white">
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-serif text-2xl font-bold tracking-tight text-foreground">
              MALLORCA
            </Link>
            <nav className="hidden md:flex gap-6 items-center text-sm font-medium tracking-wide">
              <Link href="/tienda" className={`hover:text-primary transition-colors ${location === "/tienda" ? "text-primary" : "text-muted-foreground"}`}>
                CATÁLOGO
              </Link>
              <Link href="/sucursales" className={`hover:text-primary transition-colors ${location === "/sucursales" ? "text-primary" : "text-muted-foreground"}`}>
                SUCURSALES
              </Link>
            </nav>
          </div>

          <div className="hidden md:flex items-center gap-4">
            {isAdmin && (
              <Link href="/admin">
                <span className="text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer mr-2">
                  Administración
                </span>
              </Link>
            )}
            <Link href={isSignedIn ? "/cuenta" : "/sign-in"}>
              <Button variant="ghost" size="icon" className="hover:text-primary">
                <User className="h-5 w-5" />
                <span className="sr-only">Cuenta</span>
              </Button>
            </Link>
            <Link href="/carrito">
              <Button variant="ghost" size="icon" className="hover:text-primary relative">
                <ShoppingBag className="h-5 w-5" />
                {cart && cart.quantity > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {cart.quantity}
                  </span>
                )}
                <span className="sr-only">Carrito</span>
              </Button>
            </Link>
          </div>

          <div className="md:hidden flex items-center gap-2">
            <Link href="/carrito">
              <Button variant="ghost" size="icon" className="hover:text-primary relative">
                <ShoppingBag className="h-5 w-5" />
                {cart && cart.quantity > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {cart.quantity}
                  </span>
                )}
              </Button>
            </Link>
            <Button variant="ghost" size="icon" onClick={toggleMenu}>
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-b border-border bg-background p-4 flex flex-col gap-4 animate-in slide-in-from-top-2">
            <Link href="/tienda" className="block py-2 text-lg font-serif border-b border-border" onClick={toggleMenu}>
              Catálogo
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
      </header>

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
              Pastelería europea premium con tradición española y esencia contemporánea, sirviendo en Ciudad de México desde 2016.
            </p>
          </div>
          <div>
            <h4 className="font-serif text-lg mb-4">Navegación</h4>
            <ul className="space-y-3 text-sm text-background/70">
              <li><Link href="/tienda" className="hover:text-white transition-colors">Catálogo</Link></li>
              <li><Link href="/sucursales" className="hover:text-white transition-colors">Sucursales</Link></li>
              <li><Link href="/nosotros" className="hover:text-white transition-colors">Nuestra Historia</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-serif text-lg mb-4">Contacto</h4>
            <ul className="space-y-3 text-sm text-background/70">
              <li>hola@pasteleriamallorca.mx</li>
              <li>+52 (55) 1234 5678</li>
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
