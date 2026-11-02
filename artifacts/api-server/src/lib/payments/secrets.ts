import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export class MissingSecretsKeyError extends Error {
  constructor() {
    super("PAYMENT_SECRETS_KEY is required to store secrets");
    this.name = "MissingSecretsKeyError";
  }
}

function secretsKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = env.PAYMENT_SECRETS_KEY?.trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  try {
    const asB64 = Buffer.from(raw, "base64");
    if (asB64.length === 32) return asB64;
  } catch {
    /* fall through */
  }
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = secretsKey(env);
  if (!key) throw new MissingSecretsKeyError();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${Buffer.concat([iv, tag, encrypted]).toString("base64")}`;
}

export function decryptSecret(
  stored: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!stored) return null;
  if (stored.startsWith("v2:")) {
    const key = secretsKey(env);
    if (!key) return null;
    try {
      const payload = Buffer.from(stored.slice(3), "base64");
      if (payload.length < 29) return null;
      const iv = payload.subarray(0, 12);
      const tag = payload.subarray(12, 28);
      const data = payload.subarray(28);
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    } catch {
      return null;
    }
  }
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
