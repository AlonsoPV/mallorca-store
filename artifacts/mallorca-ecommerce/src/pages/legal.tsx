import { Fragment, useEffect, useMemo, type ReactNode } from "react";
import { Link } from "wouter";
import { ArrowUpRight } from "lucide-react";
import { StoreLayout } from "@/components/layout/store-layout";
import { parseLegalDoc } from "@/lib/legal-doc";
import termsRaw from "../../../../docs/TYC.md?raw";
import privacyRaw from "../../../../docs/aviso.md?raw";

const LINK_PATTERN = /https?:\/\/[^\s)]+?(?=[.,;:]?(?:\s|$))|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

function linkify(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(LINK_PATTERN)) {
    const part = match[0];
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(<Fragment key={cursor}>{text.slice(cursor, start)}</Fragment>);
    const isUrl = part.startsWith("http");
    nodes.push(
      <a
        key={start}
        href={isUrl ? part : `mailto:${part}`}
        target={isUrl ? "_blank" : undefined}
        rel={isUrl ? "noreferrer" : undefined}
        className="break-words font-medium text-[var(--mallorca-red)] underline decoration-[var(--mallorca-red)]/30 underline-offset-2 hover:decoration-[var(--mallorca-red)]"
      >
        {part}
      </a>,
    );
    cursor = start + part.length;
  }
  if (cursor < text.length) nodes.push(<Fragment key={cursor}>{text.slice(cursor)}</Fragment>);
  return nodes;
}

type LegalPageProps = {
  raw: string;
  kicker: string;
  other: { href: string; label: string };
};

function LegalPage({ raw, kicker, other }: LegalPageProps) {
  const doc = useMemo(() => parseLegalDoc(raw), [raw]);
  const sections = doc.blocks.filter((block) => block.type === "section");
  const showIndex = sections.length >= 3;

  useEffect(() => {
    document.title = `${doc.title} · Pastelería Mallorca`;
    window.scrollTo(0, 0);
  }, [doc.title]);

  return (
    <StoreLayout>
      <section className="border-b border-[var(--mallorca-cacao)]/10 bg-[var(--mallorca-cream)] px-5 py-14 sm:py-16 md:px-8 md:py-20">
        <div className={showIndex ? "container mx-auto max-w-5xl" : "container mx-auto max-w-3xl"}>
          <span className="mallorca-kicker text-[var(--mallorca-red)]">{kicker}</span>
          <h1 className="mallorca-display mt-4 text-[clamp(2.25rem,7vw,4.5rem)] leading-[0.95]">{doc.title}</h1>
          {doc.updated ? (
            <p className="mt-5 text-sm text-muted-foreground">Última actualización: {doc.updated}</p>
          ) : null}
        </div>
      </section>

      <section className="bg-[var(--mallorca-white)] px-5 py-12 sm:py-14 md:px-8 md:py-16">
        <div
          className={
            showIndex
              ? "container mx-auto grid max-w-5xl gap-10 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-14"
              : "container mx-auto max-w-3xl"
          }
        >
          {showIndex ? (
            <nav aria-label="Índice" className="hidden lg:block">
              <div className="sticky top-32">
                <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Índice
                </p>
                <ol className="max-h-[calc(100dvh-10rem)] space-y-2 overflow-y-auto pr-2 text-[13px] leading-snug">
                  {sections.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        className="text-foreground/65 transition-colors hover:text-[var(--mallorca-red)]"
                      >
                        {section.text.replace(/^Sección\s+(\d+)\s*[–-]\s*/i, "$1. ")}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            </nav>
          ) : null}

          <article className="min-w-0 max-w-3xl text-[15px] leading-relaxed text-foreground/80">
            {doc.blocks.map((block, index) => {
              switch (block.type) {
                case "section":
                  return (
                    <h2
                      key={index}
                      id={block.id}
                      className="mallorca-display mb-4 mt-12 scroll-mt-32 text-2xl leading-tight text-foreground first:mt-0 sm:text-3xl"
                    >
                      {block.text}
                    </h2>
                  );
                case "subheading":
                  return (
                    <h3 key={index} className="mb-2 mt-7 text-base font-semibold text-foreground first:mt-0">
                      {block.text}
                    </h3>
                  );
                case "list":
                  return (
                    <ul key={index} className="mb-5 list-disc space-y-1.5 pl-5 marker:text-[var(--mallorca-red)]">
                      {block.items.map((item) => (
                        <li key={item}>{linkify(item)}</li>
                      ))}
                    </ul>
                  );
                default:
                  return (
                    <p key={index} className="mb-4">
                      {linkify(block.text)}
                    </p>
                  );
              }
            })}

            <div className="mt-14 border-t border-[var(--mallorca-cacao)]/10 pt-6">
              <Link
                href={other.href}
                className="group inline-flex items-center gap-3 text-[0.72rem] font-bold uppercase tracking-[0.18em] text-[var(--mallorca-red)]"
              >
                <span className="border-b border-[var(--mallorca-red)]/35 pb-1 transition-colors group-hover:border-[var(--mallorca-red)]">
                  {other.label}
                </span>
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </article>
        </div>
      </section>
    </StoreLayout>
  );
}

export function TermsPage() {
  return (
    <LegalPage
      raw={termsRaw}
      kicker="Legal"
      other={{ href: "/aviso-de-privacidad", label: "Aviso de privacidad" }}
    />
  );
}

export function PrivacyPage() {
  return (
    <LegalPage
      raw={privacyRaw}
      kicker="Legal"
      other={{ href: "/terminos-y-condiciones", label: "Términos y condiciones" }}
    />
  );
}
