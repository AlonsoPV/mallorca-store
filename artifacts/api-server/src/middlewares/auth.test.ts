import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findOrProvisionUser,
  shouldPromoteInitialAdmin,
  shouldRefreshClerkProfile,
  userProfileChanges,
} from "./auth.ts";

test("authenticated existing user is returned without provisioning or writing", async () => {
  const currentUser = { id: "user_1", role: "staff" };
  let lookups = 0;
  let provisions = 0;

  const user = await findOrProvisionUser(
    async () => {
      lookups += 1;
      return currentUser;
    },
    async () => {
      provisions += 1;
      return { id: "user_1", role: "admin" };
    },
  );

  assert.equal(user, currentUser);
  assert.equal(lookups, 1);
  assert.equal(provisions, 0);
});

test("missing user is provisioned, with a re-read available for insert races", async () => {
  const currentUser = { id: "user_2", role: "customer" };
  let lookups = 0;
  let provisions = 0;

  const user = await findOrProvisionUser(
    async () => {
      lookups += 1;
      return lookups === 1 ? undefined : currentUser;
    },
    async () => {
      provisions += 1;
      return undefined;
    },
  );

  assert.equal(user, currentUser);
  assert.equal(lookups, 2);
  assert.equal(provisions, 1);
});

test("profile sync returns only changed identity fields, never role", () => {
  assert.deepEqual(
    userProfileChanges(
      { email: "old@example.com", firstName: "Old", lastName: "Name" },
      { email: "new@example.com", firstName: "Old", lastName: "Name" },
    ),
    { email: "new@example.com" },
  );
  assert.deepEqual(
    userProfileChanges(
      { email: "same@example.com", firstName: "Same", lastName: "Name" },
      { email: "same@example.com", firstName: undefined },
    ),
    {},
  );
});

test("Clerk fallback refresh is throttled by time", () => {
  const userId = "profile-refresh-throttle-test-user-a";
  const otherUserId = "profile-refresh-throttle-test-user-b";
  const firstAttempt = 1_000_000;
  assert.equal(shouldRefreshClerkProfile(userId, firstAttempt), true);
  assert.equal(shouldRefreshClerkProfile(otherUserId, firstAttempt), true);
  assert.equal(shouldRefreshClerkProfile(userId, firstAttempt + 15 * 60_000 - 1), false);
  assert.equal(shouldRefreshClerkProfile(userId, firstAttempt + 15 * 60_000), true);
});

test("only the configured initial-admin email is promoted, and already-admin users need no write", () => {
  assert.equal(
    shouldPromoteInitialAdmin({ email: "OWNER@example.com", role: "staff" }, "owner@example.com"),
    true,
  );
  assert.equal(
    shouldPromoteInitialAdmin({ email: "owner@example.com", role: "admin" }, "owner@example.com"),
    false,
  );
  assert.equal(
    shouldPromoteInitialAdmin({ email: "other@example.com", role: "staff" }, "owner@example.com"),
    false,
  );
});