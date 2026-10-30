type CartApiError = {
  status?: number;
  data?: { error?: string; code?: string } | null;
  message?: string;
  payload?: { error?: string; code?: string } | null;
};

function errorDetail(error: unknown): { status?: number; code: string; text: string } {
  const e = error as CartApiError;
  const code = e?.data?.code ?? e?.payload?.code ?? "";
  const text = `${e?.data?.error ?? e?.payload?.error ?? ""} ${e?.message ?? ""}`;
  return { status: e?.status, code, text };
}

export type StorefrontNoticeKind = "inventory" | "unavailable" | "cart" | "order" | "payment" | "generic";

export type StorefrontNotice = {
  kind: StorefrontNoticeKind;
  title: string;
  description: string;
};

function looksLikeHttpDump(text: string): boolean {
  return /HTTP\s+\d{3}|\bstatus(?:\s+code)?\s+\d{3}\b|\b404\b|\b409\b|\b500\b|\b503\b|not found|internal server|conflict:|unauthorized|forbidden|bad request|insufficient inventory|product unavailable|cart not found|order not found|branch not found|item not found|item unavailable/i.test(
    text,
  );
}

function candidateCopy(error: unknown): string[] {
  const e = error as CartApiError;
  const values = [e?.data?.error, e?.payload?.error, typeof error === "string" ? error : undefined];
  return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

/** Safe one-line copy for toasts. Never leaks HTTP codes or English API dumps. */
export function sanitizeErrorCopy(error: unknown, fallback: string): string {
  for (const value of candidateCopy(error)) {
    const trimmed = value.trim();
    if (!looksLikeHttpDump(trimmed)) return trimmed;
  }
  return fallback;
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

/** Create may have committed even when the client saw 500 HTML/JSON. */
export function isLikelyCreatedOrderError(error: unknown): boolean {
  if (isCartNotFoundError(error)) return true;
  const { status, code, text } = errorDetail(error);
  if (status === 500 || code === "ORDER_CREATE_FAILED") return true;
  return /internal server error|no se pudo crear el pedido/i.test(text);
}

export function isInventoryShortageError(error: unknown): boolean {
  const { text } = errorDetail(error);
  return /insufficient inventory/i.test(text);
}

export function isProductUnavailableError(error: unknown): boolean {
  if (isCartNotFoundError(error) || isInventoryShortageError(error)) return false;
  const { text } = errorDetail(error);
  return /product unavailable|item unavailable/i.test(text);
}

/** Customer-facing copy. Never leaks HTTP codes or English API dumps. */
export function storefrontNoticeFromError(
  error: unknown,
  fallback?: Partial<Pick<StorefrontNotice, "title" | "description">>,
): StorefrontNotice {
  const { status, text } = errorDetail(error);

  if (isInventoryShortageError(error)) {
    return {
      kind: "inventory",
      title: "Quedan pocas piezas",
      description: "Baja la cantidad o elige otra sucursal. Esta receta se acaba más rápido de lo que parece.",
    };
  }

  if (isProductUnavailableError(error)) {
    return {
      kind: "unavailable",
      title: "Esta pieza no está disponible",
      description: "En tu Mallorca ya no hay de esta receta. Prueba otra sucursal o elige algo parecido.",
    };
  }

  if (isCartNotFoundError(error)) {
    return {
      kind: "cart",
      title: "Tu bolsa se reinició",
      description: "La sesión anterior ya no está activa. Vuelve a añadir lo que quieras llevarte.",
    };
  }

  if (/fulfillment slot unavailable/i.test(text)) {
    return {
      kind: "cart",
      title: "Ese horario ya no está libre",
      description: "Elige otra hora y lo intentamos de nuevo.",
    };
  }

  if (/cart is empty/i.test(text)) {
    return {
      kind: "cart",
      title: "Tu bolsa está vacía",
      description: "Añade algo recién horneado para continuar.",
    };
  }

  if (/branch/i.test(text) && /not found|mismatch/i.test(text)) {
    return {
      kind: "cart",
      title: "Revisa tu Mallorca",
      description: "Elige de nuevo la sucursal para confirmar disponibilidad.",
    };
  }

  if (/order not found/i.test(text)) {
    return {
      kind: "order",
      title: "No encontramos ese pedido",
      description: "Revisa el enlace de tu comprobante o entra desde tu cuenta.",
    };
  }

  if (/payment|paypal|mercado\s*pago/i.test(text) && /fail|reject|error|unavailable|not configured/i.test(text)) {
    return {
      kind: "payment",
      title: "No se pudo completar el pago",
      description: "Tu pedido sigue guardado. Inténtalo de nuevo en un momento.",
    };
  }

  if (/unauthorized|forbidden|401|403/i.test(text) || status === 401 || status === 403) {
    return {
      kind: "generic",
      title: "Necesitas iniciar sesión",
      description: "Vuelve a entrar para continuar con esta acción.",
    };
  }

  if (status === 404) {
    return {
      kind: "generic",
      title: fallback?.title?.trim() || "No lo encontramos",
      description:
        fallback?.description?.trim() && !looksLikeHttpDump(fallback.description)
          ? fallback.description.trim()
          : "Puede que ya no esté disponible. Vuelve atrás e inténtalo de nuevo.",
    };
  }

  const rawDescription = fallback?.description?.trim() || sanitizeErrorCopy(error, "");
  return {
    kind: "generic",
    title: fallback?.title?.trim() || "No se pudo completar",
    description:
      rawDescription && !looksLikeHttpDump(rawDescription)
        ? rawDescription
        : "Inténtalo de nuevo en un momento.",
  };
}
