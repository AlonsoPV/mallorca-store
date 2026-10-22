/** Stale cart IDs: missing, converted into an order, or inactive. */
export function isCartNotFoundError(error: unknown): boolean {
  const e = error as {
    status?: number;
    data?: { error?: string; code?: string } | null;
    message?: string;
  };
  const code = e?.data?.code ?? "";
  if (code === "CART_ALREADY_CONVERTED" || code === "CART_NOT_ACTIVE") return true;
  const detail = `${e?.data?.error ?? ""} ${e?.message ?? ""}`;
  return /cart not found|already converted|cart is empty or already converted/i.test(detail);
}
