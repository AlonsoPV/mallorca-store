import { createHash } from "node:crypto";
import { db, usernameLoginAttemptsTable } from "@workspace/db";
import { eq, lt, sql } from "drizzle-orm";
import { findUserByUsername } from "./admin-users";
import { logger } from "./logger";
import { verifiedStaffEmail } from "./staff-username-verification";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const GLOBAL_MINUTE_MS = 60 * 1000;
const GLOBAL_MINUTE_ATTEMPTS = 120;
const GLOBAL_SECOND_MS = 1000;
const GLOBAL_SECOND_ATTEMPTS = 8;
let lastPrunedAt = 0;

export type UsernameResolution =
  | { status: "ok"; email: string }
  | { status: "invalid" }
  | { status: "limited" };

async function reserveAttempt(key: string, windowMs: number, maxAttempts: number): Promise<boolean> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowMs);
  const [row] = await db
    .insert(usernameLoginAttemptsTable)
    .values({ key, attempts: 1, windowStartedAt: now })
    .onConflictDoUpdate({
      target: usernameLoginAttemptsTable.key,
      set: {
        attempts: sql`CASE WHEN ${usernameLoginAttemptsTable.windowStartedAt} <= ${cutoff} THEN 1 ELSE ${usernameLoginAttemptsTable.attempts} + 1 END`,
        windowStartedAt: sql`CASE WHEN ${usernameLoginAttemptsTable.windowStartedAt} <= ${cutoff} THEN ${now} ELSE ${usernameLoginAttemptsTable.windowStartedAt} END`,
      },
    })
    .returning({ attempts: usernameLoginAttemptsTable.attempts });

  if (now.getTime() - lastPrunedAt > 6 * 60 * 60 * 1000) {
    lastPrunedAt = now.getTime();
    void db.delete(usernameLoginAttemptsTable)
      .where(lt(usernameLoginAttemptsTable.windowStartedAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)))
      .catch((error) => logger.warn({ error }, "Unable to prune username login attempts"));
  }

  return Boolean(row && row.attempts <= maxAttempts);
}

export async function resolveStaffUsername(username: string, password: string): Promise<UsernameResolution> {
  const normalized = username.trim().toLowerCase();
  if (!(await reserveAttempt("global:second", GLOBAL_SECOND_MS, GLOBAL_SECOND_ATTEMPTS))) {
    return { status: "limited" };
  }
  if (!(await reserveAttempt("global:minute", GLOBAL_MINUTE_MS, GLOBAL_MINUTE_ATTEMPTS))) {
    return { status: "limited" };
  }
  const key = `username:${createHash("sha256").update(normalized).digest("hex")}`;
  if (!(await reserveAttempt(key, WINDOW_MS, MAX_ATTEMPTS))) return { status: "limited" };

  const user = await findUserByUsername(normalized);
  const email = verifiedStaffEmail(user, password);
  if (!email) return { status: "invalid" };

  await db.delete(usernameLoginAttemptsTable).where(eq(usernameLoginAttemptsTable.key, key));
  return { status: "ok", email };
}