import assert from "node:assert/strict";
import test from "node:test";
import { assertLocalDevAuthAllowed, isLocalDevAuthFlagOn } from "./local-dev-guard.ts";

test("LOCAL_DEV_AUTH is recognized from true/1 flags", () => {
  assert.equal(isLocalDevAuthFlagOn({ LOCAL_DEV_AUTH: "true" } as NodeJS.ProcessEnv), true);
  assert.equal(isLocalDevAuthFlagOn({ LOCAL_DEV_AUTH: "1" } as NodeJS.ProcessEnv), true);
  assert.equal(isLocalDevAuthFlagOn({ LOCAL_DEV_AUTH: "false" } as NodeJS.ProcessEnv), false);
});

test("LOCAL_DEV_AUTH cannot be enabled in production", () => {
  assert.doesNotThrow(() =>
    assertLocalDevAuthAllowed({ NODE_ENV: "development", LOCAL_DEV_AUTH: "true" } as NodeJS.ProcessEnv),
  );
  assert.throws(
    () => assertLocalDevAuthAllowed({ NODE_ENV: "production", LOCAL_DEV_AUTH: "true" } as NodeJS.ProcessEnv),
    /LOCAL_DEV_AUTH cannot be enabled/,
  );
});
