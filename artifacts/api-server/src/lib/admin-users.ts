import { clerkClient } from "@clerk/express";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  branchUserAssignmentsTable,
  usersTable,
  type User,
} from "@workspace/db";
import { logger } from "./logger";
import { generateUsername, isValidUsername, normalizeUsername } from "./staff-credentials.ts";

export const ADMIN_STAFF_ROLES = [
  "staff",
  "branch_manager",
  "operations",
  "operations_manager",
  "manager",
  "admin",
] as const;

export type AdminStaffRole = (typeof ADMIN_STAFF_ROLES)[number];

export function isAdminStaffRole(role: string): role is AdminStaffRole {
  return (ADMIN_STAFF_ROLES as readonly string[]).includes(role);
}

export function canManageUsers(actor: User): boolean {
  return actor.role === "admin" || actor.role === "operations_manager";
}

export function canAssignRole(actor: User, role: AdminStaffRole): boolean {
  if (actor.role === "admin") return true;
  if (actor.role === "operations_manager") {
    return role !== "admin" && role !== "operations_manager";
  }
  return false;
}

export function serializeSafeUser(user: {
  id: string;
  email: string;
  role: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  createdAt?: Date | string | null;
}) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;
  return {
    id: user.id,
    name,
    email: user.email,
    username: user.username ?? null,
    role: user.role,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    phone: user.phone ?? null,
    createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : undefined,
  };
}

function clerkConfigured(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY?.trim());
}

function localDevAuthEnabled(): boolean {
  const flag = process.env.LOCAL_DEV_AUTH?.trim().toLowerCase();
  return flag === "1" || flag === "true";
}

export async function resolveIdentityForAdminUser(params: {
  email: string;
  username?: string | null;
  password?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  sendInvite?: boolean;
}): Promise<{ userId: string; inviteSent: boolean; identitySource: "clerk" | "local" }> {
  const email = params.email.trim().toLowerCase();
  const sendInvite = params.sendInvite !== false && !params.password;

  if (!clerkConfigured() || localDevAuthEnabled()) {
    const slug = email.replace(/[^a-z0-9]+/g, "_").slice(0, 40);
    return {
      userId: `user_local_${slug}_${Date.now().toString(36)}`,
      inviteSent: false,
      identitySource: "local",
    };
  }

  try {
    const existing = await clerkClient.users.getUserList({
      emailAddress: [email],
      limit: 1,
    });
    const found = existing.data[0];
    if (found) {
      await clerkClient.users.updateUser(found.id, {
        firstName: params.firstName ?? undefined,
        lastName: params.lastName ?? undefined,
        username: params.username ?? undefined,
        ...(params.password
          ? { password: params.password, skipPasswordChecks: false }
          : {}),
      });
      return { userId: found.id, inviteSent: false, identitySource: "clerk" };
    }

    const created = await clerkClient.users.createUser({
      emailAddress: [email],
      username: params.username ?? undefined,
      password: params.password ?? undefined,
      firstName: params.firstName ?? undefined,
      lastName: params.lastName ?? undefined,
      skipPasswordRequirement: !params.password,
      skipPasswordChecks: !params.password,
    });

    let inviteSent = false;
    if (sendInvite) {
      try {
        await clerkClient.invitations.createInvitation({
          emailAddress: email,
          ignoreExisting: true,
        });
        inviteSent = true;
      } catch (error) {
        logger.warn({ email, error }, "Clerk invitation failed after createUser");
      }
    }

    return { userId: created.id, inviteSent, identitySource: "clerk" };
  } catch (error) {
    logger.error({ email, error }, "Failed to resolve Clerk identity for admin user create");
    throw error;
  }
}

export async function syncClerkCredentials(params: {
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  password?: string | null;
}) {
  if (!clerkConfigured() || params.userId.startsWith("user_local_")) return;
  try {
    await clerkClient.users.updateUser(params.userId, {
      firstName: params.firstName ?? undefined,
      lastName: params.lastName ?? undefined,
      username: params.username ?? undefined,
      ...(params.password
        ? { password: params.password, skipPasswordChecks: false }
        : {}),
    });
  } catch (error) {
    logger.warn({ userId: params.userId, error }, "Unable to sync Clerk credentials");
  }
}

export async function syncClerkProfile(params: {
  userId: string;
  firstName?: string | null;
  lastName?: string | null;
}) {
  if (!clerkConfigured() || params.userId.startsWith("user_local_")) return;
  try {
    await clerkClient.users.updateUser(params.userId, {
      firstName: params.firstName ?? undefined,
      lastName: params.lastName ?? undefined,
    });
  } catch (error) {
    logger.warn({ userId: params.userId, error }, "Unable to sync Clerk profile");
  }
}

export async function findUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const [row] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${normalized}`)
    .limit(1);
  return row;
}

export async function findUserByUsername(username: string) {
  const normalized = username.trim().toLowerCase();
  if (!normalized) return undefined;
  const [row] = await db
    .select()
    .from(usersTable)
    .where(sql`lower(${usersTable.username}) = ${normalized}`)
    .limit(1);
  return row;
}

export async function allocateUsername(
  preferred: string | null | undefined,
  seed: { firstName?: string | null; lastName?: string | null; email?: string | null },
  excludeUserId?: string,
): Promise<string> {
  let base = preferred?.trim() ? normalizeUsername(preferred) : generateUsername(seed);
  if (!isValidUsername(base)) base = generateUsername(seed);
  for (let i = 0; i < 25; i += 1) {
    const candidate = i === 0 ? base : `${base.slice(0, 24)}${i + 1}`;
    const existing = await findUserByUsername(candidate);
    if (!existing || existing.id === excludeUserId) return candidate;
  }
  return `${base.slice(0, 20)}${Date.now().toString(36).slice(-6)}`;
}

export async function assignUserToBranch(params: {
  branchId: number;
  userId: string;
  role: "branch_manager" | "staff" | "operations";
  isPrimary?: boolean;
}) {
  if (params.isPrimary) {
    await db
      .update(branchUserAssignmentsTable)
      .set({ isPrimary: false })
      .where(eq(branchUserAssignmentsTable.branchId, params.branchId));
  }

  const [inserted] = await db
    .insert(branchUserAssignmentsTable)
    .values({
      branchId: params.branchId,
      userId: params.userId,
      role: params.role,
      isPrimary: params.isPrimary ?? false,
      active: true,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted) return inserted;

  const [updated] = await db
    .update(branchUserAssignmentsTable)
    .set({
      role: params.role,
      isPrimary: params.isPrimary ?? false,
      active: true,
    })
    .where(
      and(
        eq(branchUserAssignmentsTable.branchId, params.branchId),
        eq(branchUserAssignmentsTable.userId, params.userId),
      ),
    )
    .returning();
  return updated;
}
