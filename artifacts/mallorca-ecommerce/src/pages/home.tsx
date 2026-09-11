import { useMemo, useState } from "react";
import { StoreLayout } from "@/components/layout/store-layout";
import { useListProducts, useListCategories } from "@workspace/api-client-react";
import { Link } from "wouter";
import { ProductCard } from "@/components/product-card";
import { ArrowDown, ArrowRight, ArrowUpRight, MapPin } from "lucide-react";

const categoryImages = [
  "/images/mallorca-bolleria.jpg",
  "/images/mallorca-chocolate-cake.jpg",
  "/images/mallorca-fruit-tart.jpg",
  "/images/mallorca-panettone-hero.jpg",
];

export default function Home() {
  const { data: products, isLoading: isLoadingProducts } = useListProducts({ featured: true });
  const { data: categories, isLoading: isLoadingCategories } = useListCategories();
  const [heroShift, setHeroShift] = useState({ x: 0, y: 0 });

  const featureProduct = products?.[0];
  const secondaryProducts = useMemo(() => products?.slice(1, 5) ?? [], [products]);

  const handleHeroMove = (event: React.MouseEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setHeroShift({
      x: ((event.clientX - bounds.left) / bounds.width - 0.5) * 12,
      y: ((event.clientY - bounds.top) / bounds.height - 0.5) * 8,
    });
  };

  return (
    <StoreLayout>
      <section
        className="relative isolate min-h-[calc(100dvh-4.5rem)] overflow-hidden bg-[var(--mallorca-burgundy)] text-white"
        onMouseMove={handleHeroMove}
        onMouseLeave={() => setHeroShift({ x: 0, y: 0 })}
      >
        <div className="absolute inset-0 opacity-15" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, #f3d59b 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
        <div className="container relative mx-auto grid min-h-[calc(100dvh-4.5rem)] items-center gap-10 px-5 py-14 md:grid-cols-[0.9fr_1.1fr] md:px-8 md:py-20">
          <div className="relative z-10 max-w-xl">
            <div className="mallorca-reveal flex items-center gap-3 text-[var(--mallorca-butter)]">
              <span className="h-px w-12 bg-current" />
              <span className="mallorca-kicker">Desde 2016 · Ciudad de México</span>
            </div>
            <h1 className="mallorca-display mallorca-reveal mallorca-reveal-delay mt-7 text-[clamp(3.75rem,8vw,8.5rem)] leading-[0.82]">
              La temporada<br />
              <em className="text-[var(--mallorca-butter)]">sabe</em> a Mallorca.
            </h1>
            <p className="mallorca-reveal mallorca-reveal-delay-2 mt-8 max-w-md text-base leading-relaxed text-white/75 md:text-lg">
              Pastelería europea contemporánea, hecha cada mañana para los antojos que sí valen la pena.
            </p>
            <div className="mallorca-reveal mallorca-reveal-delay-2 mt-9 flex flex-wrap items-center gap-5">
              <Link href="/tienda" className="group inline-flex items-center gap-3 bg-[var(--mallorca-butter)] px-6 py-4 text-sm font-bold text-[var(--mallorca-cacao)] transition-transform hover:-translate-y-1">
                Descubre la pastelería
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
              </Link>
              <Link href="/sucursales" className="editorial-link text-sm font-medium text-white/80 hover:text-white">
                Encuentra tu Mallorca
              </Link>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[680px] md:mr-0">
            <div className="absolute -left-8 top-1/2 h-[78%] w-8 -translate-y-1/2 border-y border-l border-[var(--mallorca-butter)]/45 md:-left-12 md:w-12" />
            <div className="mallorca-paper-edge relative aspect-[0.92] overflow-hidden bg-[var(--mallorca-cacao)] shadow-2xl">
              <img
                src="/images/mallorca-panettone-hero.jpg"
                alt="Panettone artesanal de Mallorca"
                className="h-full w-full object-cover transition-transform duration-700 ease-out"
                style={{ transform: `scale(1.05) translate(${heroShift.x}px, ${heroShift.y}px)` }}
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-[var(--mallorca-cacao)]/50 via-transparent to-[var(--mallorca-cherry)]/10" />
              <div className="absolute bottom-5 left-5 flex items-center gap-3 text-[var(--mallorca-butter)]">
                <span className="h-8 w-8 rounded-full border border-current" />
                <span className="mallorca-kicker">Hecho despacio</span>
              </div>
            </div>
            <div className="mallorca-float absolute -bottom-7 -right-2 flex h-28 w-28 rotate-6 items-center justify-center rounded-full bg-[var(--mallorca-butter)] p-5 text-center text-xs font-bold leading-tight text-[var(--mallorca-cacao)] shadow-lg md:-right-10">
              Recién<br />horneado<br />cada día
            </div>
          </div>
        </div>
        <div className="absolute bottom-6 left-5 flex items-center gap-3 text-xs text-white/60 md:left-8">
          <ArrowDown className="h-4 w-4 animate-bounce" />
          <span className="mallorca-kicker">Sigue bajando</span>
        </div>
      </section>

      <section className="bg-[var(--mallorca-cream)] px-5 py-20 md:px-8 md:py-28">
        <div className="container mx-auto">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <span className="mallorca-kicker text-primary">El primer paso es antojarse</span>
              <h2 className="mallorca-display mt-4 max-w-2xl text-5xl leading-[0.92] md:text-7xl">¿Qué se te antoja hoy?</h2>
            </div>
            <Link href="/tienda" className="editorial-link mb-1 text-sm font-bold text-primary">
              Ver todo <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {isLoadingCategories ? (
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map((item) => <div key={item} className="aspect-[1.15] animate-pulse bg-black/5" />)}
            </div>
          ) : (
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {categories?.slice(0, 3).map((category, index) => (
                <Link key={category.id} href={`/tienda?categorySlug=${category.slug}`} className="group relative aspect-[1.15] overflow-hidden bg-[var(--mallorca-cacao)]">
                  <img src={category.imageUrl || categoryImages[index]} alt={category.name} className="h-full w-full object-cover opacity-85 transition duration-700 group-hover:scale-105 group-hover:opacity-100" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                  <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between text-white">
                    <div>
                      <span className="mallorca-kicker text-white/70">Explora</span>
                      <h3 className="mallorca-display mt-1 text-3xl md:text-4xl">{category.name}</h3>
                    </div>
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/50 transition-colors group-hover:bg-white group-hover:text-primary">
                      <ArrowUpRight className="h-4 w-4" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="overflow-hidden bg-[var(--mallorca-ivory)] px-5 py-20 md:px-8 md:py-28">
        <div className="container mx-auto">
          <div className="grid items-center gap-12 lg:grid-cols-[0.75fr_1.25fr]">
            <div className="relative">
              <span className="mallorca-kicker text-primary">Lo que se comparte</span>
              <h2 className="mallorca-display mt-4 text-5xl leading-[0.92] md:text-7xl">Un clásico,<br /><em>bien hecho.</em></h2>
              <p className="mt-7 max-w-sm leading-relaxed text-muted-foreground">
                Hay sabores que no necesitan presentación. Solo una mesa, buena compañía y otra rebanada.
              </p>
              <Link href={featureProduct ? `/producto/${featureProduct.slug}` : "/tienda"} className="editorial-link mt-8 text-sm font-bold text-primary">
                Conocer la estrella <ArrowRight className="h-4 w-4" />
              </Link>
              <span className="absolute -left-12 top-24 hidden font-serif text-8xl italic text-primary/10 lg:block">01</span>
            </div>
            <div className="relative grid gap-5 md:grid-cols-[1.15fr_0.85fr]">
              <div className="relative aspect-[0.82] overflow-hidden bg-secondary">
                <img src={featureProduct?.imageUrl || "/images/mallorca-chocolate-cake.jpg"} alt={featureProduct?.name || "Pastel de chocolate Mallorca"} className="h-full w-full object-cover transition-transform duration-700 hover:scale-105" />
                <div className="absolute bottom-5 left-5 bg-[var(--mallorca-ivory)] px-4 py-3">
                  <span className="mallorca-kicker text-primary">Favorito Mallorca</span>
                  <p className="mt-1 font-serif text-xl">{featureProduct?.name || "Pastel de chocolate"}</p>
                </div>
              </div>
              <div className="flex flex-col justify-end gap-4 md:pb-10">
                <div className="mallorca-paper-edge aspect-square overflow-hidden bg-[var(--mallorca-butter)] p-2">
                  <img src="/images/mallorca-fruit-tart.jpg" alt="Tarta de frutas" className="h-full w-full object-cover" />
                </div>
                <p className="max-w-[15rem] font-serif text-2xl leading-tight text-primary">Para compartir.<br /><em>Aunque entendemos si no quieres.</em></p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[var(--mallorca-cacao)] px-5 py-20 text-[var(--mallorca-ivory)] md:px-8 md:py-28">
        <div className="container mx-auto">
          <div className="mb-10 flex items-end justify-between gap-6">
            <div>
              <span className="mallorca-kicker text-[var(--mallorca-butter)]">Nuestras favoritas</span>
              <h2 className="mallorca-display mt-4 text-5xl leading-none md:text-6xl">Vuelven por ellas.</h2>
            </div>
            <Link href="/tienda" className="editorial-link hidden text-sm font-bold text-[var(--mallorca-butter)] md:inline-flex">Ver catálogo <ArrowRight className="h-4 w-4" /></Link>
          </div>
          {isLoadingProducts ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((item) => <div key={item} className="aspect-[0.78] animate-pulse bg-white/10" />)}
            </div>
          ) : (
            <div className="grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-4">
              {secondaryProducts.map((product) => <ProductCard key={product.id} product={product} className="[&_h3]:text-white [&_p]:text-white/55 [&_span]:text-white" />)}
            </div>
          )}
          <Link href="/tienda" className="editorial-link mt-12 text-sm font-bold text-[var(--mallorca-butter)] md:hidden">Ver catálogo <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      <section className="relative overflow-hidden bg-[var(--mallorca-butter)] px-5 py-20 md:px-8 md:py-24">
        <div className="absolute right-10 top-10 h-40 w-40 rounded-full border border-[var(--mallorca-cacao)]/15" />
        <div className="container relative mx-auto grid gap-12 md:grid-cols-[1fr_0.9fr] md:items-center">
          <div>
            <span className="mallorca-kicker text-[var(--mallorca-burgundy)]">Momento Mallorca</span>
            <h2 className="mallorca-display mt-4 max-w-2xl text-5xl leading-[0.9] text-[var(--mallorca-cacao)] md:text-7xl">Una mañana mejor empieza aquí.</h2>
          </div>
          <div className="max-w-md md:justify-self-end">
            <p className="text-lg leading-relaxed text-[var(--mallorca-cacao)]/75">
              Desde el primer café hasta la sobremesa que se alarga. Horneamos para que la ciudad tenga un pequeño momento de pausa.
            </p>
            <Link href="/sucursales" className="editorial-link mt-7 text-sm font-bold text-[var(--mallorca-burgundy)]">Ven a vernos <MapPin className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>
    </StoreLayout>
  );
}