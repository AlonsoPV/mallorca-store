import { clerkClient } from "@clerk/express";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, passwordResetTokensTable, usersTable } from "@workspace/db";
import { emailFromAddress, resolveMailbox, sendReceiptEmail } from "../../order-email-transport.mjs";
import { findUserByIdentifier } from "./admin-users";
import { loadStoredMailboxes, mailboxSendConfig } from "./mailboxes";
import { hashPassword } from "./password";
import { logger } from "./logger";

const TOKEN_TTL_MS = 60 * 60 * 1000;
const REQUEST_COOLDOWN_MS = 5 * 60 * 1000;
const GENERIC_OK =
  "Si la cuenta existe, recibirás un enlace para restablecer la contraseña.";
const UNAVAILABLE = "El servicio de recuperación no está disponible en este momento. Inténtalo más tarde.";
const INVALID_TOKEN = "El enlace caducó o ya se usó. Solicita uno nuevo.";

type RequestResult =
  | { ok: true; message: string }
  | { ok: false; error: string; status: 503 };
type ConfirmResult =
  | { ok: true }
  | { ok: false; error: string; status: number };
type IdentityPasswordUpdater = (userId: string, password: string) => Promise<void>;

async function updateClerkPassword(userId: string, password: string): Promise<void> {
  await clerkClient.users.updateUser(userId, { password, skipPasswordChecks: false });
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isPasswordStrongEnough(password: string): boolean {
  return typeof password === "string" &&
    password.length >= 8 &&
    password.length <= 128 &&
    password.trim().length >= 8;
}

function publicAppOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  const domain = String(env.REPLIT_DEV_DOMAIN || "").split(",")[0]?.trim();
  const candidate =
    String(env.PUBLIC_APP_URL || "").trim() ||
    (env.NODE_ENV !== "production" && domain ? `https://${domain}` : "");
  try {
    const url = new URL(candidate);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      return null;
    }
    if (env.NODE_ENV === "production" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function buildResetEmail(params: {
  name: string;
  resetUrl: string;
}) {
  const text = [
    `Hola ${params.name},`,
    "",
    "Recibimos una solicitud para restablecer tu contraseña de Pastelería Mallorca.",
    `Abre este enlace (válido 1 hora): ${params.resetUrl}`,
    "",
    "Si no pediste este cambio, ignora este correo.",
  ].join("\n");
  const html = `
    <p>Hola ${escapeHtml(params.name)},</p>
    <p>Recibimos una solicitud para restablecer tu contraseña de Pastelería Mallorca.</p>
    <p><a href="${escapeHtml(params.resetUrl)}">Restablecer contraseña</a></p>
    <p>El enlace caduca en 1 hora. Si no pediste este cambio, ignora este correo.</p>
  `;
  return {
    subject: "Restablecer contraseña — Pastelería Mallorca",
    text,
    html,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function requestPasswordReset(
  identifier: string,
  env: NodeJS.ProcessEnv = process.env,
  options: { sendEmail?: typeof sendReceiptEmail } = {},
): Promise<RequestResult> {
  const message = GENERIC_OK;
  const trimmed = String(identifier || "").trim();
  if (!trimmed) return { ok: true, message };

  const origin = publicAppOrigin(env);
  if (!origin) {
    logger.warn("Password reset unavailable: PUBLIC_APP_URL missing or invalid");
    return { ok: false, error: UNAVAILABLE, status: 503 };
  }

  const stored = await loadStoredMailboxes();
  const mailbox = mailboxSendConfig("customer", stored);
  if (!mailbox && !resolveMailbox("customer", env) &&
      !(env.RESEND_API_KEY && emailFromAddress("customer", env))) {
    logger.warn("Password reset unavailable: customer email sender not configured");
    return { ok: false, error: UNAVAILABLE, status: 503 };
  }

  const user = await findUserByIdentifier(trimmed);
  if (!user?.email) {
    return { ok: true, message };
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(token);
  const id = `prt_${randomBytes(12).toString("hex")}`;
  const now = new Date();
  try {
    const issued = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .for("update");
      if (!locked) return false;

      const [recent] = await tx
        .select({ id: passwordResetTokensTable.id })
        .from(passwordResetTokensTable)
        .where(and(
          eq(passwordResetTokensTable.userId, user.id),
          isNull(passwordResetTokensTable.usedAt),
          gt(passwordResetTokensTable.createdAt, new Date(now.getTime() - REQUEST_COOLDOWN_MS)),
        ))
        .limit(1);
      if (recent) return false;

      await tx
        .update(passwordResetTokensTable)
        .set({ usedAt: now })
        .where(and(
          eq(passwordResetTokensTable.userId, user.id),
          isNull(passwordResetTokensTable.usedAt),
        ));
      await tx.insert(passwordResetTokensTable).values({
        id,
        userId: user.id,
        tokenHash,
        expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
      });
      return true;
    });
    if (!issued) return { ok: true, message };
  } catch (error) {
    logger.error({ error }, "Unable to issue password reset token");
    return { ok: false, error: UNAVAILABLE, status: 503 };
  }

  const resetUrl = `${origin}/recuperar-contrasena/${encodeURIComponent(token)}`;
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.username ||
    user.email;
  const content = buildResetEmail({ name, resetUrl });

  try {
    await (options.sendEmail ?? sendReceiptEmail)(
      {
        from: mailbox?.from || emailFromAddress("customer", env),
        to: [user.email],
        reply_to: mailbox?.replyTo,
        ...content,
      },
      id,
      {
        env,
        audience: "customer",
        mailbox,
        apiKey: env.RESEND_API_KEY,
      },
    );
  } catch (error) {
    logger.warn({ userId: user.id, error }, "Password reset email failed");
    await db
      .update(passwordResetTokensTable)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokensTable.id, id))
      .catch((updateError) => logger.error({ updateError }, "Unable to revoke unsent password reset token"));
  }

  return { ok: true, message };
}

export async function confirmPasswordReset(params: {
  token: string;
  password: string;
}, updateIdentityPassword: IdentityPasswordUpdater = updateClerkPassword): Promise<ConfirmResult> {
  const token = String(params.token || "").trim();
  const password = String(params.password || "");
  if (!/^[0-9a-f]{64}$/.test(token)) {
    return { ok: false, error: INVALID_TOKEN, status: 400 };
  }
  if (!isPasswordStrongEnough(password)) {
    return { ok: false, error: "La contraseña debe tener entre 8 y 128 caracteres.", status: 400 };
  }

  const tokenHash = hashResetToken(token);
  const now = new Date();
  try {
    return await db.transaction(async (tx): Promise<ConfirmResult> => {
      const [claimed] = await tx
        .update(passwordResetTokensTable)
        .set({ usedAt: now })
        .where(and(
          eq(passwordResetTokensTable.tokenHash, tokenHash),
          isNull(passwordResetTokensTable.usedAt),
          gt(passwordResetTokensTable.expiresAt, now),
        ))
        .returning({ userId: passwordResetTokensTable.userId });
      if (!claimed) return { ok: false, error: INVALID_TOKEN, status: 400 };

      const [user] = await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, claimed.userId))
        .limit(1);
      if (!user) return { ok: false, error: INVALID_TOKEN, status: 400 };

      if (!user.id.startsWith("user_local_")) {
        await updateIdentityPassword(user.id, password);
      }
      await tx
        .update(usersTable)
        .set({ passwordHash: hashPassword(password), updatedAt: now })
        .where(eq(usersTable.id, user.id));
      await tx
        .update(passwordResetTokensTable)
        .set({ usedAt: now })
        .where(and(
          eq(passwordResetTokensTable.userId, user.id),
          isNull(passwordResetTokensTable.usedAt),
        ));
      return { ok: true };
    });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error
      ? Number(error.status)
      : 0;
    logger.warn({ status, errorName: error instanceof Error ? error.name : "unknown" }, "Password reset failed");
    return status === 400 || status === 422
      ? { ok: false, error: "La contraseña no cumple los requisitos de seguridad. Prueba otra.", status: 400 }
      : { ok: false, error: UNAVAILABLE, status: 503 };
  }
}
