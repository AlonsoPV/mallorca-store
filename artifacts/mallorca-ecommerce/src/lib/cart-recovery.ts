type CartApiError = {
  status?: number;
  data?: { error?: string; code?: string } | null;
  message?: string;
};

function errorDetail(error: unknown): { status?: number; code: string; text: string } {
  const e = error as CartApiError;
  const code = e?.data?.code ?? "";
  const text = `${e?.data?.error ?? ""} ${e?.message ?? ""}`;
  return { status: e?.status, code, text };
}

/** Stale cart IDs: missing, converted into an order, or inactive. */
export function isCartNotFoundError(error: unknown): boolean {
  const { status, code, text } = errorDetail(error);
  if (code === "CART_ALREADY_CONVERTED" || code === "CART_NOT_ACTIVE" || code === "CART_NOT_FOUND") {
    return true;
  }
  if (status === 404 && /cart not found|already converted/i.test(text)) return true;
  return /cart not found|already converted|cart is empty or already converted/i.test(text);
}

/**
 * Live Replit still maps converted carts to 409 "Product unavailable".
 * Retry add-to-cart with a fresh session; a truly unavailable product fails again.
 */
export function isStaleCartMutationError(error: unknown): boolean {
  if (isCartNotFoundError(error)) return true;
  const { status, text } = errorDetail(error);
  return status === 409 && /product unavailable/i.test(text);
}
