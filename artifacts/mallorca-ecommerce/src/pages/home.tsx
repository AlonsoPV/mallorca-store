import { StoreLayout } from "@/components/layout/store-layout";
import { useListProducts, useListCategories } from "@workspace/api-client-react";
import { Link } from "wouter";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowDown } from "lucide-react";

export default function Home() {
  const { data: products, isLoading: isLoadingProducts } = useListProducts({ featured: true });
  const { data: categories, isLoading: isLoadingCategories } = useListCategories();

  return (
    <StoreLayout>
      {/* Hero Section */}
      <section className="relative h-[85dvh] min-h-[600px] w-full flex items-center justify-center bg-[#211815] overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src="/images/mallorca-panettone-hero.jpg"
            alt="Panettone artesanal de Mallorca"
            className="h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-[#211815]/55" />
        </div>
        
        <div className="container relative z-10 mx-auto px-4 md:px-6 text-center flex flex-col items-center">
          <span className="text-[#f2d5ca] font-sans text-sm md:text-base tracking-[0.2em] uppercase mb-4 md:mb-6 block">
            Arte & Tradición
          </span>
          <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl text-white mb-6 md:mb-8 max-w-4xl mx-auto leading-[1.1]">
            Pastelería Europea <br className="hidden md:block"/> Contemporánea
          </h1>
          <p className="text-white/90 font-sans text-lg md:text-xl max-w-2xl mx-auto mb-10">
            Sabores con raíces españolas, elaborados artesanalmente cada día en el corazón de la Ciudad de México.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Button asChild size="lg" className="h-14 px-8 text-base bg-primary text-primary-foreground hover:bg-primary/90 rounded-none">
              <Link href="/tienda">Comprar Ahora</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-14 px-8 text-base border-white bg-transparent text-white hover:bg-white hover:text-[#211815] rounded-none">
              <Link href="/sucursales">Nuestras Sucursales</Link>
            </Button>
          </div>
        </div>
        
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ArrowDown className="h-6 w-6 text-white/80" />
        </div>
      </section>

      {/* Categories Grid */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
            <div>
              <h2 className="font-serif text-4xl mb-4">Nuestras Especialidades</h2>
              <p className="text-muted-foreground max-w-lg">Descubre nuestra selección de panes, pastelería fina y repostería salada.</p>
            </div>
            <Link href="/tienda" className="group flex items-center gap-2 text-sm font-medium uppercase tracking-wider text-foreground hover:text-primary transition-colors">
              Ver todo el catálogo
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          {isLoadingCategories ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="aspect-square bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {categories?.slice(0, 3).map((category) => (
                <Link key={category.id} href={`/tienda?categorySlug=${category.slug}`}>
                  <div className="group relative aspect-square overflow-hidden cursor-pointer bg-secondary flex items-end p-8">
                    {category.imageUrl && (
                      <img 
                        src={category.imageUrl} 
                        alt={category.name}
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="relative z-10 w-full flex justify-between items-center text-white">
                      <h3 className="font-serif text-3xl">{category.name}</h3>
                      <ArrowRight className="h-6 w-6 opacity-0 -translate-x-4 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-24 bg-muted/30">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-16">
            <h2 className="font-serif text-4xl mb-4">Selección Destacada</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">Lo más apreciado por nuestros clientes. Joyas de temporada y clásicos atemporales.</p>
          </div>

          {isLoadingProducts ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="space-y-4">
                  <div className="aspect-[4/5] bg-muted animate-pulse" />
                  <div className="h-6 bg-muted animate-pulse w-3/4" />
                  <div className="h-4 bg-muted animate-pulse w-1/2" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {products?.slice(0, 4).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
          
          <div className="mt-16 text-center">
            <Button asChild variant="outline" className="rounded-none border-foreground text-foreground hover:bg-foreground hover:text-background h-12 px-8">
              <Link href="/tienda">Explorar todos los productos</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Editorial Banner */}
      <section className="py-32 bg-primary text-primary-foreground text-center px-4">
        <div className="container mx-auto max-w-3xl">
          <span className="font-sans text-xs tracking-[0.3em] uppercase mb-8 block opacity-80">
            Nuestra Filosofía
          </span>
          <h2 className="font-serif text-4xl md:text-5xl leading-tight mb-8">
            "El buen pan necesita tiempo, paciencia y respeto por los ingredientes puros."
          </h2>
          <p className="font-sans text-lg opacity-90 max-w-xl mx-auto">
            Desde 2016, traemos la excelencia de la panadería y pastelería madrileña a la vibrante vida de la Ciudad de México.
          </p>
        </div>
      </section>
    </StoreLayout>
  );
}