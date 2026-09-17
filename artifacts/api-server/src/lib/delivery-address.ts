export type DeliveryAddressSnapshot = {
  street?: string | null;
  externalNumber?: string | null;
  internalNumber?: string | null;
  neighborhood?: string | null;
  municipality?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  references?: string | null;
};

export function buildDeliveryAddress(
  snapshot: DeliveryAddressSnapshot | null | undefined,
  fallback?: string | null,
): string {
  if (!snapshot) return fallback?.trim() || "";
  const line1 = [
    snapshot.street,
    snapshot.externalNumber,
    snapshot.internalNumber ? `Int. ${snapshot.internalNumber}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const rest = [
    snapshot.neighborhood,
    snapshot.municipality,
    snapshot.city,
    snapshot.state,
    snapshot.postalCode ? `C.P. ${snapshot.postalCode}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const built = [line1, rest, snapshot.references]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
  return built || fallback?.trim() || "";
}

export function hasStructuredDeliveryAddress(
  snapshot: DeliveryAddressSnapshot | null | undefined,
): boolean {
  if (!snapshot) return false;
  return Boolean(
    snapshot.street ||
      snapshot.externalNumber ||
      snapshot.internalNumber ||
      snapshot.neighborhood ||
      snapshot.municipality ||
      snapshot.city ||
      snapshot.state ||
      snapshot.postalCode ||
      snapshot.references,
  );
}

export function resolveDeliveryAddress(input: {
  fulfillmentMethod: "pickup" | "delivery";
  snapshot?: DeliveryAddressSnapshot | null;
  deliveryAddress?: string | null;
}): { snapshot: DeliveryAddressSnapshot | null; formatted: string | null } {
  if (input.fulfillmentMethod !== "delivery") {
    return { snapshot: null, formatted: null };
  }
  const snapshot = hasStructuredDeliveryAddress(input.snapshot) ? input.snapshot! : null;
  const formatted = buildDeliveryAddress(snapshot, input.deliveryAddress);
  return { snapshot, formatted: formatted || null };
}
