/** Postgres SQLSTATE, including Drizzle-wrapped `error.cause.code`. */
export function pgCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current && typeof current === "object"; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/i.test(code)) return code;
    current = "cause" in current ? (current as { cause: unknown }).cause : undefined;
  }
  return null;
}
