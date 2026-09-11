import { useState, useMemo } from "react";
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
  
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  // Simple debounce for search
  useMemo(() => {
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
      <div className="bg-secondary py-12 px-4 md:px-6 mb-8">
        <div className="container mx-auto">
          <h1 className="font-serif text-4xl md:text-5xl text-foreground mb-4">Catálogo</h1>
          <p className="text-muted-foreground font-sans max-w-2xl">
            Explora nuestra selección completa de panadería artesanal, repostería y opciones gourmet.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 pb-24">
        <div className="flex flex-col md:flex-row gap-8 items-start">
          
          {/* Mobile Filter Toggle */}
          <div className="w-full flex md:hidden items-center justify-between mb-4">
            <div className="relative flex-1 mr-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar productos..." 
                className="pl-10 rounded-none border-border"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button 
              variant="outline" 
              className="rounded-none shrink-0" 
              onClick={() => setIsMobileFiltersOpen(!isMobileFiltersOpen)}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filtros
            </Button>
          </div>

          {/* Sidebar Filters */}
          <aside className={`w-full md:w-64 shrink-0 flex flex-col gap-8 md:sticky md:top-24 ${isMobileFiltersOpen ? 'block mb-8' : 'hidden md:flex'}`}>
            <div className="hidden md:block relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Buscar productos..." 
                className="pl-10 rounded-none border-border"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div>
              <h3 className="font-sans text-sm font-semibold uppercase tracking-wider mb-4 border-b border-border pb-2">
                Categorías
              </h3>
              <ul className="space-y-3">
                <li>
                  <button 
                    onClick={() => handleCategorySelect("")}
                    className={`text-sm w-full text-left transition-colors ${!categorySlug ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    Todos los productos
                  </button>
                </li>
                {categories?.map((cat) => (
                  <li key={cat.id}>
                    <button 
                      onClick={() => handleCategorySelect(cat.slug)}
                      className={`text-sm w-full text-left transition-colors flex justify-between items-center ${categorySlug === cat.slug ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      <span>{cat.name}</span>
                      <span className="text-[10px] bg-muted px-1.5 py-0.5 text-muted-foreground">{cat.productCount}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Product Grid */}
          <div className="flex-1 w-full">
            {isLoadingProducts ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 xl:gap-8">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="space-y-4">
                    <div className="aspect-[4/5] bg-muted animate-pulse" />
                    <div className="h-6 bg-muted animate-pulse w-3/4" />
                    <div className="h-4 bg-muted animate-pulse w-1/2" />
                  </div>
                ))}
              </div>
            ) : products && products.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 xl:gap-8">
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