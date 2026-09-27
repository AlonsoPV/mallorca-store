import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "./password.ts";

test("hashes and verifies a password without storing plaintext", () => {
  const stored = hashPassword("alonso123");
  assert.equal(stored.startsWith("scrypt:"), true);
  assert.equal(stored.includes("alonso123"), false);
  assert.equal(verifyPassword("alonso123", stored), true);
  assert.equal(verifyPassword("wrong", stored), false);
  assert.equal(verifyPassword("alonso123", null), false);
});
