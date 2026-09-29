import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword } from "./password.ts";
import { verifiedStaffEmail } from "./staff-username-verification.ts";

const password = "ContraseñaDePrueba2026!";
const staff = {
  email: "equipo@example.test",
  role: "staff",
  passwordHash: hashPassword(password),
};

test("resolves a staff username only after its local password matches", () => {
  assert.equal(verifiedStaffEmail(staff, password), staff.email);
  assert.equal(verifiedStaffEmail(staff, "equivocada"), null);
  assert.equal(verifiedStaffEmail({ ...staff, passwordHash: null }, password), null);
});

test("does not resolve customers or unknown usernames", () => {
  assert.equal(verifiedStaffEmail({ ...staff, role: "customer" }, password), null);
  assert.equal(verifiedStaffEmail(undefined, password), null);
});