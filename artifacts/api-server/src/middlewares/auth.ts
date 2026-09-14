import { clerkClient, getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import { db, usersTable, branchUserAssignmentsTable, type User } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

declare global {
  namespace Express {
    interface Request {
      localUser?: User;
      userId?: string;
    }
  }
}

function claimString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
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
  const auth = getAuth(req);
  const claims = (auth.sessionClaims ?? {}) as unknown as Record<string, unknown>;
  const userId = auth.userId ?? claimString(claims.userId);
  if (!userId) return undefined;
  const claimEmail =
    claimString(claims.email) ??
    claimString(claims.email_address) ??
    undefined;
  const claimFirstName = claimString(claims.first_name) ?? claimString(claims.firstName);
  const claimLastName = claimString(claims.last_name) ?? claimString(claims.lastName);
  const clerkProfile = claimEmail && claimFirstName !== undefined && claimLastName !== undefined
    ? {}
    : await resolveClerkProfile(userId);
  const email = claimEmail ?? clerkProfile.email ?? `${userId}@clerk.invalid`;
  const firstName = claimFirstName ?? clerkProfile.firstName;
  const lastName = claimLastName ?? clerkProfile.lastName;
  const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const role = initialAdminEmail && email.toLowerCase() === initialAdminEmail ? "admin" : undefined;
  const [user] = await db
    .insert(usersTable)
    .values({ id: userId, email, firstName, lastName, ...(role ? { role } : {}) })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        email,
        firstName,
        lastName,
        ...(role ? { role } : {}),
        updatedAt: new Date(),
      },
    })
    .returning();
  req.userId = userId;
  req.localUser = user;
  return user;
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
    .where(eq(branchUserAssignmentsTable.userId, user.id));
  return rows.map((row) => row.branchId);
}

export async function canAccessBranch(req: Request, branchId: number): Promise<boolean> {
  const ids = await getAccessibleBranchIds(req);
  return ids === null || ids.includes(branchId);
}

export async function getRequestUser(req: Request): Promise<User | undefined> {
  return req.localUser ?? provisionUser(req);
}
