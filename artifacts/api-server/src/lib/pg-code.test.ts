import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pgCode } from "./pg-code.ts";

describe("pgCode", () => {
  it("reads a top-level Postgres SQLSTATE", () => {
    assert.equal(pgCode({ code: "23505" }), "23505");
  });

  it("walks Drizzle-wrapped cause.code", () => {
    assert.equal(pgCode({ message: "insert failed", cause: { code: "23505" } }), "23505");
    assert.equal(
      pgCode({ cause: { cause: { code: "23505", message: "duplicate key" } } }),
      "23505",
    );
  });

  it("ignores non-Postgres string codes", () => {
    assert.equal(pgCode({ code: "ECONNRESET" }), null);
    assert.equal(pgCode(new Error("boom")), null);
  });
});
