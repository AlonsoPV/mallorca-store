function originFromUrl(value?: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return url.origin;
  } catch {
    return null;
  }
}

const LOCAL_DEV_ORIGINS = [
  "http://localhost:5190",
  "http://127.0.0.1:5190",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

export function allowedCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const extras = (env.CORS_ORIGINS ?? "")
    .split(",")
    .map((entry) => originFromUrl(entry))
    .filter((origin): origin is string => Boolean(origin));
  const configured = [
    originFromUrl(env.PUBLIC_APP_URL),
    originFromUrl(env.STOREFRONT_PUBLIC_URL),
    originFromUrl(env.APP_BASE_URL),
    ...extras,
  ].filter((origin): origin is string => Boolean(origin));
  const local = env.NODE_ENV === "production" ? [] : LOCAL_DEV_ORIGINS;
  return [...new Set([...configured, ...local])];
}

export function isAllowedCorsOrigin(origin: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!origin) return true;
  return allowedCorsOrigins(env).includes(origin);
}
