import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { db, passwordResetTokensTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  confirmPasswordReset,
  hashResetToken,
  isPasswordStrongEnough,
  requestPasswordReset,
} from "./password-reset";
import { verifyPassword } from "./password";

test("reset links are delivered generically, single-use, and only complete after identity sync", async (t) => {
  const suffix = randomBytes(8).toString("hex");
  const userId = `user_reset_test_${suffix}`;
  const email = `reset-${suffix}@example.invalid`;
  await db.insert(usersTable).values({ id: userId, email, role: "admin" });
  t.after(async () => {
    await db.delete(usersTable).where(eq(usersTable.id, userId));
  });

  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    PUBLIC_APP_URL: "https://example.test",
    ORDER_EMAIL_FROM_CUSTOMER: "Mallorca <noreply@example.test>",
    SMTP_CUSTOMER_USER: "noreply@example.test",
    SMTP_CUSTOMER_PASS: "test-only",
  };
  const sent: string[] = [];
  const sendEmail = async (payload: { text: string }) => {
    sent.push(payload.text);
    return "test-message";
  };

  const requested = await requestPasswordReset(email, env, { sendEmail });
  const unknown = await requestPasswordReset(`missing-${suffix}@example.invalid`, env, { sendEmail });
  assert.deepEqual(unknown, requested);
  assert.equal(sent.length, 1);
  await requestPasswordReset(email, env, { sendEmail });
  assert.equal(sent.length, 1, "repeat requests during cooldown must not send another email");

  const token = /https:\/\/example\.test\/recuperar-contrasena\/([0-9a-f]{64})/.exec(sent[0])?.[1];
  assert.ok(token);
  const [issued] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.userId, userId));
  assert.equal(issued.tokenHash, hashResetToken(token));
  assert.equal(issued.usedAt, null);

  const outage = await confirmPasswordReset(
    { token, password: "NuevaContraseña2026!" },
    async () => { throw Object.assign(new Error("test outage"), { status: 503 }); },
  );
  assert.equal(outage.ok, false);
  if (!outage.ok) assert.equal(outage.status, 503);
  const [stillValid] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.id, issued.id));
  assert.equal(stillValid.usedAt, null, "identity failure must leave the link usable");

  const siblingToken = randomBytes(32).toString("hex");
  await db.insert(passwordResetTokensTable).values({
    id: `prt_sibling_${suffix}`,
    userId,
    tokenHash: hashResetToken(siblingToken),
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  let updatedUserId = "";
  const confirmed = await confirmPasswordReset(
    { token, password: "NuevaContraseña2026!" },
    async (id) => { updatedUserId = id; },
  );
  assert.deepEqual(confirmed, { ok: true });
  assert.equal(updatedUserId, userId);
  const [updated] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  assert.ok(verifyPassword("NuevaContraseña2026!", updated.passwordHash));
  const [usedSibling] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.tokenHash, hashResetToken(siblingToken)));
  assert.ok(usedSibling.usedAt, "other links must be revoked after a successful reset");
  assert.equal((await confirmPasswordReset({ token, password: "OtraContraseña2026!" })).ok, false);

  const concurrentToken = randomBytes(32).toString("hex");
  await db.insert(passwordResetTokensTable).values({
    id: `prt_concurrent_${suffix}`,
    userId,
    tokenHash: hashResetToken(concurrentToken),
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  let identityUpdates = 0;
  const updateIdentity = async () => { identityUpdates += 1; };
  const simultaneous = await Promise.all([
    confirmPasswordReset({ token: concurrentToken, password: "ContraseñaParalelaA1!" }, updateIdentity),
    confirmPasswordReset({ token: concurrentToken, password: "ContraseñaParalelaB2!" }, updateIdentity),
  ]);
  assert.equal(simultaneous.filter((result) => result.ok).length, 1);
  assert.equal(identityUpdates, 1, "a token must never trigger two identity updates");

  const expiredToken = randomBytes(32).toString("hex");
  await db.insert(passwordResetTokensTable).values({
    id: `prt_expired_${suffix}`,
    userId,
    tokenHash: hashResetToken(expiredToken),
    expiresAt: new Date(Date.now() - 1000),
  });
  assert.equal((await confirmPasswordReset({ token: expiredToken, password: "ContraseñaNueva2026!" })).ok, false);
});

test("password policy rejects weak and oversized values without touching the database", async () => {
  assert.equal(isPasswordStrongEnough("1234567"), false);
  assert.equal(isPasswordStrongEnough("        "), false);
  assert.equal(isPasswordStrongEnough("a".repeat(129)), false);
  assert.equal(isPasswordStrongEnough("ContraseñaNueva2026!"), true);
  assert.equal((await confirmPasswordReset({ token: "not-a-token", password: "ContraseñaNueva2026!" })).ok, false);
});