import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

function hashResetToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function isPasswordStrongEnough(password) {
  return typeof password === "string" && password.trim().length >= 8;
}

test("password reset tokens are hashed and passwords need 8 chars", () => {
  assert.equal(hashResetToken("abc").length, 64);
  assert.notEqual(hashResetToken("abc"), "abc");
  assert.equal(isPasswordStrongEnough("1234567"), false);
  assert.equal(isPasswordStrongEnough("12345678"), true);
});
