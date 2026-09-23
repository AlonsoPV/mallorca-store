import { useMemo, useState } from "react";
import { StoreLayout } from "@/components/layout/store-layout";
import { useListBranches, useListProducts, getListProductsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { ProductCard } from "@/components/product-card";
import { ArrowDown, ArrowRight, ArrowUpRight } from "lucide-react";
import { useCart } from "@/lib/cart-context";

export default function Home() {
  const { branchId, selectedTime } = useCart();
  const { data: branchesData } = useListBranches();
  const branches = Array.isArray(branchesData) ? branchesData : undefined;
  const selectedBranch = branches?.find((branch) => branch.id === branchId);
  const catalogParams = {
    branchSlug: selectedBranch?.slug,
    scheduledStart: selectedTime || undefined,
    includeUnavailable: true,
  };
  const { data: featuredProducts, isLoading: isLoadingFeatured } = useListProducts({
    ...catalogParams,
    featured: true,
  }, {
    query: {
      queryKey: getListProductsQueryKey({ ...catalogParams, featured: true }),
    },
  });
  const { data: seasonalProducts, isLoading: isLoadingSeasonal } = useListProducts({
    ...catalogParams,
    seasonal: true,
  }, {
    query: {
      queryKey: getListProductsQueryKey({ ...catalogParams, seasonal: true }),
    },
  });
  const [heroShift, setHeroShift] = useState({ x: 0, y: 0 });

  const featuredList = useMemo(() => featuredProducts ?? [], [featuredProducts]);
  const seasonalList = useMemo(() => seasonalProducts ?? [], [seasonalProducts]);
  const seasonalHero = seasonalList[0];
  const extraSeasonal = seasonalList.slice(1, 4);
  const showFeatured = isLoadingFeatured || featuredList.length > 0;
  const showSeasonal = isLoadingSeasonal || seasonalList.length > 0;

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
        className="relative isolate flex h-[100dvh] max-h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-[var(--mallorca-cacao)] text-white"
        onMouseMove={handleHeroMove}
        onMouseLeave={() => setHeroShift({ x: 0, y: 0 })}
      >
        <img
          src="/images/mallorca-bolleria.jpg"
          alt="Bollería recién horneada de Mallorca"
          className="mallorca-image absolute inset-0 h-full w-full object-cover object-center transition-transform duration-700"
          style={{ transform: `scale(1.04) translate(${heroShift.x}px, ${heroShift.y}px)` }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(37,33,30,.14)_0%,rgba(37,33,30,.06)_36%,rgba(37,33,30,.74)_100%)]" />
        <div className="absolute inset-0 bg-[var(--mallorca-red)]/10 mix-blend-multiply" />

        <div
          className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-[1280px] flex-col px-5 pb-6 md:px-8 md:pb-8"
          style={{ paddingTop: "var(--store-header-height, 4.5rem)" }}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col justify-end gap-8 py-3 md:justify-center md:gap-10 md:py-4">
              <div className="mallorca-reveal flex items-center gap-3 text-white/85">
                <span className="h-px w-10 shrink-0 bg-[var(--mallorca-red)] sm:w-14" />
                <span className="mallorca-kicker">De Madrid a México · CDMX</span>
              </div>

              <div className="grid min-h-0 items-end gap-8 md:grid-cols-[minmax(0,1.35fr)_minmax(16rem,0.75fr)] md:items-end md:gap-12 lg:gap-16">
                <h1 className="mallorca-display mallorca-reveal mallorca-reveal-delay text-balance text-[clamp(2.6rem,calc(1.1rem+4.2vw),5.5rem)] leading-[1.02] tracking-[-0.045em] text-white">
                  Un clásico que{" "}
                  <em className="font-serif italic text-[var(--mallorca-red)]">viajó</em>
                  <br className="hidden sm:block" />
                  {" "}hasta México.
                </h1>

                <div className="mallorca-reveal mallorca-reveal-delay-2 flex max-w-sm flex-col gap-5 md:justify-self-end md:border-l md:border-white/20 md:pl-8 lg:pl-10">
                  <p className="text-[0.95rem] leading-[1.5] text-white/82 md:text-base">
                    Pastelería europea contemporánea, hecha cada mañana para acompañar la vida de la ciudad.
                  </p>
                  <Link
                    href="/tienda"
                    className="group mt-1 inline-flex items-center gap-4 text-white"
                  >
                    <span className="border-b border-white/35 pb-1 text-[0.72rem] font-bold uppercase tracking-[0.18em] transition-colors group-hover:border-[var(--mallorca-red)]">
                      Ver la tienda
                    </span>
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--mallorca-red)] shadow-[0_8px_20px_rgba(212,59,43,0.35)] transition-all duration-300 group-hover:scale-105 group-hover:bg-[var(--mallorca-red-dark)]">
                      <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </span>
                  </Link>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3 pt-2 text-xs text-white/65">
              <ArrowDown className="h-4 w-4 animate-bounce" />
              <span className="mallorca-kicker">Descubre Mallorca México</span>
            </div>
          </div>
        </div>
      </section>

      {showFeatured ? (
      <section className="bg-[var(--mallorca-cream)] px-5 py-20 md:px-8 md:py-28">
        <div className="container mx-auto">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <span className="mallorca-kicker text-[var(--mallorca-red)]">Destacados</span>
              <h2 className="mallorca-display mt-4 max-w-2xl text-5xl leading-[0.92] md:text-7xl">¿Qué se te antoja hoy?</h2>
            </div>
            <Link href="/tienda" className="editorial-link mb-1 text-sm font-bold text-[var(--mallorca-red)]">
              Ver todo <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {isLoadingFeatured ? (
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((item) => <div key={item} className="aspect-[0.78] animate-pulse bg-black/5" />)}
            </div>
          ) : (
            <div className="mt-12 grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {featuredList.slice(0, 6).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>
      ) : null}

      {showSeasonal ? (
      <section className="bg-[var(--mallorca-white)] px-5 py-20 md:px-8 md:py-28">
        <div className="container mx-auto">
          <div className="grid items-center gap-12 lg:grid-cols-[0.72fr_1.28fr]">
            <div>
              <span className="mallorca-kicker text-[var(--mallorca-red)]">Temporada</span>
              <h2 className="mallorca-display mt-4 text-5xl leading-[0.92] md:text-7xl">Lo que el horno<br /><em>saca ahora.</em></h2>
              <p className="mt-7 max-w-sm leading-relaxed text-muted-foreground">
                {seasonalHero?.shortDescription || "Piezas de temporada, hechas cuando el calendario y el horno coinciden."}
              </p>
              <Link href={seasonalHero ? `/producto/${seasonalHero.slug}` : "/tienda"} className="editorial-link mt-8 text-sm font-bold text-[var(--mallorca-red)]">
                Descubrir temporada <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="relative">
              {isLoadingSeasonal || !seasonalHero ? (
                <div className="aspect-[1.25] animate-pulse bg-[var(--mallorca-sand)]" />
              ) : (
                <>
                  <Link href={`/producto/${seasonalHero.slug}`} className="relative block aspect-[1.25] overflow-hidden bg-[var(--mallorca-sand)]">
                    <img src={seasonalHero.imageUrl || "/images/mallorca-bolleria.jpg"} alt={seasonalHero.name} className="mallorca-image h-full w-full object-cover transition-transform duration-700 hover:scale-[1.02]" />
                  </Link>
                  <div className="absolute -bottom-5 left-5 max-w-[18rem] bg-[var(--mallorca-red)] p-5 text-white md:-left-8">
                    <span className="mallorca-kicker text-white/75">De temporada</span>
                    <p className="mt-2 font-serif text-2xl leading-tight">{seasonalHero.name}</p>
                  </div>
                </>
              )}
            </div>
          </div>
          {extraSeasonal.length > 0 ? (
            <div className="mt-16 grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {extraSeasonal.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : null}
        </div>
      </section>
      ) : null}

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

      {branches && branches.length > 0 ? (
      <section className="bg-[var(--mallorca-cacao)] px-5 py-20 text-white md:px-8 md:py-28">
        <div className="container mx-auto">
          <div className="mb-12 flex flex-col gap-6 md:mb-14 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <span className="mallorca-kicker text-[var(--mallorca-red)]">Hospitalidad Mallorca</span>
              <h2 className="mallorca-display mt-4 text-5xl leading-[0.92] md:text-7xl">¿Dónde nos vemos?</h2>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-white/70 md:text-base">
                Pan recién horneado, algo dulce y una pausa en la ciudad.
              </p>
            </div>
            <Link href="/sucursales" className="group inline-flex items-center gap-3 self-start text-white md:self-auto">
              <span className="border-b border-white/35 pb-1 text-[0.72rem] font-bold uppercase tracking-[0.18em] transition-colors group-hover:border-[var(--mallorca-red)]">
                Ver todas
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--mallorca-red)] transition-transform duration-300 group-hover:scale-105 group-hover:bg-[var(--mallorca-red-dark)]">
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </Link>
          </div>

          <div className="grid gap-10 md:grid-cols-2 md:gap-8 lg:gap-12">
            {branches.slice(0, 2).map((branch) => {
              const shortName = branch.shortName || branch.name.replace(/^Mallorca\s+/i, "");
              return (
                <Link
                  key={branch.id}
                  href={`/sucursales/${branch.slug}`}
                  className="group block"
                >
                  <div className="relative aspect-[5/4] overflow-hidden bg-[var(--mallorca-sand)] md:aspect-[4/3]">
                    <img
                      src={branch.imageUrl || "/images/mallorca-bolleria.jpg"}
                      alt={branch.name}
                      className="mallorca-image h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-80 transition-opacity duration-500 group-hover:opacity-100" />
                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 md:p-6">
                      <div>
                        <span className="mallorca-kicker text-white/70">{branch.neighborhood || branch.city}</span>
                        <h3 className="mallorca-display mt-2 text-3xl leading-none md:text-4xl">{shortName}</h3>
                      </div>
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[var(--mallorca-cacao)] transition-colors duration-300 group-hover:bg-[var(--mallorca-red)] group-hover:text-white">
                        <ArrowUpRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                  <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">
                    {[branch.neighborhood, branch.city].filter(Boolean).join(" · ")}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
      ) : null}

      <section className="bg-[var(--mallorca-red)] px-5 py-16 text-white md:px-8 md:py-20">
        <div className="container mx-auto grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <span className="mallorca-kicker text-white/70">Familia Mallorca</span>
            <h2 className="mallorca-display mt-3 text-5xl leading-none md:text-6xl">Algo bueno está por venir.</h2>
            <p className="mt-4 max-w-xl text-white/80">Inicia sesión para consultar tus pedidos y enterarte primero de lo que sale del horno.</p>
          </div>
          <Link href="/sign-in" className="inline-flex items-center justify-center gap-3 rounded-md bg-white px-6 py-4 text-sm font-bold text-[var(--mallorca-red)] transition-colors hover:bg-[var(--mallorca-cream)]">
            Iniciar sesión <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </StoreLayout>
  );
}