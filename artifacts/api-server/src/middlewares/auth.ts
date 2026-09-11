import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import { db, usersTable, type User } from "@workspace/db";
import { eq } from "drizzle-orm";

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

export async function provisionUser(req: Request): Promise<User | undefined> {
  const auth = getAuth(req);
  const claims = (auth.sessionClaims ?? {}) as unknown as Record<string, unknown>;
  const userId = auth.userId ?? claimString(claims.userId);
  if (!userId) return undefined;
  const email =
    claimString(claims.email) ??
    claimString(claims.email_address) ??
    `${userId}@clerk.invalid`;
  const firstName = claimString(claims.first_name) ?? claimString(claims.firstName);
  const lastName = claimString(claims.last_name) ?? claimString(claims.lastName);
  const [user] = await db
    .insert(usersTable)
    .values({ id: userId, email, firstName, lastName })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: { email, firstName, lastName, updatedAt: new Date() },
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

export async function getRequestUser(req: Request): Promise<User | undefined> {
  return req.localUser ?? provisionUser(req);
}
