import { StoreLayout } from "@/components/layout/store-layout";
import { useListBranches } from "@workspace/api-client-react";
import { Link } from "wouter";
import { ArrowUpRight, Clock, MapPin, Phone } from "lucide-react";
import { ImageWithFallback } from "@/components/image-with-fallback";
import { formatBranchPostalLines } from "@/lib/availability-copy";
import { branchImageFor, branchLocalImage, storeBranchesHero } from "@/lib/store-media";
import { cn } from "@/lib/utils";

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
      <section className="relative isolate overflow-hidden bg-[var(--mallorca-cacao)] px-5 py-16 text-[var(--mallorca-ivory)] sm:py-20 md:px-8 md:py-28">
        <img
          src={storeBranchesHero}
          alt=""
          aria-hidden
          className="mallorca-image absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-[var(--mallorca-cacao)]/72" />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--mallorca-cacao)] via-[var(--mallorca-cacao)]/55 to-[var(--mallorca-cacao)]/35" />
        <div className="absolute inset-0 bg-[var(--mallorca-red)]/10 mix-blend-multiply" />
        <div className="container relative z-10 mx-auto max-w-3xl">
          <span className="mallorca-kicker text-[var(--mallorca-butter)]">Ven a vernos</span>
          <h1 className="mallorca-display mt-4 text-[clamp(2.75rem,9vw,5.5rem)] leading-[0.9]">
            ¿Dónde nos vemos?
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-white/75 sm:mt-6 sm:text-base">
            Encuentra tu Mallorca: pan recién horneado, algo dulce y una pausa en la ciudad.
          </p>
        </div>
      </section>

      <section className="bg-[var(--mallorca-cream)] px-5 py-12 sm:py-16 md:px-8 md:py-20 lg:py-24">
        <div className="container mx-auto">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="overflow-hidden border border-[var(--mallorca-cacao)]/10 bg-[var(--mallorca-white)]">
                  <div className="aspect-[16/10] animate-pulse bg-[var(--mallorca-sand)]" />
                  <div className="space-y-4 p-6 sm:p-7">
                    <div className="h-8 w-2/3 animate-pulse bg-[var(--mallorca-sand)]" />
                    <div className="h-4 w-full animate-pulse bg-[var(--mallorca-sand)]" />
                    <div className="h-4 w-1/2 animate-pulse bg-[var(--mallorca-sand)]" />
                  </div>
                </div>
              ))}
            </div>
          ) : branches && branches.length > 0 ? (
            <div
              className={cn(
                "grid grid-cols-1 gap-6 sm:gap-8 md:grid-cols-2",
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

                return (
                  <Link
                    key={branch.id}
                    href={`/sucursales/${branch.slug}`}
                    className={cn(
                      "group flex flex-col overflow-hidden border border-[var(--mallorca-cacao)]/12 bg-[var(--mallorca-white)]",
                      "transition-colors duration-300 hover:border-[var(--mallorca-red)]/45",
                    )}
                  >
                    <div className="relative aspect-[16/10] overflow-hidden bg-[var(--mallorca-sand)]">
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
                      <div className="absolute inset-0 bg-gradient-to-t from-[var(--mallorca-cacao)]/70 via-[var(--mallorca-cacao)]/10 to-transparent" />
                      <span className="absolute left-4 top-4 mallorca-kicker text-white/85 sm:left-5 sm:top-5">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {!branch.active ? (
                        <span className="absolute right-4 top-4 bg-[var(--mallorca-cacao)]/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white backdrop-blur-sm sm:right-5 sm:top-5">
                          Cerrada temporalmente
                        </span>
                      ) : null}
                      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 sm:p-5">
                        <div className="min-w-0">
                          {(branch.neighborhood || branch.city) && (
                            <span className="mallorca-kicker text-white/70">
                              {branch.neighborhood || branch.city}
                            </span>
                          )}
                          <h2 className="mallorca-display mt-1.5 truncate text-[1.75rem] leading-none text-white sm:text-3xl">
                            {shortName}
                          </h2>
                        </div>
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[var(--mallorca-cacao)] transition-colors duration-300 group-hover:bg-[var(--mallorca-red)] group-hover:text-white sm:h-11 sm:w-11">
                          <ArrowUpRight className="h-4 w-4" />
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col gap-4 p-5 sm:gap-5 sm:p-6 md:p-7">
                      <div className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--mallorca-red)]" />
                        <div className="min-w-0">
                          {streetLine ? <p className="font-medium text-foreground">{streetLine}</p> : null}
                          {restLines.length > 0 ? (
                            <p className={cn(streetLine ? "mt-1" : null)}>
                              {restLines.slice(0, 2).join(" · ")}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {branch.phone ? (
                        <p className="flex items-center gap-2.5 text-sm text-foreground">
                          <Phone className="h-4 w-4 shrink-0 text-[var(--mallorca-red)]" />
                          <span className="font-medium">{formatMxPhone(branch.phone)}</span>
                        </p>
                      ) : null}

                      <div className="mt-auto space-y-3 border-t border-[var(--mallorca-cacao)]/10 pt-4">
                        {hoursToday ? (
                          <p className="flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--mallorca-cacao)]">
                            <Clock className="h-3.5 w-3.5 text-[var(--mallorca-red)]" />
                            {hoursToday}
                          </p>
                        ) : branch.hours && branch.hours.length > 0 ? (
                          <div className="space-y-1.5">
                            {branch.hours.slice(0, 2).map((hour, hourIndex) => (
                              <div
                                key={`${branch.id}-${hour.day}-${hourIndex}`}
                                className="flex justify-between gap-3 text-xs text-muted-foreground"
                              >
                                <span className="font-medium text-foreground">{hour.label}</span>
                                <span className="tabular-nums">
                                  {hour.closed ? "Cerrado" : `${hour.open}–${hour.close}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {services.length > 0 ? (
                          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            {services.join(" · ")}
                          </p>
                        ) : null}

                        <span className="inline-flex items-center gap-2 pt-1 text-[0.72rem] font-bold uppercase tracking-[0.16em] text-[var(--mallorca-red)]">
                          Ver detalles
                          <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="border border-dashed border-[var(--mallorca-cacao)]/20 bg-[var(--mallorca-white)] px-6 py-20 text-center">
              <p className="text-muted-foreground">No hay sucursales disponibles en este momento.</p>
            </div>
          )}
        </div>
      </section>
    </StoreLayout>
  );
}
