import assert from "node:assert/strict";
import test from "node:test";
import { StaffCredentialSyncError, syncStaffCredentials } from "./staff-credential-sync.ts";

const staff = { userId: "user_clerk_staff", username: "equipo", password: "una-clave-de-prueba-segura" };

test("synchronizes the same password sent by an administrator", async () => {
  let received: Record<string, unknown> | undefined;
  await syncStaffCredentials(staff, true, async (id, update) => {
    assert.equal(id, staff.userId);
    received = update;
  });
  assert.equal(received?.password, staff.password);
  assert.equal(received?.skipPasswordChecks, false);
});

test("rejects a provider refusal without exposing the password", async () => {
  await assert.rejects(
    syncStaffCredentials(staff, true, async () => {
      throw { errors: [{ code: "form_password_pwned", message: staff.password }] };
    }),
    (error: unknown) => {
      assert.ok(error instanceof StaffCredentialSyncError);
      assert.equal(error.code, "form_password_pwned");
      assert.equal(error.message.includes(staff.password), false);
      return true;
    },
  );
});

test("rejects provider network failure and missing provider configuration", async () => {
  await assert.rejects(
    syncStaffCredentials(staff, true, async () => { throw new Error("network unavailable"); }),
    StaffCredentialSyncError,
  );
  await assert.rejects(
    syncStaffCredentials(staff, false, async () => { throw new Error("should not run"); }),
    StaffCredentialSyncError,
  );
});

test("keeps isolated local development accounts off Clerk", async () => {
  await syncStaffCredentials({ ...staff, userId: "user_local_test" }, false, async () => {
    throw new Error("should not run");
  });
});