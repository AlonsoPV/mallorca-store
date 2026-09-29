import { clerkClient, getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import { db, usersTable, branchUserAssignmentsTable, type User } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "../lib/logger";

declare global {
  namespace Express {
    interface Request {
      localUser?: User;
      userId?: string;
    }
  }
}

const LOCAL_DEV_AUTH_TOKEN = "local-dev";
const CLERK_PROFILE_REFRESH_INTERVAL_MS = 15 * 60_000;
const MAX_CLERK_PROFILE_REFRESH_USERS = 10_000;
const clerkProfileRefreshAttempts = new Map<string, number>();

type UserProfile = Pick<User, "email" | "firstName" | "lastName">;
type UserProfileInput = {
  email?: string;
  firstName?: string;
  lastName?: string;
};

export function userProfileChanges(
  current: UserProfile,
  profile: UserProfileInput,
): Partial<UserProfile> {
  const changes: Partial<UserProfile> = {};
  if (profile.email !== undefined && profile.email !== current.email) changes.email = profile.email;
  if (profile.firstName !== undefined && profile.firstName !== current.firstName) {
    changes.firstName = profile.firstName;
  }
  if (profile.lastName !== undefined && profile.lastName !== current.lastName) {
    changes.lastName = profile.lastName;
  }
  return changes;
}

export function shouldRefreshClerkProfile(userId: string, now = Date.now()): boolean {
  const lastAttempt = clerkProfileRefreshAttempts.get(userId);
  if (lastAttempt !== undefined && now - lastAttempt < CLERK_PROFILE_REFRESH_INTERVAL_MS) {
    clerkProfileRefreshAttempts.delete(userId);
    clerkProfileRefreshAttempts.set(userId, lastAttempt);
    return false;
  }

  clerkProfileRefreshAttempts.delete(userId);
  clerkProfileRefreshAttempts.set(userId, now);
  if (clerkProfileRefreshAttempts.size > MAX_CLERK_PROFILE_REFRESH_USERS) {
    const oldestUserId = clerkProfileRefreshAttempts.keys().next().value;
    if (oldestUserId !== undefined) clerkProfileRefreshAttempts.delete(oldestUserId);
  }
  return true;
}

export function shouldPromoteInitialAdmin(
  user: Pick<User, "email" | "role">,
  initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase(),
): boolean {
  return Boolean(
    initialAdminEmail &&
      user.role !== "admin" &&
      user.email.toLowerCase() === initialAdminEmail.trim().toLowerCase(),
  );
}

function isLocalDevAuthEnabled(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  const flag = process.env.LOCAL_DEV_AUTH?.trim().toLowerCase();
  return flag === "1" || flag === "true";
}

function claimString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export async function findOrProvisionUser<T>(
  lookup: () => Promise<T | undefined>,
  provision: () => Promise<T | undefined>,
): Promise<T | undefined> {
  const existing = await lookup();
  if (existing) return existing;
  const created = await provision();
  return created ?? lookup();
}

function readBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") return undefined;
  return token;
}

async function provisionLocalDevUser(req: Request): Promise<User | undefined> {
  if (!isLocalDevAuthEnabled()) return undefined;
  const token = readBearerToken(req);
  if (!token) return undefined;

  if (token.startsWith("local-dev:")) {
    const userId = token.slice("local-dev:".length);
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) return undefined;
    req.userId = user.id;
    req.localUser = user;
    return user;
  }

  if (token !== LOCAL_DEV_AUTH_TOKEN) return undefined;

  const userId = process.env.LOCAL_DEV_USER_ID?.trim() || "user_local_dev_admin";
  const email = (
    process.env.LOCAL_DEV_USER_EMAIL?.trim() ||
    process.env.INITIAL_ADMIN_EMAIL?.trim() ||
    "local-admin@mallorca.local"
  ).toLowerCase();
  const firstName = process.env.LOCAL_DEV_USER_FIRST_NAME?.trim() || "Admin";
  const lastName = process.env.LOCAL_DEV_USER_LAST_NAME?.trim() || "Local";
  const role = "admin" as const;

  const user = await findOrProvisionUser(
    async () => {
      const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      return existing;
    },
    async () => {
      const [created] = await db
        .insert(usersTable)
        .values({ id: userId, email, firstName, lastName, role })
        .onConflictDoNothing({ target: usersTable.id })
        .returning();
      return created;
    },
  );
  if (!user) return undefined;

  req.userId = userId;
  req.localUser = user;
  return user;
}

async function resolveClerkProfile(userId: string): Promise<{
  email?: string;
  firstName?: string;
  lastName?: string;
}> {
  try {
    const clerkUser = await clerkClient.users.getUser(userId);
    return {
      email:
        clerkUser.primaryEmailAddress?.emailAddress ??
        clerkUser.emailAddresses[0]?.emailAddress,
      firstName: clerkUser.firstName ?? undefined,
      lastName: clerkUser.lastName ?? undefined,
    };
  } catch (error) {
    logger.warn({ userId, error }, "Unable to resolve authenticated Clerk profile");
    return {};
  }
}

