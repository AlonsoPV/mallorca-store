export function encryptSecret(plain: string): string {
  return `v1:${Buffer.from(plain, "utf8").toString("base64")}`;
}

export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith("v1:")) {
    return Buffer.from(stored.slice(3), "base64").toString("utf8");
  }
  return stored;
}

export function maskSecret(value?: string | null): string | null {
  if (!value) return null;
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

export function isProviderConfigured(accessToken?: string | null): boolean {
  return Boolean(accessToken && accessToken.trim().length > 0);
}
