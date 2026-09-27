const USERNAME_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789_";
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function normalizeUsername(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

export function generateUsername(
  seed: { firstName?: string | null; lastName?: string | null; email?: string | null } = {},
  random: () => number = Math.random,
): string {
  const fromName = [seed.firstName, seed.lastName].filter(Boolean).join("_");
  const fromEmail = seed.email?.split("@")[0] ?? "";
  const base = normalizeUsername(fromName || fromEmail || "usuario") || "usuario";
  const suffix = String(Math.floor(100 + random() * 900));
  const username = `${base.slice(0, 24)}${suffix}`;
  return username.length >= 4 ? username : `user${suffix}`;
}

export function generatePassword(length = 12, random: () => number = Math.random): string {
  const size = Math.max(8, length);
  let out = "";
  for (let i = 0; i < size; i += 1) {
    const index = Math.min(
      PASSWORD_ALPHABET.length - 1,
      Math.max(0, Math.floor(random() * PASSWORD_ALPHABET.length)),
    );
    out += PASSWORD_ALPHABET[index];
  }
  return out;
}

export function isValidUsername(value: string): boolean {
  const normalized = normalizeUsername(value);
  return (
    normalized.length >= 4 &&
    normalized.length <= 32 &&
    [...normalized].every((char) => USERNAME_ALPHABET.includes(char))
  );
}