export async function provisionUser(req: Request): Promise<User | undefined> {
  const localDevUser = await provisionLocalDevUser(req);
  if (localDevUser) return localDevUser;

  const auth = getAuth(req);
  const claims = (auth.sessionClaims ?? {}) as unknown as Record<string, unknown>;
  const userId = auth.userId ?? claimString(claims.userId);
  if (!userId) return undefined;
  const lookup = async () => {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    return user;
  };
  const claimProfile: UserProfileInput = {
    email: claimString(claims.email) ?? claimString(claims.email_address),
    firstName: claimString(claims.first_name) ?? claimString(claims.firstName),
    lastName: claimString(claims.last_name) ?? claimString(claims.lastName),
  };
  let createdUser = false;
  const user = await findOrProvisionUser(
    lookup,
    async () => {
      const hasMissingClaims =
        !claimProfile.email || claimProfile.firstName === undefined || claimProfile.lastName === undefined;
      const clerkProfile = !hasMissingClaims
        ? {}
        : await resolveClerkProfile(userId);
      const email = claimProfile.email ?? clerkProfile.email ?? `${userId}@clerk.invalid`;
      const firstName = claimProfile.firstName ?? clerkProfile.firstName;
      const lastName = claimProfile.lastName ?? clerkProfile.lastName;
      const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
      const role = initialAdminEmail && email.toLowerCase() === initialAdminEmail ? "admin" : undefined;
      const [created] = await db
        .insert(usersTable)
        .values({ id: userId, email, firstName, lastName, ...(role ? { role } : {}) })
        .onConflictDoNothing({ target: usersTable.id })
        .returning();
      createdUser = Boolean(created);
      return created;
    },
  );
  if (!user) return undefined;
  const currentUser = createdUser
    ? user
    : await syncExistingUserProfile(user, userId, claimProfile);
  if (!currentUser) return undefined;
  const authorizedUser = await promoteInitialAdmin(currentUser);
  if (!authorizedUser) return undefined;
  req.userId = authorizedUser.id;
  req.localUser = authorizedUser;
  return authorizedUser;
}

async function promoteInitialAdmin(user: User): Promise<User | undefined> {
  if (!shouldPromoteInitialAdmin(user)) return user;
  const [promoted] = await db
    .update(usersTable)
    .set({ role: "admin", updatedAt: new Date() })
    .where(eq(usersTable.id, user.id))
    .returning();
  return promoted;
}

async function syncExistingUserProfile(
  user: User,
  userId: string,
  claimProfile: UserProfileInput,
): Promise<User | undefined> {
  const hasMissingClaims =
    claimProfile.email === undefined ||
    claimProfile.firstName === undefined ||
    claimProfile.lastName === undefined;
  const clerkProfile =
    hasMissingClaims && shouldRefreshClerkProfile(userId)
      ? await resolveClerkProfile(userId)
      : {};
  const profile: UserProfileInput = {
    email: claimProfile.email ?? clerkProfile.email,
    firstName: claimProfile.firstName ?? clerkProfile.firstName,
    lastName: claimProfile.lastName ?? clerkProfile.lastName,
  };
  const changes = userProfileChanges(user, profile);
  if (Object.keys(changes).length === 0) return user;

  const [updated] = await db
    .update(usersTable)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(usersTable.id, userId))
    .returning();
  return updated;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await provisionUser(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export function requireRole(...roles: User["role"][]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = req.localUser ?? (await provisionUser(req));
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

/** Roles retained for legacy admin callers, plus the explicitly global operations roles. */
export function hasGlobalBranchAccess(user: User): boolean {
  return user.role === "admin" || user.role === "operations_manager" || user.role === "operations" || user.role === "manager";
}

/**
 * Enforce branch scope server-side. A null result means the caller may address
 * every branch; otherwise callers may only address the returned assignments.
 */
export async function getAccessibleBranchIds(req: Request): Promise<number[] | null> {
  const user = await getRequestUser(req);
  if (!user) return [];
  if (hasGlobalBranchAccess(user)) return null;
  if (user.role !== "staff" && user.role !== "branch_manager") return [];
  const rows = await db
    .select({ branchId: branchUserAssignmentsTable.branchId })
    .from(branchUserAssignmentsTable)
    .where(
      and(
        eq(branchUserAssignmentsTable.userId, user.id),
        eq(branchUserAssignmentsTable.active, true),
      ),
    );
  return rows.map((row) => row.branchId);
}

export async function canAccessBranch(req: Request, branchId: number): Promise<boolean> {
  const ids = await getAccessibleBranchIds(req);
  return ids === null || ids.includes(branchId);
}

export async function getRequestUser(req: Request): Promise<User | undefined> {
  return req.localUser ?? provisionUser(req);
}
