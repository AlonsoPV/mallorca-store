import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, passwordResetTokensTable, usersTable } from "@workspace/db";
import { sendReceiptEmail } from "../../order-email-transport.mjs";
import { findUserByIdentifier, isAdminStaffRole, syncClerkCredentials } from "./admin-users";
import { loadStoredMailboxes, mailboxSendConfig } from "./mailboxes";
import { hashPassword } from "./password";
import { logger } from "./logger";

const TOKEN_TTL_MS = 60 * 60 * 1000;
const GENERIC_OK =
  "Si el usuario existe, enviamos un correo con el enlace para restablecer la contraseña.";

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isPasswordStrongEnough(password: string): boolean {
  return typeof password === "string" && password.trim().length >= 8;
}

function publicAppOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  const origin = String(env.PUBLIC_APP_URL || "").trim().replace(/\/$/, "");
  if (!origin || !/^https?:\/\//.test(origin)) return null;
  return origin;
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
): Promise<{ ok: true; message: string }> {
  const message = GENERIC_OK;
  const trimmed = String(identifier || "").trim();
  if (!trimmed) return { ok: true, message };

  const origin = publicAppOrigin(env);
  if (!origin) {
    logger.warn("Password reset skipped: PUBLIC_APP_URL missing");
    return { ok: true, message };
  }

  const user = await findUserByIdentifier(trimmed);
  if (!user || !isAdminStaffRole(user.role) || !user.email) {
    return { ok: true, message };
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(token);
  const id = `prt_${randomBytes(12).toString("hex")}`;
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await db
    .update(passwordResetTokensTable)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(passwordResetTokensTable.userId, user.id),
        isNull(passwordResetTokensTable.usedAt),
      ),
    );

  await db.insert(passwordResetTokensTable).values({
    id,
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  const resetUrl = `${origin}/recuperar-contrasena/${encodeURIComponent(token)}`;
  const name =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.username ||
    user.email;
  const content = buildResetEmail({ name, resetUrl });
  const stored = await loadStoredMailboxes();
  const mailbox = mailboxSendConfig("customer", stored);

  try {
    await sendReceiptEmail(
      {
        from: mailbox?.from,
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
  }

  return { ok: true, message };
}

export async function confirmPasswordReset(params: {
  token: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const token = String(params.token || "").trim();
  const password = String(params.password || "");
  if (!token) return { ok: false, error: "Enlace inválido.", status: 400 };
  if (!isPasswordStrongEnough(password)) {
    return { ok: false, error: "La contraseña debe tener al menos 8 caracteres.", status: 400 };
  }

  const tokenHash = hashResetToken(token);
  const [row] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(
      and(
        eq(passwordResetTokensTable.tokenHash, tokenHash),
        isNull(passwordResetTokensTable.usedAt),
        gt(passwordResetTokensTable.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) {
    return { ok: false, error: "El enlace caducó o ya se usó. Solicita uno nuevo.", status: 400 };
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, row.userId))
    .limit(1);
  if (!user || !isAdminStaffRole(user.role)) {
    return { ok: false, error: "Usuario no válido.", status: 400 };
  }

  const passwordHash = hashPassword(password.trim());
  await db
    .update(usersTable)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));
  await db
    .update(passwordResetTokensTable)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokensTable.id, row.id));

  await syncClerkCredentials({
    userId: user.id,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    password: password.trim(),
  });

  return { ok: true };
}
