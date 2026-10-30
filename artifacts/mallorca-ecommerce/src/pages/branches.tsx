import { StoreLayout } from "@/components/layout/store-layout";
import { useListBranches } from "@workspace/api-client-react";
import { Link } from "wouter";
import { ArrowUpRight, CalendarCheck, Clock, Instagram, MapPin, Phone } from "lucide-react";
import { ImageWithFallback } from "@/components/image-with-fallback";
import { formatBranchPostalLines } from "@/lib/availability-copy";
import { branchImageFor, branchLocalImage, storeBranchesHero } from "@/lib/store-media";
import { cn } from "@/lib/utils";
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

function formatMxPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  const local = (value: string) =>
    value.length === 10 ? `${value.slice(0, 2)} ${value.slice(2, 6)} ${value.slice(6)}` : value;
  if (digits.length === 10) return local(digits);
  if (digits.length === 12 && digits.startsWith("52")) return `+52 ${local(digits.slice(2))}`;
  if (digits.length === 13 && digits.startsWith("521")) return `+52 ${local(digits.slice(3))}`;
  return raw.trim();
}

function todayHoursLabel(
  hours: Array<{ day: string; open: string; close: string; closed: boolean }> | null | undefined,
) {
  if (!hours?.length) return null;
  const today = new Date().getDay();
  const match = hours.find((hour) => WEEKDAY_INDEX[hour.day] === today);
  if (!match) return null;
  if (match.closed) return "Cerrado hoy";
  return `Hoy ${match.open}–${match.close}`;
}

