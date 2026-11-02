import assert from "node:assert/strict";
import test from "node:test";
import { allowedCorsOrigins, isAllowedCorsOrigin } from "./cors-origins.ts";

test("production CORS rejects unknown origins and allows configured storefront", () => {
  const env = {
    NODE_ENV: "production",
    PUBLIC_APP_URL: "https://tienda.example.com",
    CORS_ORIGINS: "https://admin.example.com, https://www.example.com",
  } as NodeJS.ProcessEnv;
  assert.deepEqual(allowedCorsOrigins(env).sort(), [
    "https://admin.example.com",
    "https://tienda.example.com",
    "https://www.example.com",
  ].sort());
  assert.equal(isAllowedCorsOrigin("https://evil.example", env), false);
  assert.equal(isAllowedCorsOrigin("https://tienda.example.com", env), true);
  assert.equal(isAllowedCorsOrigin(undefined, env), true);
});

test("development CORS includes localhost even without extra env", () => {
  const env = { NODE_ENV: "development" } as NodeJS.ProcessEnv;
  assert.equal(isAllowedCorsOrigin("http://localhost:5190", env), true);
  assert.equal(isAllowedCorsOrigin("https://evil.example", env), false);
});
