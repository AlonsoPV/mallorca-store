import assert from "node:assert/strict";
import test from "node:test";
import {
  generatePassword,
  generateUsername,
  isValidUsername,
  normalizeUsername,
} from "./staff-credentials.ts";

test("normalizes usernames without accents or spaces", () => {
  assert.equal(normalizeUsername("  Alonso Pérez  "), "alonso_perez");
  assert.equal(isValidUsername("alonso_perez"), true);
  assert.equal(isValidUsername("ab"), false);
});

test("generates a seeded username from name", () => {
  const username = generateUsername(
    { firstName: "Ana", lastName: "Pérez", email: "ana@mallorca.mx" },
    () => 0.2,
  );
  assert.match(username, /^ana_perez\d{3}$/);
});

test("generates an 12-character password from the safe alphabet", () => {
  const password = generatePassword(12, () => 0.1);
  assert.equal(password.length, 12);
  assert.match(password, /^[A-HJ-NP-Za-km-z2-9]+$/);
});
