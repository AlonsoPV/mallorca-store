import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPTCHA_LENGTH,
  SIGN_IN_LOCK_MS,
  SIGN_IN_MAX_FAILURES,
  captchaMatches,
  clerkSignInErrorMessage,
  credentialsMatch,
  generateCaptchaChallenge,
  isValidEmailIdentifier,
  isSignInLocked,
  readSignInGate,
  registerSignInFailure,
  registerSignInSuccess,
  remainingLockMs,
  submitClerkPassword,
} from "./sign-in-security.ts";

test("generates a 5-character captcha from the safe alphabet", () => {
  let i = 0;
  const sequence = [0, 0.2, 0.4, 0.6, 0.99];
  const code = generateCaptchaChallenge(() => sequence[i++] ?? 0);
  assert.equal(code.length, CAPTCHA_LENGTH);
  assert.match(code, /^[A-HJ-NP-Z2-9]+$/);
});

test("matches captcha ignoring spaces and case", () => {
  assert.equal(captchaMatches("ab 12c", "AB12C"), true);
  assert.equal(captchaMatches("AB12D", "AB12C"), false);
  assert.equal(captchaMatches("", "AB12C"), false);
});

test("matches local credentials by username or email", () => {
  const allowed = {
    identifiers: ["admin", "alpeva96@gmail.com"],
    password: "mallorca-local",
  };
  assert.equal(credentialsMatch("Admin", "mallorca-local", allowed), true);
  assert.equal(credentialsMatch("  alpeva96@gmail.com ", "mallorca-local", allowed), true);
  assert.equal(credentialsMatch("admin", "wrong", allowed), false);
  assert.equal(credentialsMatch("otro", "mallorca-local", allowed), false);
});

test("checks resolved emails before sending them to Clerk", () => {
  assert.equal(isValidEmailIdentifier(" persona@ejemplo.com "), true);
  assert.equal(isValidEmailIdentifier("usuario"), false);
  assert.equal(isValidEmailIdentifier("persona@"), false);
});

test("locks sign-in after too many failures and unlocks later", () => {
  let gate = registerSignInSuccess();
  const start = 1_000;
  for (let i = 0; i < SIGN_IN_MAX_FAILURES - 1; i += 1) {
    gate = registerSignInFailure(gate, start);
    assert.equal(isSignInLocked(gate, start), false);
  }
  gate = registerSignInFailure(gate, start);
  assert.equal(isSignInLocked(gate, start), true);
  assert.equal(remainingLockMs(gate, start), SIGN_IN_LOCK_MS);
  assert.equal(isSignInLocked(gate, start + SIGN_IN_LOCK_MS), false);
});

test("reads an empty gate when storage is missing or corrupt", () => {
  assert.deepEqual(readSignInGate(null), { failures: 0, lockedUntil: 0 });
  assert.deepEqual(
    readSignInGate({ getItem: () => "nope" }),
    { failures: 0, lockedUntil: 0 },
  );
});

test("maps Clerk errors without leaking the account", () => {
  assert.equal(
    clerkSignInErrorMessage({ errors: [{ code: "form_password_incorrect" }] }),
    "Usuario o contraseña incorrectos.",
  );
  assert.match(clerkSignInErrorMessage({ message: "Failed to fetch" }), /conectar/);
  assert.equal(
    clerkSignInErrorMessage({
      errors: [{ code: "form_param_format_invalid", meta: { param_name: "identifier" } }],
    }),
    "Escribe un correo electrónico válido.",
  );
  assert.match(clerkSignInErrorMessage({ errors: [{ code: "too_many_attempts" }] }), /bloqueado/);
  assert.match(clerkSignInErrorMessage({ errors: [{ code: "second_factor_invalid" }] }), /verificación/);
});

test("completes password sign-in and activates only the completed session", async () => {
  let activated: string | null = null;
  const result = await submitClerkPassword(
    { create: async () => ({ status: "complete", createdSessionId: "session-test", attemptFirstFactor: async () => { throw Error("unexpected"); } }) },
    "equipo@example.test",
    "sample-password",
    async ({ session }) => { activated = session; },
  );
  assert.deepEqual(result, { kind: "complete" });
  assert.equal(activated, "session-test");
});

test("continues a password first factor before activating a session", async () => {
  let attempted = false;
  const result = await submitClerkPassword(
    { create: async () => ({
      status: "needs_first_factor",
      createdSessionId: null,
      supportedFirstFactors: [{ strategy: "password" }],
      attemptFirstFactor: async ({ strategy, password }) => {
        assert.equal(strategy, "password");
        assert.equal(password, "sample-password");
        attempted = true;
        return { status: "complete", createdSessionId: "session-test", attemptFirstFactor: async () => { throw Error("unexpected"); } };
      },
    }) },
    "equipo@example.test",
    "sample-password",
    async () => {},
  );
  assert.equal(attempted, true);
  assert.deepEqual(result, { kind: "complete" });
});

test("does not treat an unfinished verification or a rejected Clerk password as success", async () => {
  let activated = false;
  const activate = async () => { activated = true; };
  const verify = await submitClerkPassword(
    { create: async () => ({ status: "needs_second_factor", createdSessionId: null, attemptFirstFactor: async () => { throw Error("unexpected"); } }) },
    "equipo@example.test", "sample-password", activate,
  );
  assert.equal(verify.kind, "verification");
  const rejected = await submitClerkPassword(
    { create: async () => { throw { errors: [{ code: "form_password_incorrect" }] }; } },
    "equipo@example.test", "sample-password", activate,
  );
  assert.deepEqual(rejected, { kind: "error", message: "Usuario o contraseña incorrectos." });
  const network = await submitClerkPassword(
    { create: async () => { throw new Error("Failed to fetch"); } },
    "equipo@example.test", "sample-password", activate,
  );
  assert.match(network.kind === "error" ? network.message : "", /conectar/);
  assert.equal(activated, false);
});
