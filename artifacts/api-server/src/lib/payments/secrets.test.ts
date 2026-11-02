import assert from "node:assert/strict";
import test from "node:test";
import { decryptSecret, encryptSecret, MissingSecretsKeyError } from "./secrets.ts";

const env = { PAYMENT_SECRETS_KEY: "unit-test-payment-secrets-key" } as NodeJS.ProcessEnv;

test("v2 encryption round-trips and cannot be read as base64", () => {
  const stored = encryptSecret("super-secret", env);
  assert.equal(stored.startsWith("v2:"), true);
  assert.equal(decryptSecret(stored, env), "super-secret");
  assert.notEqual(Buffer.from(stored.slice(3), "base64").toString("utf8").includes("super-secret"), true);
});

test("legacy v1 values still decrypt without a key", () => {
  const v1 = `v1:${Buffer.from("legacy-token", "utf8").toString("base64")}`;
  assert.equal(decryptSecret(v1, {} as NodeJS.ProcessEnv), "legacy-token");
});

test("encrypting without PAYMENT_SECRETS_KEY fails closed", () => {
  assert.throws(() => encryptSecret("x", {} as NodeJS.ProcessEnv), MissingSecretsKeyError);
});
