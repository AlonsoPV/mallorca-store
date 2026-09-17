export type BranchAddressParts = {
  street?: string | null;
  externalNumber?: string | null;
  internalNumber?: string | null;
  neighborhood?: string | null;
  borough?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  address?: string | null;
};

export function buildFormattedAddress(
  parts: BranchAddressParts & {
    fallback?: string | null;
  },
): string {
  const line1 = [
    parts.street,
    parts.externalNumber,
    parts.internalNumber ? `Int. ${parts.internalNumber}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const rest = [
    parts.neighborhood,
    parts.borough,
    parts.city,
    parts.state,
    parts.postalCode,
    parts.country,
  ]
    .filter(Boolean)
    .join(", ");
  const built = [line1, rest].filter(Boolean).join(", ");
  return built || parts.fallback || parts.address || "";
}

/**
 * Structured address fields are the source of truth.
 * `address` is derived for list/display, and only used as legacy fallback
 * when no structured parts are available.
 */
export function resolveBranchFormattedAddress(
  incoming: BranchAddressParts,
  before?: BranchAddressParts | null,
): string {
  const merged: BranchAddressParts = {
    street: incoming.street !== undefined ? incoming.street : before?.street,
    externalNumber:
      incoming.externalNumber !== undefined ? incoming.externalNumber : before?.externalNumber,
    internalNumber:
      incoming.internalNumber !== undefined ? incoming.internalNumber : before?.internalNumber,
    neighborhood:
      incoming.neighborhood !== undefined ? incoming.neighborhood : before?.neighborhood,
    borough: incoming.borough !== undefined ? incoming.borough : before?.borough,
    city: incoming.city !== undefined ? incoming.city : before?.city,
    state: incoming.state !== undefined ? incoming.state : before?.state,
    postalCode: incoming.postalCode !== undefined ? incoming.postalCode : before?.postalCode,
    country: incoming.country !== undefined ? incoming.country : before?.country,
  };

  const hasStructured = Boolean(
    merged.street ||
      merged.externalNumber ||
      merged.internalNumber ||
      merged.neighborhood ||
      merged.borough ||
      merged.city ||
      merged.state ||
      merged.postalCode ||
      merged.country,
  );

  if (hasStructured) {
    return buildFormattedAddress({
      ...merged,
      fallback: incoming.address ?? before?.address ?? null,
    });
  }

  return (incoming.address ?? before?.address ?? "") || "";
}
