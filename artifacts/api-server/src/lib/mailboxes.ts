import { eq } from "drizzle-orm";
import { db, mailboxesTable } from "@workspace/db";
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
    logger.warn({ error }, "Mailboxes table is unavailable");
    return [];
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

/** Prefer app mailbox `system` (ecomm@…), then env Hostinger, then pedidos. */
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

export async function upsertMailbox(
  role: MailboxRole,
  input: MailboxUpdateInput,
): Promise<MailboxCatalog> {
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
  return getMailboxCatalog();
}
