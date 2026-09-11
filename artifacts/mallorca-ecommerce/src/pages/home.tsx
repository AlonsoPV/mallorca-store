import { useMemo, useState } from "react";
import { StoreLayout } from "@/components/layout/store-layout";
import { useListBranches, useListCategories, useListProducts } from "@workspace/api-client-react";
import { Link } from "wouter";
import { ProductCard } from "@/components/product-card";
import { ArrowDown, ArrowRight, ArrowUpRight, MapPin } from "lucide-react";

const categoryImages = [
  "/images/mallorca-chocolate-cake.jpg",
  "/images/mallorca-bolleria.jpg",
  "/images/mallorca-panettone-hero.jpg",
];

export default function Home() {
  const { data: products, isLoading: isLoadingProducts } = useListProducts({ featured: true });
  const { data: categories, isLoading: isLoadingCategories } = useListCategories();
  const { data: branches } = useListBranches();
  const [heroShift, setHeroShift] = useState({ x: 0, y: 0 });

  const featureProduct = products?.[0];
  const secondaryProducts = useMemo(() => products?.slice(1, 5) ?? [], [products]);

  const handleHeroMove = (event: React.MouseEvent<HTMLElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    setHeroShift({
      x: ((event.clientX - bounds.left) / bounds.width - 0.5) * 8,
      y: ((event.clientY - bounds.top) / bounds.height - 0.5) * 6,
    });
  };

  return (
    <StoreLayout>
      <section
        className="relative isolate min-h-[min(860px,calc(100dvh-0px))] overflow-hidden bg-[var(--mallorca-cacao)] text-white"
        onMouseMove={handleHeroMove}
        onMouseLeave={() => setHeroShift({ x: 0, y: 0 })}
      >
        <img
          src="/images/mallorca-bolleria.jpg"
          alt="Bollería recién horneada de Mallorca"
          className="absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700"
          style={{ transform: `scale(1.04) translate(${heroShift.x}px, ${heroShift.y}px)` }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(37,33,30,.14)_0%,rgba(37,33,30,.06)_36%,rgba(37,33,30,.74)_100%)]" />
        <div className="absolute inset-0 bg-[var(--mallorca-red)]/10 mix-blend-multiply" />

        <div className="container relative mx-auto flex min-h-[min(860px,100dvh)] flex-col justify-end px-5 pb-12 pt-36 md:px-8 md:pb-16">
          <div className="max-w-3xl">
            <div className="mallorca-reveal flex items-center gap-3 text-white/85">
              <span className="h-px w-12 bg-[var(--mallorca-red)]" />
              <span className="mallorca-kicker">De Madrid a México · CDMX</span>
            </div>
            <h1 className="mallorca-display mallorca-reveal mallorca-reveal-delay mt-6 max-w-3xl text-[clamp(3.5rem,9vw,9rem)] leading-[0.84] text-white">
              Un clásico que<br /><em className="text-[var(--mallorca-red)]">viajó</em> hasta México.
            </h1>
            <div className="mt-8 flex flex-wrap items-end justify-between gap-8">
              <p className="mallorca-reveal mallorca-reveal-delay-2 max-w-sm text-base leading-relaxed text-white/80 md:text-lg">
                Pastelería europea contemporánea, hecha cada mañana para acompañar la vida de la ciudad.
              </p>
              <Link href="/tienda" className="group inline-flex items-center gap-3 rounded-md bg-[var(--mallorca-red)] px-6 py-4 text-sm font-bold text-white transition-colors hover:bg-[var(--mallorca-red-dark)]">
                Ver la tienda
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
              </Link>
            </div>
          </div>
        </div>
        <div className="absolute bottom-6 left-5 flex items-center gap-3 text-xs text-white/70 md:left-8">
          <ArrowDown className="h-4 w-4 animate-bounce" />
          <span className="mallorca-kicker">Descubre Mallorca México</span>
        </div>
      </section>

      <section className="bg-[var(--mallorca-cream)] px-5 py-20 md:px-8 md:py-28">
        <div className="container mx-auto">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <span className="mallorca-kicker text-[var(--mallorca-red)]">Para cada antojo</span>
              <h2 className="mallorca-display mt-4 max-w-2xl text-5xl leading-[0.92] md:text-7xl">¿Qué se te antoja hoy?</h2>
            </div>
            <Link href="/tienda" className="editorial-link mb-1 text-sm font-bold text-[var(--mallorca-red)]">
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
                  <img src={category.imageUrl || categoryImages[index]} alt={category.name} className="h-full w-full object-cover opacity-90 transition duration-500 group-hover:scale-[1.02]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between text-white">
                    <div>
                      <span className="mallorca-kicker text-white/70">Explora</span>
                      <h3 className="mallorca-display mt-1 text-3xl md:text-4xl">{category.name}</h3>
                    </div>
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--mallorca-red)] transition-colors group-hover:bg-[var(--mallorca-red-dark)]">
                      <ArrowUpRight className="h-4 w-4" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="bg-[var(--mallorca-white)] px-5 py-20 md:px-8 md:py-28">
        <div className="container mx-auto">
          <div className="grid items-center gap-12 lg:grid-cols-[0.72fr_1.28fr]">
            <div>
              <span className="mallorca-kicker text-[var(--mallorca-red)]">Hecho cada mañana</span>
              <h2 className="mallorca-display mt-4 text-5xl leading-[0.92] md:text-7xl">La bollería<br /><em>para empezar mejor.</em></h2>
              <p className="mt-7 max-w-sm leading-relaxed text-muted-foreground">
                Capas, mantequilla y tiempo. Ese es el secreto de lo que sale temprano de nuestros hornos.
              </p>
              <Link href={featureProduct ? `/producto/${featureProduct.slug}` : "/tienda"} className="editorial-link mt-8 text-sm font-bold text-[var(--mallorca-red)]">
                Descubrir el favorito <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="relative">
              <div className="relative aspect-[1.25] overflow-hidden bg-[var(--mallorca-sand)]">
                <img src={featureProduct?.imageUrl || "/images/mallorca-bolleria.jpg"} alt={featureProduct?.name || "Bollería Mallorca"} className="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.02]" />
              </div>
              <div className="absolute -bottom-5 left-5 max-w-[18rem] bg-[var(--mallorca-red)] p-5 text-white md:-left-8">
                <span className="mallorca-kicker text-white/75">Favorito Mallorca</span>
                <p className="mt-2 font-serif text-2xl leading-tight">{featureProduct?.name || "Croissant de mantequilla"}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[var(--mallorca-cacao)] px-5 py-20 text-[var(--mallorca-white)] md:px-8 md:py-28">
        <div className="container mx-auto">
          <div className="mb-10 flex items-end justify-between gap-6">
            <div>
              <span className="mallorca-kicker text-[var(--mallorca-red)]">Los favoritos de Mallorca</span>
              <h2 className="mallorca-display mt-4 text-5xl leading-none md:text-6xl">Vuelven por ellos.</h2>
            </div>
            <Link href="/tienda" className="editorial-link hidden text-sm font-bold text-[var(--mallorca-red)] md:inline-flex">Ver catálogo <ArrowRight className="h-4 w-4" /></Link>
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
          <Link href="/tienda" className="editorial-link mt-12 text-sm font-bold text-[var(--mallorca-red)] md:hidden">Ver catálogo <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      <section className="bg-[var(--mallorca-cream)] px-5 py-20 md:px-8 md:py-28">
        <div className="container mx-auto grid gap-12 md:grid-cols-2 md:items-center">
          <div>
            <span className="mallorca-kicker text-[var(--mallorca-red)]">De Madrid a México</span>
            <div className="mt-6 flex items-start gap-6">
              <div className="font-serif text-5xl leading-none text-[var(--mallorca-red)] md:text-7xl">1931<br /><span className="text-2xl">Madrid</span></div>
              <div className="mt-3 h-20 w-px bg-[var(--mallorca-red)]/40" />
              <div className="pt-12 font-serif text-5xl leading-none text-[var(--mallorca-cacao)] md:text-7xl">2016<br /><span className="text-2xl">CDMX</span></div>
            </div>
          </div>
          <div className="max-w-lg">
            <h2 className="mallorca-display text-5xl leading-[0.92] md:text-6xl">La tradición cruzó el Atlántico.</h2>
            <p className="mt-6 leading-relaxed text-muted-foreground">Para encontrarse con la Ciudad de México: su luz, sus sobremesas y la hospitalidad de compartir algo bueno.</p>
            <Link href="/nosotros" className="editorial-link mt-8 text-sm font-bold text-[var(--mallorca-red)]">Conoce nuestra historia <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </section>

      <section className="bg-[var(--mallorca-white)] px-5 py-20 md:px-8 md:py-28">
        <div className="container mx-auto">
          <div className="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <span className="mallorca-kicker text-[var(--mallorca-red)]">Hospitalidad Mallorca</span>
              <h2 className="mallorca-display mt-4 text-5xl leading-none md:text-7xl">¿Dónde nos vemos?</h2>
            </div>
            <Link href="/sucursales" className="editorial-link text-sm font-bold text-[var(--mallorca-red)]">Ver sucursales <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {branches?.slice(0, 2).map((branch) => (
              <article key={branch.id} className="group overflow-hidden bg-[var(--mallorca-cream)]">
                <div className="aspect-[1.7] overflow-hidden bg-[var(--mallorca-sand)]">
                  {branch.imageUrl ? <img src={branch.imageUrl} alt={branch.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]" /> : <img src="/images/mallorca-bolleria.jpg" alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="flex items-start justify-between gap-5 p-6">
                  <div>
                    <span className="mallorca-kicker text-[var(--mallorca-red)]">Mallorca</span>
                    <h3 className="mt-2 font-serif text-3xl">{branch.name.replace("Mallorca ", "")}</h3>
                    <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">{branch.address}, {branch.neighborhood}</p>
                  </div>
                  <Link href={`/sucursales/${branch.slug}`} aria-label={`Ver ${branch.name}`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--mallorca-red)] text-white hover:bg-[var(--mallorca-red-dark)]">
                    <MapPin className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[var(--mallorca-red)] px-5 py-16 text-white md:px-8 md:py-20">
        <div className="container mx-auto grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <span className="mallorca-kicker text-white/70">Familia Mallorca</span>
            <h2 className="mallorca-display mt-3 text-5xl leading-none md:text-6xl">Algo bueno está por venir.</h2>
            <p className="mt-4 max-w-xl text-white/80">Crea tu cuenta para guardar tus datos, consultar tus pedidos y enterarte primero de lo que sale del horno.</p>
          </div>
          <Link href="/sign-up" className="inline-flex items-center justify-center gap-3 rounded-md bg-white px-6 py-4 text-sm font-bold text-[var(--mallorca-red)] transition-colors hover:bg-[var(--mallorca-cream)]">
            Unirme a la familia <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </StoreLayout>
  );
}