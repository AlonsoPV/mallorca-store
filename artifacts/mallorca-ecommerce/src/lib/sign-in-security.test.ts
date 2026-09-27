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
  isSignInLocked,
  readSignInGate,
  registerSignInFailure,
  registerSignInSuccess,
  remainingLockMs,
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
});
