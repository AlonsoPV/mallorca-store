/** Shared admin list URL helpers (Agenda pattern). */

export function normalizeSearch(search: string): string {
  return search.startsWith("?") ? search.slice(1) : search;
}

export function readSearchParam(search: string, key: string): string | null {
  return new URLSearchParams(normalizeSearch(search)).get(key);
}

/**
 * Build a path with patched query params.
 * - `null` / `undefined` / `""` / sentinel `"all"` removes the key
 * - other values are set as strings
 */
export function withSearchParams(
  path: string,
  currentSearch: string,
  patch: Record<string, string | null | undefined>,
  options?: { clearSentinel?: string },
): string {
  const sentinel = options?.clearSentinel ?? "all";
  const params = new URLSearchParams(normalizeSearch(currentSearch));

  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === "" || value === sentinel) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
  }

  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function readBranchIdParam(search: string, fallback = "all"): string {
  return readSearchParam(search, "branchId") || fallback;
}
