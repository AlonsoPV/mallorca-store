import { useEffect, useMemo, useState } from "react";
import { StoreLayout } from "@/components/layout/store-layout";
import { useListBranches, useListProducts, getListProductsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { ProductCard } from "@/components/product-card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Clock, MapPin, Plus } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { cn } from "@/lib/utils";
import { ImageWithFallback } from "@/components/image-with-fallback";
import { formatBranchPostalLines, formatMxn } from "@/lib/availability-copy";
import {
  branchImageFor,
  branchLocalImage,
  storeHeroSlides,
  storeHistoryPhoto,
  storeMosaicImages,
  storeSeasonalFallback,
} from "@/lib/store-media";

const HERO_SLIDES = storeHeroSlides;

const HISTORY_MILESTONES: { year?: string; title: string; body: string }[] = [
  {
    year: "1931",
    title: "Madrid",
    body: "Nace Mallorca en Madrid: pastelería y bollería hechas cada mañana.",
  },
  {
    year: "2016",
    title: "Ciudad de México",
    body: "Mallorca cruza el Atlántico y abre en Lomas de Chapultepec su casa original en México.",
  },
  {
    title: "Hoy",
    body: "También nos encuentras en Paseo de la Reforma, con la misma tradición y la hospitalidad de compartir algo bueno.",
  },
];

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function todayHoursLabel(hours: Array<{ day: string; open: string; close: string; closed: boolean }> | null | undefined) {
  if (!hours?.length) return null;
  const today = new Date().getDay();
  const match = hours.find((hour) => WEEKDAY_INDEX[hour.day] === today);
  if (!match) return null;
  if (match.closed) return "Cerrado hoy";
  return `Hoy ${match.open}–${match.close}`;
}

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
  const [heroIndex, setHeroIndex] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [featuredApi, setFeaturedApi] = useState<CarouselApi>();
  const [featuredCanPrev, setFeaturedCanPrev] = useState(false);
  const [featuredCanNext, setFeaturedCanNext] = useState(false);
  const [flavorsApi, setFlavorsApi] = useState<CarouselApi>();
  const [flavorsCanPrev, setFlavorsCanPrev] = useState(false);
  const [flavorsCanNext, setFlavorsCanNext] = useState(false);

  const featuredList = useMemo(() => featuredProducts ?? [], [featuredProducts]);
  const seasonalList = useMemo(() => seasonalProducts ?? [], [seasonalProducts]);
  const seasonalHero = seasonalList[0];
  const extraSeasonal = seasonalList.slice(1, 4);
  const showFeatured = isLoadingFeatured || featuredList.length > 0;
  const showSeasonal = isLoadingSeasonal || seasonalList.length > 0;

  useEffect(() => {
    if (!featuredApi) return;
    const sync = () => {
      setFeaturedCanPrev(featuredApi.canScrollPrev());
      setFeaturedCanNext(featuredApi.canScrollNext());
    };
    sync();
    featuredApi.on("reInit", sync);
    featuredApi.on("select", sync);
    return () => {
      featuredApi.off("reInit", sync);
      featuredApi.off("select", sync);
    };
  }, [featuredApi]);

  useEffect(() => {
    if (!flavorsApi) return;
    const sync = () => {
      setFlavorsCanPrev(flavorsApi.canScrollPrev());
      setFlavorsCanNext(flavorsApi.canScrollNext());
    };
    sync();
    flavorsApi.on("reInit", sync);
    flavorsApi.on("select", sync);
    return () => {
      flavorsApi.off("reInit", sync);
      flavorsApi.off("select", sync);
    };
  }, [flavorsApi]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeroIndex((current) => (current + 1) % HERO_SLIDES.length);
    }, 5600);
    return () => window.clearInterval(timer);
  }, []);

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
        <div
          className="absolute inset-0 transition-transform duration-700"
          style={{ transform: `scale(1.04) translate(${heroShift.x}px, ${heroShift.y}px)` }}
        >
          {HERO_SLIDES.map((slide, index) => (
            <img
              key={slide.src}
              src={slide.src}
              alt={slide.alt}
              className={cn(
                "mallorca-image absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-1000",
                index === heroIndex ? "opacity-100" : "opacity-0",
              )}
            />
          ))}
        </div>
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

            <div className="flex shrink-0 items-center justify-between gap-4 pt-2">
              <div className="flex items-center gap-3 text-xs text-white/65">
                <ArrowDown className="h-4 w-4 animate-bounce" />
                <span className="mallorca-kicker">Descubre Mallorca México</span>
              </div>
              <div className="flex items-center gap-2" role="tablist" aria-label="Imágenes del hero">
                {HERO_SLIDES.map((slide, index) => (
                  <button
                    key={slide.src}
                    type="button"
                    role="tab"
                    aria-selected={index === heroIndex}
                    aria-label={`Ver imagen ${index + 1}`}
                    onClick={() => setHeroIndex(index)}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      index === heroIndex ? "w-7 bg-white" : "w-1.5 bg-white/45 hover:bg-white/70",
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {showFeatured ? (
      <section className="overflow-hidden bg-[var(--mallorca-cream)] py-20 md:py-28">
        <div className="container mx-auto px-5 md:px-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <span className="mallorca-kicker text-[var(--mallorca-red)]">Destacados</span>
              <h2 className="mallorca-display mt-4 max-w-2xl text-5xl leading-[0.92] md:text-7xl">¿Qué se te antoja hoy?</h2>
            </div>
            <div className="flex items-center gap-4 md:mb-1">
              <div className="flex items-center gap-2" aria-hidden={isLoadingFeatured}>
                <button
                  type="button"
                  aria-label="Productos anteriores"
                  disabled={!featuredCanPrev}
                  onClick={() => featuredApi?.scrollPrev()}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-full border border-[var(--mallorca-cacao)]/20 text-[var(--mallorca-cacao)] transition-colors",
                    featuredCanPrev
                      ? "hover:border-[var(--mallorca-red)] hover:bg-[var(--mallorca-red)] hover:text-white"
                      : "cursor-not-allowed opacity-35",
                  )}
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Productos siguientes"
                  disabled={!featuredCanNext}
                  onClick={() => featuredApi?.scrollNext()}
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-full border border-[var(--mallorca-cacao)]/20 text-[var(--mallorca-cacao)] transition-colors",
                    featuredCanNext
                      ? "hover:border-[var(--mallorca-red)] hover:bg-[var(--mallorca-red)] hover:text-white"
                      : "cursor-not-allowed opacity-35",
                  )}
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
              <Link href="/tienda" className="editorial-link text-sm font-bold text-[var(--mallorca-red)]">
                Ver todo <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {isLoadingFeatured ? (
            <div className="mt-12 flex gap-5 overflow-hidden">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="aspect-[0.78] w-[78%] shrink-0 animate-pulse bg-black/5 sm:w-[46%] lg:w-[31%]"
                />
              ))}
            </div>
          ) : (
            <Carousel
              setApi={setFeaturedApi}
              opts={{
                align: "start",
                dragFree: true,
                containScroll: "trimSnaps",
              }}
              className="mt-12"
            >
              <CarouselContent className="-ml-5 md:-ml-6">
                {featuredList.slice(0, 8).map((product) => (
                  <CarouselItem
                    key={product.id}
                    className="basis-[78%] pl-5 sm:basis-[46%] md:pl-6 lg:basis-[31%]"
                  >
                    <ProductCard product={product} />
                  </CarouselItem>
                ))}
              </CarouselContent>
            </Carousel>
          )}
        </div>
      </section>
      ) : null}

      {showSeasonal ? (
      <section className="overflow-hidden bg-[var(--mallorca-white)] px-5 py-16 sm:py-20 md:px-8 md:py-28">
        <div className="container mx-auto">
          <div className="grid items-stretch gap-8 sm:gap-10 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:gap-10 lg:gap-12 xl:gap-16">
            <div className="order-2 flex min-w-0 flex-col justify-center md:order-1">
              <span className="mallorca-kicker text-[var(--mallorca-red)]">Temporada</span>
              <h2 className="mallorca-display mt-3 max-w-xl text-[clamp(2rem,8vw,4.25rem)] leading-[1.02] sm:mt-4 sm:leading-[0.95]">
                Lo que el horno{" "}
                <br className="hidden sm:block" />
                <em>saca ahora.</em>
              </h2>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-muted-foreground sm:mt-6 sm:text-[0.95rem] md:text-base">
                {seasonalHero?.shortDescription || "Piezas de temporada, hechas cuando el calendario y el horno coinciden."}
              </p>
              <Link
                href={seasonalHero ? `/producto/${seasonalHero.slug}` : "/tienda"}
                className="group mt-7 inline-flex max-w-full items-center gap-3 self-start sm:mt-8"
              >
                <span className="border-b border-[var(--mallorca-red)]/35 pb-1 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--mallorca-red)] transition-colors group-hover:border-[var(--mallorca-red)] sm:text-[0.72rem] sm:tracking-[0.18em]">
                  Descubrir temporada
                </span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--mallorca-red)] text-white transition-transform duration-300 group-hover:scale-105 group-hover:bg-[var(--mallorca-red-dark)] sm:h-10 sm:w-10">
                  <ArrowUpRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </span>
              </Link>
            </div>

            <div className="relative order-1 min-w-0 md:order-2">
              {isLoadingSeasonal || !seasonalHero ? (
                <div className="aspect-[5/4] max-h-[22rem] animate-pulse bg-[var(--mallorca-sand)] sm:max-h-[26rem] md:aspect-[4/3] md:max-h-none md:min-h-[18rem] lg:min-h-[22rem] xl:min-h-[26rem]" />
              ) : (
                <Link
                  href={`/producto/${seasonalHero.slug}`}
                  className="group relative block overflow-hidden bg-[var(--mallorca-sand)]"
                >
                  <div className="aspect-[5/4] max-h-[22rem] sm:max-h-[26rem] md:aspect-[4/3] md:max-h-none md:min-h-[18rem] lg:min-h-[22rem] xl:min-h-[26rem]">
                    <ImageWithFallback
                      src={seasonalHero.imageUrl || storeSeasonalFallback}
                      alt={seasonalHero.name}
                      className="mallorca-image h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                      fallback={
                        <img
                          src={storeSeasonalFallback}
                          alt={seasonalHero.name}
                          className="mallorca-image h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                        />
                      }
                    />
                  </div>
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--mallorca-cacao)]/75 via-[var(--mallorca-cacao)]/10 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 text-white sm:gap-4 sm:p-5 md:p-6">
                    <div className="min-w-0">
                      <span className="mallorca-kicker text-white/70">De temporada</span>
                      <p className="mt-1.5 truncate font-serif text-[1.25rem] leading-tight sm:text-2xl md:text-[1.75rem]">
                        {seasonalHero.name}
                      </p>
                      {seasonalHero.salePrice != null || seasonalHero.price != null ? (
                        <p className="mt-2 text-sm font-medium text-white/85">
                          {seasonalHero.salePrice != null ? (
                            <>
                              <span className="mr-2 text-white/55 line-through">{formatMxn(seasonalHero.price)}</span>
                              {formatMxn(seasonalHero.salePrice)}
                            </>
                          ) : (
                            formatMxn(seasonalHero.price)
                          )}
                        </p>
                      ) : null}
                    </div>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--mallorca-red)] text-white transition-transform duration-300 group-hover:scale-105 group-hover:bg-[var(--mallorca-red-dark)] sm:h-11 sm:w-11">
                      <ArrowUpRight className="h-4 w-4" />
                    </span>
                  </div>
                </Link>
              )}
            </div>
          </div>

          {extraSeasonal.length > 0 ? (
            <div className="mt-12 border-t border-[var(--mallorca-cacao)]/10 pt-10 sm:mt-14 sm:pt-12 md:mt-16">
              <div className="mb-6 flex items-end justify-between gap-4 sm:mb-8">
                <p className="mallorca-kicker text-[var(--mallorca-cacao)]/45">También esta temporada</p>
                <Link href="/tienda" className="editorial-link text-xs font-bold text-[var(--mallorca-red)] sm:text-sm">
                  Ver todo <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Link>
              </div>
              <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 sm:gap-y-12 lg:grid-cols-3">
                {extraSeasonal.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
      ) : null}

      {branches && branches.length > 0 ? (
      <section className="relative overflow-hidden bg-[var(--mallorca-cacao)] px-5 py-20 text-white md:px-8 md:py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 12% 18%, rgba(232,200,117,0.55) 0%, transparent 42%), radial-gradient(circle at 88% 78%, rgba(212,59,43,0.45) 0%, transparent 38%)",
          }}
        />
        <div className="container relative mx-auto">
          <div className="mb-10 grid gap-8 border-b border-white/10 pb-10 md:mb-14 md:grid-cols-[minmax(0,1.4fr)_auto] md:items-end md:gap-12 md:pb-12">
            <div className="max-w-2xl">
              <span className="mallorca-kicker text-[var(--mallorca-butter)]">Hospitalidad Mallorca</span>
              <h2 className="mallorca-display mt-4 text-[clamp(2.6rem,7vw,4.75rem)] leading-[0.92]">
                ¿Dónde nos vemos?
              </h2>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-white/70 md:text-base">
                Pan recién horneado, algo dulce y una pausa en la ciudad.
              </p>
            </div>
            <Link
              href="/sucursales"
              className="group inline-flex items-center gap-3 self-start text-white md:self-end"
            >
              <span className="border-b border-white/35 pb-1 text-[0.72rem] font-bold uppercase tracking-[0.18em] transition-colors group-hover:border-[var(--mallorca-butter)]">
                Ver todas
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--mallorca-red)] transition-transform duration-300 group-hover:scale-105 group-hover:bg-[var(--mallorca-red-dark)]">
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </Link>
          </div>

          <div className="grid gap-8 md:grid-cols-2 md:gap-6 lg:gap-8">
            {branches.slice(0, 2).map((branch, index) => {
              const shortName = branch.shortName || branch.name.replace(/^Mallorca\s+/i, "");
              const addressLines = formatBranchPostalLines(branch);
              const [streetLine, ...restLines] = addressLines;
              const placeLine = [branch.neighborhood, branch.city].filter(Boolean).join(" · ");
              const hoursToday = todayHoursLabel(branch.hours);
              const services = [
                branch.pickupAvailable ? "Recolección" : null,
                branch.deliveryAvailable ? "Entrega" : null,
              ].filter(Boolean);
              return (
                <Link
                  key={branch.id}
                  href={`/sucursales/${branch.slug}`}
                  className="group flex flex-col border border-white/12 bg-white/[0.03] transition-colors duration-300 hover:border-white/25 hover:bg-white/[0.055]"
                >
                  <div className="relative aspect-[5/4] overflow-hidden bg-[var(--mallorca-sand)] md:aspect-[16/11]">
                    <ImageWithFallback
                      src={branchImageFor(branch.slug, branch.imageUrl)}
                      alt={branch.name}
                      className="mallorca-image h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                      fallback={
                        <img
                          src={branchLocalImage(branch.slug)}
                          alt={branch.name}
                          className="mallorca-image h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                        />
                      }
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--mallorca-cacao)]/80 via-[var(--mallorca-cacao)]/15 to-transparent" />
                    <span className="absolute left-4 top-4 mallorca-kicker text-white/80 md:left-5 md:top-5">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 md:p-6">
                      <div className="min-w-0">
                        <span className="mallorca-kicker text-white/70">
                          {branch.neighborhood || branch.city}
                        </span>
                        <h3 className="mallorca-display mt-2 text-3xl leading-none md:text-4xl">
                          {shortName}
                        </h3>
                      </div>
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[var(--mallorca-cacao)] transition-colors duration-300 group-hover:bg-[var(--mallorca-red)] group-hover:text-white">
                        <ArrowUpRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col gap-4 p-5 md:gap-5 md:p-6">
                    <div className="flex items-start gap-2.5">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--mallorca-butter)]" />
                      <div className="min-w-0 text-sm leading-relaxed text-white/75">
                        <p>{streetLine || placeLine}</p>
                        {streetLine && (restLines[0] || placeLine) ? (
                          <p className="mt-1 text-white/55">{restLines[0] || placeLine}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/10 pt-4 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/55">
                      {hoursToday ? (
                        <span className="inline-flex items-center gap-1.5 text-white/80">
                          <Clock className="h-3.5 w-3.5 text-[var(--mallorca-butter)]" />
                          {hoursToday}
                        </span>
                      ) : null}
                      {hoursToday && services.length > 0 ? (
                        <span className="hidden text-white/25 sm:inline" aria-hidden>
                          ·
                        </span>
                      ) : null}
                      {services.map((service, serviceIndex) => (
                        <span key={service} className="inline-flex items-center gap-3">
                          {serviceIndex > 0 ? (
                            <span className="text-white/25" aria-hidden>
                              ·
                            </span>
                          ) : null}
                          {service}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
      ) : null}

      <section className="bg-[var(--mallorca-cream)] px-5 py-16 sm:py-20 md:px-8 md:py-28">
        <div className="container mx-auto">
          <div className="grid items-stretch gap-8 sm:gap-10 md:gap-12 lg:grid-cols-2 lg:gap-14 xl:gap-20">
            <div className="relative order-1 overflow-hidden bg-[var(--mallorca-sand)] lg:order-none">
              <img
                src={storeHistoryPhoto}
                alt="Pastelería Mallorca: ayer y hoy"
                className="mallorca-image aspect-[16/11] w-full object-cover sm:aspect-[5/4] md:aspect-[16/11] lg:aspect-auto lg:h-full lg:min-h-[28rem] xl:min-h-[34rem]"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--mallorca-cacao)]/20 via-transparent to-transparent" />
            </div>

            <div className="order-2 flex min-w-0 flex-col justify-center lg:py-2 xl:py-6">
              <span className="mallorca-kicker text-[var(--mallorca-red)]">De Madrid a México</span>

              <div
                className="mt-6 grid grid-cols-2 gap-x-4 gap-y-1 border-y border-[var(--mallorca-cacao)]/10 py-5 sm:mt-8 sm:gap-x-8 sm:py-6 md:mt-10"
                aria-label="Línea temporal de Mallorca"
              >
                <div>
                  <p className="font-serif text-[clamp(2.25rem,10vw,4rem)] leading-none tracking-[-0.04em] text-[var(--mallorca-red)]">
                    1931
                  </p>
                  <p className="mt-2 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--mallorca-cacao)]/50 sm:mt-2.5">
                    Madrid
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-serif text-[clamp(2.25rem,10vw,4rem)] leading-none tracking-[-0.04em] text-[var(--mallorca-cacao)]">
                    2016
                  </p>
                  <p className="mt-2 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--mallorca-cacao)]/50 sm:mt-2.5">
                    CDMX
                  </p>
                </div>
                <div className="col-span-2 mt-3 flex items-center gap-2 sm:mt-4">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--mallorca-red)]" />
                  <span className="h-px flex-1 bg-[var(--mallorca-red)]/30" />
                  <span className="shrink-0 text-[0.6rem] font-bold uppercase tracking-[0.2em] text-[var(--mallorca-red)]/40">
                    Atlántico
                  </span>
                  <span className="h-px flex-1 bg-[var(--mallorca-cacao)]/20" />
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--mallorca-cacao)]" />
                </div>
              </div>

              <h2 className="mallorca-display mt-7 max-w-xl text-[clamp(1.85rem,7.5vw,3.5rem)] leading-[1.02] sm:mt-9 sm:leading-[0.95]">
                La tradición cruzó el Atlántico.
              </h2>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground sm:mt-5 sm:text-[0.95rem] md:text-base">
                Para encontrarse con la Ciudad de México: su luz, sus sobremesas y la hospitalidad de compartir algo bueno.
              </p>

              <button
                type="button"
                aria-expanded={historyOpen}
                aria-controls="mallorca-historia"
                onClick={() => setHistoryOpen((open) => !open)}
                className="group mt-7 inline-flex max-w-full items-center gap-3 self-start text-left sm:mt-9"
              >
                <span className="border-b border-[var(--mallorca-red)]/35 pb-1 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--mallorca-red)] transition-colors group-hover:border-[var(--mallorca-red)] sm:text-[0.72rem] sm:tracking-[0.18em]">
                  {historyOpen ? "Ocultar historia" : "Conoce nuestra historia"}
                </span>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--mallorca-red)] text-white transition-colors duration-300 group-hover:bg-[var(--mallorca-red-dark)] sm:h-10 sm:w-10">
                  <Plus
                    className={cn(
                      "h-3.5 w-3.5 transition-transform duration-300 sm:h-4 sm:w-4",
                      historyOpen && "rotate-45",
                    )}
                  />
                </span>
              </button>

              <div
                id="mallorca-historia"
                role="region"
                aria-label="Nuestra historia"
                className={cn(
                  "grid transition-[grid-template-rows,opacity] duration-500 ease-out",
                  historyOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                )}
              >
                <div className="min-h-0 overflow-hidden" inert={!historyOpen}>
                  <ol className="ml-3 mt-7 max-w-md border-l border-[var(--mallorca-red)]/25 pl-5 sm:mt-8">
                    {HISTORY_MILESTONES.map((item) => (
                      <li key={item.title} className="relative pb-6 last:pb-0">
                        <span className="absolute -left-[1.6rem] top-1.5 h-2 w-2 rounded-full bg-[var(--mallorca-red)] ring-4 ring-[var(--mallorca-cream)]" />
                        {item.year ? (
                          <p className="font-serif text-2xl leading-none text-[var(--mallorca-red)]">{item.year}</p>
                        ) : null}
                        <p className={cn("text-sm font-semibold text-foreground", item.year && "mt-1.5")}>
                          {item.title}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                      </li>
                    ))}
                  </ol>
                  <Link
                    href="/sucursales"
                    className="editorial-link mt-6 text-sm font-bold text-[var(--mallorca-red)]"
                  >
                    Visita nuestras sucursales <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden bg-[var(--mallorca-white)] py-16 md:py-24" aria-label="Sabores Mallorca">
        <div className="container mx-auto mb-6 flex justify-end gap-2 px-5 md:mb-8 md:px-8">
          <button
            type="button"
            aria-label="Sabores anteriores"
            disabled={!flavorsCanPrev}
            onClick={() => flavorsApi?.scrollPrev()}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full border border-[var(--mallorca-cacao)]/20 text-[var(--mallorca-cacao)] transition-colors sm:h-11 sm:w-11",
              flavorsCanPrev
                ? "hover:border-[var(--mallorca-red)] hover:bg-[var(--mallorca-red)] hover:text-white"
                : "cursor-not-allowed opacity-35",
            )}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Sabores siguientes"
            disabled={!flavorsCanNext}
            onClick={() => flavorsApi?.scrollNext()}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full border border-[var(--mallorca-cacao)]/20 text-[var(--mallorca-cacao)] transition-colors sm:h-11 sm:w-11",
              flavorsCanNext
                ? "hover:border-[var(--mallorca-red)] hover:bg-[var(--mallorca-red)] hover:text-white"
                : "cursor-not-allowed opacity-35",
            )}
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <Carousel
          setApi={setFlavorsApi}
          opts={{
            align: "start",
            dragFree: true,
            containScroll: "trimSnaps",
            loop: true,
          }}
        >
          <CarouselContent className="-ml-3 sm:-ml-4 md:-ml-5">
            {storeMosaicImages.map((image) => (
              <CarouselItem
                key={image.src}
                className="basis-[82%] pl-3 sm:basis-[48%] sm:pl-4 md:basis-[38%] md:pl-5 lg:basis-[30%]"
              >
                <figure className="group relative overflow-hidden bg-[var(--mallorca-sand)]">
                  <img
                    src={image.src}
                    alt={image.alt}
                    className="mallorca-image aspect-[3/4] w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] sm:aspect-[4/5]"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--mallorca-cacao)]/75 via-[var(--mallorca-cacao)]/15 to-transparent" />
                  <figcaption className="absolute inset-x-0 bottom-0 p-4 text-white sm:p-5">
                    <span className="mallorca-kicker text-white/65">{image.kicker}</span>
                    <p className="mallorca-display mt-1.5 text-2xl leading-none sm:text-3xl">{image.title}</p>
                  </figcaption>
                </figure>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </section>
    </StoreLayout>
  );
}