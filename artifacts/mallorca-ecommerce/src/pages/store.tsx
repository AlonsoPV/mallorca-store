import { useEffect, useState } from "react";
import { StoreLayout } from "@/components/layout/store-layout";
import { useListProducts, useListCategories, useListBranches, getListProductsQueryKey } from "@workspace/api-client-react";
import { ProductCard } from "@/components/product-card";
import { Input } from "@/components/ui/input";
import { Search, Filter, X } from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart-context";
import { storeHeroSlides } from "@/lib/store-media";

export default function Store() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString.startsWith("?") ? searchString.slice(1) : searchString);
  const categorySlug = searchParams.get('categorySlug') || "";
  const initialSearch = searchParams.get('search') || "";
  
  const [search, setSearch] = useState(initialSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(initialSearch);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [showUnavailable, setShowUnavailable] = useState(false);
  const { branchId, selectedTime } = useCart();

  useEffect(() => {
    setSearch(initialSearch);
    setDebouncedSearch(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: categories } = useListCategories();
  const { data: branchesData } = useListBranches();
  const branches = Array.isArray(branchesData) ? branchesData : undefined;
  const selectedBranch = branches?.find((branch) => branch.id === branchId);
  const { data: products, isLoading: isLoadingProducts } = useListProducts({
    branchSlug: selectedBranch?.slug,
    scheduledStart: selectedTime || undefined,
    categorySlug: categorySlug || undefined,
    search: debouncedSearch || undefined,
    includeUnavailable: showUnavailable,
  }, {
    query: {
      enabled: true,
      queryKey: getListProductsQueryKey({
        branchSlug: selectedBranch?.slug,
        scheduledStart: selectedTime || undefined,
        categorySlug: categorySlug || undefined,
        search: debouncedSearch || undefined,
        includeUnavailable: showUnavailable,
      }),
    },
  });

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
      <section className="bg-[var(--mallorca-burgundy)] text-primary-foreground">
        <div className="grid md:min-h-[26rem] md:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)]">
          <div className="order-2 flex flex-col justify-between gap-8 px-5 py-8 sm:px-8 sm:py-10 md:order-1 md:px-10 md:py-12 lg:px-14">
            <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-white/50">
              Mallorca México · Desde 2016
            </p>
            <div className="max-w-xl">
              <span className="mallorca-kicker text-[var(--mallorca-butter)]">La vitrina está abierta</span>
              <h1 className="mallorca-display mt-3 text-[clamp(2.6rem,6vw,4.6rem)] leading-[0.92] text-balance">
                Descubre la pastelería.
              </h1>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-white/80 sm:text-base">
                Panadería, pasteles y antojos hechos para cambiarte el día.
              </p>
              <button
                type="button"
                onClick={() => document.getElementById("seleccion")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="mt-7 inline-flex items-center gap-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white/80 transition-colors hover:text-white"
              >
                <span className="h-px w-10 bg-[var(--mallorca-butter)]" />
                Explora la selección
              </button>
            </div>
          </div>
          <div className="order-1 relative min-h-[13.5rem] sm:min-h-[16rem] md:order-2 md:min-h-full">
            <img
              src={storeHeroSlides[0]?.src}
              alt="Mesa de temporada Pastelería Mallorca"
              className="absolute inset-0 h-full w-full object-cover object-[center_40%]"
            />
          </div>
        </div>
      </section>

      <div id="seleccion" className="container mx-auto scroll-mt-24 px-4 pb-24 md:px-6">
          <div className="mb-8 flex flex-col gap-5 border-b border-border py-8 sm:mb-10 sm:flex-row sm:items-end sm:justify-between sm:gap-10 sm:py-10">
            <div className="min-w-0">
              <p className="mallorca-kicker text-[var(--mallorca-red)]">Hecho en CDMX</p>
              <p className="mallorca-display mt-3 max-w-xl text-[clamp(1.7rem,3vw,2.35rem)] leading-[1.05] text-foreground">
                {categorySlug ? "Una selección para ese antojo." : "Todo lo que hoy se hornea con cariño."}
              </p>
            </div>
            {products ? (
              <p className="shrink-0 text-sm leading-snug text-muted-foreground sm:pb-1 sm:text-right">
                <span className="mallorca-display block text-3xl leading-none text-foreground">{products.length}</span>
                {products.length === 1 ? "pieza en la vitrina" : "piezas en la vitrina"}
              </p>
            ) : null}
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
             <label className="flex cursor-pointer items-start gap-3 border-t border-border pt-5 text-sm text-muted-foreground">
               <input
                 type="checkbox"
                 checked={showUnavailable}
                 onChange={(event) => setShowUnavailable(event.target.checked)}
                 className="mt-0.5 h-4 w-4 accent-primary"
               />
               <span>
                 Mostrar productos no disponibles
                 <span className="mt-1 block text-xs leading-relaxed text-muted-foreground/70">Aparecen deshabilitados si tu sucursal no los tiene.</span>
               </span>
             </label>
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