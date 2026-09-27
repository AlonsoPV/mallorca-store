export const SIGN_IN_MAX_FAILURES = 5;
export const SIGN_IN_LOCK_MS = 30_000;
export const SIGN_IN_GATE_STORAGE_KEY = "mallorca_signin_gate";
export const CAPTCHA_LENGTH = 5;
export const CAPTCHA_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type SignInGate = {
  failures: number;
  lockedUntil: number;
};

const EMPTY_GATE: SignInGate = { failures: 0, lockedUntil: 0 };

export function generateCaptchaChallenge(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < CAPTCHA_LENGTH; i += 1) {
    const index = Math.min(
      CAPTCHA_ALPHABET.length - 1,
      Math.max(0, Math.floor(random() * CAPTCHA_ALPHABET.length)),
    );
    out += CAPTCHA_ALPHABET[index];
  }
  return out;
}

export function captchaMatches(input: string, expected: string): boolean {
  return normalizeCaptcha(input) === normalizeCaptcha(expected) && expected.length === CAPTCHA_LENGTH;
}

function normalizeCaptcha(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

export function credentialsMatch(
  identifier: string,
  password: string,
  allowed: { identifiers: readonly string[]; password: string },
): boolean {
  const id = identifier.trim().toLowerCase();
  if (!id || !password) return false;
  const okId = allowed.identifiers.some((item) => item.trim().toLowerCase() === id);
  return okId && password === allowed.password;
}

export function isSignInLocked(gate: SignInGate, now: number): boolean {
  return gate.lockedUntil > now;
}

export function remainingLockMs(gate: SignInGate, now: number): number {
  return Math.max(0, gate.lockedUntil - now);
}

export function registerSignInFailure(gate: SignInGate, now: number): SignInGate {
  if (isSignInLocked(gate, now)) return gate;
  const failures = (gate.lockedUntil > 0 && gate.lockedUntil <= now ? 0 : gate.failures) + 1;
  if (failures >= SIGN_IN_MAX_FAILURES) {
    return { failures, lockedUntil: now + SIGN_IN_LOCK_MS };
  }
  return { failures, lockedUntil: 0 };
}

export function registerSignInSuccess(): SignInGate {
  return EMPTY_GATE;
}

export function readSignInGate(storage: Pick<Storage, "getItem"> | null | undefined): SignInGate {
  if (!storage) return EMPTY_GATE;
  try {
    const raw = storage.getItem(SIGN_IN_GATE_STORAGE_KEY);
    if (!raw) return EMPTY_GATE;
    const parsed = JSON.parse(raw) as Partial<SignInGate>;
    const failures = Number(parsed.failures);
    const lockedUntil = Number(parsed.lockedUntil);
    if (!Number.isFinite(failures) || !Number.isFinite(lockedUntil)) return EMPTY_GATE;
    return { failures: Math.max(0, failures), lockedUntil: Math.max(0, lockedUntil) };
  } catch {
    return EMPTY_GATE;
  }
}

export function writeSignInGate(
  storage: Pick<Storage, "setItem" | "removeItem"> | null | undefined,
  gate: SignInGate,
): void {
  if (!storage) return;
  if (gate.failures === 0 && gate.lockedUntil === 0) {
    storage.removeItem(SIGN_IN_GATE_STORAGE_KEY);
    return;
  }
  storage.setItem(SIGN_IN_GATE_STORAGE_KEY, JSON.stringify(gate));
}

export function clerkSignInErrorMessage(error: unknown): string {
  const maybe = error as {
    errors?: { code?: string; message?: string }[];
    message?: string;
  };
  const code = maybe.errors?.[0]?.code ?? "";
  const message = `${maybe.errors?.[0]?.message ?? maybe.message ?? ""}`;
  if (/network|fetch|Failed to fetch|timeout/i.test(message)) {
    return "No se pudo conectar. Intenta de nuevo.";
  }
  if (code.includes("strategy") || code.includes("not_allowed")) {
    return "Este acceso solo admite usuario y contraseña.";
  }
  return "Usuario o contraseña incorrectos.";
}
