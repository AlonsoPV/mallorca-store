import type { Branch } from "@workspace/api-client-react";

export type BranchLinkKind = "opentable" | "reservation" | "instagram";

export type BranchLink = {
  kind: BranchLinkKind;
  label: string;
  href: string;
};

type BranchLinkSource = Pick<
  Branch,
  "openTableUrl" | "instagramUrl" | "reservationProvider" | "reservationUrl" | "reservationCta"
>;

function safeUrl(raw: string | null | undefined): URL | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** Reservation links first (the configured provider leads), then social. */
export function branchLinks(branch: BranchLinkSource): BranchLink[] {
  const openTable = safeUrl(branch.openTableUrl);
  const external = safeUrl(branch.reservationUrl);
  const instagram = safeUrl(branch.instagramUrl);

  const reservations: BranchLink[] = [];
  if (openTable) {
    reservations.push({ kind: "opentable", label: "Reservar en OpenTable", href: openTable.href });
  }
  if (external) {
    reservations.push({
      kind: "reservation",
      label: branch.reservationCta?.trim() || "Reservar mesa",
      href: external.href,
    });
  }
  if (branch.reservationProvider === "external") reservations.reverse();

  // The admin pre-fills "https://instagram.com/" when the channel is switched on.
  const hasInstagramProfile = instagram && instagram.pathname.replace(/\/+/g, "") !== "";

  return [
    ...reservations,
    ...(hasInstagramProfile ? [{ kind: "instagram" as const, label: "Instagram", href: instagram.href }] : []),
  ];
}
