import { StoreLayout } from "@/components/layout/store-layout";
import { useGetBranch } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ExternalLink, Instagram, Mail, MapPin, MessageCircle, Phone, type LucideIcon } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel";
import { ImageWithFallback } from "@/components/image-with-fallback";
import { formatBranchPostalLines } from "@/lib/availability-copy";
import { cn } from "@/lib/utils";
import { branchGalleryFallback, branchImageFor, branchLocalImage } from "@/lib/store-media";
import { branchLinks } from "@/lib/branch-links";

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

type ContactRow = {
  key: string;
  label: string;
  value: string;
  href: string;
  external: boolean;
  icon: LucideIcon;
};

function formatMxPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  const local = (value: string) =>
    value.length === 10 ? `${value.slice(0, 2)} ${value.slice(2, 6)} ${value.slice(6)}` : value;
  if (digits.length === 10) return local(digits);
  if (digits.length === 12 && digits.startsWith("52")) return `+52 ${local(digits.slice(2))}`;
  if (digits.length === 13 && digits.startsWith("521")) return `+52 ${local(digits.slice(3))}`;
  return raw.trim();
}

export default function BranchDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: branch, isLoading, isError } = useGetBranch(slug || "");
  const [productsApi, setProductsApi] = useState<CarouselApi>();
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [snapCount, setSnapCount] = useState(0);
  const [selectedSnap, setSelectedSnap] = useState(0);

  useEffect(() => {
    if (!productsApi) return;
    const sync = () => {
      setCanPrev(productsApi.canScrollPrev());
      setCanNext(productsApi.canScrollNext());
      setSnapCount(productsApi.scrollSnapList().length);
      setSelectedSnap(productsApi.selectedScrollSnap());
    };
    sync();
    productsApi.on("reInit", sync);
    productsApi.on("select", sync);
    return () => {
      productsApi.off("reInit", sync);
      productsApi.off("select", sync);
    };
  }, [productsApi]);

  if (isLoading) {
    return (
      <StoreLayout>
        <div className="container mx-auto px-4 py-12 md:py-24 animate-pulse">
          <div className="h-64 bg-muted w-full mb-12" />
          <div className="flex flex-col md:flex-row gap-12">
            <div className="w-full md:w-1/3 space-y-6">
              <div className="h-10 bg-muted w-3/4" />
              <div className="h-40 bg-muted w-full" />
            </div>
            <div className="w-full md:w-2/3">
              <div className="grid grid-cols-2 gap-6">
                {[1, 2, 3, 4].map(i => <div key={i} className="aspect-[4/5] bg-muted" />)}
              </div>
            </div>
          </div>
        </div>
      </StoreLayout>
    );
  }

  if (isError || !branch) {
    return (
      <StoreLayout>
        <div className="container mx-auto px-4 py-32 text-center">
          <h2 className="font-serif text-3xl mb-4">Sucursal no encontrada</h2>
          <p className="text-muted-foreground mb-8">La sucursal que buscas no existe.</p>
          <Button asChild className="rounded-none">
            <Link href="/sucursales">Ver todas las sucursales</Link>
          </Button>
        </div>
      </StoreLayout>
    );
  }

  const links = branchLinks(branch);
  const reservationLinks = links.filter((link) => link.kind !== "instagram");
  const instagramLink = links.find((link) => link.kind === "instagram");
  const whatsappHref = branch.whatsapp
    ? `https://wa.me/${branch.whatsapp.replace(/\D/g, "")}${
        (branch as any).whatsappDefaultMessage
          ? `?text=${encodeURIComponent((branch as any).whatsappDefaultMessage)}`
          : ""
      }`
    : null;
  const gallery = Array.isArray(branch.gallery)
    ? branch.gallery.filter((url) => typeof url === "string" && url.trim().length > 0)
    : [];
  const heroImage = branchImageFor(branch.slug, branch.imageUrl);
  const addressLines = formatBranchPostalLines(branch);
  const [streetLine, ...restLines] = addressLines;
  const today = new Date().getDay();
  const contact: ContactRow[] = [
    branch.phone
      ? {
          key: "phone",
          label: "Teléfono",
          value: formatMxPhone(branch.phone),
          href: `tel:${branch.phone.replace(/\s/g, "")}`,
          external: false,
          icon: Phone,
        }
      : null,
    branch.email
      ? {
          key: "email",
          label: "Correo",
          value: branch.email,
          href: `mailto:${branch.email}`,
          external: false,
          icon: Mail,
        }
      : null,
    whatsappHref && branch.whatsapp
      ? {
          key: "whatsapp",
          label: "WhatsApp",
          value: formatMxPhone(branch.whatsapp),
          href: whatsappHref,
          external: true,
          icon: MessageCircle,
        }
      : null,
    instagramLink
      ? {
          key: "instagram",
          label: "Instagram",
          value: `@${new URL(instagramLink.href).pathname.split("/").filter(Boolean)[0] ?? ""}`,
          href: instagramLink.href,
          external: true,
          icon: Instagram,
        }
      : null,
  ].filter((item): item is ContactRow => item != null);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: branch.name,
    description: (branch as any).metaDescription || branch.description || (branch as any).shortDescription,
    image: (branch as any).ogImageUrl || heroImage || undefined,
    telephone: branch.phone,
    email: branch.email,
    url: typeof window !== "undefined" ? window.location.href : undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: (branch as any).street || branch.address,
      addressLocality: branch.city,
      addressRegion: branch.state,
      postalCode: branch.postalCode,
      addressCountry: branch.country || "MX",
    },
    geo:
      branch.latitude != null && branch.longitude != null
        ? { "@type": "GeoCoordinates", latitude: branch.latitude, longitude: branch.longitude }
        : undefined,
  };

  return (
    <StoreLayout>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* Branch Hero */}
      <div className="relative h-[40dvh] min-h-[300px] w-full bg-foreground flex items-end">
        <ImageWithFallback
          src={heroImage}
          alt={branch.name}
          className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-overlay"
          fallback={
            <img
              src={branchLocalImage(branch.slug)}
              alt={branch.name}
              className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-overlay"
            />
          }
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        
        <div className="container mx-auto px-4 relative z-10 pb-8">
          <Link href="/sucursales" className="inline-flex items-center text-sm font-medium text-foreground/70 hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver a sucursales
          </Link>
          <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl text-foreground">
            {branch.name}
          </h1>
          {(branch as any).shortDescription && (
            <p className="mt-3 max-w-2xl text-foreground/80">{(branch as any).shortDescription}</p>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            {reservationLinks.map((link, index) => (
              <Button
                key={link.kind}
                asChild
                variant={index === 0 ? "default" : "outline"}
                className={cn("rounded-none", index > 0 && "bg-background/80")}
              >
                <a href={link.href} target="_blank" rel="noopener noreferrer">{link.label}</a>
              </Button>
            ))}
            <Button asChild variant="outline" className="rounded-none bg-background/80">
              <Link href={`/tienda?branch=${branch.slug}`}>Pedir</Link>
            </Button>
            {branch.mapsUrl && (
              <Button asChild variant="outline" className="rounded-none bg-background/80">
                <a href={branch.mapsUrl} target="_blank" rel="noopener noreferrer">Cómo llegar</a>
              </Button>
            )}
            {whatsappHref && (
              <Button asChild variant="outline" className="rounded-none bg-background/80">
                <a href={whatsappHref} target="_blank" rel="noopener noreferrer">WhatsApp</a>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        <div className="flex flex-col lg:flex-row gap-16">
          
          {/* Info Sidebar */}
          <aside className="w-full lg:w-1/3 shrink-0 flex flex-col gap-10">
            {branch.description && (
              <div>
                <p className="font-sans text-foreground/80 leading-relaxed text-lg font-light">
                  {branch.description}
                </p>
              </div>
            )}

            <div className="border border-border bg-card">
                    <div className="p-6 sm:p-7">
                      <h3 className="mallorca-kicker text-[var(--mallorca-cacao)]">Ubicación</h3>
                      {streetLine ? (
                        <p className="mt-3 flex items-start gap-2.5 font-serif text-[1.35rem] leading-tight text-foreground">
                          <MapPin className="mt-1 h-4 w-4 shrink-0 text-primary" />
                          <span>{streetLine}</span>
                        </p>
                      ) : null}
                      {restLines.length > 0 ? (
                        <p className={cn("text-sm leading-6 text-muted-foreground", streetLine ? "mt-2 pl-[1.625rem]" : "mt-3")}>
                          {restLines.map((line) => (
                            <span key={line} className="block">
                              {line}
                            </span>
                          ))}
                        </p>
                      ) : null}
                    </div>

                    {branch.mapsUrl ? (
                      <a
                        href={branch.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-3 border-t border-border bg-[var(--mallorca-sand)]/55 px-6 py-3.5 text-sm font-medium text-foreground transition-colors hover:bg-[var(--mallorca-sand)] sm:px-7"
                      >
                        Ver en Google Maps
                        <ExternalLink className="h-4 w-4 shrink-0" />
                      </a>
                    ) : null}

                    {contact.length > 0 ? (
                      <div className="border-t border-border px-6 py-6 sm:px-7">
                        <h3 className="mallorca-kicker text-[var(--mallorca-cacao)]">Contacto</h3>
                        <ul className="mt-4 space-y-1">
                          {contact.map((item) => {
                            const Icon = item.icon;
                            return (
                              <li key={item.key}>
                                <a
                                  href={item.href}
                                  {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                                  className="group -mx-2 flex items-center gap-3 px-2 py-2 transition-colors hover:bg-secondary/50"
                                >
                                  <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-[var(--mallorca-sand)] text-[var(--mallorca-cacao)]">
                                    <Icon className="h-4 w-4" />
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                      {item.label}
                                    </span>
                                    <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">
                                      {item.value}
                                    </span>
                                  </span>
                                </a>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}

                    {branch.hours && branch.hours.length > 0 ? (
                      <div className="border-t border-border px-6 py-6 sm:px-7">
                        <h3 className="mallorca-kicker text-[var(--mallorca-cacao)]">Horario</h3>
                        <ul className="mt-4">
                          {branch.hours.map((hour, index) => {
                            const isToday = WEEKDAY_INDEX[hour.day] === today;
                            return (
                              <li
                                key={`${hour.day}-${index}`}
                                className={cn(
                                  "flex items-center justify-between gap-4 py-1.5 text-sm",
                                  isToday && "-mx-2 bg-[var(--mallorca-sand)]/70 px-2",
                                  hour.closed && "text-muted-foreground",
                                )}
                              >
                                <span className="flex items-center gap-2 font-medium">
                                  {hour.label}
                                  {isToday ? (
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--mallorca-cacao)]">
                                      Hoy
                                    </span>
                                  ) : null}
                                </span>
                                <span className="whitespace-nowrap tabular-nums">
                                  {hour.closed ? "Cerrado" : `${hour.open}–${hour.close}`}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-2 border-t border-border">
                      {[
                        { label: "Recolección", available: branch.pickupAvailable },
                        { label: "Entrega", available: branch.deliveryAvailable },
                      ].map((service, index) => (
                        <div
                          key={service.label}
                          className={cn("px-6 py-4 sm:px-7", index === 0 && "border-r border-border")}
                        >
                          <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            {service.label}
                          </span>
                          <span className="mt-1.5 flex items-center gap-2 text-sm font-medium">
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                service.available ? "bg-[var(--mallorca-olive)]" : "bg-muted-foreground/35",
                              )}
                            />
                            {service.available ? "Disponible" : "No disponible"}
                          </span>
                        </div>
                      ))}
                    </div>

                    {reservationLinks.length > 0 ? (
                      <div className="space-y-2.5 border-t border-border p-6 sm:p-7">
                        {reservationLinks.map((link, index) => (
                          <Button
                            key={link.kind}
                            asChild
                            variant={index === 0 ? "default" : "outline"}
                            className={cn(
                              "h-12 w-full rounded-none",
                              index === 0 && "bg-foreground text-background hover:bg-foreground/90",
                            )}
                          >
                            <a href={link.href} target="_blank" rel="noopener noreferrer">
                              {link.label}
                            </a>
                          </Button>
                        ))}
                      </div>
                    ) : null}
            </div>

            {gallery.length > 0 && (
              <div>
                <h3 className="font-sans text-xs uppercase tracking-widest font-semibold mb-4 text-foreground/70">Galería</h3>
                <div className="grid grid-cols-2 gap-2">
                  {gallery.map((url, i) => (
                    <ImageWithFallback
                      key={`${url}-${i}`}
                      src={url}
                      alt={`${branch.name} ${i + 1}`}
                      className="aspect-square w-full object-cover"
                      fallback={
                        <img
                          src={branchGalleryFallback(branch.slug, i)}
                          alt={`${branch.name} ${i + 1}`}
                          className="aspect-square w-full object-cover"
                        />
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* Branch Products */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 mb-8 pb-4 border-b border-border">
              <div>
                <h2 className="font-serif text-2xl sm:text-3xl">Disponible en esta sucursal</h2>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {branch.products?.length || 0} productos
                </span>
              </div>
              {branch.products && branch.products.length > 0 && (canPrev || canNext) ? (
                <div className="flex items-center gap-2">
                  {[
                    { label: "Productos anteriores", enabled: canPrev, onClick: () => productsApi?.scrollPrev(), Icon: ArrowLeft },
                    { label: "Productos siguientes", enabled: canNext, onClick: () => productsApi?.scrollNext(), Icon: ArrowRight },
                  ].map(({ label, enabled, onClick, Icon }) => (
                    <button
                      key={label}
                      type="button"
                      aria-label={label}
                      disabled={!enabled}
                      onClick={onClick}
                      className={cn(
                        "flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-full border border-[var(--mallorca-cacao)]/20 text-[var(--mallorca-cacao)] transition-colors",
                        enabled
                          ? "hover:border-[var(--mallorca-red)] hover:bg-[var(--mallorca-red)] hover:text-white"
                          : "cursor-not-allowed opacity-35",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {branch.products && branch.products.length > 0 ? (
              <Carousel
                setApi={setProductsApi}
                opts={{ align: "start", containScroll: "trimSnaps" }}
              >
                <CarouselContent className="-ml-4 md:-ml-6">
                  {branch.products.map(product => (
                    <CarouselItem
                      key={product.id}
                      className="basis-[82%] pl-4 sm:basis-1/2 md:pl-6 xl:basis-1/3"
                    >
                      <ProductCard
                        product={product}
                        showBranchAvailability={true}
                      />
                    </CarouselItem>
                  ))}
                </CarouselContent>
                {snapCount > 1 ? (
                  <div className="mt-8 flex justify-center gap-2">
                    {Array.from({ length: snapCount }, (_, index) => (
                      <button
                        key={index}
                        type="button"
                        aria-label={`Ir al grupo ${index + 1}`}
                        aria-current={index === selectedSnap}
                        onClick={() => productsApi?.scrollTo(index)}
                        className={cn(
                          "h-1.5 rounded-full transition-all",
                          index === selectedSnap
                            ? "w-6 bg-[var(--mallorca-red)]"
                            : "w-1.5 bg-[var(--mallorca-cacao)]/25 hover:bg-[var(--mallorca-cacao)]/50",
                        )}
                      />
                    ))}
                  </div>
                ) : null}
              </Carousel>
            ) : (
              <div className="py-20 text-center bg-secondary/20 border border-border">
                <p className="text-muted-foreground">No hay productos listados para esta sucursal.</p>
              </div>
            )}
          </div>
          
        </div>
      </div>
    </StoreLayout>
  );
}