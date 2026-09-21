/** Detect stale cart IDs (common after mock/API restart). */
export function isCartNotFoundError(error: unknown): boolean {
  const e = error as {
    status?: number;
    data?: { error?: string; code?: string } | null;
    message?: string;
  };
  const detail = `${e?.data?.error ?? ""} ${e?.message ?? ""}`;
  return /cart not found/i.test(detail);
}
