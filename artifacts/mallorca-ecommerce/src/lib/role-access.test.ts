import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./role-access.ts", import.meta.url), "utf8");

test("role permission query keeps its bounded interval and pauses background polling", () => {
  assert.match(source, /refetchInterval:\s*30000/);
  assert.match(source, /refetchIntervalInBackground:\s*false/);
  assert.match(source, /refetchOnWindowFocus:\s*true/);
  assert.match(source, /staleTime:\s*0/);
});

test("role permission query retains its authentication gate", () => {
  assert.match(source, /enabled,\s*staleTime:\s*0/);
});