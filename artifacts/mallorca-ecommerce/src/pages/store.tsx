import { useEffect, useState } from "react";
import { StoreLayout } from "@/components/layout/store-layout";
import { useListProducts, useListCategories } from "@workspace/api-client-react";
import { ProductCard } from "@/components/product-card";
import { Input } from "@/components/ui/input";
import { Search, Filter, X } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";

export default function Store() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const categorySlug = searchParams.get('categorySlug') || "";
  const initialSearch = searchParams.get('search') || "";
  
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: products, isLoading: isLoadingProducts } = useListProducts({
    categorySlug: categorySlug || undefined,
    search: debouncedSearch || undefined,
  });

  const { data: categories } = useListCategories();

  const handleCategorySelect = (slug: string) => {
    if (slug === categorySlug) {
      setLocation('/tienda');
    } else {
      setLocation(`/tienda?categorySlug=${slug}`);
    }
    setIsMobileFiltersOpen(false);
  };

  return (
    <StoreLayout>
      <div className="relative overflow-hidden bg-[var(--mallorca-burgundy)] px-4 py-12 text-primary-foreground sm:py-16 md:px-6 md:py-24">
        <div className="absolute -right-10 -top-24 h-72 w-72 rounded-full border border-white/15" />
        <div className="absolute -right-2 -top-16 h-56 w-56 rounded-full border border-white/10" />
        <div className="container relative mx-auto">
          <span className="mallorca-kicker text-[var(--mallorca-butter)]">La vitrina está abierta</span>
           <h1 className="mallorca-display mt-4 max-w-3xl text-[clamp(3rem,11vw,4.5rem)] leading-[0.92] md:text-7xl">Descubre la pastelería.</h1>
           <p className="mt-5 max-w-xl text-sm leading-relaxed text-primary-foreground/75 sm:text-base md:mt-6 md:text-lg">
            Panadería, pasteles y antojos hechos para cambiarte el día.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 pb-24">
           <div className="mb-8 flex items-end justify-between gap-4 border-b border-border pb-5 sm:mb-10 sm:items-center">
             <p className="max-w-[18rem] text-sm leading-relaxed text-muted-foreground">
              {categorySlug ? "Una selección para ese antojo." : "Todo lo que hoy se hornea con cariño."}
            </p>
             <span className="mallorca-kicker hidden shrink-0 text-muted-foreground sm:block">Hecho en CDMX</span>
          </div>
           <div className="flex flex-col items-start gap-6 md:flex-row md:gap-8">
          
          {/* Mobile Filter Toggle */}
           <div className="mb-2 flex w-full items-center justify-between gap-3 md:hidden">
             <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar productos..." 
                 className="h-11 rounded-sm border-border bg-card pl-10 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button 
              variant="outline" 
               className="h-11 shrink-0 rounded-sm px-3 text-xs font-bold uppercase tracking-wide" 
               aria-expanded={isMobileFiltersOpen}
               aria-label="Mostrar filtros"
              onClick={() => setIsMobileFiltersOpen(!isMobileFiltersOpen)}
            >
                 <Filter className="mr-2 h-4 w-4" />
              Filtros
            </Button>
          </div>

          {/* Sidebar Filters */}
           <aside className={`w-full shrink-0 flex-col gap-8 rounded-sm border border-border bg-card p-5 md:sticky md:top-24 md:flex md:w-64 md:border-0 md:bg-transparent md:p-0 ${isMobileFiltersOpen ? 'mb-2 flex' : 'hidden'}`}>
             <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar productos..." 
                 className="h-11 rounded-sm border-border bg-card pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div>
               <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
                 <h3 className="mallorca-kicker text-primary">
                   ¿Qué se te antoja?
                 </h3>
                 <button type="button" className="text-muted-foreground md:hidden" onClick={() => setIsMobileFiltersOpen(false)} aria-label="Cerrar filtros">
                   <X className="h-4 w-4" />
                 </button>
               </div>
              <ul className="space-y-3">
                <li>
                  <button 
                    onClick={() => handleCategorySelect("")}
                    className={`group flex w-full items-center justify-between text-left text-sm transition-colors ${!categorySlug ? 'font-medium text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Todos los productos
                    <span className="opacity-0 transition-opacity group-hover:opacity-100">↗</span>
                  </button>
                </li>
                {categories?.map((cat) => (
                  <li key={cat.id}>
                    <button 
                      onClick={() => handleCategorySelect(cat.slug)}
                      className={`group text-sm w-full text-left transition-colors flex justify-between items-center ${categorySlug === cat.slug ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      <span>{cat.name}</span>
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground">{cat.productCount}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Product Grid */}
          <div className="flex-1 w-full">
            {isLoadingProducts ? (
               <div className="grid grid-cols-2 gap-x-4 gap-y-9 sm:gap-6 lg:grid-cols-3 xl:gap-8">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="space-y-4">
                    <div className="aspect-[4/5] bg-muted animate-pulse" />
                    <div className="h-6 bg-muted animate-pulse w-3/4" />
                    <div className="h-4 bg-muted animate-pulse w-1/2" />
                  </div>
                ))}
              </div>
            ) : products && products.length > 0 ? (
               <div className="grid grid-cols-2 gap-x-4 gap-y-9 sm:gap-6 lg:grid-cols-3 xl:gap-8">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <div className="py-24 text-center border border-dashed border-border bg-muted/30">
                <p className="font-serif text-xl text-muted-foreground mb-2">No se encontraron productos</p>
                <p className="text-sm text-muted-foreground/70 mb-6">
                  Intenta con otros términos de búsqueda o selecciona otra categoría.
                </p>
                <Button 
                  variant="outline" 
                  className="rounded-none border-foreground text-foreground"
                  onClick={() => { setSearch(""); handleCategorySelect(""); }}
                >
                  Limpiar filtros
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </StoreLayout>
  );
}