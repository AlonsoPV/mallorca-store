import { CreditCard, Info, Package, Receipt, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StorefrontNotice, StorefrontNoticeKind } from "@/lib/cart-recovery";
import { storefrontNoticeFromError } from "@/lib/cart-recovery";
import { toast } from "@/hooks/use-toast";

const NOTICE_ICON: Record<StorefrontNoticeKind, typeof Info> = {
  inventory: Package,
  unavailable: Package,
  cart: ShoppingBag,
  order: Receipt,
  payment: CreditCard,
  generic: Info,
};

export function StorefrontNoticeBanner({
  notice,
  className,
  onDismiss,
}: {
  notice: StorefrontNotice;
  className?: string;
  onDismiss?: () => void;
}) {
  const Icon = NOTICE_ICON[notice.kind];
  return (
    <div
      role="status"
      className={cn(
        "flex gap-3 border border-[var(--mallorca-cacao)]/12 border-l-[3px] border-l-[var(--mallorca-red)] bg-[var(--mallorca-cream)] px-3.5 py-3 text-[var(--mallorca-cacao)]",
        className,
      )}
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--mallorca-white)] text-[var(--mallorca-red)]">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-serif text-base leading-tight">{notice.title}</p>
        <p className="mt-1 text-sm leading-snug text-[var(--mallorca-cacao)]/70">{notice.description}</p>
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="self-start text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--mallorca-cacao)]/50 hover:text-[var(--mallorca-cacao)]"
        >
          Cerrar
        </button>
      ) : null}
    </div>
  );
}

export function StorefrontToastIcon({ kind }: { kind?: StorefrontNoticeKind }) {
  const Icon = NOTICE_ICON[kind ?? "generic"];
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--mallorca-white)] text-[var(--mallorca-red)] shadow-sm">
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}

export function toastStorefrontMessage(
  title: string,
  description: string,
  kind: StorefrontNoticeKind = "generic",
) {
  const notice: StorefrontNotice = { kind, title, description };
  toast({
    variant: "notice",
    duration: 8000,
    title: notice.title,
    description: notice.description,
    kind: notice.kind,
  });
  return notice;
}

export function toastStorefrontNotice(
  error: unknown,
  fallback?: Partial<Pick<StorefrontNotice, "title" | "description">>,
) {
  const notice = storefrontNoticeFromError(error, fallback);
  toastStorefrontMessage(notice.title, notice.description, notice.kind);
  return notice;
}
