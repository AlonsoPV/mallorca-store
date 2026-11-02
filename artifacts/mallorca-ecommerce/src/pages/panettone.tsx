import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowUpRight, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { StoreLayout } from "@/components/layout/store-layout";
import {
  storePanettoneCollabPhoto,
  storePanettoneGallery,
  storePanettoneVideo,
} from "@/lib/store-media";
import { cn } from "@/lib/utils";

export default function PanettonePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    document.title = "Panettone · Ton Cortés · Pastelería Mallorca";
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    if (playing) {
      void video.play().catch(() => setPlaying(false));
    } else {
      video.pause();
    }
  }, [playing, muted]);

  const portrait = storePanettoneGallery[0];
  const gallery = storePanettoneGallery.slice(1);

  return (
    <StoreLayout>
      {/* 1. Hero */}
      <section className="relative isolate flex min-h-[min(100dvh,52rem)] flex-col justify-end overflow-hidden bg-[var(--mallorca-cacao)] text-white">
        <img
          src={storePanettoneCollabPhoto}
          alt="Panettone de chocolate, colaboración con Ton Cortés"
          decoding="async"
          fetchPriority="high"
          className="mallorca-image absolute inset-0 h-full w-full object-cover object-[28%_42%] sm:object-[30%_44%] md:object-[26%_46%] lg:object-[24%_48%]"
        />
        <div
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(37,33,30,.28)_0%,rgba(37,33,30,.12)_38%,rgba(37,33,30,.78)_100%)]"
          aria-hidden
        />

        <div className="relative z-10 mx-auto w-full max-w-[1280px] px-5 pb-10 pt-28 sm:px-6 sm:pb-12 md:px-8 md:pb-14 lg:px-10 lg:pb-16">
          <span className="mallorca-kicker text-[var(--mallorca-butter)]">Colaboración · Ton Cortés</span>
          <h1 className="mallorca-display mt-3 max-w-[18ch] text-balance text-[clamp(2.1rem,6.5vw,4.25rem)] leading-[0.98] tracking-[-0.03em]">
            Hay sabores que no se explican,{" "}
            <em className="font-serif italic text-[var(--mallorca-butter)]">se sienten</em>.
          </h1>
          <p className="mt-4 max-w-xl text-[0.95rem] leading-relaxed text-white/85 sm:mt-5 sm:text-base">
            El panettone campeón del mundo encuentra casa en Pastelería Mallorca México.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-4 sm:mt-8 sm:gap-5">
            <a
              href="#panettone-video"
              className="group inline-flex items-center gap-3 text-white"
            >
              <span className="border-b border-white/35 pb-1 text-[0.72rem] font-bold uppercase tracking-[0.18em] transition-colors group-hover:border-[var(--mallorca-butter)] group-hover:text-[var(--mallorca-butter)]">
                Ver el video
              </span>
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--mallorca-red)] text-white transition-all duration-300 group-hover:scale-105 group-hover:bg-[var(--mallorca-red-dark)]">
                <Play className="h-4 w-4 translate-x-px" fill="currentColor" />
              </span>
            </a>
            <a
              href="https://www.instagram.com/tonatiuh.cortes/"
              target="_blank"
              rel="noopener noreferrer"
              className="border-b border-white/30 pb-0.5 text-sm text-white/80 transition-colors hover:border-[var(--mallorca-butter)] hover:text-[var(--mallorca-butter)]"
            >
              @tonatiuh.cortes
            </a>
          </div>
        </div>
      </section>

      {/* 2. Video */}
      <section
        id="panettone-video"
        className="bg-black text-white"
        aria-labelledby="panettone-video-heading"
      >
        <div className="mx-auto flex w-full max-w-[1280px] items-end justify-between gap-4 px-5 pt-8 sm:px-6 sm:pt-10 md:px-8 lg:px-10">
          <div>
            <span className="mallorca-kicker text-[var(--mallorca-butter)]">El oficio</span>
            <h2
              id="panettone-video-heading"
              className="mallorca-display mt-2 text-[clamp(1.5rem,3.5vw,2.25rem)] leading-[1.05]"
            >
              Así nace el panettone
            </h2>
          </div>
          <div className="flex items-center gap-2 pb-1">
            <button
              type="button"
              onClick={() => setMuted((value) => !value)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-white/5 text-white transition-colors hover:border-white/50 hover:bg-white/10"
              aria-label={muted ? "Activar sonido" : "Silenciar"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setPlaying((value) => !value)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-white/5 text-white transition-colors hover:border-white/50 hover:bg-white/10"
              aria-label={playing ? "Pausar video" : "Reproducir video"}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" fill="currentColor" />}
            </button>
          </div>
        </div>

        <div className="mx-auto mt-5 flex w-full max-w-[1280px] justify-center px-0 pb-8 sm:mt-6 sm:px-6 sm:pb-10 md:px-8 lg:px-10">
          <video
            ref={videoRef}
            className="h-auto max-h-[min(80dvh,48rem)] w-full bg-black object-contain"
            src={storePanettoneVideo}
            poster={storePanettoneCollabPhoto}
            playsInline
            muted={muted}
            loop
            autoPlay
            preload="metadata"
            controls={false}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          >
            Tu navegador no reproduce este video.
          </video>
        </div>
      </section>

      {/* 3. Info */}
      <section
        className="bg-[var(--mallorca-cacao)] text-white"
        aria-labelledby="panettone-story-heading"
      >
        <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 md:grid-cols-2">
          <div className="relative aspect-[4/5] overflow-hidden sm:aspect-[5/6] md:aspect-auto md:min-h-[min(32rem,70dvh)]">
            <img
              src={portrait.src}
              alt={portrait.alt}
              decoding="async"
              className="mallorca-image absolute inset-0 h-full w-full object-cover object-[50%_18%] transition-transform duration-700 ease-out will-change-transform md:hover:scale-[1.03]"
            />
            <div
              className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(37,33,30,.55)_100%)] md:bg-[linear-gradient(90deg,transparent_58%,rgba(37,33,30,.4)_100%)]"
              aria-hidden
            />
          </div>

          <div className="relative flex items-center px-5 py-12 sm:px-6 sm:py-14 md:px-8 md:py-16 lg:px-10 lg:py-20 xl:px-12">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(212,59,43,0.12),transparent_55%)]"
              aria-hidden
            />
            <div className="mallorca-reveal relative w-full max-w-[34rem] md:ml-auto">
              <span className="mallorca-kicker text-[var(--mallorca-butter)]">La historia</span>
              <h2
                id="panettone-story-heading"
                className="mallorca-display mt-3 text-balance text-[clamp(1.55rem,4.2vw,2.5rem)] leading-[1.08] tracking-[-0.03em]"
              >
                Campeón mundial, corazón mexicano.
              </h2>

              <div className="mt-5 space-y-4 text-[0.95rem] leading-[1.65] text-white/88 sm:mt-6">
                <p>
                  Este panettone nació del talento y la receta de Ton Cortés, maestro panadero mexicano, campeón mundial de la Copa del Mundo del Panettone 2024.
                </p>
                <p>
                  Su creación es fruto de la fermentación natural, la paciencia infinita y la precisión de un relojero. Hoy, su emblemático pan encuentra casa en Pastelería Mallorca México, un lugar donde la tradición española se mezcla con el alma mexicana.
                </p>
                <p>
                  Disfruta y descubre por qué el mejor panettone del mundo también puede tener corazón mexicano.
                </p>
              </div>

              <p className="mt-7 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-white/50">
                #TonCortes · #MallorcaMéxico · #MejorPanettoneDelMundo
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                <span className="text-white/50">Instagram</span>
                <a
                  href="https://www.instagram.com/mallorcamx/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-b border-white/30 pb-0.5 text-white transition-colors hover:border-[var(--mallorca-butter)] hover:text-[var(--mallorca-butter)]"
                >
                  @mallorcamx
                </a>
                <a
                  href="https://www.instagram.com/tonatiuh.cortes/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border-b border-white/30 pb-0.5 text-white transition-colors hover:border-[var(--mallorca-butter)] hover:text-[var(--mallorca-butter)]"
                >
                  @tonatiuh.cortes
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Fotos */}
      <section
        className="bg-[var(--mallorca-cream)]"
        aria-labelledby="panettone-photos-heading"
      >
        <div className="mx-auto w-full max-w-[1280px] px-5 py-12 sm:px-6 sm:py-14 md:px-8 md:py-16 lg:px-10">
          <div className="max-w-2xl">
            <span className="mallorca-kicker text-[var(--mallorca-red)]">Galería</span>
            <h2
              id="panettone-photos-heading"
              className="mallorca-display mt-3 text-[clamp(1.75rem,4vw,2.75rem)] leading-[0.95]"
            >
              Ton Cortés en Mallorca México
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-[var(--mallorca-cacao)]/70 md:text-base">
              El oficio, la miga y el encuentro entre dos tradiciones.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:mt-10 sm:grid-cols-2 sm:gap-3 md:gap-4 lg:mt-12 lg:grid-cols-12 lg:gap-4">
            {gallery.map((photo, index) => {
              const layout =
                index === 0
                  ? "aspect-[5/4] sm:col-span-2 sm:aspect-[16/10] lg:col-span-8 lg:aspect-auto lg:min-h-[22rem] xl:min-h-[26rem]"
                  : index === 1
                    ? "aspect-[4/5] lg:col-span-4 lg:aspect-auto lg:min-h-[22rem] xl:min-h-[26rem]"
                    : index === 5
                      ? "aspect-[5/4] sm:col-span-2 sm:aspect-[16/10] lg:col-span-12 lg:aspect-[21/9] lg:min-h-0"
                      : "aspect-[4/5] lg:col-span-4";

              const objectPosition =
                index === 0
                  ? "object-[50%_30%]"
                  : index === 2 || index === 4
                    ? "object-[50%_20%]"
                    : index === 5
                      ? "object-[50%_22%]"
                      : "object-center";

              return (
                <figure
                  key={photo.src}
                  className={cn(
                    "relative overflow-hidden bg-[var(--mallorca-cacao)]/5",
                    layout,
                  )}
                >
                  <img
                    src={photo.src}
                    alt={photo.alt}
                    loading="lazy"
                    decoding="async"
                    className={cn(
                      "mallorca-image absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out will-change-transform hover:scale-[1.03]",
                      objectPosition,
                    )}
                  />
                </figure>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-y border-[var(--mallorca-cacao)]/10 bg-[var(--mallorca-white)]">
        <div className="container mx-auto flex flex-col items-start justify-between gap-6 px-5 py-10 md:flex-row md:items-center md:gap-10 md:px-8 md:py-12">
          <div className="max-w-xl">
            <span className="mallorca-kicker text-[var(--mallorca-red)]">En casa</span>
            <h2 className="mallorca-display mt-3 text-[clamp(1.75rem,4vw,2.75rem)] leading-[0.95]">
              Pruébalo en nuestras sucursales
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground md:text-base">
              Pregunta por el panettone de Ton Cortés en tu Mallorca más cercana.
            </p>
          </div>
          <Link
            href="/sucursales"
            className="group inline-flex shrink-0 items-center gap-4 text-[var(--mallorca-cacao)]"
          >
            <span className="border-b border-[var(--mallorca-cacao)]/30 pb-1 text-[0.72rem] font-bold uppercase tracking-[0.18em] transition-colors group-hover:border-[var(--mallorca-red)] group-hover:text-[var(--mallorca-red)]">
              Ver sucursales
            </span>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--mallorca-red)] text-white shadow-[0_8px_20px_rgba(212,59,43,0.28)] transition-all duration-300 group-hover:scale-105 group-hover:bg-[var(--mallorca-red-dark)]">
              <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </span>
          </Link>
        </div>
      </section>
    </StoreLayout>
  );
}