export default function Branches() {
  const { data: branchesData, isLoading } = useListBranches();
  const branches = Array.isArray(branchesData) ? branchesData : undefined;

  return (
    <StoreLayout>
      <section className="relative isolate flex h-[calc(100dvh-var(--store-header-height,4.5rem))] max-h-[calc(100dvh-var(--store-header-height,4.5rem))] flex-col overflow-hidden bg-[var(--mallorca-cacao)] px-5 py-6 text-[var(--mallorca-ivory)] sm:py-7 md:px-8 md:py-8">
        <img
          src={storeBranchesHero}
          alt=""
          aria-hidden
          className="mallorca-image absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-[var(--mallorca-cacao)]/78" />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--mallorca-cacao)] via-[var(--mallorca-cacao)]/55 to-[var(--mallorca-cacao)]/40" />
        <div className="absolute inset-0 bg-[var(--mallorca-red)]/10 mix-blend-multiply" />

        <div className="container relative z-10 mx-auto flex min-h-0 w-full flex-1 flex-col">
          <div className="shrink-0 max-w-3xl">
            <span className="mallorca-kicker text-[var(--mallorca-butter)]">Ven a vernos</span>
            <h1 className="mallorca-display mt-2 text-[clamp(2.25rem,7vw,4.25rem)] leading-[0.9] sm:mt-3">
              ¿Dónde nos vemos?
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/75 sm:mt-3 sm:text-[0.95rem]">
              Encuentra tu Mallorca: pan recién horneado, algo dulce y una pausa en la ciudad.
            </p>
          </div>

          <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain sm:mt-6 md:mt-7">
            {isLoading ? (
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:gap-5 xl:grid-cols-3">
                {[1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="flex min-h-0 flex-col overflow-hidden border border-white/10 bg-white/[0.04]"
                  >
                    <div className="h-[min(9rem,22dvh)] animate-pulse bg-white/10" />
                    <div className="space-y-3 p-4 sm:p-5">
                      <div className="h-6 w-2/3 animate-pulse bg-white/10" />
                      <div className="h-3.5 w-full animate-pulse bg-white/10" />
                      <div className="h-3.5 w-1/2 animate-pulse bg-white/10" />
                    </div>
                  </div>
                ))}
              </div>
            ) : branches && branches.length > 0 ? (
              <div
                className={cn(
                  "grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:gap-5",
                  branches.length > 2 && "xl:grid-cols-3",
                )}
              >
                {branches.map((branch, index) => {
                  const shortName = branch.shortName || branch.name.replace(/^Mallorca\s+/i, "");
                  const addressLines = formatBranchPostalLines(branch);
                  const [streetLine, ...restLines] = addressLines;
                  const hoursToday = todayHoursLabel(branch.hours);
                  const services = [
                    branch.pickupAvailable ? "Recolección" : null,
                    branch.deliveryAvailable ? "Entrega" : null,
                  ].filter(Boolean);

                  const links = branchLinks(branch);

                  return (
                    <article
                      key={branch.id}
                      className={cn(
                        "group relative flex min-h-0 flex-col overflow-hidden border border-white/12 bg-white/[0.04]",
                        "transition-colors duration-300 hover:border-white/28 hover:bg-white/[0.07]",
                      )}
                    >
                      <div className="relative h-[min(8.5rem,20dvh)] shrink-0 overflow-hidden bg-[var(--mallorca-sand)] sm:h-[min(10rem,24dvh)] md:h-[min(11.5rem,26dvh)]">
                        <ImageWithFallback
                          src={branchImageFor(branch.slug, branch.imageUrl)}
                          alt={`Sucursal ${branch.name}`}
                          className="mallorca-image h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                          fallback={
                            <img
                              src={branchLocalImage(branch.slug)}
                              alt={`Sucursal ${branch.name}`}
                              className="mallorca-image h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                            />
                          }
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[var(--mallorca-cacao)]/80 via-[var(--mallorca-cacao)]/15 to-transparent" />
                        <span className="absolute left-3 top-3 mallorca-kicker text-white/85 sm:left-4 sm:top-4">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        {!branch.active ? (
                          <span className="absolute right-3 top-3 bg-[var(--mallorca-cacao)]/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-sm sm:right-4">
                            Cerrada temporalmente
                          </span>
                        ) : null}
                        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3 sm:gap-3 sm:p-4">
                          <div className="min-w-0">
                            {(branch.neighborhood || branch.city) && (
                              <span className="mallorca-kicker text-white/70">
                                {branch.neighborhood || branch.city}
                              </span>
                            )}
                            <h2 className="mallorca-display mt-1 truncate text-xl leading-none text-white sm:text-2xl md:text-[1.75rem]">
                              {shortName}
                            </h2>
                          </div>
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[var(--mallorca-cacao)] transition-colors duration-300 group-hover:bg-[var(--mallorca-red)] group-hover:text-white sm:h-10 sm:w-10">
                            <ArrowUpRight className="h-4 w-4" />
                          </span>
                        </div>
                      </div>

                      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden p-3.5 sm:gap-3 sm:p-4 md:p-5">
                        <div className="flex items-start gap-2 text-xs leading-snug text-white/70 sm:text-sm">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--mallorca-butter)] sm:h-4 sm:w-4" />
                          <div className="min-w-0">
                            {streetLine ? (
                              <p className="truncate font-medium text-white/90">{streetLine}</p>
                            ) : null}
                            {restLines.length > 0 ? (
                              <p className={cn("truncate text-white/55", streetLine ? "mt-0.5" : null)}>
                                {restLines.slice(0, 2).join(" · ")}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        {branch.phone ? (
                          <p className="flex items-center gap-2 text-xs text-white/90 sm:text-sm">
                            <Phone className="h-3.5 w-3.5 shrink-0 text-[var(--mallorca-butter)] sm:h-4 sm:w-4" />
                            <span className="font-medium">{formatMxPhone(branch.phone)}</span>
                          </p>
                        ) : null}

                        <div className="mt-auto space-y-2 border-t border-white/10 pt-2.5 sm:space-y-2.5 sm:pt-3">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-white/55 sm:text-[0.68rem] sm:tracking-[0.14em]">
                            {hoursToday ? (
                              <span className="inline-flex items-center gap-1.5 text-white/80">
                                <Clock className="h-3 w-3 text-[var(--mallorca-butter)] sm:h-3.5 sm:w-3.5" />
                                <span className="truncate">{hoursToday}</span>
                              </span>
                            ) : null}
                            {hoursToday && services.length > 0 ? (
                              <span className="text-white/25" aria-hidden>
                                ·
                              </span>
                            ) : null}
                            {services.length > 0 ? <span>{services.join(" · ")}</span> : null}
                          </div>

                          {links.length > 0 ? (
                            <div className="relative z-10 flex flex-wrap gap-1.5 sm:gap-2">
                              {links.map((link) => (
                                <a
                                  key={link.kind}
                                  href={link.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={link.kind === "instagram" ? `Instagram de ${branch.name}` : undefined}
                                  className={cn(
                                    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[0.65rem] font-semibold uppercase tracking-[0.12em] transition-colors sm:h-9 sm:px-3.5 sm:text-[0.7rem]",
                                    link.kind === "instagram"
                                      ? "w-8 justify-center border-white/20 px-0 text-white hover:border-[var(--mallorca-butter)] hover:text-[var(--mallorca-butter)] sm:w-9"
                                      : "border-[var(--mallorca-red)] bg-[var(--mallorca-red)] text-white hover:bg-[var(--mallorca-red-dark)]",
                                  )}
                                >
                                  {link.kind === "instagram" ? (
                                    <Instagram className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                  ) : (
                                    <>
                                      <CalendarCheck className="h-3.5 w-3.5" />
                                      {link.label}
                                    </>
                                  )}
                                </a>
                              ))}
                            </div>
                          ) : null}

                          <Link
                            href={`/sucursales/${branch.slug}`}
                            className="inline-flex items-center gap-2 pt-0.5 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--mallorca-butter)] after:absolute after:inset-0 after:content-[''] sm:text-[0.72rem]"
                          >
                            Ver detalles
                            <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center border border-dashed border-white/20 bg-white/[0.03] px-6 py-12 text-center">
                <p className="text-white/65">No hay sucursales disponibles en este momento.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </StoreLayout>
  );
}
