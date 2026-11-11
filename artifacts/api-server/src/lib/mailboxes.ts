import { eq } from "drizzle-orm";
import { db, mailboxesTable, pool } from "@workspace/db";
import {
  catalogMailboxes,
  DEV_SYSTEM_DISPLAY_NAME,
  DEV_SYSTEM_EMAIL,
  formatMailboxFrom,
  parseFromDisplayName,
  type MailboxCatalog,
  type MailboxRole,
  type MailboxUpdateInput,
} from "../../mailbox-config.mjs";
import {
  emailFromAddress,
  emailReplyTo,
  extractEmailAddress,
  mailboxAuth,
  resolveMailbox,
} from "../../order-email-transport.mjs";
import { decryptSecret, encryptSecret } from "./payments/secrets";
import { logger } from "./logger";
import { pgCode } from "./pg-code";

const MAILBOXES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS mailboxes (
  role text PRIMARY KEY,
  address text NOT NULL DEFAULT '',
  display_name text,
  smtp_user text,
  password_encrypted text,
  smtp_host text NOT NULL DEFAULT 'smtp.hostinger.com',
  smtp_port integer NOT NULL DEFAULT 465,
  smtp_secure boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

function isMissingMailboxesTable(error: unknown) {
  return pgCode(error) === "42P01" || (error instanceof Error && /mailboxes/i.test(error.message));
}

async function ensureMailboxesTable() {
  await pool.query(MAILBOXES_TABLE_SQL);
}

export type StoredMailbox = typeof mailboxesTable.$inferSelect;

export type MailboxSendConfig = {
  from: string;
  user: string;
  pass: string;
  host: string;
  port: number;
  secure: boolean;
  replyTo?: string;
};

function envMailboxSeeds(env: NodeJS.ProcessEnv = process.env) {
  const customerFrom = emailFromAddress("customer", env);
  const branchFrom = emailFromAddress("branch", env);
  const contactFrom = emailReplyTo("customer", env);
  const systemFrom = emailFromAddress("system", env);
  const customerAuth = mailboxAuth("customer", env);
  const branchAuth = mailboxAuth("branch", env);
  const systemAuth = mailboxAuth("system", env);
  return [
    {
      role: "system" as const,
      address:
        extractEmailAddress(systemFrom) || systemAuth.user || DEV_SYSTEM_EMAIL,
      displayName: parseFromDisplayName(systemFrom) || DEV_SYSTEM_DISPLAY_NAME,
      smtpUser: systemAuth.user || DEV_SYSTEM_EMAIL,
      passwordConfigured: Boolean(systemAuth.pass),
    },
    {
      role: "customer" as const,
      address: extractEmailAddress(customerFrom) || customerAuth.user,
      displayName: parseFromDisplayName(customerFrom),
      smtpUser: customerAuth.user,
      passwordConfigured: Boolean(customerAuth.pass),
    },
    {
      role: "branch" as const,
      address: extractEmailAddress(branchFrom) || branchAuth.user,
      displayName: parseFromDisplayName(branchFrom),
      smtpUser: branchAuth.user,
      passwordConfigured: Boolean(branchAuth.pass),
    },
    {
      role: "contact" as const,
      address: extractEmailAddress(contactFrom),
      displayName: parseFromDisplayName(contactFrom),
      passwordConfigured: false,
    },
  ];
}

export async function loadStoredMailboxes(): Promise<StoredMailbox[]> {
  try {
    return await db.select().from(mailboxesTable);
  } catch (error) {
    if (!isMissingMailboxesTable(error)) {
      logger.warn({ error }, "Mailboxes table is unavailable");
      return [];
    }
    try {
      await ensureMailboxesTable();
      return await db.select().from(mailboxesTable);
    } catch (ensureError) {
      logger.warn({ error: ensureError }, "Could not create mailboxes table");
      return [];
    }
  }
}

export async function getMailboxCatalog(
  env: NodeJS.ProcessEnv = process.env,
): Promise<MailboxCatalog> {
  return catalogMailboxes(await loadStoredMailboxes(), envMailboxSeeds(env));
}

function roleForAudience(audience: string): MailboxRole {
  if (audience === "branch") return "branch";
  if (audience === "system") return "system";
  if (audience === "contact") return "contact";
  return "customer";
}

export function mailboxSendConfig(
  audience: string,
  rows: StoredMailbox[],
): MailboxSendConfig | null {
  const role = roleForAudience(audience);
  const row = rows.find((item) => item.role === role);
  const contact = rows.find((item) => item.role === "contact");
  const pass = decryptSecret(row?.passwordEncrypted);
  const address = extractEmailAddress(row?.address);
  if (!row || row.enabled === false || !address || !pass) return null;
  const replyToAddress = extractEmailAddress(contact?.address);
  return {
    from: formatMailboxFrom(row.address, row.displayName),
    user: String(row.smtpUser || address).trim(),
    pass,
    host: String(row.smtpHost || "smtp.hostinger.com").trim() || "smtp.hostinger.com",
    port: row.smtpPort > 0 ? row.smtpPort : 465,
    secure: row.smtpSecure !== false,
    replyTo: replyToAddress
      ? formatMailboxFrom(contact?.address, contact?.displayName)
      : undefined,
  };
}

/** Prefer app mailbox `system` (mallorcasistema@…), then env Hostinger, then pedidos. */
export function resolvePasswordResetMailbox(
  rows: StoredMailbox[],
  env: NodeJS.ProcessEnv = process.env,
): MailboxSendConfig | null {
  return (
    mailboxSendConfig("system", rows) ||
    (() => {
      const resolved = resolveMailbox("system", env);
      if (!resolved) return null;
      return {
        from: resolved.from,
        user: resolved.user,
        pass: resolved.pass,
        host: String(env.SMTP_HOST || "smtp.hostinger.com").trim() || "smtp.hostinger.com",
        port: Number(env.SMTP_PORT || 465) || 465,
        secure: env.SMTP_SECURE == null
          ? true
          : !["0", "false", "no"].includes(String(env.SMTP_SECURE).toLowerCase()),
        replyTo: resolved.replyTo,
      };
    })() ||
    mailboxSendConfig("customer", rows)
  );
}

async function writeMailbox(role: MailboxRole, input: MailboxUpdateInput) {
  const [existing] = await db
    .select()
    .from(mailboxesTable)
    .where(eq(mailboxesTable.role, role));
  const passwordEncrypted = input.password
    ? encryptSecret(input.password)
    : existing?.passwordEncrypted ?? null;
  await db
    .insert(mailboxesTable)
    .values({
      role,
      address: input.address,
      displayName: input.displayName || null,
      smtpUser: input.smtpUser || input.address,
      passwordEncrypted,
      smtpHost: input.smtpHost,
      smtpPort: input.smtpPort,
      smtpSecure: input.smtpSecure,
      enabled: true,
    })
    .onConflictDoUpdate({
      target: mailboxesTable.role,
      set: {
        address: input.address,
        displayName: input.displayName || null,
        smtpUser: input.smtpUser || input.address,
        passwordEncrypted,
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort,
        smtpSecure: input.smtpSecure,
        enabled: true,
        updatedAt: new Date(),
      },
    });
}

export async function upsertMailbox(
  role: MailboxRole,
  input: MailboxUpdateInput,
): Promise<MailboxCatalog> {
  try {
    await writeMailbox(role, input);
  } catch (error) {
    if (!isMissingMailboxesTable(error)) throw error;
    await ensureMailboxesTable();
    await writeMailbox(role, input);
  }
  return getMailboxCatalog();
}
