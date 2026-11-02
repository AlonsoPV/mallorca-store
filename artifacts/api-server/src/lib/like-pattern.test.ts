import assert from "node:assert/strict";
import test from "node:test";
import { likeContainsPattern } from "./like-pattern.ts";

test("strips LIKE wildcards so user input cannot match everything", () => {
  assert.equal(likeContainsPattern("  pan  "), "%pan%");
  assert.equal(likeContainsPattern("%_\\"), null);
  assert.equal(likeContainsPattern("100%"), "%100%");
});
