export function formatMxn(price: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(price);
}

/** Structured branch fields are the source of truth; `address` is only a fallback. */
export function formatBranchPostalLines(branch: {
  address?: string | null;
  street?: string | null;
  externalNumber?: string | null;
  internalNumber?: string | null;
  neighborhood?: string | null;
  borough?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
}): string[] {
  const line1 = [
    branch.street,
    branch.externalNumber,
    branch.internalNumber ? `Int. ${branch.internalNumber}` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const lines = [
    line1 || null,
    branch.neighborhood || null,
    branch.borough || null,
    [branch.city, [branch.state, branch.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ") || null,
  ].filter((line): line is string => Boolean(line));
  if (lines.length) return lines;
  return branch.address ? [branch.address] : [];
}

export function productAvailabilityCopy(input: {
  branchName?: string | null;
  available?: boolean;
  inventory?: number | null;
  leadHours?: number | null;
  scheduleOk?: boolean;
  hasSchedule?: boolean;
}): string | null {
  const branch = input.branchName?.replace(/^Mallorca\s+/i, "") || null;
  if ((input.inventory ?? 0) <= 0 || input.available === false) {
    return branch ? `Agotado en ${branch}` : "Agotado";
  }
  if (input.hasSchedule && !input.scheduleOk && (input.leadHours ?? 0) > 0) {
    return `Necesita ${input.leadHours} h`;
  }
  if (input.hasSchedule && !input.scheduleOk) {
    return branch ? `No disponible en ${branch} para este horario` : "No disponible para este horario";
  }
  return null;
}

export function branchFulfillmentLabel(branch: {
  pickupAvailable?: boolean | null;
  deliveryAvailable?: boolean | null;
}) {
  const pickup = !!branch.pickupAvailable;
  const delivery = !!branch.deliveryAvailable;
  if (pickup && delivery) return "Recolección y entrega";
  if (pickup) return "Solo recolección";
  if (delivery) return "Solo entrega";
  return "Sin métodos activos";
}

export function resolveFulfillmentMethod(
  preferred: "pickup" | "delivery",
  branch: { pickupAvailable?: boolean | null; deliveryAvailable?: boolean | null },
): "pickup" | "delivery" | null {
  if (preferred === "pickup" && branch.pickupAvailable) return "pickup";
  if (preferred === "delivery" && branch.deliveryAvailable) return "delivery";
  if (branch.pickupAvailable) return "pickup";
  if (branch.deliveryAvailable) return "delivery";
  return null;
}
