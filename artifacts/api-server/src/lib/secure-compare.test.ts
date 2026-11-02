import assert from "node:assert/strict";
import test from "node:test";
import { secretsMatch } from "./secure-compare.ts";

test("guest tokens match only when both values are present and equal", () => {
  assert.equal(secretsMatch("abc", "abc"), true);
  assert.equal(secretsMatch("abc", "abd"), false);
  assert.equal(secretsMatch("abc", "ab"), false);
  assert.equal(secretsMatch("abc", null), false);
  assert.equal(secretsMatch(undefined, "abc"), false);
});
