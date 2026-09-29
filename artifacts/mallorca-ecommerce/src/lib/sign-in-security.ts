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

export function isValidEmailIdentifier(identifier: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim());
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
    errors?: { code?: string; message?: string; meta?: { param_name?: string } }[];
    message?: string;
  };
  const code = maybe.errors?.[0]?.code ?? "";
  const message = `${maybe.errors?.[0]?.message ?? maybe.message ?? ""}`;
  if (/network|fetch|Failed to fetch|timeout/i.test(message)) {
    return "No se pudo conectar. Intenta de nuevo.";
  }
  if (/rate_limit|too_many_attempts|locked|blocked/i.test(code)) {
    return "El acceso está temporalmente bloqueado. Intenta de nuevo más tarde.";
  }
  if (/verification|second_factor/i.test(code)) {
    return "Se requiere una verificación adicional para entrar.";
  }
  if (code.includes("strategy") || code.includes("not_allowed")) {
    return "Este método de acceso no está disponible.";
  }
  if (code === "form_param_format_invalid" && maybe.errors?.[0]?.meta?.param_name === "identifier") {
    return "Escribe un correo electrónico válido.";
  }
  return "Usuario o contraseña incorrectos.";
}

type PasswordAttempt = {
  status: string | null;
  createdSessionId: string | null;
  supportedFirstFactors?: Array<{ strategy: string }> | null;
  attemptFirstFactor: (params: { strategy: "password"; password: string }) => Promise<PasswordAttempt>;
};

export type PasswordSignInOutcome =
  | { kind: "complete" }
  | { kind: "verification"; message: string }
  | { kind: "error"; message: string };

export async function submitClerkPassword(
  client: { create: (params: { identifier: string; password: string }) => Promise<PasswordAttempt> },
  email: string,
  password: string,
  setActive: (params: { session: string }) => Promise<unknown>,
): Promise<PasswordSignInOutcome> {
  try {
    let result = await client.create({ identifier: email, password });
    if (
      result.status === "needs_first_factor" &&
      result.supportedFirstFactors?.some((factor) => factor.strategy === "password")
    ) {
      result = await result.attemptFirstFactor({ strategy: "password", password });
    }
    if (result.status === "complete" && result.createdSessionId) {
      await setActive({ session: result.createdSessionId });
      return { kind: "complete" };
    }
    if (["needs_first_factor", "needs_second_factor", "needs_client_trust", "needs_new_password", "needs_protect_check"].includes(result.status ?? "")) {
      return { kind: "verification", message: "Completa la verificación adicional para entrar." };
    }
    return { kind: "error", message: "No se completó el acceso. Prueba con tu correo o con Google." };
  } catch (error) {
    return { kind: "error", message: clerkSignInErrorMessage(error) };
  }
}
