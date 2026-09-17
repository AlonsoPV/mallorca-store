export function formatMxn(price: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(price);
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
